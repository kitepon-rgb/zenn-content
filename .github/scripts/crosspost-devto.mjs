#!/usr/bin/env node
// Zenn の英語自動翻訳記事を dev.to へ転載する。
// 毎日 cron で起動し、時系列順(post-order.json)で「次の1本」だけを投稿する。
// - 1実行につき最大1本（dev.to のレート制限よけ）
// - 対象がまだ翻訳されていなければ何も投稿しない（時系列順を崩さない）
// - 本文中のブログ内部リンクは、既に投稿済みなら dev.to のリンクへ貼りかえる
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const ZENN_USER = "kitepon";
const DEVTO_API = "https://dev.to/api/articles";
const ZENN_FEED = `https://zenn.dev/${ZENN_USER}/feed?all=1`;
const UA = "zenn-devto-crosspost (+https://github.com/kitepon-rgb/zenn-content)";

// 本文中の内部リンクはブログ slug を使う。大半は Zenn のファイル名と一致するが、
// 初期記事は slug が異なるため対応表で吸収する。
const BLOG_TO_ZENN_SLUG = {
  "claude-code-features": "claude-code-half-features",
  "claude-code-deploy": "claude-code-ssh-deploy",
  "max-plan-review": "claude-max-plan-review",
  "claude-research-implementation": "claude-research-from-papers",
  "livetr-app": "livetr-realtime-translator",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const ARTICLES_DIR = path.join(REPO_ROOT, "articles");
const STATE_FILE = path.join(REPO_ROOT, "crossposted-devto.json");
const ORDER_FILE = path.join(REPO_ROOT, "post-order.json");

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
// 各記事の冒頭にある「ブログからの転載です」お知らせ枠（:::message）は落とす
turndown.addRule("stripReprintNotice", {
  filter: (node) =>
    node.nodeName === "ASIDE" &&
    (node.getAttribute("class") || "").includes("msg") &&
    (node.innerHTML || "").includes("kitepon-rgb.github.io/WebAICoding"),
  replacement: () => "",
});

// __NEXT_DATA__ JSON から記事オブジェクト（isTranslated と bodyHtml を持つ）を再帰探索
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

// 本文中のブログ内部リンクを、dev.to へ投稿済みの記事のリンクへ貼りかえる。
// state は { zennSlug: devtoUrl }。まだ未投稿のリンク先は元のブログURLのまま残す。
export function rewriteInternalLinks(markdown, state) {
  return markdown.replace(
    /\]\(https:\/\/kitepon-rgb\.github\.io\/WebAICoding\/post\/([a-z0-9-]+)\/\)/g,
    (whole, blogSlug) => {
      const zennSlug = BLOG_TO_ZENN_SLUG[blogSlug] || blogSlug;
      const url = state[zennSlug];
      return url ? `](${url})` : whole;
    },
  );
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

export function buildPayload(article, topics, state) {
  const body = rewriteInternalLinks(htmlToMarkdown(article.bodyHtml), state);
  return {
    article: {
      title: article.title,
      body_markdown: `${body}\n`,
      published: true,
      tags: buildTags(topics),
      description: buildDescription(body),
    },
  };
}

function loadState() {
  try {
    const o = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function saveState(state) {
  const sorted = Object.fromEntries(
    Object.keys(state)
      .sort()
      .map((k) => [k, state[k]]),
  );
  fs.writeFileSync(STATE_FILE, JSON.stringify(sorted, null, 2) + "\n");
}

function loadPostOrder() {
  try {
    const a = JSON.parse(fs.readFileSync(ORDER_FILE, "utf8"));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function readTopics(slug) {
  try {
    const md = fs.readFileSync(path.join(ARTICLES_DIR, `${slug}.md`), "utf8");
    const m = md.match(/^topics:\s*(\[.*\])\s*$/m);
    return m ? JSON.parse(m[1]) : [];
  } catch {
    return [];
  }
}

// Zenn フィードから記事 slug を古い順で返す（フィードは新しい順なので反転）
async function fetchFeedSlugs() {
  const res = await fetch(ZENN_FEED, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const xml = await res.text();
  const slugs = [
    ...xml.matchAll(/<link>https:\/\/zenn\.dev\/[^/]+\/articles\/([^<]+)<\/link>/g),
  ].map((m) => m[1]);
  return slugs.reverse();
}

// 時系列順の slug 一覧。post-order.json を基準にし、未登録の新記事はフィード順で末尾に足す
async function getChronologicalOrder() {
  const pinned = loadPostOrder();
  let feed = [];
  try {
    feed = await fetchFeedSlugs();
  } catch (e) {
    console.warn(`Feed fetch failed (${e.message}); using post-order.json only.`);
  }
  const extra = feed.filter((s) => !pinned.includes(s));
  return [...pinned, ...extra];
}

async function fetchTranslatedArticle(slug) {
  const url = `https://zenn.dev/${ZENN_USER}/articles/${slug}?locale=en`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
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

  const state = loadState();
  const order = await getChronologicalOrder();
  const target = order.find((s) => !state[s]);

  if (!target) {
    console.log(`All ${order.length} articles already crossposted.`);
    return;
  }
  console.log(
    `Next in chronological order: ${target} (${Object.keys(state).length}/${order.length} done)`,
  );

  let article;
  try {
    article = await fetchTranslatedArticle(target);
  } catch (e) {
    console.error(`Fetch failed for ${target}: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  if (article.isTranslated !== true) {
    console.log(
      `"${target}" is not translated on Zenn yet. Nothing posted — holding chronological order until it is.`,
    );
    return;
  }
  if (!article.title || !article.bodyHtml) {
    console.error(`"${target}" is translated but title/body is empty.`);
    process.exitCode = 1;
    return;
  }

  const payload = buildPayload(article, readTopics(target), state);

  if (dryRun) {
    console.log(`[dry-run] would post "${target}"`);
    console.log(`  title: ${payload.article.title}`);
    console.log(`  tags: ${JSON.stringify(payload.article.tags)}`);
    console.log(`  description: ${payload.article.description}`);
    console.log(`  body_markdown: ${payload.article.body_markdown.length} chars`);
    return;
  }

  try {
    const created = await postToDevto(payload, apiKey);
    state[target] = created.url;
    saveState(state);
    console.log(`Posted "${target}" -> ${created.url}`);
  } catch (e) {
    console.error(`Post failed for ${target}: ${e.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
