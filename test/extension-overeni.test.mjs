import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { prvek, dokument, zeVzorku } from './mini-dom.mjs';

// Ověření webových konektorů. Na živé stránky služeb se z vývojového stroje nedostaneme, takže
// je ověřuje uživatel oknem rozšíření: adaptér řekne, co na stránce našel, a uloží anonymizovaný
// vzorek stránky. Tady se hlídá, že diagnostika nelže, že vzorek neodnese nic z obsahu a že
// vzorky z živých stránek (test/fixtures/web/) adaptéry pořád čtou stejně jako v den pořízení.

const okno = { sessionStorage: { getItem: () => null, setItem: () => {} } };
const kontext = vm.createContext({ window: okno, sessionStorage: okno.sessionStorage });
vm.runInContext(await fs.readFile(new URL('../extension/sites.js', import.meta.url), 'utf8'), kontext);
const { SITES, detect, diagnose, vzorek, radkyOvereni } = kontext.window.AgenteeqSites;
const sluzba = (id) => SITES.find((s) => s.id === id);
// Objekty ze sandboxu vm mají jiný prototyp; porovnává se jejich obsah.
const obsah = (x) => JSON.parse(JSON.stringify(x));
const loc = (url) => new URL(url);

// Syntetická stránka ve tvaru ChatGPT: dvě kola konverzace, generuje se, pole zprávy.
function stranaChatGPT({ generuje = false } = {}) {
  return dokument(prvek('body', {}, [
    prvek('main', {}, [
      prvek('div', { 'data-message-author-role': 'user' }, [prvek('div', { class: 'whitespace-pre-wrap' }, ['Tajná zpráva uživatele Jana Nováka'])]),
      prvek('div', { 'data-message-author-role': 'assistant' }, [prvek('div', { class: 'markdown prose' }, ['Odpověď s heslem Kočka123'])]),
      prvek('div', { 'data-message-author-role': 'user' }, [prvek('p', {}, ['Druhá otázka'])]),
      prvek('div', { 'data-message-author-role': 'assistant' }, [prvek('p', {}, ['Druhá odpověď'])]),
    ]),
    prvek('form', {}, [
      prvek('div', { id: 'prompt-textarea', contenteditable: 'true', class: 'ProseMirror' }),
      generuje ? prvek('button', { 'data-testid': 'stop-button', 'aria-label': 'Stop streaming' }) : prvek('button', { 'data-testid': 'send-button', 'aria-label': 'Send prompt' }),
    ]),
    prvek('nav', {}, [prvek('a', { href: '/c/68d3f0a1-1b2c-8000-9e7f-0a1b2c3d4e5f', title: 'Projekt Tajný' }, ['Projekt Tajný – plán fúze'])]),
  ]));
}

test('mini-DOM čte selektory adaptérů stejně jako prohlížeč', () => {
  const doc = dokument(prvek('body', {}, [
    prvek('rich-textarea', {}, [prvek('div', { class: 'ql-editor textarea', contenteditable: 'true' })]),
    prvek('textarea', { readonly: true }),
    prvek('textarea', { name: 'q' }),
    prvek('button', { 'aria-label': 'Cancel generating' }),
    prvek('div', { 'data-testid': 'chat-input' }, [prvek('p', { contenteditable: 'true' })]),
  ]));
  assert.equal(doc.querySelectorAll('rich-textarea .ql-editor[contenteditable="true"]').length, 1);
  assert.equal(doc.querySelectorAll('textarea:not([readonly]):not([disabled])').length, 1);
  assert.equal(doc.querySelectorAll('button[aria-label*="cancel GENERATING" i]').length, 1);
  assert.equal(doc.querySelectorAll('button[aria-label*="cancel GENERATING"]').length, 0, 'bez „i“ záleží na velikosti písmen');
  assert.equal(doc.querySelectorAll('[data-testid="chat-input"] [contenteditable="true"]').length, 1);
  assert.equal(doc.querySelectorAll('body > textarea').length, 2);
  assert.equal(doc.querySelectorAll('#nic, textarea[name="q"]').length, 1);
  assert.throws(() => doc.querySelectorAll('div:first-child'), /nepodporovaný/, 'neznámý selektor nesmí tiše nic nenajít');
});

