# GitHub Actions Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 UI QA Agent 从 GitLab Merge Request 自动化迁移为 GitHub Pull Request 自动化。

**Architecture:** 保留 Agent 的 Figma、截图、Qwen 与 Token QA 流程。GitHub Actions 在 PR 事件中提供 base/head SHA 和仓库上下文，`github.ts` 使用自动注入的 `GITHUB_TOKEN` 创建 PR 评论，报告仍通过 GitHub Artifact 保存。

**Tech Stack:** Node.js、TypeScript、Vitest、GitHub Actions、GitHub REST API、Playwright、Qwen OpenAI-compatible API。

## Global Constraints

- 仅支持 GitHub；删除 GitLab CI、GitLab API 客户端和 GitLab 专属环境变量。
- GitHub Actions 使用内置 `GITHUB_TOKEN`，并声明 `contents: read`、`pull-requests: write`。
- 只在同一仓库的 `pull_request` 运行；不支持 fork PR Secrets。
- 视觉 QA 仍必须调用 `qwen3-vl-235b-a22b-thinking`；Token QA 只作补充。
- 当前目录不是 Git 仓库；不执行 commit、push 或删除工作区。

---

### Task 1: 迁移 PR 评论客户端与测试

**Files:**
- Create: `src/github.ts`
- Create: `tests/github.test.ts`
- Modify: `src/runner.ts`
- Modify: `tests/runner.test.ts`
- Delete: `src/gitlab.ts`
- Delete: `tests/gitlab.test.ts`

**Interfaces:**
- Produces `postPullRequestComment(markdown: string): Promise<void>`。
- 读取 `GITHUB_API_URL`（默认 `https://api.github.com`）、`GITHUB_REPOSITORY`、`GITHUB_PR_NUMBER` 和 `GITHUB_TOKEN`。
- 只要四项中任何一项缺失，函数直接返回；API 非 2xx 时抛出 `GitHub PR comment failed: <status>`。

- [ ] **Step 1: 写出 GitHub 评论失败测试**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { postPullRequestComment } from "../src/github.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_API_URL;
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_PR_NUMBER;
  delete process.env.GITHUB_TOKEN;
});

describe("GitHub PR comment", () => {
  it("缺少 PR 上下文时跳过发布", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await postPullRequestComment("report");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GitHub 拒绝评论时抛出明确状态码", async () => {
    Object.assign(process.env, {
      GITHUB_REPOSITORY: "jade/ui-qa",
      GITHUB_PR_NUMBER: "7",
      GITHUB_TOKEN: "token",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(postPullRequestComment("report")).rejects.toThrow("GitHub PR comment failed: 403");
  });
});
```

- [ ] **Step 2: 验证测试失败**

Run: `npm test -- --run tests/github.test.ts`

Expected: FAIL，提示找不到 `../src/github.js`。

- [ ] **Step 3: 实现 GitHub PR 评论客户端并替换编排器导入**

```ts
// src/github.ts
export async function postPullRequestComment(markdown: string): Promise<void> {
  const api = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const repository = process.env.GITHUB_REPOSITORY;
  const number = process.env.GITHUB_PR_NUMBER;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !number || !token) return;

  const response = await fetch(`${api}/repos/${repository}/issues/${number}/comments`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: markdown }),
  });
  if (!response.ok) throw new Error(`GitHub PR comment failed: ${response.status}`);
}
```

```ts
// src/runner.ts: replace only imports and call sites
import { postPullRequestComment } from "./github.js";
// Replace every postMrNote(markdown) with postPullRequestComment(markdown).
// Change the successful publish log text to: "PR comment published; artifacts staged for GitHub upload".
```

- [ ] **Step 4: 更新编排器异常测试并删除 GitLab 文件**

```ts
// tests/runner.test.ts
vi.mock("../src/github.js", () => ({ postPullRequestComment: mocks.postPullRequestComment }));
// mock name: postPullRequestComment
// rejected error: new Error("GitHub PR comment failed: 503")
```

Run: `rm src/gitlab.ts tests/gitlab.test.ts && npm test -- --run tests/github.test.ts tests/runner.test.ts && npm run build`

Expected: PASS；评论失败时 `runQa` 返回 `needs-human-review` 且写入 `run-log.json`。

### Task 2: 使用 GitHub PR SHA 读取 Diff

**Files:**
- Modify: `src/diff.ts`
- Modify: `tests/figma.test.ts`

**Interfaces:**
- `readMergeRequestDiff(sourceGlobs?: string[]): Promise<string>` 保持函数名以减少变更范围。
- 从 `GITHUB_BASE_SHA` 和 `GITHUB_SHA` 读取 PR Diff；缺失时报 `GitHub PR diff variables are required`。

- [ ] **Step 1: 更新失败断言**

```ts
afterEach(() => {
  delete process.env.GITHUB_BASE_SHA;
  delete process.env.GITHUB_SHA;
});

