# github-watch

每天早上扫一遍 GitHub，把跟 magpie 渠道清单相关的最新项目捞出来，重点看四类系统：签到 / 积分（额度）/ 任务 / 请求头。

给的是"谁又做了一套签到/积分/请求头"，用来反推端点、请求头、积分规则，喂 magpie 插件。

## 跑

```powershell
node tools\github-watch\watch.mjs                 # 默认 --days 7
node tools\github-watch\watch.mjs --days 3        # 每日增量用这个，页面少、跑得快
node tools\github-watch\watch.mjs --quiet         # 只输出报告正文
```

产物：

- `reports/YYYY-MM-DD.md` + `reports/latest.md` — 人看的报告（首次发现 / 有更新 / 生态补充 / 渠道分布）
- `reports/latest.json` — 机读明细，含每条命中的 providers / themeHits / score
- `state.json` — 增量基线（`full_name -> lastPush`）。删除它 = 下次全量重来。**不入库**。

## 清单怎么改

`watchlist.json`：

- `providers[]` — 渠道名 + `aliases`（命中仓库名/描述/topics/owner 任意一处即归属该渠道）。`broad: true` 的渠道会把主别名凑成 6 个一组的 OR 批量查询（省配额）；热词（cursor / zed / grok / kimi …）标 `broad: false`，只靠主题扫描命中，避免被海量同名仓库淹没。
- `themes[]` — 主题扫描词。`query` 是查询词，`pages` 是抓几页（每页 100），`match` 是给候选打标签用的词表；把 `query` 删掉或设成 `null` 就只保留标签、不再查询。
- `eco[]` / `negative[]` — 生态加分词与排除词（`clash`/`v2ray`/`机场`/`学习通` 这类同名不同义的噪音）。

## 相关度

`tier 1`（主表）= 点名了清单里的渠道，且至少命中一个主题、或生态词 ≥2、或是 DSH/opencode/magpie 插件。
`tier 2`（生态补充）= 没点名渠道，但主题 + 生态同时吻合（这类多是 DSH 插件，照样贴出来）。
命中 `negative` 词直接丢。

## 配额

默认匿名调 GitHub 搜索 API：10 次/分钟、每分钟 60 次上限（搜索另有更严的突发限制），脚本按 7.5s 间隔自己控速，撞限流会按 `x-ratelimit-reset` 等。想快 4 倍就塞一个 token：

```powershell
$env:GH_TOKEN = "ghp_..."        # 或 node watch.mjs --token-file C:\path\token.txt
```

有 token 时控速降到 2.1s，单页 100 条不变但不再被匿名突发限制卡。

## 定时

由 DSH 的会话级定时器驱动（每天 09:00 Asia/Shanghai），提醒触发后由 agent 跑脚本 + 汇总。DSH 没开的时段错过的那次会在下次启动时补跑一次（只补最近一次）。
