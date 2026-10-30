import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer, api, writeJsonl } from './helpers.mjs';

test('Codex task_complete with authoritative SDK error is not reported as successful waiting', async () => {
  const server = await startTestServer();
  const id = randomUUID(); const file = path.join(server.sourceHome,'.codex','sessions','2026','10','30',`rollout-${id}.jsonl`);
  const now = Date.now(); const row = (offset,payload) => ({timestamp:new Date(now+offset).toISOString(),type:'event_msg',payload});
  const rows = [{timestamp:new Date(now-5000).toISOString(),type:'session_meta',payload:{id,cwd:'/synthetic',originator:'codex_cli_rs'}},
    row(-4000,{type:'task_started'}),row(-3000,{type:'user_message',message:'Synthetic audit prompt'}),
    row(-2000,{type:'task_complete',last_agent_message:null,error:{message:'Your access token could not be refreshed. Please sign in again.'}})];
  const state = async () => (await api(server.url).get('/api/state')).body.sessions.find(s=>s.id===`codex:${id}`);
  try {
    await writeJsonl(file,rows); await server.app.connectors.codex.scan();
    let s=await state(); assert.equal(s.status,'failed'); assert.match(s.reason,/access token/);
    await writeJsonl(file,[row(-1000,{type:'task_started'})],{append:true});await server.app.connectors.codex.scan();
    s=await state();assert.equal(s.status,'working');assert.equal(s.failure,null);
    await writeJsonl(file,[row(-500,{type:'task_complete',error:null,last_agent_message:'Synthetic done'})],{append:true});await server.app.connectors.codex.scan();
    s=await state();assert.equal(s.status,'waiting');assert.equal(s.failure,null);
  } finally {await server.close();}
});

test('Codex terminal quota signal is limited rather than failed or completed',async()=>{
  const server=await startTestServer();const id=randomUUID();const file=path.join(server.sourceHome,'.codex','sessions','2026','10','30',`rollout-${id}.jsonl`);const now=Date.now();
  try{
    await writeJsonl(file,[{timestamp:new Date(now-3000).toISOString(),type:'session_meta',payload:{id,cwd:'/synthetic',originator:'codex_cli_rs'}},
      {timestamp:new Date(now-2000).toISOString(),type:'event_msg',payload:{type:'task_started'}},
      {timestamp:new Date(now-1000).toISOString(),type:'event_msg',payload:{type:'task_complete',error:{message:'Synthetic usage limit reached',codex_error_info:'UsageLimitExceeded'}}}]);
    await server.app.connectors.codex.scan();const s=(await api(server.url).get('/api/state')).body.sessions.find(s=>s.id===`codex:${id}`);assert.equal(s.status,'limited');assert.equal(s.failure,null);
  }finally{await server.close();}
});
