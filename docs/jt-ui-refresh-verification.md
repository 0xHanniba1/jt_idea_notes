# JT UI 统一与紧凑记录布局验证记录

- 日期：2026-09-16
- Issue：[#3](https://github.com/0xHanniba1/jt_idea_notes/issues/3)
- 方案：[jt-ui-refresh-plan.md](./jt-ui-refresh-plan.md)
- 工作分支：`codex/jt-ui-refresh`；起点 `39d01b3f4fe465f96138d4d394d2164d662199d6`
- 设计来源：只读参考 `jt_case_platform`，基线 `d71a4d7911d343d7d46f8908dbd0c8d56a7faedb`。
- 本文记录实现阶段的本地验证结果；main 与 4180 的发布状态见关联 Issue 的交付记录。

## 实施结果与组件对应

首页改为紧凑页头、可展开欢迎语、顶部新建入口、搜索/筛选/排序工具栏及细分隔线列表。首页和路线图共用右侧详情抽屉；列表保持挂载，关闭后恢复查询、已加载数量、滚动位置和焦点。900px 及以下抽屉铺满视口；独立详情链接、刷新和评论深链接继续可用。

案件平台没有能直接导入的独立 UI 包。本次在 Fider 现有 React/TypeScript/SCSS 中映射实际来源样式，保留业务接口、权限和构建方式；没有新增运行依赖、数据库迁移或工作流。

| 控件组 | 落地方式与入口 |
| --- | --- |
| 全局颜色、字阶、圆角、阴影、动效 | 直接映射案件平台语义 token，新增 `_jt-tokens.scss`，兼容原 `--colors-*`；浅色和深色均通过 Fider 的 body 主题入口生效 |
| Header、主题、账号、通知、管理导航 | 采用来源顶部栏、工具按钮与浅蓝选中胶囊；保留既有路由和权限 |
| Button、Toggle、Checkbox、RadioButton | 映射控件尺寸、禁用、hover、选中和键盘焦点；异步按钮防止重复提交 |
| Input、TextArea、Select、表单提示与错误 | 映射来源表单表面、间距和错误状态；补齐标签关联、禁用与可访问名称 |
| Dropdown、TagsSelect、重复记录选择 | 统一菜单/列表外观，保留 menu 与 combobox/listbox 各自语义；方向键、Home/End、Esc、Tab 与选中状态可用；重复记录使用可聚焦的真实按钮 |
| Modal、插入链接弹窗、详情抽屉 | 共享 Portal、浮层层级、焦点循环、最上层 Esc、背景 inert 和滚动锁；抽屉宽度按正文需要适配，非照搬案件业务面板 |
| 状态、标签、头像、加载、消息 | 按同一语义 token 适配 Fider 原有数据和状态；保留租户标签颜色、用户图片和品牌内容 |
| 编辑器、附件、评论与反应 | 保留 TipTap/Markdown 和附件管线；统一工具栏及表面，修复真实编辑器在提交期间仍可输入的问题 |
| Toast | 改为底部居中、JT 圆角与阴影；深色一致，保留 status/alert 播报、悬停/聚焦暂停和正常自动消失；reduced-motion 不破坏计时 |
| 图标 | 采用来源 Lucide 1.33.0 图形、1.7 线宽，保留现有 SVG 导入与 sprite 管线；已附 ISC 许可和来源说明 |
| 管理页、设置、通知、登录与法务页 | 使用统一组件与紧凑工作面；成员/标签表在窄屏改为可阅读的行布局，保留原字段与功能 |

详情操作通过结果回调刷新当前记录、评论及原查询下的背景列表，避免整页刷新丢失上下文。请求按记录隔离并忽略过期结果，明确呈现 401/403/404/网络失败；未保存的记录编辑支持取消离开，权限失效不保留受保护内容。新建、状态、删除和评论的提交期间锁定输入，失败保留草稿。

## 自动检查

| 检查 | 结果 | 本地日志 |
| --- | --- | --- |
| 完整前端 Jest：`TZ=GMT npx jest public --runInBand` | **20 组、182 项通过**；覆盖菜单/模态/导航、过期响应、权限错误、草稿保护、局部更新、真实 TipTap 禁用及此前投票退休回归 | `tmp/ui-refresh/test-ui.log` |
| 前端 ESLint：`npx eslint .` | 0 错误；2 条既有 `public/services/fider.ts` 非空断言警告 | `tmp/ui-refresh/lint-ui.log` |
| Lingui 提取与编译 | 通过；新增文案补齐简体中文，其余既有语言沿用缺失翻译回退 | `locale-extract.log`、`locale-compile.log` |
| SSR：`NODE_ENV=production node esbuild.config.js` | 通过 | `build-ssr.log` |
| 生产前端：`NODE_ENV=production npx webpack-cli` | 通过；仍有 CSS 顺序及资源体积共 3 项构建警告 | `build-ui.log` |
| 相关 Go：`tmp/voting-runtime/test-env go test ./app/handlers/... ./app/pkg/web -race -short` | handlers、apiv1、web 通过；webhooks 无测试文件。SSR 断言同步新建入口与语义布局 | `test-server-final.log` |
| 裸 TypeScript：`npx tsc --noEmit` | 未通过：25 条 `node_modules` 类型声明错误，与此前干净基线的错误诊断逐条一致；没有项目文件错误，未关闭检查 | `typecheck.log`；对照 `tmp/voting-runtime/baseline-typecheck.log` |
| `git diff --check` | 通过 | 本次终端结果 |

除明确写出的路径外，表内日志均位于被 Git 忽略的 `tmp/ui-refresh/`。没有修改 Go 应用逻辑；没有重复运行无关的全部数据库测试或接入外部服务的测试。Go 本地工具链仍输出既有 V8/Clang/linker 警告。

## 实际浏览器验证

使用本机 Chrome、隔离管理员/普通用户及合成记录。下列检查均在生产构建后的 4181 实例实际执行；成功条件包括可见内容、真实 API 保存结果、URL/焦点和输入状态，不只检查 HTTP 200。

| 场景 | 实测结果与证据 |
| --- | --- |
| 页面、主题与尺寸 | 1440、1280、768、390px；首页、抽屉、新建，路线图、设置、通知、管理首页/成员/标签/隐私/邀请/认证/高级/导出/Webhook 及组件页；检查浅色/深色主要界面和窄屏，无横向溢出、页面 JS 异常或投票请求。`qa-pages.json` |
| 抽屉导航 | X/Esc/Back/Forward 保留 query、limit、hash、滚动及焦点；背景列表可见且 inert；Cmd/Ctrl 原生新标签页；嵌套状态弹窗、评论锚点、取消丢弃编辑、独立刷新、路线图返回均通过。`qa-navigation-results.json` |
| 编辑器与嵌套 Esc | 默认富文本焦点时 Esc 可关闭；提及菜单先关闭，第二次才关闭外层；插入链接弹窗先关闭并恢复焦点；输入法组合期间不关闭。`qa-editor-escape-results.json` |
| 真实图文与评论操作 | 网页新建正文和 PNG 附件，独立页图片实际读取；抽屉内编辑记录，创建/编辑/删除评论，切换状态刷新背景，删除后保持查询。`qa-mutations-results.json` |
| 慢请求与失败 | 新建和评论提交期间真实编辑器只读；评论网络失败保留草稿、重试只新增一次；列表失败结束加载并可重试；详情 404 不残留旧正文，重新打开正常。`qa-errors-saving-results.json` |
| 标签、关注与重复关联 | 标签删除/添加持久化并更新当前筛选列表；关注/取消经真实订阅接口成功；重复目标可用键盘选中，保存后有正确原记录链接。`qa-final-actions-results.json` |
| 最终提交保护 | 新建处理中浏览器 Back 恢复表单历史条目；标题/编辑器/标签不能变化；状态选择/回应/重复目标、删除理由在保存中禁用，Esc 不提前关闭。`qa-final-actions-results.json` |
| Toast 与菜单键盘 | 浅色、深色、status/alert；焦点停留超过 5 秒仍保留，离开后恢复计时；hover 暂停与 reduced-motion 正常；模态内菜单 Tab/Shift+Tab 顺序正常。`qa-toast-results.json` |
| 普通用户与访客 | 普通用户可读和评论，其他作者记录上不出现管理员编辑/删除/状态按钮；访客没有关注按钮，聚焦评论打开登录弹窗。`qa-roles-results.json` |

截图与执行脚本同目录保留，可重新核对。主要截图：`home-desktop-light.png`、`home-desktop-dark.png`、`drawer-1280.png`、`drawer-desktop-dark.png`、`drawer-390.png`、`new-idea-390.png`、`mobile-admin-users.png`、`mobile-admin-tags.png`、`duplicate-selection.png`、`qa-toast-dark.png`。截图只包含本地验收账号和合成内容；目录内带 initial/failure 的图片是修复前的诊断证据，不是最终效果。

## 环境与边界

- 预览：`http://jt-idea-notes.localhost:4181/`；邮件捕获：`http://127.0.0.1:18026/`。独立 Compose `jt-idea-notes-voting`，数据库宿主端口 15566；dev/test 库分开。本轮只重启该开发应用载入新构建。
- 实现阶段未更新 4180 日常试用实例及其 8026 邮箱；后续获用户授权的发布单独备份并验证，不使用开发环境数据覆盖它。案件平台代码及运行环境未修改。
- 保留本轮带 `ui-nav`、`ui-safe`、`ui-final` 等前缀的合成测试记录和 `QA-` 标签；删除验证只删除本次自己创建的记录。对应 ID 记录在 `qa-navigation-data.json`、`qa-mutations-data.json`、`qa-saving-data.json`、`qa-final-data.json`，没有批量清理既有数据。
- 本轮未启用真实 OAuth/付费功能、未发出邀请或外部 Webhook；邮件仅进入本地 Mailpit。通知后端与投票退休语义未改，相关 Go 回归通过；完整跨账号邮件投递链沿用此前验证，本轮未重复全量测试。
- 私有空间认证由既有服务端权限检查及相关回归保障；本轮没有切换开发租户的公开/私有配置。UI 的 401/403 安全清理已自动验证。
- 主要中文业务界面及含英文管理文字已检查；不是所有语言和每个管理弹窗的穷举视觉验收。没有为未配置外部服务伪造“已通过”。
- 本文中的检查结果针对已实现的产品代码与 4181 隔离预览，不将开发验证等同于 4180 发布验证；正式发布结果见关联 Issue。
