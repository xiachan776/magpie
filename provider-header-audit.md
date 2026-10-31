# 全供应商请求头检查报告

生成：2026-10-29 23:47 · 本机 magpie · 覆盖 9 个已装插件 / 18 个 provider

判定口径：把插件实际发出的头，与该供应商**真实官方客户端**的头对比。
「实测」= 走插件自身 loader 发真实网络请求抓到的线上包；「静态」= 只读源码（无本地账号，发不出去）。

---

## 总表

| # | provider | 上游 | 实测 | UA / 版本类头 | 判定 |
|---|---|---|---|---|---|
| 1 | workbuddy (CN) | copilot.tencent.com/v2 | **200 SSE** | `WorkBuddy/5.9.3 WorkBuddy/5.9.3 CLI/2.165.0` · X-IDE-Version 5.9.3 · X-Agent-Runtime local-agent | ✅ 已对齐 |
| 2 | workbuddy-ai (INTL) | www.workbuddy.ai/v2 | **200 SSE** | `WorkBuddy/5.8.4 workbuddy-ai/5.8.4 CLI/2.161.0` · X-IDE-Version 5.8.4 · 无 X-Agent-Runtime | ✅ 已修好 |
| 3 | qoder-cn | gateway.qoder.com.cn | **200 SSE** | Cosy-Version 1.1.81 · Cosy-ClientType 5 · Cosy-MachineCode ✓ | ✅ 已修好 |
| 4 | qoder (INTL) | gateway.qoder.com | 无 200（12 次 3 成） | 与 CN 共用 COSY_VERSION 1.1.81 | ⚠️ 国际版 CLI 版本待核对 |
| 5 | zcode | api.z.ai/api/anthropic | **200 SSE**（10-30 复测） | `ZCode/3.16.2`（ai-sdk 后缀已剥 · APP_VERSION 对齐 3.16.2） | ✅ 已修好 + 实测 |
| 6 | codebuddy (CN) | copilot.tencent.com/v2 | 无（106 次 29 败） | `CodeBuddyIDE/1.106.1` · X-IDE-Version 1.106.1 | ⚠️ 版本 1.106.1 待核对 |
| 7 | codebuddy-intl | www.codebuddy.ai/v2 | **403 code 11140**（账号级封禁） | `CodeBuddyIDE/1.106.1`（与 X-IDE-* 自洽；换 WorkBuddy UA 会造缝合怪，搁置） | ⚠️ 账号被封，UA 待真实客户端取证 |
| 8 | cline | api.cline.bot | 无账号 | `Cline/3.0.68` · X-CLIENT-TYPE cline-cli · X-CORE-VERSION 0.0.90 | ⚠️ 版本待核对（GitHub 实锤：desktop-v0.0.32、扩展 v4.1.25、@cline/cli SDK 线 0.0.13——均非 CLI 3.0.x 线，3.0.68 无更新证据，保留） |
| 9 | trae-cn | api.trae.cn | 无账号 | clientVersion 0.1.69 · pluginVersion 2.3.24254 · ideVersion 3.3.65 | ⚠️ 本机实锤：IDE 已是 **3.4.3**（tronBuildVersion 2.3.92182），插件常量落后一版；无账号不可实测，未盲改 |
| 10 | trae-global | api-sg/us.trae.ai | 无账号 | pluginVersion 2.3.62834 · ideVersion 3.5.51 | ⚠️ 版本待核对 |
| 11 | qwenwork | gateway.qwenwork.cn | 无账号 | 复用 qoder 头族 | — |
| 12 | qwenwork-enterprise | gateway.qwenwork.cn | 无账号 | 复用 qoder 头族 | — |
| 13 | raccoon | xiaohuanxiong.com | 无账号 | 版本/设备 ID 改为磁盘读（update-install-attempt.json / app-update.yml / desktop-device-identity.json），拿不到就省略头 | 🔧 已修（10-30） |
| 14 | opencode-zen-free | opencode.ai/inference/v1 | 10-23 五次 **200**；10-28/29 九次 **404**（legacy 路径）；10-30 实测 **429 FreeUsageLimitError** | 伪装 OpenCode 客户端（`opencode/latest/2.0.25/cli` + `Bearer public` + `x-opencode-client: cli`，设计如此） | ⚠️ 免费额度按 IP/设备共享池，非账号额度；模型仍在目录 |
| 15 | our-free-model | 本地 console | 无 200（4 次 4 败） | headers 透传（本地代理） | ⚠️ 本地 console 未起 |
| 16 | lobsterai | 有道龙虾 api | 无账号 | X-LobsterAI-Client-* | ✅ header-guard 已 enforce |
| 17 | loomy | 讯飞 loomy | 无账号 | token / Bearer 双套 | ✅ header-guard 已 enforce |
| 18 | codearts | 华为云 snap-access | 无账号 | SDK-HMAC-SHA256 每请求现签 | ✅ 只做 audit（签名不能覆盖） |
| — | api-chhlink-xyz-1244 | api.chhlink.xyz | 448 次 10 败 | **非插件**，用户自建渠道，头由 magpie 透传 | — 不归插件管 |

