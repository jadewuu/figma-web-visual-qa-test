import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import type { QaTarget } from "./types.js";

const targetSchema = z.object({
  id: z.string().min(1),
  figma: z.object({
    fileKey: z.string().min(1),
    nodeId: z.string().min(1, "figma.nodeId is required")
  }),
  previewUrl: z.url(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    deviceScaleFactor: z.number().positive().optional()
  }),
  readinessSelector: z.string().min(1),
  tokenSource: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("figma") }),
    z.object({ kind: z.literal("file"), path: z.string().min(1) })
  ]),
  sourceGlobs: z.array(z.string().min(1)).min(1)
});

export async function loadConfig(path: string, targetId: string): Promise<QaTarget> {
  const raw = parse(await readFile(path, "utf8")) as { targets?: unknown[] };
  const target = raw.targets?.find((candidate) =>
    typeof candidate === "object" && candidate !== null &&
    "id" in candidate && candidate.id === targetId
  );

  if (!target) {
    throw new Error(`target not found: ${targetId}`);
  }

  return targetSchema.parse(target);
}
