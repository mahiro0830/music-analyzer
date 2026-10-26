// Loads the browser scripts (js/listen.js, js/chords.js) into a VM for Node: they are plain scripts, not modules
import fs from "node:fs";
import vm from "node:vm";

export function loadAnalyzer() {
  const ctx = vm.createContext({});
  for (const f of ["listen.js", "chords.js"]) vm.runInContext(fs.readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8"), ctx);
  vm.runInContext("globalThis.A={keySpectrum,LISTEN_HOP,detectChords,chordLabel,keyLabel,CHORD_OPT};", ctx);
  return ctx.A;
}
