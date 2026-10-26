/* ============ Writing the chords out as a MIDI file ============
   A Standard MIDI File (format 1) that any DAW, notation app or Chord Roll can open. DOM-free.
   Track 1 "Chords": each chord held as a block chord from where it starts to where the next one does (piano)
   Track 2 "Bass":   the chord's bass note an octave or two lower (bass, channel 2)
   The conductor track carries the chord names as markers, the key signature, and a fixed tempo of 120 BPM:
   the tempo of the recording is not known, so ticks follow seconds exactly (960 ticks a second) and the notes
   line up with the audio when both start at 0. */
import { chordIntervals, type FullChord } from "./theory.ts";
import type { Key } from "./chords.ts";

export type MidiChord = { t: number; end: number; name: string; chord: FullChord | null };
export type MidiOptions = { title?: string; key?: Key | null };

const PPQ = 480, BPM = 120, TICKS_PER_SEC = PPQ * BPM / 60;
const VEL_CHORD = 80, VEL_BASS = 90;

/** the MIDI notes of a chord: the bass in octave 2, the chord built up from its root at or above G3 */
export function voiceChord(c: FullChord): { bass: number; upper: number[] } {
  const root = 55 + (c.root - 7 + 12) % 12;// G3 (55) .. F#4
  return { bass: 36 + c.bass, upper: chordIntervals(c).map(i => root + i) };
}

// key signature as the number of sharps (+) or flats (-), spelled the way namesFor() spells the key
function keySignature(key: Key): { sf: number; mi: number } {
  const maj = key.minor ? (key.tonic + 3) % 12 : key.tonic;
  const SF = [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5];// C Db D Eb E F Gb G Ab A Bb B
  return { sf: SF[maj], mi: key.minor ? 1 : 0 };
}

const vlq = (n: number) => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s: string) => [...new TextEncoder().encode(s)];
type Ev = { tick: number; order: number; bytes: number[] };// order: note-offs before note-ons at the same tick
function track(events: Ev[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = [];
  let last = 0;
  for (const e of events) { out.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  out.push(0, 0xff, 0x2f, 0);// end of track
  return [..."MTrk"].map(c => c.charCodeAt(0)).concat(u32(out.length), out);
}
const meta = (tick: number, type: number, data: number[]): Ev => ({ tick, order: 0, bytes: [0xff, type, ...vlq(data.length), ...data] });

export function chordsToMidi(chords: MidiChord[], o: MidiOptions = {}): Uint8Array<ArrayBuffer> {
  const tick = (s: number) => Math.round(s * TICKS_PER_SEC);
  const conductor: Ev[] = [
    meta(0, 0x03, text(o.title || "Chords")),
    meta(0, 0x51, [7, 0xa1, 0x20]),// 500000 µs a beat = 120 BPM
    meta(0, 0x58, [4, 2, 24, 8]),   // 4/4
  ];
  if (o.key) { const k = keySignature(o.key); conductor.push(meta(0, 0x59, [k.sf & 255, k.mi])); }
  const upper: Ev[] = [meta(0, 0x03, text("Chords")), { tick: 0, order: 0, bytes: [0xc0, 0] }];
  const bass: Ev[] = [meta(0, 0x03, text("Bass")), { tick: 0, order: 0, bytes: [0xc1, 33] }];
  for (const c of chords) {
    if (!c.chord) continue;
    const on = tick(c.t), off = Math.max(on + 1, tick(c.end));
    conductor.push(meta(on, 0x06, text(c.name)));
    const v = voiceChord(c.chord);
    for (const n of v.upper) upper.push({ tick: on, order: 1, bytes: [0x90, n, VEL_CHORD] }, { tick: off, order: 0, bytes: [0x80, n, 0] });
    bass.push({ tick: on, order: 1, bytes: [0x91, v.bass, VEL_BASS] }, { tick: off, order: 0, bytes: [0x81, v.bass, 0] });
  }
  const header = [..."MThd"].map(c => c.charCodeAt(0)).concat(u32(6), [0, 1, 0, 3, PPQ >> 8, PPQ & 255]);
  return new Uint8Array([...header, ...track(conductor), ...track(upper), ...track(bass)]);
}
