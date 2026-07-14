import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QaTarget } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  exportFigmaFrame: vi.fn(),
  postPullRequestComment: vi.fn(),
}));

vi.mock("../src/figma.js", () => ({
  exportFigmaFrame: mocks.exportFigmaFrame,
  loadDesignTokens: vi.fn(),
}));
vi.mock("../src/github.js", () => ({
  postPullRequestComment: mocks.postPullRequestComment,
}));

import { runQa } from "../src/runner.js";

const target: QaTarget = {
  id: "orders-list",
  figma: { fileKey: "abc123", nodeId: "10:20" },
  previewUrl: "https://preview.example.test/orders",
  viewport: { width: 1440, height: 1024 },
  readinessSelector: "[data-qa-ready='orders-list']",
  tokenSource: { kind: "file", path: "tests/fixtures/design-tokens.json" },
  sourceGlobs: ["src/**/*.css"],
};

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.QA_DEFER_PR_COMMENT;
});

describe("runQa", () => {
  it("获取输入失败且 PR 评论发布失败时，仍输出 needs-human-review 与运行日志", async () => {
    mocks.exportFigmaFrame.mockRejectedValue(new Error("Figma image request failed: 401"));
    mocks.postPullRequestComment.mockRejectedValue(new Error("GitHub PR comment failed: 503"));
    const outputDir = await mkdtemp(join(tmpdir(), "qa-runner-"));

    await expect(runQa(target, outputDir)).resolves.toMatchObject({
      status: "needs-human-review",
      findings: [],
    });

    expect(JSON.parse(await readFile(join(outputDir, "run-log.json"), "utf8")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "runner", status: "failed" }),
      ]));
    expect(mocks.postPullRequestComment).toHaveBeenCalledOnce();
    await rm(outputDir, { recursive: true, force: true });
  });

  it("工作流延后发布时，不由 Runner 提前发布 PR 评论", async () => {
    process.env.QA_DEFER_PR_COMMENT = "true";
    mocks.exportFigmaFrame.mockRejectedValue(new Error("Figma image request failed: 401"));
    const outputDir = await mkdtemp(join(tmpdir(), "qa-runner-"));

    await runQa(target, outputDir);

    expect(mocks.postPullRequestComment).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(join(outputDir, "run-log.json"), "utf8")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "publish", status: "skipped" }),
      ]));
    await rm(outputDir, { recursive: true, force: true });
  });
});
