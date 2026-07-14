# Figma Design System & Web Visual QA Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可在 GitLab MR Pipeline 中自动获取 Figma 设计图与 Design Tokens、自动截取 Web 页面、调用 `ui-visual-qa` 核心规则并将结果回写到 GitLab MR 的 Web 视觉验收 Agent。

**Architecture:** Node.js TypeScript CLI 在 GitLab Job 内运行；`qa-targets.yml` 将一个 Figma Frame、一个 Preview URL 与浏览器视口绑定。CLI 按固定顺序执行 Figma 导出、Token/代码 Diff 检查、Playwright 截图、阿里云百炼 Qwen 视觉分析、标注和 GitLab 发布；每一步追加安全的 `run-log.json`。

**Tech Stack:** Node.js 20、TypeScript、Vitest、Zod、YAML、Playwright Chromium、阿里云百炼 OpenAI-compatible Chat Completions API（`qwen3-vl-235b-a22b-thinking`）、Sharp、GitLab REST API、Figma REST API。

## 全局约束

- 第一版只支持 Web；不实现 iOS 或 Android 截图。
- Level 2 的 `ui-visual-qa` 规则必须用于设计图与实现图的最终视觉判定；代码 Token QA 只能补充，不能替代视觉 QA。
- GitLab 只在 `CI_PIPELINE_SOURCE == "merge_request_event"` 时自动运行。
- 所有运行结果写入 `artifacts/ui-visual-qa/`；Job 无论成功或失败都上传该目录。
- 密钥只从 GitLab CI/CD Variables 读取，禁止写入日志、报告或 GitLab MR Note。
- 视觉模型固定为 `qwen3-vl-235b-a22b-thinking`；该模型强制思考模式，流式响应中的 `reasoning_content` 必须被丢弃，仅使用最终 `content` 解析 JSON。
- Figma Variables 读取失败时，只在目标配置的 `tokenSource.kind` 为 `file` 时读取该文件；否则把 Token QA 标记为 unavailable。
- Figma 导出、页面截图和视觉模型调用均最多尝试 3 次；输入或模型输出无效时使用 `needs-human-review`，不伪造通过结论。
- P0 和 `needs-human-review` 在发布 Artifact 与 MR Note 后使 Job 失败；只有 P1/P2 或无问题时成功。

---

## 计划中的文件结构

```text
package.json                                  # 依赖和脚本
tsconfig.json                                 # TypeScript 编译设置
vitest.config.ts                              # 测试运行器设置
qa-targets.example.yml                        # 可复制的单页验收配置
design-tokens.example.json                    # Figma Variables 不可用时的 Token 示例
.gitlab-ci.yml                                # GitLab MR Pipeline Job
src/types.ts                                  # 所有跨模块数据模型
src/config.ts                                 # YAML 配置读取与校验
src/log.ts                                    # 结构化步骤日志
src/retry.ts                                  # 有界重试
src/figma.ts                                  # Frame PNG 与 Variables 获取
src/token-qa.ts                               # Diff 中的 Token 违规检查
src/diff.ts                                   # GitLab MR 的源码 Diff 读取
src/capture.ts                                # Playwright 页面截图
src/visual-qa.ts                              # Level 2 视觉 QA 提示词和模型结果校验
src/annotate.ts                               # 生成带编号的标注图
src/report.ts                                 # Markdown/HTML 报告
src/gitlab.ts                                 # MR Note 发布
src/runner.ts                                 # 编排完整流程与最终退出码
src/cli.ts                                    # 命令行入口
tests/config.test.ts                          # 配置校验测试
tests/token-qa.test.ts                        # Token QA 测试
tests/visual-qa.test.ts                       # 视觉结果 JSON 校验测试
tests/report.test.ts                          # 报告与路由测试
tests/runner.test.ts                          # 编排与错误降级测试
tests/fixtures/qa-targets.yml                 # 测试目标
tests/fixtures/design-tokens.json             # 测试 Token
tests/fixtures/changed.css                    # 含 Token 违规的 Diff Fixture
tests/fixtures/valid-findings.json            # 有效视觉模型结果
tests/fixtures/invalid-findings.json          # 无效视觉模型结果
README.md                                     # GitLab 配置、凭据和考试取证说明
```

