/** Pointer-driven effects. Delegated, one rAF-throttled listener. Implemented from scratch; the ideas follow
 *  React Bits' SpotlightCard / Magnet / TiltedCard. Transform-only, so none of it affects layout. */
export function initFx(){
  const rm=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
  if(!fine.matches)return()=>{};
  const clamp=(v,m)=>Math.max(-m,Math.min(m,v));let raf=0,ev=null;
  const reset=()=>{document.querySelectorAll('[data-magnet]').forEach(e=>{e.style.setProperty('--tx','0px');e.style.setProperty('--ty','0px')});
    document.querySelectorAll('[data-tilt]').forEach(e=>{e.style.setProperty('--rx','0deg');e.style.setProperty('--ry','0deg')})};
  const run=()=>{
    raf=0;const{clientX:x,clientY:y,target}=ev,panel=target.closest?.('.panel');
    if(panel){const r=panel.getBoundingClientRect();panel.style.setProperty('--mx',`${x-r.left}px`);panel.style.setProperty('--my',`${y-r.top}px`)}
    if(rm.matches)return;
    document.querySelectorAll('[data-magnet]').forEach(el=>{
      const r=el.getBoundingClientRect(),dx=x-(r.left+r.width/2),dy=y-(r.top+r.height/2),R=Math.max(r.width,r.height)*.8,k=el.disabled?0:Math.max(0,1-Math.hypot(dx,dy)/R);
      el.style.setProperty('--tx',`${clamp(dx*.14*k,6).toFixed(1)}px`);el.style.setProperty('--ty',`${clamp(dy*.14*k,4).toFixed(1)}px`)});
    document.querySelectorAll('[data-tilt]').forEach(el=>{
      const r=el.getBoundingClientRect(),inn=x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
      el.style.setProperty('--rx',`${inn?(-((y-r.top)/r.height-.5)*10).toFixed(1):0}deg`);el.style.setProperty('--ry',`${inn?(((x-r.left)/r.width-.5)*10).toFixed(1):0}deg`)});
  };
  const mv=e=>{ev=e;if(!raf)raf=requestAnimationFrame(run)};
  addEventListener('pointermove',mv,{passive:true});document.documentElement.addEventListener('pointerleave',reset);
  return()=>{removeEventListener('pointermove',mv);document.documentElement.removeEventListener('pointerleave',reset);cancelAnimationFrame(raf)};
}
