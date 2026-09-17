# 发布流程验证

2026-09-17；Issue #20。

- 发布来源限制为本仓库main push完成的成功build；不接受PR、fork、stable、release。移除上游Docker Hub凭据引用和手动PR发布工作流。
- build产物标记完整提交和仓库地址，E2E与发布复用同一份amd64镜像。发布不checkout应用源码、不重新构建，不连接云端。
- GHCR使用任务内GITHUB_TOKEN，最小权限为actions:read、contents:read、packages:write；未创建个人令牌、云端凭据或更改包可见性。
- `python3 -m unittest discover -s scripts -p 'test_release_plan.py' -v`：7项通过，覆盖有效凭据、PR/fork/分支/失败运行拒绝、提交和digest篡改、main向前推进时固定版本、无凭据拒绝和ZIP路径拒绝。
- actionlint v1.7.12检查修改后的build/publish工作流通过，`git diff --check`通过。
- 只读工具真实查询当前main提交94ef5510的GitHub证据，因尚无新格式发布凭据按预期拒绝生成发布计划；未连接服务器、未操作数据库。
- 独立只读复核未发现阻塞问题。登录、账户及业务代码未变更；相关Python和workflow检查已纳入CI。

当前状态：实现已完成，PR检查、合并及首个GHCR实际推送结果记录在Issue #20。新workflow仅合并到main后生效；配置文件和静态检查不能证明实际镜像已发布。首次GHCR拉取及服务器网络访问需分别验证，本次未修改4180或云端运行状态，云端部署仍需用户独立明确指令。
