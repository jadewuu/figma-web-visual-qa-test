# GitHub 个人测试帐号配置

## 1. 创建测试仓库

1. 在 GitHub 创建私有仓库，例如 `figma-web-visual-qa-test`。
2. 将本目录内容放到该仓库根目录并推送到 `main`；`.github/workflows/ui-visual-qa.yml` 必须一并提交。
3. 把 Agent 放在需要验收的 Web 项目中，或确保 `qa-targets.yml` 的 `previewUrl` 是 GitHub-hosted runner 可访问的公开地址。`localhost`、公司内网和仅本机可访问的地址不能用于 GitHub-hosted runner。

## 2. 启用 Actions 与配置权限

在仓库 **Settings > Actions > General**：

1. 确认允许 GitHub Actions 运行。
2. 保持工作流文件中的最小权限：`contents: read` 与 `pull-requests: write`。
3. 如果 PR 评论返回 403，在同页的 **Workflow permissions** 选择 **Read and write permissions** 并保存。

不需要创建 GitHub Personal Access Token。工作流运行时会自动获得 `GITHUB_TOKEN`。

## 3. 添加 Secrets 与 Variable

进入 **Settings > Secrets and variables > Actions**：

| 类型 | 名称 | 值 |
|---|---|---|
| Repository secret | `FIGMA_ACCESS_TOKEN` | 有权读取目标文件的 Figma token；Variables API 仅 Enterprise 可用，个人账号会自动回退到 Frame 颜色提取 |
| Repository secret | `DASHSCOPE_API_KEY` | 阿里云百炼 API Key |
| Repository variable | `QA_TARGET` | `qa-targets.yml` 中目标的 `id`，例如 `orders-list` |

不要手工创建 `GITHUB_TOKEN` Secret；GitHub 自动注入它。

## 4. 添加验收目标配置

复制 `qa-targets.example.yml` 为 `qa-targets.yml`，填入真实值并提交该文件：

```yaml
targets:
  - id: orders-list
    figma: { fileKey: "真实 Figma file key", nodeId: "真实 Frame node ID" }
    previewUrl: "https://可公开访问的-preview.example.com/orders"
    viewport: { width: 1440, height: 1024, deviceScaleFactor: 1 }
    readinessSelector: "[data-qa-ready='orders-list']"
    tokenSource: { kind: figma }
    sourceGlobs: ["src/**/*.css", "src/**/*.tsx", "src/**/*.vue"]
```

`readinessSelector` 对应页面加载完成后可见的稳定元素；建议在真实页面加入 `data-qa-ready` 属性。

## 5. 创建考试演示 PR

1. 从 `main` 新建同仓分支：`test/visual-qa`。
2. 修改目标页面一个可控的样式或组件后推送分支。
3. 在 GitHub 创建从 `test/visual-qa` 到 `main` 的 Pull Request；不要从 fork 创建。
4. 在 PR 的 **Checks** 或仓库 **Actions** 中打开 `UI Visual QA` 运行记录。
5. 在 PR 的 **Conversation** 查看自动 QA 评论；在运行页下载 `ui-visual-qa` Artifact。

## 6. 考试截图

1. `.github/workflows/ui-visual-qa.yml`：`pull_request`、权限和 `upload-artifact`。
2. Actions Job 日志：`fetch_figma`、`code_token_qa`、`capture_web`、`visual_qa`、`publish`。
3. PR Conversation：自动评论。
4. Artifact：`report.html`、`annotated.png`、`findings.json` 和 `run-log.json`。
