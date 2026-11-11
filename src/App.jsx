import {useState,useEffect,useRef,useMemo,useCallback,useLayoutEffect,useSyncExternalStore} from 'react';
import QRCode from 'qrcode';
import {createPortal} from 'react-dom';
import {Split,Scramble,HeroSignal} from './anim.jsx';
import {cue} from './lib/audio.js';
import {Feel} from './Feel.jsx';
import {encode,normalizeInput,toMorseString,MAX_LEN} from './lib/morse.js';
import {buildTimeline,DEVICE_PROFILE,unitMs,totalMs} from './lib/timing.js';
import {playTimeline} from './lib/signalPlayer.js';
import {loadHistory,saveHistory} from './lib/storage.js';
import {createDevice} from './lib/deviceService.js';
import {MqttDevice} from './lib/mqttDevice.js';

export const device=createDevice({live:new MqttDevice()});
const STAGE={encoding:'ENCODING',sending:'SENDING',delivered:'DELIVERED'};
const LABEL={idle:'Send to device',sending:'Sending…',sent:'Sent ✓',error:'Try again'};

function MorseView({enc}){
  if(!enc.words.length)return <div className="morse-preview"><span className="mchar">—</span></div>;
  return <div className="morse-preview" tabIndex={0} role="group" aria-label="Morse preview, scrollable">
    {enc.words.map((w,i)=><span className="mword" key={i}>{w.map((c,j)=><span className="mchar" key={j}>{c.code}</span>)}</span>)}</div>;
}

function PatternModal({text,onClose}){
  const enc=useMemo(()=>encode(text),[text]),tl=useMemo(()=>buildTimeline(enc.words),[enc]);
  const [active,setActive]=useState(-1),[playing,setPlaying]=useState(false);
  const player=useRef(),card=useRef(),closeBtn=useRef();
  const play=useCallback(()=>{player.current?.cancel();setPlaying(true);
    player.current=playTimeline(tl,{onEvent:e=>setActive(e.type==='on'?e.sym:-1),onDone:()=>{setActive(-1);setPlaying(false)},channel:'send'})},[tl]);
  const stop=()=>{player.current?.cancel();setActive(-1);setPlaying(false)};
  useEffect(()=>{
    const opener=document.activeElement,prev=document.body.style.overflow;
    document.body.style.overflow='hidden';closeBtn.current.focus();play();
    return()=>{player.current?.cancel();document.body.style.overflow=prev;opener?.focus?.()};
  },[]); // eslint-disable-line
  const onKey=e=>{
    if(e.key==='Escape'){e.stopPropagation();onClose();return}
    if(e.key!=='Tab')return;
    const f=[...card.current.querySelectorAll('button,[href],[tabindex]:not([tabindex="-1"])')];
    const first=f[0],last=f.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  };
  let n=0;
  return createPortal(<div className="modal" onKeyDown={onKey}>
    <div className="modal-backdrop" onClick={onClose}/>
    <section className="modal-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="pt">
      <button className="modal-close" ref={closeBtn} onClick={onClose} aria-label="Close preview">×</button>
      <div className="modal-head"><span className="kicker">HAPTIC PREVIEW</span><h2 id="pt" className="clamp-1">{enc.message}</h2></div>
      <div className="modal-scroll" tabIndex={0} aria-label="Pattern, scrollable">
        {enc.words.map((w,i)=><div className="pword" key={i}>{w.map((c,j)=><span className="pchar" key={j} aria-label={`${c.ch} ${c.code}`}>
          {[...c.code].map((s,k)=><i key={k} className={`pb ${s==='.'?'dot':'dash'}${n++===active?' on':''}`}/>)}</span>)}</div>)}
      </div>
      <div className="modal-feel"><Feel channel="send" onChange={play}/></div>
      <div className="modal-foot">
        <span className="meta">DEVICE TIMING · {DEVICE_PROFILE.wpm} WPM · {unitMs(DEVICE_PROFILE)} ms unit · {(totalMs(tl)/1000).toFixed(1)} s</span>
        <button className="mini-btn" onClick={playing?stop:play}>{playing?'Stop':'Replay'}</button>
      </div>
      <div className="pattern-legend modal-legend"><span><i className="dot-symbol"/> dot</span><span><i className="dash-symbol"/> dash</span><span><i className="pause-symbol"/> pause</span></div>
    </section></div>,document.body);
}

function DevicePanel({st}){
  const on=st.state==='online'||st.state==='demo',gap=st.state==='offline'||st.state==='disconnected';
  return <div className="panel device-panel">
    <div className="panel-head compact"><div><span className="kicker">DEVICE</span><h2>Haptic Link</h2></div>
      <span className={`state-pill ${st.state}`}><i className="sdot"/><Scramble text={st.label}/></span></div>
    <p role="status">{st.notice||st.message}</p>
    {on?<button className="outline-btn" onClick={()=>device.disconnect()}>{st.state==='demo'?'Exit demo mode':'Disconnect'}</button>
      :<button className="outline-btn" disabled={st.state==='connecting'} onClick={()=>device.connect()}>{st.state==='connecting'?'Connecting…':st.state==='disconnected'?'Reconnect':'Connect device'}</button>}
    {gap&&<div className="demo-row"><span>Need to test the interface?</span><button className="text-btn" onClick={()=>device.useDemo()}>Use demo mode</button></div>}
    <div className="feel-row"><span className="meta">FEEDBACK</span><Feel channel="send"/></div>
  </div>;
}

