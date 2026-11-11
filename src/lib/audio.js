import {loadSettings,saveSettings} from './storage.js';
/** Feedback outputs. Morse tone = sustained soft sine (the "signal"); cues = short decaying bell-like notes (the "interface").
 *  Defaults: Lab sound ON (learning needs it), Send sound OFF (silent-communication product, public settings), vibration OFF. */
const has=typeof window!=='undefined';
let ctx=null,master=null,snap=loadSettings();const subs=new Set();
export const settings={get:()=>snap,subscribe:f=>(subs.add(f),()=>subs.delete(f)),set(k,v){snap={...snap,[k]:v};saveSettings(snap);subs.forEach(f=>f())}};
export const canVibrate=()=>has&&typeof navigator.vibrate==='function';
function ac(){
  if(!has)return null;
  if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ctx=new C();master=ctx.createGain();master.gain.value=.9;
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2600;master.connect(lp);lp.connect(ctx.destination)}
  if(ctx.state==='suspended')ctx.resume();return ctx;
}
export const unlockAudio=()=>{if(snap.labSound||snap.sendSound)ac()};
const MORSE_HZ=560,LEVEL=.085;
function tone(c,dest,hz,t,dur){
  const g=c.createGain(),o=c.createOscillator(),o2=c.createOscillator(),g2=c.createGain(),a=Math.min(.012,dur*.2),r=Math.min(.04,dur*.35);
  o.frequency.value=hz;o2.frequency.value=hz*2;g2.gain.value=.12;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(LEVEL,t+a);g.gain.setValueAtTime(LEVEL,t+dur-r);g.gain.linearRampToValueAtTime(0,t+dur);
  o.connect(g);o2.connect(g2);g2.connect(g);g.connect(dest);o.start(t);o2.start(t);o.stop(t+dur+.02);o2.stop(t+dur+.02);
}
/** Sound (sample-accurate, scheduled on the audio clock) and/or phone vibration for a timeline. */
export function startOutput(events,channel){
  const stops=[],c=snap[channel+'Sound']?ac():null;
  if(c){const bus=c.createGain();bus.connect(master);let t=c.currentTime+.03;
    for(const e of events){if(e.type==='on')tone(c,bus,MORSE_HZ,t,e.ms/1000);t+=e.ms/1000}
    stops.push(()=>{bus.gain.cancelScheduledValues(c.currentTime);bus.gain.setTargetAtTime(0,c.currentTime,.01)})}
  if(snap.vibrate&&canVibrate()){const p=[];let off=0;
    for(const e of events){if(e.type==='on'){if(p.length)p.push(off);p.push(Math.round(e.ms));off=0}else off+=Math.round(e.ms)}
    navigator.vibrate(p);stops.push(()=>navigator.vibrate(0))}
  return{stop(){stops.forEach(f=>f())}};
}
const CUES={send:[[659,0,.14],[988,.07,.2]],sent:[[523,0,.22],[659,.08,.22],[784,.16,.4]],connect:[[392,0,.2],[587,.09,.34]],error:[[220,0,.24,'triangle']],
  correct:[[880,0,.18],[1319,.07,.28]],wrong:[[165,0,.22,'triangle']],complete:[[523,0,.22],[659,.09,.22],[784,.18,.22],[1047,.27,.55]]};
export function cue(name,channel='send'){
  if(!snap[channel+'Sound'])return;const c=ac();if(!c)return;const t0=c.currentTime+.01;
  for(const[hz,dt,len,type='sine']of CUES[name]){const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=hz;
    g.gain.setValueAtTime(0,t0+dt);g.gain.linearRampToValueAtTime(.1,t0+dt+.006);g.gain.exponentialRampToValueAtTime(.0001,t0+dt+len);
    o.connect(g);g.connect(master);o.start(t0+dt);o.stop(t0+dt+len+.02)}
}
