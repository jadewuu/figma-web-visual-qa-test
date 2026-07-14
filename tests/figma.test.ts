import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readMergeRequestDiff } from "../src/diff.js";
import { exportFigmaFrame, loadDesignTokens } from "../src/figma.js";
import type { QaTarget } from "../src/types.js";

const target: QaTarget = {
  id: "orders-list",
  figma: { fileKey: "abc123", nodeId: "10:20" },
  previewUrl: "https://preview.example.test/orders",
  viewport: { width: 1440, height: 1024 },
  readinessSelector: "[data-qa-ready='orders-list']",
  tokenSource: { kind: "file", path: "tests/fixtures/design-tokens.json" },
  sourceGlobs: ["src/**/*.css"]
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FIGMA_ACCESS_TOKEN;
  delete process.env.GITHUB_BASE_SHA;
  delete process.env.GITHUB_SHA;
});

describe("Figma inputs", () => {
  it("从配置的 Token 文件读取设计 Token", async () => {
    await expect(loadDesignTokens(target)).resolves.toMatchObject({
      "color.brand-primary": "#1677ff",
      "spacing.16": "16px"
    });
  });

  it("导出配置 Frame 对应的 PNG", async () => {
    const directory = await mkdtemp(join(tmpdir(), "figma-qa-"));
    const outputPath = join(directory, "design.png");
    process.env.FIGMA_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        images: { "10:20": "https://figma.example.test/design.png" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("png-bytes", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await exportFigmaFrame(target, outputPath);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(readFile(outputPath, "utf8")).resolves.toBe("png-bytes");
    await rm(directory, { recursive: true, force: true });
  });

  it("将 Figma 颜色变量规范化为可比对的十六进制 Token", async () => {
    process.env.FIGMA_ACCESS_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      meta: {
        variables: {
          "VariableID:1:1": {
            name: "color.brand-primary",
            valuesByMode: {
              "1:0": { r: 0.0862745, g: 0.4666667, b: 1, a: 1 }
            }
          }
        }
      }
    }), { status: 200 })));

    await expect(loadDesignTokens({ ...target, tokenSource: { kind: "figma" } }))
      .resolves.toEqual({ "color.brand-primary.1:0": "#1677ff" });
  });
});

describe("readMergeRequestDiff", () => {
  it("缺少 GitHub PR SHA 时拒绝运行代码 Token QA", async () => {
    await expect(readMergeRequestDiff()).rejects.toThrow(
      "GitHub PR diff variables are required"
    );
  });
});
