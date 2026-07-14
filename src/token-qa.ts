import type { Finding } from "./types.js";

const colorPattern = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const spacingPattern = /(?:margin|padding|gap)\s*:\s*(\d+)px/g;

export function scanChangedSource(
  diff: string,
  tokens: Record<string, string>
): Finding[] {
  const knownValues = new Set(
    Object.values(tokens).map((value) => value.toLowerCase())
  );
  const findings: Finding[] = [];

  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue;
    }

    for (const color of line.match(colorPattern) ?? []) {
      if (!knownValues.has(color.toLowerCase())) {
        findings.push({
          id: findings.length + 1,
          severity: "P1",
          source: "token",
          location: "MR diff",
          description: `新增硬编码颜色 ${color}，未匹配设计 Token`
        });
      }
    }

    for (const match of line.matchAll(spacingPattern)) {
      const value = `${match[1]}px`;
      if (!knownValues.has(value)) {
        findings.push({
          id: findings.length + 1,
          severity: "P1",
          source: "token",
          location: "MR diff",
          description: `新增硬编码间距 ${value}，未匹配设计 Token`
        });
      }
    }
  }

  return findings;
}
