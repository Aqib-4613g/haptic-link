import {useState,useEffect,useRef,useCallback} from 'react';
import {encode,normalizeInput,toMorseString} from './lib/morse.js';
import {buildTimeline,learnProfile} from './lib/timing.js';
import {Split,Scramble,CountUp} from './anim.jsx';
import {cue} from './lib/audio.js';
import {Feel} from './Feel.jsx';
import {playTimeline} from './lib/signalPlayer.js';
import {LESSONS,PASS,isUnlocked,newSession,submit,finishSession,currentDayStreak} from './lib/challengeEngine.js';
import {loadProgress,saveProgress,resetProgress,defaultProgress} from './lib/storage.js';

const COPY=[
 {teach:['E','T'],text:'Morse has two signals: a short pulse (dot) and a long pulse (dash). A dash lasts three times as long as a dot. E is one dot. T is one dash. Learn to tell them apart by feel before anything else.'},
 {teach:[...'ETIMA'],text:'Five letters built from short patterns: E, T, I, M, A. Say the rhythm instead of counting: A is “short, long”. Listen for the shape.'},
 {teach:[...'NSOHR'],text:'Five new letters: N, S, O, H, R. Then letters join into short words, with a rest between letters. Recognise the whole word by its rhythm.'},
 {teach:[...'ETIMANSOHR'],text:'Accuracy first, then speed. Each answer must come within 6 seconds after the pattern ends. The bar shows the time left. A missed deadline counts as wrong.'},
 {teach:[...'ETIMANSOHR'],text:'The same ten letters, now with 3.5 seconds per answer. No chart, no second chances. Trust the rhythm you have learned.'},
 {teach:['SOS','HOME','NOTE'],text:'Real words you could send, such as SOS, HOME and NOTE. You have 12 seconds each. Finish with 80% or better and you are ready to send a message.'},
];
const STEPS=['Explain','Demo','Try','Challenge','Results'];

function useSignal(){
  const [st,setSt]=useState({text:'',sym:-1,kind:''}),pl=useRef(),tm=useRef();
  const stop=useCallback(()=>{pl.current?.cancel();clearTimeout(tm.current);setSt({text:'',sym:-1,kind:''})},[]);
  const play=useCallback((text,done,wpm=5)=>{pl.current?.cancel();setSt({text,sym:-1,kind:''});
    pl.current=playTimeline(buildTimeline(encode(text).words,learnProfile(wpm)),{onEvent:e=>setSt({text,sym:e.type==='on'?e.sym:-1,kind:e.type==='on'?e.kind:''}),onDone:()=>{setSt({text:'',sym:-1,kind:''});done?.()},channel:'lab'})},[]);
  const seq=useCallback(items=>{let i=0;const next=()=>{if(i<items.length)play(items[i++],()=>{tm.current=setTimeout(next,800)})};stop();next()},[play,stop]);
  useEffect(()=>stop,[stop]);
  return{...st,play,seq,stop};
}
function Pattern({text,lit=-1}){
  let n=0;
  return <span className="lpat" aria-hidden="true">{encode(text).words.map((w,i)=><span className="lpw" key={i}>{w.map((c,j)=><span className="pchar" key={j}>{[...c.code].map((s,k)=><i key={k} className={`pb ${s==='.'?'dot':'dash'}${n++===lit?' on':''}`}/>)}</span>)}</span>)}</span>;
}
function Cards({items,sig}){
  return <div className="lcards">{items.map(it=><button key={it} className="lcard" onClick={()=>sig.play(it)} aria-label={`Play ${it}: ${toMorseString(it)}`}>
    <strong>{it}</strong><Pattern text={it} lit={sig.text===it?sig.sym:-1}/></button>)}</div>;
}

