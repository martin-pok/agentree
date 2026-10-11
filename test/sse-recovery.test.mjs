import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/js/api.js', import.meta.url), 'utf8');
const start = source.indexOf('const EVENTS =');
const code = source.slice(start).replace('export function connectStream(', 'function connectStream(');
const streams = [];
const timers = [];
class EventSourceFake {
 static CLOSED = 2;
 constructor() { this.readyState = 1; this.listeners = new Map(); streams.push(this); }
 addEventListener(name, listener) { this.listeners.set(name, listener); }
 emit(name, value) { this.listeners.get(name)?.({data:value}); }
 close() { this.readyState = 2; }
}
const ctx = vm.createContext({
 EventSource:EventSourceFake, ukazka:null, console,
 prelozData:v=>v,
 setTimeout:(cb, delay)=>{ const t={cb,delay}; timers.push(t);return t; },
 clearTimeout:t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);},
});
vm.runInContext(code, ctx);
const connectStream=vm.runInContext('connectStream',ctx);

test('SSE malformed hello never declares live and reconnects',()=>{
 const statuses=[],hellos=[];
 const client=connectStream({onStatus:s=>statuses.push(s),onHello:x=>hellos.push(x),onEvent:()=>{}});
 streams.at(-1).emit('hello','{oops');
 assert.deepEqual(statuses,['reconnecting']);
 assert.deepEqual(hellos,[]);
 assert.equal(streams.at(-1).readyState,2);
 assert.equal(timers.at(-1).delay,2000);
 timers.pop().cb();
 streams.at(-1).emit('hello','{"ready":true}');
 assert.deepEqual(hellos,[{ready:true}]);
 assert.equal(statuses.at(-1),'live');
 client.close();
});

test('SSE old and closed connections cannot inject events',()=>{
 const events=[];
 const client=connectStream({onStatus:()=>{},onHello:()=>{},onEvent:(k,x)=>events.push([k,x])});
 const previous=streams.at(-1);
 previous.emit('hello','{bad');
 timers.pop().cb();
 previous.emit('session','{"id":"old"}');
 streams.at(-1).emit('session','{"id":"new"}');
 assert.equal(events.length,1);
 assert.equal(events[0][1].id,'new');
 client.close();
 streams.at(-1).emit('session','{"id":"closed"}');
 assert.equal(events.length,1);
});
