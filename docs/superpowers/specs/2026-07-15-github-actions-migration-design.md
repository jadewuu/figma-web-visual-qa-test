# GitHub Actions 迁移设计

## 目标

将 Figma Design System & Web Visual QA Agent 从 GitLab 完整迁移到 GitHub，供个人 GitHub 测试帐号在同一仓库内创建 Pull Request 后自动运行。

## 范围

- 删除 GitLab Pipeline、MR Note 客户端和 GitLab 专属环境变量。
- 新增 GitHub Actions 工作流，仅在 `pull_request` 事件触发。
- 使用 GitHub 自动注入的 `GITHUB_TOKEN` 创建 Pull Request 评论。
- 使用 GitHub Actions 提供的 base/head SHA 读取当前 PR Diff。
- 保留 Figma 导出、Playwright 截图、Qwen 视觉 QA、Figma Variables 和代码 Token QA 的行为不变。
- 保留 `artifacts/ui-visual-qa/` 中的报告、标注图、问题 JSON 与运行日志。

## 架构与数据流

1. 同一仓库内的分支创建或更新 PR，GitHub Actions 的 `pull_request` 触发工作流。
2. 工作流注入 `GITHUB_BASE_SHA`、`GITHUB_SHA`、仓库名和 PR 编号；`diff.ts` 用这些 SHA 读取变更。
3. Agent 运行既有 Figma、Web 截图、Qwen 与 Token QA 流程，生成报告和日志。
4. `github.ts` 使用 `GITHUB_TOKEN` 调用 GitHub Issues Comments API，在 PR 线程创建 QA 报告评论。
5. `actions/upload-artifact` 无论成功、P0 失败或异常均上传 Artifact。

## 认证与权限

- `FIGMA_ACCESS_TOKEN`、`DASHSCOPE_API_KEY`、`QA_TARGET` 配置为 Repository Secrets/Variables。
- 不需要 GitHub Personal Access Token：工作流使用自动生成的 `GITHUB_TOKEN`。
- 工作流显式声明 `contents: read` 和 `pull-requests: write`，以读取代码并写入 PR 评论。
- 个人测试必须从同一仓库分支创建 PR；来自 fork 的 PR 不注入 Secrets，因此无法安全调用 Figma 或 Qwen。

## 异常与验证

- Figma、截图和 Qwen 步骤保持最多 3 次重试；失败后输出 `needs-human-review` 与运行日志。
- GitHub 评论失败不得吞掉 Artifact 或日志。
- P0 仍令 CLI 以非零状态结束；P1/P2 保持成功。
- 新增或改造单元测试：GitHub 评论缺少环境变量时跳过、API 失败时抛出；编排器评论失败时仍写日志。

## 非目标

- 不支持 GitLab 与 GitHub 双平台并行。
- 不实现 fork PR 的 Secrets 绕过方案。
- 不自动创建 GitHub 仓库、推送代码或写入用户帐号。
