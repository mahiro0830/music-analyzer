// 応用 mode (src/advanced.ts, src/theory.ts): tensions and slash chords, on synthetic piano-like chords
import test from "node:test";
import assert from "node:assert/strict";
import { keySpectrum, LISTEN_HOP } from "../src/listen.ts";
import { detectChords } from "../src/chords.ts";
import { refineChords } from "../src/advanced.ts";
import { analyze, fullChordName } from "../src/theory.ts";
import { playChords, voicing } from "../scripts/synth.ts";

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
type C = { root: number; q: string; T?: string[]; bass?: number };
// the full chord names heard in the middle of each chord, two seconds each
function hear(chords: C[]) {
  const x = playChords(chords.map(c => [voicing(c), 2]));
  const sp = keySpectrum(x, 22050), adv = refineChords(sp, detectChords(sp, LISTEN_HOP).segs, LISTEN_HOP);
  return chords.map((_, i) => {
    const s = adv.find(s => s.t <= i * 2 + 1 && i * 2 + 1 < s.end);
    return s?.full ? fullChordName(s.full, NAMES) : null;
  });
}

test("tensions: FMaj9 - Dmin9 - G7(b9) - Cadd9 - G13", () => {
  assert.deepEqual(hear([
    { root: 5, q: "maj7", T: ["9"] }, { root: 2, q: "min7", T: ["9"] }, { root: 7, q: "7", T: ["b9"] },
    { root: 0, q: "maj", T: ["9"] }, { root: 7, q: "7", T: ["9", "13"] },
  ]), ["FMaj9", "Dmin9", "G7(b9)", "Cadd9", "G13"]);
});

test("slash chords: C - G/B - Amin7 - C/E", () => {
  assert.deepEqual(hear([{ root: 0, q: "maj" }, { root: 7, q: "maj", bass: 11 }, { root: 9, q: "min7" }, { root: 0, q: "maj", bass: 4 }]),
    ["C", "G/B", "Amin7", "C/E"]);
});

test("plain chords stay plain", () => {
  assert.deepEqual(hear([{ root: 0, q: "maj" }, { root: 9, q: "min" }, { root: 5, q: "maj" }, { root: 7, q: "7" }]), ["C", "Amin", "F", "G7"]);
});

test("names in Chord Roll's house style", () => {
  const name = (p: number[]) => { const c = analyze(p); return c ? fullChordName(c, NAMES) : null; };
  assert.equal(name([48, 60, 64, 67, 71, 74]), "CMaj9");
  assert.equal(name([50, 65, 69, 72, 76]), "Dmin9");
  assert.equal(name([43, 59, 62, 65, 68, 75]), "G7(b9,b13)");
  assert.equal(name([52, 60, 64, 67]), "C/E");
  assert.equal(name([48, 60, 62, 64, 67]), "Cadd9");
});
