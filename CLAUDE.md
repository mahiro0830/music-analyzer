# 音楽分析: notes for contributors

- Static site, no build step. `js/listen.js` and `js/chords.js` must stay DOM-free so tests and `scripts/eval.mjs` can load them in a VM (`scripts/load.mjs`).
- `js/listen.js` comes from the owner's other app, Chord Roll (github.com/mahiro0830/chord-roll). Keep the two in step when one changes.
- Chord notation follows Chord Roll's house style: `Maj7` (capital M), `min`, `min7`, `min7b5`. Never lowercase `maj` or `m7`.
- Before changing anything in `js/chords.js` (or `CHORD_OPT`), run `npm run eval` before and after, and with `noise=pink:10` and `noise=drums:0`, and update the table in README.md. The demo song is piano only, so don't tune hard to it.
- UI text and docs are Japanese.
