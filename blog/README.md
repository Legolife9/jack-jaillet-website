# How to publish a post

Three steps: copy the template, write the post, double-click **Publish blog.bat**.

That last step is what adds the post to the blog page and the sitemap, so
there's no list to keep in sync by hand. If you never run it, the post exists
but nothing links to it.

## 1. Make the file

Copy `blog/_template.html` to `blog/your-post-slug.html`.

The filename becomes the URL, so keep it lowercase with dashes and no spaces:
`blog/first-week-at-isenberg.html` → `jackjaillet.com/blog/first-week-at-isenberg`

Two files in this folder start with an underscore, and the underscore is what
keeps them off the site. Don't rename them, and don't edit them:

- `_template.html` — the master copy you copy from
- `_example-post.html` — a finished post, to look at when the template's
  placeholders aren't clear

## 2. Fill in the placeholders

Search the new file for `{{` and replace every one. They appear more than once
each, so use find-and-replace rather than hunting for them.

| Placeholder      | What to put                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| `{{TITLE}}`      | The post title                                                          |
| `{{SLUG}}`       | The filename without `.html`, e.g. `first-week-at-isenberg`              |
| `{{SUMMARY}}`    | One or two sentences. Google, LinkedIn, and the blog page all show this. |
| `{{DATE_ISO}}`   | `2026-08-10`                                                            |
| `{{DATE_HUMAN}}` | `August 10, 2026`                                                       |
| `{{READ_TIME}}`  | A number. Word count ÷ 220, rounded. The build tells you if you're off.  |
| `{{OG_IMAGE}}`   | Social preview image — normally the same file as the header image, e.g. `/assets/blog/rehearsal.jpg`. If the post has no image, use `/assets/og-image.jpg`. |

Miss one and the build leaves that post off the blog page and the sitemap,
and tells you which one you missed. The file itself still goes live with
the rest of the site, `{{TITLE}}` and all, at its own address. So keep an
unfinished post out of `blog/` (or keep the draft line in it) until it's done.

## 3. Write it

**The header image** is the `<figure class="post-hero">` up in the `<header>`,
above the body. That's the big picture at the top of the post, and it doubles
as the thumbnail on the blog page. Point it at your file, write the alt text,
and use the same file for `{{OG_IMAGE}}` so it's also the preview when someone
shares the post. If the post has no picture, delete the whole `<figure>` — the
header works without it and the card just goes full-width.

The rest goes inside `<article class="post-body">`. The template already
contains one working example of every block you can use — paragraph, heading,
list, image, wide image, side-by-side images, pull quote, callout box, divider
— each with a comment above it explaining what it does.

Keep the blocks you want, delete the ones you don't, and replace the example
text with yours. Open `_template.html` in a browser if you want to see them all
rendered before you start.

Two rules that matter: every paragraph needs its own `<p>` tag (blank lines do
nothing), and headings go `h2` then `h3`, never skipping a level.

## 4. Publish

Double-click **`Publish blog.bat`**. A black window opens, lists what it found,
and waits for a keypress.

```
  published  2026-08-10  first-week-at-isenberg

  blog/index.html  updated
  sitemap.xml      updated

  Done. 1 post on the blog page.
```

It reads the title, date, summary, read time, and header image straight out of
your post file, then rewrites the list on `blog/index.html` and the blog URLs
in `sitemap.xml`. Newest post goes first automatically.

Run it again whenever you change a title, date, or summary — the blog page
won't pick the change up on its own.

If you'd rather use a terminal, it's the same thing:

```bash
node blog/build.js
```

### Drafts

Near the top of every post copied from the template there's a line marked
**DRAFT SWITCH**:

```html
<meta name="robots" content="noindex">
```

While that line is there, the post is a draft — it stays off the blog page and
Google ignores it, even though the file is on the site. Delete the line when
you're ready and publish again.

### What the build will not do

It won't touch anything between the `POSTS:START` / `POSTS:END` comments'
surroundings, and it never edits your post files. If you hand-edit the list
inside those comments on `blog/index.html`, your edit disappears the next time
you publish. Everything else on that page is yours to change.

---

## Images

Put post images in `assets/blog/`. Reference them from the post as
`/assets/blog/filename.jpg` (leading slash, always).

Before you upload:

- **Resize.** Nothing wider than 1600px. A photo straight off the camera is
  6000px wide and 12MB, which will make the page crawl on a phone.
- **Set the real dimensions.** The `width` and `height` on the `<img>` tag must
  match the actual pixel size of the file. That's what stops the page jumping
  around while images load.
- **Write the alt text.** `alt="Describe what is in the photo"` — say what
  someone would miss if they couldn't see it. Leave it as `alt=""` only when
  the caption already says everything.
- **JPG for photos, PNG for screenshots and graphics.**

The image layouts, all set as classes on the `<figure>` tag:

| Class                     | Result                                            |
| ------------------------- | ------------------------------------------------- |
| `post-hero`               | The header image at the top. One per post.        |
| `post-figure`             | In the body, same width as the text               |
| `post-figure wide`        | In the body, breaks out past the text             |
| `post-figure pair`        | Two images side by side, stacks on phones         |
| `crop-wide`               | Add to either one to force 16:9                   |
| `crop-square`             | Add to either one to force 1:1                    |

The header image loads `fetchpriority="high"` because it's the first thing on
screen; body images use `loading="lazy"` so they only load when scrolled to.
The template already has this right — just don't swap the attributes when you
copy a figure from one spot to the other.

---

## Checking your work before it's live

Preview the site locally, then look at the new post in a browser. Check it on a
narrow window too — everything is responsive, but a mistyped tag usually shows
up there first.

Three things that are easy to get wrong:

1. A missing `</p>` or `</div>` — the rest of the page will look broken.
2. An image path without the leading slash — the image won't load.
3. Forgetting to publish, so the post is live but nothing links to it.

## When there are no posts

The blog page shows a **Coming soon** panel instead of an empty list. That's
where it is right now. As soon as one post publishes, the panel is replaced by
the list — nothing to switch on.
