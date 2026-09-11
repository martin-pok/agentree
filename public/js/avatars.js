import { state, emit } from './state.js';
import { api } from './api.js';
import { toast } from './ui.js';

// Abstraktní profilové obrázky: jednoduché tvary v teplé paletě Agentree. Index se ukládá do nastavení (settings.avatar).
const svg = (bg, body) => `<svg viewBox="0 0 80 80" role="img" aria-hidden="true" focusable="false"><rect width="80" height="80" fill="${bg}"/>${body}</svg>`;

const AVATARS = [
  svg('#D97757', '<circle cx="46" cy="36" r="20" fill="#F7EEDA"/><circle cx="24" cy="58" r="7" fill="#16141D"/>'),
  svg('#F1E6D6', '<path d="M12 68V36a24 24 0 0 1 24 24v8z" fill="#16141D"/><circle cx="56" cy="26" r="9" fill="#D97757"/>'),
  svg('#22A38C', '<path d="M40 14 66 62H14z" fill="#F4F3F7"/><circle cx="40" cy="48" r="6" fill="#0D7A67"/>'),
  svg('#16141D', '<path d="M18 52a22 22 0 0 1 44 0" fill="none" stroke="#C99A3E" stroke-width="9" stroke-linecap="round"/><circle cx="40" cy="30" r="5" fill="#F4F3F7"/>'),
  svg('#C99A3E', '<g stroke="#16141D" stroke-width="5" stroke-linecap="round"><path d="M40 16v48M16 40h48M23 23l34 34M57 23 23 57"/></g><circle cx="40" cy="40" r="7" fill="#F7EEDA"/>'),
  svg('#E6EEEC', '<path d="M8 50c8-10 16-10 24 0s16 10 24 0 16-10 24 0v30H8z" fill="#22A38C"/><circle cx="54" cy="26" r="8" fill="#16141D"/>'),
  svg('#C2335A', '<path d="M50 16a24 24 0 1 0 0 48 18 18 0 1 1 0-48z" fill="#F7EEDA"/>'),
  svg('#6F8F5E', '<g fill="#F4F3F7"><circle cx="40" cy="27" r="11"/><circle cx="40" cy="53" r="11"/><circle cx="27" cy="40" r="11"/><circle cx="53" cy="40" r="11"/></g><circle cx="40" cy="40" r="6" fill="#C99A3E"/>'),
  svg('#8250DF', '<path d="M40 12 62 40 40 68 18 40z" fill="#F4F3F7"/><circle cx="40" cy="40" r="7" fill="#C2335A"/>'),
  svg('#F4F3F7', '<g fill="#16141D"><circle cx="22" cy="22" r="6"/><circle cx="40" cy="22" r="6"/><circle cx="58" cy="22" r="6"/><circle cx="22" cy="40" r="6"/><circle cx="58" cy="40" r="6"/><circle cx="22" cy="58" r="6"/><circle cx="40" cy="58" r="6"/><circle cx="58" cy="58" r="6"/></g><circle cx="40" cy="40" r="8" fill="#D97757"/>'),
  svg('#1F8A96', '<circle cx="40" cy="40" r="26" fill="none" stroke="#F1E6D6" stroke-width="6"/><circle cx="40" cy="40" r="13" fill="none" stroke="#F1E6D6" stroke-width="6"/><circle cx="40" cy="40" r="3" fill="#F1E6D6"/>'),
  svg('#3A3743', '<path d="M22 44c-6-14 6-28 20-26s24 14 18 28-14 22-24 18-8-8-14-20z" fill="#D97757"/><circle cx="52" cy="30" r="5" fill="#F7EEDA"/>'),
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
    api.saveSettings({ avatar: value }).catch((err) => toast(`Profilový obrázek se neuložil: ${err.message}`, { tone: 'velvet' }));
  }, 350);
}

export function cycleAvatar() {
  const cur = state.settings?.avatar;
  let next = Math.floor(Math.random() * AVATARS.length);
  if (next === cur) next = (next + 1 + Math.floor(Math.random() * (AVATARS.length - 1))) % AVATARS.length;
  setAvatar(next);
}
