/* How often the detected chord is right, frame by frame (every 20 ms), against a list of the true chords.
   node scripts/eval.mjs [audio] [truth.json] [key=value ...]   (defaults: the demo song; key=value overrides CHORD_OPT)
   noise=pink:10 / noise=drums:5 mixes pink noise or a simple drum loop in, that many dB below the music
   Needs ffmpeg to decode the audio. The truth is [{t, root, q}] (q as in js/chords.js, plus 6, 7sus4 and the like).
   root:   the root is right
   majmin: root and major/minor are right (7 / Maj7 / 6 count as major, min7 / min6 as minor; other chords are skipped)
   7th:    root and the chord down to its seventh are right (only where the truth is a triad, 7, Maj7, min7 or min7b5) */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { loadAnalyzer } from "./load.mjs";

const args = process.argv.slice(2), pos = args.filter(a => !a.includes("=")), kv = args.filter(a => a.includes("="));
const root = new URL("..", import.meta.url).pathname;
const audio = pos[0] || root + "demo/demo.mp3", truthPath = pos[1] || root + "demo/demo.truth.json";
const A = loadAnalyzer(), SR = 22050;
const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", audio, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const opt = { ...A.CHORD_OPT };
let noise = null;
for (const a of kv) { const [k, v] = a.split("="); if (k === "noise") noise = v; else opt[k] = +v; }
if (noise) addNoise(x, ...noise.split(":"));
const t0 = Date.now();
const { segs, key } = A.detectChords(A.keySpectrum(x, SR), A.LISTEN_HOP, opt);
const ms = Date.now() - t0;
const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
const MAJ = new Set(["maj", "7", "maj7", "6"]), MIN = new Set(["min", "min7", "min6", "minmaj7"]);
const mm = q => MAJ.has(q) ? "maj" : MIN.has(q) ? "min" : null;
const SEV = { maj: "maj", min: "min", "7": "7", maj7: "maj7", min7: "min7", m7b5: "m7b5" };
const end = truth[truth.length - 1].t + 2;
const at = (list, t) => { let s = null; for (const g of list) { if (g.t <= t) s = g; else break; } return s; };
const n = { root: 0, mm: 0, sev: 0 }, ok = { root: 0, mm: 0, sev: 0 };
for (let t = 0; t < end; t += A.LISTEN_HOP) {
  const g = at(truth, t), p = at(segs, t);
  if (!g || !p) continue;
  n.root++; if (p.root === g.root) ok.root++;
  if (mm(g.q)) { n.mm++; if (p.root === g.root && mm(p.q) === mm(g.q)) ok.mm++; }
  if (SEV[g.q]) { n.sev++; if (p.root === g.root && p.q === SEV[g.q]) ok.sev++; }
}
const pct = k => (100 * ok[k] / n[k]).toFixed(1) + "%";
console.log(`root ${pct("root")}  majmin ${pct("mm")}  7th ${pct("sev")}  (${segs.length} chords found, ${truth.length} true; key ${A.keyLabel(key)}; ${ms} ms)`);

function addNoise(x, kind, snr) {
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
  const rms = v => Math.sqrt(v.reduce((s, a) => s + a * a, 0) / v.length), g = rms(x) / rms(d) / 10 ** (+snr / 20);
  for (let i = 0; i < x.length; i++) x[i] += d[i] * g;
}
