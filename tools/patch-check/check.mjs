#!/usr/bin/env node
/**
 * file: tools/patch-check/check.mjs
 * 用途: 检查本机 magpie 插件目录里，我们手工打的四个补丁是否还在。
 *
 * 为什么需要它：zcode / workbuddy / qoder / raccoon 四家的修复只活在本机
 * node_modules 里，上游每发一版 npm 包，magpie 的更新检查器就会把它们覆盖掉
 * （zcode 0.1.35 就是这么冲掉的补丁）。这个脚本在每次 GitHub 巡查后跑一遍，
 * 一旦发现哪条修复没了就红灯报出来，而不是等封号了才发现。
 *
 * 用法:
 *   node tools/patch-check/check.mjs
 *   MAGPIE_PLUGINS_DIR=D:\somewhere\node_modules node tools/patch-check/check.mjs
 *
 * 退出码: 0 = 四条补丁全在；1 = 至少一条缺失（并打印缺哪条、怎么修）。
 * 零依赖，Node >= 18。
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const ROOT =
  process.env.MAGPIE_PLUGINS_DIR ||
  join(homedir(), ".config", "magpie", "plugins", "node_modules")

// --provider=zcode（可多次）：只检查指定 provider —— autofix 复验按家圈定，
// 别家红不再拖垮本家的复验判定（0.1.38 当晚 zcode 就被 workbuddy 的红连坐回滚过）。
const ONLY = new Set(
  process.argv.slice(2).flatMap((a) => (a.startsWith("--provider=") ? [a.slice("--provider=".length)] : [])),
)

/** 每条规则: 文件名 + 一组「必须有 / 必须没有」的正则断言。 */
const CHECKS = [
  {
    provider: "zcode",
    pkg: "@magpie-community/opencode-zcode-auth",
    rules: [
      {
        name: "APP_VERSION 对齐真实客户端 3.16.2",
        ok: (t) => /const APP_VERSION = "3\.16\.2"/.test(t),
        fix: '把 const APP_VERSION 改回 "3.16.2"（本机注册表/官网/updater 全是 3.16.2）',
      },
      {
        name: "UA 带 ai-sdk/anthropic LLM 指纹尾巴（CPA 实锤，剥掉反而假）",
        ok: (t) => /out\.set\(\s*"User-Agent"\s*,\s*UA\s*\+\s*" ai-sdk\/anthropic\/3\.0\.81"\)/.test(t),
        fix: "chat fetch 的 UA 必须是 UA + \x27 ai-sdk/anthropic/3.0.81\x27（真实客户端 LLM 面指纹）",
      },
    ],
  },
  {
    provider: "workbuddy",
    pkg: "@magpie-community/opencode-workbuddy-auth",
    rules: [
      {
        // 上游 0.2.3 起 intl 与 CN 是同一构建（update feed 实锤 5.9.3.42398134），
        // 2026-10-30 用上游原值真打 www.workbuddy.ai 得 200 —— 旧的
        // 「intl 必须 5.8.4 / 不发 runtime」版本线已被上游接手并超越；
        // 本机 10-15 的 install-manifest（5.8.4）反而是过期证据，不再回退。
        name: "国际版 SITES 自带 app/cli/runtime（上游 0.2.3：intl=5.9.3 同构建，实测 200）",
        ok: (t) => {
          const i = t.indexOf('"workbuddy-ai"')
          const seg = i < 0 ? "" : t.slice(i, i + 700)
          return /app:\s*"\d+\.\d+\.\d+"/.test(seg) && /cli:\s*"/.test(seg) && /runtime:\s*"/.test(seg)
        },
        fix: "workbuddy-ai 的 SITES 必须自带 app/cli/runtime 三个字段（上游 0.2.3 起 intl=5.9.3 同构建）",
      },
    ],
  },
  {
    provider: "qoder",
    pkg: "@magpie-community/opencode-qoder-auth",
    rules: [
      {
        name: "COSY_VERSION = 1.1.81（真实 CLI 版本）",
        ok: (t) => /COSY_VERSION = "1\.1\.81"/.test(t),
        fix: 'const COSY_VERSION 改回 "1.1.81"',
      },
      {
        name: "发 Cosy-MachineCode（真实 CLI 有、旧插件缺）",
        ok: (t) => /Cosy-MachineCode/.test(t),
        fix: "在 identity 抽取与 chatHeaders 里补 Cosy-MachineCode",
      },
      {
        name: "Cosy-ClientType 用 5（CLI）而非 10（桌面端）",
        ok: (t) => /Cosy-ClientType["'\s,:]*["']?5["']?/.test(t) || /Cosy-ClientType[^\n]{0,40}"5"/.test(t),
        fix: 'Cosy-ClientType 设为 "5"',
      },
    ],
  },
  {
    provider: "raccoon",
    pkg: "@magpie-community/opencode-raccoon-auth",
    rules: [
      {
        name: "X-Client-Version 改为磁盘读，不再硬编码 v1.0.0",
        ok: (t) => /raccoonDesktopVersion/.test(t) && !/X-Client-Version["'\s,:]*\s*["']v1\.0\.0["']/.test(t),
        fix: "恢复 raccoonDesktopVersion()/raccoonDeviceId() 磁盘读逻辑，删掉硬编码 v1.0.0",
      },
    ],
  },
]

