// Chords from audio (src/chords.ts) on synthetic tones with harmonics, like an instrument rather than pure sines
import test from "node:test";
import assert from "node:assert/strict";
import { keySpectrum, LISTEN_HOP } from "../src/listen.ts";
import { chordLabel, detectChords, keyLabel, type Segment } from "../src/chords.ts";
import { playChords, SYNTH_SR } from "../scripts/synth.ts";

const SR = SYNTH_SR, play = (chords: [number[], number][]) => playChords(chords, SR);
const detect = (x: Float32Array) => detectChords(keySpectrum(x, SR), LISTEN_HOP);
const name = (r: ReturnType<typeof detect>, t: number) => {
  const s = r.segs.find((s: Segment) => s.t <= t && t < s.end);
  return s ? chordLabel(s, r.key) : null;
};

test("C - Amin - F - G7 with the bass in the left hand", () => {
  const r = detect(play([[[36, 60, 64, 67], 2], [[45, 60, 64, 69], 2], [[41, 60, 65, 69], 2], [[43, 59, 62, 65, 67], 2]]));
  assert.deepEqual([1, 3, 5, 7].map(t => name(r, t)), ["C", "Amin", "F", "G7"]);
  assert.equal(keyLabel(r.key), "C Major");
});

test("sevenths: Dmin7 - G7 - CMaj7", () => {
  const r = detect(play([[[38, 60, 65, 69], 2], [[43, 59, 62, 65], 2], [[36, 59, 64, 67], 2]]));
  assert.deepEqual([1, 3, 5].map(t => name(r, t)), ["Dmin7", "G7", "CMaj7"]);
});

test("a flat key is spelled with flats", () => {
  const r = detect(play([[[39, 63, 67, 70], 2], [[44, 63, 68, 72], 2], [[46, 62, 65, 70], 2], [[39, 63, 67, 70], 2]]));
  assert.deepEqual([1, 3, 5].map(t => name(r, t)), ["Eb", "Ab", "Bb"]);
});

test("chord changes land near where they are played", () => {
  const r = detect(play([[[36, 60, 64, 67], 2], [[41, 60, 65, 69], 2]]));
  const f = r.segs.find(s => chordLabel(s, r.key) === "F");
  assert.ok(f && Math.abs(f.t - 2) < 0.25, JSON.stringify(r.segs));
});

test("silence is no chord", () => {
  const r = detect(new Float32Array(SR * 2));
  assert.ok(r.segs.every(s => s.root === -1), JSON.stringify(r.segs));
});
