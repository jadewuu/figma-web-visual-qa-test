# Level 3 提交与演示清单

## 提交前准备

- [ ] 申报表填写：使用 [`LEVEL3_EXAM_SUBMISSION.md`](../LEVEL3_EXAM_SUBMISSION.md) 的内容。
- [ ] 附上 `ui-visual-qa.skill`，证明 Level 3 复用了既有 Level 2 Skill。
- [ ] 附上 GitHub 仓库与成功 Run 链接。

## 必须截图的 4 张证据

1. **自动触发配置**
   - 打开 `.github/workflows/ui-visual-qa.yml`。
   - 截取 `pull_request`、`QA_TARGET`、`npm run qa` 和 `upload-artifact` 四处内容。

2. **成功运行日志**
   - 打开 [成功 Run](https://github.com/jadewuu/figma-web-visual-qa-test/actions/runs/29358255679)。
   - 截图 `ui-visual-qa` Job，确保 `npm run qa` 与 `upload-artifact` 都显示绿色成功。
   - 在 Artifact 的 `run-log.json` 中补截一张，展示 `fetch_figma`、`capture_web`、`visual_qa`、`publish` 的 `success` 和时间戳。

3. **最终自动落地**
   - 打开 [PR #1 的 Conversation](https://github.com/jadewuu/figma-web-visual-qa-test/pull/1)。
   - 截取 `github-actions` 自动发布的“UI 验收报告”评论和 P1 问题表。

4. **可视化 QA 结果**
   - 在成功 Run 下载 `ui-visual-qa` Artifact。
   - 打开并截图 `report.html` 或 `annotated.png`，展示设计图、标注后的实现图和问题位置。

## 现场演示顺序（2 分钟）

1. 展示 PR 的一个变更，说明 PR 事件会自动触发。
2. 打开 Actions 成功 Run，说明 Agent 自动获取 Figma、网页截图、代码 Diff。
3. 展示 Artifact 的 `run-log.json`，指出 AI 视觉 QA 和发布步骤均自动成功。
4. 回到 PR 评论，展示 Agent 自动写回的 P1 问题和标注图。
5. 总结：Level 2 负责视觉判断；Level 3 增加自动触发、数据获取、判断分支、异常降级和自动落地。

## 不要提交或展示

- 不要截图或导出 `DASHSCOPE_API_KEY`、`FIGMA_ACCESS_TOKEN`、`GITHUB_TOKEN`。
- 不要将 Secrets 的值写入申报表、仓库、Artifact 或演示文档。
- 不要说“已读取 Figma Variables”。本次个人账号实际走的是 Frame 颜色自动回退；应如实表述为“自动设计 Token 基线”。
