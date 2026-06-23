// ─────────────────────────────────────────────────────────────
// inventoryConstants.js
// Single source of truth for inventory module config
// ─────────────────────────────────────────────────────────────

// ── GRN Receipt Types ─────────────────────────────────────────
export const RECEIPT_TYPE = {
  JOB:      { label: 'Job Purchase',      color: '#1e40af', bg: '#dbeafe' },
  STORE:    { label: 'Store Purchase',    color: '#166534', bg: '#dcfce7' },
  OPENING:  { label: 'Opening Balance',   color: '#7c3aed', bg: '#ede9fe' },
  TRANSFER: { label: 'Stock Transfer In', color: '#b45309', bg: '#ffedd5' },
};

// ── GRN / Issue Statuses ──────────────────────────────────────
export const DOC_STATUS = {
  Draft:     { label: 'Draft',     color: '#854d0e', bg: '#fef9c3', dot: '#ca8a04' },
  Confirmed: { label: 'Confirmed', color: '#166534', bg: '#dcfce7', dot: '#16a34a' },
};

// ── Issue Note costing types ──────────────────────────────────
export const COSTING_TYPE = {
  INC_COSTING: {
    label:       'Including Costing',
    short:       'INC',
    description: 'Item cost is charged to the job (included in job expense costing)',
    color:       '#1e40af',
    bg:          '#dbeafe',
  },
  EXC_COSTING: {
    label:       'Excluding Costing',
    short:       'EXC',
    description: 'Cost already captured in purchase order — issue note does not add to job cost',
    color:       '#7c3aed',
    bg:          '#f3e8ff',
  },
};

// ── GRN Tab definitions ───────────────────────────────────────
export const GRN_TABS = [
  { key: 'lines',    label: 'Lines',    icon: '📦', description: 'Receipt line items',    badge: true },
  { key: 'overview', label: 'Overview', icon: '📋', description: 'Header info and notes' },
];

// ── Issue Tab definitions ─────────────────────────────────────
export const ISSUE_TABS = [
  { key: 'overview', label: 'Overview', icon: '📋', description: 'Header info and notes' },
  { key: 'lines',    label: 'Lines',    icon: '📦', description: 'Issue line items',    badge: true },
];

// ── Issue Return Tab definitions ──────────────────────────────
export const IRN_TABS = [
  { key: 'overview', label: 'Overview', icon: '📋', description: 'Header info and notes' },
  { key: 'lines',    label: 'Lines',    icon: '↩',  description: 'Return line items',   badge: true },
  { key: 'approval', label: 'Approval', icon: '✔',  description: 'Approval status and history' },
];

// ── Stock Adjustment Tab definitions ─────────────────────────
export const ADJ_TABS = [
  { key: 'overview', label: 'Overview', icon: '📋', description: 'Header info and notes' },
  { key: 'lines',    label: 'Lines',    icon: '📦', description: 'Adjustment line items', badge: true },
  { key: 'approval', label: 'Approval', icon: '✔',  description: 'Approval status and history' },
];

// ── Stock Transfer Tab definitions ───────────────────────────
export const STR_TABS = [
  { key: 'overview', label: 'Overview', icon: '📋', description: 'Header info and notes' },
  { key: 'items',    label: 'Items',    icon: '📦', description: 'Items to transfer',     badge: true },
  { key: 'approval', label: 'Approval', icon: '✔',  description: 'Approval status and history' },
];

// ── Today helper ──────────────────────────────────────────────
export const today = () => new Date().toISOString().slice(0, 10);

// ── Status badge config helper ────────────────────────────────
export const statusBadgeCfg = (cfg) => cfg
  ? { label: cfg.statusLabel, bg: cfg.badgeBg, color: cfg.badgeColor, dot: cfg.badgeDot }
  : { label: '—', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };

// ── Formatters (shared with job module) ──────────────────────
export const fmt = (n, decimals = 2) =>
  n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