function readOne(pkg) {
  const dir = join(ROOT, pkg)
  const files = { "index.mjs": null, "package.json": null, dirExists: existsSync(dir) }
  for (const f of ["index.mjs", "package.json"]) {
    const p = join(dir, f)
    if (existsSync(p)) files[f] = readFileSync(p, "utf8")
  }
  return files
}

let failed = 0
const rows = []

for (const c of CHECKS) {
  if (ONLY.size && !ONLY.has(c.provider)) continue
  const files = readOne(c.pkg)
  if (!files.dirExists || files["index.mjs"] == null) {
    rows.push({ provider: c.provider, rule: "(插件目录/入口)", state: "SKIP", detail: `未安装: ${join(ROOT, c.pkg)}` })
    continue
  }
  const version = (() => {
    try {
      return JSON.parse(files["package.json"]).version
    } catch {
      return "?"
    }
  })()
  for (const r of c.rules) {
    let pass = false
    let err = ""
    try {
      pass = r.ok(files["index.mjs"])
    } catch (e) {
      err = String(e?.message ?? e)
    }
    if (!pass) failed++
    rows.push({
      provider: c.provider,
      ver: version,
      rule: r.name,
      state: err ? "ERR" : pass ? "PASS" : "FAIL",
      detail: pass ? "" : r.fix,
    })
  }
}


// ---- 我们仓库自己的不变量（对比 2026-10-30 巡查情报后固化，防回归） ------------
// 这一节检查本仓库 src/ 的源码，而不是本机 node_modules。
// 把「对比巡查结果后确认正确」的取值固化成断言：以后谁改错，这里立刻红灯。
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_SRC =
  process.env.VEYRA_REPO_SRC ||
  [
    join(HERE, "..", "..", "..", "magpie-veyra-plugins", "src"), // 本机布局：magpie-Veyra/tools/patch-check → 同级插件仓
    join(HERE, "..", "..", "src"),                                // 若将来 tools 落在插件仓内
  ].find((p) => existsSync(p)) ||
  join(HERE, "..", "..", "..", "magpie-veyra-plugins", "src")
