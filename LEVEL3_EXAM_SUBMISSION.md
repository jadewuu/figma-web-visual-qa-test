# Level 3 - Craft：Agent 构建申报内容

> 提交时可直接复制本文件对应章节。链接均指向本次真实运行，不含任何密钥。

## 一、基本资料与依赖检查

### Agent 官方名称

**Figma 设计稿与 Web 视觉 QA Agent**

### 依赖的 Level 2 原始 Skill

`ui-visual-qa.skill`（随本仓库提交/上传）。

本 Agent 复用该 Level 2 Skill 的核心能力：将 Figma 设计图与 Web 实现截图交给视觉模型比对，忽略文案、数字、照片内容差异，重点识别布局、尺寸、间距、颜色、字体、圆角、边框、阴影、对齐和图标风格问题，并输出 P0/P1/P2 和标注图。

### Level 2 到 Level 3 的演进

| 维度 | Level 2：手动使用 Skill | Level 3：无人值守 Agent |
|---|---|---|
| 触发方式 | 人工复制 Figma/页面截图后手动运行 | GitHub Pull Request 创建、更新或重新打开时自动触发 |
| 数据取得 | 人工准备两张截图 | Figma API 自动导出指定 Frame；Playwright 自动截取 Preview；自动读取 PR Diff |
| AI 处理 | 手动把图片交给视觉 QA Skill | 自动调用 `qwen3-vl-235b-a22b-thinking`，按 L2 规则返回结构化问题 |
| 输出与分支 | 人工判断并写回 | P0 阻止合并；P1/P2 留下报告供复核；自动评论 PR 并上传 Artifact |

## 二、Agent 架构设计说明

### 自动触发机制（Trigger）

当 GitHub 仓库发生 `pull_request` 的 `opened`、`synchronize` 或 `reopened` 事件时，GitHub Actions 自动启动 `UI Visual QA` 工作流。运行目标由仓库 Variable `QA_TARGET` 指定；本次为 `rewards-self-service-home`。

### 多步骤自主工作流（Workflow）

1. **自动获取设计输入**：读取 `qa-targets.yml`，从 Figma 导出 GreenBite Rewards Landing Page 的 Frame `5:625`。优先读取 Figma Variables；若个人账号受 Variables API 权限限制，则自动从同一 Frame 提取实际颜色作为 Token 基线。
2. **代码层 Token QA**：读取当前 PR 的 Git Diff，检查新增硬编码颜色和间距是否匹配设计 Token/Frame 颜色基线。
3. **自动获取实现输入**：Playwright 打开 `https://jadewuu.github.io/GreenBite/`，等待 `body` 可见后，在 `402 x 874` 视口截取页面。
4. **复用 Level 2 AI 能力**：调用 `qwen3-vl-235b-a22b-thinking` 对比 Figma 图和 Web 图；只解析最终结构化结果，不保存模型推理内容。
5. **判断分支与自动落地**：生成标注截图、HTML/Markdown 报告、问题 JSON、运行日志；自动发布 GitHub PR 评论，并上传 GitHub Artifact。

### 判断分支

- **P0**：工作流失败，阻止合并，并在 PR 评论中列出阻断问题。
- **P1/P2 或无问题**：工作流成功，自动评论报告，供开发者复核。
- **当前真实结果**：发现 1 条 P1，因此工作流成功但保留人工复核项。

### 异常处理与降级机制

- Figma、网页预览、模型或网络请求失败时，每个外部步骤最多重试 3 次。
- 三次仍失败时，输出 `needs-human-review`、保存 `run-log.json`，并仍上传 Artifact。
- PR 评论发布失败时，不丢弃报告与日志，最终状态改为 `needs-human-review`。
- 本次首次运行识别到 Figma Variables API `403`。这是个人账号不能使用该 Enterprise 接口造成的；已实现“优先 Variables，403 时自动提取 Frame 颜色”的降级路径，后续运行成功完成。

## 三、真实运行佐证材料

### 运行入口

- GitHub 仓库：<https://github.com/jadewuu/figma-web-visual-qa-test>
- 演示 PR：<https://github.com/jadewuu/figma-web-visual-qa-test/pull/1>
- 成功的 Actions Run：<https://github.com/jadewuu/figma-web-visual-qa-test/actions/runs/29358255679>

### 成功日志（Step 1 至 Step 4）

该 Run 已成功完成以下记录：

1. `fetch_figma` - success
2. `load_tokens` - success
3. `code_token_qa` - success，0 findings（本演示 PR 只含文档变更）
4. `capture_web` - success
5. `visual_qa` - success
6. `publish` - success，PR comment published; artifacts staged for GitHub upload

### 最终自动落地结果

GitHub Actions 已自动在 PR #1 发布验收报告，并上传 `ui-visual-qa` Artifact。真实识别结果：

- 状态：`success`
- 发现：P0 0 项、P1 1 项、P2 0 项
- P1：`Bottom hint text` 的 “Take less than 30 seconds” 文案颜色相比设计稿偏深。

Artifact 包含：`design.png`、`implementation.png`、`annotated.png`、`report.html`、`report.md`、`findings.json` 与 `run-log.json`。

## 四、提交附件建议

1. 本文件或填写后的申报表。
2. `ui-visual-qa.skill` 原始 Level 2 Skill 文件。
3. `.github/workflows/ui-visual-qa.yml` 的截图或代码片段（展示自动触发和 Artifact 上传）。
4. 成功 Actions Run 的截图（所有 Job Step 为绿色）。
5. PR 自动评论的截图。
6. Artifact 中 `report.html` 或 `annotated.png` 的截图，以及 `run-log.json` 的截图。

> 说明：GreenBite 的前端源码不在此测试仓库；因此本演示中代码 Token QA 流程已真实运行，但 Diff 中没有业务前端改动。视觉 QA、自动评论与产物均针对真实线上页面完成。