---

## 发现的问题（按严重度）

### ① zcode：UA 尾部带 `ai-sdk/anthropic/3.0.81` —— 已修 + 10-30 实测 200
- 实抓 19 个头里明确看到：`user-agent: ZCode/3.16.3 ai-sdk/anthropic/3.0.81`
- `ai-sdk/anthropic/3.0.81` 是**代理栈指纹**，真实 ZCode 客户端（Go/TS CLI）不会带这个后缀。等于自报「我是用 Vercel AI SDK 拼的第三方代理」。
- 位置：`@magpie-community/opencode-zcode-auth/index.mjs:1729`
- 已改为 `out.set("User-Agent", UA)`，备份 `index.mjs.bak-20261029-234709`。
- **10-30 追加**：`APP_VERSION` 从 `3.16.3` 对齐到 `3.16.2`（注册表 + 官网 + updater pending 三处实锤；备份 `index.mjs.bak-20261030-intl`）。复测：POST api.z.ai/api/anthropic/v1/messages → **HTTP 200**，SSE message_start 正常；UA `ZCode/3.16.2`、`x-zcode-app-version: 3.16.2`，ai-sdk 尾巴消失。
- 注：全量扫描确认**只有 zcode 这一处**把 ai-sdk 写进 UA；其余 `ai-sdk/` 命中都是模型表里的 npm 包名，不进请求头。

### ② codebuddy-intl —— 10-30 实测：账号被封（11140），UA 修复搁置
- 实测（veyra-buddy-intl 账号，uid 71c855b7）：POST www.codebuddy.ai/v2/chat/completions → **403 code 11140「request illegal / 账号存在异常行为，已被限制使用」**——与 workbuddy-ai 封号同一签名。
- 关键事实：usage.jsonl 里 codebuddy-intl **0 条请求**，该号从未经 magpie 用过也被封 → 11140 是**账号级封禁**（同一风控族），不是头触发。该号无法用来做 UA A/B。
- UA 决策：插件发 `CodeBuddyIDE/1.106.1` 与 X-IDE-Name/Type/Version 同一身份体系、自洽；换成 WorkBuddy 5.8.4 会造出「X-IDE=CodeBuddy + UA=WorkBuddy」的缝合怪（正是 qoder 修复消灭的形态）。真实国际版 IDE 的 UA 无抓包、官网是 SPA 拿不到安装包直链——**维持现状**，等真实客户端证据再改。
- 顺带发现：CN CodeBuddy 凭据（×5）的 domain 是 `www.codebuddy.cn`，插件 SITES 却打 `copilot.tencent.com`；`site.apiDomain` 优先会让 X-Domain 与 token 域不符——潜在问题，未动，待有可用账号再核。

### ③ raccoon：`X-Client-Version: v1.0.0` 占位值 —— 已修（10-30）
- `@magpie-community/opencode-raccoon-auth/index.mjs` 的 `desktopHeaders()` 改为磁盘读真实值：`%APPDATA%\office-raccoon\update-install-attempt.json`（version/appVersion/targetVersion，正则 `\d+\.\d+\.\d+`）→ fallback 扫 `%LOCALAPPDATA%\Programs\*raccoon*\resources\app-update.yml`；设备 ID 读 `desktop-device-identity.json` 的 `clientDeviceId`。拿不到就**省略该头**（dsh-raccoon-connect 口径：错的版本比缺头更扎眼）。备份 `.bak-20261030`，`node --check` 通过。
- 本机没装小浣熊桌面端 → 实际只发 `X-Client-Platform`，不再发假版本号。

---

## 已对齐、实测 200 的四家（可直接用）

- **workbuddy CN**：28 头，`WorkBuddy/5.9.3 WorkBuddy/5.9.3 CLI/2.165.0` + X-IDE-Version 5.9.3 + X-Agent-Runtime local-agent。
- **workbuddy-ai**：27 头，`WorkBuddy/5.8.4 workbuddy-ai/5.8.4 CLI/2.161.0` + X-IDE-Version 5.8.4 + 无 X-Agent-Runtime；响应 SSE 回 OK。
- **qoder-cn**：Cosy-Version 1.1.81 / Cosy-ClientType 5 / Cosy-MachineCode / 已删多余头，200。
- **zcode**（10-30 复测）：`ZCode/3.16.2`，19 头，200 SSE（glm-5.3-flash）。

