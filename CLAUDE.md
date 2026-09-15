# CLAUDE.md

Závazná pravidla projektu jsou v [AGENTS.md](AGENTS.md) — přečti je celé před první změnou.

Nejdůležitější:

- `npm test` a `npm run check` musí projít; UI změny ověř v prohlížeči (1440 px + 375 px, čistá konzole).
- Změna vzhledu = i `npm run qa:contrast` (WCAG 2.2 AA měřené na vykreslené ploše: aplikace, web, rozšíření).
- Web stavíš `npm run build:site`, rozšíření `npm run build:extension`, celé vydání `npm run release:mac`.
- Stav session se odvozuje jen v `src/model.js#deriveStatus`.
- Každý dynamický text v HTML přes `esc()`; žádné runtime závislosti; max. váha písma 500.
- V testech vždy `AGENTEEQ_SOURCE_HOME` do dočasné složky — nikdy nečti ani nezapisuj skutečné `~/.claude` nebo `~/.codex`.
- „Požadavek z tohoto Macu“ se nikdy neposuzuje jen podle adresy protistrany — reverzní proxy na témž Macu se hlásí z `127.0.0.1`. Používej `zTohotoMacu()` v `src/http.js`.
- Nevymýšlej data. Neověřené = „Beta“ a zápis do `docs/CONNECTORS.md`.
