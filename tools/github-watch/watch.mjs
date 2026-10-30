#!/usr/bin/env node
// GitHub 渠道巡查 — 每日扫一遍 GitHub，捞出与渠道清单相关的新项目/新更新，
// 主题聚焦：签到系统 / 积分系统 / 额度（用量）系统 / 请求头系统 / 任务系统。
// 零依赖，Node >= 20（用到全局 fetch）。未配 token 走匿名配额（搜索 10 次/分）。
// 用法：node watch.mjs [--days 7] [--pages 3] [--max-items 25] [--token-file <path>]
//                     [--no-ecosystem] [--quiet]
//
// 输出：reports/YYYY-MM-DD.md、reports/latest.md、reports/latest.json，并更新 state.json。

import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const CFG_PATH = path.join(HERE, 'watchlist.json');
const STATE_PATH = path.join(HERE, 'state.json');
const REPORT_DIR = path.join(HERE, 'reports');
const API = 'https://api.github.com/search/repositories';

/* ---------------- args ---------------- */

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return dflt;
  const tok = argv[i];
  if (tok.includes('=')) return tok.split('=').slice(1).join('=');
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};

const DAYS = Number(arg('days', 7));
const PAGE_CAP = Number(arg('pages', 3));
const MAX_ITEMS = Number(arg('max-items', 25));
const TOKEN_FILE = arg('token-file', null);
const WITH_ECO = arg('no-ecosystem', false) === true ? false : true;
const QUIET = arg('quiet', false) === true;
// 每日一次 + 当天补跑：默认开启（--no-daily 关掉，--force 强制重跑）。
// 现状：任务绑在 d7746aff 会话，那条 prompt 只写 --days 3，所以把 daily 做成默认行为，
// 不用改 prompt 就能拿到「一天只跑一次、当天没跑就补跑一次」。
const DAILY = arg('no-daily', false) === true ? false : true;
const FORCE = arg('force', false) === true;
const DAILY_STATE = path.join(HERE, 'daily-state.json');
const todayCN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
if (DAILY && !FORCE) {
  let last = '';
  try { last = JSON.parse(fs.readFileSync(DAILY_STATE, 'utf8')).lastRunDate || ''; } catch { /* 首次没有这个文件 */ }
  if (last === todayCN()) {
    console.log(`[daily] 今天（${last} · Asia/Shanghai）已经跑过了，跳过。要强制重跑：--force`);
    process.exit(0);
  }
  if (last) console.log(`[daily] 上次是 ${last}，今天 ${todayCN()} 还没跑 → 现在补跑一次。`);
}

/* ---------------- token / pacing ---------------- */

function readToken() {
  let t = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!t && TOKEN_FILE) {
    try { t = fs.readFileSync(String(TOKEN_FILE), 'utf8').trim(); } catch { /* ignore */ }
  }
  return t.trim();
}

const TOKEN = readToken();
const MIN_GAP_MS = TOKEN ? 2100 : 7500;
const MAX_PAGES = Math.max(1, Math.min(10, PAGE_CAP));

const HEADERS = {
  'User-Agent': 'magpie-github-watch/1.0',
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (TOKEN) HEADERS.Authorization = `Bearer ${TOKEN}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let apiCalls = 0;
let lastCall = 0;
const quota = { remaining: null, resetAt: null };

async function request(url, attempt = 1) {
  const gap = MIN_GAP_MS - (Date.now() - lastCall);
  if (gap > 0) await sleep(gap);
  lastCall = Date.now();
  apiCalls++;

  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45_000) });
  } catch (err) {
    if (attempt <= 3) { await sleep(4000 * attempt); return request(url, attempt + 1); }
    throw new Error(`网络错误 ${url}: ${err.message}`);
  }

  const rem = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if (rem != null) quota.remaining = Number(rem);
  if (reset != null) quota.resetAt = Number(reset);

  if (res.status === 403 || res.status === 429) {
    const body = await res.text();
    if (attempt > 3) throw new Error(`触发限流，已重试 3 次: ${body.slice(0, 200)}`);
    const retryAfter = Number(res.headers.get('retry-after') || 0) * 1000;
    const untilReset = quota.resetAt ? Math.max(0, quota.resetAt * 1000 - Date.now()) : 0;
    const wait = Math.min(120_000, Math.max(retryAfter, untilReset, 15_000));
    if (!QUIET) console.log(`  · 限流，等待 ${Math.round(wait / 1000)}s 后重试`);
    await sleep(wait);
    return request(url, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${url}\n${body.slice(0, 300)}`);
  }
  return res.json();
}

async function searchPage(q, page) {
  const url = `${API}?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100&page=${page}`;
  const json = await request(url);
  return { total: json.total_count || 0, items: json.items || [] };
}