test('diagnostika ChatGPT: přesné pole, přesné zprávy, konverzace z adresy, generování', () => {
  const d = diagnose(sluzba('chatgpt'), stranaChatGPT({ generuje: true }), loc('https://chatgpt.com/c/68d3f0a1-1b2c-8000-9e7f-0a1b2c3d4e5f'));
  assert.deepEqual(obsah(d), {
    site: 'chatgpt', konverzace: 'adresa', pole: 'presne',
    zpravy: { user: 2, assistant: 2, zdroj: 'presne' }, generuje: true, limit: false,
  });
  const nova = diagnose(sluzba('chatgpt'), stranaChatGPT(), loc('https://chatgpt.com/'));
  assert.equal(nova.konverzace, 'karta', 'nová konverzace ještě nemá adresu – to není chyba adaptéru');
  assert.equal(nova.generuje, false);
});

test('diagnostika přizná obecnou zálohu i to, že pole chybí', () => {
  const obecne = dokument(prvek('body', {}, [
    prvek('div', { class: 'message user-message' }, ['Ahoj']),
    prvek('div', { class: 'message bot-message' }, ['Ahoj, jak pomůžu?']),
    prvek('div', { contenteditable: 'true' }),
  ]));
  const grok = diagnose(sluzba('grok'), obecne, loc('https://grok.com/c/abc-123'));
  assert.equal(grok.zpravy.zdroj, 'obecne', 'služba bez vlastního čtení zpráv jede přes zálohu a musí to říct');
  assert.deepEqual([grok.zpravy.user, grok.zpravy.assistant], [1, 1]);
  assert.equal(grok.pole, 'obecne', 'Grok nemá přesný selektor pole');
  const gemini = diagnose(sluzba('gemini'), obecne, loc('https://gemini.google.com/app'));
  assert.equal(gemini.pole, 'obecne', 'přesný selektor Gemini nesedí, našla ho záloha');
  const prazdna = diagnose(sluzba('gemini'), dokument(prvek('body')), loc('https://gemini.google.com/app'));
  assert.equal(prazdna.pole, 'zadne');
  assert.deepEqual([prazdna.zpravy.user, prazdna.zpravy.assistant], [0, 0]);
});

test('řádky ověření: stav vždy nese věta, ne jen barva tečky', () => {
  const zaklad = { konverzace: 'adresa', pole: 'presne', zpravy: { user: 2, assistant: 2, zdroj: 'presne' }, generuje: false, limit: false, videl: { generovani: true, konec: true } };
  assert.deepEqual(obsah(radkyOvereni(zaklad)), [
    ['ok', 'Konverzace podle adresy stránky'],
    ['ok', 'Pole pro zadání nalezeno'],
    ['ok', 'Tvoje zprávy 2 · odpovědi 2'],
    ['ok', 'Pracuje → hotovo zachyceno'],
  ]);
  const spatne = radkyOvereni({ ...zaklad, konverzace: 'karta', pole: 'zadne', zpravy: { user: 1, assistant: 0, zdroj: 'obecne' }, generuje: true, limit: true, videl: { generovani: true, konec: false } });
  assert.deepEqual(obsah(spatne.map(([ton]) => ton)), ['none', 'err', 'warn', 'none', 'warn']);
  assert.match(spatne[2][1], /obecná záloha/);
  assert.match(spatne[3][1], /Právě pracuje/);
  assert.match(spatne[4][1], /limit/);
  for (const [, text] of [...radkyOvereni(zaklad), ...spatne]) assert.ok(text.length > 10);
  assert.match(radkyOvereni({ ...zaklad, zpravy: { user: 0, assistant: 0, zdroj: 'presne' }, videl: {} })[2][1], /Zatím žádné zprávy/);
});

