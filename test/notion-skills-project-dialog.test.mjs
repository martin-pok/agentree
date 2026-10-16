import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Notion: Skills search is left aligned without globally moving other search bars', async () => {
  const [skills, css] = await Promise.all([read('public/js/views/skills.js'), read('public/styles.css')]);
  assert.ok(skills.includes('class="toolbar sk-toolbar"'));
  assert.match(css, /\.sk-toolbar \.search-field \{[^}]*margin-left: 0;/);
  assert.match(css, /\.sk-toolbar \.sk-sort \{[^}]*margin-left: auto;/);
  assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*?\.sk-toolbar \.search-field \{ flex-basis: 100%;/);
});

test('Notion: project editor isolates scroll and keeps its action row visible', async () => {
  const [project, css] = await Promise.all([read('public/js/projects-ui.js'), read('public/styles.css')]);
  assert.ok(project.includes("size: 'project',"));
  assert.match(css, /\.modal--project \.modal-body \{[^}]*overflow-y: auto;/);
  assert.match(css, /\.modal--project \.modal-foot \{[^}]*border-top:/);
  assert.match(css, /\.modal--project \.media-picks \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 680px\)/);
  assert.ok(project.includes('data-media-crop'), 'image cropping remains functional');
  assert.ok(project.includes('data-media-file'), 'file upload remains available');
});
