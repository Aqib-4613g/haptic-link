import test from 'node:test';import assert from 'node:assert/strict';
import {encode,normalizeInput,normalizeMessage,toMorseString,MORSE} from '../src/lib/morse.js';
import {DEVICE_PROFILE,STANDARD_PROFILE,unitMs,buildTimeline,totalMs,charSilenceUnits,wordSilenceUnits} from '../src/lib/timing.js';
import {playTimeline} from '../src/lib/signalPlayer.js';
import {loadProgress,sanitizeProgress,defaultProgress,loadHistory,saveProgress,saveHistory} from '../src/lib/storage.js';
import * as C from '../src/lib/challengeEngine.js';
import {DeviceService,DemoDevice,createDevice} from '../src/lib/deviceService.js';
const mem=(init={})=>{const m={...init};return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]},m}};
const seq=(n=1)=>{let s=n;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}};

test('morse: encoding, spaces, newline, unsupported',()=>{
  assert.equal(toMorseString('SOS'),'... --- ...');assert.equal(toMorseString('hi  there'),'.... .. / - .... . .-. .');
  assert.equal(normalizeInput('a\nb\r\nc'),'a b  c');assert.equal(normalizeMessage('  a\n\n b  '),'a b');
  const e=encode('A! B?');assert.deepEqual(e.unsupported,['!','?']);assert.equal(e.words.length,2);
  assert.equal(encode('!!!').words.length,0);assert.equal(normalizeInput('x'.repeat(200)).length,120);
  assert.equal(Object.keys(MORSE).length,36);
});
test('timing: firmware profile',()=>{
  assert.equal(unitMs(DEVICE_PROFILE),80);assert.equal(charSilenceUnits(DEVICE_PROFILE),3);assert.equal(wordSilenceUnits(DEVICE_PROFILE),10);
  assert.equal(wordSilenceUnits(STANDARD_PROFILE),7);assert.equal(unitMs({...DEVICE_PROFILE,wpm:20}),60);
});
const silences=ev=>{const o=[];let cur=0,seen=false;for(const e of ev){if(e.type==='on'){if(seen)o.push(cur);cur=0;seen=true}else cur+=e.units}return o};
test('timeline: exact gaps between vibrations',()=>{
  const ev=buildTimeline(encode('A E').words);
  assert.deepEqual(ev.filter(e=>e.type==='on').map(e=>e.units),[1,3,1]);
  assert.deepEqual(silences(ev),[1,10]);                                  // inside A, then A→E word gap
  assert.deepEqual(silences(buildTimeline(encode('EE').words)),[3]);      // char gap
  assert.equal(totalMs(buildTimeline(encode('E').words)),(1+1+2)*80);
  assert.equal(buildTimeline(encode('SOS').words).filter(e=>e.type==='on').length,9);
  assert.deepEqual(buildTimeline(encode('A B').words,{...DEVICE_PROFILE,wpm:30}).find(e=>e.type==='on').ms,40);
});
test('player: order, done, cancel',async()=>{
  const ev=buildTimeline(encode('SOS').words,{...DEVICE_PROFILE,wpm:1.2e6}),seen=[];
  await new Promise(r=>playTimeline(ev,{onEvent:(e,i)=>seen.push(i),onDone:r}));
  assert.deepEqual(seen,ev.map((_,i)=>i));
  let n=0;const p=playTimeline(ev,{onEvent:()=>n++});p.cancel();await new Promise(r=>setTimeout(r,20));assert.equal(n,1);
});
test('storage: corrupt, migration, clamps',()=>{
  assert.deepEqual(loadProgress(mem({'hapticlink.progress.v1':'{bad'})),defaultProgress());
  assert.deepEqual(loadProgress(null),defaultProgress());
  assert.deepEqual(sanitizeProgress({v:1,lessons:'x',stats:7}),defaultProgress());
  const leg=loadProgress(mem({morseProgress:JSON.stringify({lesson:3,correct:12,sessions:4})}));
  assert.deepEqual([1,2,3].map(i=>leg.lessons[i]?.completed),[true,true,true]);assert.equal(leg.lessons[4],undefined);assert.equal(leg.stats.correct,12);
  const w=sanitizeProgress({v:1,lessons:{1:{completed:true,bestAccuracy:900,attempts:'x',lastPlayed:'bad'}},stats:{sessions:-4}});
  assert.equal(w.lessons[1].bestAccuracy,100);assert.equal(w.lessons[1].attempts,0);assert.equal(w.stats.sessions,0);
  const s=mem();saveProgress(w,s);assert.deepEqual(loadProgress(s),w);
  assert.deepEqual(loadHistory(mem({'hapticlink.history.v1':'{oops'})),[]);
  assert.equal(loadHistory(mem({'hapticlink.history.v1':JSON.stringify([1,null,{text:'A'}])})).length,1);
  const h=mem();saveHistory(Array.from({length:20},(_,i)=>({text:'m'+i,morse:'',time:1})),h);assert.equal(loadHistory(h).length,8);
});
test('challenge: targets only from taught items; distractors sensible',()=>{
  const taught=[new Set('ET'),new Set('ETIMA'),null,new Set('ETIMANSOHR'),new Set('ETIMANSOHR'),null];
  for(const L of C.LESSONS){
    for(let seed=1;seed<=30;seed++){
      const r=C.buildRounds(L,seq(seed));assert.equal(r.length,L.rounds);
      r.forEach((x,i)=>{
        assert.ok(x.options.includes(x.answer));assert.equal(new Set(x.options).size,x.options.length);assert.equal(x.options.length,Math.min(4,L.items.length));
        assert.ok(x.options.every(o=>L.items.includes(o)));
        if(i&&L.items.length>1)assert.notEqual(x.target,r[i-1].target);
        if(taught[L.id-1])for(const o of x.options)for(const ch of o)assert.ok(taught[L.id-1].has(ch),`${L.id}:${o}`);
        if(L.kind==='word'||L.id>=3)for(const o of x.options)for(const ch of o)assert.ok(new Set('ETIMANSOHR').has(ch));
      });
    }
  }
  const r=C.buildRounds(C.getLesson(4),seq(7));assert.ok(new Set(r.map(x=>x.target)).size>=8);
  const pos=r.map(x=>x.options.indexOf(x.answer));pos.forEach((p,i)=>i&&assert.notEqual(p,pos[i-1]));assert.ok(new Set(pos).size>=3);
});
const play=(id,{right=99,ms=500,rng=seq(3)}={})=>{let s=C.newSession(id,rng);for(let i=0;!s.done;i++){const r=s.rounds[s.index];s=C.submit(s,i<right?r.answer:r.options.find(o=>o!==r.answer),ms)}return s};
test('progression: unlock, retry, replay, ownership, bests',()=>{
  let p=defaultProgress();assert.deepEqual([1,2,3].map(i=>C.isUnlocked(p,i)),[true,false,false]);assert.equal(C.isUnlocked(p,7),false);
  let r=C.finishSession(p,play(1,{right:3}),'2026-10-04');p=r.progress;assert.equal(r.summary.accuracy,30);assert.equal(C.isUnlocked(p,2),false);assert.equal(p.lessons[1].completed,false);
  r=C.finishSession(p,play(1),'2026-10-04');p=r.progress;assert.ok(r.summary.passed&&r.summary.newlyCompleted&&r.summary.personalBest);assert.ok(C.isUnlocked(p,2));assert.equal(p.lessons[1].attempts,2);
  r=C.finishSession(p,play(1,{right:2}),'2026-10-04');p=r.progress;                       // bad replay
  assert.equal(p.lessons[1].completed,true);assert.equal(p.lessons[1].bestAccuracy,100);assert.equal(r.summary.personalBest,false);assert.equal(p.lessons[1].attempts,3);
  for(let i=0;i<5;i++)p=C.finishSession(p,play(1),'2026-10-04').progress;assert.equal(p.stats.sessions,8);                      // repeats indefinitely
  const s2=play(2);const a=C.finishSession(p,s2,'2026-10-04');const b=C.finishSession(a.progress,s2,'2026-10-04');
  assert.equal(b.applied,false);assert.equal(b.progress.stats.sessions,a.progress.stats.sessions);
  assert.equal(a.progress.lessons[2].attempts,1);assert.equal(a.progress.lessons[3],undefined);                                  // credited to producing lesson only
  const unfinished=C.submit(C.newSession(3),null,0);assert.equal(C.finishSession(p,unfinished).applied,false);
  assert.equal(JSON.stringify(p),JSON.stringify(structuredClone(p)));
});
test('stats semantics + day streak',()=>{
  const s=C.newSession(2,seq(5));let t=s;const pat=[1,1,1,0,1,1];for(const ok of pat){const r=t.rounds[t.index];t=C.submit(t,ok?r.answer:r.options.find(o=>o!==r.answer),400)}
  const m=C.summarize(t);assert.equal(m.correct,5);assert.equal(m.bestStreak,3);assert.equal(m.total,6);
  let p=defaultProgress();const day=d=>C.finishSession(p,play(1),d).progress;
  p=day('2026-10-01');assert.equal(p.stats.dayStreak,1);p=day('2026-10-01');assert.equal(p.stats.dayStreak,1);
  p=day('2026-10-02');assert.equal(p.stats.dayStreak,2);p=day('2026-10-05');assert.equal(p.stats.dayStreak,1);
  assert.equal(C.currentDayStreak(p,'2026-10-06'),1);assert.equal(C.currentDayStreak(p,'2026-10-08'),0);
  assert.equal(p.stats.correct,40);assert.equal(p.stats.sessions,4);assert.equal(p.stats.bestStreak,10);
});
test('timed lessons enforce the limit in the engine',()=>{
  for(const id of [4,5,6]){const L=C.getLesson(id);assert.ok(L.timeLimitMs>0)}
  assert.ok(C.getLesson(5).timeLimitMs<C.getLesson(4).timeLimitMs);
  let s=C.newSession(5,seq(2));s=C.submit(s,s.rounds[0].answer,3501);assert.deepEqual([s.answers[0].correct,s.answers[0].timedOut],[false,true]);
  s=C.submit(s,s.rounds[1].answer,3500);assert.equal(s.answers[1].correct,true);s=C.submit(s,null,3500);assert.equal(s.answers[2].timedOut,true);
  assert.equal(C.summarize(play(5,{ms:9999})).accuracy,0);assert.equal(C.getLesson(1).timeLimitMs,null);
});
test('device: state machine, demo, send guards',async()=>{
  const d=createDevice({delay:()=>Promise.resolve()}),seen=[];d.subscribe(()=>seen.push(d.getStatus().state));
  assert.equal(d.getStatus().state,'offline');assert.equal((await d.sendMessage('hi')).error,'not-ready');
  const c=await d.connect();assert.equal(c.reason,'unavailable');assert.equal(d.getStatus().state,'offline');assert.match(d.getStatus().notice,/demo/i);
  await d.useDemo();assert.deepEqual(seen.filter((x,i,a)=>x!==a[i-1]),['offline','connecting','demo']);
  assert.equal(d.getStatus().label,'DEMO MODE');assert.equal(d.getStatus().canSend,true);
  const st=[];assert.equal((await d.sendMessage('  hi\nthere ',s=>st.push(s))).ok,true);assert.deepEqual(st,['encoding','sending','delivered']);
  assert.equal((await d.sendMessage('   \n ')).error,'empty');
  d.active.failNext=true;const f=await d.sendMessage('x');assert.equal(f.ok,false);assert.equal(d.getStatus().busy,false);assert.equal((await d.sendMessage('x')).ok,true);
  assert.equal(await d.disconnect(),true);assert.equal(d.getStatus().state,'offline');assert.equal(await d.disconnect(),false);
});
test('device: online/disconnected via fake backend',async()=>{
  let lost;const ble={id:'fake',connect:async cb=>{lost=cb},disconnect:async()=>{},send:async m=>({ok:true,m})};
  const d=new DeviceService({demo:new DemoDevice({delay:()=>Promise.resolve()}),ble});
  await d.connect();assert.equal(d.getStatus().state,'online');assert.equal((await d.sendMessage('a')).ok,true);
  lost();assert.equal(d.getStatus().state,'disconnected');assert.equal(d.getStatus().canSend,false);
  await d.connect();assert.equal(d.getStatus().state,'online');
  const bad=new DeviceService({demo:new DemoDevice(),ble:{connect:async()=>{throw new Error('x')}}});await bad.connect();assert.equal(bad.getStatus().state,'offline');assert.match(bad.getStatus().notice,/could not/i);
  await d.disconnect();await d.useDemo();assert.equal(d.getStatus().state,'demo');
});
import {sanitizeSettings,defaultSettings} from '../src/lib/storage.js';
import {startOutput,cue,canVibrate} from '../src/lib/audio.js';
test('settings: defaults, sanitising, audio is inert outside a browser',()=>{
  assert.deepEqual(defaultSettings(),{labSound:true,sendSound:false,vibrate:false});
  assert.deepEqual(sanitizeSettings({labSound:'x',sendSound:true,vibrate:1,zzz:1}),{labSound:true,sendSound:true,vibrate:false});
  assert.deepEqual(sanitizeSettings(null),defaultSettings());
  assert.doesNotThrow(()=>{startOutput([],'lab').stop();cue('sent');});assert.equal(canVibrate(),false);
});
test('player: absolute deadlines do not drift',async()=>{
  const ev=Array.from({length:40},()=>({type:'on',ms:5}));const t=performance.now();
  await new Promise(r=>playTimeline(ev,{onDone:r}));assert.ok(performance.now()-t<200+60);
});
