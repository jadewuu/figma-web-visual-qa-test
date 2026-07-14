import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import type { Finding } from "./types.js";

export const QWEN_MODEL = "qwen3-vl-235b-a22b-thinking";
const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

const rawFindingSchema = z.object({
  severity: z.enum(["P0", "P1", "P2"]),
  location: z.string().min(1),
  description: z.string().min(1),
  bbox: z.tuple([
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().positive(),
    z.number().positive(),
  ]).optional(),
});

export function parseVisualFindings(response: string): Finding[] {
  const parsed = z.array(rawFindingSchema).parse(JSON.parse(response));

  return parsed.map((finding, index) => {
    if (!finding.bbox) {
      throw new Error("visual finding requires bbox");
    }

    return {
      id: index + 1,
      severity: finding.severity,
      source: "visual",
      location: finding.location,
      description: finding.description,
      bbox: finding.bbox,
    };
  });
}

export async function analyzeVisualQa(
  designPath: string,
  implementationPath: string,
): Promise<Finding[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY is required");
  }

  const [design, implementation] = await Promise.all([
    readFile(designPath, "base64"),
    readFile(implementationPath, "base64"),
  ]);
  const client = new OpenAI({ apiKey, baseURL: QWEN_BASE_URL });
  const prompt = [
    "你是 UI 视觉验收 Agent。比较设计稿和实现截图。",
    "只评估尺寸、间距、颜色、排版、圆角、边框或阴影、对齐、图标风格与结构完整性。",
    "忽略文案、名称、数字和照片内容差异；若截图尺寸不同，按画布比例比较。",
    "只输出 JSON 数组；每项必须包含 severity(P0/P1/P2)、location、description、bbox[x,y,width,height]。",
    "bbox 必须是实现截图的像素坐标；没有问题时输出 []。",
  ].join("\n");
  const stream = await client.chat.completions.create({
    model: QWEN_MODEL,
    stream: true,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/png;base64,${design}` } },
        { type: "image_url", image_url: { url: `data:image/png;base64,${implementation}` } },
      ],
    }],
    extra_body: { enable_thinking: true },
  } as never) as unknown as AsyncIterable<{
    choices: Array<{ delta: { content?: string | null } }>;
  }>;

  let answer = "";
  for await (const chunk of stream) {
    answer += chunk.choices[0]?.delta.content ?? "";
  }
  return parseVisualFindings(answer);
}
