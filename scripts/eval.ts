/* How often the detected chord is right, frame by frame (every 20 ms), against a list of the true chords.
   node scripts/eval.ts [audio] [truth.json] [key=value ...]   (defaults: the demo song)
   With a truth .json in place of the audio, the audio is made from it (scripts/synth.ts): tests/pop.truth.json has
   slash chords, which the demo song does not
   noise=pink:10 / noise=drums:5 mixes pink noise or a simple drum loop in, that many dB below the music
   Needs ffmpeg to decode the audio. The truth is [{t, root, q}] (q as in src/chords.ts, plus 6, 7sus4 and the like).
   root:   the root is right
   majmin: root and major/minor are right (7 / Maj7 / 6 count as major, min7 / min6 as minor; other chords are skipped)
   7th:    root and the chord down to its seventh are right (only where the truth is a triad, 7, Maj7, min7 or min7b5)
   応用 mode (src/advanced.ts), where the truth has T (tensions) and bass:
   full:   the whole chord is right: root, quality, tensions and bass (#5 = b13 and b5 = #11, as they are shown)
   tens:   tensions found (precision) / tensions in the truth found (recall)
   slash:  root and bass right where the truth's bass is not its root / where the truth has no slash, none was shown
   Options: key=value overrides CHORD_OPT or ADV_OPT (harm=.5,.35,.25,.2) */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { keySpectrum, LISTEN_HOP } from "../src/listen.ts";
import { CHORD_OPT, detectChords, keyLabel, type ChordOptions, type Segment } from "../src/chords.ts";
import { ADV_OPT, refineChords, type AdvOptions, type AdvSegment } from "../src/advanced.ts";
import { playChords, voicing } from "./synth.ts";

type Truth = { t: number; root: number; q: string; T?: string[]; bass?: number };