/* ---------------- config ---------------- */

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const providers = cfg.providers || [];
const themes = cfg.themes || [];
const ecoWords = (cfg.eco || []).map((w) => w.toLowerCase());
const negWords = (cfg.negative || []).map((w) => w.toLowerCase());

const squash = (s) => s.toLowerCase().replace(/[\s\-_./·|]+/g, '');
const hasCJK = (s) => /[\u3400-\u9fff]/.test(s);

function aliasHits(text, alias) {
  const a = alias.toLowerCase().trim();
  if (!a) return false;
  if (hasCJK(a)) return text.includes(a);
  const clean = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![a-z0-9])${clean}(?![a-z0-9])`, 'i');
  if (re.test(text)) return true;
  // 多词别名再试一次去分隔符匹配（"work buddy" → "workbuddy"）
  if (/[\s\-_.]/.test(a) && squash(text).includes(squash(a))) return true;
  return false;
}

/* ---------------- query plan ---------------- */

const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);
const windowQ = `pushed:>${since}`;

const plan = [];

// 1) 渠道批量查询：broad=true 的渠道主别名，6 个一组（GitHub 单查询最多 5 个 OR）
const broadTerms = providers
  .filter((p) => p.broad !== false && p.aliases?.length)
  .map((p) => `"${p.aliases[0]}"`);
for (let i = 0; i < broadTerms.length; i += 6) {
  const group = broadTerms.slice(i, i + 6);
  plan.push({ kind: 'provider', q: `${group.join(' OR ')} ${windowQ}`, pages: Math.min(2, MAX_PAGES) });
}

// 2) 主题扫描：签到 / 积分 / 额度 / 请求头 / 白嫖 ...
for (const t of themes) {
  plan.push({ kind: 'theme', label: t.label, q: `${t.query} ${windowQ}`, pages: Math.min(t.pages || 1, MAX_PAGES) });
}

/* ---------------- collect ---------------- */

function normalize(item, source) {
  return {
    full_name: item.full_name,
    html_url: item.html_url,
    description: (item.description || '').replace(/\s+/g, ' ').trim(),
    pushed_at: item.pushed_at,
    created_at: item.created_at,
    stars: item.stargazers_count || 0,
    language: item.language || '',
    topics: Array.isArray(item.topics) ? item.topics : [],
    archived: !!item.archived,
    fork: !!item.fork,
    owner: item.owner?.login || '',
    sources: new Set([source.kind === 'theme' ? `主题:${source.label || source.q}` : '渠道扫描']),
  };
}

const pool = new Map();

if (!QUIET) console.log(`扫描窗口 pushed>${since}（${DAYS} 天），查询 ${plan.length} 组，配额模式：${TOKEN ? 'token' : '匿名'}`);

for (const [idx, step] of plan.entries()) {
  for (let page = 1; page <= step.pages; page++) {
    if (quota.remaining === 0) {
      const until = Math.max(5_000, quota.resetAt ? quota.resetAt * 1000 - Date.now() : 60_000);
      if (!QUIET) console.log(`  · 配额见底，等待 ${Math.ceil(until / 1000)}s`);
      await sleep(until);
    }
    let pageData;
    try {
      pageData = await searchPage(step.q, page);
    } catch (err) {
      console.error(`  ! 查询失败 page=${page} q=${step.q}\n    ${err.message}`);
      break;
    }
    if (!QUIET) {
      console.log(`  [${idx + 1}/${plan.length} p${page}] ${pageData.total} 命中 · ${step.q}`);
    }
    for (const it of pageData.items) {
      if (it.fork) continue;
      const key = it.full_name;
      if (pool.has(key)) {
        pool.get(key).sources.add(step.kind === 'theme' ? `主题:${step.label}` : '渠道扫描');
      } else {
        pool.set(key, normalize(it, step));
      }
    }
    if (pageData.items.length < 100) break; // 没有下一页了
    if (page * 100 >= pageData.total) break;
    if (!TOKEN && quota.remaining != null && quota.remaining <= 1) {
      const until = Math.max(5_000, quota.resetAt ? quota.resetAt * 1000 - Date.now() : 60_000);
      if (!QUIET) console.log(`  · 匿名配额将尽，等 ${Math.ceil(until / 1000)}s`);
      await sleep(until);
    }
  }
}

/* ---------------- attribute + score ---------------- */

const themeMatches = themes.map((t) => ({ label: t.label, match: (t.match || []).map((m) => m.toLowerCase()) }));

function annotate(item) {
  const text = `${item.full_name} ${item.description} ${item.topics.join(' ')} ${item.owner}`.toLowerCase();

  const provs = [];
  for (const p of providers) {
    for (const a of p.aliases || []) {
      if (aliasHits(text, a)) { provs.push(p.label); break; }
    }
  }
  item.providers = [...new Set(provs)];

  const themeHit = [];
  for (const t of themeMatches) {
    if (t.match.some((m) => text.includes(m))) themeHit.push(t.label);
  }
  item.themeHits = themeHit;

  item.ecoHits = ecoWords.filter((w) => text.includes(w)).length;
  item.pluginSignal = /\bdsh[-_]?\w*plugin|dsh-[a-z]|magpie|opencode[-_]plugin|deepseek harness/.test(text);
  item.negative = negWords.filter((w) => text.includes(w));

  const ageDays = (Date.now() - new Date(item.pushed_at).getTime()) / 86_400_000;
  const recency = ageDays < 1 ? 2 : ageDays < 3 ? 1.4 : ageDays < DAYS ? 0.6 : 0;
  item.score =
    Math.min(item.providers.length, 4) * 2.5 +
    themeHit.length * 3 +
    (item.pluginSignal ? 4 : 0) +
    item.ecoHits * 1.2 +
    Math.min(6, Math.log10(item.stars + 1) * 1.0) +
    recency;

  // 相关度分档：1 = 点名了清单渠道（主表）；2 = 没点名但主题+生态吻合（补充表）；0 = 丢
  item.tier = 0;
  const hasTheme = themeHit.length > 0;
  if (!item.negative.length) {
    if (item.providers.length > 0 && (hasTheme || item.ecoHits >= 2 || item.pluginSignal)) item.tier = 1;
    else if (item.providers.length === 0 && hasTheme && (item.pluginSignal || item.ecoHits >= 2)) item.tier = 2;
  }
  item.relevant = item.tier > 0;
  item.ageDays = ageDays;
  return item;
}

for (const item of pool.values()) annotate(item);

/* ---------------- state diff ---------------- */

let state = { version: 1, updatedAt: null, items: {} };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) }; } catch { /* 首次运行 */ }

const nowISO = new Date().toISOString();
const fresh = [];
const updated = [];
const unchanged = [];

for (const item of pool.values()) {
  if (item.tier !== 1) continue;
  item.isNewRepo = new Date(item.created_at) > new Date(since);
  const prev = state.items[item.full_name];
  if (!prev) { item.status = '首次发现'; fresh.push(item); }
  else if (new Date(item.pushed_at) > new Date(prev.lastPush)) {
    item.status = '有更新';
    item.prevPush = prev.lastPush;
    updated.push(item);
  } else { item.status = '无变化'; unchanged.push(item); }
  state.items[item.full_name] = { lastPush: item.pushed_at, lastSeen: nowISO, score: Number(item.score.toFixed(2)) };
}

const ecosystem = [...pool.values()].filter((i) => i.tier === 2);

fresh.sort((a, b) => b.score - a.score);
updated.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at) || b.score - a.score);
ecosystem.sort((a, b) => b.score - a.score || b.stars - a.stars);

state.updatedAt = nowISO;
state.day = nowISO.slice(0, 10);

/* ---------------- render ---------------- */

const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
const fmtDay = (iso) => (iso || '').slice(0, 10);
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function row(i, withChannel = true) {
  const ch = withChannel ? esc(i.providers.join('/') || '—') : '—';
  const th = esc(i.themeHits.join('·') || (i.pluginSignal ? '插件' : '—'));
  const mark = i.isNewRepo ? '〔本周新建〕' : '';
  const desc = mark + trunc(i.description || '(无简介)', 88);
  return `| [${esc(i.full_name)}](${i.html_url}) | ${ch} | ${th} | ${i.stars} | ${fmtDay(i.pushed_at)} | ${desc} |`;
}

const channelCount = new Map();
for (const i of [...fresh, ...updated]) for (const p of i.providers) channelCount.set(p, (channelCount.get(p) || 0) + 1);

const head = `| 仓库 | 渠道 | 命中系统 | 星 | 最近 push | 简介 |
| --- | --- | --- | --- | --- | --- |`;

const lines = [];
lines.push(`# GitHub 渠道巡查 · ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`);
lines.push('');
lines.push(
  `窗口 pushed>${since}（${DAYS} 天） · 查询 ${apiCalls} 次 · 候选 ${pool.size} · 相关 ${fresh.length + updated.length + unchanged.length} · ` +
    `**首次发现 ${fresh.length}** · **有更新 ${updated.length}** · 无变化 ${unchanged.length} · 配额剩余 ${quota.remaining ?? '?'}`,
);
lines.push('');

