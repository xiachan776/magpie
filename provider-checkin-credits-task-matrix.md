# 签到 / 积分 / 任务 —— 本仓能力 vs GitHub 生态（2026-10-30 核对）

巡查报告（`tools/github-watch/reports/2026-10-30.md`）里 13 个「签到·积分·任务」命中的仓库，逐个对照本仓实现。**结论：这三块是本仓最厚的地方，13 个仓库没有任何一个功能是我们缺的**；唯一真补的是「积分到期监控」的聚合字段（见文末第 4 节）。

## 1. 本仓落点（file:line 可查）

| 能力 | 落点 |
| --- | --- |
| 签到编排 | `src/scheduler.mjs:24-31` `DEFAULT_JOB_HOURS` = `workbuddy-checkin:[9]` / `tasks:[10]` / `zcode-claim:[9,13,20,21]` / `growth-center:[9,13,17,21]`；`JOB_LABELS` L34-39 |
| 逐家签到能力表 | `src/channels.mjs:42` `CHECKIN` 枚举；L63-138 逐家：codebuddy NATIVE、codebuddy-intl NONE、lobsterai NATIVE、codearts NATIVE、loomy NATIVE、workbuddy NATIVE、workbuddy-ai NONE、trae-cn/trae-global COMMUNITY（`/trae/api/v2/ug/checkin_credits/{status,claim}`） |
| 签到执行 | `src/actions.mjs:295` `fiveCheckin()`（五家 `auth.checkin` 钩子）、L368 `workbuddyCheckin()`、L671-674 分派（workbuddy/community/five）、L691 `recordCheckin()` 落账 |
| WorkBuddy 签到细节 | `src/workbuddy-checkin.mjs`（190 行，23 处签到语义） |
| ZCode 积分领取 | `src/zcode.mjs:2` 活动领取编排（`GET /billing/preview` → 逐 plan `POST /billing/claim`）；L80-81 两端点；L13-14 先补 `app_launch`/`app_daily_active` 活跃信号才不返回空；`src/zcode-activities.mjs`/`zcode-cooldown.mjs`/`zcode-captcha.mjs` 配套 |
| 任务领取 | `src/tasks.mjs`（577 行）：`runCodebuddyGrowth()`（accept + 进度打满才 claim）、`claimZcodeAccount()`、`doTasks()`；`src/actions.mjs` 的 `tasks` 作业接它 |
| WorkBuddy 成长中心 | `src/growth-center.mjs`（699 行，7 段流水线：签到兜底 / 旅行状态机 / 断登补签 / 连登兑换 / 盲盒 / 开 Buddy / 派出），4h 节奏对齐 88lin 的「礼物 1~4 小时回来一次」；`src/growth-assist.mjs`（516 行）辅助 |
| 积分模型 | `src/credits.mjs`：`EXPIRING_WINDOW_DAYS=15`(L31)、`parseCreditPackage`(L90，含 `deductionEndTime`)、`splitCreditsByExpiry`(L192)、`balanceTierOf`(L230，临期优先消耗)、`describeCreditSplit`(L245) |
| 积分记账 / 轮询 | `src/ledger.mjs` 账本、`src/balance-poller.mjs` 轮询、`src/balance.mjs` |
| 额度/用量面板 | `src/quota.mjs`（540 行，`quotas.json` + `veyra-live-balance.json` + `zcode-balance` 三源合并，L249-260 下发 `packages`/`split`/`expiredTotal`）；`src/snapshot.mjs` 刻意不含余额（L21-23），余额由面板 `credits:list` 走 quota 合并 |
| 多账号/排程/面板 | `src/veyra.mjs`（账号同步）、`src/scheduler.mjs`、`src/tool.mjs`、`src/actions.mjs` |

## 2. 逐仓库对照

