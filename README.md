# issue-comments

A Quarto extension that lets readers of your website comment on any passage
and have the comment filed as a GitHub issue. Readers don't need a GitHub
account, or any account.

1. A reader highlights text and clicks **💬 Comment**.
2. They enter their name and comment, and read a notice explaining what will be public.
3. They preview the exact issue, then click **Post publicly**.
4. The issue is created in your repo, posted by your GitHub account, with
   their name, the highlighted passage and a link to the section.

```
reader's browser ──► Google Apps Script (holds your token) ──► GitHub issue
```

Your GitHub token lives only in a Google Apps Script that you own. It is
never sent to the web page.

## Requirements

- A Quarto **website or HTML document** published somewhere public (GitHub
  Pages, Netlify, Quarto Pub, …). PDF and Word output are unaffected.
- A GitHub repository to receive the issues. It doesn't have to be the
  site's repository.
- A Google account, for the free Apps Script relay.

## Install

```bash
quarto add VagishHemmige/quarto-commenting-extension
```

Or copy `_extensions/issue-comments/` into your project's `_extensions/` folder.

## Setup (about 10 minutes, once)

### 1. Make a GitHub token

GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token.

- **Repository access:** Only select repositories → the repo that will receive comments
- **Permissions:** Repository → **Issues: Read and write** (nothing else)
- Note the expiry date. When the token expires, commenting stops until you
  paste a new token into step 2.

### 2. Create the Apps Script relay

1. Go to <https://script.google.com> → **New project**. Name it "issue-comments".
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs). Save.
3. **Project Settings** (gear icon) → **Script Properties** → add:

   | Property | Value |
   |---|---|
   | `GITHUB_TOKEN` | the token from step 1 |
   | `GITHUB_REPO` | `owner/repo` |
   | `SITE_PREFIX` | your site's address, e.g. `https://owner.github.io/repo/`. Recommended, since only pages starting with this can post. |

   Optional: `LABEL` (default `reader-comment`), `MAX_PER_HOUR` (default 20,
   all readers combined), `PASSCODE` (see Options).
4. **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorize when asked. Google warns "Google hasn't verified this app"
   because the script is yours, not a published app: **Advanced → Go to issue-comments**.
6. Copy the **Web app URL** (ends in `/exec`). Opening it in a browser
   should show `"issue-comments relay is running."`

### 3. Turn it on in Quarto

In `_quarto.yml` (whole site) or in one page's front matter (just that page):

```yaml
filters:
  - issue-comments

issue-comments:
  endpoint: https://script.google.com/macros/s/XXXXXXXX/exec
  owner: Jane Doe
  contact: https://janedoe.github.io/contact.html
```

Render, publish, and highlight some text on the live site to test.

## Options

| Option | Default | What it does |
|---|---|---|
| `endpoint` | *(required)* | The Apps Script web app URL. |
| `owner` | the document's `author`, else "the site owner" | The name readers are told will post the issue. |
| `contact` | none (Quarto warns) | Where readers go to change or remove a comment: a contact page, your GitHub profile, or `mailto:you@example.com`. |
| `preview` | `true` | Show readers the exact issue before it posts. |
| `passcode` | `false` | Ask readers for a shared passcode. Also set the `PASSCODE` Script Property. Use it only if spam appears. |
| `page-button` | `false` | Also show a fixed "Comment on this page" button, for comments not tied to a passage. |

## What readers see and what gets posted

**What they're told before posting** (with your `owner` and `contact`):

> Comments are posted publicly as GitHub issues by Jane Doe, together with
> your name, the highlighted text and a link to this section. You can't edit
> or delete a comment after posting; to change or remove one, [contact Jane Doe](#).

**What's sent:** the name and comment they type, the highlighted text (up
to about 1,500 characters), the section heading, and the page address.
Nothing else is sent: no email, no GitHub identity, and nothing about their
browser. The relay never sees IP addresses, though Google keeps its own
request logs. Their name is remembered in their own browser to save retyping.

**What gets posted:**

> **[2.1 Covariates] Should we add BMI?**
>
> **Submitted by:** Jane Roe, via the site's comment form
> **Section:** [2.1 Covariates](https://owner.github.io/repo/plan.html#covariates)
>
> > We will adjust for age and sex.
>
> Should we add BMI?

The issue's author is your GitHub account. Every issue gets the
`reader-comment` label so you can filter them.

## Design decisions, and their limits

- **Names aren't verified.** Anyone can type any name. This is fine for a
  small site; don't treat the name as proof of identity.
- **Comments are public and permanent from the reader's side.** They're told
  this up front and shown a preview. Only you can edit or close an issue.
- **Readers aren't notified of replies,** because they aren't on GitHub. If
  you want to answer, reach out yourself.
- **Spam guards:** a hidden honeypot field, an hourly cap, the
  `SITE_PREFIX` check, and the optional passcode. `@mentions` are
  neutralized so comments can't ping GitHub users from your account.
- **Comments are posted as typed,** and GitHub renders any Markdown in them.

## Maintenance

- **Editing the script:** after changing `Code.gs`, use **Deploy → Manage
  deployments → Edit → Version: New version**, which keeps the same URL. A
  *new deployment* gives a new URL.
- **Changing the issue format:** the page previews the issue text. If you
  change `buildIssue_` in `Code.gs`, update `issueTitle` and `fillPreview` in
  `issue-comments.js` to match.
- **Token expiry:** replace `GITHUB_TOKEN` in Script Properties. No redeploy is needed.

## License

MIT
