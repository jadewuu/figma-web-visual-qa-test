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
      tokenSource: { kind: "file", path: "tests/fixtures/design-tokens.json" }
    });
  });

  it("拒绝缺少 Frame Node ID 的目标", async () => {
    await expect(loadConfig("tests/fixtures/qa-targets.yml", "invalid-target"))
      .rejects.toThrow("figma.nodeId is required");
  });
});
