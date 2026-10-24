// Tečka stavu na ikoně rozšíření (vpravo nahoře, jako notifikace). Při procházení prohlížeče je
// z lišty vidět, jak na tom agenti jsou, aniž se okno otevře. Barvy jsou tytéž jako ve stavech
// v okně rozšíření a v aplikaci. Přednost má to, co tě potřebuje:
//   potřebuje tě (rose) > selhalo (červená) > limit (brass) > pracuje (teal) > nic neběží (bez tečky).
// Když Agenteeq neodpovídá nebo nezjistil, co běží, ukáže se šedá tečka – „nezjištěno“ se nikdy
// netváří jako „nic neběží“. Nespárované rozšíření tečku nemá. Popisek ikony říká stav větou.
(() => {
  const BARVY = { need: '#C8486A', fail: '#D2453F', limit: '#C08A2E', work: '#3E9A76', nevim: '#8E939C' };
  const { tr, mnozne } = globalThis.AgenteeqI18n;
  const tvar = (n, jedna, dve, pet) => mnozne(n, jedna, dve, pet).replace('{0}', n);

  // Z odpovědi /api/extension/prehled (null = nedostupné) udělá tón tečky a větu do popisku.
  function stavOdznaku(prehled, { sparovano = true } = {}) {
    if (!sparovano) return { ton: null, veta: '' };
    const z = prehled?.zdravi;
    if (!z) return { ton: 'nevim', veta: tr('Agenteeq neodpovídá – stav agentů nezjištěn') };
    if (z.cekaNaTebe) return { ton: 'need', veta: tvar(z.cekaNaTebe, 'Potřebuje tě {0} agent', 'Potřebují tě {0} agenti', 'Potřebuje tě {0} agentů') };
    if (z.selhalo) return { ton: 'fail', veta: tvar(z.selhalo, 'Selhal {0} agent', 'Selhali {0} agenti', 'Selhalo {0} agentů') };
    if (z.limit) return { ton: 'limit', veta: tvar(z.limit, 'Na limit narazil {0} agent', 'Na limit narazili {0} agenti', 'Na limit narazilo {0} agentů') };
    if (z.stav === 'nevim') return { ton: 'nevim', veta: tr('Nepodařilo se zjistit, co na počítači běží') };
    if (z.pracuje) return { ton: 'work', veta: tvar(z.pracuje, 'Pracuje {0} agent', 'Pracují {0} agenti', 'Pracuje {0} agentů') };
    return { ton: null, veta: tr('V pořádku, nikdo nepracuje') };
  }

  // Ikona s tečkou: základní ikona v dané velikosti, v pravém horním rohu průhledný prstenec
  // (odstup od ikony na světlé i tmavé liště) a v něm plná tečka v barvě stavu.
  const ikony = new Map();
  async function zakladIkony(velikost) {
    if (!ikony.has(velikost)) {
      ikony.set(velikost, fetch(chrome.runtime.getURL(`icons/icon-${velikost}.png`)).then((r) => r.blob()).then((b) => createImageBitmap(b)));
    }
    return ikony.get(velikost);
  }
  async function kresli(ton) {
    const out = {};
    for (const s of [16, 32]) {
      const platno = new OffscreenCanvas(s, s);
      const ctx = platno.getContext('2d');
      ctx.drawImage(await zakladIkony(s), 0, 0, s, s);
      if (ton) {
        // Tečka přesně v rohu a malá: obličej robota (oči) zůstane celý i v 16 px.
        const r = s * 0.16;
        const cx = s - r;
        const cy = r;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(cx, cy, r + s * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = BARVY[ton];
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
      out[s] = ctx.getImageData(0, 0, s, s);
    }
    return out;
  }

  let posledni = undefined;
  async function nastav(stav) {
    const titulek = stav.veta ? `Agenteeq · ${stav.veta}` : chrome.i18n.getMessage('titulek') || 'Agenteeq';
    chrome.action.setTitle({ title: titulek }).catch(() => {});
    if (stav.ton === posledni) return;
    posledni = stav.ton;
    if (!stav.ton) { await chrome.action.setIcon({ path: chrome.runtime.getManifest().action.default_icon }).catch(() => {}); return; }
    await chrome.action.setIcon({ imageData: await kresli(stav.ton) }).catch(() => {});
  }

  globalThis.AgenteeqOdznak = { stavOdznaku, nastav, BARVY };
})();
