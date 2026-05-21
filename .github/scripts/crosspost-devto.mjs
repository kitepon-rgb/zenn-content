#!/usr/bin/env node
// Zenn の英語自動翻訳記事を dev.to へ転載する。
// 毎日 cron で起動し、各記事の ?locale=en ページに埋め込まれた __NEXT_DATA__ から
// isTranslated を確認。翻訳済みかつ未転載のものを dev.to API へ POST する。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const ZENN_USER = "kitepon";
const DEVTO_API = "https://dev.to/api/articles";
const MAX_PER_RUN = 5; // dev.to レート制限よけ。余りは翌日の実行で拾う
const POST_DELAY_MS = 3000;
const FETCH_DELAY_MS = 700;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const ARTICLES_DIR = path.join(REPO_ROOT, "articles");
const STATE_FILE = path.join(REPO_ROOT, "crossposted-devto.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.use(gfm);
// Zenn の見出しに付くアンカーリンク（#始まり）は本文に不要なので落とす
turndown.addRule("stripAnchorLinks", {
  filter: (node) =>
    node.nodeName === "A" && (node.getAttribute("href") || "").startsWith("#"),
  replacement: () => "",
});
// 各記事の冒頭にある「ブログからの転載です」お知らせ枠（:::message）は
// dev.to では文脈が合わないので落とす。ブログ URL を含む msg ブロックで識別する。
turndown.addRule("stripReprintNotice", {
  filter: (node) =>
    node.nodeName === "ASIDE" &&
    (node.getAttribute("class") || "").includes("msg") &&
    (node.innerHTML || "").includes("kitepon-rgb.github.io/WebAICoding"),
  replacement: () => "",
});

// __NEXT_DATA__ JSON の中から記事オブジェクト（isTranslated と bodyHtml を持つ）を探す。
// 現状は $.props.pageProps.article だが、構造変化に強いよう再帰探索する。
export function findArticle(node) {
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = findArticle(v);
      if (r) return r;
    }
    return null;
  }
  if (node && typeof node === "object") {
    if ("isTranslated" in node && "bodyHtml" in node) return node;
    for (const k of Object.keys(node)) {
      const r = findArticle(node[k]);
      if (r) return r;
    }
  }
  return null;
}

export function htmlToMarkdown(html) {
  return turndown.turndown(html || "").trim();
}

// Zenn の topics を dev.to のタグ規則（英数小文字のみ・最大4件）に整える
export function buildTags(topics) {
  const seen = new Set();
  const out = [];
  for (const t of topics || []) {
    const tag = String(t).toLowerCase();
    if (/^[a-z0-9]+$/.test(tag) && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
      if (out.length === 4) break;
    }
  }
  return out;
}

export function buildDescription(markdown) {
  for (const line of markdown.split("\n")) {
    const l = line.trim();
    if (!l || /^[>#`!|-]/.test(l) || l.startsWith("![")) continue;
    return l
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
      .replace(/[#*`_>\[\]!]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 120)
      .trim();
  }
  return "";
}

export function buildPayload(article, slug, topics) {
  const body = htmlToMarkdown(article.bodyHtml);
  const note = `> 🤖 Machine-translated from Japanese. Original: https://zenn.dev/${ZENN_USER}/articles/${slug}`;
  return {
    article: {
      title: article.title,
      body_markdown: `${note}\n\n${body}\n`,
      published: true,
      tags: buildTags(topics),
      description: buildDescription(body),
    },
  };
}

function loadState() {
  try {
    const arr = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveState(set) {
  fs.writeFileSync(STATE_FILE, JSON.stringify([...set].sort(), null, 2) + "\n");
}

function listArticleSlugs() {
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
}

function readFrontmatter(slug) {
  const md = fs.readFileSync(path.join(ARTICLES_DIR, `${slug}.md`), "utf8");
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { published: false, topics: [] };
  const fm = m[1];
  const published = /^published:\s*true\s*$/m.test(fm);
  let topics = [];
  const t = fm.match(/^topics:\s*(\[.*\])\s*$/m);
  if (t) {
    try {
      topics = JSON.parse(t[1]);
    } catch {
      /* malformed topics line — leave empty */
    }
  }
  return { published, topics };
}

async function fetchTranslatedArticle(slug) {
  const url = `https://zenn.dev/${ZENN_USER}/articles/${slug}?locale=en`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "zenn-devto-crosspost (+https://github.com/kitepon-rgb/zenn-content)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("__NEXT_DATA__ not found");
  const article = findArticle(JSON.parse(m[1]));
  if (!article) throw new Error("article object not found in __NEXT_DATA__");
  return article;
}

async function postToDevto(payload, apiKey) {
  const res = await fetch(DEVTO_API, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/vnd.forem.api-v1+json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (res.status !== 201) {
    throw new Error(`dev.to ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apiKey = process.env.DEVTO_API_KEY;
  if (!apiKey && !dryRun) {
    console.error("DEVTO_API_KEY is not set.");
    process.exit(1);
  }

  const done = loadState();
  const slugs = listArticleSlugs();
  console.log(
    `${slugs.length} articles, ${done.size} already crossposted.${dryRun ? " (dry-run)" : ""}`,
  );

  let posted = 0;
  for (const slug of slugs) {
    if (posted >= MAX_PER_RUN) {
      console.log(`Reached ${MAX_PER_RUN}/run cap; rest picked up next run.`);
      break;
    }
    if (done.has(slug)) continue;

    const { published, topics } = readFrontmatter(slug);
    if (!published) continue;

    let article;
    try {
      article = await fetchTranslatedArticle(slug);
      await sleep(FETCH_DELAY_MS);
    } catch (e) {
      console.warn(`! ${slug}: fetch failed — ${e.message}`);
      continue;
    }

    if (article.isTranslated !== true) {
      console.log(`- ${slug}: not translated yet`);
      continue;
    }
    if (!article.title || !article.bodyHtml) {
      console.warn(`! ${slug}: translated but title/body empty — skipped`);
      continue;
    }

    const payload = buildPayload(article, slug, topics);

    if (dryRun) {
      console.log(`= ${slug}: WOULD POST`);
      console.log(`    title: ${payload.article.title}`);
      console.log(`    tags: ${JSON.stringify(payload.article.tags)}`);
      console.log(`    description: ${payload.article.description}`);
      console.log(`    body_markdown: ${payload.article.body_markdown.length} chars`);
      posted++;
      continue;
    }

    try {
      const created = await postToDevto(payload, apiKey);
      console.log(`+ ${slug}: posted — ${created.url}`);
      done.add(slug);
      posted++;
      if (posted < MAX_PER_RUN) await sleep(POST_DELAY_MS);
    } catch (e) {
      console.error(`! ${slug}: post failed — ${e.message}`);
    }
  }

  if (!dryRun && posted > 0) saveState(done);
  console.log(
    `Done. ${posted} article(s) ${dryRun ? "would be " : ""}posted this run.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
