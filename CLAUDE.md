# 音楽分析: notes for contributors

- TypeScript + Vite. `npm run check` (tsc, strict) must pass; `npm run build` runs it first.
- Only erasable TypeScript (`erasableSyntaxOnly`): no enums, namespaces or parameter properties, and imports use the `.ts` extension. Node runs `tests/` and `scripts/` directly with its built-in type stripping, so there is no test runner or transpile step.
- `src/listen.ts`, `src/chords.ts`, `src/advanced.ts`, `src/theory.ts` and `src/midi.ts` must stay DOM-free: they run in the Web Worker (`src/worker.ts`) and in Node.
- Two modes the user switches between: 基本 (`src/chords.ts`) and 応用 (`src/advanced.ts`, which adds tensions and slash basses on top of 基本's segments). Keep 基本 as it is when working on 応用.
- `src/listen.ts` and `src/theory.ts` come from the owner's other app, Chord Roll (github.com/mahiro0830/chord-roll, plain JS: `js/listen.js`, `js/theory.js`). Keep them in step when one changes; `src/theory.ts` must name chords exactly as Chord Roll does with its default settings.
- The analysis is tuned at 22.05 kHz mono (`src/main.ts` resamples to it); its FFT windows are fixed in samples.
- Chord notation follows Chord Roll's house style: `Maj7` (capital M), `min`, `min7`, `min7b5`. Never lowercase `maj` or `m7`.
- Before changing anything in `src/chords.ts` or `src/advanced.ts` (or their options), run `npm run eval` before and after, with `noise=pink:10` and `noise=drums:0`, and `npm run eval -- tests/pop.truth.json` (slash chords), and update the tables in README.md. The demo song is piano only, so don't tune hard to it.
- UI text and docs are Japanese.
