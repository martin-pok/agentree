# Web Agenteeq — performance, responsive, SEO audit (0.46.1)

**Datum:** 2026-10-11 · **Rozsah:** veřejný Vercel web, soubory `site/`, `scripts/build-site.mjs`, `scripts/qa-site.mjs`, `vercel.json`, sdílený scroll modul. Změny v PR #130, **neprodukční větev**. Žádný naměřený PageSpeed/Lighthouse 100/100 výsledek netvrdit bez skutečného reportu pro konkrétní veřejnou URL a commit.

## Audit před změnami

- Přibližně 132 kB nekomprimovaného `site/lp.css` a 14 kB landing-page JS. Důležitější než samotná surová velikost je komprimovaný přenos, kritická cesta vykreslení, práce main threadu a rychlost opakovaných návštěv. Přesné produkční přenosy a p75 Web Vitals ještě nejsou změřeny.
- Původní preload `urbanist-500.ttf` cílil na fallback písmo, ne na hlavní Satoshi. TTF bylo 41 116 B před kompresí a nepotřebně soupeřilo o síťovou prioritu s hero obrázkem. Primární obraz webu `prehled.webp` má 142 206 B, mobilní 96 288 B; nastaveny rozměry a high fetch priority u hero.
- Hero parallax vykonával scroll handler i mimo viewport a pointermove byl registrován globálně; sticky nav používala 24px backdrop blur i na dotykových zařízeních.
- `vercel.json` mělo `no-store` pro JS/CSS, což bránilo efektivní validaci nezměněných souborů. Nově `public, max-age=0, must-revalidate` (verze zůstávají revalidované, nikoliv slepě dlouhodobě cachované).
- `robots.txt` blokoval `/app`, takže crawler nemusel vidět `noindex`; statická kopie aplikace se nemá objevovat ve vyhledávání. Opraveno `meta robots` plus `X-Robots-Tag`, bez blokace crawleru této URL.
- Verze publikovaného webu z `main` a pracovní PR se liší. Vercel produkční nasazení nebylo během tohoto auditu změněno.

## Implementované úpravy

1. **Font / critical request path.** Odstraněn preload Urbanist TTF ze čtyř marketingových šablon; `build-site.mjs` přidává preload pouze pro ověřený `Satoshi-Variable.woff2`, pokud je v artefaktu. Stejný postup platí také pro obě stránky soukromí. Build bez Satoshi nemá 404 preload.
2. **Plynulost.** Hero parallax používá IntersectionObserver k zastavení práce mimo obrazovku a při skryté kartě; pointermove běží pouze nad hero. Malé webové trackpad delty zůstávají nativní bez dvojího JS dojezdu; chování desktopové aplikace není změněno. Na touch zařízení se vypíná nákladný sticky backdrop blur bez ztráty kontrastu.
3. **Cache.** Revalidace JS/CSS místo `no-store` brání nucenému přenosu identického obsahu a stále kontroluje dostupnost nové verze.
4. **Layout napříč zařízeními.** Safe-area gutters (včetně landscape iPhone), `min-width:0` u flexibilních grid/flex prvků, zalamování nadpisů a čitelný max-width 1280px u ultrawide. Nezavádí se nepodložený hardcoded breakpoint pro dosud nespecifikované zařízení; testují se skutečné CSS šířky kolem 620/760/900px i logické šířky foldable/dual-pane.
5. **Dotyková UX.** Navigační značka, jazykové přepínače a značka v patičce mají při `max-width:900px` minimálně 44px cílovou výšku/šířku.
6. **SEO.** `/app` má explicitní noindex; všech šest indexovatelných CZ/EN stránek má unikátní canonical a sitemap hreflang páry. Soukromí dostalo konzistentní OG metadata.

## Automatická kontrola / důkaz

- `test/site-performance-seo.test.mjs`: šest veřejných URL, font/fallback a CSS/JS + hero screenshot budget, canonical/hreflang/OG, priority obrázků, cache hlavičky.
- `test/site.test.mjs`: statická kopie `/app` má noindex, zdrojový desktop `public/index.html` není nijak změněn.
- `scripts/qa-site.mjs`: Chromium + WebKit, light/dark, reduced motion, interakce; nový fluid breakpoint sweep v CZ/EN na všech šesti URL přes 320, 344, 360, 390, 402, 430, 600, 620, 621, 700, 720, 760, 768, 820, 900, 901, 1024, 1280, 1536, 1920, 2560 a 3840 px; bez horizontálního přetékání, překročení obsahu a s minimálně 44px dotykovými cíli.
- `scripts/qa-site.mjs` také exportuje laboratorní `web-vitals-{engine}.json` pro 390/1440 px: LCP (pokud API podporuje), CLS (kde podporováno), dlouhé úlohy, načítání a počet/přenos resource entries. Automaticky blokuje CLS >0.1 v podporovaných prohlížečích.
- Testy musí **projít na HEAD** před merge. Zelený statický unit test není skutečný mobilní Safari výkonnostní profil a laboratorní localhost LCP není PSI score.

## Kritéria před veřejným tvrzením „PageSpeed 100“

1. Publikovat pouze přes review/green CI a ověřený Vercel preview/prod SHA. Měřit oficiální PageSpeed Insights **mobile i desktop** na všech šesti URL (min. 3 běhy na každé kombinaci) a zapisovat celé reporty/čas. **Cíl 100** není garance; skóre může kolísat s prostředím a aktualizací Lighthouse.
2. Core Web Vitals field (75. percentil skutečných návštěv): LCP <=2.5 s, INP <=200 ms, CLS <=0.1. U nového produktu, kde chybí CrUX provoz, sbírat jen transparentní, soukromí respektující RUM, nezaměňovat field a lab výsledky.
3. Scénáře: cold/warm návštěva, přepnutí CZ/EN, rotační změna šířky, narrow 320px, tablet 768px, landscape safe areas, foldable logické šířky, 1440/1920/3840px, Safari WebKit a Chromium, pomalejší CPU/síť, klávesnice a 200% zoom.
4. QA musí zkontrolovat screenshoty a konzoli bez JS chyb, žádné skryté nebo překrývající se CTA, čitelné focus stavy a bez layout shift. `qa:site` používá jen statické build soubory, nikoliv skutečně instalovanou desktop aplikaci.
5. Další otevřené zlepšení: CSS kaskáda `site/lp.css` přes 130 kB raw obsahuje mnoho pozdějších override deklarací; cíleně konsolidovat až s vizuální diff QA. Bezpečný brotli/network přenos a skutečný audit render-blocking requests zatím nejsou změřené.
