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
  svg('#F7EEDA', '<path d="M11 51c12-21 25-27 42-18 9 5 13 13 16 24H11z" fill="#8250DF"/><circle cx="25" cy="27" r="8" fill="#D97757"/><circle cx="53" cy="23" r="5" fill="#16141D"/>'),
  svg('#164E63', '<path d="M11 28h58v24H11z" fill="#E0F3EF"/><path d="m23 40 11-11 12 11 11-11" fill="none" stroke="#22A38C" stroke-width="6" stroke-linecap="round"/><circle cx="57" cy="57" r="8" fill="#C99A3E"/>'),
  svg('#E8B4C5', '<path d="M14 54a26 26 0 0 1 52 0" fill="#16141D"/><path d="M28 16h24v24H28z" fill="#F7EEDA" transform="rotate(45 40 28)"/><circle cx="40" cy="55" r="5" fill="#C2335A"/>'),
  svg('#22313F', '<g fill="none" stroke="#F4F3F7" stroke-width="5"><path d="M16 24h48M16 40h48M16 56h48"/></g><circle cx="28" cy="24" r="7" fill="#C99A3E"/><circle cx="52" cy="40" r="7" fill="#22A38C"/><circle cx="36" cy="56" r="7" fill="#D97757"/>'),
  svg('#DDE8F5', '<path d="M40 10 66 31v29L40 70 14 60V31z" fill="#1F8A96"/><path d="m27 43 9 9 18-20" fill="none" stroke="#F7EEDA" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
  svg('#6F8F5E', '<path d="M11 61c5-23 18-36 29-36s24 13 29 36z" fill="#F7EEDA"/><path d="M40 12v48" stroke="#16141D" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="22" r="7" fill="#C2335A"/>'),
  svg('#2F2640', '<circle cx="40" cy="40" r="27" fill="#C99A3E"/><path d="M40 19v42M19 40h42" stroke="#F7EEDA" stroke-width="5"/><circle cx="40" cy="40" r="8" fill="#8250DF"/>'),
  svg('#F3E6D1', '<path d="M16 18h48v44H16z" rx="6" fill="#D97757"/><path d="m23 51 12-12 8 8 8-8 6 6" fill="none" stroke="#F7EEDA" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30" cy="30" r="5" fill="#16141D"/>'),
  svg('#1A3A37', '<path d="M14 54 29 18l14 36 9-20 14 20z" fill="#43C9B0"/><path d="M14 61h52" stroke="#F7EEDA" stroke-width="5" stroke-linecap="round"/><circle cx="57" cy="20" r="6" fill="#C99A3E"/>'),
  svg('#F1EDF6', '<g fill="#16141D"><circle cx="24" cy="25" r="7"/><circle cx="56" cy="25" r="7"/><circle cx="24" cy="55" r="7"/><circle cx="56" cy="55" r="7"/></g><path d="M40 14v52M14 40h52" stroke="#8250DF" stroke-width="5"/><circle cx="40" cy="40" r="8" fill="#D97757"/>'),
  svg('#55223A', '<path d="M12 42c7-19 17-28 28-28s21 9 28 28c-7 19-17 28-28 28S19 61 12 42z" fill="#F7EEDA"/><circle cx="40" cy="42" r="13" fill="#C2335A"/><circle cx="40" cy="42" r="5" fill="#16141D"/>'),
  svg('#D7E8E4', '<path d="M15 26h50v28H15z" fill="#16141D"/><circle cx="28" cy="40" r="8" fill="#22A38C"/><circle cx="52" cy="40" r="8" fill="#C99A3E"/><path d="M40 14v52" stroke="#D97757" stroke-width="5" stroke-linecap="round"/>'),
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