test('vzorek stránky neodnese text, odkazy, názvy ani ID – jen stavbu', () => {
  const v = vzorek(stranaChatGPT({ generuje: true }), loc('https://chatgpt.com/c/68d3f0a1-1b2c-8000-9e7f-0a1b2c3d4e5f'));
  const json = JSON.stringify(v);
  for (const zakazane of ['Tajn', 'Jana', 'Nov', 'heslem', 'Kočka', 'fúze', 'href', 'title', '68d3f0a1', 'Druhá']) {
    assert.ok(!json.includes(zakazane), `vzorek obsahuje „${zakazane}“`);
  }
  assert.equal(v.format, 'agenteeq-vzorek');
  assert.equal(v.site, 'chatgpt');
  assert.deepEqual(obsah(v.adresa), { host: 'chatgpt.com', cesta: '/c/x-id' });
  assert.ok(json.includes('"data-message-author-role":"user"'), 'role zprávy zůstane – podle ní adaptér čte');
  assert.ok(json.includes('"aria-label":"Stop"'), 'z popisku tlačítka zůstane jen slovo, podle kterého se pozná Stop');
  assert.ok(json.includes('"x":1'), 'místo textu zůstane jen příznak');
});

test('vzorek: popisky, atributy s mezerou a cesta s dotazem se zahodí', () => {
  const doc = dokument(prvek('body', {}, [
    prvek('button', { 'aria-label': 'Smazat konverzaci Tajný projekt' }),
    prvek('div', { 'data-testid': 'history item Tajný projekt', 'data-author': 'Jan Novák', id: 'msg-12345678', class: "message x-9999999999 bg-[url('https://cdn.example.com/jan.png')]" }),
    prvek('img', { src: 'https://example.com/avatar-jan.png', alt: 'Jan' }),
    prvek('script', {}, ['window.__DATA__ = {"email":"jan@example.com"}']),
    prvek('textarea', { name: 'q', value: 'rozepsaná zpráva' }),
  ]));
  const v = vzorek(doc, loc('https://www.perplexity.ai/search/jak-uvarit-testoviny-AbC123xyz'));
  const json = JSON.stringify(v);
  for (const zakazane of ['Smazat', 'Tajn', 'Jan', 'avatar', 'example', 'email', 'rozepsan', '12345678', '9999999999']) {
    assert.ok(!json.includes(zakazane), `vzorek obsahuje „${zakazane}“`);
  }
  assert.deepEqual(obsah(v.adresa), { host: 'www.perplexity.ai', cesta: '/search/x-id' });
  assert.equal(sluzba('perplexity').conversationId({ pathname: v.adresa.cesta }), 'x-id', 'zástupce v cestě adaptér pořád přečte jako ID konverzace');
  const div = v.strom.c.find((u) => u.t === 'div');
  assert.equal(div.a['data-testid'], '', 'atribut zůstane (podle existence se hledá), hodnota s mezerou ne');
  assert.equal(div.a.class, 'message', 'třídy zůstanou, jen bez dlouhých čísel');
  assert.equal(v.strom.c.some((u) => u.t === 'img' || u.t === 'script'), false);
});

test('vzorek: z hlášky o limitu jen klíčové slovo, skryté pole zůstane skryté', () => {
  const pole = prvek('div', { contenteditable: 'true' });
  pole.skryty = true; // skrývá ho CSS, ne atribut – vzorek to musí zachytit sám
  const doc = dokument(prvek('body', {}, [
    prvek('div', { 'data-message-author-role': 'user' }, ['Jak obejít rate limit na mém serveru heslo123?']),
    prvek('div', { role: 'alert', class: 'banner' }, ['You have reached your message limit until 18:00']),
    pole,
  ]));
  const adresa = loc('https://chatgpt.com/c/abc-def');
  const v = vzorek(doc, adresa);
  const json = JSON.stringify(v);
  assert.ok(!/rate|serveru|heslo|until|18:00|message limit/.test(json), 'z textu nesmí zůstat nic kromě klíčového slova hlášky');
  assert.equal(v.strom.c[1].l, 'reached');
  assert.equal(v.strom.c[0].l, undefined, 'zpráva uživatele se slovem „limit“ hláškou není');
  assert.equal(v.strom.c[2].h, 1);
  const prehrane = diagnose(sluzba('chatgpt'), zeVzorku(v.strom), adresa);
  assert.equal(prehrane.limit, true);
  assert.equal(prehrane.pole, 'zadne', 'skryté pole se nepoužije ani v přehraném vzorku');
  assert.deepEqual(obsah(prehrane), obsah(diagnose(sluzba('chatgpt'), doc, adresa)));
});

