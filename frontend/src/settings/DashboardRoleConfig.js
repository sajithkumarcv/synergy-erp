import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import '../procurement/Procurement.css';

// Must match the KPI/section keys Dashboard.js actually understands —
// see ROLE_CONFIG / DEFAULT_CONFIG there. Adding a new dashboard tile or
// section means adding it to both this list and Dashboard.js's showKpi/
// showSection checks.
const KPI_ITEMS = [
    { key: 'activeJobs',       label: 'Active Jobs' },
    { key: 'openPRs',          label: 'Open PRs' },
    { key: 'openPOs',          label: 'Open POs' },
    { key: 'pendingApprovals', label: 'Pending Approvals' },
    { key: 'openInvoices',     label: 'Open Invoices' },
];

const SECTION_ITEMS = [
    { key: 'todayActivity', label: "Today's Activity" },
    { key: 'myDrafts',      label: 'My Draft Documents' },
    { key: 'approvedPrs',   label: 'Approved PRs — Ready for PO' },
    { key: 'jobSummary',    label: 'Job Summary' },
    { key: 'myApprovals',   label: 'My Pending Approvals' },
    { key: 'procurement',   label: 'Procurement Status' },
    { key: 'inventory',     label: 'Inventory Status' },
    { key: 'financials',    label: 'Financial Summary' },
    { key: 'jobCosting',    label: 'Job Costing Summary' },
];

const cellKey = (roleId, itemType, itemKey) => `${roleId}|${itemType}|${itemKey}`;

const DashboardRoleConfig = () => {
    const currentUser = useCurrentUser();

    const [roles,   setRoles]   = useState([]);
    const [checks,  setChecks]  = useState({});   // cellKey -> bool
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');
    const [saving,  setSaving]  = useState({});   // cellKey -> true while in flight
    const [toast,   setToast]   = useState('');

    const load = useCallback(() => {
        setLoading(true); setError('');
        fetch(`${variables.API_URL}dashboard/role-config`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => {
                setRoles(Array.isArray(d.roles) ? d.roles : []);
                const map = {};
                (d.config || []).forEach(c => {
                    map[cellKey(c.roleId, c.itemType, c.itemKey)] = !!c.isVisible;
                });
                setChecks(map);
            })
            .catch(() => setError('Failed to load dashboard role config.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggle = (roleId, itemType, itemKey) => {
        const key = cellKey(roleId, itemType, itemKey);
        const next = !checks[key];
        setChecks(p => ({ ...p, [key]: next }));
        setSaving(p => ({ ...p, [key]: true }));
        fetch(`${variables.API_URL}dashboard/role-config/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ roleId, itemType, itemKey, isVisible: next, modifiedBy: currentUser }),
        })
            .then(r => { if (!r.ok) throw new Error(); })
            .catch(() => {
                // Roll back on failure — the role would otherwise silently
                // show a tile/section state that was never actually saved.
                setChecks(p => ({ ...p, [key]: !next }));
                setToast('⚠ Save failed — reverted.');
                setTimeout(() => setToast(''), 3000);
            })
            .finally(() => setSaving(p => ({ ...p, [key]: false })));
    };

    const Group = ({ title, items }) => (
        <>
            <tr style={{ background: '#f8fafc' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 11.5, color: '#475569', textTransform: 'uppercase', letterSpacing: '.04em' }}
                    colSpan={roles.length + 1}>
                    {title}
                </td>
            </tr>
            {items.map(item => (
                <tr key={item.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#1e293b', whiteSpace: 'nowrap' }}>{item.label}</td>
                    {roles.map(r => {
                        const key = cellKey(r.roleId, title === 'Dashboard Sections' ? 'SECTION' : 'KPI', item.key);
                        return (
                            <td key={r.roleId} style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={!!checks[key]}
                                    disabled={!!saving[key]}
                                    onChange={() => toggle(r.roleId, title === 'Dashboard Sections' ? 'SECTION' : 'KPI', item.key)}
                                    style={{ width: 16, height: 16, cursor: saving[key] ? 'wait' : 'pointer', accentColor: '#2563eb' }}
                                />
                            </td>
                        );
                    })}
                </tr>
            ))}
        </>
    );

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Dashboard Roles</div>
                            <div className="po-page-sub">Choose which KPI tiles and sections each role sees on their dashboard — changes save immediately.</div>
                        </div>
                        <button className="po-btn-sec" onClick={load} disabled={loading} style={{ padding: '5px 12px', fontSize: 12 }}>
                            ↻ Refresh
                        </button>
                    </div>
                </div>

                <div style={{ padding: '16px 0' }}>
                    {toast && (
                        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                                      background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                            {toast}
                        </div>
                    )}

                    {loading && (
                        <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>Loading…</div>
                    )}

                    {error && !loading && (
                        <div style={{ padding: '12px 16px', color: '#991b1b', background: '#fee2e2',
                                      border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13 }}>
                            ⚠ {error}
                        </div>
                    )}

                    {!loading && !error && roles.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No active roles found.</div>
                    )}

                    {!loading && !error && roles.length > 0 && (
                        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.04em', position: 'sticky', left: 0, background: '#f1f5f9' }}>
                                            Item
                                        </th>
                                        {roles.map(r => (
                                            <th key={r.roleId} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                                                {r.roleName}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <Group title="KPI Tiles" items={KPI_ITEMS} />
                                    <Group title="Dashboard Sections" items={SECTION_ITEMS} />
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardRoleConfig;
