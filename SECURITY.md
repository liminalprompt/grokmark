# Security

If you find a security problem in Grokmark, report it privately through [GitHub's vulnerability reporting](https://github.com/liminalprompt/grokmark/security/advisories/new) rather than opening a public issue. Include what you found and how to reproduce it. You will get a reply within a week.

What counts: anything that lets a website, a post, or another extension read Grokmark's stored keys, send requests on its behalf, or make the routine act on text inside a post. What does not count: the fact that keys are stored unencrypted in Chrome's extension storage, which is documented in [Privacy and security](docs/privacy-and-security.md) and is the same as every other extension.

Grokmark has no server, so there is nothing to patch on our side; fixes ship as a new release.
