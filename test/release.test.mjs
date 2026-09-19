import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE_METADATA, RELEASE_MANIFEST_URL, RELEASE_API_URL } from '../src/release.js';

test('release metadata má stabilní veřejný kontrakt pro web a desktop', () => {
  assert.deepEqual(RELEASE_METADATA, {
    repository: 'martin-pok/agentree',
    apiUrl: RELEASE_API_URL,
    pageUrl: 'https://github.com/martin-pok/agentree/releases/latest',
    manifestUrl: RELEASE_MANIFEST_URL,
  });
  assert.match(RELEASE_API_URL, /^https:\/\/api\.github\.com\/repos\/martin-pok\/agentree\/releases\/latest$/);
  assert.match(RELEASE_MANIFEST_URL, /releases\/latest\/download\/agentree-release\.json$/);
});
