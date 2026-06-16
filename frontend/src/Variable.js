export const variables = {
  get API_URL() {
    return (window.__APP_CONFIG__ && window.__APP_CONFIG__.API_URL) || "https://localhost:7151/api/";
  },
};

// ── Company details used in printed documents ────────────────
export const COMPANY = {
  name:    'Your Company Name',
  address: '123 Business Street, Industrial Zone',
  city:    'City, State / Province',
  country: 'Country',
  phone:   '+1 (000) 000-0000',
  email:   'purchasing@yourcompany.com',
  website: 'www.yourcompany.com',
  // Place your logo file in /public/logo.png and set the path here
  logoUrl: '/logo.png',

  // ── Bank details printed on invoices ────────────────────────
  bank: {
    note:          'XXXX.',
    beneficiary:   'XXXXXX XXXXXX  XXXXXX',
    bankName:      'Emirates NBD',
    branchAddress: 'Al DXB, Dubai, UAE',
    swift:         'XXXXX',
    accounts: [
      {
        currency: 'AED',
        accountNo: 'X',
        iban:      'XX',
      },
      {
        currency: 'USD',
        accountNo: 'XX',
        iban:      'XXXX',
      },
    ],
  },
};

// ── Resolve a server-relative path (e.g. /uploads/logo.png) to a full URL ──
// Strips "/api/" from the API base so static files are addressed at the root.
export const getFileUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;          // already absolute
  const base = variables.API_URL.replace(/\/api\/?$/i, '');
  return base + (path.startsWith('/') ? path : '/' + path);
};

// ── Auth headers for all fetch calls ────────────────────────
// Reads JWT token from sessionStorage — session ends when the browser closes.
export const authHeaders = () => ({
  "Accept":        "application/json",
  "Content-Type":  "application/json",
  "Authorization": `Bearer ${sessionStorage.getItem("erp_token") || ""}`
});

// ── Current logged-in username ───────────────────────────────
// Use this in non-hook contexts (factory functions, utilities).
// In React components, prefer useCurrentUser() from AuthContext.
export const getCurrentUser = () => {
  try {
    const user = sessionStorage.getItem('erp_user');
    return user ? JSON.parse(user).username || 'system' : 'system';
  } catch {
    return 'system';
  }
};
