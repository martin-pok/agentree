// Šablony projektu: kostra podkladů (briefu) a výchozí štítek pro nejčastější druhy práce.
// Šablona jen předvyplní – všechno jde v projektu dál upravit. Podklady se k zadání agenta
// připojují, takže pole jsou formulovaná tak, aby z nich agent pochopil kontext.
import { tr } from './i18n.js';

export const SABLONY_PROJEKTU = () => [
  { id: 'prazdny', label: tr('Prázdný'), tags: [], brief: '' },
  {
    id: 'agentura',
    label: tr('Agentura a klient'),
    tags: [tr('klient')],
    brief: tr('Klient:\nKontaktní osoba:\nCíl zakázky:\nCílová skupina:\nTermíny a milníky:\nRozpočet:\nTón a značka:\nSchválené podklady:\nRozhodnutí:'),
  },
  {
    id: 'vyvoj',
    label: tr('Vývoj'),
    tags: [tr('vývoj')],
    brief: tr('Cíl:\nRepozitář a větev:\nArchitektura a omezení:\nDefinice hotového:\nTesty a ověření:\nOtevřené otázky:\nRozhodnutí:'),
  },
  {
    id: 'marketing',
    label: tr('Marketing'),
    tags: [tr('marketing')],
    brief: tr('Kampaň:\nCíl a měřítko úspěchu:\nCílová skupina:\nKanály:\nKlíčové sdělení:\nTón a značka:\nTermíny:\nPodklady:'),
  },
];

/** Štítky z textu „klient, web, Q4“ – oddělené čárkou, bez prázdných. */
export const stitkyZTextu = (text) => String(text || '').split(',').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
