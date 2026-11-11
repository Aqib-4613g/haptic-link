import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {MqttDevice} from '../src/lib/mqttDevice.js';
import {DeviceService,DemoDevice} from '../src/lib/deviceService.js';
const CFG={host:'x.s1.eu.hivemq.cloud',wsPort:8884,username:'u',password:'p',deviceCode:'hl-test'};
// Fake broker/device: behaves like HiveMQ + the ESP32 firmware.
function fake({status='online',ack='ok',sendAck=true}={}){
  const published=[];
  const c=Object.assign(new EventEmitter(),{connected:false,ended:false,
    subscribe(t,o,cb){setTimeout(()=>{cb(null);if(status)c.emit('message','hapticlink/hl-test/status',Buffer.from(status))},0)},
    publish(t,m,o,cb){published.push([t,m]);cb(null);if(sendAck)setTimeout(()=>c.emit('message','hapticlink/hl-test/ack',Buffer.from(ack)),5)},
    end(){c.ended=true;c.connected=false}});
  const lib={connect(){setTimeout(()=>{c.connected=true;c.emit('connect')},0);return c}};
  return{c,published,lib};
}
const mk=(f,x={})=>new MqttDevice({config:CFG,loadMqtt:async()=>f.lib,statusTimeout:80,ackTimeout:80,...x});
test('live: connect, send, ack -> delivered',async()=>{
  const f=fake(),d=mk(f),stages=[];await d.connect();
  const r=await d.send('HELLO',s=>stages.push(s));
  assert.deepEqual(stages,['encoding','sending','delivered']);assert.equal(r.ok,true);
  assert.deepEqual(f.published,[['hapticlink/hl-test/msg','HELLO']]);
});
test('live: device offline -> connect fails with a clear message',async()=>{
  const f=fake({status:'offline'}),d=mk(f);
  await assert.rejects(d.connect(),/not online/);assert.equal(f.c.ended,true);
});
test('live: no retained status at all -> times out',async()=>{
  const f=fake({status:null});await assert.rejects(mk(f).connect(),/not online/)});
test('live: busy ack and missing ack are errors',async()=>{
  let f=fake({ack:'busy'}),d=mk(f);await d.connect();await assert.rejects(d.send('A'),/busy/);
  f=fake({sendAck:false});d=mk(f);await d.connect();await assert.rejects(d.send('A'),/did not confirm/);
});
test('live: device going offline later triggers onLost',async()=>{
  const f=fake(),d=mk(f);let lost=0;await d.connect(()=>lost++);
  f.c.emit('message','hapticlink/hl-test/status',Buffer.from('offline'));assert.equal(lost,1);
  await assert.rejects(d.send('A'),/Not connected/);
});
test('live: unconfigured placeholders refuse to connect',async()=>{
  const d=new MqttDevice({config:{...CFG,host:'YOUR-CLUSTER-ID.s1.eu.hivemq.cloud'}});
  await assert.rejects(d.connect(),/not set up/);
});
test('live: works through DeviceService state machine',async()=>{
  const f=fake(),svc=new DeviceService({demo:new DemoDevice(),ble:mk(f)});
  assert.equal((await svc.connect()).ok,true);assert.equal(svc.getStatus().state,'online');
  assert.equal((await svc.sendMessage('SOS')).ok,true);
  const bad=new DeviceService({demo:new DemoDevice(),ble:mk(fake({status:'offline'}))});
  await bad.connect();assert.equal(bad.getStatus().state,'offline');assert.match(bad.getStatus().notice,/not online/);
});
