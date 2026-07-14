import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { annotateFindings } from "./annotate.js";
import { capturePreview } from "./capture.js";
import { readMergeRequestDiff } from "./diff.js";
import { exportFigmaFrame, loadDesignTokens } from "./figma.js";
import { postPullRequestComment } from "./github.js";
import { RunLog } from "./log.js";
import { decideStatus, writeReport } from "./report.js";
import { withRetry } from "./retry.js";
import { scanChangedSource } from "./token-qa.js";
import type { Finding, QaTarget, RunStatus } from "./types.js";
import { analyzeVisualQa } from "./visual-qa.js";

export interface QaRunResult {
  status: RunStatus;
  findings: Finding[];
  log: RunLog["entries"];
}

export async function runQa(target: QaTarget, outputDir: string): Promise<QaRunResult> {
  const log = new RunLog();
  await mkdir(outputDir, { recursive: true });

  try {
    const designPath = join(outputDir, "design.png");
    const implementationPath = join(outputDir, "implementation.png");
    await withRetry("fetch_figma", log, () => exportFigmaFrame(target, designPath));
    const tokens = await withRetry("load_tokens", log, () => loadDesignTokens(target));
    const diff = await readMergeRequestDiff(target.sourceGlobs);
    const tokenFindings = scanChangedSource(diff, tokens);
    log.add("code_token_qa", "success", 1, `${tokenFindings.length} findings`);
    await withRetry("capture_web", log, () => capturePreview(target, implementationPath));
    const visualFindings = (await withRetry(
      "visual_qa",
      log,
      () => analyzeVisualQa(designPath, implementationPath),
    )).map((finding, index) => ({ ...finding, id: tokenFindings.length + index + 1 }));
    const findings = [...tokenFindings, ...visualFindings];
    await annotateFindings(implementationPath, visualFindings, join(outputDir, "annotated.png"));
    const status = decideStatus(findings);
    const markdown = await writeReport(outputDir, target.id, status, findings);
    await writeFile(join(outputDir, "findings.json"), JSON.stringify(findings, null, 2));
    if (process.env.QA_DEFER_PR_COMMENT === "true") {
      log.add("publish", "skipped", 1, "PR comment deferred until report images are published");
    } else {
      await postPullRequestComment(markdown);
      log.add("publish", "success", 1, "PR comment published; artifacts staged for GitHub upload");
    }
    await writeFile(join(outputDir, "run-log.json"), JSON.stringify(log.entries, null, 2));
    return { status, findings, log: log.entries };
  } catch (error) {
    log.add("runner", "failed", 1, error instanceof Error ? error.message : "unknown error");
    const markdown = await writeReport(outputDir, target.id, "needs-human-review", []);
    if (process.env.QA_DEFER_PR_COMMENT === "true") {
      log.add("publish", "skipped", 1, "PR comment deferred until report images are published");
    } else {
      try {
        await postPullRequestComment(markdown);
      } catch (noteError) {
        log.add(
          "publish",
          "failed",
          1,
          noteError instanceof Error ? noteError.message : "unknown error",
        );
      }
    }
    await writeFile(join(outputDir, "run-log.json"), JSON.stringify(log.entries, null, 2));
    return { status: "needs-human-review", findings: [], log: log.entries };
  }
}
