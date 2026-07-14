import type { RunLog } from "./log.js";

export async function withRetry<T>(
  step: string,
  log: RunLog,
  operation: () => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await operation();
      log.add(step, "success", attempt, "completed");
      return result;
    } catch (error) {
      lastError = error;
      log.add(
        step,
        "failed",
        attempt,
        error instanceof Error ? error.message : "unknown error"
      );
    }
  }

  throw lastError;
}
