import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const begin = source.indexOf('function validniCas(');
const end = source.indexOf('\nfunction logo(', begin);
assert.ok(begin >= 0 && end > begin, 'popup date formatting code exists');
const now = new Date('2026-10-11T12:00:00.000Z').getTime();
const ctx = vm.createContext({
 Date: class extends Date { static now() { return now; } },
 Number, String, Math, LOCALE: 'en-GB',
 tr: (format, value) => format.replace('{0}', value)
});
vm.runInContext(source.slice(begin,end),ctx);
const { ago, trvani, validniCas }=vm.runInContext('({ago,trvani,validniCas})',ctx);

test('extension timestamps reject unknown, invalid, seconds and future timestamps', () => {
 for (const x of [undefined,null,0,NaN,Infinity,'1760184000000',Math.floor(now/1000),now+61e3]) {
  assert.equal(validniCas(x),false,String(x));
  assert.equal(ago(x),'—');
  assert.equal(trvani(x),'—');
 }
});
test('extension timestamps show elapsed time from valid millisecond source', () => {
 assert.equal(validniCas(now-42e3),true);
 assert.equal(trvani(now-42e3),'0:42');
 assert.equal(trvani(now-65e3),'1:05');
 assert.equal(ago(now-120e3),'před 2 min');
 assert.equal(validniCas(now+30e3),true,'tolerate small clock drift');
});
test('extension timeline uses short, honest times and rejects unknown ones', () => {
 const { cas } = vm.runInContext('({cas})', ctx);
 assert.equal(cas(now - 20e3), 'teď');
 assert.equal(cas(now - 5 * 60e3), '5 min');
 assert.equal(cas(now - 59.6 * 60e3), '60 min');
 assert.equal(cas(undefined), '—');
 assert.equal(cas(Math.floor(now / 1000)), '—', 'seconds are not milliseconds');
 assert.match(cas(now - 3 * 86400e3), /^\d+[./]\d+/, 'older than yesterday shows a date');
});
