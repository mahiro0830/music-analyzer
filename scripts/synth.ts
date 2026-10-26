/* Piano-like test audio: each note a sum of harmonics that fades, so tests and scripts/eval.ts can check chords
   whose true notes are known exactly */
export const SYNTH_SR = 22050;

/** chords: [[MIDI notes], seconds], played one after another */
export function playChords(chords: [number[], number][], sr = SYNTH_SR, tail = 0.5): Float32Array {
  const len = chords.reduce((s, [, d]) => s + d, 0) + tail, x = new Float32Array(Math.round(sr * len));
  let t0 = 0;
  for (const [notes, d] of chords) {
    for (const m of notes) {
      const f = 440 * 2 ** ((m - 69) / 12);
      for (let i = Math.round(t0 * sr); i < Math.round((t0 + d) * sr); i++) {
        const t = i / sr - t0, env = Math.min(1, t * 50) * Math.exp(-t * 0.8);
        for (let h = 1; h <= 4; h++) x[i] += 0.08 * env * 0.5 ** (h - 1) * Math.sin(2 * Math.PI * f * h * t);
      }
    }
    t0 += d;
  }
  return x;
}

const IV: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7], "6": [0, 4, 7, 9], min6: [0, 3, 7, 9],
  maj7: [0, 4, 7, 11], "7": [0, 4, 7, 10], min7: [0, 3, 7, 10], minmaj7: [0, 3, 7, 11], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], "7sus4": [0, 5, 7, 10],
};
const TIV: Record<string, number> = { b9: 1, "9": 2, "#9": 3, "11": 5, "#11": 6, b5: 6, "#5": 8, b13: 8, "13": 9 };
/** the notes of a chord as a pianist might voice it: the bass in octave 2, the chord tones and tensions above middle C */
export function voicing(c: { root: number; q: string; T?: string[]; bass?: number }): number[] {
  const bass = 36 + (c.bass ?? c.root);
  const up = new Set([...IV[c.q], ...(c.T ?? []).map(t => TIV[t])].map(i => 60 + (c.root + i) % 12));
  return [bass, ...up];
}
