import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readMergeRequestDiff(sourceGlobs: string[] = ["src"]): Promise<string> {
  const base = process.env.GITHUB_BASE_SHA;
  const head = process.env.GITHUB_SHA;

  if (!base || !head) {
    throw new Error("GitHub PR diff variables are required");
  }

  const { stdout } = await execFileAsync("git", [
    "diff",
    "--unified=0",
    base,
    head,
    "--",
    ...sourceGlobs
  ]);

  return stdout;
}
