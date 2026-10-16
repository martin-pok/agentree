// Decide before styles render, so the first paint shows the right installation path.
// The choice stays in this tab; ?os=mac or ?os=windows can override detection.
(() => {
  const root = document.documentElement;
  const requested = new URLSearchParams(location.search).get('os');
  const section = location.hash.slice(1);
  let saved = '';
  try { saved = sessionStorage.getItem('agenteeq-site-os') || ''; } catch { /* private browsing */ }
  const platform = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '');
  const detected = /win/i.test(platform) ? 'windows' : 'mac';
  root.dataset.os = ['mac', 'windows'].includes(requested) ? requested
    : ['mac', 'windows'].includes(section) ? section
    : ['mac', 'windows'].includes(saved) ? saved : detected;
  root.dataset.osReady = 'true';
})();
