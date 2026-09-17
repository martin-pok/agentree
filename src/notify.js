import { run } from './util.js';

// Nativní notifikace macOS přes osascript. Text jde jako argumenty (argv), ne do skriptu – žádná injekce.
export function createNotifier({ enabled }) {
  return {
    enabled,
    async native({ title, body, subtitle = '', sound = false }) {
      if (!enabled) return false;
      const script = [
        'on run argv',
        sound
          ? 'display notification (item 2 of argv) with title (item 1 of argv) subtitle (item 3 of argv) sound name "Glass"'
          : 'display notification (item 2 of argv) with title (item 1 of argv) subtitle (item 3 of argv)',
        'end run',
      ];
      const args = script.flatMap((line) => ['-e', line]);
      const res = await run('osascript', [...args, String(title).slice(0, 120), String(body).slice(0, 240), String(subtitle).slice(0, 120)], { timeout: 4000 });
      return res.ok;
    },
  };
}