const args = process.argv.slice(2), pos = args.filter(a => !a.includes("=")), kv = args.filter(a => a.includes("="));
const root = new URL("..", import.meta.url).pathname;
const audio = pos[0] || root + "public/demo/demo.mp3", synth = audio.endsWith(".json");
const truthPath = pos[1] || (synth ? audio : root + "public/demo/demo.truth.json");
const SR = 22050;
const truth: Truth[] = JSON.parse(fs.readFileSync(truthPath, "utf8"));
let x: Float32Array;
if (synth) x = playChords(truth.map((g, i): [number[], number] => [voicing(g), (truth[i + 1]?.t ?? g.t + 2) - g.t]), SR);
else {
  const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", audio, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}
const opt: ChordOptions = { ...CHORD_OPT }, adv: AdvOptions = { ...ADV_OPT, harm: [...ADV_OPT.harm] };
let noise: string | null = null;
for (const a of kv) {
  const [k, v] = a.split("=");
  if (k === "noise") noise = v;
  else if (k in opt) opt[k as keyof ChordOptions] = +v;
  else if (k === "harm") adv.harm = v.split(",").map(Number);
  else if (k in adv) (adv as Record<string, unknown>)[k] = +v;
  else throw new Error(`unknown option ${k} (${[...Object.keys(opt), ...Object.keys(adv)].join(", ")})`);
}
if (noise) { const [kind, snr] = noise.split(":"); addNoise(x, kind, +snr); }
const t0 = Date.now();
const sp = keySpectrum(x, SR), { segs, key } = detectChords(sp, LISTEN_HOP, opt), advSegs = refineChords(sp, segs, LISTEN_HOP, adv);
const ms = Date.now() - t0;
const MAJ = new Set(["maj", "7", "maj7", "6"]), MIN = new Set(["min", "min7", "min6", "minmaj7"]);
const mm = (q: string | null) => q && MAJ.has(q) ? "maj" : q && MIN.has(q) ? "min" : null;
const SEV: Record<string, string> = { maj: "maj", min: "min", "7": "7", maj7: "maj7", min7: "min7", m7b5: "m7b5" };
const end = truth[truth.length - 1].t + 2;
const at = <T extends { t: number }>(list: T[], t: number) => { let s: T | null = null; for (const g of list) { if (g.t <= t) s = g; else break; } return s; };
const n = { root: 0, mm: 0, sev: 0 }, ok = { root: 0, mm: 0, sev: 0 };
type Score = keyof typeof n;
for (let t = 0; t < end; t += LISTEN_HOP) {
  const g = at(truth, t), p = at<Segment>(segs, t);
  if (!g || !p) continue;
  n.root++; if (p.root === g.root) ok.root++;
  if (mm(g.q)) { n.mm++; if (p.root === g.root && mm(p.q) === mm(g.q)) ok.mm++; }
  if (SEV[g.q]) { n.sev++; if (p.root === g.root && p.q === SEV[g.q]) ok.sev++; }
}
const pct = (k: Score) => (100 * ok[k] / n[k]).toFixed(1) + "%";
console.log(`基本  root ${pct("root")}  majmin ${pct("mm")}  7th ${pct("sev")}  (${segs.length} chords found, ${truth.length} true; key ${keyLabel(key)}; ${ms} ms)`);

if (truth.every(g => g.T && g.bass !== undefined)) {
  const norm = (T: string[]) => T.map(t => t === "#5" ? "b13" : t === "b5" ? "#11" : t).sort().join(",");
  const a = { n: 0, full: 0, basicFull: 0, tp: 0, fp: 0, fn: 0, sl: 0, slOk: 0, ns: 0, nsOk: 0 };
  for (let t = 0; t < end; t += LISTEN_HOP) {
    const g = at(truth, t), p = at<AdvSegment>(advSegs, t);
    if (!g || !p) continue;
    const c = p.full, gT = norm(g.T!).split(",").filter(Boolean), pT = c ? norm(c.T).split(",").filter(Boolean) : [];
    a.n++;
    if (c && c.root === g.root && c.q === g.q && norm(c.T) === norm(g.T!) && c.bass === g.bass) a.full++;
    if (p.root === g.root && p.q === g.q && !gT.length && g.bass === g.root) a.basicFull++;
    if (c && c.root === g.root) { for (const x of pT) gT.includes(x) ? a.tp++ : a.fp++; for (const x of gT) if (!pT.includes(x)) a.fn++; }
    if (g.bass !== g.root) { a.sl++; if (c && c.root === g.root && c.bass === g.bass) a.slOk++; }
    else { a.ns++; if (!c || c.bass === c.root) a.nsOk++; }
  }
  const P = (x: number, y: number) => y ? (100 * x / y).toFixed(1) + "%" : "-";
  console.log(`応用  full ${P(a.full, a.n)} (基本 ${P(a.basicFull, a.n)})  tens ${P(a.tp, a.tp + a.fp)} / ${P(a.tp, a.tp + a.fn)}  slash ${P(a.slOk, a.sl)} / ${P(a.nsOk, a.ns)}`);
}

function addNoise(x: Float32Array, kind: string, snr: number) {
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
  const d = new Float32Array(x.length);
  if (kind === "pink") {// Paul Kellet's filter on white noise
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) { const w = rnd(); b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = b0 + b1 + b2 + w * .1848; }
  } else {// kick on 1, snare on 3, hi-hat every quarter: 0.25 s steps
    const L = Math.round(.3 * SR);
    for (let s = 0, k = 0; s + L < d.length; s += Math.round(.25 * SR), k++) for (let i = 0; i < L; i++) {
      const t = i / SR;
      if (k % 4 === 0) d[s + i] += Math.sin(2 * Math.PI * (50 * t + 80 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 12);
      if (k % 4 === 2) d[s + i] += rnd() * Math.exp(-t * 25);
      d[s + i] += .3 * rnd() * Math.exp(-t * 80);
    }
  }
  const rms = (v: Float32Array) => Math.sqrt(v.reduce((s, a) => s + a * a, 0) / v.length), g = rms(x) / rms(d) / 10 ** (snr / 20);
  for (let i = 0; i < x.length; i++) x[i] += d[i] * g;
}
