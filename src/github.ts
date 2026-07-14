export async function postPullRequestComment(markdown: string): Promise<void> {
  const api = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const repository = process.env.GITHUB_REPOSITORY;
  const number = process.env.GITHUB_PR_NUMBER;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !number || !token) return;

  const response = await fetch(
    `${api}/repos/${repository}/issues/${number}/comments`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: markdown }),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub PR comment failed: ${response.status}`);
  }
}
