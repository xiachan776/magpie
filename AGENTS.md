# Notes for coding agents

## 强制规定：我们做的是插件，不是启动器（HARD RULE，优先于本文件其余全部内容）

**这个检出是 magpie 的源码副本，不是交付物。交付物只有插件。**

`exe` 是启动器，属于用户机器上的成品，**不属于本仓库的修改范围**。绝对禁止，无例外，不接受"临时验证"、"就改一行"、"先在本机跑通"、"只是换个图标"这类理由：

- 修改、编译、重新打包、替换、覆盖任何 `magpie*.exe`（`magpie.exe`、`magpie-patched.exe`、`magpie-windows-amd64.new.exe` 等）；
- 补丁宿主二进制：hex patch、asar 解包重打、资源/图标替换、签名伪造、DLL 侧挂；
- 往 magpie 的安装目录写文件、改注册表、改快捷方式或文件关联来完成"功能"；
- 把补丁版 exe 当交付物。用户要的是插件，补丁版是错误答案，不是折中方案。

**功能写在哪里：**

- 首选本机插件仓 `D:\AI-OS\02_Projects\插件\magpie-veyra-plugins`（provider / auth / usage / checkin / tool / page 都在这里）；
- `plugins/` 下的内置插件仅当用户当次明确要求时才动。

**宿主缺能力时**（例如插件页被 `connect-src 'none'` 钉死、缺一条读法）：说明缺口，给出插件侧能实现的绕法，必要时向上游提 PR —— 不改本机 exe。

**判据：一次交付里出现任何 `.exe` 产物，就是做错了。** 根目录曾躺着 `magpie-patched.exe` 和 `magpie-windows-amd64.new.exe` 两个补丁版；2026-10-28 复核时两者已不在盘上，`*.exe` 也已进 `.gitignore`，同类产物再出现即视为违规。

**和 `docs/code-standards.md` 的冲突怎么解：** 那份文档第 55–59 行要求交付前跑 `gofmt -l`、`go vet ./...`、`GOOS=linux go vet -tags nogui ./...`、`GOOS=windows go vet ./...`、`go build`、`GOOS=linux go build -tags nogui`、`GOOS=windows go build`、`go test -tags nogui ./...`。那是 magpie 自己向上游提 PR 时的规矩，**不是本项目的规矩**。

要分清哪几条会落产物：`gofmt -l`、`go vet`、`go test` 只读不产二进制；**`go build` 与 `GOOS=windows go build` 会在仓库根落一个 `magpie.exe`**，正好违反上面第 9 行。所以本项目的口径是：

- 只读检查（`gofmt -l`、`go vet`、`go test`）照跑无妨；
- **产出二进制的构建一律不跑**（含 `go build`、`GOOS=* go build`、`go build -o`、`go install`）；
- 需要读宿主行为就读源码；真要给上游提改动，那是用户单独决定的事，不在本文件授权范围内。

## 强制规定二：浏览器标签页用完即关（HARD RULE，与上一条同级）

**通过本项目的工作打开的 Tabbit 浏览器标签页，用完立刻关掉。**

- 无论用途：查资料、看面板、截图验证、调试页面、跑 Playwright，一律如此；
- **"用完"的判据：** 该标签承载的信息已经被取走（读到内容、量到数据、拿到截图、断到行为），就关。不要留着"待会可能还要看"；
- **"关掉"指** 关闭该标签页本身（`browser_close` / 等价操作关闭该 tab），不是最小化、不是留着下次接着用；本轮任务结束时，不留任何本项目开出来的活标签页；
- **例外只有两种：** ① 用户当次明确要求「别关」「留几个 tab 给我看」；② 标签页是用户自己先开着、由我 attach 的 —— 那种交还控制权即可，不擅自关闭。

**理由：** 本机浏览器标签是稀缺资源 —— 一次任务挂几十个 tab 会吃掉内存，也会把"我刚才在看什么"搅浑。取完即关是默认姿态，留标签需要理由。

## Subsystem design and review

Before changing a documented subsystem, read its
[design reference](docs/subsystems/README.md) and verify the linked source.
When preparing or reviewing a PR, follow the same page's documentation update,
semantic change description, and review rules.

## Code standards

Write and review changes against the [code standards](docs/code-standards.md).

## Community PRs

Before reviewing a community PR, read [contributors](docs/contributors.md):
what stops a review for possible harm, what is closed unreviewed, and the
authors whose PRs are closed on sight.

## Lessons

Before changing code, read [LESSONS.md](LESSONS.md): what recent merged
work got wrong and the rule that would have caught it.

## Built-in subscriptions that a plugin serves

These built-in subscriptions are retired. Reaching them can break their
vendors' terms, so they moved out of magpie into community OpenCode plugins,
which keeps magpie itself from being banned. Each one has a plugin that does
the same job:

