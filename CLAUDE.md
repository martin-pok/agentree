# CLAUDE.md

Závazná pravidla projektu jsou v [AGENTS.md](AGENTS.md) — přečti je celé před první změnou.

Nejdůležitější:

- `npm test` a `npm run check` musí projít; UI změny ověř v prohlížeči (1440 px + 375 px, čistá konzole).
- Stav session se odvozuje jen v `src/model.js#deriveStatus`.
- Každý dynamický text v HTML přes `esc()`; žádné runtime závislosti; max. váha písma 500.
- V testech vždy `DIRIGENT_SOURCE_HOME` do dočasné složky — nikdy nečti ani nezapisuj skutečné `~/.claude` nebo `~/.codex`.
- Nevymýšlej data. Neověřené = „Beta“ a zápis do `docs/CONNECTORS.md`.
