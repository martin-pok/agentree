import test from 'node:test';
import assert from 'node:assert/strict';
import { displayStatus } from '../public/js/format.js';
import { statusPill } from '../public/js/ui.js';
import { stavAgentu } from '../public/js/stav-vety.js';
import { agentRobot } from '../public/js/home-studio.js';

test('stará vzdálená relace není čekající agent ani potvrzený klid', () => {
 const s = { id:'claude-desktop-code:session_test',connector:'claude-desktop-code',status:'waiting',stale:true,done:false };
 assert.equal(displayStatus(s),'unknown');
 assert.match(statusPill(s),/data-status="unknown"/);
 assert.match(statusPill(s),/Stav neověřen/);
 assert.doesNotMatch(statusPill(s),/Čeká na zadání/);
 const state = stavAgentu({nejiste:1});
 assert.equal(state.stav,'nevim');
 assert.doesNotMatch(state.veta,/nikdo nepracuje|v pořádku/);
 assert.match(state.poznamka,/není potvrzení/);
 const robot=agentRobot(s);
 assert.match(robot,/data-state="unknown"/);
 assert.doesNotMatch(robot,/robot-hracka/);
});

test('čerstvé čekání a důležitá rozhodnutí si zachovají skutečný význam', () => {
 for (const status of ['working','waiting','needs_input','failed']) {
  assert.equal(displayStatus({connector:'claude-desktop-code',status,stale:false}),status);
 }
 assert.equal(displayStatus({connector:'claude-desktop-code',status:'needs_input',stale:true}),'needs_input');
 assert.equal(displayStatus({connector:'codex',status:'waiting',stale:true}),'waiting');
 assert.equal(stavAgentu({nejiste:1,selhalo:1}).stav,'problem');
});
