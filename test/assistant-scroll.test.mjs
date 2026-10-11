import test from 'node:test';
import assert from 'node:assert/strict';
import { renderChatAtPosition } from '../public/js/assistant-scroll.js';

function chat(top, height = 900) {
  return { scrollTop: top, scrollHeight: height, clientHeight: 300 };
}

test('pomocník zachová polohu při odpovědi a opakovaném vykreslení, když uživatel čte historii', () => {
  const log = chat(120);
  renderChatAtPosition(log, () => { log.scrollHeight += 160; log.scrollTop = 0; });
  assert.equal(log.scrollTop, 120);
  renderChatAtPosition(log, () => { log.scrollHeight += 80; log.scrollTop = 0; });
  assert.equal(log.scrollTop, 120);
});

test('pomocník sleduje konec jen při vlastní zprávě nebo když byl čtenář u dna', () => {
  const bottom = chat(600);
  renderChatAtPosition(bottom, () => { bottom.scrollHeight += 120; bottom.scrollTop = 0; });
  assert.equal(bottom.scrollTop, 1020);

  const nearBottom = chat(580);
  renderChatAtPosition(nearBottom, () => { nearBottom.scrollHeight += 100; nearBottom.scrollTop = 0; });
  assert.equal(nearBottom.scrollTop, 1000);

  const reading = chat(120);
  renderChatAtPosition(reading, () => { reading.scrollHeight += 100; reading.scrollTop = 0; }, { ownMessage: true });
  assert.equal(reading.scrollTop, 1000);
});
