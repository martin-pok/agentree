import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../public/js/state.js';

globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { phoneCard, tailscaleCard } = await import('../public/js/views/settings.js');

test('párování telefonu nabízí jen QR, bez viditelné IP adresy a ručního PINu', () => {
  const previous = { lan: state.lan, tunnels: state.tunnels };
  try {
    state.lan = {
      enabled: true, listening: true, addresses: ['192.168.100.160'], url: 'http://192.168.100.160:4620',
      pin: { code: '482913', expiresAt: Date.now() + 60_000 }, devices: [], error: '',
      tailscale: { enabled: true, available: true, listening: true, addresses: ['100.101.102.103'],
        name: 'mac.example.ts.net', url: 'http://mac.example.ts.net:4620', error: '' },
    };
    state.tunnels = { list: [{ id: 'tailscale', running: true, installed: true, serve: { running: true, url: 'https://mac.example.ts.net' } }] };
    const phone = phoneCard();
    const tailscale = tailscaleCard();
    assert.match(phone, /class="pair-qr"/);
    assert.match(phone, /data-action="lan-pin"/);
    assert.doesNotMatch(phone + tailscale, /192\.168\.100\.160|100\.101\.102\.103|482913|http:\/\/mac\.example|Kopírovat adresu|Copy address|pin-box/);
  } finally {
    state.lan = { ...previous.lan, pin: null };
    state.tunnels = previous.tunnels;
    phoneCard(); // clear the expiry timer opened by the rendered QR
    state.lan = previous.lan;
  }
});
