"use strict";
// Runs the analysis off the page's thread: {x: Float32Array mono, sr} in, {segs, key, ms} out
importScripts("listen.js", "chords.js");
self.onmessage = e => {
  try {
    const t0 = Date.now(), { segs, key } = detectChords(keySpectrum(e.data.x, e.data.sr), LISTEN_HOP);
    self.postMessage({ segs, key, ms: Date.now() - t0 });
  } catch (err) { self.postMessage({ error: String(err && err.message || err) }); }
};
