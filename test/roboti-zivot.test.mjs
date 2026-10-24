import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Roboti mají působit živě (rozhodnutí vlastníka 23. 10. 2026), ale nesmí zpomalit seznam se
// stovkou agentů ani ignorovat omezení pohybu.
const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('život robotů: klidový pohyb jen u robota v okně a nikdy přes gesto', async () => {
  const css = await zdroj('public/refinement.css');
  const zivot = css.slice(css.indexOf('/* Život robotů'));
  assert.ok(zivot.length > 500, 'chybí sekce Život robotů');
  for (const pravidlo of zivot.match(/^[^@\n/\s][^{\n]*\{[^}]*animation[^}]*infinite[^}]*\}/gm) || []) {
    assert.match(pravidlo, /\.robot\.is-zivy/, `nekonečná animace mimo okno: ${pravidlo.slice(0, 80)}`);
  }
  for (const stav of ['working', 'needs_input', 'failed', 'limited', 'waiting']) assert.match(zivot, new RegExp(`data-status='${stav}'`), stav);
  // Jen transform a opacity: žádné animace rozměrů, barev ani filtrů.
  for (const kf of zivot.match(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g) || []) assert.doesNotMatch(kf, /width|height|fill|filter|color/, kf.slice(0, 40));
  assert.match(css, /\.mascot-motion-off \.robot \* \{ animation: none !important/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.robot \* \{ animation: none !important/);
});

test('život robotů: viditelnost řídí IntersectionObserver, reakce na změnu stavu podle agenta', async () => {
  const js = await zdroj('public/js/mascot-motion.js');
  assert.match(js, /classList\.toggle\('is-zivy', z\.isIntersecting\)/);
  assert.match(js, /const REAKCE = \{ waiting: 'poskok', needs_input: 'mavnuti', failed: 'naklon' \}/);
  assert.match(js, /stav === 'waiting' && byl !== 'working'/, 'poskok jen za dokončenou práci');
});

test('život robotů: každý agent má vlastní fázi, roboti se nehýbou v zákrytu', async () => {
  const { agentRobot } = await import('../public/js/home-studio.js').catch(() => ({}));
  const js = await zdroj('public/js/home-studio.js');
  assert.match(js, /--robot-delay:\$\{faze\}s/);
  if (agentRobot) {
    const faze = new Set(['a', 'b', 'c', 'd', 'e'].map((id) => /--robot-delay:(-?[\d.]+)s/.exec(agentRobot({ id, status: 'working' }))?.[1]));
    assert.ok(faze.size >= 4);
  }
});

// Zaoblené těleso: obrys hlavy a trupu zvlášť od prvků na povrchu (čelo, jádro, záda), bez bočních stěn.
const svgMaBok = (svg) => ['robot-hlava-telo', 'robot-trup-telo', 'class="robot-celo"', 'robot-predek-trupu', 'robot-zada-hlavy', 'robot-zada-trupu', 'robot-ucho-pres'].every((c) => svg.includes(c)) && !svg.includes('robot-bok');