function Challenge({lesson,onDone}){
  const [s,setS]=useState(()=>newSession(lesson.id)),[fb,setFb]=useState(null),[armed,setArmed]=useState(false);
  const sig=useSignal(),t0=useRef(0),isArmed=useRef(false),timers=useRef([]);
  const round=s.rounds[s.index];
  const answer=c=>{
    if(fb||s.done)return;timers.current.forEach(clearTimeout);sig.stop();
    const ns=submit(s,c,isArmed.current?performance.now()-t0.current:0),a=ns.answers.at(-1);cue(a.correct?'correct':'wrong','lab');
    setFb({ok:a.correct,timedOut:a.timedOut,choice:c});
    timers.current=[setTimeout(()=>{setFb(null);setS(ns)},a.correct?650:1400)];
  };
  useEffect(()=>{
    if(s.done)return;isArmed.current=false;setArmed(false);
    sig.play(round.target,()=>{t0.current=performance.now();isArmed.current=true;setArmed(true);
      if(lesson.timeLimitMs)timers.current.push(setTimeout(()=>answer(null),lesson.timeLimitMs))},lesson.learnWpm);
    return()=>{sig.stop();timers.current.forEach(clearTimeout)};
  },[s.index]); // eslint-disable-line
  useEffect(()=>{if(s.done)onDone(s)},[s.done]); // eslint-disable-line
  useEffect(()=>{const k=e=>{const i=+e.key-1;if(i>=0&&i<round?.options.length)answer(round.options[i])};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)});
  if(s.done)return null;
  const right=s.answers.filter(a=>a.correct).length;
  return <div className="panel challenge-card" key={s.id}>
    <div className="challenge-top"><div><span className="kicker">ROUND {s.index+1} / {s.rounds.length}</span><h2>What did you feel?</h2></div>
      <div className="challenge-score"><strong>{right}</strong><small>correct</small></div></div>
    <div className="signal-stage"><div className={`signal-orb${sig.sym>=0?' active':''}${sig.kind==='dash'?' dash':''}`}/><div className="signal-label">{fb?(fb.ok?'✓ CORRECT':fb.timedOut?'✕ TIME’S UP':'✕ NOT QUITE'):armed?'ANSWER':'LISTEN'}</div>
      {lesson.timeLimitMs&&armed&&!fb&&<div className="timebar" key={s.index} style={{'--d':`${lesson.timeLimitMs}ms`}}/>}</div>
    <div className="answer-grid">{round.options.map((o,i)=>{const cls=fb?(o===round.answer?' correct':o===fb.choice?' wrong shake':''):'';
      return <button key={o} className={`answer-btn${cls}`} disabled={!!fb&&!cls} onClick={()=>answer(o)}><span className="akey">{i+1}</span>{o}{lesson.id===1&&<span className="sub">{o==='E'?'dot':'dash'}</span>}{fb&&o===round.answer&&<small>✓</small>}{cls.includes('wrong')&&<small>✕</small>}</button>})}</div>
    <div className="challenge-footer"><button className="text-btn" disabled={!!fb} onClick={()=>sig.play(round.target,undefined,lesson.learnWpm)}>↻ Replay pattern</button>
      <span role="status">{fb&&!fb.ok?`It was ${round.target}: ${round.code}`:fb?'Nice recognition.':'Keys 1–4 also answer.'}</span></div>
  </div>;
}

function Results({r,lesson,next,onRetry,onBack,onNext}){
  return <div className="panel results-card"><span className="kicker">SESSION COMPLETE</span>
    <h2>{r.passed?(r.newlyCompleted?'Lesson complete.':'Passed.'):`Not yet — ${PASS}% unlocks the next lesson.`}</h2>
    <div className="result-grid rg4"><div><strong>{r.correct}/{r.total}</strong><span>score</span></div><div><strong><CountUp to={r.accuracy} suffix="%"/></strong><span>accuracy{r.personalBest?' · new best':''}</span></div>
      <div><strong><CountUp to={r.avgMs/1000} dec={1} suffix="s"/></strong><span>avg response</span></div><div><strong>{r.bestStreak}</strong><span>streak this session</span></div></div>
    <div className="acc-bar" aria-hidden="true"><span style={{transform:`scaleX(${r.accuracy/100})`}}/><i style={{left:`${PASS}%`}}/></div>
    {r.timeouts>0&&<p className="hint">{r.timeouts} answer{r.timeouts>1?'s':''} missed the time limit.</p>}
    <div className="lesson-actions"><button className="mini-btn" onClick={onBack}>Return to lesson</button><button className="mini-btn" onClick={onRetry}>Try again</button>
      {next?<button className="send-btn" onClick={onNext}><span>Continue</span></button>:<span className="hint">{lesson.id===6?'You can now send real messages.':`Reach ${PASS}% to unlock lesson ${lesson.id+1}.`}</span>}</div></div>;
}

