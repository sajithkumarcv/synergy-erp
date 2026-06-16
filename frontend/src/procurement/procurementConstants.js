// ── Shared helpers ────────────────────────────────────────────────
export const fmt     = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const today   = () => new Date().toISOString().slice(0, 10);

// ── Status maps — DEPRECATED (kept for fallback only) ─────────────
// Prefer useLookup().getStatusConfig(module, statusCode) instead.
// These will be removed once all modules use LookupContext.
/** @deprecated use getStatusConfig('PR', status) */
export const PR_STATUS = {
    Draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#475569', dot: '#94a3b8'  },
    Submitted: { label: 'Submitted', bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04'  },
    Approved:  { label: 'Approved',  bg: '#dcfce7', color: '#166534', dot: '#16a34a'  },
    Rejected:  { label: 'Rejected',  bg: '#fee2e2', color: '#991b1b', dot: '#dc2626'  },
    Cancelled: { label: 'Cancelled', bg: '#fce7f3', color: '#9d174d', dot: '#db2777'  },
};
/** @deprecated use getStatusConfig('PR', status).allowedTransitions */
export const PR_STATUS_TRANSITIONS = {
    Draft:     ['Submitted', 'Cancelled'],
    Submitted: ['Approved',  'Rejected'],
    Approved:  ['Cancelled'],
    Rejected:  [],
    Cancelled: [],
};

/** @deprecated use getStatusConfig('PO', status) */
export const PO_STATUS = {
    Draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#475569', dot: '#94a3b8'  },
    Approved:  { label: 'Approved',  bg: '#dcfce7', color: '#166534', dot: '#16a34a'  },
    Sent:      { label: 'Sent',      bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6'  },
    Partial:   { label: 'Partial',   bg: '#fef3c7', color: '#92400e', dot: '#f59e0b'  },
    Received:  { label: 'Received',  bg: '#d1fae5', color: '#065f46', dot: '#10b981'  },
    Hold:      { label: 'Hold',      bg: '#fff7ed', color: '#9a3412', dot: '#ea580c'  },
    Cancelled: { label: 'Cancelled', bg: '#fce7f3', color: '#9d174d', dot: '#db2777'  },
};
/** @deprecated use getStatusConfig('PO', status).allowedTransitions */
export const PO_STATUS_TRANSITIONS = {
    Draft:     ['Approved', 'Cancelled'],
    Approved:  ['Sent',     'Cancelled'],
    Sent:      ['Partial',  'Received', 'Cancelled'],
    Partial:   ['Received', 'Cancelled'],
    Received:  [],
    Cancelled: [],
};

// ── Priority ──────────────────────────────────────────────────────
export const PRIORITY_CONFIG = {
    Low:    { bg: '#f1f5f9', color: '#475569' },
    Normal: { bg: '#dbeafe', color: '#1e40af' },
    High:   { bg: '#fef9c3', color: '#854d0e' },
    Urgent: { bg: '#fee2e2', color: '#991b1b' },
};

// ── Tabs ──────────────────────────────────────────────────────────
export const PR_TABS = [
    { key: 'overview',   label: 'Overview',   icon: '📋' },
    { key: 'lines',      label: 'Lines',      icon: '📦', badge: true },
    { key: 'documents',  label: 'Documents',  icon: '📎', badge: true },
    { key: 'approval',   label: 'Approval',   icon: '✔' },
    { key: 'pos',        label: 'POs',        icon: '📄', approvedOnly: true },
    { key: 'history',    label: 'History',    icon: '🕓' },
];

export const PO_TABS = [
    { key: 'overview',   label: 'Overview',   icon: '📋' },
    { key: 'lines',      label: 'Lines',      icon: '📦', badge: true },
    { key: 'meta',       label: 'Meta Info',  icon: '🗒️' },
    { key: 'documents',  label: 'Documents',  icon: '📎', badge: true },
    { key: 'approval',   label: 'Approval',   icon: '✔' },
    { key: 'annexures',  label: 'Annexures',  icon: '📑' },
    { key: 'grns',        label: 'GRNs',        icon: '🚚', approvedOnly: true },
    { key: 'srvs',        label: 'SRVs',        icon: '🔧', approvedOnly: true },
    { key: 'amendments',  label: 'Amendments',  icon: '✏️' },
    { key: 'holdlog',     label: 'Hold Log',    icon: '🔴', approvedOnly: true },
];

export const GRN_TABS = [
    { key: 'overview',   label: 'Overview',   icon: '📋' },
    { key: 'lines',      label: 'Lines',      icon: '📦', badge: true },
    { key: 'documents',  label: 'Documents',  icon: '📎', badge: true },
    { key: 'qc',         label: 'QC Log',     icon: '✅' },
];

export const SRV_TABS = [
    { key: 'overview',  label: 'Overview',  icon: '📋' },
    { key: 'lines',     label: 'Lines',     icon: '🔧', badge: true },
    { key: 'approval',  label: 'Approval',  icon: '✔' },
];

// ── Status Badge component helper (legacy map) ────────────────────
/** @deprecated pass getStatusConfig result directly instead */
export const getStatusCfg = (map, status) => map[status] || { label: status, bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };

// ── Status Badge from LookupContext config ────────────────────────
// Usage: const cfg = statusBadgeCfg(getStatusConfig('PR', pr.status));
export const statusBadgeCfg = (cfg) => cfg
    ? { label: cfg.statusLabel, bg: cfg.badgeBg, color: cfg.badgeColor, dot: cfg.badgeDot }
    : { label: '—', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };

// ── Section divider ───────────────────────────────────────────────
export const FormSection = ({ label }) => (
    <div className="pf-section">
        <span className="pf-section-label">{label}</span>
        <div className="pf-section-line" />
    </div>
);
