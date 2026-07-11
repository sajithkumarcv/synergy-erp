// ═══════════════════════════════════════════════════════════════════
// branding.js — runtime, per-client login branding
//
// Branding is DATA, not code. All client-specific login content lives in
// public/branding/<client>/ and is loaded at app start (see index.js),
// so the look changes by replacing files or editing config.json — no rebuild.
//
//   public/config.json         → { "API_URL": "...", "BRAND": "synergy" }
//   public/branding/<brand>/   → brand.json, logo.*, background.*, login.css
//
// A missing brand.json (or any missing key) falls back to these defaults,
// which reproduce the original compiled-in "PMS" login.
// ═══════════════════════════════════════════════════════════════════

const DEFAULTS = {
  layout:  'split-left',
  appName: 'PMS',
  tagline: 'Project Management System',
  logo:    'logo.svg',
  features: [
    'Procurement & Inventory',
    'Job Costing & Finance',
    'Customer Management',
    'Real-time Reporting',
  ],
  footer: '© {year} PMS — All rights reserved',
  text: {
    signInTitle:    'Sign In',
    signInSubtitle: 'Enter your credentials to access the system',
    resetTitle:     'Reset Password',
    resetSubtitle:  'Enter your account email and we will send you a reset link',
  },
  colors: {},
  _base: '/branding/default/',
};

// Deep-ish merge: loaded brand overrides defaults; `text`/`colors` merge key-by-key.
function merge(base, over) {
  const out = { ...base, ...over };
  out.text   = { ...base.text,   ...(over.text   || {}) };
  out.colors = { ...base.colors, ...(over.colors || {}) };
  if (!over.features) out.features = base.features;
  return out;
}

// Fetch and apply a brand. Called once from index.js before React renders.
export async function loadBrand() {
  let cfg = {};
  try {
    cfg = await fetch('/config.json', { cache: 'no-store' }).then(r => r.json());
  } catch { /* keep defaults */ }
  window.__APP_CONFIG__ = cfg;

  const name = (cfg.BRAND || 'default').trim();
  const base = `/branding/${name}/`;

  let loaded = {};
  try {
    loaded = await fetch(base + 'brand.json', { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('no brand.json');
      return r.json();
    });
  } catch {
    // Unknown/empty brand folder → fall back to the default brand assets.
    return applyBrand(merge(DEFAULTS, {}));
  }

  const b = merge(DEFAULTS, loaded);
  b._base = base;
  return applyBrand(b);
}

// Push a brand's tokens onto the document (CSS vars, title, favicon, custom CSS).
export function applyBrand(b) {
  window.__BRAND__ = b;
  const root = document.documentElement;

  Object.entries(b.colors || {}).forEach(([k, v]) =>
    root.style.setProperty(`--brand-${k}`, v));

  if (b.title || b.appName) document.title = b.title || b.appName;

  if (b.favicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = b._base + b.favicon;
  }

  // Free-form CSS escape hatch — appended LAST so a client stylesheet can
  // override anything in Login.css. Cache-busted by an optional version.
  if (b.customCss) {
    const id = 'brand-custom-css';
    document.getElementById(id)?.remove();
    const css = document.createElement('link');
    css.id = id;
    css.rel = 'stylesheet';
    css.href = b._base + b.customCss + '?v=' + (b.version || 1);
    document.head.appendChild(css);
  }

  return b;
}

// Accessor for components. Always returns a usable object.
export const brand = () => window.__BRAND__ || { ...DEFAULTS };

// Resolve an asset name in the active brand folder to a URL.
export const brandAsset = (name) => (name ? brand()._base + name : null);

// Replace {year} (and any future tokens) in brand copy.
export const brandText = (s) =>
  (s || '').replace('{year}', new Date().getFullYear());
