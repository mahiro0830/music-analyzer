/* ============ Listening: how loud each piano key sounds, every 20 ms ============
   Taken from Chord Roll (js/listen.js, same author). DOM-free, so it runs in the worker and in Node (tests, scripts/eval.ts).
   Two spectra per 20 ms frame: a long window on a decimated copy for the low keys (A0 to B3, where a semitone is a few Hz)
   and a short one for the rest, so high notes stay sharp in time. */
export const LISTEN_HOP=0.02;
/** dB of each piano key (A0..C8, 88 keys) in each frame: db[frame*88+key], 0 = the loudest key-frame of the song */
export type KeySpectrum={frames:number,db:Float32Array};
function fftMag(re:Float32Array,im:Float32Array){// in-place radix-2 FFT, re/im length a power of two
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){let x=re[i];re[i]=re[j];re[j]=x;x=im[i];im[i]=im[j];im[j]=x}}
  for(let len=2;len<=n;len<<=1){
    const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a),h=len>>1;
    for(let i=0;i<n;i+=len){let cr=1,ci=0;
      for(let k=0;k<h;k++){const p=i+k,q=p+h,tr=re[q]*cr-im[q]*ci,ti=re[q]*ci+im[q]*cr;
        re[q]=re[p]-tr;im[q]=im[p]-ti;re[p]+=tr;im[p]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}
  }
}
// low-pass (windowed sinc) and keep every `f`th sample
function decimate(x:Float32Array,f:number):Float32Array{
  const taps=8*f+1,h=new Float32Array(taps),c=(taps-1)/2,fc=.45/f;let sum=0;
  for(let i=0;i<taps;i++){const k=i-c;h[i]=(k?Math.sin(2*Math.PI*fc*k)/(Math.PI*k):2*fc)*(.42-.5*Math.cos(2*Math.PI*i/(taps-1))+.08*Math.cos(4*Math.PI*i/(taps-1)));sum+=h[i]}
  const n=Math.floor(x.length/f),y=new Float32Array(n);
  for(let o=0;o<n;o++){const m=o*f;let s=0;for(let i=0;i<taps;i++){const j=m+i-c;if(j>=0&&j<x.length)s+=x[j]*h[i]}y[o]=s/sum}
  return y;
}
/* energy of each key 21..108 in every frame, in dB (0 = the loudest key-frame of the song). Returns {frames, db: Float32Array(frames*88)} */
export function keySpectrum(x:Float32Array,sr:number):KeySpectrum{
  const hop=sr*LISTEN_HOP,frames=Math.max(1,Math.ceil(x.length/hop)),db=new Float32Array(frames*88);
  const dec=Math.max(1,Math.round(sr/2756)),lo=decimate(x,dec),srLo=sr/dec;
  const bands=[{x:lo,sr:srLo,n:1024,k0:0,k1:39},{x,sr,n:2048,k0:39,k1:88}];// keys 21..59 | 60..108
  for(const b of bands){
    const n=b.n,win=new Float32Array(n);let wsum=0;for(let i=0;i<n;i++){win[i]=.5-.5*Math.cos(2*Math.PI*i/n);wsum+=win[i]*win[i]}
    // bins of each key: the ones within half a semitone of its pitch, so no two keys share a bin; the nearest bin if none is
    const rng:[number,number][]=[];for(let k=b.k0;k<b.k1;k++){const f=440*2**((k+21-69)/12),bw=b.sr/n;
      let a=Math.ceil(f*2**(-.5/12)/bw),z=Math.floor(f*2**(.5/12)/bw);if(z<a)a=z=Math.round(f/bw);rng.push([a,Math.min(z,n/2-1)])}
    const re=new Float32Array(n),im=new Float32Array(n),step=b.sr*LISTEN_HOP;
    for(let fr=0;fr<frames;fr++){
      const mid=Math.round(fr*step),s0=mid-n/2;
      for(let i=0;i<n;i++){const j=s0+i;re[i]=j>=0&&j<b.x.length?b.x[j]*win[i]:0;im[i]=0}
      fftMag(re,im);
      for(let k=b.k0;k<b.k1;k++){const [a,z]=rng[k-b.k0];let p=0;for(let i=a;i<=z;i++)p=Math.max(p,re[i]*re[i]+im[i]*im[i]);
        db[fr*88+k]=10*Math.log10(p/wsum+1e-12)}
    }
  }
  let mx=-Infinity;for(let i=0;i<db.length;i++)if(db[i]>mx)mx=db[i];
  for(let i=0;i<db.length;i++)db[i]=Math.max(-80,db[i]-mx);
  return {frames,db};
}
