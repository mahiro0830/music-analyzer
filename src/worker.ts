// Runs the analysis off the page's thread: {x: mono samples, sr} in, AnalysisResult or {error} out
import { keySpectrum, LISTEN_HOP } from "./listen.ts";
import { detectChords, type Key, type Segment } from "./chords.ts";

export type AnalysisRequest = { x: Float32Array; sr: number };
export type AnalysisResult = { segs: Segment[]; key: Key; ms: number };
export type AnalysisReply = AnalysisResult | { error: string };

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  let reply: AnalysisReply;
  try {
    const t0 = Date.now(), { segs, key } = detectChords(keySpectrum(e.data.x, e.data.sr), LISTEN_HOP);
    reply = { segs, key, ms: Date.now() - t0 };
  } catch (err) { reply = { error: String(err instanceof Error ? err.message : err) }; }
  self.postMessage(reply);
};
