// Projekt účtů Agenteeq v Supabase (docs/ACCOUNTS.md). Jediný zdroj adresy a publikovatelného
// klíče pro aplikaci na Macu (src/config.js) i pro přehled na webu (public/js/ucet-web.js).
// Obojí je veřejné z principu: k datům pustí jen přihlášeného a jen k jeho řádkům – hlídá to RLS
// v databázi (supabase/migrations), ne utajení klíče. Tajný klíč (service_role) sem nepatří nikdy.
export const UCET_VYCHOZI = { url: 'https://quxfenxxdcafcuptucnn.supabase.co', klic: 'sb_publishable_V88rxI9Bl44zydHOX5IS9Q_-PalcKxi' };
