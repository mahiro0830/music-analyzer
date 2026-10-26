// Writing chords out as MIDI (src/midi.ts): read the file back with a small parser and check what is in it
import test from "node:test";
import assert from "node:assert/strict";
import { chordsToMidi, voiceChord, type MidiChord } from "../src/midi.ts";
import type { FullChord } from "../src/theory.ts";

type Track = { notes: { ch: number; n: number; on: number; off: number }[]; meta: { type: number; tick: number; data: number[] }[] };
function readMidi(b: Uint8Array): { format: number; ppq: number; tracks: Track[] } {
  let p = 0;
  const str = (n: number) => { const s = String.fromCharCode(...b.slice(p, p + n)); p += n; return s; };
  const u32 = () => { const v = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0; p += 4; return v; };
  const vlq = () => { let v = 0, c; do { c = b[p++]; v = v << 7 | c & 127; } while (c & 128); return v; };
  assert.equal(str(4), "MThd"); assert.equal(u32(), 6);
  const format = b[p] << 8 | b[p + 1], ntr = b[p + 2] << 8 | b[p + 3], ppq = b[p + 4] << 8 | b[p + 5]; p += 6;
  const tracks: Track[] = [];
  for (let t = 0; t < ntr; t++) {
    assert.equal(str(4), "MTrk");
    const end = u32() + p, tr: Track = { notes: [], meta: [] }, open = new Map<number, number>();
    let tick = 0;
    while (p < end) {
      tick += vlq();
      const st = b[p++];
      if (st === 0xff) { const type = b[p++], len = vlq(); tr.meta.push({ type, tick, data: [...b.slice(p, p + len)] }); p += len; }
      else if ((st & 0xf0) === 0xc0) p++;
      else {
        const n = b[p++], v = b[p++], ch = st & 15;
        if ((st & 0xf0) === 0x90 && v) open.set(ch * 128 + n, tick);
        else { tr.notes.push({ ch, n, on: open.get(ch * 128 + n)!, off: tick }); open.delete(ch * 128 + n); }
      }
    }
    assert.equal(open.size, 0, "every note is released");
    tracks.push(tr);
  }
  return { format, ppq, tracks };
}
const C = (root: number, q: FullChord["q"], T: FullChord["T"] = [], bass = root): FullChord => ({ root, q, T, bass, triad: ["maj", "min"].includes(q) });

test("chords become block chords and a bass line, in time with the audio", () => {
  const chords: MidiChord[] = [
    { t: 0, end: 2, name: "C", chord: C(0, "maj") },
    { t: 2, end: 3, name: "—", chord: null },
    { t: 3, end: 4.5, name: "G7(b9)/B", chord: C(7, "7", ["b9"], 11) },
  ];
  const m = readMidi(chordsToMidi(chords, { title: "song", key: { tonic: 0, minor: false, r: 1 } }));
  assert.equal(m.format, 1); assert.equal(m.tracks.length, 3);
  const sec = (tick: number) => tick / (m.ppq * 2);// 120 BPM
  const [cond, upper, bass] = m.tracks;
  assert.deepEqual(cond.meta.filter(e => e.type === 6).map(e => [sec(e.tick), new TextDecoder().decode(new Uint8Array(e.data))]), [[0, "C"], [3, "G7(b9)/B"]]);
  assert.deepEqual(cond.meta.find(e => e.type === 0x59)!.data, [0, 0]);
  const at = (tr: Track, s: number) => tr.notes.filter(n => sec(n.on) === s).map(n => n.n).sort((a, b) => a - b);
  assert.deepEqual(at(upper, 0), [60, 64, 67]);
  assert.deepEqual(at(upper, 3), [55, 59, 62, 65, 68]);// G B D F + Ab (b9)
  assert.deepEqual(at(bass, 0), [36]); assert.deepEqual(at(bass, 3), [47]);
  assert.ok(upper.notes.every(n => sec(n.off) === (sec(n.on) === 0 ? 2 : 4.5)), "held until the chord ends");
  assert.equal(upper.notes.length + bass.notes.length, 3 + 1 + 5 + 1, "nothing for no chord");
});

test("voicing: chord tones from the root at or above G3, tensions an octave up, the 5th put back", () => {
  assert.deepEqual(voiceChord(C(2, "min7", ["9"])), { bass: 38, upper: [62, 65, 69, 72, 76] });
  assert.deepEqual(voiceChord(C(7, "7", ["#5"])).upper, [55, 59, 63, 65]);
});

test("flat keys get flats in the key signature", () => {
  const m = readMidi(chordsToMidi([], { key: { tonic: 3, minor: false, r: 1 } }));
  assert.deepEqual(m.tracks[0].meta.find(e => e.type === 0x59)!.data, [256 - 3, 0]);
  const am = readMidi(chordsToMidi([], { key: { tonic: 9, minor: true, r: 1 } }));
  assert.deepEqual(am.tracks[0].meta.find(e => e.type === 0x59)!.data, [0, 1]);
});
