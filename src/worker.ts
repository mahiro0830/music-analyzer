// Runs the analysis off the page's thread: {x: mono samples, sr} in, AnalysisResult or {error} out
import { keySpectrum, LISTEN_HOP } from "./listen.ts";
import { detectChords, type Key } from "./chords.ts";
import { refineChords, type AdvSegment } from "./advanced.ts";

export type AnalysisRequest = { x: Float32Array; sr: number };
/** segs: the basic chords, each with its 応用 chord (full) */
export type AnalysisResult = { segs: AdvSegment[]; key: Key; ms: number };
export type AnalysisReply = AnalysisResult | { error: string };

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  let reply: AnalysisReply;
  try {
    const t0 = Date.now(), sp = keySpectrum(e.data.x, e.data.sr), { segs, key } = detectChords(sp, LISTEN_HOP);
    reply = { segs: refineChords(sp, segs, LISTEN_HOP), key, ms: Date.now() - t0 };
  } catch (err) { reply = { error: String(err instanceof Error ? err.message : err) }; }
  self.postMessage(reply);
};
