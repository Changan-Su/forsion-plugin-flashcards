---
name: flashcard-format
description: Read, create, and edit Forsion flashcard decks (`.deck.md`) without corrupting card IDs or FSRS review state. Use this whenever the user asks you to build, extend, or clean up flashcards / spaced-repetition decks ("make flashcards from this note", "add cards to my deck", "fix my deck file").
version: 1.0.0
author: Forsion
category: Forsion
---

# Flashcard deck format (`.deck.md`)

## Mental model

A deck is a plain markdown file with two layers:

1. **Cards** — the visible body. Each card is a `<!-- card:ID -->` marker followed by a `Q:` block and an `A:` block.
2. **Review state** — one single-line JSON map in the frontmatter (`fsrs:`), keyed by card ID. This is the user's spaced-repetition memory schedule. **It is precious: losing or rewriting it resets the user's learning progress.**

The Forsion flashcards plugin owns the scheduling; you only own card content and IDs.

## Copy this template

```markdown
---
deck: Calculus Chapter 3
fsrs: {"c1":{"due":"2026-08-08T04:00:00.000Z","s":3.2,"d":5.1,"reps":2,"lapses":0,"state":2,"last":"2026-08-06T04:00:00.000Z"}}
---

<!-- card:c1 -->
Q: When does L'Hopital's rule apply?
A: For 0/0 or inf/inf forms, when the limit of the derivative ratio exists.

<!-- card:c2 -->
Q: What is a stationary point?
It can span multiple markdown lines, until the line starting with "A:".
A: A point where the first derivative is zero.
```

For a brand-new deck, `fsrs:` is just `{}` — new cards have NO fsrs entry; the plugin creates one the first time the user reviews the card.

## Hard rules (each one protects the user's review progress)

1. **Card identity = the `<!-- card:ID -->` marker.** IDs look like `c<positive integer>` (`c1`, `c2`, …).
2. **New card ID = max + 1, scanning the WHOLE file** — both existing card markers AND keys inside the `fsrs:` JSON. Never renumber, never reuse a number you can see anywhere in the file (a deleted card's fsrs key may still be present; reusing its ID would make the new card inherit a stale schedule).
3. **Never touch the `fsrs:` line when editing card content.** Editing Q/A, reordering cards, renaming the deck — the fsrs JSON stays byte-for-byte identical. Never reformat it, never split it over lines, never "clean it up".
4. **Deleting a card:** remove its marker + Q/A block. You may leave its fsrs key in place — the plugin ignores and lazily cleans orphan keys. What you must NEVER do is reassign that ID to a different card.
5. **Frontmatter has exactly two meaningful lines:** `deck:` (display name) and `fsrs:` (single-line JSON). Do not add other keys, do not use multi-line YAML.
6. `Q:` may continue over several markdown lines; the answer starts at the first following line that begins with `A:`. Keep cards atomic (one fact per card) and answers short.
7. **The file name must end exactly with `.deck.md`.** A rename to `x.deck-1.md` or `x.md` drops the file out of the deck file type. When avoiding name collisions, use `Name 2.deck.md`.
8. **Never touch `.deck-index.json`** in the plugin's work folder — it is plugin-internal and self-healing; the plugin rebuilds rows when a deck is opened or reviewed.
9. **After creating a NEW deck file yourself, tell the user to open it once** (click it in the file tree). The plugin indexes decks on open/review — it does not scan folders — so a deck created in chat will not appear in the review queue until it has been opened once. The same applies after moving or renaming a deck file.
10. If card content must show a literal `<!-- card:ID -->` line as text (e.g. a card teaching this very format), write it escaped as `<!-- card\:ID -->` on its own line — the plugin unescapes it when displaying and re-escapes on save. An unescaped marker line inside card content would be parsed as a real card boundary.

## Which tools to read/write with

| Goal | Use | Avoid |
|---|---|---|
| Inspect a deck | `read_file` with the absolute path | `amadeus_read_note` — it strips frontmatter, so you would not see the `fsrs:` state at all |
| Create / edit | `write_file` (whole file) or `edit_file` (surgical) | `amadeus_write_note` — it rewrites the file as a plain note and destroys the frontmatter |
| Locate decks | `glob_files` for `*.deck.md` | — |

Note: the host excludes `.deck.md` files from the notes/pages list on purpose (they are a first-class file type), so note-oriented tools may not even see them.

## Checklist before delivering a deck edit

- [ ] File name ends exactly with `.deck.md`.
- [ ] Frontmatter is `---` / `deck: …` / `fsrs: {…single line…}` / `---`.
- [ ] Every card has a unique `<!-- card:cN -->` marker, a `Q:` and an `A:`.
- [ ] Any NEW id is strictly greater than every number appearing in markers or fsrs keys.
- [ ] Pre-existing fsrs entries are unchanged; you added none for new cards.