### Task 1: 初始化 TypeScript CLI、领域模型与目标配置

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `src/cli.ts`
- Create: `qa-targets.example.yml`
- Create: `design-tokens.example.json`
- Create: `tests/config.test.ts`
- Create: `tests/fixtures/qa-targets.yml`
- Create: `tests/fixtures/design-tokens.json`

**Interfaces:**
- Produces `loadConfig(path: string, targetId: string): Promise<QaTarget>`.
- Produces `QaTarget`, `Viewport`, `TokenSource`, `Finding`, `StepLog` and `RunStatus` from `src/types.ts`.
- Consumes `QA_TARGET`, `FIGMA_ACCESS_TOKEN`, `DASHSCOPE_API_KEY`, and GitLab CI variables only at runtime; configuration parsing itself never requires secrets.

- [ ] **Step 1: 写出会失败的配置校验测试**

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("读取指定目标并保留 Web、Figma 与 Token 设置", async () => {
    const target = await loadConfig("tests/fixtures/qa-targets.yml", "orders-list");
    expect(target).toMatchObject({
      id: "orders-list",
      figma: { fileKey: "abc123", nodeId: "10:20" },
      previewUrl: "https://preview.example.test/orders",
      viewport: { width: 1440, height: 1024 },
      readinessSelector: "[data-qa-ready='orders-list']",
      tokenSource: { kind: "file", path: "tests/fixtures/design-tokens.json" },
    });
  });

  it("拒绝缺少 Frame Node ID 的目标", async () => {
    await expect(loadConfig("tests/fixtures/qa-targets.yml", "invalid-target"))
      .rejects.toThrow("figma.nodeId is required");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- --run tests/config.test.ts`

Expected: FAIL，提示找不到 `../src/config.js`。

- [ ] **Step 3: 创建最小项目配置、类型和配置读取实现**

```json
// package.json
{
  "name": "figma-web-visual-qa-agent",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run",
    "qa": "tsx src/cli.ts"
  },
  "dependencies": {
    "openai": "^6.0.0",
    "playwright": "^1.0.0",
    "sharp": "^0.34.0",
    "yaml": "^2.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

```ts
// src/types.ts
export type Severity = "P0" | "P1" | "P2";
export type RunStatus = "success" | "failed" | "needs-human-review";
export type TokenSource =
  | { kind: "figma" }
  | { kind: "file"; path: string };

export interface Viewport { width: number; height: number; deviceScaleFactor?: number; }
export interface QaTarget {
  id: string;
  figma: { fileKey: string; nodeId: string };
  previewUrl: string;
  viewport: Viewport;
  readinessSelector: string;
  tokenSource: TokenSource;
  sourceGlobs: string[];
}
export interface Finding {
  id: number;
  severity: Severity;
  source: "visual" | "token";
  location: string;
  description: string;
  bbox?: [number, number, number, number];
}
export interface StepLog {
  step: string;
  status: "success" | "failed" | "skipped";
  attempt: number;
  timestamp: string;
  message: string;
}
```

```ts
// src/config.ts
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import type { QaTarget } from "./types.js";

const targetSchema = z.object({
  id: z.string().min(1),
  figma: z.object({ fileKey: z.string().min(1), nodeId: z.string().min(1, "figma.nodeId is required") }),
  previewUrl: z.url(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), deviceScaleFactor: z.number().positive().optional() }),
  readinessSelector: z.string().min(1),
  tokenSource: z.discriminatedUnion("kind", [z.object({ kind: z.literal("figma") }), z.object({ kind: z.literal("file"), path: z.string().min(1) })]),
  sourceGlobs: z.array(z.string().min(1)).min(1),
});

export async function loadConfig(path: string, targetId: string): Promise<QaTarget> {
  const raw = parse(await readFile(path, "utf8")) as { targets?: unknown[] };
  const match = raw.targets?.find((item) => (item as { id?: string }).id === targetId);
  if (!match) throw new Error(`target not found: ${targetId}`);
  return targetSchema.parse(match);
}
```

```yaml
# qa-targets.example.yml
targets:
  - id: orders-list
    figma: { fileKey: "abc123", nodeId: "10:20" }
    previewUrl: "https://preview.example.test/orders"
    viewport: { width: 1440, height: 1024, deviceScaleFactor: 1 }
    readinessSelector: "[data-qa-ready='orders-list']"
    tokenSource: { kind: file, path: "design-tokens.json" }
    sourceGlobs: ["src/**/*.css", "src/**/*.tsx", "src/**/*.vue"]
```

```json
// design-tokens.example.json
{
  "color.brand-primary": "#1677ff",
  "color.text-primary": "#1f1f1f",
  "spacing.8": "8px",
  "spacing.16": "16px",
  "spacing.24": "24px",
  "radius.sm": "4px",
  "radius.md": "8px",
  "typography.body-size": "14px",
  "typography.body-line-height": "20px"
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm install && npm test -- --run tests/config.test.ts && npm run build`

Expected: 所有命令返回 0；`loadConfig` 成功读取 `orders-list`，且非法目标抛出 `figma.nodeId is required`。

### Task 2: 实现 Figma 获取、结构化日志和代码 Token QA

**Files:**
- Create: `src/log.ts`
- Create: `src/retry.ts`
- Create: `src/figma.ts`
- Create: `src/token-qa.ts`
- Create: `src/diff.ts`
- Create: `tests/token-qa.test.ts`
- Create: `tests/fixtures/changed.css`

**Interfaces:**
- Consumes `QaTarget` and `TokenSource` from `src/types.ts`。
- Produces `exportFigmaFrame(target, outputPath): Promise<void>` and `loadDesignTokens(target): Promise<Record<string, string>>`。
- Produces `scanChangedSource(diff: string, tokens: Record<string, string>): Finding[]`。
- Produces `readMergeRequestDiff(): Promise<string>`，从 `CI_MERGE_REQUEST_DIFF_BASE_SHA` 与 `CI_COMMIT_SHA` 读取当前 MR 的 Git Diff。
- Produces `withRetry<T>(operation, log, step): Promise<T>`，最多 3 次。

- [ ] **Step 1: 写出 Token QA 的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { scanChangedSource } from "../src/token-qa.js";

describe("scanChangedSource", () => {
  it("报告新增的非设计 Token 颜色和间距", () => {
    const findings = scanChangedSource(
      "+ .card { color: #ff00ff; margin: 13px; border-radius: var(--radius-md); }",
      { "color.brand-primary": "#1677ff", "spacing.16": "16px", "radius.md": "8px" },
    );
    expect(findings.map((finding) => finding.description)).toEqual([
      "新增硬编码颜色 #ff00ff，未匹配设计 Token",
      "新增硬编码间距 13px，未匹配设计 Token",
    ]);
  });

  it("忽略未改变行和已使用 CSS 变量的值", () => {
    expect(scanChangedSource("  color: #ff00ff;\n+ .card { margin: var(--spacing-16); }", {})).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- --run tests/token-qa.test.ts`

Expected: FAIL，提示找不到 `../src/token-qa.js`。

- [ ] **Step 3: 实现日志、重试、Figma 导出与最小 Token 检查**

```ts
// src/log.ts
import type { StepLog } from "./types.js";
export class RunLog {
  readonly entries: StepLog[] = [];
  add(step: string, status: StepLog["status"], attempt: number, message: string): void {
    this.entries.push({ step, status, attempt, message, timestamp: new Date().toISOString() });
  }
}
```

```ts
// src/retry.ts
import type { RunLog } from "./log.js";
export async function withRetry<T>(step: string, log: RunLog, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await operation();
      log.add(step, "success", attempt, "completed");
      return result;
    } catch (error) {
      lastError = error;
      log.add(step, "failed", attempt, error instanceof Error ? error.message : "unknown error");
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}
```

```ts
// src/figma.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { QaTarget } from "./types.js";

const FIGMA_API = "https://api.figma.com/v1";
function figmaHeaders(): HeadersInit {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error("FIGMA_ACCESS_TOKEN is required");
  return { "X-Figma-Token": token };
}
export async function exportFigmaFrame(target: QaTarget, outputPath: string): Promise<void> {
  const imageResponse = await fetch(`${FIGMA_API}/images/${target.figma.fileKey}?ids=${encodeURIComponent(target.figma.nodeId)}&format=png&scale=1`, { headers: figmaHeaders() });
  if (!imageResponse.ok) throw new Error(`Figma image request failed: ${imageResponse.status}`);
  const body = await imageResponse.json() as { images: Record<string, string | null> };
  const imageUrl = body.images[target.figma.nodeId];
  if (!imageUrl) throw new Error("Figma did not return an image URL for configured node");
  const pngResponse = await fetch(imageUrl);
  if (!pngResponse.ok) throw new Error(`Figma image download failed: ${pngResponse.status}`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await pngResponse.arrayBuffer()));
}
export async function loadDesignTokens(target: QaTarget): Promise<Record<string, string>> {
  if (target.tokenSource.kind === "file") return JSON.parse(await readFile(target.tokenSource.path, "utf8")) as Record<string, string>;
  const response = await fetch(`${FIGMA_API}/files/${target.figma.fileKey}/variables/local`, { headers: figmaHeaders() });
  if (!response.ok) throw new Error(`Figma variables request failed: ${response.status}`);
  const data = await response.json() as { meta: { variables: Record<string, { name: string; valuesByMode: Record<string, unknown> }> } };
  return Object.fromEntries(Object.values(data.meta.variables).flatMap((variable) => Object.entries(variable.valuesByMode).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([mode, value]) => [`${variable.name}.${mode}`, String(value)])));
}
```

```ts
// src/token-qa.ts
import type { Finding } from "./types.js";
const colorPattern = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const spacingPattern = /(?:margin|padding|gap)\s*:\s*(\d+)px/g;
export function scanChangedSource(diff: string, tokens: Record<string, string>): Finding[] {
  const knownValues = new Set(Object.values(tokens).map((value) => value.toLowerCase()));
  const findings: Finding[] = [];
  for (const line of diff.split("\n").filter((entry) => entry.startsWith("+") && !entry.startsWith("+++"))) {
    for (const color of line.match(colorPattern) ?? []) if (!knownValues.has(color.toLowerCase())) findings.push({ id: findings.length + 1, severity: "P1", source: "token", location: "MR diff", description: `新增硬编码颜色 ${color}，未匹配设计 Token` });
    for (const match of line.matchAll(spacingPattern)) {
      const value = `${match[1]}px`;
      if (!knownValues.has(value)) findings.push({ id: findings.length + 1, severity: "P1", source: "token", location: "MR diff", description: `新增硬编码间距 ${value}，未匹配设计 Token` });
    }
  }
  return findings;
}
```

```ts
// src/diff.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export async function readMergeRequestDiff(): Promise<string> {
  const base = process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA;
  const head = process.env.CI_COMMIT_SHA;
  if (!base || !head) throw new Error("GitLab MR diff variables are required");
  const { stdout } = await execFileAsync("git", ["diff", "--unified=0", base, head, "--", "src"]);
  return stdout;
}
```

- [ ] **Step 4: 运行 Token QA 测试与类型检查**

Run: `npm test -- --run tests/token-qa.test.ts && npm run build`

Expected: PASS；`#ff00ff` 与 `13px` 各产生一条 P1，未改变行与 CSS 变量不产生问题。

### Task 3: 实现 Web 截图、Level 2 视觉分析和标注图

**Files:**
- Create: `src/capture.ts`
- Create: `src/visual-qa.ts`
- Create: `src/annotate.ts`
- Create: `tests/visual-qa.test.ts`
- Create: `tests/fixtures/valid-findings.json`
- Create: `tests/fixtures/invalid-findings.json`

**Interfaces:**
- Consumes `QaTarget`、`Finding` 和本地 PNG 文件路径。
- Produces `capturePreview(target, outputPath): Promise<void>`。
- Produces `analyzeVisualQa(designPath, implementationPath): Promise<Finding[]>`。
- Produces `annotateFindings(imagePath, findings, outputPath): Promise<void>`。

- [ ] **Step 1: 写出视觉模型结果校验的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { parseVisualFindings } from "../src/visual-qa.js";

describe("parseVisualFindings", () => {
  it("接受带边界框的 P1 视觉问题", () => {
    expect(parseVisualFindings('[{"severity":"P1","location":"筛选栏","description":"按钮圆角过小","bbox":[40,120,180,40]}]'))
      .toEqual([{ id: 1, severity: "P1", source: "visual", location: "筛选栏", description: "按钮圆角过小", bbox: [40, 120, 180, 40] }]);
  });

  it("拒绝不含 bbox 的视觉问题", () => {
    expect(() => parseVisualFindings('[{"severity":"P1","location":"筛选栏","description":"按钮圆角过小"}]'))
      .toThrow("visual finding requires bbox");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- --run tests/visual-qa.test.ts`

Expected: FAIL，提示找不到 `../src/visual-qa.js`。

- [ ] **Step 3: 实现截图、模型调用、结果校验和标注**

```ts
// src/capture.ts
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { QaTarget } from "./types.js";
export async function capturePreview(target: QaTarget, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: target.viewport, deviceScaleFactor: target.viewport.deviceScaleFactor ?? 1 });
    await page.goto(target.previewUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForSelector(target.readinessSelector, { state: "visible", timeout: 15_000 });
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally { await browser.close(); }
}
```

```ts
// src/visual-qa.ts
import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import type { Finding } from "./types.js";
const modelFinding = z.object({ severity: z.enum(["P0", "P1", "P2"]), location: z.string().min(1), description: z.string().min(1), bbox: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().positive(), z.number().positive()]) });
export function parseVisualFindings(text: string): Finding[] {
  const parsed = z.array(modelFinding).parse(JSON.parse(text));
  return parsed.map((finding, index) => ({ id: index + 1, source: "visual", ...finding }));
}
export async function analyzeVisualQa(designPath: string, implementationPath: string): Promise<Finding[]> {
  const client = new OpenAI({ apiKey: process.env.DASHSCOPE_API_KEY, baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" });
  const [design, implementation] = await Promise.all([readFile(designPath, "base64"), readFile(implementationPath, "base64")]);
  const prompt = `你是 UI 视觉验收 Agent。比较设计稿和实现图，只评估样式：尺寸、间距、颜色、排版、圆角、边框/阴影、对齐、图标风格、结构完整性。忽略文案、名称、数字和照片内容差异；若截图尺寸不同，按画布比例比较。只输出 JSON 数组，每项含 severity(P0/P1/P2)、location、description、bbox[x,y,width,height]，bbox 必须对应实现图像素坐标。没有问题时输出 []。`;
  const stream = await client.chat.completions.create({ model: "qwen3-vl-235b-a22b-thinking", stream: true, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${design}` } }, { type: "image_url", image_url: { url: `data:image/png;base64,${implementation}` } }] }], extra_body: { enable_thinking: true, vl_high_resolution_images: true } } as never);
  let answer = "";
  for await (const chunk of stream) answer += chunk.choices[0]?.delta.content ?? "";
  return parseVisualFindings(answer);
}
```

```ts
// src/annotate.ts
import sharp from "sharp";
import type { Finding } from "./types.js";
const colors = { P0: "#ff3b30", P1: "#ff9500", P2: "#ffcc00" };
export async function annotateFindings(imagePath: string, findings: Finding[], outputPath: string): Promise<void> {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const marks = findings.filter((finding) => finding.bbox).map((finding) => {
    const [x, y, w, h] = finding.bbox!;
    const color = colors[finding.severity];
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="4"/><circle cx="${x + 18}" cy="${y + 18}" r="16" fill="${color}"/><text x="${x + 18}" y="${y + 24}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="white">${finding.id}</text>`;
  }).join("");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`;
  await sharp(imagePath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(outputPath);
}
```

- [ ] **Step 4: 运行视觉结果测试和类型检查**

Run: `npm test -- --run tests/visual-qa.test.ts && npm run build`

Expected: PASS；有效 JSON 转为带 `source: "visual"` 的 `Finding`，缺少 bbox 的结果被拒绝。

### Task 4: 实现报告、GitLab MR Note 和完整编排

**Files:**
- Create: `src/report.ts`
- Create: `src/gitlab.ts`
- Create: `src/runner.ts`
- Modify: `src/cli.ts`
- Create: `tests/report.test.ts`
- Create: `tests/runner.test.ts`

**Interfaces:**
- Consumes Task 1-3 的 `QaTarget`、`Finding`、`RunLog`、获取函数和输出目录。
- Produces `runQa(target, outputDir): Promise<{ status: RunStatus; findings: Finding[]; log: StepLog[] }>`。
- Produces `writeReport(outputDir, target, findings, status): Promise<void>`。
- Produces `postMrNote(markdown: string): Promise<void>`，只在 GitLab MR 变量齐全时执行。

- [ ] **Step 1: 写出报告路由的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { decideStatus, renderMarkdown } from "../src/report.js";

describe("报告分流", () => {
  it("P0 使运行失败，P1 保持成功", () => {
    expect(decideStatus([{ id: 1, severity: "P0", source: "visual", location: "标题", description: "文本遮挡" }])).toBe("failed");
    expect(decideStatus([{ id: 1, severity: "P1", source: "token", location: "MR diff", description: "硬编码颜色" }])).toBe("success");
  });

  it("报告包含问题统计和 GitLab Artifact 相对链接", () => {
    const markdown = renderMarkdown("orders-list", "success", []);
    expect(markdown).toContain("P0: 0 项 | P1: 0 项 | P2: 0 项");
    expect(markdown).toContain("[查看完整报告](report.html)");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- --run tests/report.test.ts`

Expected: FAIL，提示找不到 `../src/report.js`。

- [ ] **Step 3: 实现报告、MR Note 和编排器**

```ts
// src/report.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding, RunStatus } from "./types.js";
export function decideStatus(findings: Finding[], forcedReview = false): RunStatus {
  if (forcedReview) return "needs-human-review";
  return findings.some((finding) => finding.severity === "P0") ? "failed" : "success";
}
export function renderMarkdown(targetId: string, status: RunStatus, findings: Finding[]): string {
  const count = (severity: string) => findings.filter((finding) => finding.severity === severity).length;
  const rows = findings.length === 0 ? "| - | - | - | 未发现视觉或 Token 问题 |" : findings.map((finding) => `| ${finding.id} | ${finding.severity} | ${finding.location} | ${finding.description} |`).join("\n");
  return `# UI 验收报告 - ${targetId}\n\n**状态**: ${status}\n\n**严重程度统计**: P0: ${count("P0")} 项 | P1: ${count("P1")} 项 | P2: ${count("P2")} 项\n\n<table><tr><td align="center"><b>设计稿</b></td><td align="center"><b>实现（已标注）</b></td></tr><tr><td><img src="design.png" width="480"></td><td><img src="annotated.png" width="480"></td></tr></table>\n\n[查看完整报告](report.html) | [实现原图](implementation.png)\n\n| 编号 | 严重程度 | 位置/组件 | 说明 |\n|---|---|---|---|\n${rows}\n`;
}
export async function writeReport(outputDir: string, targetId: string, status: RunStatus, findings: Finding[]): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const markdown = renderMarkdown(targetId, status, findings);
  const rows = findings.length === 0 ? "<tr><td>-</td><td>-</td><td>-</td><td>未发现视觉或 Token 问题</td></tr>" : findings.map((finding) => `<tr><td>${finding.id}</td><td>${finding.severity}</td><td>${finding.location}</td><td>${finding.description}</td></tr>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>UI 验收报告 - ${targetId}</title><style>body{font-family:system-ui;margin:32px}img{max-width:480px;height:auto}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #ddd;padding:8px;vertical-align:top}</style><h1>UI 验收报告 - ${targetId}</h1><p>状态：${status}</p><table><tr><th>设计稿</th><th>实现（已标注）</th></tr><tr><td><img src="design.png"></td><td><img src="annotated.png"></td></tr></table><table><tr><th>编号</th><th>严重程度</th><th>位置/组件</th><th>说明</th></tr>${rows}</table>`;
  await Promise.all([writeFile(join(outputDir, "report.md"), markdown), writeFile(join(outputDir, "report.html"), html)]);
  return markdown;
}
```

```ts
// src/gitlab.ts
export async function postMrNote(markdown: string): Promise<void> {
  const base = process.env.CI_API_V4_URL;
  const project = process.env.CI_PROJECT_ID;
  const iid = process.env.CI_MERGE_REQUEST_IID;
  const token = process.env.GITLAB_TOKEN;
  if (!base || !project || !iid || !token) return;
  const response = await fetch(`${base}/projects/${encodeURIComponent(project)}/merge_requests/${encodeURIComponent(iid)}/notes`, { method: "POST", headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" }, body: JSON.stringify({ body: markdown }) });
  if (!response.ok) throw new Error(`GitLab MR note failed: ${response.status}`);
}
```

```ts
// src/runner.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { annotateFindings } from "./annotate.js";
import { capturePreview } from "./capture.js";
import { readMergeRequestDiff } from "./diff.js";
import { exportFigmaFrame, loadDesignTokens } from "./figma.js";
import { postMrNote } from "./gitlab.js";
import { RunLog } from "./log.js";
import { writeReport, decideStatus } from "./report.js";
import { withRetry } from "./retry.js";
import { scanChangedSource } from "./token-qa.js";
import type { QaTarget, RunStatus } from "./types.js";
import { analyzeVisualQa } from "./visual-qa.js";

export async function runQa(target: QaTarget, outputDir: string): Promise<{ status: RunStatus; findings: Awaited<ReturnType<typeof analyzeVisualQa>>; log: RunLog["entries"] }> {
  const log = new RunLog();
  await mkdir(outputDir, { recursive: true });
  try {
    await withRetry("fetch_figma", log, () => exportFigmaFrame(target, join(outputDir, "design.png")));
    const tokens = await withRetry("load_tokens", log, () => loadDesignTokens(target));
    const diff = await readMergeRequestDiff();
    const tokenFindings = scanChangedSource(diff, tokens);
    log.add("code_token_qa", "success", 1, `${tokenFindings.length} findings`);
    await withRetry("capture_web", log, () => capturePreview(target, join(outputDir, "implementation.png")));
    const visualFindings = (await withRetry("visual_qa", log, () => analyzeVisualQa(join(outputDir, "design.png"), join(outputDir, "implementation.png"))))
      .map((finding, index) => ({ ...finding, id: tokenFindings.length + index + 1 }));
    const findings = [...tokenFindings, ...visualFindings];
    await annotateFindings(join(outputDir, "implementation.png"), visualFindings, join(outputDir, "annotated.png"));
    const status = decideStatus(findings);
    const markdown = await writeReport(outputDir, target.id, status, findings);
    await writeFile(join(outputDir, "findings.json"), JSON.stringify(findings, null, 2));
    await writeFile(join(outputDir, "run-log.json"), JSON.stringify(log.entries, null, 2));
    await postMrNote(markdown);
    log.add("publish", "success", 1, "MR Note published; artifacts staged for GitLab upload");
    await writeFile(join(outputDir, "run-log.json"), JSON.stringify(log.entries, null, 2));
    return { status, findings, log: log.entries };
  } catch (error) {
    log.add("runner", "failed", 1, error instanceof Error ? error.message : "unknown error");
    await writeFile(join(outputDir, "run-log.json"), JSON.stringify(log.entries, null, 2));
    const markdown = await writeReport(outputDir, target.id, "needs-human-review", []);
    await postMrNote(markdown);
    return { status: "needs-human-review", findings: [], log: log.entries };
  }
}
```

```ts
// src/cli.ts
import { loadConfig } from "./config.js";
import { runQa } from "./runner.js";
const targetId = process.argv[2] ?? process.env.QA_TARGET;
if (!targetId) throw new Error("QA target id is required as argv[2] or QA_TARGET");
const target = await loadConfig(process.env.QA_CONFIG ?? "qa-targets.yml", targetId);
const result = await runQa(target, process.env.QA_OUTPUT_DIR ?? "artifacts/ui-visual-qa");
process.exitCode = result.status === "success" ? 0 : 1;
```

- [ ] **Step 4: 运行报告测试、编译和全量测试**

Run: `npm test -- --run tests/report.test.ts tests/runner.test.ts && npm run build && npm test`

Expected: PASS；P0 映射为 `failed`，P1 映射为 `success`，报告包含 Artifact 相对链接。

### Task 5: 增加 GitLab Pipeline、可复制配置和考试操作说明

**Files:**
- Create: `.gitlab-ci.yml`
- Create: `README.md`
- Modify: `qa-targets.example.yml`

**Interfaces:**
- Consumes `npm run qa -- <target-id>` from Task 4。
- Produces GitLab Artifact 目录 `artifacts/ui-visual-qa/` 和 MR Note。
- Requires GitLab Variables `FIGMA_ACCESS_TOKEN`、`DASHSCOPE_API_KEY`、`GITLAB_TOKEN`；可选 `QA_TARGET` 和 `QA_CONFIG`。

- [ ] **Step 1: 创建只在 MR 中运行且总是上传证据的 Pipeline Job**

```yaml
# .gitlab-ci.yml
stages: [qa]

ui_visual_qa:
  stage: qa
  image: mcr.microsoft.com/playwright:v1.58.0-noble
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  before_script:
    - npm ci
  script:
    - npm run qa -- "$QA_TARGET"
  artifacts:
    when: always
    expire_in: 14 days
    paths:
      - artifacts/ui-visual-qa/
```

- [ ] **Step 2: 编写最小运行说明和考试取证步骤**

```markdown
# Figma Design System & Web Visual QA Agent

## GitLab Variables

在项目的 Settings > CI/CD > Variables 中创建并设为 Masked：`FIGMA_ACCESS_TOKEN`、`DASHSCOPE_API_KEY`、`GITLAB_TOKEN`、`QA_TARGET`。`GITLAB_TOKEN` 使用项目 Access Token，Scope 为 `api`。

## 配置目标

复制 `qa-targets.example.yml` 为 `qa-targets.yml`，填入真实 Figma file key、Frame node ID、预览 URL 和页面稳定后的选择器。将 `QA_TARGET` 设为该目标的 `id`。

## 本地验证

```bash
npm install
npx playwright install chromium
QA_TARGET=orders-list QA_CONFIG=qa-targets.yml npm run qa -- orders-list
```

## Level 3 截图

1. 截取 `.gitlab-ci.yml` 的 MR rules 和 `qa-targets.yml`。
2. 截取一次 Job 日志中的 `fetch_figma`、`code_token_qa`、`capture_web`、`visual_qa`、`publish` 成功记录。
3. 截取 GitLab MR 自动 Note 与 Artifact 中的 `report.html`、`annotated.png`。
```

- [ ] **Step 3: 验证 CI 配置和文档中的命令**

Run: `npm run build && npm test && rg -n 'merge_request_event|artifacts/ui-visual-qa|FIGMA_ACCESS_TOKEN|DASHSCOPE_API_KEY|GITLAB_TOKEN' .gitlab-ci.yml README.md`

Expected: 返回 0；搜索结果包含 MR 触发条件、Artifact 路径和三项必填密钥。

## 计划自检

- 试题中的自动触发、自动获取数据、Level 2 AI 处理、分支、自动落地、异常处理与真实运行证据分别由 Task 5、Task 2/3、Task 3、Task 4、Task 4/5、Task 2/4、Task 5 覆盖。
- 代码 Token QA 被限制在 Figma Variables/Token 与代码 Diff 的一致性检查；Task 3 的视觉分析仍是 Level 2 核心能力。
- 所有跨任务函数、数据类型和输出路径在前置任务中已定义。
- 当前目录不是 Git 仓库，因此计划不包含 commit 步骤；在将文件复制到 GitLab 项目后，每个 Task 应作为独立提交。
