import { loadConfig } from "./config.js";
import { runQa } from "./runner.js";

const targetId = process.argv[2] ?? process.env.QA_TARGET;
if (!targetId) {
  throw new Error("QA target id is required as argv[2] or QA_TARGET");
}

const target = await loadConfig(process.env.QA_CONFIG ?? "qa-targets.yml", targetId);
const result = await runQa(target, process.env.QA_OUTPUT_DIR ?? "artifacts/ui-visual-qa");
process.exitCode = result.status === "success" ? 0 : 1;
