/* ============================================================
   Blog index builder.

   Reads every post file in blog/, then rewrites two things:
     - the post list in blog/index.html
     - the blog URLs in sitemap.xml

   So the whole publishing workflow is: copy the template, write the
   post, save it in this folder, run this. Nothing else to update by hand.

   Run it by double-clicking "Publish blog.bat", or from a terminal:
       node blog/build.js

   Nothing to install. It only uses what ships with Node.

   Which files count as posts:
     - blog/anything.html                    -> a post
     - blog/_anything.html                   -> ignored (template, examples)
     - blog/index.html                       -> ignored
     - any post containing the noindex line  -> a draft, kept off the site
   ============================================================ */

const fs = require("fs");
const path = require("path");

const BLOG_DIR = __dirname;
const ROOT = path.join(__dirname, "..");
const INDEX_FILE = path.join(BLOG_DIR, "index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");
const SITE = "https://jackjaillet.com";
const WORDS_PER_MINUTE = 220;

/* ---------- tiny helpers ---------- */

// Pull the first capture group out of a pattern, or null.
const grab = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

// Collapse the whitespace that hand-written HTML picks up across line breaks.
const tidy = (s) => (s ? s.replace(/\s+/g, " ").trim() : s);

const stripTags = (s) => (s ? s.replace(/<[^>]+>/g, "") : "");

/* ---------- read one post ---------- */

function readPost(file) {
  const slug = path.basename(file, ".html");
  const raw = fs.readFileSync(file, "utf8");
  const problems = [];

  // Comments come out first and everything below reads the stripped copy. The
  // template explains itself in comments that quote real tags and placeholder
  // names, and without this those instructions get parsed as if they were the
  // post. It also means commented-out markup is properly ignored.
  const html = raw.replace(/<!--[\s\S]*?-->/g, "");

  // A leftover {{PLACEHOLDER}} means the post was never finished. Publishing
  // it would put "{{TITLE}}" on the live site, so it's an error, not a warning.
  const leftovers = [...new Set(html.match(/\{\{[A-Z_]+\}\}/g) || [])];

  // The noindex line is how a post says "not ready yet".
  // any robots tag that says noindex counts: "noindex, nofollow", a self-closing "/>", and so on
  const isDraft = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);

  const head = html.split(/<article class="post-body"/)[0];

  const title = tidy(grab(head, /<h1 class="post-title">([\s\S]*?)<\/h1>/));
  const dateIso = grab(head, /<time datetime="([^"]+)"/);
  const dateHuman = tidy(grab(head, /<time datetime="[^"]+">([\s\S]*?)<\/time>/));
  const readTime = grab(head, /<span>\s*(\d+)\s*min read\s*<\/span>/);

  // The standfirst is the post's own summary. Fall back to the meta
  // description, which the template fills with the same sentence.
  const summary =
    tidy(grab(head, /<p class="post-lede">([\s\S]*?)<\/p>/)) ||
    tidy(grab(head, /<meta name="description" content="([^"]*)"/));

  // The header image doubles as the card thumbnail.
  const heroBlock = grab(html, /<figure class="post-hero[^"]*">([\s\S]*?)<\/figure>/);
  const thumb = heroBlock ? grab(heroBlock, /<img[^>]*\ssrc="([^"]+)"/) : null;
  const thumbAlt = heroBlock ? grab(heroBlock, /<img[^>]*\salt="([^"]*)"/) : null;
  const thumbW = heroBlock ? grab(heroBlock, /<img[^>]*\swidth="(\d+)"/) : null;
  const thumbH = heroBlock ? grab(heroBlock, /<img[^>]*\sheight="(\d+)"/) : null;

  // Word count off the body only, so nav and footer don't inflate it.
  const body = html.split(/<article class="post-body"[^>]*>/)[1] || "";
  const words = stripTags(body.split(/<div class="post-end">/)[0])
    .split(/\s+/)
    .filter(Boolean).length;
  const estimate = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  if (!title) problems.push('no <h1 class="post-title"> found');
  if (!dateIso) problems.push("no <time datetime=\"...\"> found");
  if (!summary) problems.push("no summary (post-lede or meta description)");
  if (dateIso && !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    problems.push(`date "${dateIso}" should look like 2026-08-10`);
  }

  return {
    slug, file, title, dateIso, dateHuman, readTime, summary,
    thumb, thumbAlt, thumbW, thumbH, words, estimate, isDraft, leftovers, problems,
  };
}

/* ---------- build the markup ---------- */

