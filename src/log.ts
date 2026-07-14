import type { StepLog } from "./types.js";

export class RunLog {
  readonly entries: StepLog[] = [];

  add(
    step: string,
    status: StepLog["status"],
    attempt: number,
    message: string
  ): void {
    this.entries.push({
      step,
      status,
      attempt,
      message,
      timestamp: new Date().toISOString()
    });
  }
}
