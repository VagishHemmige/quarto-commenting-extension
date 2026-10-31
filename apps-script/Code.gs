/**
 * issue-comments relay: receives a reader's comment from a Quarto page and
 * files it as a GitHub issue, posted by your GitHub App (shown as a bot).
 * One relay serves every site and repository you install the app on. The
 * app's private key stays here, in Script Properties, and is never sent to
 * the browser.
 *
 * Script Properties (Project Settings > Script Properties):
 *   GITHUB_APP_ID   the App ID from the app's settings page
 *   GITHUB_APP_KEY  the app's private key: the whole .pem file, pasted as is
 *   GITHUB_OWNER    your GitHub user name; a page at https://<owner>.github.io/<repo>/
 *                   posts to <owner>/<repo>
 *   REPO_MAP        optional JSON for any other site address, e.g.
 *                   {"https://example.org/plan/": "owner/repo"}
 *   PASSCODE        optional, only if you set `passcode: true` in Quarto
 *   LABEL           optional, defaults to "reader-comment"
 *   MAX_PER_HOUR    optional, defaults to 20 for each repository
 *
 * A repository receives comments only if the app is installed on it.
 */

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const appId = props.getProperty("GITHUB_APP_ID");
    const appKey = props.getProperty("GITHUB_APP_KEY");
    if (!appId || !appKey) return reply_({ ok: false, error: "Commenting is not configured yet." });

    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // Honeypot filled in: pretend success, do nothing.
    if (d.website) return reply_({ ok: true });

    const page = cleanPage_(d.page);
    const repo = page && repoFor_(page, props.getProperty("GITHUB_OWNER"), props.getProperty("REPO_MAP"));
    if (!repo) return reply_({ ok: false, error: "Comments are not accepted from this page." });

    // Counted before the passcode, so wrong guesses use up the allowance too.
    if (!allow_(repo, Number(props.getProperty("MAX_PER_HOUR")) || 20)) {
      return reply_({ ok: false, error: "Too many comments right now. Please try again later." });
    }

    const passcode = props.getProperty("PASSCODE");
    if (passcode && String(d.passcode || "") !== passcode) {
      return reply_({ ok: false, error: "That passcode is not correct." });
    }

    const name = clean_(d.name, 80).replace(/\s+/g, " ");
    const comment = clean_(d.comment, 5000);
    if (!name || !comment) return reply_({ ok: false, error: "Please enter your name and a comment." });

    const token = repoToken_(appId, appKey, repo);
    if (!token) return reply_({ ok: false, error: "Comments are not accepted from this page." });

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

/** Rebuilds the page address from its parts, so it is a plain URL that cannot
 *  break out of the issue's link. Returns "" if it is not a web address. */
function cleanPage_(v) {
  const m = /^(https?):\/\/([A-Za-z0-9.-]+(?::\d{1,5})?)(\/[^?#]*)?/.exec(clean_(v, 500));
  if (!m) return "";
  const host = m[2].toLowerCase();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if (m[1] === "http" && !local) return "";
  const path = (m[3] || "/").replace(/[^A-Za-z0-9._~%\-\/]/g, function (c) {
    return encodeURIComponent(c).replace(/[!'()*]/g, function (x) {
      return "%" + x.charCodeAt(0).toString(16).toUpperCase();
    });
  });
  return m[1] + "://" + host + path;
}

/** Works out which repository a page's comments go to, or null.
 *  REPO_MAP entries win (longest matching address first); otherwise a page
 *  at https://<owner>.github.io/<repo>/... goes to <owner>/<repo>. */
function repoFor_(page, owner, mapJson) {
  const valid = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
  if (mapJson) {
    const map = JSON.parse(mapJson);
    const keys = Object.keys(map).sort(function (a, b) { return b.length - a.length; });
    for (let i = 0; i < keys.length; i++) {
      const prefix = cleanPage_(keys[i]);
      if (prefix && page.indexOf(prefix) === 0) return valid.test(map[keys[i]]) ? map[keys[i]] : null;
    }
  }
  const m = /^https:\/\/([a-z0-9-]+)\.github\.io\/([A-Za-z0-9._-]+)\//.exec(page);
  if (owner && m && m[1] === owner.toLowerCase()) return owner + "/" + m[2];
  return null;
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
  return { title: defuse_(title), body: defuse_(lines.join("\n")) };
}

/** A token for one repository, from the app's installation on it. GitHub's
 *  tokens last an hour; each is cached for 50 minutes. Null if the app is not
 *  installed on that repository. */
function repoToken_(appId, appKey, repo) {
  const cache = CacheService.getScriptCache();
  const key = "token-" + repo.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const jwt = appJwt_(appId, appKey);
  const inst = github_("get", "/repos/" + repo + "/installation", jwt);
  if (inst.code === 404) return null;
  if (inst.code !== 200) throw new Error("GitHub " + inst.code + ": " + inst.text.slice(0, 300));

  const res = github_("post", "/app/installations/" + inst.json.id + "/access_tokens", jwt, {
    repositories: [repo.split("/")[1]],
    permissions: { issues: "write" },
  });
  if (res.code !== 201) throw new Error("GitHub " + res.code + ": " + res.text.slice(0, 300));
  cache.put(key, res.json.token, 3000);
  return res.json.token;
}

/** The short-lived signed token (JWT) that identifies the app to GitHub. */
function appJwt_(appId, appKey) {
  const b64 = function (s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ""); };
  const now = Math.floor(Date.now() / 1000);
  const input = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
    b64(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId).trim() }));
  const sig = Utilities.computeRsaSha256Signature(input, pkcs8_(appKey));
  return input + "." + b64(sig);
}