test('dílna: pracující robot je zády u stolu s nástrojem, obrobek roste podle skutečného začátku úkolu', async () => {
  const { robot, ROBOT_TYPES } = await import('../public/js/robot-svg.js');
  const { robotInWardrobe } = await import('../public/js/robot-wardrobe.js');
  for (const typ of ROBOT_TYPES) {
    const svg = robot(typ);
    for (const cast of ['robot-dilna', 'robot-zada', 'robot-prace', 'prace-kladivo', 'prace-pila', 'obrobek', 'jiskry', 'piliny']) assert.ok(svg.includes(cast), `${typ}: ${cast}`);
    assert.ok(svg.indexOf('robot-dilna') < svg.indexOf('<g class="robot-body">'), `${typ}: stůl je za tělem`);
    assert.ok(svg.indexOf('robot-prace') > svg.lastIndexOf('robot-head'), `${typ}: paže s nástrojem je nad tělem`);
  }
  // Šatník se kotví ke konci hlavy a těla; paže s nástrojem ho nesmí rozhodit.
  const oblek = robotInWardrobe('Bolt', { hat: Object.keys((await import('../public/js/robot-wardrobe.js')).WARDROBE.hat).find((k) => k !== 'none') });
  assert.ok(oblek.indexOf('robot-wear--hat') < oblek.indexOf('robot-prace'), 'čepice zůstala v hlavě');
  assert.ok(oblek.endsWith('</g></svg>'));
  const { postupPrace, dilnaAtributy } = await import('../public/js/home-studio.js');
  const ted = Date.now();
  assert.deepEqual([0, 0.5, 2, 5, 12, 40].map((m) => postupPrace(ted - m * 60000, ted)), [0, 0, 1, 2, 3, 4]);
  assert.equal(postupPrace(0, ted), 0, 'bez začátku úkolu se nic neodhaduje');
  assert.match(dilnaAtributy({ id: 'x', status: 'working', turnStartedAt: ted - 600000 }), /data-od="\d+" data-postup="3"/);
  assert.doesNotMatch(dilnaAtributy({ id: 'x', status: 'waiting', turnStartedAt: ted }), /data-od/, 'mimo práci se čas nevede');
  const css = await zdroj('public/refinement.css');
  assert.match(css, /:not\(\.home-robot\) \.robot :is\(\.robot-dilna, \.robot-zada, \.robot-prace\) \{ display: inline; \}/, 'hostitel u pozdravu zůstává čelem');
  // Otočka jako zaoblené těleso: obrys √(cos² + k²sin²), prvky na povrchu |cos θ| a posun (hloubka/2)·cos α·sin θ.
  assert.match(css, /@keyframes rz-otocka-hlava \{\n  0% \{ scale: 1\.000 1; \}[\s\S]*?50% \{ scale: 0\.620 1; \}/, 'v profilu má hlava šířku své hloubky');
  assert.match(css, /@keyframes rz-otocka-predek \{[\s\S]*?50% \{ scale: 0\.002 1; translate: calc\(var\(--fd\) \* 1\.000\) 0; \}/, 'v profilu je obličej na okraji');
  assert.ok(svgMaBok(robot('Scout')), 'hlava i trup mají bok');
  const js = await zdroj('public/js/mascot-motion.js');
  assert.match(js, /otoc\(svg, stav === 'working' \? 'zada' : 'predek'\)/);
});

test('sloučení živé oblasti nesmaže robotovi běhový stav (is-zivy, otočku, gesto)', async () => {
  const ui = await zdroj('public/js/ui.js');
  assert.match(ui, /const BEHOVE_ROBOTA = new Set\(\['data-gesto', 'data-otocka', 'data-emote', 'data-novy-kus', 'style'\]\)/);
  assert.match(ui, /robot && at\.name === 'class' && a\.classList\.contains\('is-zivy'\)/);
});

test('flákání a volání anténou: hračky u čekajících, signál u těch, kdo tě potřebují', async () => {
  const { robot, ROBOT_TYPES } = await import('../public/js/robot-svg.js');
  for (const typ of ROBOT_TYPES) {
    const svg = robot(typ);
    for (const cast of ['robot-hra', 'hra-micek', 'hra-jojo', 'hra-noty', 'hra-kava', 'hra-kniha', 'hra-bublina', 'hra-mobil', 'robot-signal', 'signal-vlna', 'signal-zare']) assert.ok(svg.includes(cast), `${typ}: ${cast}`);
  }
  const { dilnaAtributy } = await import('../public/js/home-studio.js');
  assert.match(dilnaAtributy({ id: 'a', status: 'waiting' }), /data-hra="(klid|micek|jojo|pisen|kava|kniha|bublina|mobil|protazeni)"/);
  // Ne všichni si hrají a ne všichni stejně: část čekajících je v klidu, hry se střídají.
  const hry = Array.from({ length: 200 }, (_, i) => dilnaAtributy({ id: `agent-${i}`, status: 'waiting' }).match(/data-hra="(\w+)"/)[1]);
  const pocty = hry.reduce((m, h) => ({ ...m, [h]: (m[h] || 0) + 1 }), {});
  assert.ok(pocty.klid > 50 && pocty.klid < 110, `klid ${pocty.klid}`);
  assert.equal(Object.keys(pocty).length, 9);
  assert.ok(Math.max(...Object.entries(pocty).filter(([h]) => h !== 'klid').map(([, n]) => n)) < 35);
  const { agentRobot } = await import('../public/js/home-studio.js');
  const klidny = Array.from({ length: 50 }, (_, i) => ({ id: `agent-${i}`, status: 'waiting' })).find((s) => dilnaAtributy(s).includes('data-hra="klid"'));
  assert.ok(!agentRobot(klidny).includes('robot-hra'), 'robot v klidu nemá hračky');
  const css = await zdroj('public/refinement.css');
  assert.match(css, /\[data-status='needs_input'\][^{]*\.robot \.robot-signal \{ display: inline; \}/);
  assert.match(css, /@keyframes rz-vlna \{ 0% \{ opacity: \.9; scale: \.7; \} 100% \{ opacity: 0; scale: 3\.4; \} \}/);
  const js = await zdroj('public/js/mascot-motion.js');
  assert.match(js, /id="rb-objem"/);
  assert.match(js, /id="rb-zare"/);
});

test('oblečení drží i v otočce a při práci: brýle na čele, čepice s hlavou, oblečení s trupem', async () => {
  const { robotInWardrobe } = await import('../public/js/robot-wardrobe.js');
  const svg = robotInWardrobe('Scout', { hat: 'cowboy', face: 'glasses3d', outfit: 'aloha' });
  const celo = svg.indexOf('class="robot-celo"');
  assert.ok(celo < svg.indexOf('robot-wear--face') && svg.indexOf('robot-wear--face') < svg.indexOf('robot-zada-hlavy'), 'brýle jedou s očima');
  assert.ok(svg.lastIndexOf('robot-head') < svg.indexOf('robot-wear--hat') && svg.indexOf('robot-wear--hat') < svg.indexOf('robot-prace'), 'klobouk zůstává v hlavě');
  const css = await zdroj('public/refinement.css');
  assert.match(css, /\.robot\[data-otocka\] :is\(\.robot-wear--hat, \.robot-wear--hood\) \{ animation: rz-otocka-hlava/);
  assert.match(css, /\.robot\[data-otocka\] :is\(\.robot-wear--mid, \.robot-wear--body\) \{ animation: rz-otocka-trup/);
  assert.match(css, /\.robot\[data-otocka='zada'\] :is\(\.robot-face, \.robot-gaze, \.robot-cheek, \.robot-core, \.robot-wear--face, \.wp, \.wpr\)/);
});

test('flákání až po oddechu: 15 s po dokončení úlohy je robot v klidu, pak teprve hraje', async () => {
  const { dilnaAtributy, ODDECH_MS } = await import('../public/js/home-studio.js');
  assert.equal(ODDECH_MS, 15000);
  const hrac = Array.from({ length: 60 }, (_, i) => `agent-${i}`).find((id) => !dilnaAtributy({ id, status: 'waiting' }).includes('data-hra="klid"'));
  const hra = dilnaAtributy({ id: hrac, status: 'waiting' }).match(/data-hra="(\w+)"/)[1];
  const prave = dilnaAtributy({ id: hrac, status: 'waiting', lastAt: Date.now() - 2000 });
  assert.match(prave, /data-hra="klid"/);
  assert.match(prave, new RegExp(`data-hra-pak="${hra}"`));
  assert.match(prave, /data-hra-od="\d+"/);
  assert.match(dilnaAtributy({ id: hrac, status: 'waiting', lastAt: Date.now() - 20000 }), new RegExp(`data-hra="${hra}"`));
  const js = await zdroj('public/js/mascot-motion.js');
  assert.match(js, /querySelectorAll\('\[data-hra-od\]'\)/);
  // Prvních 15 s hotový agent volá anténou a mává.
  const css = await zdroj('public/refinement.css');
  assert.match(css, /\[data-hra-od\] \.robot \.robot-signal \{ display: inline; \}/);
  const { agentRobot } = await import('../public/js/home-studio.js');
  assert.ok(agentRobot({ id: hrac, status: 'waiting', lastAt: Date.now() - 2000 }).includes('robot-signal'));
});

test('šatník zezadu: přední detaily a průhledy přileb se u robota otočeného zády neukazují', async () => {
  const { robotInWardrobe } = await import('../public/js/robot-wardrobe.js');
  const rytir = robotInWardrobe('Scout', { costume: 'knight' });
  assert.match(rytir, /class="rf-steel ro wpz"/, 'zezadu je přilba plná');
  assert.match(rytir, /class="rf-steel ro wpr" fill-rule="evenodd"/, 'průhled přilby je jen zepředu');
  assert.match(rytir, /<g class="wp">/, 'hledí a znak jsou jen zepředu');
  for (const kus of [{ outfit: 'tie' }, { outfit: 'bowtie' }, { costume: 'ninja' }, { costume: 'frog' }, { costume: 'dino' }]) {
    assert.match(robotInWardrobe('Scout', kus), /class="wp"|wpr/, JSON.stringify(kus));
  }
  const css = await zdroj('public/refinement.css');
  assert.match(css, /\.robot-wear--face, \.wp, \.wpr\) \{ display: none; \}/);
  assert.match(css, /\.robot \.wpz \{ display: inline; \}/, 'zezadu plná přilba bez obrysu otvoru');
});

// Vlastník 24. 10. 2026: „ujisti se, že se bug, kdy se agent otočí a oblečení ne, už neopakuje“.
// Každý kus šatníku na každém typu robota: průhled (evenodd) mimo obličejovou vrstvu se zezadu
// musí vyplnit (.wpr), jinak robot otočený zády ukazuje přední stranu přilby či kukly.
test('šatník zezadu: žádný kus na žádném robotovi nemá neoznačený průhled', async () => {
  const { WARDROBE, robotInWardrobe } = await import('../public/js/robot-wardrobe.js');
  const { ROBOT_TYPES } = await import('../public/js/robot-svg.js');
  const chyby = new Set();
  for (const slot of ['hat', 'outfit', 'costume']) for (const id of Object.keys(WARDROBE[slot])) for (const typ of ROBOT_TYPES) {
    const svg = robotInWardrobe(typ, { [slot]: id });
    const bezObliceje = svg.replace(/<g class="robot-wear robot-wear--face">[\s\S]*?<\/g><g class="robot-zada-hlavy"/, '');
    for (const m of bezObliceje.matchAll(/<path[^>]*fill-rule="evenodd"[^>]*>/g)) if (!/\bwpr\b/.test(m[0])) chyby.add(`${typ} ${slot}:${id}`);
  }
  assert.deepEqual([...chyby], []);
});
