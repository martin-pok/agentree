import { state, emit } from './state.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { tr } from './i18n.js';

// Profilové obrázky: roboti Agenteeq ze stejného tvarosloví jako logo (public/brand/) – hlava,
// anténa a oči. Liší se barvou, tvarem očí a anténou. Počet zůstává stejný jako u původních
// abstraktních obrázků, takže uložená volba (settings.avatar = index) ukazuje dál na obrázek.
const svg = (bg, body) => `<svg viewBox="0 0 80 80" role="img" aria-hidden="true" focusable="false"><rect width="80" height="80" fill="${bg}"/>${body}</svg>`;

// Oči: [tvar, barva] → SVG. Středy očí leží na x 31 a 49, y 48.
const OCI = {
  kapsle: (c) => `<rect x="27.5" y="42" width="7" height="13" rx="3.5" fill="${c}"/><rect x="45.5" y="42" width="7" height="13" rx="3.5" fill="${c}"/>`,
  kulate: (c) => `<circle cx="31" cy="48" r="5" fill="${c}"/><circle cx="49" cy="48" r="5" fill="${c}"/>`,
  stastne: (c) => `<path d="M26 50a5 5 0 0 1 10 0M44 50a5 5 0 0 1 10 0" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
  mrk: (c) => `<rect x="27.5" y="42" width="7" height="13" rx="3.5" fill="${c}"/><path d="M45 49h9" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
  vizor: (c) => `<rect x="24" y="43" width="32" height="10" rx="5" fill="${c}"/>`,
  jedno: (c) => `<circle cx="40" cy="48" r="7" fill="${c}"/><circle cx="42" cy="46" r="2.2" fill="#FFFFFF" opacity=".85"/>`,
  ospale: (c) => `<path d="M26 48h10M44 48h10" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
  hvezdy: (c) => `<path d="M31 42l1.8 4.2 4.2 1.8-4.2 1.8L31 54l-1.8-4.2-4.2-1.8 4.2-1.8zM49 42l1.8 4.2 4.2 1.8-4.2 1.8L49 54l-1.8-4.2-4.2-1.8 4.2-1.8z" fill="${c}"/>`,
};
// Anténa nad hlavou (hlava začíná na y 29).
const ANTENY = {
  kulicka: (c) => `<path d="M40 14v15" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/><circle cx="40" cy="13" r="4" fill="${c}"/>`,
  dvojita: (c) => `<path d="M32 29l-5-12M48 29l5-12" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/><circle cx="26.5" cy="15.5" r="3.5" fill="${c}"/><circle cx="53.5" cy="15.5" r="3.5" fill="${c}"/>`,
  blesk: (c) => `<path d="M42 10l-6 10h6l-4 9" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  usi: (c) => `<rect x="11" y="40" width="7" height="16" rx="3.5" fill="${c}"/><rect x="62" y="40" width="7" height="16" rx="3.5" fill="${c}"/><path d="M40 18v11" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
  srdce: (c) => `<path d="M40 29v-8" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/><path d="M40 21c-4-5-10-1-6 4l6 5 6-5c4-5-2-9-6-4z" fill="${c}" transform="translate(0 -8)"/>`,
};
// Hlava: zaoblený obdélník jako v logu, případně širší nebo kulatější.
const HLAVY = {
  logo: (c) => `<rect x="17" y="29" width="46" height="38" rx="14" fill="${c}"/>`,
  siroka: (c) => `<rect x="13" y="31" width="54" height="34" rx="13" fill="${c}"/>`,
  kulata: (c) => `<rect x="18" y="27" width="44" height="42" rx="21" fill="${c}"/>`,
};

const robot = (pozadi, hlava, tvar, oci, ocBarva, antena, antBarva) =>
  svg(pozadi, ANTENY[antena](antBarva) + HLAVY[tvar](hlava) + OCI[oci](ocBarva));

// Paleta značky: fialová, inkoust, papír, šalvěj, okr, růže a jejich světlé odstíny.
const AVATARS = [
  robot('#5254D8', '#FAFAFA', 'logo', 'kapsle', '#17171D', 'kulicka', '#FAFAFA'),
  robot('#2C2C3A', '#FAFAFA', 'logo', 'kapsle', '#17171D', 'kulicka', '#8E90FF'),
  robot('#EEEEFC', '#17171D', 'logo', 'kapsle', '#C8F0E6', 'kulicka', '#5254D8'),
  robot('#C8F0E6', '#2B6B53', 'kulata', 'stastne', '#C8F0E6', 'dvojita', '#2B6B53'),
  robot('#F5EDDD', '#C99A3E', 'siroka', 'vizor', '#17171D', 'usi', '#83591A'),
  robot('#FBEAF0', '#B0284F', 'logo', 'kulate', '#FBEAF0', 'srdce', '#B0284F'),
  robot('#8E90FF', '#17171D', 'kulata', 'jedno', '#8E90FF', 'kulicka', '#17171D'),
  robot('#2B6B53', '#C8F0E6', 'logo', 'mrk', '#17171D', 'blesk', '#F5D78E'),
  robot('#2C2C3A', '#5254D8', 'siroka', 'vizor', '#C8F0E6', 'dvojita', '#8E90FF'),
  robot('#E4E4F0', '#17171D', 'kulata', 'stastne', '#FAFAFA', 'kulicka', '#B0284F'),
  robot('#C99A3E', '#17171D', 'logo', 'hvezdy', '#F5D78E', 'blesk', '#17171D'),
  robot('#DDE8F5', '#5254D8', 'logo', 'ospale', '#EEEEFC', 'usi', '#17171D'),
  robot('#B0284F', '#FBEAF0', 'kulata', 'kapsle', '#B0284F', 'kulicka', '#FBEAF0'),
  robot('#EEEEFC', '#8E90FF', 'siroka', 'stastne', '#17171D', 'srdce', '#5254D8'),
  robot('#2C2C3A', '#C8F0E6', 'logo', 'jedno', '#17171D', 'kulicka', '#43D1B1'),
  robot('#F5EDDD', '#17171D', 'kulata', 'mrk', '#F5D78E', 'dvojita', '#C99A3E'),
  robot('#5254D8', '#17171D', 'siroka', 'kulate', '#C8F0E6', 'usi', '#EEEEFC'),
  robot('#C8F0E6', '#17171D', 'logo', 'hvezdy', '#43D1B1', 'kulicka', '#2B6B53'),
  robot('#FBEAF0', '#17171D', 'logo', 'stastne', '#FFB3C7', 'dvojita', '#B0284F'),
  robot('#2F2F3A', '#8E90FF', 'kulata', 'vizor', '#17171D', 'blesk', '#F5D78E'),
  robot('#E4E4F0', '#5254D8', 'logo', 'kapsle', '#FAFAFA', 'srdce', '#B0284F'),
  robot('#8E90FF', '#FAFAFA', 'siroka', 'ospale', '#5254D8', 'kulicka', '#FAFAFA'),
  robot('#2B6B53', '#17171D', 'logo', 'kulate', '#C8F0E6', 'usi', '#C8F0E6'),
  robot('#DDE8F5', '#17171D', 'kulata', 'kapsle', '#DDE8F5', 'dvojita', '#5254D8'),
  robot('#C99A3E', '#F5EDDD', 'logo', 'stastne', '#83591A', 'kulicka', '#F5EDDD'),
  robot('#2C2C3A', '#FFB3C7', 'kulata', 'mrk', '#17171D', 'srdce', '#FFB3C7'),
  robot('#EEEEFC', '#2B6B53', 'siroka', 'hvezdy', '#C8F0E6', 'blesk', '#5254D8'),
  robot('#B0284F', '#17171D', 'logo', 'vizor', '#FFB3C7', 'kulicka', '#FBEAF0'),
  robot('#5254D8', '#C8F0E6', 'kulata', 'jedno', '#17171D', 'dvojita', '#C8F0E6'),
];

export const AVATAR_COUNT = AVATARS.length;
export const avatarSvg = (i) => AVATARS[i] || '';
export const hasAvatar = (i) => Number.isInteger(i) && i >= 0 && i < AVATARS.length;

let saveTimer = null;

// Okamžitě přepne obrázek v UI; na server uloží až poslední volbu (rychlé klikání neposílá desítky požadavků).
export function setAvatar(value) {
  if (!state.settings) return;
  state.settings = { ...state.settings, avatar: value };
  emit('settings');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveSettings({ avatar: value }).catch((err) => toast(`${tr('Profilový obrázek se neuložil:')} ${err.message}`, { tone: 'err' }));
  }, 350);
}

export function cycleAvatar() {
  const cur = state.settings?.avatar;
  // S fotkou z účtu Google se klepnutím střídá fotka a obrázek, aby se k fotce dalo vrátit.
  if (state.ucet?.foto && Number.isInteger(cur)) { setAvatar(null); return; }
  let next = Math.floor(Math.random() * AVATARS.length);
  if (next === cur) next = (next + 1 + Math.floor(Math.random() * (AVATARS.length - 1))) % AVATARS.length;
  setAvatar(next);
}
