import {startOutput} from './audio.js';
/** Plays a timeline on absolute deadlines (no drift). Optional channel ('lab'|'send') adds sound/vibration per user settings. */
export function playTimeline(events,{onEvent=()=>{},onDone=()=>{},channel=null}={}){
  let i=0,t=null,dead=false,due=0;const out=channel?startOutput(events,channel):null,t0=performance.now();
  const step=()=>{if(dead)return;if(i>=events.length){onDone();return}const e=events[i];onEvent(e,i++);due+=e.ms;t=setTimeout(step,Math.max(0,t0+due-performance.now()))};
  step();
  return{cancel(){dead=true;clearTimeout(t);out?.stop()}};
}
