import {MORSE} from './morse.js';
export const PASS=80;
const W=s=>s.split(' ');
const mk=(id,title,items,x)=>({id,title,items,kind:'letter',rounds:10,timeLimitMs:null,learnWpm:5,...x});
const T10=[...'ETIMANSOHR'];
/** Items come only from characters taught up to that lesson. Speed/pressure are real per-round time limits. */
export const LESSONS=[
  mk(1,'Meet the rhythm',['E','T']),
  mk(2,'The first five',[...'ETIMA']),
  mk(3,'Build a word',W('IT AT AM AN AS IS ME NO SO OH HE HI TO OR AH ON'),{kind:'word'}),
  mk(4,'Speed without stress',T10,{rounds:12,timeLimitMs:6000,learnWpm:8}),
  mk(5,'Decode under pressure',T10,{rounds:15,timeLimitMs:3500,learnWpm:10}),
  mk(6,'Ready for real messages',W('SOS HOME NOTE TEAM STORM HERO RISE SAME MORE TIME NAME HOST STAR MAIN ROOM TERM'),{kind:'word',rounds:12,timeLimitMs:12000,learnWpm:8}),
];
export const getLesson=id=>LESSONS.find(l=>l.id===id);
export const codeOf=s=>[...s].map(c=>MORSE[c]).join(' ');
export const isUnlocked=(p,id)=>!!getLesson(id)&&(id===1||p.lessons[id-1]?.completed===true);
const shuffle=(a,r)=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function lev(a,b){const m=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)m[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length]}
/** Shuffle-bag targets (even coverage, no back-to-back repeat); distractors are the closest-sounding items; correct slot never repeats twice in a row. */
export function buildRounds(L,rng=Math.random){
  const k=Math.min(4,L.items.length),out=[];let bag=[],lastT=null,lastPos=-1;
  while(out.length<L.rounds){
    let t;do{if(!bag.length)bag=shuffle(L.items,rng);t=bag.shift()}while(t===lastT&&L.items.length>1);
    const score=x=>lev(codeOf(x),codeOf(t))+(L.kind==='word'?Math.abs(x.length-t.length):0)+rng()*1.5;
    const near=L.items.filter(x=>x!==t).map(x=>[x,score(x)]).sort((a,b)=>a[1]-b[1]).slice(0,k+1).map(e=>e[0]);
    const opts=shuffle(near,rng).slice(0,k-1);
    const slots=[...Array(k).keys()].filter(i=>i!==lastPos||k===1),pos=slots[Math.floor(rng()*slots.length)];
    opts.splice(pos,0,t);out.push({target:t,code:codeOf(t),options:opts,answer:t});lastT=t;lastPos=pos;
  }
  return out;
}
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
export const newSession=(lessonId,rng=Math.random)=>({id:uid(),lessonId,rounds:buildRounds(getLesson(lessonId),rng),index:0,answers:[],done:false});
/** choice=null means timeout. Over-limit answers count as timeouts, so the limit is enforced here, not just in the UI. */
export function submit(s,choice,ms){
  if(s.done)return s;
  const L=getLesson(s.lessonId),r=s.rounds[s.index],timedOut=choice==null||(L.timeLimitMs!=null&&ms>L.timeLimitMs);
  const answers=[...s.answers,{correct:!timedOut&&choice===r.answer,ms:Math.max(0,ms),timedOut}],index=s.index+1;
  return{...s,answers,index,done:index>=s.rounds.length};
}
export function summarize(s){
  const total=s.answers.length,correct=s.answers.filter(a=>a.correct).length;let run=0,best=0;
  for(const a of s.answers){run=a.correct?run+1:0;best=Math.max(best,run)}
  const accuracy=total?Math.round(100*correct/total):0;
  return{correct,total,accuracy,bestStreak:best,timeouts:s.answers.filter(a=>a.timedOut).length,avgMs:total?Math.round(s.answers.reduce((a,b)=>a+b.ms,0)/total):0,passed:accuracy>=PASS};
}
export const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dayBefore=k=>{const d=new Date(k+'T00:00:00');d.setDate(d.getDate()-1);return dayKey(d)};
export const currentDayStreak=(p,today=dayKey())=>[today,dayBefore(today)].includes(p.stats.lastDay)?p.stats.dayStreak:0;
/** Pure. Credits the lesson that PRODUCED the session (session.lessonId); never decreases bests/completion; idempotent per session id. */
export function finishSession(progress,s,today=dayKey()){
  const sm=summarize(s);
  if(!s.done||progress.stats.lastSessionId===s.id)return{progress,summary:sm,applied:false};
  const p=structuredClone(progress),id=s.lessonId,prev=p.lessons[id]||{completed:false,bestAccuracy:0,attempts:0,lastPlayed:''};
  p.lessons[id]={completed:prev.completed||sm.passed,bestAccuracy:Math.max(prev.bestAccuracy,sm.accuracy),attempts:prev.attempts+1,lastPlayed:today};
  const st=p.stats;st.sessions++;st.correct+=sm.correct;st.answered+=sm.total;st.bestStreak=Math.max(st.bestStreak,sm.bestStreak);
  if(st.lastDay!==today){st.dayStreak=st.lastDay===dayBefore(today)?st.dayStreak+1:1;st.lastDay=today}
  st.lastSessionId=s.id;
  return{progress:p,summary:{...sm,personalBest:sm.accuracy>prev.bestAccuracy,newlyCompleted:sm.passed&&!prev.completed},applied:true};
}
