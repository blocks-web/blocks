# Contributing to Blocks

Thank you for wanting to help. Blocks has one big rule: **simple, yet everything possible.** Before anything else, please read [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md). It's short, and it explains why Blocks looks the way it does.

## Before you write code

- **An idea?** Open an issue with the **Idea** form and describe the problem, not the solution. Many good ideas turn out to be a new block, with no change to the core.
- **A bug?** Open an issue with the **Bug** form. The exact steps to reproduce it are worth more than anything else.
- **A new block?** It's one file in `components/`. Start with `node blocks.js component my-block` and read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **A security problem?** Please don't make it public: see [SECURITY.md](SECURITY.md).

## How the code is written

- No npm dependencies and no build step. Node.js 22 or newer, and a browser.
- Code, comments and docs are in English: plain words, short sentences, American spelling.
- The editor speaks English and Romanian. Every text in the editor goes through `t()` in `editor/i18n.js`, with its Romanian translation in the same change; Romanian uses the correct diacritics, ș and ț with a comma below, not with a cedilla.
- What a block writes by itself for visitors goes in its `WORDS = { en, ro }` table. What the server says to visitors goes in `server/i18n.js`.
- Two spaces, double quotes, semicolons.
- Everything that comes from a user or a visitor goes through `html`, `url()` or a check on the server. Never straight into HTML, CSS or JavaScript.
- Every new behavior comes with its own tests.

## Before you send

```bash
npm test
```

Every test must pass. Then open a pull request that says, in plain words, what it changes and why. The pull request template has a short checklist.

## Be kind

Everyone who takes part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
