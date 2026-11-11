import {useSyncExternalStore} from 'react';
import {settings,canVibrate,unlockAudio} from './lib/audio.js';
export function Feel({channel,onChange}){
  const s=useSyncExternalStore(settings.subscribe,settings.get),k=channel+'Sound';
  const tog=key=>{settings.set(key,!settings.get()[key]);unlockAudio();onChange?.()};
  return <div className="feel" role="group" aria-label="Signal feedback">
    <button className="chip" aria-pressed={s[k]} onClick={()=>tog(k)}>Sound: {s[k]?'On':'Off'}</button>
    {canVibrate()&&<button className="chip" aria-pressed={s.vibrate} onClick={()=>tog('vibrate')}>Vibration: {s.vibrate?'On':'Off'}</button>}</div>;
}
