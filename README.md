# issue-comments

A Quarto extension that lets readers of your website comment on any passage
and have the comment filed as a GitHub issue. Readers don't need a GitHub
account, or any account.

1. A reader highlights text and clicks **💬 Comment**.
2. They enter their name and comment, and read a notice explaining what will be public.
3. They preview the exact issue, then click **Post publicly**.
4. The issue is created in the page's repository, posted by your own GitHub
   App (shown as a bot, not as you), with their name, the highlighted
   passage and a link to the section.

```
reader's browser ──► Google Apps Script (holds your app's key) ──► GitHub issue
```

The app's private key lives only in a Google Apps Script that you own. It
is never sent to the web page. One relay serves all your sites: it works
out the repository from the page's address, and only posts to repositories
where you installed the app.

How it works, file by file: <https://vagishhemmige.github.io/quarto-commenting-extension/>

## Requirements

- A Quarto **website or HTML document** published somewhere public (GitHub
  Pages, Netlify, Quarto Pub, …). PDF and Word output are unaffected.
- A GitHub repository to receive the issues. It doesn't have to be the
  site's repository.
- A Google account, for the free Apps Script relay.
- A GitHub App of your own, with **Issues: Read and write** only. Creating
  one takes a few minutes and is covered in the setup.

## Install

```bash
quarto add VagishHemmige/quarto-commenting-extension
```

Or copy `_extensions/issue-comments/` into your project's `_extensions/` folder.

## Setup (about 15 minutes, once)

1. Create a GitHub App with **Issues: Read and write** and nothing else,
   and install it on the repositories that will receive comments.
2. Deploy [`apps-script/Code.gs`](apps-script/Code.gs) as a Google Apps
   Script web app, with the app's ID and private key and your GitHub user
   name in its Script Properties.
3. Turn it on in `_quarto.yml` with the web app's `/exec` URL:

   ```yaml
   filters:
     - issue-comments

   issue-comments:
     endpoint: https://script.google.com/macros/s/XXXXXXXX/exec
     owner: Jane Doe
     contact: https://janedoe.github.io/contact.html
   ```

Each further site needs only step 3, and the app installed on its
repository, with the same `endpoint`.
Step-by-step instructions, with screenshots and troubleshooting:
[Installation](https://vagishhemmige.github.io/quarto-commenting-extension/quarto/installation.html).
Every setting, including the passcode, custom wording and maintenance: [Options](https://vagishhemmige.github.io/quarto-commenting-extension/quarto/options.html).
Upgrading a relay from version 0.2.0, which used a personal token: [Moving an older relay to the app](https://vagishhemmige.github.io/quarto-commenting-extension/quarto/installation.html#moving-an-older-relay-to-the-app).

## What readers see and what gets posted

**What they're told before posting** (with your `owner` and `contact`; all
of the wording can be changed with `text:`):

> Comments are posted publicly as GitHub issues on behalf of Jane Doe,
> together with your name, the highlighted text and a link to this section.
> You can't edit or delete a comment after posting; to change or remove one,
> [contact Jane Doe](#). Your name is saved in this browser so you don't
> have to retype it.

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

The issue's author is your app's bot, such as `jdoe-comments[bot]`, so
reader comments are easy to tell from your own, and GitHub notifies you of
them. Every issue gets the `reader-comment` label so you can filter them.

## Design decisions, and their limits

- **Names aren't verified.** Anyone can type any name. This is fine for a
  small site; don't treat the name as proof of identity.
- **Comments are public and permanent from the reader's side.** They're told
  this up front and shown a preview. Only you can edit or close an issue.
- **Readers aren't notified of replies,** because they aren't on GitHub. If
  you want to answer, reach out yourself.
- **Spam guards:** a hidden honeypot field, an hourly cap for each
  repository (which also slows passcode guessing), posting only to
  repositories where the app is installed, and the optional passcode.
  `@mentions`, `owner/repo#12` references and links to other repositories'
  issues are defused, so a comment can't ping users or show up on other
  people's issues.
- **Comments are posted as typed,** and GitHub renders any Markdown in them.

## License

MIT