| 仓库 | 它的能力 | 本仓 | 判定 |
| --- | --- | --- | --- |
| misakano7545/workbuddy2api-panel (670★) | 自动完成任务中心全部任务 + Web 面板（账号池/积分任务/热更新） | `growth-center` 七段 + `tasks.mjs` + 面板 | ✅ 已覆盖（且我们多了旅行/盲盒/派出） |
| NextAgentX/qoder-trae-workbuddy-switch (261★) | 签到、**积分到期监控**、国内/国际切号 | 签到✅ 切号✅（veyra 多账号）；到期**只算不提**（本轮补，见 §4） | 🟡 本轮补齐 |
| techysy/CreditDaddy (125★) | 签到·积分·额度·10Router 用量同步 | 签到✅ 积分✅ 额度✅；10Router 是它自建渠道，我们不接 | ✅ 覆盖 |
| RobbsLuo/Coding2API (29★) | 八家签到·额度·任务 | `channels.mjs` 十家 CHECKIN + `fiveCheckin` | ✅ 覆盖 |
| xu20060420fan-cell/workbuddy2api-panel (3★) | 签到·任务·checkin | 同上 | ✅ 覆盖 |
| Clannadgh/roster (0★) | 签到·积分统计·自动排程（Tauri 工作台） | `scheduler.mjs` 四作业 + 面板积分 | ✅ 覆盖 |
| ayuayue/magpie-codebuddy-import (0★) | 导 workbuddy-switch 账号 JSON、每日签到、派猫猫旅行 | `veyra.mjs` 导入 + `workbuddy-checkin` + `growth-center` 旅行段 | ✅ 覆盖 |
| yb1731/wb-dashboard (0★) | 纯脱敏积分快照可视化 | `quota.mjs` + 面板 | ✅ 覆盖 |
| JeffreyJYZ/cmdcode-tools (2★) | Command Code/Zed 的 plan·credits·5h/周窗口 | 无这两家渠道（无账号） | ⚪ 不适用 |
| KevinWang15/kiro (0★) | Kiro 积分/额度 | 无 Kiro 账号 | ⚪ 不适用 |
| insistgang/ai-quota-monitor (0★) | Kimi/Codex/Grok/MiniMax 本地额度盘 | `quota.mjs` 同类；这些家无账号 | ⚪ 不适用 |
| LeapYa/ima-qiandao, FairyXH/SignProxy (0★) | 签到转发脚本 | 已内建，无需外挂 | ⚪ 不适用 |
| imsinolam/WeRelay, imythu/looklook (2★/6★) | 手机/微信远端看任务 | 无手机端需求 | ⚪ 不适用 |

## 3. 两件「我们不做」且有明确理由

1. **ZCode 没有每日签到**：z.ai / bigmodel.cn 的 ZCode/GLM 积分只靠限时活动（gift plan），生态里也只有用量上报工具，没有签到脚本可抄。本仓用 `zcode.mjs` 的 `preview → claim` 覆盖活动领取，`zcode-claim` 每天 4 个槽（9/13/20/21）。
2. **任务领奖不走 API 域**：`/tasks/<code>/claim` 实测恒 400，所以 `growth-center.mjs:6-7` 明写「不含任务领奖」，任务统一走 `tasks.mjs` 的 web-claim 路径。

## 4. 本轮新增：积分到期雷达（`expirySummary`）

对照 NextAgentX 的「积分到期监控」，本仓原来只有逐包 `deductionEndTime` 与临期/永久分桶（`splitCreditsByExpiry`），面板要自己算「几天后到期」。新增纯函数：

- `src/credits.mjs` 末尾 `expirySummary(packages, now?, windowDays?)` →
  `{ expiringTotal, permanentTotal, expiringCount, nextEndAt, nextEndInDays, urgent, urgentItems[] }`
  - 口径与 `splitCreditsByExpiry` 一致：`active!==false` 且到期距今 ≤15 天才算临期；窗口外/无到期时间进永久池。
  - `urgent = 有临期 && 最近一次 ≤3 天`；`urgentItems[]` 按天数升序（含包名/剩余/到期时刻/剩余天数）。
- `src/quota.mjs` 在 live 分支下发 `expiry` 字段（`packages` 非空时），面板无需改契约即可显示「N 天后到期 X 分」。

**验证**：`node -e` 单测（1200 分 2 天后到期 + 500 永久 + 300 分 40 天后 + 已失效 + 空包）→ `expiringTotal=1200, permanentTotal=800, expiringCount=1, nextEndInDays=2, urgent=true`，断言 PASS；无到期包 → `expiringTotal=0, permanentTotal=10, urgent=false`；`credits.mjs`/`quota.mjs` `node --check` 均 0，`quota.mjs` 模块加载正常。
