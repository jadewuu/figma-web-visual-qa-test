# Figma Design System & Web Visual QA Agent

用于 GitHub Pull Request 的自动 UI 验收 Agent：从 Figma 获取设计图和 Variables、截取 Web 预览图，调用 `qwen3-vl-235b-a22b-thinking` 进行视觉比对，并检查 PR Diff 中新增的硬编码颜色与间距。

视觉比对是 Level 2 `ui-visual-qa.skill` 的核心能力；代码 Token 检查只是补充，不替代截图 QA。

## GitHub Actions 配置

在仓库的 **Settings > Secrets and variables > Actions** 中创建：

- Repository secrets：`FIGMA_ACCESS_TOKEN`（可读取目标 Figma 文件与 Variables）、`DASHSCOPE_API_KEY`。
- Repository variable：`QA_TARGET`（要运行的目标 ID，例如 `orders-list`）。
- `GITHUB_TOKEN` 由 GitHub Actions 自动提供，用于发布 PR 评论；不要手工创建。

可选环境变量：`QA_CONFIG`（默认 `qa-targets.yml`）和 `QA_OUTPUT_DIR`（默认 `artifacts/ui-visual-qa`）。个人测试必须从同一仓库创建 PR；fork PR 不会获得 Figma/Qwen Secrets。

## 配置目标

复制 `qa-targets.example.yml` 为 `qa-targets.yml`，填写真实 Figma file key、Frame node ID、预览 URL 和页面稳定后的选择器。若 Variables 尚未接入 Figma，可改为本地 JSON：

```yaml
tokenSource:
  kind: file
  path: design-tokens.json
```

## 本地验证

```bash
npm ci
npx playwright install chromium
QA_TARGET=orders-list QA_CONFIG=qa-targets.yml npm run qa -- orders-list
```

结果在 `artifacts/ui-visual-qa/`：`design.png`、`implementation.png`、`annotated.png`、`report.html`、`findings.json` 和 `run-log.json`。

## Level 3 考试取证

1. 截取 `.github/workflows/ui-visual-qa.yml` 中的 `pull_request` 触发规则与 `qa-targets.yml`。
2. 创建同仓 PR，截取 Job 日志中 `fetch_figma`、`code_token_qa`、`capture_web`、`visual_qa`、`publish` 的完成记录。
3. 截取 PR 自动评论与 Artifact 中的 `report.html`、`annotated.png`。
4. 在申报表中说明：P0 令 Job 失败；输入、网络或模型异常会重试 3 次，随后写入 `needs-human-review` 与完整日志。
