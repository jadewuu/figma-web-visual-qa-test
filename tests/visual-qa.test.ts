import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { annotateFindings } from "../src/annotate.js";
import { analyzeVisualQa, parseVisualFindings, QWEN_MODEL } from "../src/visual-qa.js";

describe("parseVisualFindings", () => {
  it("接受带边界框的 P1 视觉问题", () => {
    expect(parseVisualFindings(
      '[{"severity":"P1","location":"筛选栏","description":"按钮圆角过小","bbox":[40,120,180,40]}]'
    )).toEqual([{
      id: 1,
      severity: "P1",
      source: "visual",
      location: "筛选栏",
      description: "按钮圆角过小",
      bbox: [40, 120, 180, 40]
    }]);
  });

  it("拒绝不含 bbox 的视觉问题", () => {
    expect(() => parseVisualFindings(
      '[{"severity":"P1","location":"筛选栏","description":"按钮圆角过小"}]'
    )).toThrow("visual finding requires bbox");
  });
});

describe("analyzeVisualQa", () => {
  it("固定使用指定 Qwen 模型，并在缺少 API Key 时拒绝调用", async () => {
    delete process.env.DASHSCOPE_API_KEY;
    expect(QWEN_MODEL).toBe("qwen3-vl-235b-a22b-thinking");
    await expect(analyzeVisualQa("missing-design.png", "missing-implementation.png"))
      .rejects.toThrow("DASHSCOPE_API_KEY is required");
  });
});

describe("annotateFindings", () => {
  it("在实现截图上输出 PNG 标注图", async () => {
    const directory = await mkdtemp(join(tmpdir(), "visual-qa-"));
    const imagePath = join(directory, "implementation.png");
    const outputPath = join(directory, "annotated.png");
    await sharp({
      create: { width: 20, height: 20, channels: 4, background: "white" },
    })
      .png()
      .toFile(imagePath);

    await annotateFindings(imagePath, [{
      id: 1,
      severity: "P1",
      source: "visual",
      location: "筛选栏",
      description: "按钮圆角过小",
      bbox: [0, 0, 10, 10]
    }], outputPath);

    expect((await readFile(outputPath)).length).toBeGreaterThan(0);
    await rm(directory, { recursive: true, force: true });
  });
});
