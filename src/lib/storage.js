const PK='hapticlink.progress.v1',HK='hapticlink.history.v1',LEGACY='morseProgress',DAY=/^\d{4}-\d{2}-\d{2}$/;
const ls=()=>{try{return globalThis.localStorage}catch{return null}};
const num=(x,lo,hi,d=lo)=>{x=Number(x);return Number.isFinite(x)?Math.min(hi,Math.max(lo,Math.round(x))):d};
const read=(s,k)=>{try{const r=s.getItem(k);return r==null?null:JSON.parse(r)}catch{return null}};
const write=(s,k,v)=>{try{s.setItem(k,JSON.stringify(v));return true}catch{return false}};
export const defaultProgress=()=>({v:1,lessons:{},stats:{sessions:0,correct:0,answered:0,bestStreak:0,dayStreak:0,lastDay:'',lastSessionId:''}});
export function sanitizeProgress(o){
  const d=defaultProgress();if(!o||typeof o!=='object')return d;
  if(o.v==null&&'lesson' in o){ // v2 migration: lessons before `lesson` were completed (bestAccuracy set to pass mark, true value unknown)
    for(let i=1;i<=num(o.lesson,0,6);i++)d.lessons[i]={completed:true,bestAccuracy:80,attempts:1,lastPlayed:''};
    d.stats.sessions=num(o.sessions,0,1e6);d.stats.correct=num(o.correct,0,1e9);return d}
  if(o.v!==1)return d;
  const L=o.lessons&&typeof o.lessons==='object'?o.lessons:{};
  for(let i=1;i<=6;i++){const l=L[i];if(l&&typeof l==='object')d.lessons[i]={completed:l.completed===true,bestAccuracy:num(l.bestAccuracy,0,100),attempts:num(l.attempts,0,1e6),lastPlayed:DAY.test(l.lastPlayed)?l.lastPlayed:''}}
  const s=o.stats&&typeof o.stats==='object'?o.stats:{};
  d.stats={sessions:num(s.sessions,0,1e6),correct:num(s.correct,0,1e9),answered:num(s.answered,0,1e9),bestStreak:num(s.bestStreak,0,1e6),dayStreak:num(s.dayStreak,0,1e5),lastDay:DAY.test(s.lastDay)?s.lastDay:'',lastSessionId:typeof s.lastSessionId==='string'?s.lastSessionId.slice(0,64):''};
  return d;
}
export const loadProgress=(s=ls())=>sanitizeProgress(read(s,PK)??read(s,LEGACY));
export const saveProgress=(p,s=ls())=>write(s,PK,p);
export const resetProgress=(s=ls())=>{try{s.removeItem(PK);s.removeItem(LEGACY);return true}catch{return false}};
export const sanitizeHistory=a=>Array.isArray(a)?a.filter(i=>i&&typeof i.text==='string').slice(0,8).map(i=>({text:i.text.slice(0,120),morse:String(i.morse??'').slice(0,1200),time:num(i.time,0,8.64e15,Date.now()),demo:i.demo!==false})):[];
export const loadHistory=(s=ls())=>sanitizeHistory(read(s,HK)??read(s,'hapticHistory'));
export const saveHistory=(h,s=ls())=>write(s,HK,sanitizeHistory(h));
const SK='hapticlink.settings.v1';
export const defaultSettings=()=>({labSound:true,sendSound:false,vibrate:false});
export const sanitizeSettings=o=>{const d=defaultSettings();if(o&&typeof o==='object')for(const k of Object.keys(d))if(typeof o[k]==='boolean')d[k]=o[k];return d};
export const loadSettings=(s=ls())=>sanitizeSettings(read(s,SK));
export const saveSettings=(v,s=ls())=>write(s,SK,sanitizeSettings(v));
