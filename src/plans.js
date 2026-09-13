// Tarify Agenteeq. Rozhodnutí o cenách a o tom, co bude placené, patří vlastníkovi produktu (docs/LICENSING.md).
export const PLANS = {
  free: { label: 'Zdarma', rank: 0 },
  pro: { label: 'Pro', rank: 1 },
  team: { label: 'Team', rank: 2 },
};

// Funkce, které vyžadují placený tarif: { klíčFunkce: 'pro' | 'team' }.
// Prázdné = early access, vše odemčené. Klíče funkcí: launchBackground, localChat, cloudBilling, webExtension.
export const PAID_FEATURES = {};

export function planOf(licenseStatus) {
  return licenseStatus?.valid ? licenseStatus.license.plan : 'free';
}

export function canUse(feature, licenseStatus) {
  const need = PAID_FEATURES[feature];
  if (!need) return true;
  return (PLANS[planOf(licenseStatus)]?.rank ?? 0) >= (PLANS[need]?.rank ?? 99);
}
