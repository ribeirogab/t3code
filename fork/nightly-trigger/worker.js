const workflowUrl =
  "https://api.github.com/repos/ribeirogab/t3code/actions/workflows/fork-nightly.yml";

async function expectOk(response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
}

export default {
  async scheduled(_controller, env) {
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "t3code-nightly-trigger",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    await expectOk(await fetch(`${workflowUrl}/enable`, { method: "PUT", headers }));
    await expectOk(
      await fetch(`${workflowUrl}/dispatches`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: "custom", inputs: { upstream_only: "true" } }),
      }),
    );
  },
};
