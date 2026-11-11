import {useState,useEffect,useLayoutEffect,useRef,useSyncExternalStore} from 'react';
import {initFx} from './fx.js';
import {cue,unlockAudio} from './lib/audio.js';
import {initReveal,Scramble} from './anim.jsx';
import {SendPage,device} from './App.jsx';
import LabPage from './LabPage.jsx';
const read=()=>location.hash.startsWith('#/learn')?'learn':'send';
export default function Shell(){
  const [page,setPage]=useState(read),[text,setText]=useState(''),[dir,setDir]=useState('fwd');
  const nav=useRef(),pill=useRef();
  useEffect(()=>initFx(),[]);
  useEffect(()=>{addEventListener('pointerdown',unlockAudio,{passive:true});addEventListener('keydown',unlockAudio);return()=>{removeEventListener('pointerdown',unlockAudio);removeEventListener('keydown',unlockAudio)}},[]);
  const prevSt=useRef('offline');
  useEffect(()=>initReveal(),[page]);
  useLayoutEffect(()=>{const place=()=>{const a=nav.current?.querySelector('.active');if(!a||!pill.current)return;pill.current.style.width=a.offsetWidth+'px';pill.current.style.transform=`translateX(${a.offsetLeft}px)`};place();addEventListener('resize',place);document.fonts?.ready.then(place);return()=>removeEventListener('resize',place)},[page]);
  const st=useSyncExternalStore(device.subscribe,device.getStatus);
  useEffect(()=>{const f=()=>{setDir(read()==='learn'?'fwd':'back');setPage(read());window.scrollTo(0,0)};addEventListener('hashchange',f);return()=>removeEventListener('hashchange',f)},[]);
  useEffect(()=>{if((st.state==='online'||st.state==='demo')&&prevSt.current==='connecting')cue('connect');prevSt.current=st.state},[st.state]);
  useEffect(()=>{document.title=page==='learn'?'Haptic Link — Morse Lab':'Haptic Link — Send'},[page]);
  const cur=p=>page===p?{'aria-current':'page'}:{};
  return <>
    <header className="topbar shell"><a className="brand" href="#/"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>HAPTIC LINK</span></a>
      <nav className="nav" aria-label="Primary" ref={nav}><span className="nav-pill" ref={pill} aria-hidden="true"/><a className={`nav-link${page==='send'?' active':''}`} href="#/" {...cur('send')}>Send</a><a className={`nav-link${page==='learn'?' active':''}`} href="#/learn" {...cur('learn')}>Learn Morse</a></nav>
      <div className={`top-status${st.canSend?' connected':''}`}><span className="status-dot"/><span><Scramble text={st.label}/></span></div></header>
    <div className="scroll-line" aria-hidden="true"/>
    <div key={page} className={`page ${dir}`}>{page==='learn'?<LabPage onUseMessage={t=>{setText(t);location.hash='#/'}}/>:<SendPage text={text} setText={setText}/>}</div>
  </>;
}
