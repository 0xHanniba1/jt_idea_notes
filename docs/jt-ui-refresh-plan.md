# JT UI 统一与紧凑记录布局实施方案

- Issue：[#3 统一 JT UI，并改为紧凑记录列表与右侧详情抽屉](https://github.com/0xHanniba1/jt_idea_notes/issues/3)
- 日期：2026-09-16
- 本项目基线：`39d01b3f4fe465f96138d4d394d2164d662199d6`
- 设计来源：`/Users/kerwin/JT/jt_case_platform`，基线 `d71a4d7911d343d7d46f8908dbd0c8d56a7faedb`
- 工作分支：`codex/jt-ui-refresh`
- 状态：已按方案完成实施与开发环境验证，详见 [验证记录](./jt-ui-refresh-verification.md)；main 与 4180 发布状态见关联 Issue。

## 1. 已确认目标与执行边界

想法簿服务于方便记录想法、需求、Bug 和优化，主要在电脑使用。保留现有轻量业务，优先改善阅读密度和操作一致性。

已确认的产品选择：

1. 首页改成紧凑列表：标题、一行摘要、靠右的状态；减少大卡片、阴影和空白。
2. 缩小欢迎区，将“记一个想法”放在顶部；搜索、筛选、排序集中成工具栏。
3. 从列表点开记录，使用右侧详情抽屉；关闭后保留列表位置和筛选，支持 Esc，窄屏铺满页面。
4. 新建记录保留填写弹窗，统一外观与间距，不增加填写步骤。
5. 全部 UI 组件及效果以 jt_case_platform 的实际实现和最新已确认设计规则为唯一标准，包括深浅主题与完整交互状态。

用户本轮确认优先于迁入文档中旧的“Fider 组件是第一参考”“保留现有排版和信息密度”等限定：视觉与交互采用案件平台，页面结构按上述选择调整；Fider 继续提供业务逻辑、接口、React/TypeScript/SCSS 架构和构建方式。实施时同步修订本项目适用设计约定，避免两套规则并存。方案编写阶段保留原有未跟踪文档；实施阶段已同步修订 `AGENTS.md` 和 `docs/frontend-design-references.md` 的设计优先级。

范围分为两层：

| 范围 | 本轮处理 |
| --- | --- |
| 全站共享 UI | 主题、文字、按钮、表单、菜单、弹窗、标签/状态、图标、提示、加载、导航和对应状态全部统一；覆盖使用这些组件的页面 |
| 首页和记录详情 | 紧凑列表、工具栏、新建弹窗外观、右侧抽屉及其导航/焦点/内容更新行为 |
| 路线图 | 保留当前分列与状态含义，统一组件外观，并复用同一详情抽屉 |
| 登录、注册、通知、个人设置、管理与错误页面 | 统一控件和页面表面、文字、间距；保留现有字段、权限、功能入口和操作顺序 |
| 未配置的付费/OAuth/邮件等功能 | 检查相关组件与本地可构造状态，不为视觉验收开启付费、接入真实 OAuth 或发送真实邮件 |

不修改案件平台；不迁入案件业务、左侧案件树或三阶段结构；不引入 Next.js、Tailwind 或另一套 UI 框架。没有数据库迁移，不更改状态体系、权限、邮件、关注通知、默认排序和投票退休行为。租户已有欢迎文案、Logo、自定义 CSS、标签颜色不批量覆写；发现自定义 CSS 与新主题冲突时记录具体覆盖来源。

## 2. 源码事实与本轮必须处理的连接点

| 事实 | 当前入口 | 对方案的影响 |
| --- | --- | --- |
| 首页欢迎区在宽屏占三列中的一列；新建按钮为整行大块 | [Home.page.tsx](../public/pages/Home/Home.page.tsx)、[Home.page.scss](../public/pages/Home/Home.page.scss) | 改为紧凑页头和主要记录区，移除原宣传式分栏 |
| 记录卡片有较大的内边距、间隔、阴影，状态独占底部 | [ListPosts.tsx](../public/pages/Home/components/ListPosts.tsx)、[PostsContainer.scss](../public/pages/Home/components/PostsContainer.scss) | 改为统一列表容器、细分隔线及稳定的内容/状态列 |
| 当前“弹层”隐藏列表，实际用详情替换内容区 | Home、[Roadmap.page.tsx](../public/pages/Roadmap/Roadmap.page.tsx) | 列表保持挂载和可见背景，由抽屉承载同一 PostDetails |
| 打开和关闭详情都 push 历史；popstate 重新抓取 search/scroll | [use-post-overlay.ts](../public/hooks/use-post-overlay.ts) | 改为有归属标记的历史条目和稳定的返回上下文，避免关闭后 Back 又打开错误详情 |
| 原 Modal 独立设置 body overflow、监听 Esc，容器错误带 aria-disabled | [Modal.tsx](../public/components/common/Modal.tsx) | 共享浮层需补齐语义、焦点、最上层 Esc 和锁滚动释放，才能承载抽屉与嵌套弹窗 |
| 评论、评论编辑/删除、部分审核和状态操作会整页 reload；删除记录跳首页 | [CommentInput.tsx](../public/pages/ShowPost/components/CommentInput.tsx)、[ShowComment.tsx](../public/pages/ShowPost/components/ShowComment.tsx)、[ResponseModal.tsx](../public/pages/ShowPost/components/ResponseModal.tsx)、[DeletePostModal.tsx](../public/pages/ShowPost/components/DeletePostModal.tsx) | 在抽屉中改由结果回调局部刷新，避免操作后丢失列表上下文；独立页继续工作 |
| PostDetails 异步读取不检查全部 HTTP 状态，也没有过期请求隔离 | [PostDetails.tsx](../public/components/PostDetails/PostDetails.tsx) | 新抽屉必须区分加载/拒绝/不存在/网络错误，并忽略已关闭或已切换记录的旧响应 |
| 主题标记在 body，采用 colors-* 变量；案件平台标记在 html，采用语义 token | [index.scss](../public/assets/styles/index.scss)、[ThemeSwitcher.tsx](../public/components/ThemeSwitcher.tsx) | 映射到当前主题入口，不能直接复制案件平台 html 选择器后声称深色模式完成 |
| 现有组件展示入口为 /_design | [DesignSystem.page.tsx](../public/pages/DesignSystem/DesignSystem.page.tsx) | 扩展已有入口用于核对控件状态，不另建业务设计后台 |

案件平台没有可整包导入的通用 Button/Dropdown/Drawer 组件库。它主要由语义 token、业务 CSS 和少量共享 React 组件/交互 helper 组成。本次复用其样式与可独立的交互实现，适配当前 Fider 组件，不宣称可以直接复制整套页面。

## 3. UI 来源、映射与一致性验收

下面的来源路径均相对于 `/Users/kerwin/JT/jt_case_platform`。实施以顶部记录的源码基线为参照；若来源项目后续变化，先比较实际差异，不自动追随新提交。

### 3.1 设计值

| 项目 | 来源值或行为 | 在 Fider 中的落点 |
| --- | --- | --- |
| 背景/面板/边线 | `--canvas: #f5f5f7`、`--paper: #fff`、`--paper-soft: #f8f8f9`、`--line: #e9e9ed` | 全局背景、列表表面、菜单、表单和浮层 |
| 主色/选中/普通反馈 | `--brand: #285ada`、`--brand-soft: #e8efff`；hover `#eaeaee`，active `#e2e3e9` | 主操作和浅蓝选中；普通控件用中性灰反馈 |
| 正文/辅助字 | `--ink-950: #25262b`、`--ink-500: #656770`；系统无衬线，界面基准 14px、行高 1.55 | 调整全局字阶及控件引用；正文内容按用途保持可读，不统一压成小字 |
| 圆角 | 控件 14px、卡片 16px、面板 20px、胶囊 999px | 按组件类型映射，列表中的每一行不单独做圆角大卡片 |
| 阴影 | control `0 1px 3px rgb(30 33 40 / 5%)`；floating `0 12px 36px rgb(30 33 40 / 9%), 0 2px 8px rgb(30 33 40 / 4%)` | 控件轻阴影，菜单/弹窗浮层阴影；列表靠细边线分层 |
| 动效 | 全局颜色、背景、边框、阴影 140ms；个别源组件 150ms | 删除旧按钮按压缩放和旧弹窗 0.5s 缩放入场；保留必要加载反馈，遵守 reduced-motion |
| 深色主题 | 源 `app/globals.css` 的完整同名暗色 token | 映射到现有 body[data-theme]；Portal、Toast、编辑器和背景均需一致 |
| 图标 | 源项目 Lucide 的细线风格，常规笔画 1.7 | 按实际使用图标对应 SVG 迁入现有 sprite 管线，保留来源许可；业务图片/头像/品牌标识保留 |

尺寸按来源的对应控件取值：主入口按钮 36px 高、12px 字/550 字重；普通工具按钮 34px 高、6px × 11px 内边距；表单与触屏命中区至少 44px；搜索 36px 高。菜单 5px 内边距、条目 34px 高；列表行最小 52px、8px × 12px 内边距，标题 14px/550，辅助信息 11–12px。多行标题、标签和正文自然撑开，不为追求同高截断操作。

在现有主题文件中增加必要的 JT 语义变量并让旧 `--colors-*` 引用兼容，不堆叠大量页面级颜色覆盖。新增变量覆盖本次真实控件需求，不照搬源项目业务专用 token。默认主色和中性灰使用上表；成功、错误、警告使用来源对应语义颜色。

### 3.2 组件对应表

| 控件/效果 | 案件平台实际来源 | 本项目处理入口 |
| --- | --- | --- |
| 全局 token、字阶、图标线宽、主题 | `app/globals.css` | `public/assets/styles/variables/`、`reset.scss`、`utility/_theme.scss`、ThemeSwitcher |
| 按钮、图标按钮、浅蓝胶囊选中 | `app/styles/case-library.css` 的 `.case-create-actions`；`app/styles/case-material-browser.css` 的工具按钮；`app/styles/topbar.css` 的导航/账号/主题控件 | `Button`、Header、ThemeSwitcher、ActionButton、FollowButton、管理页操作 |
| 表单、错误、输入聚焦 | `components/auth-form-controls.tsx`；`.case-create-field` 和 `.case-create-error` | `common/form/` 的 Input/TextArea/Select/Checkbox/RadioButton/DisplayError，以及富文本输入外框 |
| 搜索、工具栏、紧凑列表 | `.case-search-control`、`.case-library-grid`、`.case-card` | Home、PostsContainer、PostFilter、PostsSort、ListPosts |
| 菜单外观和键盘焦点 | `.case-library-page-size-menu`、账号菜单；`components/menu-navigation.ts` | Dropdown、Select2、TagsSelect、编辑器工具菜单；按 menu/listbox 类型分别处理 |
| 弹窗和遮罩 | `.case-create-dialog`、原生 dialog 的关闭/焦点模式 | Modal、CloseIcon、ShareFeedback、状态/删除/登录/管理弹窗 |
| 右侧面板与工具头 | `components/document-preview-panel.tsx` 及 `app/styles/case-workspace.css` 的 `.document-preview-panel` | 共享抽屉容器＋PostDetails；仅迁入容器、工具头、分隔线和焦点原则 |
| 内联消息与通知 | `components/case-file-move-toast.tsx`、`app/styles/case-file-move-wheel.css`、`components/auth-form-controls.tsx` | Message、Hint、notify/ToastContainer、空态、错误页；Toast 改为来源的底部居中、距底 28px、面板圆角及浮层阴影，保留原成功/错误语义和可访问播报 |
| 标签、状态、头像、加载、上传/编辑器 | `app/styles/work-home.css`、`app/styles/case-tasks.css` 等状态提示及最近似的控件/表面规则 | ShowTag、ResponseLozenge、Avatar、Loader、Toggle、附件上传与 CommentEditor；无一对一来源时使用同一 token 和状态规则，列明适配点 |

注意来源项目的渐进迁移差异：旧 `.case-search-control:focus-within` 仍有蓝色外圈，但最新设计约定及 `.case-create-field input:focus-visible` 明确文本输入不增加粗蓝圈、双层框或焦点阴影。本次采用最新约定及已落地样例，保留插入光标、错误状态和键盘可辨性；按钮、链接、选择控件仍保留适当键盘焦点。不能为外观统一全局删除 outline。

全站检查清单至少包含 `public/components/common/`、`common/form/`、Header、ThemeSwitcher、PageTitle、TagsPanel、ResponseLozenge、ShowComment、编辑器工具栏，以及 `public/services/toastify.tsx` 的第三方默认皮肤。每一项标注“直接映射/按同一规则适配/保留用户内容”，避免把没有独立 SCSS 的 JSX 或第三方样式漏掉。

菜单交互参考 `getMenuFocusTarget`：上下方向键循环、Home/End、Esc 关闭回到触发器、Tab 正常离开；单选菜单提供 aria-checked，并在下方空间不足时向上展开。输入型选择器遵守 combobox/listbox 的语义，不把全部控件强制改成 menu。Toast 使用适当的 status/alert 语义，悬停/聚焦暂停自动消失；错误与重试入口沿用现有业务能力，不凭视觉示例新增动作。

## 4. 首页与紧凑记录列表

### 4.1 结构

```text
顶栏：想法簿 / 所有反馈 / 路线图                  主题 / 通知 / 账号
页头：紧凑标题与简短欢迎语                       记一个想法
工具栏：搜索                                    筛选 / 排序
记录列表：
  标题（至多两行）                              状态 / 评论数
  一行摘要                                      原有标签按空间排列
  ───────────────────────────────────────────────────────────
```

- 欢迎文案只改变呈现，不改写租户配置。默认短文案紧凑显示；长欢迎内容需要可展开读取，不能静默删除。
- 列表参考 `.case-library-grid` / `.case-card` 的单容器和细分隔线：内容列 `minmax(0, 1fr)`，状态列按文字自适应；内边距、字重、hover 采用来源值。高度由文字决定，不设大块固定高度。
- 标题保留真实链接；摘要只显示一行纯文本省略，完整内容在详情阅读。标签过多或长状态允许换行，不能覆盖摘要或把内容列挤到不可读。
- 保留原评论计数、标签、审核提示与既有权限。点击状态标签本轮不新增直接变更进度功能。
- 单击或 Enter 打开抽屉；Ctrl/Cmd/Shift 点击、中键和复制链接保留原生链接行为，不拦截新标签页打开。
- 桌面工具栏一行；窄屏搜索占满一行，筛选和排序下一行，按钮不被截断。主操作与触屏命中区按来源移动端约定保持可用。
- 空列表、无搜索结果、加载、读取失败分别显示，不把失败伪装成空数据。Fider 署名与法务入口放在适当页脚位置，保留其可达性。

### 4.2 搜索和排序边界

保留 recent 默认、API 无 view 时 all、评论排序、关键词、标签、状态、我发布的、无标签、审核条件和 limit。旧投票参数继续归一化，不恢复投票功能。

保留已有分页方式，不改为无限滚动或新分页协议。列表组件在抽屉打开期间不卸载，原筛选与已加载数量保存在当前页面实例；不新增跨账号/租户长期保存筛选的行为。已有请求需要在换条件时隔离过期结果，关闭抽屉不能触发无条件重置查询。

## 5. 右侧抽屉及详情行为

### 5.1 容器与尺寸

- 基于现有共享 Modal 机制扩展右侧呈现，业务包装层承载 PostDetails；不新建一套独立详情业务实现。
- 桌面靠右覆盖，背景列表可见但处于模态不可操作状态；抽屉主体白色工作面、细边线，顶部关闭入口及正文区采用来源右面板的 54px 工具头和紧凑布局。
- 宽度使用有界的自适应值，初始目标约 640–760px；这是容纳记录正文和图片的产品适配值，非声称来源有同款 Drawer。900px 及以下铺满可用视口。窄屏按实际可用宽高和安全区处理，不依赖固定设备型号。
- 抽屉正文独立滚动；背景页面锁滚动且不跳动。长图、长链接、代码段、标签和评论在容器内可访问；固定头部不能遮住锚点。
- 深色面板和遮罩使用对应 token；不增加与来源不一致的装饰性滑动、弹跳或缩放效果。

### 5.2 URL、历史和列表恢复

| 操作 | 目标行为 |
| --- | --- |
| 列表打开记录 | 保存来源 URL（含 query/hash）、页面/列表滚动位置、已加载数量和触发元素；详情 URL 仍为 `/posts/:number/:slug`；只增加一个有本页归属标记的历史条目 |
| X、Esc、遮罩关闭 | 统一走关闭入口；确认当前条目属于本抽屉时返回其来源条目，不额外 push 一个空列表条目；无可用归属时仅安全回到当前页面的已知来源 URL |
| 浏览器 Back | 关闭当前详情并恢复来源条件、位置、焦点；不能跳到无筛选首页 |
| 浏览器 Forward | 重新显示对应详情，不用详情 URL 的空 search 覆盖之前记录的列表上下文 |
| 首页与路线图 | 各自保存来源；路线图列的已加载数量与位置独立保留 |
| 复制链接、新标签页、直接访问、刷新详情 URL | 继续服务端渲染独立详情页；无需伪造一个不存在的列表背景。刷新不承诺恢复之前内存中的抽屉上下文 |
| `#comment-id` | 抽屉和独立页均保留评论定位；等评论真实加载后再滚动/判断无效锚点，避免加载中提前清除有效 hash |

沿用并修订 `use-post-overlay.ts`，合并已有 history.state 字段，使用清楚的抽屉归属标记。不要只根据 pathname 推断条目来源，也不要通过固定超时恢复滚动。来源 DOM 稳定后恢复位置；记录已被移除时将焦点落到相邻记录或列表标题。新建弹窗自己的 `modalOpen` 历史条目不得被覆盖。

### 5.3 焦点、嵌套浮层和输入保护

- 抽屉/弹窗提供 `role=dialog`、正确 accessible name 和适当 aria-modal；移除原 Modal 的错误 aria-disabled 语义。
- 打开后聚焦关闭入口或标题，Tab/Shift+Tab 限制于当前最上层模态内容；覆盖链接、按钮、输入框、textarea、select、contenteditable 及有效 tabindex，不能照搬源预览面板仅面向文件操作的有限选择器。
- 页面根节点与浮层 Portal 分离，背景 inert；Toast 的播报仍可用。关闭后恢复原触发点。
- 只有最上层处理 Esc：先关闭编辑器菜单/选择列表，其次状态/删除/登录弹窗，最后详情抽屉；输入法组合期间不误触关闭。
- 共用模态的滚动锁和恢复采用成对注册/注销，内层关闭不得解锁仍打开的外层，组件卸载不得残留锁、监听器或 inert。已有 canClose/提交中保护继续生效。
- 区分“服务端数据已变更”和“尚未保存的编辑草稿”，不得复用当前 `isPostDirty` 一个标记表达两件事。
- 记录标题/正文有未保存更改时，关闭、返回或离开均需提供保留编辑/放弃更改的选择；取消离开后内容、附件和焦点保持。权限失效、登出等安全边界不因草稿确认而继续显示受保护内容。
- 新记录与评论继续使用现有缓存机制，关闭抽屉不清空原评论草稿；不借本次 UI 改造新建草稿后端或长期持久化策略。

### 5.4 读取、更新与错误

- PostDetails 的抽屉加载按 postNumber 建立独立生命周期；关闭或切换时取消/忽略旧请求。重置上一条记录的内容、编辑态和错误，不能把 A 的正文或关注状态显示在 B 上。
- 使用现有 actions/http 结果规范区分未登录、无权访问、不存在、网络失败和成功。失败显示可理解提示及适用的重试/登录入口，不永久停在 Loading。
- 增加可选的变更/删除结果回调，使 CommentInput、ShowComment、ResponseModal、DeletePostModal 及审核按钮在抽屉内刷新当前记录/评论，不整页 reload 或强制 goHome。独立页保留完整可用的行为。
- 成功编辑、评论、状态或标签变化后，按原查询条件和已加载数量同步背景列表/路线图。若记录已不符合当前筛选或已删除，应从来源结果移除；若排序依赖评论数，更新后重新按当前条件排列。恢复位置优先按记录锚点而非盲目沿用旧像素。
- 删除成功时关闭抽屉并更新来源；权限、删除确认和服务端校验维持原语义。失败保留输入并展示错误。
- 关注/取消、反应、附件和重复关联沿用现有 API，通知范围不变。保留独立详情的 SSR 初始数据，避免引入水合差异；新增浮层不能在服务端渲染阶段直接访问 document/window。

## 6. 新建弹窗和全站一致性

新建继续使用 ShareFeedback：保留正文输入、自动标题及手动标题优先、相似记录、附件上限、标签配置、登录后提交和现有草稿。顶部入口改成标准 JT 主按钮；桌面采用能容纳编辑器的有界弹窗，窄屏可全屏。尺寸按记录内容需要适配，表单与操作区采用来源 16px 分组间距、44px 表单控件和对应按钮状态，不照搬仅含名称字段的 440px 案件弹窗宽度。

不改业务校验、提交成功后的独立详情链接、登录验证码或后台设置。提交中禁用重复提交，失败留住草稿；共享 Modal 的历史与焦点处理对新建、登录和管理弹窗同时验证。

页面覆盖清单：

| 页面组 | 要检查的 UI 与行为 |
| --- | --- |
| Home / Roadmap / ShowPost | 列表、详情抽屉、独立详情、状态/标签/关注、评论和嵌套弹窗 |
| SignIn / SignUp / CompleteSignInProfile / PendingActivation | 邮箱/验证码、禁用/错误/加载、输入聚焦、主题；不改认证政策 |
| MySettings / MyNotifications | 表单、开关、头像上传、通知列表及状态，保持原存储和权限 |
| Administration | 通用侧菜单、标题/表单、成员/标签/邀请/导出/认证/隐私/高级设置、Webhook 的菜单/提示/确认；不改功能或发出外部请求 |
| Error / Legal / DesignSystem | 错误/无权限/空态和长文本可读性；组件展示页覆盖完整状态 |

## 7. 文件与实施顺序

| 顺序 | 改动组 | 主要入口与完成条件 |
| --- | --- | --- |
| 1 | 来源与组件清单 | 同步适用 UI 约定，固定来源基线，列出当前所有共享控件和第三方皮肤；保存合成内容的前后对比 |
| 2 | 主题与共享控件 | `public/assets/styles/`、`common/`、`common/form/`、Header/ThemeSwitcher/状态与图标；先在已有 /_design 核对深浅色和状态 |
| 3 | 模态基础与抽屉外壳 | `Modal.tsx/.scss` 与新的轻量详情抽屉包装；完成语义、焦点、嵌套层级及滚动锁 |
| 4 | 首页与路线图接入 | Home、PostsContainer、ListPosts、PostFilter、PostsSort、Roadmap、`use-post-overlay.ts`；先闭合 URL 与列表恢复行为 |
| 5 | 详情内操作适配 | PostDetails、CommentInput、ShowComment、ResponseModal、DeletePostModal 等；局部更新、错误、请求过期及未保存输入保护 |
| 6 | 新建和全站收口 | ShareFeedback、独立详情、登录/设置/管理/通知/错误页面；翻译采用现有 Lingui 机制 |
| 7 | 验证与交付记录 | 有针对性的自动回归、真实隔离浏览器检查、对照组件状态清单；更新 Issue 与验证文档 |

复用 Fider 当前组件导出和既有依赖；只有 Modal/Drawer 共用层级管理这类实际跨组件需要才增加小型 helper。没有 UI 框架迁移、后端改写或新建设计系统服务。代码中 CSS 沿用 BEM 和已有工具类。

## 8. 验证与验收

### 8.1 环境

- 后续实现使用本任务独立开发环境：`http://jt-idea-notes.localhost:4181/`，邮件仅进入 `http://127.0.0.1:18026/`；运行前核对实际连接与数据隔离，不混用 4180 的 8026 邮箱。
- 4180 为已交付日常试用实例，数据库/密钥/邮件数据不用于自动化写测试；本轮实施不更新它。后续更新 4180 按当次明确授权执行，保留既有备份和快速打包方式，避免重新无条件下载基础镜像。
- 案件平台仅作只读设计来源。需要画面对照时使用组件或合成内容，不复制案件材料、账号、密钥、截图中的真实业务信息。

### 8.2 自动检查

不为颜色常量、CSS 类名或简单圆角写复述实现的测试。自动回归聚焦行为：

1. usePostOverlay：来源筛选/limit/hash、关闭与 Back/Forward、深链接、来源条目归属、原生修饰键点击、定位与焦点回退。
2. Modal/Drawer：最上层 Esc、Tab 环绕、嵌套弹窗、关闭禁用、输入法组合、卸载后滚动锁与监听器清理。
3. PostDetails：A 的延迟响应不覆盖 B、HTTP 错误不伪装数据、评论锚点、登录过期、提交成功局部更新及失败保留输入。
4. 抽屉内评论/状态/删除：不意外整页 reload，当前查询与已加载数量保留；记录不再符合筛选时正确移除；未保存编辑的取消离开保持内容。
5. 保留此前投票退休和 URL 兼容回归，防止在改 ListPosts/PostsContainer 时恢复退休字段或改变默认查询范围。

按 Makefile 执行适用 lint、test、build；全局组件改变至少跑完整前端 Jest、前端 lint、SSR/生产 UI 构建并核对相关服务端页面测试。若没有后端变更，不为纯样式重复扩大全部数据库测试；有行为/服务端改动则补做对应检查。最后执行 `git diff --check`。

已有验证记录报告裸 tsc 的第三方声明错误、部分既有 Go lint 提示，详见 [此前验证记录](./remove-voting-verification.md)。这是历史基线，不是本次豁免；实施时记录实际检查结果，区分新旧问题，不关闭检查或削弱断言。

### 8.3 实际页面验收

| 类别 | 必须观察的结果 |
| --- | --- |
| 视觉对应 | 深浅主题逐项对照案件平台：按钮、表单、菜单、状态、弹窗、列表、提示和图标，不只验证首页主色 |
| 分辨率/可读性 | 1440px、常见笔记本宽度、约 768px 嵌入面板、390px 窄屏及放大文字；中英文、长标题/链接、多标签、长正文、多图，无横向溢出或操作遮挡 |
| 列表/工具栏 | 默认与查询/筛选/分页一致，空态/无结果/失败有区别，紧凑列表和长内容截断自然 |
| 抽屉导航 | 键盘/鼠标打开、X/遮罩/Esc 关闭、Back/Forward、多次往返；关闭后原查询、滚动和焦点正确 |
| 独立访问 | 复制、直接访问、刷新、评论锚点和新标签页正常，SSR 与客户端首屏一致 |
| 真实操作 | 在合成记录中创建/编辑文字和图片、评论/回应、状态、标签、重复关联、删除、关注；未保存/失败场景不丢输入 |
| 嵌套和资源 | 抽屉内菜单/登录/状态/删除弹窗正确分层，最上层关闭后焦点返回；最终页面恢复滚动，无残留透明遮罩 |
| 角色/安全 | 私有空间未登录不泄露记录；普通用户与管理员操作权限不因新 UI 改变；评论/关注通知接收规则保留 |
| 网络与浏览器 | 慢响应、失败、快速关闭重开没有旧记录闪回、永久 Loading 或页面 JS 错误；仍无投票接口请求 |

实际完成情况见 [验证记录](./jt-ui-refresh-verification.md)，包含组件对应表、截图/日志位置、检查结果与验证边界；以上是验收标准，未穷举场景不因列入标准而视为已通过。

## 9. 当前交付状态

Issue #3 与本方案先行完成，随后按用户“按照方案开始实施”执行。主题与共享 UI、紧凑首页、右侧抽屉、导航恢复、详情内操作和新建表单均已落地，并完成自动检查及隔离浏览器验证。

实现工作位于 `codex/jt-ui-refresh`，开发预览为 4181。具体通过项、既有类型声明错误和外部功能验证边界见 [验证记录](./jt-ui-refresh-verification.md)。用户随后授权交付 main 并更新 4180；实际合并与部署结果记录在关联 Issue，保留开发环境与试用环境隔离。