| Subscription | id | Plugin (npm) | Mover |
| --- | --- | --- | --- |
| Command Code | `commandcode-plan` | `@magpie-community/opencode-commandcode-auth` | `internal/provider/migrate_side.go` |
| Cursor | `cursor` | `@magpie-community/opencode-cursor-auth` | `internal/provider/migrate_side.go` |
| Devin | `devin` | `@magpie-community/opencode-devin-auth` | `internal/provider/migrate_side.go` |
| Factory | `factory` | `@magpie-community/opencode-factory-auth` | `internal/provider/migrate_factory.go` |
| Grok | `grok` | `@magpie-community/opencode-grok-auth` | `internal/provider/migrate_side.go` |
| Kiro | `kiro` | `@magpie-community/opencode-kiro-auth` | `internal/provider/migrate_kiro.go` |
| Xiaomi MiMo | `mimo-app` | `@magpie-community/opencode-mimo-auth` | `internal/provider/migrate_mimo.go` |
| Qoder, Qoder CN | `qoder`, `qoder-cn` | `@magpie-community/opencode-qoder-auth` | `internal/provider/migrate_qoder.go` |
| WorkBuddy, WorkBuddy AI | `workbuddy`, `workbuddy-ai` | `@magpie-community/opencode-workbuddy-auth` | `internal/provider/migrate_workbuddy.go` |
| ZCode | `zcode` | `@magpie-community/opencode-zcode-auth` | `internal/provider/migrate_zcode.go` |
| Zed | `zed` | `@magpie-community/opencode-zed-auth` | `internal/provider/migrate_zed.go` |

The `movers` map in `internal/provider/migrate*.go` is the source of truth.
`TestMovedBuiltinsSayTheirPlugin` fails when a mover has no notice in its
code.

### Which code actually runs

Two cases decide it:

- **Moved:** the user moved the subscription onto its plugin, from the
  editor's "Move to plugin" (or `provider.Adopt`). Its `migrations.json`
  state is `plugin` (`provider.Moved(id)`). A new user never sees a
  deprecated built-in: the Add sheet leaves one with no account out
  (`unusedSub` in app.js), so it is installed from the Plugins page. A user
  who installs the plugin themselves is moved too
  (`provider.HandOver`): at once when the built-in has no accounts, from the
  gateway's hourly loop (`KeepRetiringMoved`) when it has, unless the
  plugin is signed in under its own `-plugin` id already. Until
  then the Add sheet shows the plugin's tile only (`replacedSub` in app.js).
  Since 10-16 the built-ins are being retired: the hourly loop's
  `MoveRetiring` moves every subscription with a mover that still has
  built-in accounts, a user who moved back included, and there is no way
  back. Turning the plugin off turns the subscription off with it; removing
  it records `removed` (accounts kept with the plugin's sign-ins), and
  installing it again gives the subscription back.
- **Not moved:** the user still has accounts from the built-in: the move
  hasn't run yet, or it failed (tried again after six hours). Nothing
  serves them until it runs.
- **Retired:** the built-in's code is gone (`retiredBuiltins` in
  `internal/provider/migrate.go`; `provider.BuiltinRetired(id)`). The
  plugin serves it, moved or not. Accounts not moved yet are served by
  nothing; a line over the Providers list says so, with why and a Move
  (`providers.unmoved`, `unmovedLine` in app.js). With no row of its own,
  the Add sheet leaves it to the Plugins page (`unusedSub`). Every
  subscription in the table above is retired (10-17); gates ask
  `provider.PluginServes(id)` (moved or retired).

The plugin does everything: sign-in, refresh, models, requests, usage and
errors. It runs in the plugin host (`internal/plugin`). The built-ins'
sign-in, models, usage and gateway translators are gone. What is left of
them in `internal/provider` (and `internal/qoder/endpoints.go`) reads the
built-in's saved accounts so the mover can carry them over. The gateway
sends every request to the plugin's fetch.

So a bug report about one of these subscriptions is usually about the
plugin:

1. Check whether the user's subscription is moved. A moved provider's row in
   `/api/providers` has `move.state == "plugin"`; the provider id is in
   `onPlugins`.
2. Fix the plugin in the community repo,
   [magpie-community/plugins](https://github.com/magpie-community/plugins)
   (`packages/<name>`, provider id = the built-in's id; checked out locally
   at `~/workspace/projects/magpie-commuity-plugins`). Publish a new version.
3. Raise the mover's `min` to that version. `keepMovedCurrent` then updates
   every moved user's plugin.

This magpie-side code still runs for moved subscriptions:

- the plugin host: `internal/plugin`, `host.js`;
- `internal/provider/plugins.go`, `plugin_usage.go` (`movedCards`) and
  `pluginsignin.go`;
- the move itself: `internal/provider/migrate*.go`;
- the GUI's plugin paths in `internal/gui/assets/app.js`: `subOf`,
  `pluginSubs` and `startPluginSignIn`.

The parity tests, `internal/gateway/plugin_*_test.go`, hold each plugin to
what its built-in did.
