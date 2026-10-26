/* ============ Naming a chord from the notes in it ============
   Ported from Chord Roll (js/theory.js: QUAL, analyze, analyzeCore, fitTriad, chordParts), same author, so the
   "応用" mode names chords exactly the way Chord Roll does. Default Chord Roll settings: "min" style
   (CMaj7, Cmin7), tensions folded in where they can be (min9, 13), an altered 5th written as a tension (7(b13)). */

export type FullQuality = "maj" | "min" | "dim" | "aug" | "sus4" | "sus2" | "6" | "min6" | "maj7" | "7" | "min7" | "minmaj7" | "m7b5" | "dim7" | "7sus4";
export type Tension = "b9" | "9" | "#9" | "11" | "#11" | "b5" | "#5" | "b13" | "13";
/** a chord: pitch classes (0 = C) of its root and bass, quality and tensions */
export type FullChord = { root: number; q: FullQuality; T: Tension[]; bass: number; triad: boolean };

type Qual = { id: FullQuality; core: number[]; third?: number; triad?: boolean; fifth?: boolean; sev?: boolean; pen?: number };
/* chord qualities: core intervals; fifth:true means the perfect 5th is optional */
const QUAL: Qual[] = [
  { id: "maj", core: [0, 4, 7], third: 4, triad: true },
  { id: "min", core: [0, 3, 7], third: 3, triad: true },
  { id: "dim", core: [0, 3, 6], third: 3, triad: true, pen: 1.2 },
  { id: "aug", core: [0, 4, 8], third: 4, triad: true, pen: 1.5 },
  { id: "sus4", core: [0, 5, 7], triad: true, pen: 1 },
  { id: "sus2", core: [0, 2, 7], triad: true, pen: 1.3 },
  { id: "6", core: [0, 4, 7, 9], third: 4 },
  { id: "min6", core: [0, 3, 7, 9], third: 3, pen: .2 },
  { id: "maj7", core: [0, 4, 11], fifth: true, third: 4, sev: true },
  { id: "7", core: [0, 4, 10], fifth: true, third: 4, sev: true },
  { id: "min7", core: [0, 3, 10], fifth: true, third: 3, sev: true },
  { id: "minmaj7", core: [0, 3, 11], fifth: true, third: 3, sev: true, pen: .8 },
  { id: "m7b5", core: [0, 3, 6, 10], third: 3, sev: true },
  { id: "dim7", core: [0, 3, 6, 9], third: 3, pen: .5 },
  { id: "7sus4", core: [0, 5, 10], fifth: true, sev: true, pen: .5 },
];
export const TORDER: Tension[] = ["b9", "9", "#9", "11", "#11", "b5", "#5", "b13", "13"];
const byOrder = (a: Tension, b: Tension) => TORDER.indexOf(a) - TORDER.indexOf(b);

/* A 7th that is only the bass note (no upper voice plays it) is read as a slash bass under the triad above it:
   G B D# over F is Gaug/F, C E G over Bb is C/Bb. pitches: MIDI note numbers */
