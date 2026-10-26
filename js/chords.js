"use strict";
/* ============ Chords from an audio file ============
   Input: keySpectrum() from js/listen.js (dB of each piano key, every 20 ms). DOM-free so tests can run it in a VM.
   1. chroma: the energy of the 12 pitch classes in each frame (keys G2..B6), and a bass chroma from the low keys (E1..F#3)
   2. each frame is scored against chord templates (every chord tone with its 2nd..4th harmonics, since a real note
      also lights the keys an octave, an octave and a fifth and two octaves above it), plus the bass on the chord's root
   3. Viterbi picks the path through the chords that pays a price for every change, so blips are smoothed away
   The whole file is analysed before playback, so the path can use what comes after each moment too.
   Tuned on the demo song with scripts/eval.mjs (numbers in README.md). */
const CHORD_OPT={
  W:8,       // frames on each side that are summed into a frame's chroma (8 = ±160 ms)
  sw:.6,     // price of a chord change, in units of a frame's template score
  beta:20,   // scale of the scores in the Viterbi
  bassW:1,   // weight of the bass on the root
  h:.6,      // loudness of each harmonic relative to the one below
  lo:43,hi:96,blo:28,bhi:55,// MIDI ranges of the chroma and the bass chroma
  silence:.01,// frames quieter than this share of the loudest frame are "no chord"
  minLen:.4, // a chord shorter than this (s) is merged into the one before it: on the demo song these were mostly wrong
  flat:.35   // so are frames whose chroma has no pitch class above this (an even chroma is .29: noise, or digital silence)
};
const VOCAB=[["maj",[0,4,7]],["min",[0,3,7]],["7",[0,4,7,10]],["maj7",[0,4,7,11]],["min7",[0,3,7,10]],["m7b5",[0,3,6,10]],["sus4",[0,5,7]]];
function unit(v){let s=0;for(const a of v)s+=a*a;s=Math.sqrt(s)||1e-9;for(let i=0;i<v.length;i++)v[i]/=s;return v}
function chordTemplates(o=CHORD_OPT){
  const out=[];
  for(let r=0;r<12;r++)for(const [q,iv] of VOCAB){
    const t=new Float64Array(12);
    for(const i of iv)for(const [d,w] of [[0,1],[12,o.h],[19,o.h**2],[24,o.h**3]])t[(r+i+d)%12]+=w;
    out.push({root:r,q,t:unit(t)});
  }
  return out;
}
/* smoothed and normalised chroma and bass chroma per frame, and each frame's loudness */
function chromaFrames(sp,o=CHORD_OPT){
  const {frames:F,db}=sp,c=new Float64Array(F*12),b=new Float64Array(F*12);
  for(let f=0;f<F;f++)for(let k=0;k<88;k++){
    const m=k+21,v=10**(db[f*88+k]/20);
    if(m>=o.lo&&m<o.hi)c[f*12+m%12]+=v;
    if(m>=o.blo&&m<o.bhi)b[f*12+m%12]+=v;
  }
  const out=[];
  // running sums over the window
  const cs=new Float64Array(12),bs=new Float64Array(12);
  for(let f=0;f<Math.min(F,o.W);f++)for(let i=0;i<12;i++){cs[i]+=c[f*12+i];bs[i]+=b[f*12+i]}
  for(let f=0;f<F;f++){
    const add=f+o.W,del=f-o.W-1;
    if(add<F)for(let i=0;i<12;i++){cs[i]+=c[add*12+i];bs[i]+=b[add*12+i]}
    if(del>=0)for(let i=0;i<12;i++){cs[i]-=c[del*12+i];bs[i]-=b[del*12+i]}
    let e=0;for(let i=0;i<12;i++)e+=Math.max(0,cs[i]);
    out.push({c:unit(Float64Array.from(cs,v=>Math.max(0,v))),b:unit(Float64Array.from(bs,v=>Math.max(0,v))),e});
  }
  return out;
}
/* Krumhansl-Schmuckler on the tones of the chords found, weighted by how long each lasts
   (cleaner than the raw chroma, where harmonics and passing notes blur the picture) */