## 设计上特殊、不要按「一致」去改

- **opencode-zen-free**：Zen 免费层**只认 OpenCode 客户端**（UA 不对直接 429 `FreeUsageLimitError`），所以它必须伪装成 OpenCode、带 `x-opencode-*`。要修的是「UA 是否当前 OpenCode 2.2.x」，不是「改成不像 OpenCode」。**2026-10-30 实测结论**：模型 `deepseek-v4.1-flash-free` 仍在 models.opencode.ai 目录里；三路（/inference/v1 两个模型 + /zen/v1）全部返回同一个 429 `FreeUsageLimitError`，说明免费额度是**按 IP/设备共享的池子、不是按账号**——用户本人没聊过天，但这台机器的出口 IP 已经把额度用掉了（10-23 本机五次 200 就在扣同一池）。重置是滚动窗口，不是 UTC 0 点（今天 08:00 后仍是 429）。
- **codearts**：`Authorization: SDK-HMAC-SHA256 …`，签名含 host/date/body，**每次现算，不能覆盖**，header-guard 对它只做 audit。
- **our-free-model**：本地 console 代理，头透传给本地服务，问题在 console 没起（4 次全败），不是指纹。
- **api-chhlink-xyz-1244**：用户自建渠道，不是插件，头是 magpie 直接透传，没法按供应商对齐。

## 全局扫描结论（防漏项）

- **x-magpie-* / x-dsh-***：只在**响应**侧出现（给页面读的 `X-Magpie-Sign-In`、codearts session），不会发到上游；header-guard 的 DROP_PATTERNS 在发出前还会再剥一遍。
- **UA 常量**：cline / trae / qoder / workbuddy / codebuddy 的 UA 形态都合理（`产品名/版本`），只有 zcode 带 ai-sdk 后缀（已修）、codebuddy-intl 用错 CN 值。

## 下一步（要我做的，点头就动）

1. 取证 codebuddy-intl 真实 UA（下国际版安装包解包），然后修 `codebuddy.mjs:144`。
2. 取证 raccoon 真实客户端版本，改 `X-Client-Version`。
3. 核对 codebuddy CN 1.106.1 / zcode 3.16.3 / cline 3.0.68 / trae 3.3.65 是否当前版本（有本机安装包就能读）。
4. zen-free：把 UA 提到当前 OpenCode 版本，解 5 连败。

---

## 参考实现对比（2026-10-30 GitHub 巡查：17 首次发现 + 30 有更新 里与请求头/插件直接相关的）

