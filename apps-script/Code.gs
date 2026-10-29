/**
 * issue-comments relay: receives a reader's comment from the Quarto page and
 * files it as a GitHub issue using YOUR token. The token stays here, in
 * Script Properties, and is never sent to the browser.
 *
 * Script Properties (Project Settings > Script Properties):
 *   GITHUB_TOKEN   fine-grained token, this repo only, Issues: Read and write
 *   GITHUB_REPO    owner/repo
 *   SITE_PREFIX    optional, e.g. https://owner.github.io/repo/  (rejects other pages)
 *   PASSCODE       optional, only if you set `passcode: true` in Quarto
 *   LABEL          optional, defaults to "reader-comment"
 *   MAX_PER_HOUR   optional, defaults to 20 (all readers combined)
 */

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty("GITHUB_TOKEN");
    const repo = props.getProperty("GITHUB_REPO");
    if (!token || !repo) return reply_({ ok: false, error: "Commenting is not configured yet." });

    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // Honeypot filled in: pretend success, do nothing.
    if (d.website) return reply_({ ok: true });

    const passcode = props.getProperty("PASSCODE");
    if (passcode && d.passcode !== passcode) {
      return reply_({ ok: false, error: "That passcode is not correct." });
    }

    const prefix = props.getProperty("SITE_PREFIX");
    const page = clean_(d.page, 500);
    if (prefix && page.indexOf(prefix) !== 0) {
      return reply_({ ok: false, error: "Comments are not accepted from this page." });
    }

    const name = clean_(d.name, 80).replace(/\s+/g, " ");
    const comment = clean_(d.comment, 5000);
    if (!name || !comment) return reply_({ ok: false, error: "Please enter your name and a comment." });

    if (!allow_(Number(props.getProperty("MAX_PER_HOUR")) || 20)) {
      return reply_({ ok: false, error: "Too many comments right now. Please try again later." });
    }

    const issue = createIssue_(token, repo, buildIssue_(d, name, comment, page),
      props.getProperty("LABEL") || "reader-comment");
    return reply_({ ok: true, number: issue.number, url: issue.html_url });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: "Something went wrong. Please try again." });
  }
}

/** Lets you open the /exec URL in a browser to check the deployment works. */
function doGet() {
  return reply_({ ok: true, message: "issue-comments relay is running." });
}

/** The page previews this text before posting: keep issueTitle() and
 *  fillPreview() in issue-comments.js in step with any change here. */
function buildIssue_(d, name, comment, page) {
  const section = clean_(d.section, 200).replace(/\s+/g, " ");
  const anchor = clean_(d.anchor, 200).replace(/[^A-Za-z0-9_\-:.]/g, "");
  const quote = clean_(d.quote, 1600);
  const link = page + (anchor ? "#" + anchor : "");

  const firstWords = comment.replace(/\s+/g, " ").slice(0, 60) + (comment.length > 60 ? "…" : "");
  const title = (section ? "[" + section.slice(0, 60) + "] " : "") + firstWords;

  const lines = [
    "**Submitted by:** " + escapeInline_(name) + ", via the site's comment form",
    "**Section:** [" + escapeInline_(section || "Page") + "](" + link + ")",
    "",
  ];
  if (quote) {
    lines.push(quote.split("\n").map(function (l) { return "> " + l; }).join("\n"), "");
  }
  lines.push(comment);
  return { title: noMentions_(title), body: noMentions_(lines.join("\n")) };
}

function createIssue_(token, repo, issue, label) {
  const res = UrlFetchApp.fetch("https://api.github.com/repos/" + repo + "/issues", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    payload: JSON.stringify({ title: issue.title, body: issue.body, labels: [label] }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 201) {
    throw new Error("GitHub " + res.getResponseCode() + ": " + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

/** Simple shared limit: at most `max` issues per rolling hour. */
function allow_(max) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cache = CacheService.getScriptCache();
    const key = "count-" + Math.floor(Date.now() / 3600000);
    const n = Number(cache.get(key) || 0);
    if (n >= max) return false;
    cache.put(key, String(n + 1), 3700);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function clean_(v, max) {
  return String(v == null ? "" : v).replace(/\r\n?/g, "\n").trim().slice(0, max);
}

/** Stop "@someone" in a comment from pinging GitHub users. */
function noMentions_(s) {
  return s.replace(/@(?=[A-Za-z0-9])/g, "@​");
}

function escapeInline_(s) {
  return s.replace(/([\\`*_\[\]<>])/g, "\\$1");
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
