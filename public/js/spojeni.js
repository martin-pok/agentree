// Spojení okna se serverem: živý proud (SSE) a celý snímek stavu po každém (znovu)připojení.
//
// Pravidla, která drží čerstvá data (testy: test/cerstva-data.test.mjs):
//   1. „Připojeno“ (live) až ve chvíli, kdy je načtený snímek vyžádaný po pozdravu proudu. Do té
//      doby okno ukazuje data z posledního spojení a říká to (reconnecting).
//   2. Každý snímek jde přes jednu frontu: události, které přijdou během jeho načítání, se po něm
//      přehrají – nic novějšího se nepřepíše starší odpovědí. Události z předchozího spojení se
//      po novém pozdravu zahodí, nový snímek je už obsahuje.
//   3. Mrtvé spojení se pozná podle ticha. Server posílá známku života po 15 s (src/http.js);
//      bez zprávy déle než TICHO_MS je spojení pryč, i když ho prohlížeč pořád drží otevřené.
//   4. Uspaný počítač se pozná podle mezery mezi kontrolami. Data z doby před spánkem se hned
//      označí jako neověřená (okamzite) a spojení se naváže znovu.
//   5. Proud, který prohlížeč zavřel natrvalo (HTTP chyba, proxy), se naváže znovu s rostoucí
//      pauzou. Zrušené spárování (401) pokusy ukončí a okno se vrátí k párování.

export const TICHO_MS = 45e3;
export const KONTROLA_MS = 5e3;
// Kontrola běží po 5 s; mezera přes 30 s znamená, že počítač (nebo celá karta) stál.
export const PROBUZENI_MS = 30e3;
export const SNIMEK_MAX_MS = 15e3;
export const PAUZY_MS = [2e3, 4e3, 8e3, 15e3, 30e3];
// První načtení bez proudu (zaseknuté spojení): 4 s, 6 s, 8 s… nejvýš po 15 s.
const PRVNI_PAUZY_MS = [4e3, 6e3, 8e3, 10e3, 12e3, 14e3, 15e3];
const OBNOVA_MIN_MS = 3e3;

const HODINY = {
  now: () => Date.now(),
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (t) => clearTimeout(t),
  setInterval: (f, ms) => setInterval(f, ms),
  clearInterval: (t) => clearInterval(t),
};

