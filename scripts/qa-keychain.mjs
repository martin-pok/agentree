import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const dir = await fs.mkdtemp('/private/tmp/agenteeq-keychain-qa-');
const helper = path.join(dir, 'keychain-qa');
execFileSync('xcrun', ['swiftc', '-D', 'AGENTEEQ_KEYCHAIN_QA', '-framework', 'Security', 'desktop/Keychain.swift', '-o', helper]);
execFileSync('codesign', ['--force', '--sign', '-', helper]);
const env = { ...process.env, AGENTEEQ_QA_NAMESPACE: crypto.randomUUID() };
const run = (action, id, input = '') => new Promise(resolve => {
  const p = spawn(helper, [action, id], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  let output = '';
  const timer = setTimeout(() => p.kill(), 30000);
  p.stdout.on('data', b => { output += b; });
  p.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
  p.stdin.on('error', () => {});
  p.stdin.end(input);
});
for (const id of ['openai-admin', 'anthropic-admin']) {
  const value = `${id === 'openai-admin' ? 'sk-' : 'sk-ant-'}${crypto.randomBytes(24).toString('hex')}`;
  try {
    assert.equal((await run('set', id, value)).code, 0);
    assert.equal((await run('get', id)).output, value);
    assert.equal((await run('set', id, value + 'updated')).code, 0);
    assert.equal((await run('get', id)).output, value + 'updated');
    assert.equal((await run('set', id, 'invalid')).code, 64);
  } finally { assert.equal((await run('remove', id)).code, 0); }
  assert.equal((await run('get', id)).code, 2);
}
console.log('PASS: native Keychain create/read/update/reject/delete; isolated QA services removed.');