/** Apps Script signs only with a PKCS#8 key ("BEGIN PRIVATE KEY"), but GitHub
 *  hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"). This accepts either, with or
 *  without its line breaks, and returns PKCS#8. */
function pkcs8_(pem) {
  const pkcs1 = /BEGIN RSA PRIVATE KEY/.test(pem);
  let der = Utilities.base64Decode(pem.replace(/-----[^-]+-----/g, "").replace(/\\n|\s/g, ""))
    .map(function (b) { return b & 255; });
  if (pkcs1) {
    const len = function (n) { return n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]; };
    const rsaAlgorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
    const inner = [0x02, 0x01, 0x00].concat(rsaAlgorithm, [0x04], len(der.length), der);
    der = [0x30].concat(len(inner.length), inner);
  }
  const body = Utilities.base64Encode(der.map(function (b) { return b > 127 ? b - 256 : b; }));
  return "-----BEGIN PRIVATE KEY-----\n" + body.replace(/(.{64})/g, "$1\n").replace(/\n$/, "") +
    "\n-----END PRIVATE KEY-----\n";
}

function createIssue_(token, repo, issue, label) {
  const res = github_("post", "/repos/" + repo + "/issues", token,
    { title: issue.title, body: issue.body, labels: [label] });
  if (res.code !== 201) throw new Error("GitHub " + res.code + ": " + res.text.slice(0, 300));
  return res.json;
}

function github_(method, path, bearer, body) {
  const res = UrlFetchApp.fetch("https://api.github.com" + path, {
    method: method,
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + bearer,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  });
  const text = res.getContentText();
  let json = null;
  try { json = JSON.parse(text); } catch (err) { /* not JSON */ }
  return { code: res.getResponseCode(), text: text, json: json };
}

/** At most `max` requests per repository in any 60 minutes. */
function allow_(repo, max) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cache = CacheService.getScriptCache();
    const key = "rate-" + repo.toLowerCase();
    const hourAgo = Date.now() - 3600000;
    const times = JSON.parse(cache.get(key) || "[]").filter(function (t) { return t > hourAgo; });
    if (times.length >= max) return false;
    times.push(Date.now());
    cache.put(key, JSON.stringify(times), 3700);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function clean_(v, max) {
  return String(v == null ? "" : v).replace(/\r\n?/g, "\n").trim().slice(0, max);
}

/** Stops a comment from reaching beyond its own issue: "@someone" would ping
 *  that user, and "owner/repo#12" or a link to another repository's issue
 *  would add "mentioned this" to it. A zero-width space breaks each one; the
 *  text looks the same. */
function defuse_(s) {
  return s
    .replace(/@(?=[A-Za-z0-9])/g, "@​")
    .replace(/([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+)#(?=\d)/g, "$1#​")
    .replace(/github\.com\/(?=[^\s\/]+\/[^\s\/]+\/(?:issues|pull|discussions)\/\d)/gi, "github​.com/");
}

function escapeInline_(s) {
  return s.replace(/([\\`*_\[\]<>])/g, "\\$1");
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
