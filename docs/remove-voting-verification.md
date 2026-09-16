# 移除投票：实施与验证记录

- 日期：2026-09-16
- Issue：[#1](https://github.com/0xHanniba1/jt_idea_notes/issues/1)
- 分支：`codex/remove-voting`
- 方案：[remove-voting-plan.md](./remove-voting-plan.md)
- 状态：实施及独立本地验证完成；2026-09-16 用户授权交付 main 并升级 4180。下文为合并前的验证记录，交付与升级结果见关联 PR。

## 实施结果

移除投票按钮、计数、名单、我的投票筛选、趋势和最受欢迎排序，以及对应 API、服务注册、数据模型、SQL 聚合和指标。默认首页使用 `recent`；退休 view 和未知 view 回退到 `recent`，忽略 `myvotes`，保留其他筛选。API 无 view 仍使用 `all`，继续包含已完成和已拒绝记录。

保留附件、评论、表情、状态、重复关联及关注通知。重复记录不再合票；新建不再自动投票，作者仍自动关注。详情独立页和弹层去掉投票侧栏，Fider 署名保留在内容下方。CSV、Feed 和默认文案完成清理；旧 Webhook 的完整记录事件使用整数常量 `post_votes = 0`。

实际验证发现原版详情弹层调用的关注状态 GET 路由缺失（返回 405），已补齐 `GET /api/v1/posts/:number/subscription`。它要求登录、验证记录所属空间和访问范围，并返回 `{subscribed: boolean}`；不受仅限制写操作的站点锁定中间件影响。中文“跟随 / 下列的”改为“关注 / 已关注”。

未增加数据库迁移，也未删除历史投票数据。历史表仍参与备份及用户/站点正常删除时的数据清理。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| `make build` | Go 二进制、SSR、翻译和生产前端构建通过；有既有 v8go 和前端体积/工具警告 |
| `go test ./... -race -short` | 全部通过，35 个包含测试的包；最终中文文案及测试资源清理调整后，受影响的 web、handlers、apiv1 再次通过 |
| 前端 Jest | 11 套、140 项通过；包含旧 URL、筛选、翻页和 API 默认范围回归 |
| 前端 ESLint | 无错误；未改动的 `public/services/fider.ts` 有 2 条既有非空断言警告 |
| Go lint，本次改动范围 | `golangci-lint run --new-from-rev HEAD`：0 issues |
| 格式和链接 | `git diff --check` 及新增文档本地链接检查通过 |

后端回归覆盖作者关注、历史高票与最新排序、API all 状态范围、退休参数、重复关联不合票、订阅读取权限和数据清理。Webhook 测试实际使用本地 HTTP 接收器，覆盖三个完整记录事件的预览、保存校验、测试发送和事件发送；新记录事件不增加票数字段。

原版 Engine 测试写死 8080 和 4000，本机 8080 已有其他服务。仅将测试改为独立动态回环端口，保留启动、请求、404 和停止断言，并关闭就绪请求响应、恢复配置和清理测试服务；未停止其他应用。

## 实际行为验证

测试使用全新本地管理员和普通用户，邮件仅送到独立 Mailpit，Webhook 仅送到回环接收端。

| 场景 | 结果 |
| --- | --- |
| 默认及退休排序 | 新记录排在历史有票记录之前；旧 URL 清理 `myvotes` 并保留有效参数，刷新和加载更多正常 |
| 退休接口 | 管理员、普通用户分别调用四个旧投票接口，8 次均为 404，历史票未变化 |
| 状态范围 | API 默认结果包含已完成记录；recent 保留原活动状态范围；路线图按原状态显示 |
| 图文记录 | 创建、附件关联和实际图片读取成功，作者自动关注，无新票；浏览器实际新建、编辑并刷新后内容持久存在 |
| 关注通知 | 手动关注/取消及详情弹层状态正确；普通用户开启评论提醒后收到站内通知和 Mailpit 邮件，取消后不再收到该记录的新评论提醒；作者收到其他用户评论的通知 |
| 评论与表情 | 评论持久保存，表情回应正常；保留原有按角色和个人设置决定的通知范围 |
| 重复记录 | 保留原记录关联；逐行比较标记前后的历史票一致 |
| CSV / Feed / 备份 | CSV 无票数列，Feed 无票数展示；ZIP 中存在 `post_votes.json` 且包含历史数据 |
| Webhook | 真实管理接口预览、保存、测试以及新评论触发均成功，本地接收 JSON 的 votes 值为 0；变量帮助不展示退休变量；验证后删除本次测试 Webhook |
| 私有空间 | 匿名读取记录和关注状态被登录保护拦截；验证后恢复测试站点的公开设置 |
| 页面与键盘 | 1440px 桌面及 390px 窄屏检查通过；首页详情弹层、独立详情、路线图及其详情均无投票区和空侧栏；无横向溢出；Enter 打开、返回后 Tab、关注切换正常，无投票请求或页面 JS 错误 |

## 既有问题与验证边界

- 裸 `tsc --noEmit --incremental false` 报 25 条第三方声明错误，涉及 Lingui、Playwright、Tiptap 和旧 Node 类型。用完全相同依赖对干净的原始 HEAD 执行，错误输出逐字一致。本次没有更改 TypeScript 配置、关闭类型检查或升级依赖；Webpack 生产构建通过。
- 全量 `make lint` 使用 go.mod 中的 golangci-lint 2.12.2 时，仍报告 5 条未改动代码问题：`app/pkg/bus/bus.go`、`app/pkg/dbx/mapping.go` 的旧反射常量，以及 `app/handlers/common.go` 的字符串写入建议。本次改动 lint 为 0；未顺带修改这些文件。
- 原 Cucumber 入口写死旧多租户域名、端口和 MailHog，未直接运行；本次用独立实例的 Playwright/API 检查覆盖受影响交互，原场景中的投票断言已改为无投票 UI 和作者关注断言。
- `-short` 沿用项目默认，未运行需要真实外部服务的非短测试。没有发送真实邮件或调用外部 Webhook。

## 本地环境与复核入口

- 开发页：`http://jt-idea-notes.localhost:4181/`；测试邮箱：`http://127.0.0.1:18026/`。
- 开发/测试库分别为 `jt_idea_dev` 和 `jt_idea_test`，位于本任务独立 Compose 项目 `jt-idea-notes-voting` 的 PostgreSQL，宿主端口 15566。MinIO 为 19000，SMTP 为 11026。
- 运行配置、命令包装器、脚本、日志和截图位于被 Git 忽略的 `tmp/voting-runtime/`。包装器选择本机已有 SDK 26.5，解决 SDK 27 与当前链接器不兼容；没有修改系统 SDK 或项目依赖。
- 原版 `fider-preview-*` 容器及 `http://fider.localhost:4180/` 保留，未使用其数据库、邮件、Cookie 或数据卷。
- 本地复核命令：`tmp/voting-runtime/test-env go test ./... -race -short`，`tmp/voting-runtime/tool-env make build`。数据库测试会重置独立测试库，不应用于开发库或原版试用库。
- 本地开发服务启动：`tmp/voting-runtime/dev-env ./fider`；依赖容器使用 `docker compose -f tmp/voting-runtime/compose.yml up -d`。开发实例保留验收用记录，不代表正式数据或生产部署。