const readSrc = (f) => {
  const p = join(REPO_SRC, f)
  return existsSync(p) ? readFileSync(p, "utf8") : null
}
const OURS = [
  {
    file: "header-guard.mjs",
    name: "10 家供应商 profile 齐全",
    ok: (s) =>
      ["workbuddy", "workbuddy-ai", "codebuddy", "codebuddy-intl", "lobsterai", "loomy", "zcode", "codearts", "qoder-cn", "qoder"]
        .every((k) => new RegExp('^\\s{2}"?' + k + '"?\\s*:\\s*\\{', "m").test(s)),
    fix: "PROFILES 缺供应商：每个 provider 必须有一套独立头指纹，不能共享",
  },
  {
    file: "header-guard.mjs",
    name: 'lobsterai capabilities 不写死 "full"',
    ok: (s) => !/"x-lobsterai-client-capabilities":\s*"full"/.test(s),
    fix: '曾写死 "full"，而插件真实值是能力列表串，enforce 会覆盖坏；应改为形态校验',
  },
  {
    file: "lobsterai.mjs",
    name: "CAPABILITIES 是能力列表串（非 full）",
    ok: (s) => /const CAPABILITIES = "[a-z0-9-]+(,[a-z0-9-]+)*"/.test(s),
    fix: "CAPABILITIES 必须是逗号分隔的能力 id；写 full 之类的假值服务端不认",
  },
  {
    file: "codebuddy.mjs",
    name: "enforceHeaders 已接 sign 后 fetch 前",
    ok: (s) =>
      /import \{ enforceHeaders \} from "\.\/header-guard\.mjs"/.test(s) &&
      /enforceHeaders\(site\.id, headers/.test(s),
    fix: "codebuddy 必须在 sign() 后、fetch 前调 enforceHeaders(site.id, headers, {model})",
  },
  {
    file: "codebuddy.mjs",
    name: "CPA PROTOCOL 头规格（2026-10-30 抓包）",
    ok: (s) =>
      /const UA_CN = "CodeBuddyIDE\/4\.9\.7 CodeBuddy\/4\.9\.7"/.test(s) &&
      /const UA_INTL = "CodeBuddy\/1\.100\.0"/.test(s) &&
      /ideType: "CodeBuddyIDE"/.test(s) &&
      /ideType: "IDE"/.test(s) &&
      /product: "SaaS"/.test(s) &&
      /product: "cloud"/.test(s) &&
      /productVersion: "1\.100\.0"/.test(s) &&
      /X-Product-Version", site\.productVersion/.test(s) &&
      /apiDomain: "www\.codebuddy\.cn"/.test(s),
    fix: "CN: UA 双段 4.9.7/ideType CodeBuddyIDE/product SaaS/X-Domain codebuddy.cn；INTL: CodeBuddy/1.100.0/IDE/cloud/+Product-Version；/v3/config 用 4.12.0 UA+X-CodeBuddy-Request: 1",
  },
  {
    file: "codearts.mjs",
    name: "codearts 只 audit 不 enforce（HMAC 头不可改）",
    ok: (s) =>
      /import \{ auditHeaders \}/.test(s) &&
      /auditHeaders\("codearts"/.test(s) &&
      !/\benforceHeaders\(/.test(s),
    fix: "CodeArts 的 Authorization 是 SDK-HMAC-SHA256 每请求现签，只能 auditHeaders 不能 enforceHeaders",
  },
  {
    file: "codebuddy.mjs",
    name: "codebuddy-intl 端点 = www.codebuddy.ai",
    ok: (s) => /id: "codebuddy-intl"[\s\S]{0,400}?endpoint: "https:\/\/www\.codebuddy\.ai"/.test(s),
    fix: "国际版端点必须是 www.codebuddy.ai，写错会打到国内站",
  },
]
for (const c of OURS) {
  if (ONLY.size && !ONLY.has("ours")) continue
  const s = readSrc(c.file)
  if (s == null) {
    rows.push({ provider: "ours", rule: c.file + ": " + c.name, state: "SKIP", detail: "缺少 " + join(REPO_SRC, c.file) })
    continue
  }
  let pass = false
  let err = ""
  try { pass = c.ok(s) } catch (e) { err = String(e?.message ?? e) }
  if (!pass) failed++
  rows.push({ provider: "ours", rule: c.file + ": " + c.name, state: err ? "ERR" : pass ? "PASS" : "FAIL", detail: pass ? "" : c.fix })
}
const pad = (s, n) => String(s).padEnd(n)
console.log(`\n插件补丁存活检查 — ${ROOT}\n`)
console.log(pad("provider", 11) + pad("ver", 9) + pad("state", 7) + "rule")
console.log("-".repeat(96))
for (const r of rows) {
  console.log(pad(r.provider, 11) + pad(r.ver ?? "-", 9) + pad(r.state, 7) + r.rule)
  if (r.detail) console.log(" ".repeat(27) + "→ " + r.detail)
}
console.log("-".repeat(96))
const pass = rows.filter((r) => r.state === "PASS").length
const fail = rows.filter((r) => r.state === "FAIL" || r.state === "ERR").length
const skip = rows.filter((r) => r.state === "SKIP").length
console.log(`合计: PASS ${pass} · FAIL ${fail} · SKIP ${skip}\n`)

if (fail > 0) {
  console.log("⚠️  有补丁已被上游覆盖（或未落）。按上面 → 的提示重打，然后重启 magpie。\n")
  process.exit(1)
}
process.exit(0)
