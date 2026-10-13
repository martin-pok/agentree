# Agenteeq — právní základ (DRAFT / LEGAL REVIEW REQUIRED)

**Stav: 13. října 2026 · Interní šablony v veřejném repozitáři · NEPLATÍ jako zveřejněné podmínky.**

> Tyto dokumenty jsou pracovní právní návrhy. Nejsou advokátním stanoviskem, nepředstavují registraci ochranné známky, certifikát GDPR/WCAG ani automaticky uzavřenou smlouvu s uživatelem. **Před vystavením na web, registrací nebo komerční distribucí musí vlastník doplnit skutečné údaje, ověřit technické výroky a provést právní revizi.**

## Obsah
- [TERMS.cs.md](TERMS.cs.md) — české podmínky používání aplikace a rozšíření, beta, placení, odpovědnost, spotřebitelská práva.
- [TERMS.en.md](TERMS.en.md) — anglický návrh pro mezinárodní uživatele; sladit s finální českou verzí.
- [PRIVACY.cs.md](PRIVACY.cs.md) — kompletní český návrh informační povinnosti podle GDPR (vyžaduje doplnění správce, příjemců a uchování).
- [PRIVACY.en.md](PRIVACY.en.md) — anglický návrh GDPR notice pro mezinárodní web.
- [PRIVACY-REVIEW.cs.md](PRIVACY-REVIEW.cs.md) — GDPR návrh právních titulů, kategorie údajů, příjemci, retenční lhůty, práva a kritické mezery.
- [BRAND-POLICY.cs.md](BRAND-POLICY.cs.md) — veřejná pravidla názvu/loga; nenahrazuje přihlášku OZ.
- [BRAND-POLICY.en.md](BRAND-POLICY.en.md) — EN brand usage pro média, partnery a uživatele.
- [IP-REGISTER.md](IP-REGISTER.md) — evidence původu loga, kódu, výstupů subdodavatelů, open-source licencí a rešerše OZ.
- [FREE-ASSURANCE.md](FREE-ASSURANCE.md) — skutečně bezplatné bezpečnostní reporty/badge a pravidla poctivých tvrzení.
- [LAUNCH-LEGAL-GATE.md](LAUNCH-LEGAL-GATE.md) — kritický checklist před veřejným komerčním spuštěním.

## Kritické blokery (nelze odložit do placené verze)
1. Identita provozovatele/správce [DOPLNIT: právní jméno/obchodní firma, IČO pokud relevantní, adresa, kontaktní e-mail pro privacy i reklamace], datum účinnosti a kdo skutečně smluvně poskytuje software.
2. Aktuální veřejné `site/soukromi/index.html` a `site/en/privacy/index.html` jen odkazují žádosti GDPR na **veřejné GitHub Issues** — to není vhodná cesta pro citlivé žádosti; vytvořit soukromý kontaktní kanál. Chybí úplná mapa titulů, retenčních dob a možných transferů podle GDPR čl. 13.
3. Veřejná privacy stránka říká, že desktop sám od sebe volá jen ČNB, ale `src/updates.js` ověřuje i veřejná vydání na GitHubu. Před úpravou zásad ověřit všechny síťové cesty; tvrzení „nikdy nic nikomu“ přesně omezit na **obsah přepisů/kódu bez zapnuté synchronizace**, ne na všechny HTTP requesty.
4. Zkontrolovat smluvní postavení a DPA/SCC u Supabase, Vercel a případně Google, retenční lhůty hostingu, podpory a bezpečnostních incidentů.
5. Podpis/notarizace Mac, placené digitální plnění, reklamační proces a informace o právech spotřebitele se nemohou odstranit větou „bez záruky“.
6. Zajistit důkazy o právu používat logo, software, obrázky a fonty; veřejné GitHub repo je nyní **bez deklarované hlavní licence**. Nevydávat žádné third-party soubory za vlastní autorské dílo.

## Kde soubory skladovat
V tomto veřejném repu jsou **pouze obecné návrhy bez neveřejných údajů**. Konkrétní smlouvy, osobní adresy mimo zákonné zveřejnění, interní právní argumentace, identity, doklady, faktury, doklady o převodu IP, smluvní kontakty a důvěrná data do veřejného Git commitu NEPATŘÍ. Uchovávat v samostatném soukromém repu či šifrovaném úložišti s omezením přístupu. Přepnutí tohoto repo na Private je slučitelné s prací přes GitHub connector **při zachovaném oprávnění**; změní však veřejné odkazy, dokumentaci i použitelnost některých bezplatných badge.

**Nasazení:** tyto návrhy nepublikovat na marketingovém webu, nevydávat za účinné podmínky a nepřipojovat certifikační loga bez dokončení [LAUNCH-LEGAL-GATE.md](LAUNCH-LEGAL-GATE.md).
