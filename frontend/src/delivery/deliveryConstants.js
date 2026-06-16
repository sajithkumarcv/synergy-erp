import React from 'react';

// ── Tabs ──────────────────────────────────────────────────────────────
export const DELIVERY_TABS = [
    { key: 'overview',   label: 'Overview',   icon: '📋', description: 'Header & delivery info' },
    { key: 'lines',      label: 'Lines',      icon: '📦', description: 'Delivery line items',  badge: true },
    { key: 'documents',  label: 'Documents',  icon: '📎', description: 'Attached files',        badge: true },
];

// ── Date / number helpers ─────────────────────────────────────────────
export const today = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (val) => {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
        });
    } catch { return val; }
};

export const fmtDateTime = (val) => {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return val; }
};

export const fmt = (val, dp = 2) => {
    if (val === null || val === undefined || val === '') return '—';
    const n = Number(val);
    if (isNaN(n)) return val;
    return n.toLocaleString(undefined, {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
    });
};

// ── Status config ─────────────────────────────────────────────────────
const STATUS_MAP = {
    Draft:      { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', canEdit: true,  canDelete: true  },
    Approved:   { bg: '#dcfce7', color: '#166534', dot: '#16a34a', canEdit: true,  canDelete: false },
    Dispatched: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6', canEdit: false, canDelete: false },
    Delivered:  { bg: '#ccfbf1', color: '#0f766e', dot: '#14b8a6', canEdit: false, canDelete: false },
    Cancelled:  { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', canEdit: false, canDelete: false },
};

export const getDeliveryStatusConfig = (status) =>
    STATUS_MAP[status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', canEdit: false, canDelete: false };

// ── Status transitions ────────────────────────────────────────────────
export const STATUS_TRANSITIONS = {
    Draft:      ['Approved', 'Cancelled'],
    Approved:   ['Dispatched', 'Draft'],
    Dispatched: ['Delivered'],
    Delivered:  [],
    Cancelled:  [],
};

// ── FormSection divider (matches invoice style) ───────────────────────
export const FormSection = ({ label }) => (
    <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.07em', color: '#3a5070',
        borderBottom: '1px solid #e2e8f0', paddingBottom: 4,
        marginTop: 18, marginBottom: 10,
    }}>
        {label}
    </div>
);
