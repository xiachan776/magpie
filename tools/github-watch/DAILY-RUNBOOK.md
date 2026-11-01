# GitHub 渠道巡查 · 每日运行手册

两班定时任务共用本手册:09:00 主班(`schedule-05aa2716`)与 21:00 兜底班(`schedule-e5d3d1ae`,先判当天是否已跑)。流程改版只改本文件,不改定时任务。

## 0. 扫描

```
node tools\github-watch\watch.mjs --days 3
```

- 脚本尾部自动接补丁存活检查(`tools/patch-check/check.mjs`)与 autofix;FAIL 即当日报警,按 §4 处理。
- 403/限流:等 60 秒重跑一次;仍失败贴 stderr 原文,不编造结果。
- **已知仓库重复出现是常态**,不算噪音:重点只有两类——「首次发现」「有更新」;「无变化」直接跳过。

## 1. 读报告

`tools/github-watch/reports/latest.md`(要明细再看 `latest.json`)。

## 2. 拉差异、取证(核心步骤,不许跳过)

**四轴吸收判定**:①签到 ②积分 ③任务(仅幂等领取类) ④伪造请求与反检测(请求头对齐、客户端指纹、签名算法、设备指纹、限流规避、行为间隔拟人)。

- 「有更新」且 `_ref/` 已有的仓:`git fetch` + `git log`/`diff`,**只看这次增量**(新端点/新头/新任务类型/签名变化/风控应对),不重读全仓。
- 「首次发现」中星数最高或四轴命中的仓:克隆到 `_ref/survey-YYYYMMDD/<owner>__<repo>/`,读源码提取实现。
- 对照底账:`tools/patch-check/check.mjs` 现有规则与 `provider-header-audit.md` 的结论表 =「我们已经知道什么」;报告里写清楚新仓带来了什么底账没有的。

## 3. 融合进插件

- 落点:本机插件仓 `D:\AI-OS\02_Projects\插件\magpie-veyra-plugins`(优先)或本仓 `src/`;**每项吸收必须给 `check.mjs` 加断言规则**,否则下次上游发版冲掉补丁时无人知晓。
- 实测闸:能用本地账号实测的必须实测;不能实测的标「未实测,未生效/不盲改」——错的比没有更糟。
- **红线(既定原则,不许自动突破)**:只做幂等领奖;不伪造活跃/遥测上报跑成长任务。「让请求像官方客户端」的头/指纹/签名照常吸收。
- 收尾闸:`node tools\patch-check\check.mjs` 全绿才收工;改动 commit + push origin 当前分支(自动,发版 `autopush --publish` 留人工);magpie 重启让改动生效(Stop-Process → Start-Process `D:\AI-OS\08_Important\magpie-windows-amd64.exe`,判据 = 端口 3425 重新 Listen),报告实际耗时。

## 4. 补丁报警处理

check FAIL → 先跑 `node tools\patch-check\autofix.mjs`(只做字符串级安全替换,本家全绿才落盘);它回滚的,按 `provider-header-audit.md` 最近一节的记录人工重打;备份规约 `*.bak-*`,不动上游插件仓。

## 5. 完整报告(当日 reports 文件追加「吸收」节,并汇总给用户)

- 首行:`首次发现 N · 有更新 M(含窗口日期)|本轮吸收 X 项 · 未采纳 Y 项`
- **吸收表**:仓库 | 四轴命中 | 来源依据(文件/行) | 落点(文件) | 验证方式
- **未采纳表**:仓库/技术 | 为什么没采纳(证据冲突 > 工程量 > 账号缺失,排序陈述)——这项必填,空着视为没做对照
- **有更新差异摘要**:一句一仓,只写增量
- 尾行:报告路径 | patch-check PASS/FAIL | push commit id
- 0 新增且 0 更新 → 一句「今天没有新东西」;0 吸收 → 直说「无可吸收项」。不凑数。
