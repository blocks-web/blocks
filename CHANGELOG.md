# Changelog

What changes in each version of Blocks, newest first. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/). While Blocks is in preview (0.x), a new minor version can still rename things.

## [Unreleased]

## [0.1.0] - 2026-11-01

The first public preview, **Preview 0.1**. Feedback is very welcome.

### The editor

- Drag and drop blocks from the palette onto the page, or press **+** right where you want one.
- A hover card for every block: what it does, a tip and a live preview.
- A settings panel for each block, built from its `props`, with a formatting bar for **bold**, *italic* and links.
- Autosave, undo and redo for every edit; a Structure view; desktop, tablet and phone widths.
- A shared header and footer, edited once and shown on every page.
- The Free canvas: blocks placed anywhere on a 12-column grid, resized, shaped (rectangle, rounded, circle) and layered, and stacked by themselves on phones.
- Site settings: the name, the language, the colors and the font.
- The editor in English, with Romanian as a second language (the **EN / RO** switch).

### Blocks

- 36 ready-made blocks: Cover, Image and text, Cards, Call to action, Numbers, Logos, Free canvas, Text, Image, Gallery, Video, List, Button, Quote, Prices, Team, FAQ, News, Events, Timeline, Press, Address, Opening hours, Map, Social media, Form, Log in, Sign up, My account, Members only, Header, Footer, Section, Columns, Spacer and Embed code.
- A block is one JavaScript file, with an optional server part (`<id>.server.js`) that never reaches the browser.
- `node blocks.js component <id>` creates a new block from a commented template.

### The site

- Accounts, members-only pages and the "Members only" block, with passwords stored as scrypt hashes.
- Forms with the fields you choose, checked on the server and saved in `data/messages.json` (`node blocks.js messages`).
- Visitor messages in English or Romanian, following the site's language.
- Strict safety rules (Content-Security-Policy) on every page, relaxed only on pages with custom code.
- Publishing as static files (`node blocks.js build`, with `--base` for a subfolder such as GitHub Pages) or with the server (`node blocks.js start`). The static export leaves out the members-only pages and the menu links to them.
- A demo site, Luna Café, to try everything right away; you can also [see it live](https://blocks-web.github.io/blocks/).

[Unreleased]: https://github.com/blocks-web/blocks/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/blocks-web/blocks/releases/tag/v0.1.0
