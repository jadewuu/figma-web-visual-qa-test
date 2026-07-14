import { describe, expect, it } from "vitest";
import { RunLog } from "../src/log.js";
import { withRetry } from "../src/retry.js";
import { scanChangedSource } from "../src/token-qa.js";

describe("scanChangedSource", () => {
  it("报告新增的非设计 Token 颜色和间距", () => {
    const findings = scanChangedSource(
      "+ .card { color: #ff00ff; margin: 13px; border-radius: var(--radius-md); }",
      {
        "color.brand-primary": "#1677ff",
        "spacing.16": "16px",
        "radius.md": "8px"
      }
    );

    expect(findings.map((finding) => finding.description)).toEqual([
      "新增硬编码颜色 #ff00ff，未匹配设计 Token",
      "新增硬编码间距 13px，未匹配设计 Token"
    ]);
  });

  it("忽略未改变行和已使用 CSS 变量的值", () => {
    expect(scanChangedSource(
      "  color: #ff00ff;\n+ .card { margin: var(--spacing-16); }",
      {}
    )).toEqual([]);
  });
});

describe("withRetry", () => {
  it("第三次成功时返回结果并保留每次日志", async () => {
    let attempts = 0;
    const log = new RunLog();

    const result = await withRetry("fetch_figma", log, async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("temporary failure");
      }
      return "done";
    });

    expect(result).toBe("done");
    expect(log.entries.map((entry) => entry.status)).toEqual(["failed", "failed", "success"]);
    expect(log.entries.map((entry) => entry.attempt)).toEqual([1, 2, 3]);
  });
});
