# Security

## Reporting a problem

Found a vulnerability in Blocks? **Please don't open a public issue.** Report it privately from the repository's page on GitHub: the **Security** tab → **Report a vulnerability**. Only the Blocks team can see the report.

As far as you can, tell us:

- the version you use (`version` in `package.json`) and your Node.js version;
- the exact steps that reproduce the problem;
- what an attacker could do with it.

We confirm we've received it within 3 business days, and we keep you posted until it's fixed. If you like, we'll thank you by name when we publish the fix.

## Supported versions

During the preview (0.x), security fixes go into the latest release only.

## How Blocks keeps sites safe

In short (the details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), under "Safety"):

- The editor runs only on your computer, never on the public server, and on a different address from the site.
- Everything a visitor types is always treated as text, never as code.
- Passwords are stored as scrypt hashes, never in plain text.
- Published pages have strict safety rules (Content-Security-Policy), relaxed only on pages with code the owner pasted in, and the export says which ones.
