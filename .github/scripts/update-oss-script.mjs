const username = process.env.GITHUB_ACTOR_USERNAME || "bhushan4work";
const token = process.env.GITHUB_TOKEN;
const readmePath = "README.md";

if (!token) throw new Error("GITHUB_TOKEN is required.");

const query = `is:pr is:merged author:${username} -user:${username}`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function searchMergedPrs(page) {
  const params = new URLSearchParams({
    q: query,
    per_page: "100",
    page: String(page),
    sort: "updated",
    order: "desc",
  });
  const response = await fetch(`https://api.github.com/search/issues?${params}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub search failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function monthLabel(dateString) {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short", year: "numeric", timeZone: "UTC",
  }).toLowerCase();
}

function renderPr(item) {
  const [owner, repo] = item.repository_url.split("/").slice(-2);
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const mergedDate = item.closed_at ? monthLabel(item.closed_at) : "merged";
  const title = `${item.title} (#${item.number})`;
  return [
    "<p>",
    `  <a href="${escapeHtml(item.html_url)}">${escapeHtml(title)}</a> &nbsp; <span>${escapeHtml(mergedDate)}</span><br>`,
    `  <a href="${escapeHtml(repoUrl)}">${escapeHtml(owner)}/${escapeHtml(repo)}</a> &nbsp;•&nbsp; <span>merged</span>`,
    "</p>",
  ].join("\n");
}

async function main() {
  const firstPage = await searchMergedPrs(1);
  if (firstPage.incomplete_results) throw new Error("GitHub returned incomplete search results; README was not changed.");

  const pageCount = Math.min(10, Math.ceil(firstPage.total_count / 100));
  const pages = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => searchMergedPrs(index + 2)),
  );
  const items = [firstPage, ...pages].flatMap((page) => page.items ?? []);
  const mergedPrs = items
    .filter((item) => item.pull_request && item.state === "closed" && item.closed_at)
    .filter((item) => item.repository_url.split("/").at(-2)?.toLowerCase() !== username.toLowerCase())
    .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));

  const latestThree = mergedPrs.slice(0, 3);
  const searchUrl = `https://github.com/pulls?q=${encodeURIComponent(query).replaceAll("%20", "+")}`;
  const lines = [
    "<h2>oss</h2>",
    "",
    `<p>${firstPage.total_count} merged prs and counting.</p>`,
    "",
    latestThree.length ? latestThree.map(renderPr).join("\n\n") : "<p>no merged prs found yet.</p>",
    "",
    `<p><a href="${searchUrl}">view more on github ↗</a></p>`,
  ];
  const generated = lines.join("\n");

  const fs = await import("node:fs/promises");
  const readme = await fs.readFile(readmePath, "utf8");
  const start = "<!-- OSS-AUTO-START -->";
  const end = "<!-- OSS-AUTO-END -->";
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Could not find the ${start} / ${end} markers in ${readmePath}.`);
  }

  const updated = readme.slice(0, startIndex + start.length) + "\n" + generated + "\n" + readme.slice(endIndex);
  if (updated !== readme) await fs.writeFile(readmePath, updated);
}

await main();
