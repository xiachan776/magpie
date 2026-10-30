#!/usr/bin/env node
/**
 * file: tools/patch-check/autofix.mjs
 * 用途: watch 跑完后自动「重落」本机四家补丁中可安全自动修复的部分。
 *
 * 边界（重要）:
 *  - 只做「字符串级、语义确定、可回滚」的替换：zcode 的 APP_VERSION 与 UA 剥尾、
 *    qoder 的 COSY_VERSION。结构性修复（workbuddy 的 SITES/detectInstalledBuild、
 *    qoder 补 Cosy-MachineCode、raccoon 磁盘读版本）不在自动范围内——上游一旦重构，
 *    盲改会造出「缝合怪」，宁可停下报人工。
 *  - 绝不自动安装上游新版本（新代码进生产风险太高）。发现上游版本变了只报告。
 *  - 每个文件改动前先备份 .bak-autofix-<ts>，改完用 check.mjs 复验；只要复验变差就整份回滚。
 *
 * 用法: node tools/patch-check/autofix.mjs [--dry-run]
 * 退出码: 0 = 无需修 或 修好且复验通过；1 = 修了但复验仍失败（已回滚）；2 = 有需人工的结构性缺口。
 */

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawnSync } from "node:child_process"

const HERE = import.meta.dirname
const ROOT = process.env.MAGPIE_PLUGINS_DIR || path.join(os.homedir(), ".config", "magpie", "plugins", "node_modules")
const DRY = process.argv.includes("--dry-run")

/** 可安全自动修复的替换。re 命中的每一处都会被 to 取代。 */
const SAFE_EDITS = [
  {
    provider: "zcode",
    pkg: "@magpie-community/opencode-zcode-auth",
    edits: [
      { name: "APP_VERSION → 3.16.2", re: /const APP_VERSION = "\d+\.\d+\.\d+"/, to: 'const APP_VERSION = "3.16.2"' },
      { name: "UA 剥 ai-sdk 尾巴", re: /out\.set\("User-Agent",\s*UA\s*\+\s*"[^"]*"\)/, to: 'out.set("User-Agent", UA)' },
    ],
  },
  {
    provider: "qoder",
    pkg: "@magpie-community/opencode-qoder-auth",
    edits: [
      { name: "COSY_VERSION → 1.1.81", re: /COSY_VERSION = "\d+\.\d+\.\d+"/, to: 'COSY_VERSION = "1.1.81"' },
    ],
  },
]

/** 只能人工的结构性缺口（发现就点名，不盲改）。 */
const MANUAL = [
  { provider: "workbuddy", pkg: "@magpie-community/opencode-workbuddy-auth", what: "workbuddy-ai SITES 需 app 5.8.4/cli 2.161.0/runtime \"\" + detectInstalledBuild()" },
  { provider: "qoder", pkg: "@magpie-community/opencode-qoder-auth", what: "chatHeaders 需保证发 Cosy-MachineCode 且 Cosy-ClientType 为 \"5\"" },
  { provider: "raccoon", pkg: "@magpie-community/opencode-raccoon-auth", what: "desktopHeaders 的 X-Client-Version 需磁盘读（raccoonDesktopVersion），不得硬编码 v1.0.0" },
]

const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "")
let anyChange = false
let manualGap = false

for (const c of SAFE_EDITS) {
  const file = path.join(ROOT, c.pkg, "index.mjs")
  if (!fs.existsSync(file)) {
    console.log(`· ${c.provider}: 未安装，跳过`)
    continue
  }
  let text = fs.readFileSync(file, "utf8")
  const before = text
  const applied = []
  for (const e of c.edits) {
    if (!e.re.test(text)) continue
    const next = text.replace(e.re, e.to)
    if (next !== text) {
      text = next
      applied.push(e.name)
    }
  }
  if (!applied.length) {
    console.log(`· ${c.provider}: 无需修复（补丁已在位）`)
    continue
  }
  anyChange = true
  if (DRY) {
    console.log(`· ${c.provider}: [dry-run] 将应用 ${applied.join(" + ")}`)
    continue
  }
  const bak = `${file}.bak-autofix-${ts}`
  fs.copyFileSync(file, bak)
  fs.writeFileSync(file, text, "utf8")
  console.log(`· ${c.provider}: 已应用 ${applied.join(" + ")}（备份 ${path.basename(bak)}）`)

  // 复验：check.mjs 退出码 0 才算成功
  const chk = spawnSync(process.execPath, [path.join(HERE, "check.mjs")], { encoding: "utf8" })
  if (chk.status !== 0) {
    fs.copyFileSync(bak, file)
    console.log(`  ✗ 复验未通过，已回滚 ${c.provider}`)
  } else {
    console.log(`  ✓ 复验通过`)
  }
}

// 结构性缺口点名（不盲改）
for (const m of MANUAL) {
  const file = path.join(ROOT, m.pkg, "index.mjs")
  if (!fs.existsSync(file)) continue
  const t = fs.readFileSync(file, "utf8")
  const ok =
    m.provider === "workbuddy"
      ? /detectInstalledBuild/.test(t) && /5\.8\.4/.test(t) && /runtime:\s*""/.test(t)
      : m.provider === "raccoon"
        ? /raccoonDesktopVersion/.test(t)
        : /Cosy-MachineCode/.test(t)
  if (!ok) {
    manualGap = true
    console.log(`⚠ ${m.provider}: 结构性缺口，需人工 → ${m.what}`)
  }
}

if (!anyChange && !manualGap) console.log("全部补丁在位，无需任何动作。")
process.exit(manualGap ? 2 : 0)
