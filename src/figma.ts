import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { QaTarget } from "./types.js";

const figmaApi = "https://api.figma.com/v1";

function headers(): HeadersInit {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new Error("FIGMA_ACCESS_TOKEN is required");
  }

  return { "X-Figma-Token": token };
}

function toHexChannel(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function normalizeValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (
    typeof value === "object" && value !== null &&
    "r" in value && "g" in value && "b" in value &&
    typeof value.r === "number" &&
    typeof value.g === "number" &&
    typeof value.b === "number"
  ) {
    return `#${toHexChannel(value.r)}${toHexChannel(value.g)}${toHexChannel(value.b)}`;
  }

  return undefined;
}

function extractFrameColors(value: unknown, tokens: Record<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      extractFrameColors(item, tokens);
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  const record = value as Record<string, unknown>;
  const color = normalizeValue(record.color);
  if (color && !Object.values(tokens).includes(color)) {
    tokens[`figma-node.color.${Object.keys(tokens).length + 1}`] = color;
  }

  for (const child of Object.values(record)) {
    extractFrameColors(child, tokens);
  }
}

async function loadFrameColorTokens(target: QaTarget): Promise<Record<string, string>> {
  const response = await fetch(
    `${figmaApi}/files/${target.figma.fileKey}/nodes?ids=${encodeURIComponent(target.figma.nodeId)}`,
    { headers: headers() }
  );
  if (!response.ok) {
    throw new Error(`Figma node request failed: ${response.status}`);
  }

  const body = await response.json() as {
    nodes: Record<string, { document?: unknown }>;
  };
  const document = body.nodes[target.figma.nodeId]?.document;
  if (!document) {
    throw new Error("Figma did not return the configured node document");
  }

  const tokens: Record<string, string> = {};
  extractFrameColors(document, tokens);
  return tokens;
}

export async function exportFigmaFrame(
  target: QaTarget,
  outputPath: string
): Promise<void> {
  const imageResponse = await fetch(
    `${figmaApi}/images/${target.figma.fileKey}?ids=${encodeURIComponent(target.figma.nodeId)}&format=png&scale=1`,
    { headers: headers() }
  );
  if (!imageResponse.ok) {
    throw new Error(`Figma image request failed: ${imageResponse.status}`);
  }

  const imageBody = await imageResponse.json() as {
    images: Record<string, string | null>;
  };
  const imageUrl = imageBody.images[target.figma.nodeId];
  if (!imageUrl) {
    throw new Error("Figma did not return an image URL for configured node");
  }

  const pngResponse = await fetch(imageUrl);
  if (!pngResponse.ok) {
    throw new Error(`Figma image download failed: ${pngResponse.status}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await pngResponse.arrayBuffer()));
}

export async function loadDesignTokens(
  target: QaTarget
): Promise<Record<string, string>> {
  if (target.tokenSource.kind === "file") {
    return JSON.parse(await readFile(target.tokenSource.path, "utf8")) as Record<string, string>;
  }

  const response = await fetch(
    `${figmaApi}/files/${target.figma.fileKey}/variables/local`,
    { headers: headers() }
  );
  if (!response.ok) {
    if (response.status === 403) {
      console.warn("Figma Variables API returned 403; using configured Frame colors for token QA.");
      return loadFrameColorTokens(target);
    }
    throw new Error(`Figma variables request failed: ${response.status}`);
  }

  const body = await response.json() as {
    meta: {
      variables: Record<string, {
        name: string;
        valuesByMode: Record<string, unknown>;
      }>;
    };
  };
  const tokens: Record<string, string> = {};

  for (const variable of Object.values(body.meta.variables)) {
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const normalized = normalizeValue(value);
      if (normalized) {
        tokens[`${variable.name}.${modeId}`] = normalized;
      }
    }
  }

  return tokens;
}
