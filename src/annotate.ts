import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import type { Finding } from "./types.js";

const COLORS = {
  P0: "#dc2626",
  P1: "#ea580c",
  P2: "#2563eb",
} as const;

export async function annotateFindings(
  imagePath: string,
  findings: Finding[],
  outputPath: string,
): Promise<void> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;

  const overlays = findings.flatMap((finding) => {
    if (!finding.bbox) return [];
    const [x, y, boxWidth, boxHeight] = finding.bbox;
    const color = COLORS[finding.severity];
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}"
          fill="none" stroke="${color}" stroke-width="2" />
        <circle cx="${x + 8}" cy="${y + 8}" r="8" fill="${color}" />
        <text x="${x + 5.5}" y="${y + 12}" fill="white" font-size="10" font-family="Arial">${finding.id}</text>
      </svg>`;
    return [{ input: Buffer.from(svg) }];
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await image.composite(overlays).png().toFile(outputPath);
}
