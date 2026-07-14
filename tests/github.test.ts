import { afterEach, describe, expect, it, vi } from "vitest";
import { postPullRequestComment } from "../src/github.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_API_URL;
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_PR_NUMBER;
  delete process.env.GITHUB_TOKEN;
});

describe("GitHub PR comment", () => {
  it("缺少 PR 上下文时跳过发布", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await postPullRequestComment("report");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GitHub 拒绝评论时抛出明确状态码", async () => {
    Object.assign(process.env, {
      GITHUB_REPOSITORY: "jade/ui-qa",
      GITHUB_PR_NUMBER: "7",
      GITHUB_TOKEN: "token",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));

    await expect(postPullRequestComment("report"))
      .rejects.toThrow("GitHub PR comment failed: 403");
  });
});