test('vzorek se u obří stránky zkrátí a řekne to', () => {
  const deti = Array.from({ length: 50 }, () => prvek('div', {}, [prvek('span', {}, ['x'])]));
  const v = vzorek(dokument(prvek('body', {}, deti)), loc('https://grok.com/'), { limit: 20 });
  assert.equal(v.zkraceno, true);
  assert.ok(v.prvku <= 21);
});

test('vzorek přehraný v testu dá stejnou diagnostiku jako živá stránka', () => {
  for (const generuje of [false, true]) {
    const adresa = loc('https://chatgpt.com/c/68d3f0a1-1b2c-8000-9e7f-0a1b2c3d4e5f');
    const zive = diagnose(sluzba('chatgpt'), stranaChatGPT({ generuje }), adresa);
    const v = vzorek(stranaChatGPT({ generuje }), adresa);
    const prehrane = diagnose(detect({ hostname: v.adresa.host, pathname: v.adresa.cesta }), zeVzorku(v.strom), { hostname: v.adresa.host, pathname: v.adresa.cesta });
    assert.deepEqual(obsah(prehrane), obsah(zive));
  }
});

// Vzorky z živých stránek. Každý nese, co adaptér našel v den pořízení (`diagnostika`) a jestli
// to uživatel potvrdil (`potvrzeni`). Potvrzený vzorek je regresní test: adaptér ho musí číst
// pořád stejně. Nepotvrzený (`nesedi`) je známá chyba – test ji hlásí jako „todo“, dokud se
// adaptér neopraví a vzorek nepotvrdí znovu.
const slozka = new URL('./fixtures/web/', import.meta.url);
const vzorky = (await fs.readdir(slozka).catch(() => [])).filter((f) => f.endsWith('.json')).sort();

test('složka vzorků z živých stránek má návod a vzorky mají správný tvar', async () => {
  assert.match(await fs.readFile(new URL('README.md', slozka), 'utf8'), /Uložit vzorek stránky/);
  for (const f of vzorky) {
    const v = JSON.parse(await fs.readFile(new URL(f, slozka), 'utf8'));
    assert.equal(v.format, 'agenteeq-vzorek', f);
    assert.ok(sluzba(v.site), `${f}: neznámá služba ${v.site}`);
    assert.ok(v.diagnostika && v.strom, `${f}: chybí diagnostika nebo strom`);
  }
});

for (const f of vzorky) {
  const v = JSON.parse(await fs.readFile(new URL(f, slozka), 'utf8'));
  const opts = v.potvrzeni === 'sedi' ? {} : { todo: v.potvrzeni === 'nesedi' ? 'uživatel hlásí, že počty na živé stránce nesedí' : 'vzorek zatím nikdo nepotvrdil' };
  test(`živá stránka ${f}: adaptér čte vzorek stejně jako v den pořízení`, opts, () => {
    const adresa = { hostname: v.adresa.host, pathname: v.adresa.cesta };
    const adapter = detect(adresa);
    assert.equal(adapter?.id, v.site);
    const d = diagnose(adapter, zeVzorku(v.strom), adresa);
    const cekano = v.diagnostika;
    assert.deepEqual(
      obsah({ konverzace: d.konverzace, pole: d.pole, zpravy: d.zpravy, generuje: d.generuje, limit: d.limit }),
      { konverzace: cekano.konverzace, pole: cekano.pole, zpravy: cekano.zpravy, generuje: cekano.generuje, limit: cekano.limit },
    );
  });
}
