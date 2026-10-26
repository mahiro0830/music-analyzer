/* ============ 応用: tensions and slash chords ============
   Works on top of the basic chords (chords.ts), one chord at a time. DOM-free, like chords.ts.
   1. average how loud each piano key is over the chord (skipping its first frames, where the attack smears)
   2. take away the harmonics: going up from the lowest key, each key's 2nd..5th harmonics are subtracted from the keys
      they land on (an octave, an octave and a fifth, two octaves, two octaves and a major third up), so a loud C
      no longer reads as a G or an E being played
   3. the pitch classes that stand out above the bass range are the chord's notes, together with the basic chord's
      own tones; the loudest key in the bass range is its bass
   4. Chord Roll's chord naming (theory.ts) names those notes, with tensions and a slash bass
   The basic chord's root is trusted (it is right far more often than the tensions are): a result built on a root
   that is neither the basic root nor the bass falls back to the basic chord. */
import type { KeySpectrum } from "./listen.ts";
import type { Quality, Segment } from "./chords.ts";
import { analyze, type FullChord } from "./theory.ts";

export const ADV_OPT = {
  skip: 3,                  // frames at the start of each chord left out (the attack)
  harm: [.5, .35, .25, .2], // loudness of the 2nd..5th harmonics relative to the note, in amplitude
  noteLo: 48, noteHi: 96,   // MIDI range of the chord's notes
  bassLo: 28, bassHi: 55,   // MIDI range of the bass
  present: .45,             // a pitch class is a chord note when it is at least this share of the loudest one
  slash: .5,                // the bass is shown (C/E) only when the root's loudest bass key is at most this share of the bass key's
};
export type AdvOptions = typeof ADV_OPT;
export type AdvSegment = Segment & { full: FullChord | null };

const HARM_STEPS = [12, 19, 24, 28];
const IV: Record<Quality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], "7": [0, 4, 10], maj7: [0, 4, 11], min7: [0, 3, 10], m7b5: [0, 3, 6, 10], sus4: [0, 5, 7] };
const BASIC: Record<Quality, FullChord["q"]> = { maj: "maj", min: "min", "7": "7", maj7: "maj7", min7: "min7", m7b5: "m7b5", sus4: "sus4" };
const basicFull = (s: Segment): FullChord | null =>
  s.q ? { root: s.root, q: BASIC[s.q], T: [], bass: s.root, triad: ["maj", "min", "sus4"].includes(s.q) } : null;

/** how loud each key is over frames f0..f1-1, with the harmonics of lower keys taken away */
export function keyLevels(sp: KeySpectrum, f0: number, f1: number, o: AdvOptions = ADV_OPT): Float64Array {
  const v = new Float64Array(88);
  for (let f = f0; f < f1; f++) for (let k = 0; k < 88; k++) v[k] += 10 ** (sp.db[f * 88 + k] / 20);
  for (let k = 0; k < 88; k++) v[k] /= Math.max(1, f1 - f0);
  for (let k = 0; k < 88; k++) HARM_STEPS.forEach((d, h) => { if (k + d < 88) v[k + d] = Math.max(0, v[k + d] - o.harm[h] * v[k]); });
  return v;
}

/** the notes heard in a stretch of keyLevels(), as MIDI numbers: the bass key, then one note per pitch class above it */
export function heardPitches(v: Float64Array, o: AdvOptions = ADV_OPT): { pitches: number[]; bass: number; bassLevel: number[] } {
  const up = new Float64Array(12), bl = new Array(12).fill(0);
  let bk = -1;
  for (let k = 0; k < 88; k++) {
    const m = k + 21;
    if (m >= o.noteLo && m < o.noteHi) up[m % 12] += v[k];
    if (m >= o.bassLo && m < o.bassHi) { bl[m % 12] = Math.max(bl[m % 12], v[k]); if (bk < 0 || v[k] > v[bk]) bk = k; }
  }
  const top = Math.max(...up), bass = bk + 21;
  const pitches = [bass];
  for (let pc = 0; pc < 12; pc++) if (top > 0 && up[pc] >= o.present * top) pitches.push(60 + pc);
  return { pitches, bass: bass % 12, bassLevel: bl };
}

/** the basic chords with each one's full chord (tensions, slash bass) added */
export function refineChords(sp: KeySpectrum, segs: Segment[], hop: number, o: AdvOptions = ADV_OPT): AdvSegment[] {
  return segs.map(s => {
    const base = basicFull(s), q = s.q;
    if (!base || !q) return { ...s, full: null };
    let f0 = Math.round(s.t / hop), f1 = Math.min(sp.frames, Math.round(s.end / hop));
    if (f1 - f0 > 2 * o.skip) f0 += o.skip;
    const { pitches, bass, bassLevel } = heardPitches(keyLevels(sp, f0, f1, o), o);
    // a bass other than the root counts only when it clearly outweighs the root down there
    const slashOk = bass !== s.root && bassLevel[bass] * o.slash >= bassLevel[s.root];
    const notes = slashOk ? pitches : [36 + s.root, ...pitches.slice(1)];
    // An inversion (C/E) often reads as a basic chord on its bass (Emin): the basic chord then has tones nobody plays.
    // When it does and the heard notes make a plain chord (no tensions) on another root over this bass, that chord is it.
    // Tensions are left out because rootless voicings over the root (Fmin9 played as Ab C Eb G over F) would
    // otherwise come out as slash chords (EbMaj9/F).
    const missing = IV[q].some(i => !pitches.some(m => m % 12 === (s.root + i) % 12));
    const inv = missing && bass === s.root ? analyze(pitches) : null;
    if (inv && inv.root !== s.root && inv.bass === bass && !inv.T.length) return { ...s, full: inv };
    // otherwise the basic chord's tones always count: on the demo song this alone took the whole-chord score from 17% to 47%
    for (const i of IV[q]) if (!notes.some(m => m % 12 === (s.root + i) % 12)) notes.push(60 + (s.root + i) % 12);
    let c = analyze(notes);
    if (!c || (c.root !== s.root && c.root !== bass)) c = { ...base, bass: slashOk ? bass : s.root };
    return { ...s, full: c };
  });
}