function card(post) {
  const meta = [`              <time datetime="${post.dateIso}">${post.dateHuman || post.dateIso}</time>`];
  if (post.readTime) {
    meta.push('              <span class="dot" aria-hidden="true">&middot;</span>');
    meta.push(`              <span>${post.readTime} min read</span>`);
  }

  const size = [
    post.thumbW ? ` width="${post.thumbW}"` : "",
    post.thumbH ? ` height="${post.thumbH}"` : "",
  ].join("");

  const thumb = post.thumb
    ? [
        '          <div class="entry-thumb">',
        `            <img src="${post.thumb}" alt="${post.thumbAlt || ""}"${size} loading="lazy" decoding="async">`,
        "          </div>",
      ]
    : [];

  return [
    '        <article class="entry reveal">',
    '          <div class="entry-body">',
    '            <p class="entry-meta">',
    ...meta,
    "            </p>",
    `            <h2><a href="/blog/${post.slug}">${post.title}</a></h2>`,
    `            <p>${post.summary}</p>`,
    '            <span class="entry-more">Read more &rarr;</span>',
    "          </div>",
    ...thumb,
    "        </article>",
  ].join("\n");
}

function emptyState() {
  return [
    '      <div class="blog-empty reveal">',
    '        <p class="blog-empty-kicker">Coming soon</p>',
    '        <p class="blog-empty-note">The first post is on its way. In the meantime, <a href="/updates">see what I&rsquo;m up to now</a>.</p>',
    "      </div>",
  ].join("\n");
}

function postList(posts) {
  if (!posts.length) return emptyState();
  return ['      <div class="entries">', "", posts.map(card).join("\n\n"), "", "      </div>"].join("\n");
}

function sitemapEntries(posts) {
  return posts
    .map((p) =>
      [
        "  <url>",
        `    <loc>${SITE}/blog/${p.slug}</loc>`,
        `    <lastmod>${p.dateIso}</lastmod>`,
        "    <changefreq>yearly</changefreq>",
        "    <priority>0.6</priority>",
        "  </url>",
      ].join("\n")
    )
    .join("\n");
}

/* ---------- swap generated blocks into a file ---------- */

function replaceBlock(file, name, body) {
  const original = fs.readFileSync(file, "utf8");
  const crlf = original.includes("\r\n");
  const src = original.replace(/\r\n/g, "\n");

  const start = new RegExp(`([ \\t]*<!--\\s*${name}:START[\\s\\S]*?-->)`);
  const end = new RegExp(`([ \\t]*<!--\\s*${name}:END\\s*-->)`);
  const s = src.match(start);
  const e = src.match(end);

  if (!s || !e) {
    throw new Error(
      `${path.relative(ROOT, file)} is missing its ${name}:START / ${name}:END comments. ` +
        `Put them back around the block this script writes.`
    );
  }

  const from = src.indexOf(s[0]) + s[0].length;
  const to = src.indexOf(e[0]);
  if (to < from) throw new Error(`${name}:END comes before ${name}:START in ${path.relative(ROOT, file)}`);

  const next = src.slice(0, from) + "\n" + body + "\n" + src.slice(to);
  const out = crlf ? next.replace(/\n/g, "\r\n") : next;

  if (out === original) return false;
  fs.writeFileSync(file, out);
  return true;
}

/* ---------- run ---------- */

function main() {
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".html") && f !== "index.html" && !f.startsWith("_"))
    .map((f) => path.join(BLOG_DIR, f));

  const all = files.map(readPost);

  const broken = all.filter((p) => p.leftovers.length || p.problems.length);
  const drafts = all.filter((p) => !broken.includes(p) && p.isDraft);
  const posts = all
    .filter((p) => !broken.includes(p) && !p.isDraft)
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : a.title.localeCompare(b.title)));

  console.log("");
  for (const p of posts) {
    const note = p.readTime && Math.abs(p.readTime - p.estimate) > 1 ? `  (says ${p.readTime} min, reads more like ${p.estimate})` : "";
    console.log(`  published  ${p.dateIso}  ${p.slug}${note}`);
  }
  for (const p of drafts) console.log(`  draft      ${" ".repeat(10)}${p.slug}  - has the noindex line, so it stays hidden`);
  for (const p of broken) {
    console.log(`  SKIPPED    ${" ".repeat(10)}${p.slug}`);
    for (const problem of p.problems) console.log(`             ${problem}`);
    if (p.leftovers.length) console.log(`             still has ${p.leftovers.join(", ")} to fill in`);
  }
  if (!all.length) console.log("  No post files yet. The blog page will say Coming soon.");

  const indexChanged = replaceBlock(INDEX_FILE, "POSTS", postList(posts));
  const sitemapChanged = replaceBlock(SITEMAP_FILE, "BLOG", sitemapEntries(posts));

  console.log("");
  console.log(`  blog/index.html  ${indexChanged ? "updated" : "already up to date"}`);
  console.log(`  sitemap.xml      ${sitemapChanged ? "updated" : "already up to date"}`);
  console.log("");
  console.log(
    posts.length === 0
      ? "  Done. No posts published, so the blog page shows the Coming soon panel."
      : `  Done. ${posts.length} post${posts.length === 1 ? "" : "s"} on the blog page.`
  );
  console.log("");

  // Non-zero exit so a broken post is impossible to miss.
  if (broken.length) {
    console.log(`  ${broken.length} file${broken.length === 1 ? " was" : "s were"} skipped. Fix the notes above and run this again.`);
    console.log("");
    process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  console.log("");
  console.log("  Build stopped: " + err.message);
  console.log("");
  process.exitCode = 1;
}
