import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import type { QaTarget } from "./types.js";

export async function capturePreview(
  target: QaTarget,
  outputPath: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: target.viewport,
      deviceScaleFactor: target.viewport.deviceScaleFactor ?? 1,
    });
    await page.goto(target.previewUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForSelector(target.readinessSelector, { state: "visible", timeout: 15_000 });
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    await browser.close();
  }
}
