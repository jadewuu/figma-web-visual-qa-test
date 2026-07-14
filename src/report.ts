import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding, RunStatus } from "./types.js";

function count(findings: Finding[], severity: Finding["severity"]): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function reportFile(name: string): string {
  const baseUrl = process.env.QA_REPORT_BASE_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/${name}` : name;
}

export function decideStatus(findings: Finding[], forcedReview = false): RunStatus {
  if (forcedReview) return "needs-human-review";
  return findings.some((finding) => finding.severity === "P0") ? "failed" : "success";
}

export function renderMarkdown(
  targetId: string,
  status: RunStatus,
  findings: Finding[],
): string {
  const rows = findings.length === 0
    ? "| - | - | - | 未发现视觉或 Token 问题 |"
    : findings.map((finding) =>
      `| ${finding.id} | ${finding.severity} | ${finding.location} | ${finding.description} |`,
    ).join("\n");

  return `# UI 验收报告 - ${targetId}

**状态**: ${status}

**严重程度统计**: P0: ${count(findings, "P0")} 项 | P1: ${count(findings, "P1")} 项 | P2: ${count(findings, "P2")} 项

<table><tr><td align="center"><b>设计稿</b></td><td align="center"><b>实现（已标注）</b></td></tr><tr><td><img src="${reportFile("design.png")}" width="480"></td><td><img src="${reportFile("annotated.png")}" width="480"></td></tr></table>

[查看完整报告](${reportFile("report.html")}) | [实现原图](${reportFile("implementation.png")})

| 编号 | 严重程度 | 位置/组件 | 说明 |
|---|---|---|---|
${rows}
`;
}

export async function writeReport(
  outputDir: string,
  targetId: string,
  status: RunStatus,
  findings: Finding[],
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const markdown = renderMarkdown(targetId, status, findings);
  const rows = findings.length === 0
    ? "<tr><td>-</td><td>-</td><td>-</td><td>未发现视觉或 Token 问题</td></tr>"
    : findings.map((finding) =>
      `<tr><td>${finding.id}</td><td>${finding.severity}</td><td>${finding.location}</td><td>${finding.description}</td></tr>`,
    ).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>UI 验收报告 - ${targetId}</title><style>body{font-family:system-ui;margin:32px}img{max-width:480px;height:auto}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #ddd;padding:8px;vertical-align:top}</style><h1>UI 验收报告 - ${targetId}</h1><p>状态：${status}</p><table><tr><th>设计稿</th><th>实现（已标注）</th></tr><tr><td><img src="design.png"></td><td><img src="annotated.png"></td></tr></table><table><tr><th>编号</th><th>严重程度</th><th>位置/组件</th><th>说明</th></tr>${rows}</table>`;

  await Promise.all([
    writeFile(join(outputDir, "report.md"), markdown),
    writeFile(join(outputDir, "report.html"), html),
  ]);
  return markdown;
}