function QR(){
  const c=useRef(),[ok,setOk]=useState('');
  useEffect(()=>{QRCode.toCanvas(c.current,window.location.href,{width:116,margin:0,color:{dark:'#101316',light:'#f2f3ed'}}).catch(()=>{})},[]);
  const copy=async()=>{try{await navigator.clipboard.writeText(window.location.href);setOk('Copied ✓')}catch{setOk('Copy unavailable')}setTimeout(()=>setOk(''),1600)};
  return <div className="panel qr-panel"><div className="qr-copy"><span className="kicker">QUICK ACCESS</span><h2>Open on phone</h2><p>Scan this code to open Haptic Link on another device.</p></div>
    <div className="qr-wrap" data-tilt><canvas ref={c} aria-label="QR code for this page"/></div>
    <div className="qr-foot"><span>Share this interface</span><button className="text-btn" onClick={copy}>{ok||'Copy link ↗'}</button></div></div>;
}

export function SendPage({text,setText}){
  const st=useSyncExternalStore(device.subscribe,device.getStatus);
  const [modal,setModal]=useState(false),[send,setSend]=useState({s:'idle'}),[hist,setHist]=useState(loadHistory);
  const ta=useRef(),timer=useRef();
  const enc=useMemo(()=>encode(text),[text]);
  const canSend=!!enc.words.length&&st.canSend&&send.s==='idle';
  useLayoutEffect(()=>{const el=ta.current;el.style.height='auto';el.style.height=el.scrollHeight+'px'},[text]); // CSS max-height caps it, then it scrolls
  useEffect(()=>{if(new URLSearchParams(location.search).has('demoFail'))device.backends.demo.failNext=true},[]);
  const doSend=async()=>{
    if(!canSend)return;cue('send');clearTimeout(timer.current);setSend({s:'sending',stage:'encoding'});
    const r=await device.sendMessage(enc.message,stage=>setSend(x=>({...x,stage})));
    if(r.ok){const item={text:enc.message,morse:toMorseString(enc.message),time:Date.now(),demo:!!r.demo};
      setHist(h=>{const n=[item,...h].slice(0,8);saveHistory(n);return n});setText('');setSend({s:'sent',stage:'delivered'});cue('sent')}
    else{setSend({s:'error'});cue('error')}
    timer.current=setTimeout(()=>setSend({s:'idle'}),r.ok?1600:3000);
  };
  const onKey=e=>{if(e.key==='Enter'){e.preventDefault();if(e.metaKey||e.ctrlKey)doSend()}};
  const sending=send.s==='sending';
  return <>
    <main className="shell main">
      <section className="hero"><div className="eyebrow"><span>01</span> <Scramble text="SILENT COMMUNICATION"/></div>
        <h1><Split text="Send a message."/><br/><em><Split text="Let it be felt." delay={.35}/></em></h1>
        <p className="hero-copy">Write a message and send it to the Haptic Link wearable. Words are converted into tactile Morse patterns so information can be communicated without sound.</p><HeroSignal/></section>
      <section className="workspace" aria-label="Message workspace">
        <div className="composer panel">
          <div className="panel-head"><div><span className="kicker">MESSAGE</span><h2>Compose</h2></div><span className="counter" aria-live="off">{text.length} / {MAX_LEN}</span></div>
          <label className="sr-only" htmlFor="msg">Message</label>
          <textarea id="msg" ref={ta} value={text} maxLength={MAX_LEN} rows={1} placeholder="Type a short message…" onChange={e=>setText(normalizeInput(e.target.value))} onKeyDown={onKey}/>
          <p className="hint">{enc.unsupported.length?`Skipped (no Morse): ${enc.unsupported.join(' ')}`:''}</p>
          <div className="composer-foot">
            <div className="preview"><span className="preview-label">{sending?STAGE[send.stage]:'MORSE PREVIEW'}</span><MorseView enc={enc}/></div>
            <div className="composer-actions">
              <button className="mini-btn" disabled={!enc.words.length} onClick={()=>setModal(true)}>Preview pattern</button>
              <button data-magnet className={`send-btn ${send.s}`} disabled={!canSend&&send.s==='idle'} aria-busy={sending} onClick={doSend}><span>{LABEL[send.s]}</span></button>
            </div></div>
          <div className="send-progress" data-stage={send.s==='sending'||send.s==='sent'?send.stage:''} aria-hidden="true"><span/></div>
          <p className="sr-only" role="status">{sending?`${STAGE[send.stage]}`:send.s==='sent'?'Message sent':send.s==='error'?'Message failed to send':''}</p>
        </div>
        <aside className="side-column"><DevicePanel st={st}/><QR/></aside>
      </section>
      <section className="lower-grid">
        <div className="panel how-panel" data-reveal><div className="section-number">02</div><div><span className="kicker">HOW IT WORKS</span><h2>Words in. Vibrations out.</h2>
          <div className="steps"><div><b>01</b><span>Write a short message.</span></div><div><b>02</b><span>Connect the wearable when it is available.</span></div><div><b>03</b><span>Send. The ESP32 converts the message into tactile Morse patterns.</span></div></div></div></div>
        <div className="panel recent-panel" data-reveal style={{'--d':'120ms'}}><div className="panel-head compact"><div><span className="kicker">ACTIVITY</span><h2>Recent messages</h2></div>
          <button className="text-btn" onClick={()=>{setHist([]);saveHistory([])}}>Clear</button></div>
          <div className="history">{hist.length?hist.map((h,i)=><div className="history-row" key={h.time} style={{'--i':i}}><div className="history-message">{h.text}</div><div className="history-time">{h.demo?'DEMO · ':''}{new Date(h.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div><div className="history-morse">{h.morse}</div></div>):<div className="empty">No messages sent from this browser yet.</div>}</div></div>
      </section>
      <footer className="footer"><span>HAPTIC LINK / PROTOTYPE INTERFACE</span><span>ESP32 · DA7280 · LRA</span></footer>
    </main>
    {modal&&<PatternModal text={enc.message} onClose={()=>setModal(false)}/>}
  </>;
}