| 仓库 | 它做了什么 | 我们的对应 | 结论 |
| --- | --- | --- | --- |
| [yreidev/workbuddy2api-panel](https://github.com/yreidev/workbuddy2api-panel) | 请求头逐项对齐官方桌面端、国内/国际双域合池、HTTPDNS 主备切换 | workbuddy(5.9.3)/workbuddy-ai(5.8.4) 已分线，detectInstalledBuild 自适应 | 头已覆盖；HTTPDNS 主备未做（当前不需要） |
| [FastTLS/fastls](https://github.com/FastTLS/fastls) | Go 库：可配 JA3/JA4 TLS 指纹 + 请求头顺序 + 浏览器 profile | 我们只对齐头值与 UA，**没管 TLS 指纹与头顺序** | 未覆盖。Node fetch 改不了 TLS，要换 undici Agent 或自建 https，属下一层 |
| [FischelChern/sub2api-magpie-plugin](https://github.com/FischelChern/sub2api-magpie-plugin) | magpie provider 插件，Codex/Claude Agent 头兼容 + 多账号池 | 本仓同形态（codebuddy/lobsterai/loomy/codearts/zcode） | 结构一致，无新增可取 |
| [techysy/CreditDaddy](https://github.com/techysy/CreditDaddy) | Qoder/WorkBuddy/ZCode 每日积分自动签到 + 10Router 查额度 | growth-center 七段流水线 + usage/credits + 健康度检测 | 已覆盖 |
| [shuishuipingan/qoder2api-hub](https://github.com/shuishuipingan/qoder2api-hub) | COSY 签名 + 设备指纹 + OAuth 设备授权 | 已按真实 CLI 1.1.81 对齐 Cosy-*，Cosy-MachineCode 已补 | 已覆盖（我们是从本地 CLI bundle 取证，比它更权威） |
| [zhlcba/dsh-raccoon-connect](https://github.com/zhlcba/dsh-raccoon-connect) | 小浣熊接 DSH；版本/设备 id 从磁盘读，拿不到就省略头 | raccoon profile 修复正是按这个口径做的 | 已采纳 |
| [functy23/dsh-workbuddy-connect-functy](https://github.com/functy23/dsh-workbuddy-connect-functy)（已归档） | 简介明写「上游风控持续加强、UA/请求头格式频繁变动适配不下去」 | —— | **反面实证**：手工补丁必被冲掉，故已建 patch-check + 每日巡查 |

### 本轮对比后修掉的一处真缺陷

`src/header-guard.mjs` 的 `lobsterai` profile 原把 `x-lobsterai-client-capabilities` 写死 `"full"`，而插件真实值是 `kimi-k3-agentic-v1,thinking-level-control-v1`（`src/lobsterai.mjs` L44 `CAPABILITIES`）。一旦给 lobsterai 接上 `enforceHeaders`，就会把真实能力串覆盖成 `"full"`，直接废掉模型能力协商——典型「错的版本比没版本更糟」。

已修：从 `required` 移除写死值，改到 `requiredPattern` 只做形态校验（逗号分隔能力 id）；并把这条写进 `tools/patch-check/check.mjs` 的 ours 断言，以后再写死就红灯。

### 未接线的两处（诚实登记，不盲改）

- `src/lobsterai.mjs`、`src/loomy.mjs` 目前**有 profile、没调用** header-guard。loomy profile 要求的 `loomy-version: 0.9.36`、`invokeorigin: user` 插件当前都不发，但**两家都没有可用账号可实测**，按「错的比没有更糟」不盲接 enforce，等有账号再切。
- 已用 `check.mjs` ours 段锁住「profile 齐全 + 不写死危险值」，防的是回归，不是假装已接线。

### 工具链在本次对比中立刻兑现的价值

巡查跑完自动接补丁检查时当场发现：上游 zcode 已从 0.1.35 发到 **0.1.36**，magpie 更新检查器又把 `APP_VERSION 3.16.2` 与「UA 剥 ai-sdk 尾巴」两条补丁冲掉了（两条 FAIL）。`autofix.mjs` 就地重落并复验通过 → 复跑 `check.mjs` **PASS 15 / FAIL 0**。这就是这套工具存在的意义。

## CPA PROTOCOL 吸收（2026-10-31，mmqz/cpa-multi-plugins 抓包规格）

| 项 | 旧值 | 新值 | 依据 |
|---|---|---|---|
| codebuddy CN UA | `CodeBuddyIDE/1.106.1` | `CodeBuddyIDE/4.9.7 CodeBuddy/4.9.7` | CPA docs/PROTOCOL.md L58-63 |
| codebuddy CN X-IDE-Type / X-Product | CodeBuddy / CodeBuddy | **CodeBuddyIDE** / **SaaS** | 同上 |
| codebuddy CN X-Domain | copilot.tencent.com | **账号注册域优先**（a.domain → site.apiDomain），guard 改形态校验 `/^(www\.codebuddy\.cn\|copilot\.tencent\.com)$/` | 401 教训：域要与账号会话绑定一致 |
| codebuddy-intl UA/头 | 1.106.1 / CodeBuddy / CodeBuddy | `CodeBuddy/1.100.0` / IDE / **cloud** + `X-Product-Version: 1.100.0`（无 X-Requested-With） | CPA L83-88 |
| /v3/config UA | 同 chat | `CodeBuddyIDE/4.12.0 CodeBuddy/4.12.0` + `X-CodeBuddy-Request: 1` | CPA：config 端点 UA 敏感 |
| zcode UA 尾巴 | 剥掉（错误判定） | **回滚保留 ` ai-sdk/anthropic/3.0.81`**（LLM 面真实客户端指纹） | CPA L331-332 + 上游插件双证 |
| zcode trace | 缺 x-query-id | 补齐（五件套） | CPA |
| zcode-claim 槽位 | [9,13,20,21] | **[9,11,13,15,17,19,21]**（活动随机投放，10 分钟轮询口径） | TraeSign TraeCheckinApp.cs:130-186 |

**待办/风险**：①6004 模型级限流未实现（429+code 6004 应进 (uid,model) 冷却表，不是凭证级 5min——rate-guard 待改）；②Client Request Signing V4（Ed25519+PoW）未实现，遇 401 VERIFY_SIGNATURE_INVALID 即此因（参考 CPA plugins/zcode/src/proxy/crypto.ts）；③**8 个 veyra-buddy CN 账号 refresh 全死**（12153 invalid_grant: Session doesn't have required client，access 无 exp 非 JWT，chat 401 APISIX 边缘）——账号需重登才能验证新头形；④codebuddy-intl 账号封禁（11140）未解。
