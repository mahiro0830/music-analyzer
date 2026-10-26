"use strict";
/* The page: load an audio file, analyse it in js/worker.js, then show the chord under the playhead as it plays */
const $ = id => document.getElementById(id);
const S = { segs: [], key: null, url: null, cur: -1, busy: false };
const audio = $("audio");
const worker = new Worker("js/worker.js");

// "Bbmin7b5" -> B♭min7♭5, the signs in a span so CSS can tighten them
const pretty = s => s.replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯").replace(/b5$/, "♭5");
function put(el, txt) {
  el.textContent = "";
  for (const part of pretty(txt).split(/([♭♯])/)) {
    if (!part) continue;
    if (part === "♭" || part === "♯") { const i = document.createElement("span"); i.className = "acc"; i.textContent = part; el.append(i); }
    else el.append(part);
  }
}
const label = s => s.root < 0 ? "—" : chordLabel(s, S.key);
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function setMsg(txt, err) { $("msg").textContent = txt; $("msg").classList.toggle("err", !!err); }

function analyse(x, sr) {
  return new Promise((ok, ng) => {
    worker.onmessage = e => e.data.error ? ng(new Error(e.data.error)) : ok(e.data);
    worker.postMessage({ x, sr }, [x.buffer]);
  });
}
async function load(blob, fileName) {
  if (S.busy) return;
  S.busy = true; audio.pause();
  setMsg(`「${fileName}」を解析しています…`);
  document.body.classList.add("busy");
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    ac.close();
    const x = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += d[i] / buf.numberOfChannels; }
    const r = await analyse(x, buf.sampleRate);
    S.segs = r.segs; S.key = r.key; S.cur = -1;
    if (S.url) URL.revokeObjectURL(S.url);
    S.url = URL.createObjectURL(blob); audio.src = S.url;
    $("title").textContent = fileName;
    $("key").textContent = `キー：${pretty(keyLabel(S.key))}（推定）`;
    renderList();
    $("player").hidden = false;
    setMsg(`解析できました（${(r.ms / 1000).toFixed(1)} 秒）。再生するとコードが表示されます。`);
  } catch (err) {
    setMsg("この音声ファイルは読み込めませんでした。mp3・wav・m4a などをお試しください。（" + err.message + "）", true);
  } finally {
    S.busy = false; document.body.classList.remove("busy");
  }
}

function renderList() {
  const list = $("list"); list.textContent = "";
  S.segs.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "chip" + (s.root < 0 ? " nc" : "");
    b.innerHTML = `<b></b><small></small>`;
    put(b.firstChild, label(s));
    b.lastChild.textContent = clock(s.t);
    b.onclick = () => { audio.currentTime = s.t + 0.01; if (audio.paused) show(audio.currentTime); };
    list.append(b);
  });
}
// the segment under time t (segments are sorted and back to back)
function segAt(t) {
  let lo = 0, hi = S.segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S.segs[m].t <= t) lo = m; else hi = m - 1; }
  return lo;
}
// the next segment with a chord after i, skipping "no chord"
function nextChord(i) { for (let j = i + 1; j < S.segs.length; j++) if (S.segs[j].root >= 0) return j; return -1; }
function show(t) {
  if (!S.segs.length) return;
  const i = segAt(t), s = S.segs[i];
  if (i !== S.cur) {
    const chips = $("list").children;
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

$("file").addEventListener("change", e => { const f = e.target.files[0]; if (f) load(f, f.name); e.target.value = ""; });
$("demo").addEventListener("click", async () => {
  const r = await fetch("demo/demo.mp3");
  if (r.ok) load(await r.blob(), "デモ曲"); else setMsg("デモ曲を読み込めませんでした。", true);
});
$("speed").addEventListener("change", e => { audio.playbackRate = +e.target.value; });
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (ev === "drop" || !e.relatedTarget) drop.classList.remove("drag"); }));
document.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) load(f, f.name); });
document.addEventListener("keydown", e => {
  if (e.code === "Space" && !/INPUT|SELECT|BUTTON|AUDIO/.test(e.target.tagName) && audio.src) { e.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
});