function Lesson({lesson,progress,finish,goto}){
  const c=COPY[lesson.id-1],sig=useSignal(),[step,setStep]=useState(0),[run,setRun]=useState(0),[res,setRes]=useState(null);
  const rec=progress.lessons[lesson.id],next=isUnlocked(progress,lesson.id+1)&&lesson.id<6;
  const go=i=>{sig.stop();setStep(i);if(i===3)setRun(r=>r+1)};
  return <div className="lesson-column">
    <div className="panel lesson-card">
      <div className="lesson-head"><div><span className="kicker">LESSON {String(lesson.id).padStart(2,'0')}{rec?.completed?' · COMPLETED':''}</span><h2>{lesson.title}</h2></div>
        <span className="lesson-badge">{rec?`BEST ${rec.bestAccuracy}% · ${rec.attempts} RUN${rec.attempts>1?'S':''}`:'NEW'}</span></div>
      <ol className="stepper" aria-label="Lesson steps">{STEPS.map((n,i)=><li key={n}><button className={i===step?'cur':i<step?'done':''} aria-current={i===step?'step':undefined} disabled={i===4&&!res} onClick={()=>go(i)}>{i<step?'✓ ':`${i+1} `}{n}</button></li>)}</ol>
      <div className="feel-row"><Feel channel="lab"/></div>
      {step===0&&<><p className="lesson-intro">{c.text}</p><div className="lesson-actions"><span/><button className="send-btn" onClick={()=>go(1)}><span>See it</span></button></div></>}
      {step===1&&<><p className="lesson-intro">Watch each pattern play as a rhythm.</p><Cards items={c.teach} sig={sig}/>
        <div className="lesson-actions"><button className="mini-btn" onClick={()=>sig.seq(c.teach)}>▶ Play all</button><button className="send-btn" onClick={()=>go(2)}><span>Try it</span></button></div></>}
      {step===2&&<><p className="lesson-intro">Press any card to feel it again. Move on when each shape feels familiar.</p><Cards items={c.teach} sig={sig}/>
        <div className="lesson-actions"><span/><button className="send-btn" onClick={()=>go(3)}><span>Start challenge</span></button></div></>}
      {step===3&&<p className="lesson-intro">{lesson.rounds} rounds{lesson.timeLimitMs?`, ${lesson.timeLimitMs/1000}s per answer`:''}. Pass with {PASS}%.</p>}
    </div>
    {step===3&&<Challenge key={run} lesson={lesson} onDone={s=>{const r=finish(s);if(r){setRes(r);setStep(4);if(r.passed)cue('complete','lab')}}}/>}
    {step===4&&res&&<Results r={res} lesson={lesson} next={next} onRetry={()=>go(3)} onBack={()=>go(0)} onNext={()=>goto(lesson.id+1)}/>}
  </div>;
}

function Practice({onUse}){
  const [t,setT]=useState(''),sig=useSignal(),e=encode(t);
  return <section className="practice-panel panel" data-reveal><div className="practice-copy"><span className="kicker">PRACTICE LAB</span><h2>Go beyond the lessons.</h2><p>Type any letters, numbers or spaces. Play the pattern, then send it as a real message.</p></div>
    <div className="practice-tool"><label htmlFor="pl">TEXT → MORSE</label><input id="pl" value={t} maxLength={32} placeholder="Try: SOS" autoComplete="off" onChange={x=>{setT(normalizeInput(x.target.value));sig.stop()}}/>
      <div className="practice-output" aria-live="polite">{e.words.length?toMorseString(t):'—'}</div>
      <p className="hint">{e.unsupported.length?`Skipped (no Morse): ${e.unsupported.join(' ')}`:''}</p>
      <div className="lesson-actions"><button className="mini-btn" disabled={!e.words.length} onClick={()=>sig.play(e.message,undefined,8)}>▶ Play</button><button className="send-btn" disabled={!e.words.length} onClick={()=>onUse(e.message)}><span>Use this message</span></button></div></div></section>;
}

