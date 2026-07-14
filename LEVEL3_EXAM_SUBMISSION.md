# Level 3 Agent 申报内容（可直接提交）

## Agent 名称

Figma Design System & Web Visual QA Agent

## 解决的问题

前端页面在 Pull Request 中容易出现设计稿还原偏差，也可能新增未纳入设计系统的颜色、间距和圆角。人工需要反复从 Figma、预览环境和代码 Diff 中取数、截图、比对和回写结论，效率低且标准不稳定。

## 复用的 Level 2 Skill

复用 `ui-visual-qa.skill` 的核心 AI 能力：将 Figma 设计截图与 Web 实现截图进行视觉比对，忽略文案、数字和照片内容差异，重点识别布局、尺寸、间距、颜色、字体、圆角、边框、阴影、对齐和图标风格问题，并输出 P0/P1/P2 与标注图。

Level 3 没有替代该视觉能力；在它之外新增了 Figma Variables 与 Git Diff 的设计 Token 检查，作为代码层补充。

## 自动化触发与流程

触发条件：GitHub Actions 的 `pull_request` 事件（创建、更新、重新打开 PR）。

1. 自动读取 `qa-targets.yml`，从 Figma API 导出指定 Frame 的设计图，并读取 Figma Variables（或本地 design-tokens.json）。
2. 自动读取当前 GitHub PR Diff，检查新增代码中未匹配设计 Token 的硬编码颜色和间距。
3. 自动打开 Preview URL，等待 `readinessSelector` 可见后用 Playwright 截取 Web 实现图。
4. 调用 `qwen3-vl-235b-a22b-thinking`，比较设计图和实现图，输出带实现截图像素坐标的视觉问题。
5. 自动生成 `annotated.png`、HTML/Markdown 报告、`findings.json` 与 `run-log.json`，发布 GitHub PR 评论，并上传为 GitHub Artifact。

## 模型与输入输出

- 模型：`qwen3-vl-235b-a22b-thinking`。
- 输入：Figma Frame PNG、Web Preview PNG、Figma Variables/本地 Token、GitHub PR Diff。
- 模型输出：仅解析最终 `content` 中的 JSON；不保存或解析 `reasoning_content`。
- 输出位置：GitHub PR 评论和 `artifacts/ui-visual-qa/`。

## 分支与异常处理

- 发现 P0：QA Job 失败，阻止合并并在 PR 评论标明问题。
- 仅 P1/P2 或无问题：QA Job 成功，仍附报告供人工复核。
- Figma、Preview、模型或网络异常：每个外部步骤最多重试 3 次；仍失败时写入 `needs-human-review`、保留完整日志和可下载 Artifact。
- GitHub PR 评论发布失败：不丢弃本地报告或日志，最终仍返回 `needs-human-review`。

## 考试展示证据

1. `.github/workflows/ui-visual-qa.yml`：PR 自动触发规则、最小权限与 Artifact `if: always()`。
2. `qa-targets.yml`：Figma Frame、Preview URL、选择器、Token 源和源代码范围。
3. GitHub Actions Job 日志：`fetch_figma`、`code_token_qa`、`capture_web`、`visual_qa`、`publish`。
4. GitHub PR 自动评论：严重度统计、设计图与标注后的实现图、问题表。
5. Artifact：`report.html`、`annotated.png`、`findings.json`、`run-log.json`。
