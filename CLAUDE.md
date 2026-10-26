# 音楽分析: notes for contributors

- TypeScript + Vite. `npm run check` (tsc, strict) must pass; `npm run build` runs it first.
- Only erasable TypeScript (`erasableSyntaxOnly`): no enums, namespaces or parameter properties, and imports use the `.ts` extension. Node runs `tests/` and `scripts/` directly with its built-in type stripping, so there is no test runner or transpile step.
- `src/listen.ts` and `src/chords.ts` must stay DOM-free: they run in the Web Worker (`src/worker.ts`) and in Node.
- `src/listen.ts` comes from the owner's other app, Chord Roll (github.com/mahiro0830/chord-roll, plain JS). Keep the two in step when one changes.
- Chord notation follows Chord Roll's house style: `Maj7` (capital M), `min`, `min7`, `min7b5`. Never lowercase `maj` or `m7`.
- Before changing anything in `src/chords.ts` (or `CHORD_OPT`), run `npm run eval` before and after, and with `noise=pink:10` and `noise=drums:0`, and update the table in README.md. The demo song is piano only, so don't tune hard to it.
- UI text and docs are Japanese.