lines.push(`## 首次发现（${fresh.length}）`);
lines.push('');
if (fresh.length) {
  lines.push(head);
  for (const i of fresh.slice(0, MAX_ITEMS)) lines.push(row(i));
  if (fresh.length > MAX_ITEMS) lines.push(`\n> 其余 ${fresh.length - MAX_ITEMS} 个见 latest.json`);
} else lines.push('无。');
lines.push('');

lines.push(`## 有更新（${updated.length}）`);
lines.push('');
if (updated.length) {
  lines.push(head);
  for (const i of updated.slice(0, MAX_ITEMS)) lines.push(row(i));
  if (updated.length > MAX_ITEMS) lines.push(`\n> 其余 ${updated.length - MAX_ITEMS} 个见 latest.json`);
} else lines.push('无。');
lines.push('');

if (WITH_ECO && ecosystem.length) {
  lines.push(`## 生态补充（未点名渠道，主题吻合，${ecosystem.length}）`);
  lines.push('');
  lines.push(head);
  for (const i of ecosystem.slice(0, 8)) lines.push(row(i, false));
  lines.push('');
}

if (channelCount.size) {
  lines.push('## 渠道分布');
  lines.push('');
  lines.push(
    [...channelCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · '),
  );
  lines.push('');
}

const report = lines.join('\n');

/* ---------------- write ---------------- */

fs.mkdirSync(REPORT_DIR, { recursive: true });
const dated = path.join(REPORT_DIR, `${nowISO.slice(0, 10)}.md`);
fs.writeFileSync(dated, report, 'utf8');
fs.writeFileSync(path.join(REPORT_DIR, 'latest.md'), report, 'utf8');
fs.writeFileSync(
  path.join(REPORT_DIR, 'latest.json'),
  JSON.stringify(
    {
      generatedAt: nowISO,
      windowDays: DAYS,
      since,
      apiCalls,
      quotaRemaining: quota.remaining,
      counted: { candidates: pool.size, fresh: fresh.length, updated: updated.length, unchanged: unchanged.length, ecosystem: ecosystem.length },
      fresh, updated, ecosystem,
    },
    (k, v) => (v instanceof Set ? [...v] : v),
    2,
  ),
  'utf8',
);
fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1), 'utf8');