it("缺少 GitHub PR SHA 时拒绝运行代码 Token QA", async () => {
  await expect(readMergeRequestDiff()).rejects.toThrow("GitHub PR diff variables are required");
});
```

- [ ] **Step 2: 验证失败**

Run: `npm test -- --run tests/figma.test.ts`

Expected: FAIL，因为实现仍读取 GitLab 变量或输出 GitLab 错误。

- [ ] **Step 3: 最小实现**

```ts
export async function readMergeRequestDiff(sourceGlobs: string[] = ["src"]): Promise<string> {
  const base = process.env.GITHUB_BASE_SHA;
  const head = process.env.GITHUB_SHA;
  if (!base || !head) throw new Error("GitHub PR diff variables are required");
  const { stdout } = await execFileAsync("git", ["diff", "--unified=0", base, head, "--", ...sourceGlobs]);
  return stdout;
}
```

- [ ] **Step 4: 验证通过**

Run: `npm test -- --run tests/figma.test.ts && npm run build`

Expected: PASS。

### Task 3: 新增 GitHub Actions 工作流并替换说明

**Files:**
- Create: `.github/workflows/ui-visual-qa.yml`
- Modify: `README.md`
- Modify: `LEVEL3_EXAM_SUBMISSION.md`
- Delete: `.gitlab-ci.yml`

**Interfaces:**
- Workflow 在 `pull_request` 的 `opened`、`synchronize`、`reopened` 事件运行。
- Workflow 设置 `GITHUB_BASE_SHA: ${{ github.event.pull_request.base.sha }}`、`GITHUB_PR_NUMBER: ${{ github.event.pull_request.number }}`。
- Workflow 永远运行 `actions/upload-artifact@v4`，名称为 `ui-visual-qa`。

- [ ] **Step 1: 创建 GitHub Actions 工作流**

```yaml
name: UI Visual QA

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  ui-visual-qa:
    runs-on: ubuntu-latest
    env:
      FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
      DASHSCOPE_API_KEY: ${{ secrets.DASHSCOPE_API_KEY }}
      QA_TARGET: ${{ vars.QA_TARGET }}
      GITHUB_BASE_SHA: ${{ github.event.pull_request.base.sha }}
      GITHUB_PR_NUMBER: ${{ github.event.pull_request.number }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run qa -- "$QA_TARGET"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ui-visual-qa
          path: artifacts/ui-visual-qa/
          if-no-files-found: warn
```

- [ ] **Step 2: 替换文档中的平台、变量与取证文案**

README 必须说明：

```markdown
在 GitHub 仓库 Settings > Secrets and variables > Actions 中添加：
- Secrets：FIGMA_ACCESS_TOKEN、DASHSCOPE_API_KEY。
- Variables：QA_TARGET。
- GITHUB_TOKEN 自动由 Actions 提供，不要手工创建或粘贴。

个人测试：从同一仓库创建 `test/visual-qa` 分支与 PR；fork PR 不会获得 Secrets。
```

申报文本必须将 GitLab MR/Pipeline/Artifact/Note 更换为 GitHub Pull Request/Actions/Artifact/评论，并将 Diff 来源改为 GitHub PR Diff。

- [ ] **Step 3: 删除 GitLab CI 并验证迁移完整性**

Run: `rm .gitlab-ci.yml && npm run build && npm test && rg -n -i 'gitlab|CI_MERGE_REQUEST|GITLAB_TOKEN' . --glob '!node_modules/**' --glob '!package-lock.json'`

Expected: 前两项返回 0；`rg` 返回 1，表示生产代码与说明中不存在 GitLab 专属配置。

### Task 4: 生成个人帐号配置检查表

**Files:**
- Create: `GITHUB_PERSONAL_TEST_SETUP.md`

**Interfaces:**
- 用户可在无 GitHub PAT 的情况下完成仓库、Secrets、Variables、Figma Frame、Preview 与测试 PR 配置。

- [ ] **Step 1: 写入最小配置流程**

```markdown
1. 在 GitHub 创建私有测试仓库，把本目录内容推到 `main`。
2. 在 Settings > Actions > General 选择 “Allow all actions and reusable workflows”，Workflow permissions 选择 “Read and write permissions”。
3. 在 Settings > Secrets and variables > Actions > Secrets 新建 FIGMA_ACCESS_TOKEN 和 DASHSCOPE_API_KEY；在 Variables 新建 QA_TARGET=orders-list。
4. 复制 qa-targets.example.yml 为 qa-targets.yml，填入真实 Frame、Preview 和 readinessSelector，然后提交该非密钥配置文件。
5. 从 main 创建 test/visual-qa 分支，修改一个安全的样式文件并推送，随后在 GitHub 创建同仓 PR。
6. 在 Actions 查看 UI Visual QA；在 PR Conversation 查看自动评论；在 Run Summary 下载 ui-visual-qa Artifact。
```

- [ ] **Step 2: 验证文档与工作流引用一致**

Run: `rg -n 'GITHUB_TOKEN|FIGMA_ACCESS_TOKEN|DASHSCOPE_API_KEY|QA_TARGET|pull_request|upload-artifact' .github/workflows/ui-visual-qa.yml README.md GITHUB_PERSONAL_TEST_SETUP.md`

Expected: 返回 0，且每个必需名称至少出现一次。

## Plan self-review

- Spec coverage: Task 1 覆盖 PR 评论、权限与评论异常；Task 2 覆盖 GitHub PR Diff；Task 3 覆盖触发、Artifact、文档和 GitLab 删除；Task 4 覆盖个人帐号配置。
- Scope: 没有修改 Figma、截图、Qwen 或 Token QA 的业务逻辑。
- Type consistency: `postPullRequestComment(markdown: string)` 只由 `runner.ts` 调用；`readMergeRequestDiff(sourceGlobs?: string[])` 保持原调用接口。
- Repository state: 当前目录不是 Git 仓库，因此所有正常 commit 步骤被明确省略。
