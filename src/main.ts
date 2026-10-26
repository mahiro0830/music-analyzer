/* The page: load an audio file, analyse it in worker.ts, then show the chord under the playhead as it plays */
import "./style.css";
import { chordLabel, keyLabel, type Key, type Segment } from "./chords.ts";
import type { AnalysisReply, AnalysisRequest, AnalysisResult } from "./worker.ts";

// elements of index.html, by id and type
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} がありません`);
  return el as T;
}
const audio = $<HTMLAudioElement>("audio");
const list = $("list");
const S: { segs: Segment[]; key: Key | null; url: string | null; cur: number; busy: boolean } =
  { segs: [], key: null, url: null, cur: -1, busy: false };
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

// "Bbmin7b5" -> B♭min7♭5, the signs in a span so CSS can tighten them
const pretty = (s: string) => s.replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯").replace(/b5$/, "♭5");
function put(el: Element, txt: string) {
  el.textContent = "";
  for (const part of pretty(txt).split(/([♭♯])/)) {
    if (!part) continue;
    if (part === "♭" || part === "♯") { const i = document.createElement("span"); i.className = "acc"; i.textContent = part; el.append(i); }
    else el.append(part);
  }
}
const label = (s: Segment) => s.q ? chordLabel(s, S.key) : "—";
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function setMsg(txt: string, err = false) { const m = $("msg"); m.textContent = txt; m.classList.toggle("err", err); }

function analyse(x: Float32Array, sr: number): Promise<AnalysisResult> {
  return new Promise((ok, ng) => {
    worker.onmessage = (e: MessageEvent<AnalysisReply>) => "error" in e.data ? ng(new Error(e.data.error)) : ok(e.data);
    const req: AnalysisRequest = { x, sr };
    worker.postMessage(req, [x.buffer]);
  });
}
async function load(blob: Blob, fileName: string) {
  if (S.busy) return;
  S.busy = true; audio.pause();
  setMsg(`「${fileName}」を解析しています…`);
  document.body.classList.add("busy");
  try {
    const ac = new AudioContext();
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    ac.close();
    const x = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += d[i] / buf.numberOfChannels; }
    const r = await analyse(x, buf.sampleRate);
    S.segs = r.segs; S.key = r.key; S.cur = -1;
    if (S.url) URL.revokeObjectURL(S.url);
    S.url = URL.createObjectURL(blob); audio.src = S.url;
    $("title").textContent = fileName;
    $("key").textContent = `キー：${pretty(keyLabel(r.key))}（推定）`;
    renderList();
    $("player").hidden = false;
    setMsg(`解析できました（${(r.ms / 1000).toFixed(1)} 秒）。再生するとコードが表示されます。`);
  } catch (err) {
    setMsg("この音声ファイルは読み込めませんでした。mp3・wav・m4a などをお試しください。（" + (err instanceof Error ? err.message : String(err)) + "）", true);
  } finally {
    S.busy = false; document.body.classList.remove("busy");
  }
}

function renderList() {
  list.textContent = "";
  for (const s of S.segs) {
    const b = document.createElement("button"), name = document.createElement("b"), time = document.createElement("small");
    b.className = "chip" + (s.q ? "" : " nc");
    put(name, label(s));
    time.textContent = clock(s.t);
    b.append(name, time);
    b.onclick = () => { audio.currentTime = s.t + 0.01; if (audio.paused) show(audio.currentTime); };
    list.append(b);
  }
}
// the segment under time t (segments are sorted and back to back)
function segAt(t: number) {
  let lo = 0, hi = S.segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S.segs[m].t <= t) lo = m; else hi = m - 1; }
  return lo;
}
// the next segment with a chord after i, skipping "no chord"
function nextChord(i: number) { for (let j = i + 1; j < S.segs.length; j++) if (S.segs[j].q) return j; return -1; }
function show(t: number) {
  if (!S.segs.length) return;
  const i = segAt(t), s = S.segs[i];
  if (i !== S.cur) {
    const chips = list.children;
    if (S.cur >= 0 && chips[S.cur]) chips[S.cur].classList.remove("now");
    chips[i].classList.add("now");
    if (!audio.paused) chips[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
    S.cur = i;
    put($("now"), label(s));
    const n = nextChord(i);
    put($("next"), n >= 0 ? label(S.segs[n]) : "");
  }
  $("bar").style.width = (100 * Math.min(1, (t - s.t) / (s.end - s.t))) + "%";
}
(function tick() { show(audio.currentTime); requestAnimationFrame(tick); })();

const fileInput = $<HTMLInputElement>("file");
fileInput.addEventListener("change", () => { const f = fileInput.files?.[0]; if (f) load(f, f.name); fileInput.value = ""; });
$("demo").addEventListener("click", async () => {
  const r = await fetch(`${import.meta.env.BASE_URL}demo/demo.mp3`);
  if (r.ok) load(await r.blob(), "デモ曲"); else setMsg("デモ曲を読み込めませんでした。", true);
});
const speed = $<HTMLSelectElement>("speed");
speed.addEventListener("change", () => { audio.playbackRate = +speed.value; });
const drop = $("drop");
for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); });
for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, e => {
  e.preventDefault(); if (ev === "drop" || !(e as DragEvent).relatedTarget) drop.classList.remove("drag");
});
document.addEventListener("drop", e => { const f = e.dataTransfer?.files[0]; if (f) load(f, f.name); });
document.addEventListener("keydown", e => {
  const tag = (e.target as HTMLElement).tagName;
  if (e.code === "Space" && !/INPUT|SELECT|BUTTON|AUDIO/.test(tag) && audio.src) { e.preventDefault(); if (audio.paused) audio.play(); else audio.pause(); }
});
