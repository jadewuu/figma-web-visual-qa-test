import { afterEach, describe, expect, it } from "vitest";
import { decideStatus, renderMarkdown } from "../src/report.js";

afterEach(() => {
  delete process.env.QA_REPORT_BASE_URL;
});

describe("报告分流", () => {
  it("P0 使运行失败，P1 保持成功", () => {
    expect(decideStatus([
      { id: 1, severity: "P0", source: "visual", location: "标题", description: "文本遮挡" },
    ])).toBe("failed");
    expect(decideStatus([
      { id: 1, severity: "P1", source: "token", location: "MR diff", description: "硬编码颜色" },
    ])).toBe("success");
  });

  it("报告包含问题统计和 GitHub Artifact 相对链接", () => {
    const markdown = renderMarkdown("orders-list", "success", []);
    expect(markdown).toContain("P0: 0 项 | P1: 0 项 | P2: 0 项");
    expect(markdown).toContain("[查看完整报告](report.html)");
  });

  it("发布报告地址可用时，PR 评论使用可访问的图片链接", () => {
    process.env.QA_REPORT_BASE_URL = "https://github.com/example/repo/raw/refs/heads/qa-reports/pr-7/sha";

    const markdown = renderMarkdown("orders-list", "success", []);

    expect(markdown).toContain('<img src="https://github.com/example/repo/raw/refs/heads/qa-reports/pr-7/sha/design.png"');
    expect(markdown).toContain("https://github.com/example/repo/raw/refs/heads/qa-reports/pr-7/sha/report.html");
  });
});