export default function LabPage({onUseMessage}){
  const [progress,setProgress]=useState(loadProgress),pr=useRef(progress),[id,setId]=useState(()=>{const p=loadProgress();return LESSONS.find(l=>isUnlocked(p,l.id)&&!p.lessons[l.id]?.completed)?.id??1}),[confirm,setConfirm]=useState(false);
  const lesson=LESSONS.find(l=>l.id===id),st=progress.stats;
  const done=Object.values(progress.lessons).filter(l=>l.completed).length;
  const finish=s=>{const r=finishSession(pr.current,s);if(!r.applied)return null;pr.current=r.progress;setProgress(r.progress);saveProgress(r.progress);return r.summary};
  const reset=()=>{if(!confirm){setConfirm(true);return}resetProgress();const d=defaultProgress();pr.current=d;setProgress(d);setId(1);setConfirm(false)};
  return <main className="shell main learn-main">
    <section className="learn-hero"><div className="eyebrow"><span>01</span> <Scramble text="MORSE LAB"/></div>
      <div className="learn-hero-grid"><div><h1><Split text="Learn the pattern."/><br/><em><Split text="Not the table." delay={.3}/></em></h1><p className="hero-copy">Morse gets easier when you recognise rhythm instead of memorising a chart. Start small, build confidence, then test how fast you can decode.</p></div>
        <div className="progress-card panel"><div className="progress-top"><span>YOUR PROGRESS</span><strong><CountUp to={Math.round(done/6*100)} suffix="%"/></strong></div><div className="progress-track"><span style={{width:`${done/6*100}%`}}/></div><div className="progress-meta"><span>{currentDayStreak(progress)} day streak</span><span>{done} of 6 complete</span></div></div></div></section>
    <section className="learn-layout">
      <Lesson key={id} lesson={lesson} progress={progress} finish={finish} goto={setId}/>
      <aside className="lab-sidebar">
        <div className="panel path-card" data-reveal><div className="panel-head compact"><div><span className="kicker">LEARNING PATH</span><h2>Six small steps</h2></div></div>
          <ol className="lesson-path">{LESSONS.map(l=>{const ok=isUnlocked(progress,l.id),r=progress.lessons[l.id];return <li key={l.id}>
            <button className={`path-item${l.id===id?' current':''}${r?.completed?' done':''}`} disabled={!ok} aria-current={l.id===id?'step':undefined} onClick={()=>setId(l.id)}>
              <span className="path-number">{r?.completed?'✓':ok?String(l.id).padStart(2,'0'):'🔒'.replace('🔒','–')}</span>
              <span><strong>{l.title}</strong><small>{r?.completed?`COMPLETED · BEST ${r.bestAccuracy}%`:ok?(r?`IN PROGRESS · BEST ${r.bestAccuracy}%`:'UNLOCKED'):`LOCKED · PASS LESSON ${l.id-1}`}</small></span></button></li>})}</ol></div>
        <div className="panel stats-card" data-reveal style={{'--d':'120ms'}}><span className="kicker">YOUR LAB</span><div className="stats-row"><div><strong><CountUp to={st.correct}/></strong><span>total correct</span></div><div><strong><CountUp to={st.bestStreak}/></strong><span>best streak</span></div><div><strong><CountUp to={st.sessions}/></strong><span>sessions</span></div></div>
          <button className="text-btn" onClick={reset} onBlur={()=>setConfirm(false)}>{confirm?'Press again to erase all progress':'Reset progress'}</button></div>
      </aside></section>
    <Practice onUse={onUseMessage}/>
    <footer className="footer"><span>HAPTIC LINK / MORSE LAB</span><span>LEARN · FEEL · COMMUNICATE</span></footer>
  </main>;
}