// `proud(h)` otevře živý proud (public/js/api.js#connectStream) a vrátí { close(), otevreno() }.
// `naStav(stav, { dataZ, okamzite, probuzeni })`: stav je 'live' nebo 'reconnecting'; `dataZ` je
// čas, do kdy okno data prokazatelně mělo aktuální; `okamzite` = data jsou neověřená už teď
// (probuzení, ticho), ne až po krátkém výpadku.
export function vytvorSpojeni({ proud, nactiSnimek, naSnimek, naUdalost, naStav, naOdparovani = () => {}, naChybuSnimku = () => {}, skryto = () => false, hlidat = true, hodiny = HODINY }) {
  let stav = 'connecting';
  let p = null;
  let generace = 0;
  let pozdraveno = false;
  let pozdravu = 0;
  let nacita = null;
  let jesteJednou = false;
  let prvni = true;
  const fronta = [];
  let posledniZprava = 0;
  let posledniTik = 0;
  let dataZ = 0;
  let pokus = 0;
  let pokusPrvni = 0;
  let opakovani = null;
  let casovacPrvni = null;
  let kontrola = null;
  let posledniObnova = -Infinity;
  let zavreno = false;

  function nastav(novy, info = {}) {
    if (novy === stav && !info.okamzite) return;
    stav = novy;
    naStav(novy, { ...info, dataZ });
  }

  function predej(name, data) {
    try { naUdalost(name, data); } catch (err) { console.error('Agenteeq: chybná událost', name, err); }
  }

  function zprava() {
    posledniZprava = hodiny.now();
    if (stav === 'live') dataZ = posledniZprava;
  }

  function otevri() {
    const moje = ++generace;
    pozdraveno = false;
    fronta.length = 0;
    posledniZprava = hodiny.now();
    p = proud({
      onHello: () => {
        if (moje !== generace || zavreno) return;
        pozdraveno = true;
        pozdravu++;
        fronta.length = 0;
        posledniZprava = hodiny.now();
        synchronizuj();
      },
      onPing: () => { if (moje === generace) zprava(); },
      onEvent: (name, data) => {
        if (moje !== generace) return;
        zprava();
        if (nacita || prvni) fronta.push([name, data]);
        else predej(name, data);
      },
      onError: (natrvalo) => {
        if (moje !== generace || zavreno) return;
        pozdraveno = false;
        nastav('reconnecting');
        if (natrvalo) naplanujObnovu();
      },
    });
  }

  function sLimitem(slib) {
    return new Promise((ok, ko) => {
      const t = hodiny.setTimeout(() => ko(Object.assign(new Error('Stav se nenačetl včas.'), { status: 0 })), SNIMEK_MAX_MS);
      Promise.resolve(slib).then((v) => { hodiny.clearTimeout(t); ok(v); }, (err) => { hodiny.clearTimeout(t); ko(err); });
    });
  }

  function synchronizuj() {
    if (zavreno) return Promise.resolve(false);
    if (nacita) {
      jesteJednou = true;
      return nacita;
    }
    const moje = generace;
    const mujPozdrav = pozdraveno ? pozdravu : 0;
    nacita = sLimitem(nactiSnimek())
      .then((snap) => {
        if (zavreno) return false;
        const znovu = !prvni;
        prvni = false;
        naSnimek(snap, { znovu });
        for (const [name, data] of fronta.splice(0)) predej(name, data);
        dataZ = hodiny.now();
        // Živý stav potvrzuje jen snímek vyžádaný po posledním pozdravu téhož proudu.
        if (mujPozdrav && mujPozdrav === pozdravu && moje === generace && pozdraveno) {
          pokus = 0;
          nastav('live');
        }
        return true;
      }, (err) => {
        if (zavreno) return false;
        if (err?.status === 401) {
          zavri();
          naOdparovani(err);
          return false;
        }
        if (mujPozdrav && moje === generace) {
          // Proud žije, ale stav se nenačetl: okno není v obraze. Zkusí se to znovu s pauzou.
          nastav('reconnecting');
          if (err?.status) naChybuSnimku(err);
          naplanujObnovu();
        }
        if (prvni) naplanujPrvni();
        return false;
      })
      .finally(() => {
        nacita = null;
        if (jesteJednou) {
          jesteJednou = false;
          synchronizuj();
        }
      });
    return nacita;
  }

  // Zahodí proud a otevře nový. Data do dalšího snímku nejsou ověřená.
  function restart(info = {}) {
    if (zavreno) return;
    hodiny.clearTimeout(opakovani);
    opakovani = null;
    try { p?.close(); } catch { /* už zavřený */ }
    p = null;
    nastav('reconnecting', info);
    otevri();
  }

  // Prohlížeč to sám znovu nezkusí. Nejdřív snímek – ten zároveň pozná zrušené spárování (401) a
  // obnoví data, i kdyby živý proud nešel navázat (proxy bez SSE) – potom nový proud.
  function naplanujObnovu() {
    if (opakovani || zavreno) return;
    const pauza = PAUZY_MS[Math.min(pokus, PAUZY_MS.length - 1)];
    pokus++;
    opakovani = hodiny.setTimeout(() => {
      opakovani = null;
      synchronizuj().then(() => { if (!zavreno) restart(); });
    }, pauza);
  }

  function naplanujPrvni() {
    if (casovacPrvni || zavreno || !prvni) return;
    const pauza = PRVNI_PAUZY_MS[Math.min(pokusPrvni, PRVNI_PAUZY_MS.length - 1)];
    pokusPrvni++;
    casovacPrvni = hodiny.setTimeout(() => {
      casovacPrvni = null;
      if (prvni) synchronizuj();
    }, pauza);
  }

  function zkontroluj() {
    const ted = hodiny.now();
    const mezera = ted - posledniTik;
    posledniTik = ted;
    if (zavreno || !p) return;
    // Skrytá karta má časovače zpomalené (i na minutu) – její mezera o spánku nic neříká. Po
    // návratu k ní se stav srovná přes obnov().
    if (mezera > PROBUZENI_MS && !skryto()) {
      pokus = 0;
      restart({ okamzite: true, probuzeni: true });
      return;
    }
    if (ted - posledniZprava > TICHO_MS) restart({ okamzite: true });
  }

  // Návrat k oknu, obnovená síť, stránka z paměti prohlížeče.
  function obnov() {
    const ted = hodiny.now();
    posledniTik = ted;
    if (zavreno || !p || ted - posledniObnova < OBNOVA_MIN_MS) return;
    posledniObnova = ted;
    const ticho = ted - posledniZprava > TICHO_MS;
    if (ticho || !p.otevreno()) {
      pokus = 0;
      restart({ okamzite: ticho });
      return;
    }
    synchronizuj();
  }

  function start() {
    posledniTik = hodiny.now();
    if (hlidat) kontrola = hodiny.setInterval(zkontroluj, KONTROLA_MS);
    // Nejdřív snímek, potom proud: nespárovaný telefon (401) tak proud vůbec neotvírá a zaseknutý
    // proud nezdrží první zobrazení dat.
    synchronizuj().then(() => { if (!zavreno && !p) otevri(); });
    return spojeni;
  }

  function zavri() {
    zavreno = true;
    hodiny.clearTimeout(opakovani);
    hodiny.clearTimeout(casovacPrvni);
    hodiny.clearInterval(kontrola);
    try { p?.close(); } catch { /* už zavřený */ }
  }

  const spojeni = { start, obnov, zavri, stav: () => stav, dataZ: () => dataZ };
  return spojeni;
}
