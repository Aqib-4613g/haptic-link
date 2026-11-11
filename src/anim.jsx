import {useState,useEffect,useLayoutEffect,useRef,useMemo} from 'react';
import {encode} from './lib/morse.js';
import {buildTimeline,DEVICE_PROFILE} from './lib/timing.js';
import {playTimeline} from './lib/signalPlayer.js';
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Word-by-word blur/rise reveal (BlurText idea). Words, not chars, so kerning in big headings survives. */
export function Split({text,delay=0,step=90}){
  return <span className="split"><span className="sr-only">{text}</span>{text.split(' ').map((w,i,a)=><span key={i} aria-hidden="true"><span className="sw" style={{'--i':i,'--base':`${delay}s`,'--step':`${step}ms`}}>{w}</span>{i<a.length-1&&' '}</span>)}</span>;
}
/** Text resolves from Morse glyphs into letters (DecryptedText idea) whenever `text` changes. */
export function Scramble({text,ms=520}){
  const [out,setOut]=useState(text);
  useLayoutEffect(()=>{
    if(reduced()){setOut(text);return}
    const t0=performance.now();let raf;
    const tick=n=>{const p=Math.min(1,(n-t0)/ms),k=Math.floor(p*text.length);
      setOut([...text].map((c,i)=>i<k||c===' '?c:'.-'[Math.random()*2|0]).join(''));p<1?raf=requestAnimationFrame(tick):setOut(text)};
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[text,ms]);
  return <span><span className="sr-only">{text}</span><span aria-hidden="true">{out}</span></span>;
}
export function CountUp({to,suffix='',dec=0,ms=900}){
  const [v,setV]=useState(0),from=useRef(0);
  useEffect(()=>{
    if(reduced()){setV(to);from.current=to;return}
    const a=from.current,t0=performance.now();let raf;
    const tick=n=>{const p=Math.min(1,(n-t0)/ms),c=a+(to-a)*(1-(1-p)**3);setV(c);from.current=c;if(p<1)raf=requestAnimationFrame(tick)};
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[to,ms]);
  return <>{v.toFixed(dec)}{suffix}</>;
}
/** Scroll-triggered reveal for [data-reveal] elements; call after each page mount. */
export function initReveal(){
  const els=[...document.querySelectorAll('[data-reveal]:not(.in)')];
  if(!('IntersectionObserver' in window)||reduced()){els.forEach(e=>e.classList.add('in'));return()=>{}}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -6% 0px'});
  els.forEach(e=>io.observe(e));return()=>io.disconnect();
}
/** Decorative: the brand name transmitted on a loop with the same timeline engine (slower than the device). */
export function HeroSignal({text='HAPTIC LINK'}){
  const enc=useMemo(()=>encode(text),[text]),[lit,setLit]=useState(-1);
  useEffect(()=>{
    if(reduced())return;let pl,t;
    const tl=buildTimeline(enc.words,{...DEVICE_PROFILE,wpm:9}),run=()=>{pl=playTimeline(tl,{onEvent:e=>setLit(e.type==='on'?e.sym:-1),onDone:()=>{setLit(-1);t=setTimeout(run,2800)}})};
    t=setTimeout(run,1400);return()=>{clearTimeout(t);pl?.cancel()};
  },[enc]);
  let n=0;
  return <div className="hero-signal" aria-hidden="true">{enc.words.map((w,i)=><div className="pword" key={i}>{w.map((c,j)=><span className="pchar" key={j}>{[...c.code].map((s,k)=><i key={k} className={`pb ${s==='.'?'dot':'dash'}${n++===lit?' on':''}`}/>)}</span>)}</div>)}</div>;
}