export function analyze(pitches: number[]): FullChord | null {
  const c = analyzeCore(pitches);
  // a major triad over the minor third of its root, which no upper voice plays, is that triad over the bass: Ab/Cb
  if (pitches.length) {
    const bpc = Math.min(...pitches) % 12, bassV = pitches.filter(m => m % 12 === bpc), up = pitches.filter(m => m % 12 !== bpc);
    if (up.length && Math.max(...bassV) < Math.min(...up)) {
      const t = fitTriad(up, (bpc + 9) % 12);
      if (t && t.q === "maj") return { ...t, bass: bpc };
    }
  }
  if (!c || c.triad || c.bass === c.root || ![10, 11].includes((c.bass - c.root + 12) % 12)) return c;
  if (pitches.filter(m => m % 12 === c.bass).length !== 1) return c;
  const low = Math.min(...pitches), upper = pitches.filter(m => m !== low);
  const t = fitTriad(upper, c.root);
  return t ? { ...t, bass: c.bass } : c;
}
// the triad (with added 9/11 only) built on `root` from these pitches, or null
function fitTriad(pitches: number[], root: number): FullChord | null {
  const iv = new Set(pitches.map(m => (m - root + 120) % 12));
  for (const q of QUAL) {
    if (!q.triad || !q.core.every(i => iv.has(i))) continue;
    const rest = [...iv].filter(i => !q.core.includes(i));
    if (rest.every(i => i === 2 || (i === 5 && !q.core.includes(5))))
      return { root, q: q.id, triad: true, bass: root, T: rest.map(i => (i === 2 ? "9" : "11") as Tension).sort(byOrder) };
  }
  return null;
}
function analyzeCore(pitches: number[]): (FullChord & { score: number }) | null {
  const pcs = [...new Set(pitches.map(m => m % 12))];
  if (pcs.length < 3) return null;
  let bass = 127; for (const m of pitches) if (m < bass) bass = m; bass %= 12;
  let best: (FullChord & { score: number }) | null = null;
  for (const r of pcs) {
    const iv = new Set(pcs.map(pc => (pc - r + 12) % 12));
    for (const q of QUAL) {
      if (!q.core.every(i => iv.has(i))) continue;
      const rest = [...iv].filter(i => !q.core.includes(i) && !(q.fifth && i === 7));
      const fifthMissing = q.fifth && !iv.has(7);
      const T: Tension[] = []; let ok = true, alt = 0;
      for (const i of rest) {
        let t: Tension | null = null;
        if (i === 1) { t = "b9"; alt += 1.2; }
        else if (i === 2) t = "9";
        else if (i === 3 && q.third === 4 && q.sev) { t = "#9"; alt += .6; }
        else if (i === 5 && q.id !== "sus4" && q.id !== "7sus4") { t = "11"; if (q.third === 4) alt += .8; }
        else if (i === 6 && !q.core.includes(6)) { t = q.fifth && q.third === 4 && !iv.has(7) ? "b5" : "#11"; alt += .3; }
        else if (i === 8 && !q.core.includes(8)) { t = q.fifth && q.third === 4 && !iv.has(7) ? "#5" : "b13"; alt += .6; }
        else if (i === 9 && q.sev) t = "13";
        if (!t || (q.triad && !["9", "11"].includes(t))) { ok = false; break; }
        T.push(t);
      }
      if (!ok) continue;
      const score = 10 - (q.pen || 0) - 1.2 * T.length - alt - (fifthMissing ? .4 : 0) + (r === bass ? 2.5 : 0) + q.core.length * .3;
      if (!best || score > best.score) best = { root: r, q: q.id, triad: !!q.triad, T: T.sort(byOrder), bass, score };
    }
  }
  return best;
}

/* ============ Names ============ */
const QNAME: Record<FullQuality, string> = {
  maj: "", min: "min", dim: "dim", aug: "aug", sus4: "sus4", sus2: "sus2", "6": "6", min6: "min6", maj7: "Maj7", "7": "7",
  min7: "min7", minmaj7: "minMaj7", m7b5: "min7b5", dim7: "dim7", "7sus4": "7sus4",
};
const COMPACT: Partial<Record<FullQuality, Partial<Record<9 | 11 | 13, string>>>> = {
  maj7: { 9: "Maj9", 13: "Maj13" }, "7": { 9: "9", 13: "13" }, min7: { 9: "min9", 11: "min11" },
  // sus chords stack the same way as dominant sevenths: 7sus4(9) -> 9sus4, 7sus4(9,13) -> 13sus4
  "7sus4": { 9: "9sus4", 13: "13sus4" },
};
/** "Dbmin9", "G7(b9,b13)", "Cadd9", "C/E". names: the spelling of the 12 pitch classes for the key */
export function fullChordName(c: FullChord, names: string[]): string {
  let T = c.T.map(t => t === "#5" ? "b13" : t === "b5" ? "#11" : t).sort((a, b) => byOrder(a as Tension, b as Tension));
  let q = QNAME[c.q];
  const C = COMPACT[c.q];
  if (C && T.includes("9")) {
    if (C[11] && T.includes("11")) { q = C[11]; T = T.filter(t => t !== "9" && t !== "11"); }
    else if (C[13] && T.includes("13")) { q = C[13]; T = T.filter(t => t !== "9" && t !== "13"); }
    else if (C[9]) { q = C[9]; T = T.filter(t => t !== "9"); }
  }
  let body;
  if (c.triad && T.length) {
    const add = T.map(t => "add" + t);
    body = q === "" && add.length === 1 ? add[0] : q + "(" + add.join(",") + ")";
  } else body = q + (T.length ? "(" + T.join(",") + ")" : "");
  return names[c.root] + body + (c.bass !== c.root ? "/" + names[c.bass] : "");
}
