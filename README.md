# JT Idea Notes · JT 需求工作台

面向团队内部的想法与需求记录工具，用于集中记录想法、需求、Bug 和优化建议，并跟踪处理进度。以电脑端使用为主，记录优先，状态用于说明进展。

项目基于 [Fider](https://github.com/getfider/fider) Fork 后独立维护，沿用 Go、React、TypeScript、SCSS 和 PostgreSQL 技术栈。

## 主要功能

- **记录与讨论**：发布想法、编辑内容、评论、上传图片与附件，通过搜索、筛选和分页查找记录。
- **进度跟踪**：按计划中、进行中、已完成查看记录，在详情抽屉中查看内容与更新状态。
- **团队账号**：管理员创建账号、设置角色、重置密码和启停账号；使用固定用户名登录，首次登录须修改临时密码。
- **个人设置**：修改昵称、头像和密码，管理站内通知偏好。
- **统一工作区**：左侧导航、顶部路径栏、紧凑列表与右侧详情抽屉，支持浅色和深色主题。

当前版本采用内部账号直接发布，已移除投票、内容审批和邮件功能；不提供公开注册、邮箱登录、OAuth 或 API Key 认证。

## 本地开发

依赖版本以 [go.mod](go.mod)、[.nvmrc](.nvmrc) 和 [package.json](package.json) 为准；开发、检查与构建命令见 [Makefile](Makefile)。

1. 安装对应版本的 Go、Node.js、npm 和 PostgreSQL，安装 Makefile 使用的 `godotenv`、`air`、`golangci-lint` 等工具。
2. 安装前端依赖：`npm ci`。
3. 参考 [.example.env](.example.env) 创建本地 `.env`，配置独立数据库、访问地址和密钥。仓库的 [docker-compose.yml](docker-compose.yml) 是开发依赖示例；与其他实例并行运行时须隔离容器名、数据卷和端口。
4. 按[账号密码登录运维说明](docs/admin-password-login-operations.md)完成数据库迁移与管理员初始化；全新空库使用 `account bootstrap`，既有站点按文档处理。
5. 使用 `make watch` 启动开发环境；生产构建使用 `make build`。

本项目约定开发预览端口为 **4184**，本地验收端口为 **4180**，实际地址由对应环境配置决定。开发、验收与云端环境各自独立，数据不自动同步。

## 验证与协作

- 代码检查：`make lint`；单元测试：`make test`；构建：`make build`。
- 运行后端测试前，先确认 `.test.env` 指向可丢弃的隔离测试库；测试会执行迁移和写入测试数据。
- 仅文档修改检查内容、相对链接及 `git diff --check`。
- 协作范围与流程见 [AGENTS.md](AGENTS.md)，代码约定见 [GUIDELINES.md](GUIDELINES.md)，前端设计参考见 [设计说明](docs/frontend-design-references.md)，历史变更见 [CHANGELOG.md](CHANGELOG.md)。

本 Fork 的问题与建议请提交到[本仓库 Issues](https://github.com/0xHanniba1/jt_idea_notes/issues)。仓库保留的部分上游文档属于 Fider 原版说明，当前项目边界以本 README 和 AGENTS.md 为准；功能验证与部署状态以对应记录为准。

## 来源与许可证

感谢 [Fider](https://github.com/getfider/fider) 及其贡献者提供基础。本项目沿用 [GNU AGPL v3.0](LICENSE) 许可证。