/* ---------------- console digest ---------------- */

if (QUIET) {
  console.log(report);
} else {
  console.log('');
  console.log(`首次发现 ${fresh.length} · 有更新 ${updated.length} · 无变化 ${unchanged.length} · 候选 ${pool.size} · 查询 ${apiCalls} 次`);
  if (fresh.length) {
    console.log('\n--- 首次发现 ---');
    for (const i of fresh.slice(0, 15)) {
      console.log(
        `[${i.providers.join('/') || '生态'}] ${i.full_name} · ${fmtDay(i.pushed_at)} · ${i.stars}星 · ${i.themeHits.join('·') || '—'}\n    ${trunc(i.description || '(无简介)', 110)}`,
      );
    }
  }
  if (updated.length) {
    console.log('\n--- 有更新 ---');
    for (const i of updated.slice(0, 10)) {
      console.log(`[${i.providers.join('/') || '生态'}] ${i.full_name} · ${fmtDay(i.pushed_at)} · ${i.themeHits.join('·') || '—'}`);
    }
  }
  if (WITH_ECO && ecosystem.length) {
    console.log('\n--- 生态补充（未点名渠道） ---');
    for (const i of ecosystem.slice(0, 6)) {
      console.log(`[${i.themeHits.join('·') || '插件'}] ${i.full_name} · ${i.stars}星 · ${trunc(i.description || '(无简介)', 90)}`);
    }
  }
  console.log(`\n报告: ${dated}`);
  console.log(`状态: ${STATE_PATH}`);
}

/* ---------------- daily 收尾：补丁存活检查 + 自动重落 ---------------- */

if (DAILY) {
  const { spawnSync } = await import('node:child_process');
  const runTool = (file) => {
    const r = spawnSync(process.execPath, [path.join(HERE, '..', 'patch-check', file)], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
  };
  let post = '\n---\n\n## 补丁存活（自动检查 + 自动重落）\n\n';
  const fix = runTool('autofix.mjs');
  post += '```\n' + (fix.out || '(无输出)') + '\n```\n';
  const chk = runTool('check.mjs');
  post += '\n```\n' + (chk.out || '(无输出)') + '\n```\n';
  for (const target of [dated, path.join(REPORT_DIR, 'latest.md')]) {
    try { fs.appendFileSync(target, post, 'utf8'); } catch { /* 报告不存在就算了 */ }
  }
  console.log(post);
  const patchOk = chk.status === 0 && fix.status !== 2;
  try {
    fs.writeFileSync(
      DAILY_STATE,
      JSON.stringify({ lastRunDate: todayCN(), at: new Date().toISOString(), patchOk }, null, 1),
      'utf8',
    );
  } catch (e) {
    console.error(`[daily] 写 daily-state.json 失败：${e?.message ?? e}`);
  }
  if (!patchOk) {
    console.error('\n⚠️ 补丁存活未全绿（见上方 autofix / check 输出），需要人工处理。');
    process.exitCode = 2;
  }
}