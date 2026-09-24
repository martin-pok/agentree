# Vzorky živých stránek webových služeb

Sem patří anonymizované vzorky stránek ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity,
Grok, Qwen Chat a GitHub Copilot. Z vývojového stroje se na ty stránky nedostaneme a služby je
mění bez ohlášení – vzorky jsou jediný poctivý podklad, podle kterého se adaptéry
v `extension/sites.js` opravují a testují (`test/extension-overeni.test.mjs`).

## Jak vzorek vznikne

1. Na Macu se spárovaným rozšířením otevři službu a pošli zprávu. Počkej na odpověď.
2. Klikni na ikonu Agenteeq v liště Chromu → **Ověřit tuto stránku**.
3. Porovnej řádky s tím, co vidíš (počty zpráv, „Pracuje → hotovo zachyceno“), a klikni **Sedí**,
   nebo **Nesedí**.
4. **Uložit vzorek stránky** – soubor `agenteeq-vzorek-<služba>-<datum>.json` se uloží do
   Stažených souborů. Přejmenuj ho na `<služba>-<datum>.json` a přidej sem.

## Co vzorek obsahuje a co ne

- **Ano:** názvy prvků, role (`role`, `data-message-author-role`), `data-testid`, třídy, `id` bez
  čísel, příznak „tady byl text“, z popisku tlačítka jen slovo jako „Stop“ nebo „Send“, cesta
  adresy s ID nahrazenými `x-id`, a co adaptér na stránce našel (diagnostika).
- **Ne:** žádný text zpráv, názvy konverzací, jména, odkazy, obrázky, skripty, hodnoty polí,
  atributy s mezerou (mohou být název nebo jméno) ani dlouhá čísla.

## Co s ním udělá test

Vzorek s `"potvrzeni": "sedi"` je regresní test: adaptér ho musí číst stejně jako v den pořízení.
Vzorek s `"nesedi"` je známá chyba – test ji ukazuje jako „todo“, dokud se adaptér neopraví
a vzorek se nepotvrdí znovu. Teprve potvrzený vzorek dovolí změnit 🧪 na ✅ v `docs/CONNECTORS.md`.