function detectAudioKey(segs){
  const h=new Array(12).fill(0),IV=Object.fromEntries(VOCAB);
  for(const s of segs)if(s.root>=0)for(const i of IV[s.q])h[(s.root+i)%12]+=(s.end-s.t)*(i===0?1.5:1);
  const MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  const corr=(a,b)=>{const ma=a.reduce((s,x)=>s+x,0)/12,mb=b.reduce((s,x)=>s+x,0)/12;let n=0,da=0,dc=0;for(let i=0;i<12;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;dc+=(b[i]-mb)**2}return n/Math.sqrt(da*dc||1)};
  let best={tonic:0,minor:false,r:-2};
  for(let t=0;t<12;t++){const rot=h.map((_,i)=>h[(i+t)%12]);
    const rM=corr(rot,MAJ),rm=corr(rot,MIN);
    if(rM>best.r)best={tonic:t,minor:false,r:rM};
    if(rm>best.r)best={tonic:t,minor:true,r:rm};
  }
  return best;
}
/* {segs:[{t,end,root,q}], key}. root -1 is "no chord" (silence) */
function detectChords(sp,hop,o=CHORD_OPT){
  const ch=chromaFrames(sp,o),tpl=chordTemplates(o),F=ch.length,N=tpl.length+1;
  let emax=0;for(const f of ch)emax=Math.max(emax,f.e);
  const obs=new Float64Array(F*N);
  for(let f=0;f<F;f++){const {c,b,e}=ch[f];
    for(let j=0;j<tpl.length;j++){const T=tpl[j].t;let s=0;for(let i=0;i<12;i++)s+=c[i]*T[i];obs[f*N+j]=s+o.bassW*b[tpl[j].root]}
    obs[f*N+N-1]=e<emax*o.silence||Math.max(...c)<o.flat?3:0;
  }
  // Viterbi: staying is free, moving costs sw
  const back=new Int16Array(F*N);let dp=new Float64Array(N),nd=new Float64Array(N);
  for(let j=0;j<N;j++)dp[j]=obs[j]*o.beta;
  for(let f=1;f<F;f++){
    let bi=0;for(let j=1;j<N;j++)if(dp[j]>dp[bi])bi=j;
    const mv=dp[bi]-o.sw*o.beta;
    for(let j=0;j<N;j++){if(dp[j]>=mv){nd[j]=dp[j];back[f*N+j]=j}else{nd[j]=mv;back[f*N+j]=bi}nd[j]+=obs[f*N+j]*o.beta}
    [dp,nd]=[nd,dp];
  }
  const path=new Int16Array(F);let last=0;for(let j=1;j<N;j++)if(dp[j]>dp[last])last=j;
  path[F-1]=last;for(let f=F-1;f>0;f--)path[f-1]=back[f*N+path[f]];
  const raw=[];
  for(let f=0;f<F;){
    let e=f;while(e+1<F&&path[e+1]===path[f])e++;
    const t=tpl[path[f]];
    raw.push({t:f*hop,end:(e+1)*hop,root:t?t.root:-1,q:t?t.q:null});
    f=e+1;
  }
  const segs=[];
  for(const s of raw){
    const last=segs[segs.length-1];
    if(last&&s.end-s.t<o.minLen){last.end=s.end;continue}
    if(last&&last.root===s.root&&last.q===s.q){last.end=s.end;continue}
    segs.push(s);
  }
  // a short chord at the very start goes to the one after it
  if(segs.length>1&&segs[0].end-segs[0].t<o.minLen){segs[1].t=0;segs.shift()}
  return {segs,key:detectAudioKey(segs)};
}
/* ============ Names ============ house style of Chord Roll: CMaj7, Cmin7, Cmin7b5 */
const QNAME={maj:"",min:"min","7":"7",maj7:"Maj7",min7:"min7",m7b5:"min7b5",sus4:"sus4"};
const PC_NAMES={
  sharp:["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],
  flat:["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],
  mixed:["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
};
// flats in the keys of F Bb Eb Ab Db Gb (and their relative minors), sharps in G D A E B, the readable mix in C / Am
function namesFor(key){
  if(!key)return PC_NAMES.mixed;
  const maj=key.minor?(key.tonic+3)%12:key.tonic;
  return maj===0?PC_NAMES.mixed:[5,10,3,8,1,6].includes(maj)?PC_NAMES.flat:PC_NAMES.sharp;
}
function chordLabel(s,key){return s.root<0?"N.C.":namesFor(key)[s.root]+QNAME[s.q]}
function keyLabel(key){return namesFor(key)[key.tonic]+(key.minor?" Minor":" Major")}
