import {normalizeMessage} from './morse.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export const COPY={
  offline:{label:'OFFLINE',message:'Connect the wearable when you are ready to send a real message.'},
  connecting:{label:'CONNECTING',message:'Looking for your Haptic Link…'},
  online:{label:'ONLINE',message:'The wearable is ready. Messages will be felt as Morse.'},
  disconnected:{label:'DISCONNECTED',message:'The connection was lost. Reconnect to keep sending.'},
  demo:{label:'DEMO MODE',message:'Simulated device. Nothing is sent to hardware.'},
};
const NEXT={offline:{connect:'connecting'},connecting:{ok:'online',demoOk:'demo',fail:'offline'},online:{disconnect:'offline',lost:'disconnected'},disconnected:{connect:'connecting',disconnect:'offline'},demo:{disconnect:'offline'}};
export class DemoDevice{
  id='demo';failNext=false;
  constructor({delay=wait}={}){this.delay=delay}
  async connect(){await this.delay(700)}
  async disconnect(){}
  async send(msg,onStage=()=>{}){onStage('encoding');await this.delay(350);if(this.failNext){this.failNext=false;throw new Error('Simulated transmission failure')}onStage('sending');await this.delay(900);onStage('delivered');return{ok:true,demo:true}}
}
/** UI talks only to this. Backends: {demo, ble?}. `ble` is the live backend slot (now filled by MqttDevice over the internet). */
export class DeviceService{
  state='offline';notice='';busy=false;active=null;#subs=new Set();#snap;
  constructor(backends){this.backends=backends;this.#snap=this.#build()}
  #build(){return{state:this.state,...COPY[this.state],notice:this.notice,backend:this.active?.id??null,busy:this.busy,canSend:(this.state==='online'||this.state==='demo')&&!this.busy}}
  #emit(){this.#snap=this.#build();this.#subs.forEach(f=>f())}
  #go(ev){const n=NEXT[this.state][ev];if(!n)return false;this.state=n;this.notice='';this.#emit();return true}
  getStatus=()=>this.#snap;
  subscribe=f=>{this.#subs.add(f);return()=>this.#subs.delete(f)};
  connect=async()=>{
    const b=this.backends.ble;
    if(!b){this.notice='Hardware pairing is not available yet. Use demo mode to try the interface.';this.#emit();return{ok:false,reason:'unavailable'}}
    if(!this.#go('connect'))return{ok:false,reason:'invalid'};
    try{await b.connect(()=>{this.active=null;this.#go('lost')});this.active=b;this.#go('ok');return{ok:true}}
    catch(e){this.#go('fail');this.notice=e?.userMessage||'Could not connect to the wearable.';this.#emit();return{ok:false,reason:'failed'}}
  };
  useDemo=async()=>{
    if(!this.#go('connect'))return{ok:false,reason:'invalid'};
    await this.backends.demo.connect();this.active=this.backends.demo;this.#go('demoOk');return{ok:true};
  };
  disconnect=async()=>{const a=this.active;if(!this.#go('disconnect'))return false;this.active=null;this.#emit();try{await a?.disconnect()}catch{}return true};
  /** Never throws. Resolves {ok,demo?,error?}. Message is normalized here; newline framing belongs to the backend. */
  sendMessage=async(text,onStage=()=>{})=>{
    const msg=normalizeMessage(text);
    if(!msg)return{ok:false,error:'empty'};
    if(!this.#snap.canSend)return{ok:false,error:'not-ready'};
    this.busy=true;this.#emit();
    try{return await this.active.send(msg,onStage)}
    catch(e){return{ok:false,error:e.message||'failed'}}
    finally{this.busy=false;this.#emit()}
  };
}
export const createDevice=(opts={})=>new DeviceService({demo:new DemoDevice(opts),ble:opts.live});
