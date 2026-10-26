// AIFF reading and WAV writing (src/audio.ts), on AIFF files built here byte by byte
import test from "node:test";
import assert from "node:assert/strict";
import { encodeWav, isAiff, parseAiff } from "../src/audio.ts";

// 80-bit extended float, as AIFF stores the sample rate
function ext80(x: number): number[] {
  const e = Math.floor(Math.log2(x)), m = x / 2 ** e * 2 ** 31;
  const hi = Math.floor(m), out = [(e + 16383) >> 8, (e + 16383) & 255];
  for (const s of [24, 16, 8, 0]) out.push((hi >>> s) & 255);
  return out.concat([0, 0, 0, 0]);
}
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id: string, body: number[]) => [...id].map(c => c.charCodeAt(0)).concat(be32(body.length), body, body.length & 1 ? [0] : []);
/** an AIFF (comp "NONE") or AIFF-C file of these interleaved sample bytes */
function aiff(o: { ch: number; frames: number; bits: number; rate: number; comp?: string; samples: number[]; extra?: boolean }): ArrayBuffer {
  const comm = [0, o.ch, ...be32(o.frames), 0, o.bits, ...ext80(o.rate)];
  if (o.comp) comm.push(...[...o.comp].map(c => c.charCodeAt(0)), 0);// compression name: empty pascal string
  const body = [...[...(o.comp ? "AIFC" : "AIFF")].map(c => c.charCodeAt(0)),
    ...(o.extra ? chunk("NAME", [65, 66, 67]) : []),// an odd-length chunk before the audio, padded to even
    ...chunk("COMM", comm), ...chunk("SSND", [0, 0, 0, 0, 0, 0, 0, 0, ...o.samples])];
  return new Uint8Array(chunk("FORM", body)).buffer;
}
const near = (a: Float32Array, b: number[], tol = 1e-4) => b.forEach((x, i) => assert.ok(Math.abs(a[i] - x) < tol, `${i}: ${a[i]} vs ${x}`));

test("16-bit big-endian stereo, with another chunk before it", () => {
  const a = parseAiff(aiff({ ch: 2, frames: 2, bits: 16, rate: 44100, extra: true, samples: [0x40, 0, 0xc0, 0, 0x7f, 0xff, 0x80, 0] }));
  assert.equal(a.sampleRate, 44100); assert.equal(a.channels.length, 2);
  near(a.channels[0], [0.5, 32767 / 32768]); near(a.channels[1], [-0.5, -1]);
});

test("24-bit mono at 48 kHz", () => {
  const a = parseAiff(aiff({ ch: 1, frames: 2, bits: 24, rate: 48000, samples: [0x20, 0, 0, 0xe0, 0, 0] }));
  assert.equal(a.sampleRate, 48000); near(a.channels[0], [0.25, -0.25]);
});

test("AIFF-C: little-endian 16-bit (sowt) and 32-bit float", () => {
  near(parseAiff(aiff({ ch: 1, frames: 2, bits: 16, rate: 22050, comp: "sowt", samples: [0, 0x40, 0, 0xc0] })).channels[0], [0.5, -0.5]);
  const f = new Uint8Array(8); new DataView(f.buffer).setFloat32(0, 0.125); new DataView(f.buffer).setFloat32(4, -0.75);
  near(parseAiff(aiff({ ch: 1, frames: 2, bits: 32, rate: 22050, comp: "fl32", samples: [...f] })).channels[0], [0.125, -0.75]);
});

test("compressed AIFF-C and other files are refused", () => {
  assert.throws(() => parseAiff(aiff({ ch: 1, frames: 1, bits: 16, rate: 44100, comp: "ima4", samples: [0, 0] })), /ima4/);
  const wav = encodeWav({ sampleRate: 44100, channels: [new Float32Array(4)] }).buffer;
  assert.equal(isAiff(wav), false);
  assert.throws(() => parseAiff(wav), /AIFFファイルではありません/);
});

test("WAV: header and samples", () => {
  const w = encodeWav({ sampleRate: 44100, channels: [Float32Array.of(0.5, -1), Float32Array.of(-0.5, 1)] }), v = new DataView(w.buffer);
  const str = (o: number) => String.fromCharCode(...w.slice(o, o + 4));
  assert.equal(str(0), "RIFF"); assert.equal(str(8), "WAVE"); assert.equal(str(36), "data");
  assert.equal(v.getUint16(22, true), 2); assert.equal(v.getUint32(24, true), 44100); assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(4, true), w.length - 8); assert.equal(v.getUint32(40, true), 8);
  assert.deepEqual([0, 1, 2, 3].map(i => v.getInt16(44 + 2 * i, true)), [16384, -16384, -32768, 32767]);
});
