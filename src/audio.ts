/* ============ AIFF ============
   Safari decodes and plays AIFF itself, Chrome and Firefox do neither, so .aif / .aiff / .aifc files are read here
   (for the analysis) and turned into WAV (for the <audio> player). DOM-free.
   parseAiff is ported from Chord Roll (js/theory.js), same author: uncompressed PCM (8/16/24/32-bit, big- or
   little-endian "sowt") and 32/64-bit float AIFF-C. */

export type PcmAudio = { sampleRate: number; channels: Float32Array<ArrayBuffer>[] };

const tag = (v: DataView, o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

/** true when the bytes start like an AIFF / AIFF-C file, whatever the file is called */
export function isAiff(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const v = new DataView(buf);
  return tag(v, 0) === "FORM" && /^AIF[FC]$/.test(tag(v, 8));
}

export function parseAiff(buf: ArrayBuffer): PcmAudio {
  const v = new DataView(buf);
  if (!isAiff(buf)) throw new Error("AIFFファイルではありません");
  let ch = 0, frames = 0, bits = 0, rate = 0, comp = "NONE", data = -1;
  for (let o = 12; o + 8 <= buf.byteLength;) {
    const id = tag(v, o), len = v.getUint32(o + 4);
    if (id === "COMM") {
      ch = v.getUint16(o + 8); frames = v.getUint32(o + 10); bits = v.getUint16(o + 14);
      // sample rate is an 80-bit extended float
      const e = v.getUint16(o + 16) & 0x7fff, hi = v.getUint32(o + 18), lo = v.getUint32(o + 22);
      rate = (hi * 2 ** 32 + lo) * 2 ** (e - 16383 - 63);
      if (tag(v, 8) === "AIFC" && len >= 22) comp = tag(v, o + 26);
    } else if (id === "SSND") data = o + 16 + v.getUint32(o + 8);
    o += 8 + len + (len & 1);
  }
  if (!ch || !rate || data < 0) throw new Error("AIFFの中身を読み取れませんでした");
  const le = comp === "sowt", flt = /^fl(32|64)$/i.test(comp), bytes = flt ? (comp.endsWith("64") ? 8 : 4) : Math.ceil(bits / 8);
  if (!flt && !["NONE", "twos", "sowt"].includes(comp)) throw new Error(`この形式のAIFF（${comp}）には対応していません`);
  frames = Math.max(0, Math.min(frames, Math.floor((buf.byteLength - data) / (bytes * ch))));
  const out = Array.from({ length: ch }, () => new Float32Array(frames)), scale = 2 ** (bytes * 8 - 1);
  for (let i = 0, o = data; i < frames; i++) for (let c = 0; c < ch; c++, o += bytes) {
    let x;
    if (flt) x = bytes === 8 ? v.getFloat64(o) : v.getFloat32(o);
    else if (bytes === 1) x = v.getInt8(o) / scale;
    else if (bytes === 2) x = v.getInt16(o, le) / scale;
    else if (bytes === 3) { const b0 = v.getUint8(o), b1 = v.getUint8(o + 1), b2 = v.getUint8(o + 2); x = (le ? (b2 << 24 | b1 << 16 | b0 << 8) : (b0 << 24 | b1 << 16 | b2 << 8)) / 2 ** 31; }
    else x = v.getInt32(o, le) / scale;
    out[c][i] = x;
  }
  return { sampleRate: rate, channels: out };
}

/** 16-bit PCM WAV of the audio, which every browser's <audio> plays */
export function encodeWav(a: PcmAudio): Uint8Array<ArrayBuffer> {
  const ch = a.channels.length, n = ch ? a.channels[0].length : 0, size = 44 + n * ch * 2;
  const b = new ArrayBuffer(size), v = new DataView(b), str = (o: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  const rate = Math.round(a.sampleRate);
  str(0, "RIFF"); v.setUint32(4, size - 8, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * ch * 2, true);
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) {
    const x = Math.max(-1, Math.min(1, a.channels[c][i]));
    v.setInt16(o, Math.round(x < 0 ? x * 32768 : x * 32767), true);
  }
  return new Uint8Array(b);
}
