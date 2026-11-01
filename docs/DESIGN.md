# Blocks: identity and design

This document says how Blocks looks and feels: the editor, the docs and the bundled blocks.
Every new screen follows it.

## The name and the logo

- The name is **Blocks**, with a capital letter in a sentence ("Blocks lets you…"), and in lowercase in the editor's wordmark: **blocks**.
- The logo is the **shrimp** in `editor/logo/`: a warm, hand-drawn illustration with a thin dark coral outline.
  - `shrimp.png`: large, on a transparent background; `shrimp-256.png`: for the top bar and the docs; `favicon.png`: 64 px; `avatar.png`: a 1024 px square, for profile pictures.
  - The shrimp always sits on a white or cream background, with room around it (at least half its height). It is never stretched, recolored, or given shadows or effects.
  - In the editor's top bar: the shrimp (28 px tall) next to the "blocks" wordmark.

## What the logo says (and where the design comes from)

The shrimp is **simple, warm and handmade**. The design takes exactly that from it, not its color or its shape:

1. **A little, done well.** Few colors, a lot of white, one family of shapes (rounded corners). Nothing "extra".
2. **Warm.** Black is warm (brown), the grays are warm, the backgrounds are cream, never cold gray.
3. **Friendly, not childish.** Rounded shapes and friendly colors, but careful typography, precise alignment and barely visible shadows. No decorative gradients, no glossy effects.
4. **Everything looks drawn by the same hand.** The icons share the same stroke (1.75 px), the same roundness and the same size.

## Colors

For the editor's interface (not for the users' sites: those have their own theme in `site.json`).

| role                    | value     | where it comes from                     |
|-------------------------|-----------|-----------------------------------------|
| accent (coral)          | `#E8562A` | the shrimp's body                       |
| accent pressed          | `#C8431F` |                                         |
| accent dark (text)      | `#A8402C` | the legs and the tail                   |
| accent light            | `#FDEDE4` | background for selection, hover, tiles  |
| accent tint             | `#F8C9B0` | soft selection outlines                 |
| ink                     | `#2B211D` | main text (a warm black)                |
| secondary text          | `#6F625C` |                                         |
| faint text              | `#9C8F88` | hints, small labels                     |
| line                    | `#EAE1DA` | borders                                 |
| strong line             | `#D9CCC3` | borders on hover                        |
| paper                   | `#FFFFFF` | surfaces, cards, fields                 |
| panel                   | `#FAF6F2` | the side panels' background             |
| canvas                  | `#F2ECE6` | the background around the page you edit |
| green (ok)              | `#3E8E5E` | "Saved", success                        |
| red (danger)            | `#C0392B` | deleting, errors (warm too)             |
| danger pressed          | `#A9311F` | the delete button, pressed              |
| danger dark (text)      | `#7D2A1F` | the text of warnings                    |
| danger light            | `#FBEAE7` | the background of warnings and errors   |
| danger tint             | `#EFC4BD` | the outline of warnings                 |

The editor's CSS variables: `--accent`, `--accent-pressed`, `--accent-dark`, `--accent-light`, `--accent-tint`, `--ink`, `--text-2`, `--text-faint`, `--line`, `--line-strong`, `--paper`, `--panel`, `--canvas`, `--ok`, `--danger`, `--danger-pressed`, `--danger-dark`, `--danger-light`, `--danger-tint`.

The golden rule: **coral is for what you can press or what is selected**, not for decoration. On an ordinary screen, coral shows up in 3 to 5 places, not everywhere.

## Typography

- Font: `ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI Variable", system-ui, sans-serif`. No downloaded fonts: Blocks has no dependencies.
- Sizes: text 14 px, labels 13 px, hints 12 px, panel titles 15 px. Weights: 400 and 600 (and 500 for block names). Nothing below 12 px.
- Line height 1.45. Titles aren't in all capitals (`text-transform` only on the small category labels, with `letter-spacing: .06em`).

## Shapes, space, motion

