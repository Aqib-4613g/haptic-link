import {LIVE} from '../config.js';
/** Live backend: browser <-> any MQTT broker, e.g. EMQX Cloud Serverless (MQTT over secure WebSocket) <-> ESP32.
 *  Topics (CODE = deviceCode):
 *    hapticlink/CODE/msg     browser -> device   plain text message
 *    hapticlink/CODE/status  device  -> browser  "online" / "offline" (retained, offline = MQTT last-will)
 *    hapticlink/CODE/ack     device  -> browser  "ok" | "busy" | "empty"
 *  Implements the same contract as DemoDevice: connect(onLost), disconnect(), send(msg,onStage). */
const fail=(userMessage)=>Object.assign(new Error(userMessage),{userMessage});
export const deviceCodeFromUrl=(search=globalThis.location?.search??'')=>{
  const c=new URLSearchParams(search).get('d');return c&&/^[A-Za-z0-9_-]{4,40}$/.test(c)?c:null};
export class MqttDevice{
  id='live';
  #client=null;#up=false;#ackWaiters=new Set();#statusWaiter=null;#lastStatus=null;#onLost=()=>{};
  constructor({config=LIVE,loadMqtt=()=>import('mqtt').then(m=>m.default??m),code=null,statusTimeout=6000,ackTimeout=7000}={}){
    this.cfg=config;this.loadMqtt=loadMqtt;this.code=code;this.statusTimeout=statusTimeout;this.ackTimeout=ackTimeout}
  get configured(){const c=this.cfg;return !!c.host&&!/YOUR-/i.test(c.host+c.username+c.password)}
  topic=s=>`hapticlink/${this.code}/${s}`;
  async connect(onLost=()=>{}){
    if(!this.configured)throw fail('Live connection is not set up yet. Fill in src/config.js, or use demo mode.');
    this.code=this.code||deviceCodeFromUrl()||this.cfg.deviceCode;
    if(!this.code)throw fail('No device code configured.');
    this.#onLost=onLost;
    let mqtt;try{mqtt=await this.loadMqtt()}catch{throw fail('Could not load the connection library.')}
    const c=mqtt.connect(`wss://${this.cfg.host}:${this.cfg.wsPort}/mqtt`,{username:this.cfg.username,password:this.cfg.password,
      clientId:'web-'+Math.random().toString(16).slice(2,10),clean:true,reconnectPeriod:0,connectTimeout:8000,keepalive:30});
    this.#client=c;c.on('error',()=>{}); // keep late socket errors from becoming uncaught exceptions
    try{
      await new Promise((res,rej)=>{c.once('connect',res);c.once('error',e=>rej(e));c.once('close',()=>rej(new Error('closed')))});
      c.on('message',(t,p)=>this.#onMessage(t,String(p)));
      c.on('close',()=>{if(this.#up)this.#lost()});
      await new Promise((res,rej)=>c.subscribe([this.topic('status'),this.topic('ack')],{qos:1},e=>e?rej(e):res()));
    }catch(e){this.#teardown();throw fail('Could not reach the message service. Check your internet and the settings in config.js.')}
    // The retained status message arrives right after subscribing.
    const online=this.#lastStatus!==null?this.#lastStatus==='online':await new Promise(res=>{const t=setTimeout(()=>{this.#statusWaiter=null;res(false)},this.statusTimeout);
      this.#statusWaiter=v=>{clearTimeout(t);this.#statusWaiter=null;res(v==='online')}});
    if(!online){this.#teardown();throw fail('The wearable is not online. Check it is powered, connected to Wi-Fi, and shows MQTT: OK.')}
    this.#up=true;
  }
  #onMessage(topic,payload){
    if(topic===this.topic('status')){
      this.#lastStatus=payload;
      if(this.#statusWaiter)this.#statusWaiter(payload);
      else if(this.#up&&payload!=='online')this.#lost();
    }else if(topic===this.topic('ack')){const w=[...this.#ackWaiters][0];if(w)w(payload)}
  }
  #lost(){this.#teardown();this.#onLost()}
  #teardown(){this.#up=false;this.#lastStatus=null;this.#ackWaiters.clear();const c=this.#client;this.#client=null;try{c?.end(true)}catch{}}
  async disconnect(){this.#teardown()}
  #waitAck(){return new Promise((res,rej)=>{
    const done=v=>{clearTimeout(t);this.#ackWaiters.delete(done);res(v)};
    const t=setTimeout(()=>{this.#ackWaiters.delete(done);rej(fail('The wearable did not confirm the message.'))},this.ackTimeout);
    this.#ackWaiters.add(done)})}
  async send(msg,onStage=()=>{}){
    const c=this.#client;onStage('encoding');
    if(!c||!c.connected||!this.#up)throw fail('Not connected to the wearable.');
    onStage('sending');
    const ack=this.#waitAck();ack.catch(()=>{});
    await new Promise((res,rej)=>c.publish(this.topic('msg'),msg,{qos:1},e=>e?rej(fail('Message could not be sent.')):res()));
    const a=await ack;
    if(a==='busy')throw fail('The wearable is busy (training mode or queue full). Try again.');
    if(a!=='ok')throw fail('The wearable could not use that message.');
    onStage('delivered');return{ok:true,live:true};
  }
}
