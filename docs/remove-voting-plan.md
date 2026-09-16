# 移除投票功能实现方案

- 关联 Issue：[#1 移除投票功能，默认按最新提交排序并保留关注通知](https://github.com/0xHanniba1/jt_idea_notes/issues/1)
- 日期：2026-09-16
- 源码基线：`f164f69172002aba6296980c27160a196191dbd6`
- 工作分支：`codex/remove-voting`
- 状态：已按本方案实现并完成隔离验证；尚未提交、推送、合并或部署到原版试用环境。验证见 [实施验证记录](./remove-voting-verification.md)。

## 1. 目标与已确认边界

JT Idea Notes 用于方便记录想法、需求、Bug 和优化建议。本次移除投票及其排名，让用户直接记录和查看进展。

已确认：

1. 首页默认按最新提交在前排序，不按票数或热度排序。
2. 保留关注与更新提醒，包括作者自动关注自己的记录、其他用户手动关注，以及现有个人通知设置。
3. 保留图文记录、评论、评论表情回应、进度状态、标签、搜索、我发布的筛选、路线图和重复记录关联。
4. 移除“趋势”“最受欢迎”“我的投票”，保留与投票无关的“评论最多”作为可选排序，不扩大本次删除范围。
5. 历史投票数据暂时保留；应用不再新增、合并、展示或用于排名。

本次不改变状态体系、审批规则或通知接收范围，不新增流程，不做整站视觉重构。相邻 `fider-local` 中的原版试用实例不作为开发或测试实例，也不在本次替换。

## 2. 当前实现与关键依赖

| 当前行为 | 源码入口 | 实施注意点 |
| --- | --- | --- |
| 创建记录后给作者自动投票 | [API post.go](../app/handlers/apiv1/post.go) 的 `CreatePost` | 删除 `AddVote`，保留图片上传与 `SetAttachments` |
| 作者自动关注新记录 | [存储 post.go](../app/services/sqlstore/postgres/post.go) 的 `addNewPost` | 保留 `internalAddSubscriber`，它不依赖投票 |
| 默认热度及投票筛选 | [common.go](../app/services/sqlstore/postgres/common.go) 的 `getViewData` | 替换默认排序；清理 `myvotes`、旧 `my-votes` 与票数排序 |
| 投票、取消、切换及名单接口 | [routes.go](../app/cmd/routes.go) 和 API post.go | 去掉四个投票路由；订阅路由和共用的 `addOrRemove` 保留 |
| 首页、路线图、相似记录中的票数 | [ListPosts.tsx](../public/pages/Home/components/ListPosts.tsx)、[Roadmap.page.tsx](../public/pages/Roadmap/Roadmap.page.tsx) | 同时检查普通卡片和 `minimalView` |
| 详情独立页及弹层中的按钮、名单 | [PostDetails.tsx](../public/components/PostDetails/PostDetails.tsx)、[ShowPost.page.tsx](../public/pages/ShowPost/ShowPost.page.tsx)、[SSR post.go](../app/handlers/post.go) | 同时移除首屏数据与客户端名单请求，保留关注状态读取 |
| 重复记录合票 | 存储 post.go 的 `markPostAsDuplicate` | 仅移除票数合并；保留状态、原记录关联、跳转与通知 |
| 导出、订阅源及 Webhook 票数 | [csv.go](../app/pkg/csv/csv.go)、[feed.go](../app/handlers/feed.go)、[Webhook props.go](../app/pkg/webhook/props.go) | 按第 3 节清理输出或兼容旧模板 |

投票写入仅操作 `post_votes`，关注另由 `post_subscribers` 管理。原来的重复记录合并也没有迁移关注者，本次不附带增加关注者迁移。

## 3. 目标行为与兼容规则

### 3.1 首页、排序和旧链接

| 输入或入口 | 目标行为 |
| --- | --- |
| 首页 `/` 无 `view` | 使用 `recent`，沿用现有新记录在前的 `id DESC` 顺序 |
| `view=recent` | 保持最新提交排序 |
| `view=most-discussed` | 保留按评论数排序 |
| `view=trending`、`view=most-wanted`、`view=my-votes` | 归一化为 `recent`，不再读取历史票数 |
| `myvotes=true` / `false` 或其他旧取值 | 忽略该退休参数；不筛出旧投票记录，也不产生报错 |
| 未识别的 `view` | 回退 `recent`，不再进入热度算法 |
| 现有合法 `all/planned/started/completed/declined` | 保留原有状态范围和排序用途，避免影响路线图与旧链接 |
| `GET /api/v1/posts` 无 `view` | 保留原来的 `all` 语义和最新记录排序，不能直接换成仅覆盖活动状态的 `recent` |

首页的排序变化不改变默认状态范围：现有开启、计划中、进行中的范围继续保留；已完成等记录仍按现有筛选和路线图规则访问。API 默认 `all` 与首页默认范围不同，不能在整理参数时混为一谈。

仅剔除投票参数，保留关键词、标签、状态、我发布的、无标签、审核筛选和分页条件。比如 `view=most-discussed&myvotes=true` 应保留评论排序，只去掉投票筛选。

前端初始状态、排序标签、首次 SSR 结果、交互查询及翻页采用同一规则。浏览器可用现有 `navigator.replaceState` 清理旧参数；API 在服务端直接归一化，不通过重定向更改请求语义。关键词搜索和相似记录原有相关性逻辑继续保留，不借本次任务重写搜索。

### 3.2 投票接口与返回模型

移除以下路由注册和对应处理函数：

- `GET /api/v1/posts/:number/votes`
- `POST /api/v1/posts/:number/votes`
- `DELETE /api/v1/posts/:number/votes`
- `POST /api/v1/posts/:number/votes/toggle`

在已通过原有空间访问控制的会话中，旧接口按不存在的路由返回 `404`，不得返回成功、名单或写入投票。保留原有租户、私有空间和登录保护，不为退休接口新增绕过权限的处理。

前后端 `Post` 模型移除 `hasVoted`、`votesCount`，详情 props 移除 `votes`，同时清理 `Vote` 类型及无引用的转换逻辑。此次是 Fork 的接口精简，旧客户端不能再依赖这些字段；在实现 PR/Changelog 中明确记录，不伪造实际票数。

`subscription` 的增删和状态查询接口保留。`addOrRemove` 仍被订阅使用，不能连同投票处理函数删除。

### 3.3 导出、订阅源与旧 Webhook 模板

- CSV 删除 `votes_count` 表头及对应列；其他列的顺序、转义和内容保持一致。
- Atom/Feed 去掉标题、正文和页脚中的票数内容，保留评论数、状态、链接与既有开关。
- 默认欢迎语、登录提示、邀请正文和本地可达的管理文案不再引导投票；租户自己填写的欢迎语、邀请草稿或历史记录不批量改写。
- Webhook 的变量展示与新模板示例去掉投票变量；对原本提供该变量的事件，旧模板里的 `post_votes` 暂时返回整数常量 `0`。这是弃用占位值，不代表历史票数，也不再查询票表。
- 该兼容值仅保留于原来的完整记录事件（新评论、状态变更、删除记录）；新记录事件原本不带该字段，继续保持原来的字段范围。
- 保存校验、预览、测试和实际发送必须使用相同兼容值。不自动替换用户模板字符串，不删除已有 Webhook 配置，也不扩大 Webhook 事件范围。

兼容理由：当前模板使用 Go `text/template`，直接删变量可能产生 `<no value>`、无效 JSON 或执行错误。保持单一固定值可避免破坏已有模板；未来删除此兼容项另行处理。相关入口为 [模板解析](../app/pkg/tpl/text.go)、[保存校验](../app/actions/webhook.go)、[示例变量](../app/services/webhook/dummy_props.go) 和 [预览/发送服务](../app/services/webhook/webhook.go)。

### 3.4 历史数据

- 本次不执行清空或删除 `post_votes` 的迁移，不修改已有建表迁移。
- 正常记录查询移除 `agg_votes`、`has_voted` 子查询及近期票数计算；历史票不再影响页面、排序、搜索输出或通知。
- 保留 [备份表清单](../app/pkg/backup/backup.go)、[删除用户](../app/services/sqlstore/postgres/user.go)、[删除站点](../app/services/sqlstore/postgres/tenant_deletion.go) 中针对票表的维护逻辑，以及既有外键/级联关系。
- “保留历史数据”指不因本次升级批量删除；用户或站点被正常删除时仍按原语义清理其数据，不能留下孤立记录。
- 回退到本次改动前的代码仍可读取保留表；停用期间没有产生的投票不回填。

## 4. 文件改动分组

### 4.1 前端

- `public/pages/Home/components/PostsSort.tsx`：移除趋势、最受欢迎，默认选择最新提交；保留评论最多。
- `public/pages/Home/components/PostFilter.tsx`、`PostsContainer.tsx`、`public/services/actions/post.ts`：移除投票筛选、请求函数与类型，统一退休参数处理及分页行为。
- `public/pages/Home/components/ListPosts.tsx`：清理普通卡片与相似记录用精简卡片中的票数、已投票状态。
- `public/pages/Roadmap/Roadmap.page.tsx`、`public/pages/ShowPost/components/PostSearch.tsx`：移除票数，保留状态、完成日期和重复记录选择。
- `public/components/PostDetails/PostDetails.tsx`、`public/pages/ShowPost/ShowPost.page.tsx`：移除投票区、投票者栏及数据加载，保留作者、正文、附件、操作区、评论与关注。
- 删除无其他用途的 `VoteCounter`、`VoteSection`、`VotesPanel`、`VotesModal` 及专用样式和导出，更新相应测试。
- `public/pages/ShowPost/components/ResponseModal.tsx`：去掉合票提示，改为仅说明关联到原记录。
- 调整详情布局相关 SCSS，避免留下空的桌面侧栏或移动端区块；Fider 署名保留并放到合适的现有页脚位置。按 [前端设计规范](./frontend-design-references.md) 做必要收口，不扩展为页面重设计。
- `public/models/post.ts` 与 `locale/`：同步模型和翻译。混合文案更新源文案及简体中文；删除旧投票专用键，避免旧翻译继续出现。新增键沿用现有 Lingui 英文回退配置，不批量重写无关翻译。

### 4.2 后端

- `app/cmd/routes.go`、`app/handlers/apiv1/post.go`：关闭四个投票接口；新建记录保留图片处理，移除作者自动投票。
- `app/handlers/post.go`：删除 SSR 投票名单查询及 props，调整首页默认行为和默认描述；保留附件、评论、标签和订阅查询。
- `app/services/sqlstore/postgres/post.go`、`common.go`：清理投票聚合与相关过滤/排序，去掉重复记录合票，保留作者自动订阅和重复关联。
- `app/models/entity/post.go`、`app/services/sqlstore/dbEntities/post.go`、`app/models/query/post.go`：同步返回结构与查询参数；确认无引用后移除 `CanBeVoted` 和仅供趋势算法使用的近期统计字段。
- `app/models/cmd/vote.go`、`app/models/query/vote.go`、`app/models/entity/vote.go`、`app/services/sqlstore/dbEntities/vote.go`、`app/services/sqlstore/postgres/vote.go`：移除无用途的投票命令、查询、类型及服务注册，不删保留表需要的维护路径。
- `app/metrics/metrics_fider.go`：移除投票专用计数器及注册，保留记录、评论等指标。
- CSV、Feed、Webhook 按第 3 节实现，同步删除示例对象中的真实票数字段。

执行时以类型检查、引用搜索和实际调用关系校验清理范围，不能直接把所有含 `vote` 的代码/历史 SQL 一并删除。

## 5. 实施顺序

1. 记录修改前基线，核对本地开发/测试依赖及数据隔离，保留已有未提交文档。
2. 先按第 3 节建立排序、旧链接、作者自动关注和投票写入停用的行为回归用例；不为已删除按钮保留无意义的组件测试。
3. 协调修改后端查询、模型、接口、SSR 与前端调用，完成同一分支上的整体删除，避免部署字段不匹配的中间版本。
4. 完成重复记录处理、CSV/Feed、Webhook 兼容、界面文案和布局收口。
5. 跑受影响检查与独立开发实例的页面/API 验证，记录实际结果与限制。
6. 更新 Issue 中的完成项与方案验证记录。提交、推送、PR、合并、部署按后续授权执行；本次实施停留在本地分支和独立开发实例。

## 6. 验证与验收

### 6.1 数据隔离

后续检查使用本项目独立且可丢弃的开发/测试数据库、测试账号、邮件收件箱及本地 Webhook 接收端。不得连接 `fider-local` 数据卷、复用原版 Cookie 或向真实收件人发送测试消息。

特别注意：`make test-server` 会加载 `.test.env` 并迁移测试库，`app/services/sqlstore/postgres/setup_test.go` 的 `TestMain` 会调用 `dbx.Seed()`。运行前必须确认实际测试连接属于本项目隔离库，不能只凭环境文件名称判断。

### 6.2 关键回归场景

| 场景 | 验收结果 |
| --- | --- |
| 老记录高票、新记录低票或零票 | 首页始终显示新记录在前，刷新/翻页后顺序一致；同一库中的历史票保留 |
| 退休 view、投票筛选与其他筛选组合 | 按第 3.1 节回退，保留有效筛选；前后端首屏和交互结果一致 |
| API 无 view、显式 all、状态/路线图查询 | 已完成/已拒绝记录的原有可见范围不被默认排序调整缩窄 |
| 创建图文记录 | 创建和附件读取成功；作者已关注；票表未新增记录 |
| 旧投票接口 | 已认证普通用户和管理员调用均为不存在的接口，票表不变化；私有空间访问保护继续有效 |
| 普通详情与首页/路线图弹层 | 不再请求名单；没有投票按钮、票数、已投票状态、投票者头像或空侧栏 |
| 评论、表情、编辑、状态更新 | 原有操作正常；操作后刷新内容持久存在 |
| 作者关注、手动关注、取消关注 | 按既有个人设置接收或停止相关更新；不因删除投票而改变通知对象 |
| 标记重复 | 正确关联原记录并可跳转；不向原记录增加历史票，也不擅自迁移关注者 |
| CSV 与 Feed | 无票数列/票数文案，其他字段及订阅内容正常 |
| Webhook 新模板与旧模板 | 预览、保存校验、测试及本地接收结果一致；旧 `post_votes` 为 0，不产生 `<no value>` 或无效 JSON |
| 历史表维护 | 升级前后票表数据保持；备份保留历史票；隔离测试中删除用户/站点后无孤立数据 |
| 布局与可访问性 | 桌面及窄屏无空白投票栏；英文/中文文案正常；Tab、返回与弹层关闭后的焦点可用 |

现有测试入口包括 `app/handlers/apiv1/post_test.go`、`app/handlers/post_test.go`、`app/services/sqlstore/postgres/common_test.go`、`post_test.go`、`subscription_test.go`、`notifications_test.go`、`app/handlers/feed_test.go`、`app/pkg/csv/csv_test.go` 及 `e2e/features/ui/post.feature`。补充真正覆盖退休接口、旧参数和 Webhook 模板行为的用例；含历史票的夹具直接在隔离测试数据中准备，不为了测试保留应用投票入口。

在相关依赖和测试隔离已确认后，执行适用的 `make lint`、`make test`、`make build` 与受影响 E2E 检查。先记录既有失败，修复本次引入的问题；不削弱断言，不顺带升级工具链。检查通过后不重复扩大范围。

### 6.3 实施状态

- Issue 已建立并记录产品范围和验收条件。
- 方案、实施代码和验证记录位于本地分支，链接与格式已检查。
- 已完成实施及自动/实际行为验证，结果和既有工具链问题见 [实施验证记录](./remove-voting-verification.md)。