- Corner radius: fields and buttons 10 px, cards and tiles 12 px, panels and dialogs 16 px, pills 999 px.
- Concentric corners: whatever sits inside a rounded shape, close to its edge, gets the shape's radius minus the distance to the edge (the thumbnail in the hover card: 16 − 4 = 12).
- Space on a 4 px grid: 8, 12, 16, 24, 32.
- Shadows: a single one, warm and discreet: `0 10px 30px -18px rgba(60, 30, 20, .35)`. Only on things that float (menus, dialogs, the ghost while dragging).
- Motion: 150 ms `ease-out` for hover and for things that appear; 220 ms for things that move. `prefers-reduced-motion` is respected. What appears next to an element comes from that element (4 px), not from below.
- Visible focus: a 3 px ring, `rgba(232, 86, 42, .35)`, around anything you can press. A row gets the same background on focus as on hover. The one exception: the search field in the "+" menu is the menu's head, with no border and no ring (the cursor blinks in it).
- Switches (the tabs on the left, the screen widths, the Shape of a block on the canvas, the EN / RO language switch): an `--canvas` background, with the chosen option on `--paper`. One drawing for "choose one of a few".
- Texts of a few lines in cards use `text-wrap: pretty`, so the last line isn't left with a single word.

## The palette and the hover card

- **The palette**: the category title (12 px, capitals) stays stuck under the search field while you scroll. A row: a 36 px tile, the name (500) on one line, the description (12 px, `--text-faint`) on the second. The "server" label opens the description line: a pill with an `--line` outline and no background, so it doesn't compete with the name.
- **The hover card** (320 px, radius 16, the single shadow) has three parts. At the top, the live thumbnail (a window onto the page, 4 px from the edge, radius 12, with an `--line` frame above it); a short block sits in the middle of the window. Then the tile and the name (15 px, 600), what the block does (13 px: the description in `--ink`, the tip in `--text-2`) and "Settings" (12 px). At the bottom, on `--panel` and separated by a line, the gesture: "Drag it onto the page or click…". The top edge of the thumbnail lines up with the top edge of the block in the palette.
- **The "+" menu** uses the same rows; the active row has an `--accent-light` background, and its tile turns white.
- **The Free canvas, while you move a block**: the 12 columns are bands of `rgba(232, 86, 42, .05)`, with no drawn edges; the rows are 1 px threads of `rgba(232, 86, 42, .10)`. You barely see them: they help, they don't decorate.

## Icons

- A 1.75 px line, rounded corners, on a 24 square, no fill (`fill: none`, `stroke: currentColor`).
- The same hand, in numbers: large outlines sit between 3 and 21, large circles have a radius of 8.5–9, the drawing is centered on (12, 12), corners are rounded by 1.25–3, and dots are lines 0.01 long. Two icons that could be confused get different drawings (e.g. `members`: two figures; `team`: a card with a portrait; `quote`: the ” mark).
- The "×" in search fields is drawn the same way (not the browser's blue one).
- Every component has a **named** icon (e.g. `icon: "text"`), drawn in the same style, shown in a rounded tile (36 px) on an accent-light background. A component written by someone else can use an emoji; the editor shows it in the same tile.
- Known icon names: `text, heading, image, gallery, video, button, cards, columns, section, spacer, navbar, footer, hero, faq, quote, form, login, signup, account, members, list, link, star, calendar, code, block, stats, timeline, logos, press, locations, pricing, hours, team, events, cta, image-text, map, social, canvas`. A word that isn't on the list (a misspelled name) gets the generic `block` icon.

## Words

The editor talks like a person, not like a programmer:

| not                 | but                                  |
|---------------------|--------------------------------------|
| slot                | area                                 |
| props, properties   | settings                             |
| render, rendering   | display                              |
| commit, submit      | save, send                           |
| string, boolean     | text, yes/no                         |
| error 404           | page not found                       |

Messages say what happened and what you can do: "Can't reach the server. Is “node blocks.js dev” still running?"

The editor speaks English, and Romanian as a second language (the EN / RO switch in the top bar). Romanian texts use the correct diacritics, ș and ț with a comma below, and the „…” quotes.

## The philosophy

The ground rules (three gestures, one material, eight rules) are in [PHILOSOPHY.md](PHILOSOPHY.md).
