/** Single source of truth for signal timing. Units; unitMs = 1200 / wpm. */
export const DEVICE_PROFILE=Object.freeze({id:'device',wpm:15,dot:1,dash:3,symbolGap:1,charExtraGap:2,wordExtraGap:7});
/** Educational only. Never used for device/demo playback. */
export const STANDARD_PROFILE=Object.freeze({...DEVICE_PROFILE,id:'standard',wordExtraGap:4});
/** Lab visuals run slower than the device so dot vs dash is readable by eye. Device/demo playback never uses this. */
export const learnProfile=wpm=>Object.freeze({...DEVICE_PROFILE,id:'learn',wpm});
export const unitMs=(p=DEVICE_PROFILE)=>1200/p.wpm;
export const charSilenceUnits=p=>p.symbolGap+p.charExtraGap;
export const wordSilenceUnits=p=>charSilenceUnits(p)+p.wordExtraGap;
/** words: encode().words. Mirrors firmware: symbol gap after EVERY symbol, +charExtra after each char, +wordExtra between words. */
export function buildTimeline(words,p=DEVICE_PROFILE){
  const u=unitMs(p),ev=[];let sym=0;
  const push=(type,kind,units,x={})=>ev.push({type,kind,units,ms:units*u,...x});
  words.forEach((w,wi)=>{
    w.forEach(c=>{[...c.code].forEach(s=>{const d=s==='.';push('on',d?'dot':'dash',d?p.dot:p.dash,{sym:sym++,ch:c.ch});push('off','symbolGap',p.symbolGap)});push('off','charGap',p.charExtraGap)});
    if(wi<words.length-1)push('off','wordGap',p.wordExtraGap);
  });
  return ev;
}
export const totalMs=ev=>ev.reduce((a,e)=>a+e.ms,0);
