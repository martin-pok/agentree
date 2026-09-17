// Isolated product walkthrough. Never reads the user's agent transcripts or settings.
import { startTestServer, api } from '../test/helpers.mjs';
import { addTokens, pushEntry, touch } from '../src/model.js';
const demo = await startTestServer();
const client = api(demo.url);
await client.send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true, lastSeenVersion: '0.12.0' });
const now = Date.now();
const sessions = [
  { connector: 'claude-code', localId: 'showcase-navigation', provider: 'anthropic', app: 'Claude Code', title: 'UKÁZKA · navigace klientského portálu', running: true },
  { connector: 'codex', localId: 'showcase-api', provider: 'openai', app: 'Codex', title: 'UKÁZKA · migrace API', pending: { at: now, kind: 'permission', text: 'Povolit zápis nové konfigurace?' } },
  { connector: 'cursor', localId: 'showcase-form', provider: 'cursor', app: 'Cursor', title: 'UKÁZKA · testy formuláře', running: true },
];
const ids = [];
for (const [i, fixture] of sessions.entries()) {
  const s = demo.app.store.ensure(fixture);
  Object.assign(s, fixture, { startedAt: now - (i + 1) * 900000, lastAt: now, runningAt: now, activity: 'Smyšlená ukázka pro prohlídku produktu', hookAt: now, turns: 3 + i });
  for (let hour = 0; hour < 5; hour++) { const at = now - hour * 3600000; touch(s, at); addTokens(s, at, { input: 17000 * (5 - hour), output: 3200 * (i + 1) }); }
  pushEntry(s, { at: now - 90000, role: 'user', text: 'Toto jsou smyšlená data pro prohlídku. Připrav návrh a vysvětli další postup.' });
  pushEntry(s, { at: now - 60000, role: 'assistant', text: 'Ukázková odpověď: rozdělím práci na strukturu, přístupnost a testování. Žádný skutečný agent se z této prohlídky nespouští.' });
  demo.app.store.commit(s);
  ids.push(s.id);
}
const project = await client.send('POST', '/api/projects', { name: 'UKÁZKA · Studio Atlas', description: 'Smyšlený projekt pro prohlídku Agenteeq.' });
if (project.status === 201) {
  const projectId = project.body.project?.id || project.body.id;
  if (projectId) await client.send('POST', '/api/projects/assign', { sessionIds: ids, projectId });
}
demo.app.store.setLimit({ id: 'showcase-five', label: 'UKÁZKA · limit 5 h', app: 'Claude Code', provider: 'anthropic', usedPercent: 62, at: now, resetsAt: now + 7200000 });
console.log(`\nProhlídka aplikace: ${demo.url}/#/prehled\nSmyšlená data, dočasné složky, žádné spouštění skutečných agentů.\nUkončení: Ctrl+C.\n`);
let closing = false;
const stop = async () => { if (closing) return; closing = true; await demo.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
