import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from './Variable';
import { useCurrentUserId, useCurrentUser, useAuth } from './AuthContext';
import { useLookup } from './LookupContext';
import './Dashboard.css';

// ── Filtered navigation helper ──────────────────────────────────────────────
// Every dashboard tile shows a COUNT that implies a filter (e.g. "Open PRs",
// "Draft PO", "created today"). Clicking through must land on the list page
// pre-filtered to match what was counted, not the unfiltered list — see
// [[weberp-synergy-fork]]. `filters` is read once on the destination page's
// mount via useInitialFilters (frontend/src/utils/useInitialFilters.js).
const goFiltered = (navigate, route, filters) =>
    navigate(route, filters ? { state: { initialFilters: filters } } : undefined);

const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// "Open" PR/PO isn't a single status — it's every status except the
// terminal/consumed ones, mirroring proj.sp_GetDashboard's OpenPRs/OpenPOs
// definition exactly (NOT IN (...) there → filter out the same codes here)
// so the KPI count and the filtered list always agree.
const OPEN_PR_EXCLUDE = ['Cancelled', 'Rejected', 'Ordered', 'Closed'];
const OPEN_PO_EXCLUDE = ['Cancelled', 'Received', 'Completed'];

// ── Role-based section config ─────────────────────────────────────────────────
// kpis: which top KPI cards to show
// sections: which dashboard panels to render
const ROLE_CONFIG = {
    'ADMIN': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
        sections: ['todayActivity','myDrafts','approvedPrs','jobSummary','myApprovals','procurement','inventory','financials','jobCosting'],
    },
    'DEPARTMENT HEAD': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
        sections: ['myDrafts','approvedPrs','jobSummary','myApprovals','procurement','financials','jobCosting'],
    },
    'FINANCE MANAGER': {
        kpis:     ['openInvoices','pendingApprovals'],
        sections: ['myApprovals','financials','jobCosting'],
    },
    'FINANCE OFFICER': {
        kpis:     ['openInvoices','pendingApprovals'],
        sections: ['myApprovals','financials'],
    },
    'PROCUREMENT OFFICER': {
        kpis:     ['openPRs','openPOs','pendingApprovals'],
        sections: ['todayActivity','approvedPrs','myDrafts','myApprovals','procurement','inventory'],
    },
    'SR.PROJ.MANAGER': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
        sections: ['myDrafts','jobSummary','myApprovals','procurement','financials','jobCosting'],
    },
    'PROJ.MANAGER': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals'],
        sections: ['myDrafts','jobSummary','myApprovals','procurement','jobCosting'],
    },
    'SR.ENGINEER': {
        kpis:     ['activeJobs','openPRs','pendingApprovals'],
        sections: ['myDrafts','jobSummary','myApprovals','procurement','jobCosting'],
    },
    'ENGINEER': {
        kpis:     ['activeJobs','pendingApprovals'],
        sections: ['myDrafts','jobSummary','myApprovals','jobCosting'],
    },
    'ADMIN CORDINATOR': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals'],
        sections: ['myDrafts','jobSummary','myApprovals','procurement'],
    },
};

// Fallback — show everything if role not in map
const DEFAULT_CONFIG = {
    kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
    sections: ['myDrafts','approvedPrs','jobSummary','myApprovals','procurement','inventory','financials','jobCosting'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtM  = (n) => {
    if (n == null) return '—';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `AED ${(n / 1_000).toFixed(0)}K`;
    return `AED ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
const fmtN  = (n) => n == null ? '—' : Number(n).toLocaleString();

const MODULE_ROUTES = {
    PR:  id => `/purchase-requests/${id}`,
    PO:  id => `/purchase-orders/${id}`,
    INV: id => `/invoices/${id}`,
    JOB: id => `/jobs/${id}`,
    BOM: id => `/bom/${id}`,
    MH:  id => `/manhour/${id}`,
    ADJ: id => `/inventory-adjustment/${id}`,
    SRV: id => `/service-receipts/${id}`,
    IRN: id => `/inventory-issue-return/${id}`,
    RV:  id => `/receipt-vouchers/${id}`,
    PV:  id => `/payment-vouchers/${id}`,
    CN:  id => `/credit-notes/${id}`,
    DN:  id => `/debit-notes/${id}`,
};

// ── Bar indicator ─────────────────────────────────────────────────────────────
const BarRow = ({ label, value, max, color }) => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div className="db-bar-row">
            <div className="db-bar-label">{label}</div>
            <div className="db-bar-track">
                <div className="db-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="db-bar-val">{fmtM(value)}</div>
        </div>
    );
};

// ── Donut chart (SVG) ─────────────────────────────────────────────────────────
const Donut = ({ pct, color = '#1e40af', size = 100 }) => {
    const r    = 38;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
        <svg width={size} height={size} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={circ / 4}
                strokeLinecap="round" />
            <text x="50" y="54" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e293b">
                {pct.toFixed(1)}%
            </text>
        </svg>
    );
};

// ── My Draft Documents widget (self-fetching) ────────────────────────────────
const DOC_TYPE_CFG = {
    PR:  { label: 'Purchase Request', route: id => `/purchase-requests/${id}`,  color: '#1e40af', bg: '#dbeafe' },
    PO:  { label: 'Purchase Order',   route: id => `/purchase-orders/${id}`,    color: '#065f46', bg: '#d1fae5' },
    GRN: { label: 'GRN',              route: id => `/grn/${id}`,                color: '#7c3aed', bg: '#ede9fe' },
    ISN: { label: 'Issue Note',       route: id => `/inventory-issue/${id}`,    color: '#b45309', bg: '#fef3c7' },
};

const MyDraftsWidget = ({ userId }) => {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);

    useEffect(() => {
        if (!userId) return;
        fetch(`${variables.API_URL}dashboard/drafts?userId=${userId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(() => setRows('err'));
    }, [userId]);

    const grouped = rows && rows !== 'err'
        ? ['PR','PO','GRN','ISN'].map(t => ({ type: t, items: rows.filter(r => r.docType === t) })).filter(g => g.items.length > 0)
        : [];

    if (rows !== null && rows !== 'err' && rows.length === 0) return null;

    return (
        <div className="db-card db-card-wide" style={{ borderLeft: '3px solid #f59e0b' }}>
            <div className="db-card-header">
                <span className="db-card-icon">📋</span> MY DRAFT DOCUMENTS
                {rows && rows !== 'err' && rows.length > 0 && (
                    <span style={{ marginLeft: 8, background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                        {rows.length} draft{rows.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>
            <div className="db-card-body">
                {rows === null && <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading…</div>}
                {rows === 'err' && <div style={{ color: '#94a3b8', fontSize: 12 }}>Unable to load drafts.</div>}
                {grouped.map(({ type, items }) => {
                    const cfg = DOC_TYPE_CFG[type];
                    return (
                        <div key={type} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                                {cfg.label} ({items.length})
                            </div>
                            {items.map(r => (
                                <div key={r.docId} className="db-stat-row"
                                    style={{ cursor: 'pointer', alignItems: 'center', padding: '4px 0' }}
                                    onClick={() => navigate(cfg.route(r.docId))}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                        <span style={{ fontFamily: 'Courier New', fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                            {r.docNo}
                                        </span>
                                        {r.jobId && (
                                            <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.jobId}
                                            </span>
                                        )}
                                        {r.lineCount === 0 && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                                No lines
                                            </span>
                                        )}
                                    </span>
                                    <span style={{ fontSize: 11, color: r.daysOld >= 7 ? '#dc2626' : r.daysOld >= 3 ? '#d97706' : '#64748b', fontWeight: r.daysOld >= 3 ? 600 : 400, whiteSpace: 'nowrap' }}>
                                        {r.daysOld === 0 ? 'today' : `${r.daysOld}d old`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Most over-budget jobs widget (self-fetching) ───────────────────────────────
const OverBudgetWidget = () => {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);   // null=loading, 'err', or array

    useEffect(() => {
        fetch(`${variables.API_URL}reports/job-budget?overBudgetOnly=true`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => {
                const top = (d.jobs || [])
                    .slice()
                    .sort((a, b) => (a.varianceBase || 0) - (b.varianceBase || 0))  // most negative first
                    .slice(0, 5);
                setRows(top);
            })
            .catch(() => setRows('err'));
    }, []);

    return (
        <div className="db-card db-card-wide">
            <div className="db-card-header">
                <span className="db-card-icon">📉</span> MOST OVER-BUDGET JOBS
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--db-accent)', cursor: 'pointer' }}
                    onClick={() => navigate('/reports/job-budget')}>View all →</span>
            </div>
            <div className="db-card-body">
                {rows === null && <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading…</div>}
                {rows === 'err' && <div style={{ color: '#94a3b8', fontSize: 12 }}>Report unavailable.</div>}
                {Array.isArray(rows) && rows.length === 0 && (
                    <div style={{ color: '#16a34a', fontSize: 12.5, fontWeight: 600 }}>✓ No jobs are over budget.</div>
                )}
                {Array.isArray(rows) && rows.map(j => {
                    const over = Math.abs(j.varianceBase || 0);
                    return (
                        <div key={j.jobId} className="db-stat-row" onClick={() => navigate(`/jobs/${j.jobId}`)}
                            style={{ cursor: 'pointer', alignItems: 'center' }}>
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#4338ca', fontSize: 12 }}>{j.jobId}</span>
                                <span style={{ fontSize: 10.5, color: '#64748b', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {j.projectName || '—'}
                                </span>
                            </span>
                            <span style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', color: '#b91c1c', fontWeight: 700, fontSize: 12.5 }}>{fmtM(over)} over</span>
                                {j.variancePct != null && (
                                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                                        {Number(j.variancePct).toFixed(0)}% · {j.overCategoryCount} hdr{j.overCategoryCount !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Today's activity — docs the user created today (self-fetching) ─────────────
const TodayActivityWidget = ({ userId }) => {
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const [d, setD] = useState(null);   // null=loading, 'err', or data object

    useEffect(() => {
        if (!userId) return;
        fetch(`${variables.API_URL}dashboard/today-activity?userId=${userId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setD)
            .catch(() => setD('err'));
    }, [userId]);

    // Every tile here is scoped to "created by me, today" — the filter
    // handed to the destination list must match, or the count won't agree
    // with what the filtered list shows.
    const todayFilters = { createdBy: currentUser, dateFrom: todayISO(), dateTo: todayISO() };
    const tiles = [
        { key: 'po',    label: 'POs Created',    icon: '📦', accent: '#059669', soft: '#d1fae5', count: d?.poCount,    sub: d?.poValue > 0 ? fmtM(d.poValue) : null, route: '/purchase-orders' },
        { key: 'grn',   label: 'GRNs',           icon: '📥', accent: '#7c3aed', soft: '#ede9fe', count: d?.grnCount,   sub: null, route: '/grn' },
        { key: 'issue', label: 'Issue Notes',    icon: '📤', accent: '#b45309', soft: '#fef3c7', count: d?.issueCount, sub: null, route: '/inventory-issue' },
        { key: 'pr',    label: 'PRs',            icon: '📝', accent: '#2563eb', soft: '#dbeafe', count: d?.prCount,    sub: null, route: '/purchase-requests' },
    ];

    return (
        <div className="db-card db-card-wide" style={{ borderLeft: '3px solid #0891b2' }}>
            <div className="db-card-header">
                <span className="db-card-icon">📅</span> TODAY'S ACTIVITY
                <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 500, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>
                    documents you created today
                </span>
            </div>
            <div className="db-card-body">
                {d === null && <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading…</div>}
                {d === 'err' && <div style={{ color: '#94a3b8', fontSize: 12 }}>Unable to load.</div>}
                {d && d !== 'err' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {tiles.map(t => (
                            <div key={t.key} onClick={() => goFiltered(navigate, t.route, todayFilters)}
                                style={{ cursor: 'pointer', border: '1px solid #eef1f6', borderRadius: 10, padding: '12px 10px',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4,
                                    transition: 'border-color .12s, transform .12s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#eef1f6'; e.currentTarget.style.transform = 'none'; }}>
                                <span style={{ width: 34, height: 34, borderRadius: 10, background: t.soft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{t.icon}</span>
                                <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: (t.count || 0) > 0 ? t.accent : '#cbd5e1' }}>{t.count ?? 0}</span>
                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{t.label}</span>
                                {t.sub && <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{t.sub}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Approved PRs awaiting PO — procurement work queue (self-fetching) ──────────
const ApprovedPrsWidget = () => {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);   // null=loading, 'err', or array

    useEffect(() => {
        fetch(`${variables.API_URL}dashboard/approved-prs`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(() => setRows('err'));
    }, []);

    return (
        <div className="db-card db-card-wide" style={{ borderLeft: '3px solid #16a34a' }}>
            <div className="db-card-header">
                <span className="db-card-icon">🧾</span> APPROVED PRs — READY FOR PO
                {Array.isArray(rows) && rows.length > 0 && (
                    <span style={{ marginLeft: 8, background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                        {rows.length}
                    </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--db-accent)', cursor: 'pointer' }}
                    onClick={() => goFiltered(navigate, '/purchase-requests', { status: 'Approved' })}>View all →</span>
            </div>
            <div className="db-card-body">
                {rows === null && <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading…</div>}
                {rows === 'err' && <div style={{ color: '#94a3b8', fontSize: 12 }}>Unable to load.</div>}
                {Array.isArray(rows) && rows.length === 0 && (
                    <div style={{ color: '#16a34a', fontSize: 12.5, fontWeight: 600 }}>✓ No approved PRs waiting — all caught up.</div>
                )}
                {Array.isArray(rows) && rows.map(pr => (
                    <div key={pr.prId} className="db-stat-row" onClick={() => navigate(`/purchase-requests/${pr.prId}`)}
                        style={{ cursor: 'pointer', alignItems: 'center' }}>
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#166534', fontSize: 12, background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>{pr.prNumber}</span>
                                {pr.jobId && <span style={{ fontSize: 11, color: '#64748b' }}>{pr.jobId}</span>}
                            </span>
                            <span style={{ fontSize: 10.5, color: '#94a3b8', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                                {pr.requestedBy || '—'} · {pr.openLines} line{pr.openLines !== 1 ? 's' : ''}
                            </span>
                        </span>
                        <span style={{ textAlign: 'right' }}>
                            <span style={{ display: 'block', fontWeight: 700, fontSize: 12.5, color: '#166534' }}>{fmtM(pr.openValue)}</span>
                            <span style={{ fontSize: 10.5, color: pr.daysWaiting >= 3 ? '#dc2626' : '#94a3b8', fontWeight: pr.daysWaiting >= 3 ? 600 : 400 }}>
                                {pr.daysWaiting === 0 ? 'today' : `${pr.daysWaiting}d waiting`}
                            </span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
const Dashboard = () => {
    const navigate      = useNavigate();
    const userId        = useCurrentUserId();
    const { auth }      = useAuth();
    const { getModuleStatuses } = useLookup();
    const role          = (auth?.role || '').toUpperCase().trim();

    // Admin-configurable per-role dashboard layout (Settings → Dashboard
    // Roles). Loaded once on mount; a role with zero rows in the DB (not
    // configured yet) falls back to the hardcoded ROLE_CONFIG/DEFAULT_CONFIG
    // below exactly as before this table existed — so nothing breaks for an
    // unconfigured role, and the dashboard never blocks on this fetch.
    const [roleConfigData, setRoleConfigData] = useState(null);
    useEffect(() => {
        fetch(`${variables.API_URL}dashboard/role-config`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setRoleConfigData(d); })
            .catch(() => { /* silent — falls back to the hardcoded config */ });
    }, []);

    const cfg = useMemo(() => {
        if (roleConfigData) {
            const roleMatch = (roleConfigData.roles || [])
                .find(r => (r.roleName || '').toUpperCase().trim() === role);
            if (roleMatch) {
                const rows = (roleConfigData.config || []).filter(c => c.roleId === roleMatch.roleId);
                if (rows.length > 0) {
                    return {
                        kpis:     rows.filter(c => c.itemType === 'KPI'     && c.isVisible).map(c => c.itemKey),
                        sections: rows.filter(c => c.itemType === 'SECTION' && c.isVisible).map(c => c.itemKey),
                    };
                }
            }
        }
        return ROLE_CONFIG[role] || DEFAULT_CONFIG;
    }, [roleConfigData, role]);
    const showKpi       = (key)     => cfg.kpis.includes(key);
    const showSection   = (key)     => cfg.sections.includes(key);

    // "Open" = every status except the excluded (terminal/consumed) ones —
    // computed at click time so it reflects whatever getModuleStatuses has
    // loaded by then, and always matches proj.sp_GetDashboard's definition.
    const openPrStatuses = () => getModuleStatuses('PR').map(s => s.statusCode).filter(c => !OPEN_PR_EXCLUDE.includes(c)).join(',');
    const openPoStatuses = () => getModuleStatuses('PO').map(s => s.statusCode).filter(c => !OPEN_PO_EXCLUDE.includes(c)).join(',');

    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [stockAlertCount, setStockAlertCount] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${variables.API_URL}dashboard?userId=${userId}`, { headers: authHeaders() });
            if (res.ok) setData(await res.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    // Accurate open-stock-alert count (per-item Min/Reorder/Max), same source as
    // the Stock Alerts page — the dashboard's own lowStock is a crude fixed threshold.
    useEffect(() => {
        fetch(`${variables.API_URL}stockbalance/alerts`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setStockAlertCount(Array.isArray(d) ? d.length : (d?.data?.length ?? 0)))
            .catch(() => {});
    }, []);

    if (loading) return (
        <div className="db-loading">
            <div className="db-spinner" />
            <span>Loading dashboard…</span>
        </div>
    );

    if (!data) return (
        <div className="db-loading"><span>Unable to load dashboard.</span></div>
    );

    const { kpis, jobSummary, myApprovals, procurement, inventory, financials, jobCosting } = data;

    // Job costing derived values
    const budget     = jobCosting?.totalOrderValue  || 0;
    const actual     = jobCosting?.totalActualCost  || 0;
    const variance   = budget - actual;
    const completion = budget > 0 ? Math.min(100, (actual / budget) * 100) : 0;

    // Financial bar max
    const finMax = Math.max(
        financials?.customerInvoices || 0,
        financials?.supplierInvoices || 0,
        financials?.receipts || 0,
        financials?.payments || 0,
        financials?.receivables || 0,
        financials?.payables || 0,
        1
    );

    // Time-of-day greeting
    const hr = new Date().getHours();
    const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const firstName = (auth?.fullName || auth?.username || '').split(' ')[0];

    return (
        <div className="db-page">

            {/* ── GREETING HERO ── */}
            <div className="db-hero">
                <div className="db-hero-left">
                    <div className="db-hero-greeting">{greeting},</div>
                    <div className="db-hero-name">{firstName || 'there'} 👋</div>
                    <div className="db-hero-date">{todayStr}</div>
                </div>
                <div className="db-hero-right">
                    <span className="db-hero-role">{auth?.role || 'USER'}</span>
                    <span className="db-hero-user">{auth?.fullName || auth?.username}</span>
                </div>
            </div>

            {/* ── TOP KPI STRIP ── */}
            <div className="db-kpi-strip">
                {[
                    { key: 'activeJobs',      label: 'Active Jobs',      icon: '🏗',  val: fmtN(kpis?.activeJobs),       accent: '#16a34a', soft: '#dcfce7', route: '/jobs',              filters: { jobStatusIds: '1' } },
                    { key: 'openPRs',         label: 'Open PRs',         icon: '📝',  val: fmtN(kpis?.openPRs),          accent: '#2563eb', soft: '#dbeafe', route: '/purchase-requests', filters: () => ({ status: openPrStatuses() }) },
                    { key: 'openPOs',         label: 'Open POs',         icon: '📦',  val: fmtN(kpis?.openPOs),          accent: '#059669', soft: '#d1fae5', route: '/purchase-orders',   filters: () => ({ status: openPoStatuses() }) },
                    { key: 'pendingApprovals',label: 'Pending Approvals',icon: '⏳',  val: fmtN(kpis?.pendingApprovals), accent: '#d97706', soft: '#fef3c7', route: '/my-approvals' },
                    { key: 'openInvoices',    label: 'Open Invoices',    icon: '🧾',  val: fmtN(kpis?.openInvoices),     accent: '#7c3aed', soft: '#ede9fe', route: '/invoices',          filters: { status: 'Confirmed' } },
                ].filter(k => showKpi(k.key)).map(k => (
                    <div key={k.key} className="db-kpi-card"
                         onClick={() => goFiltered(navigate, k.route, typeof k.filters === 'function' ? k.filters() : k.filters)}
                         style={{ '--kpi-accent': k.accent }}>
                        <div className="db-kpi-top">
                            <span className="db-kpi-icon" style={{ background: k.soft }}>{k.icon}</span>
                            <span className="db-kpi-arrow">→</span>
                        </div>
                        <div className="db-kpi-val" style={{ color: k.accent }}>{k.val}</div>
                        <div className="db-kpi-label">{k.label}</div>
                    </div>
                ))}
            </div>

            {/* ── MAIN GRID ── */}
            <div className="db-grid">

                {/* ── Today's Activity ── */}
                {showSection('todayActivity') && <TodayActivityWidget userId={userId} />}

                {/* ── My Draft Documents ── */}
                {showSection('myDrafts') && <MyDraftsWidget userId={userId} />}

                {/* ── Approved PRs awaiting PO (procurement work queue) ── */}
                {showSection('approvedPrs') && <ApprovedPrsWidget />}

                {/* ── Job Summary ── */}
                {showSection('jobSummary') && (
                <div className="db-card">
                    <div className="db-card-header"><span className="db-card-icon">🏗</span> JOB SUMMARY</div>
                    <div className="db-card-body">
                        {[
                            { label: 'Active Jobs',    val: jobSummary?.activeJobs,    color: '#16a34a', jobStatusId: 1 },
                            { label: 'Completed Jobs', val: jobSummary?.completedJobs, color: '#1e40af', jobStatusId: 4 },
                            { label: 'Cancelled Jobs', val: jobSummary?.cancelledJobs, color: '#dc2626', jobStatusId: 5 },
                            { label: 'Waiting Jobs',   val: jobSummary?.waitingJobs,   color: '#d97706', jobStatusId: 2 },
                            { label: 'Freezed Jobs',   val: jobSummary?.freezedJobs,   color: '#475569', jobStatusId: 3 },
                        ].filter(r => (r.val || 0) > 0 || r.label === 'Active Jobs').map(r => (
                            <div key={r.label} className="db-stat-row"
                                 onClick={() => goFiltered(navigate, '/jobs', { jobStatusIds: String(r.jobStatusId) })}>
                                <span className="db-stat-label">{r.label}</span>
                                <span className="db-stat-val" style={{ color: r.color }}>{fmtN(r.val || 0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {/* ── My Pending Approvals ── */}
                {showSection('myApprovals') && (
                <div className="db-card">
                    <div className="db-card-header"><span className="db-card-icon">⏳</span> MY PENDING APPROVALS</div>
                    <div className="db-card-body">
                        {!myApprovals || myApprovals.length === 0 ? (
                            <div className="db-empty">No pending approvals</div>
                        ) : myApprovals.map(a => (
                            <div key={a.transactionId} className="db-approval-row"
                                 onClick={() => { const r = MODULE_ROUTES[a.moduleCode]; if (r) navigate(r(a.documentId)); }}>
                                <div className="db-approval-doc">{a.documentNo}</div>
                                <div className="db-approval-amt">AED {Number(a.documentAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>
                                <div className={`db-approval-days ${a.daysPending > 2 ? 'db-days-red' : 'db-days-amber'}`}>
                                    {a.daysPending}d
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {/* ── Procurement Status ── */}
                {showSection('procurement') && (
                <div className="db-card">
                    <div className="db-card-header"><span className="db-card-icon">🛒</span> PROCUREMENT STATUS</div>
                    <div className="db-card-body">
                        {[
                            { label: 'Draft PR',    val: procurement?.draftPR,    color: '#94a3b8', route: '/purchase-requests', status: 'Draft' },
                            { label: 'Pending PR',  val: procurement?.pendingPR,  color: '#d97706', route: '/purchase-requests', status: 'PendingApproval' },
                            { label: 'Approved PR', val: procurement?.approvedPR, color: '#16a34a', route: '/purchase-requests', status: 'Approved' },
                            { label: 'Draft PO',    val: procurement?.draftPO,    color: '#94a3b8', route: '/purchase-orders',   status: 'Draft' },
                            { label: 'Sent PO',     val: procurement?.sentPO,     color: '#1e40af', route: '/purchase-orders',   status: 'Sent' },
                            { label: 'Approved PO', val: procurement?.approvedPO, color: '#16a34a', route: '/purchase-orders',   status: 'Approved' },
                        ].map(r => (
                            <div key={r.label} className="db-stat-row"
                                 onClick={() => goFiltered(navigate, r.route, { status: r.status })}>
                                <span className="db-stat-label">{r.label}</span>
                                <span className="db-stat-val" style={{ color: r.color }}>{fmtN(r.val || 0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {/* ── Inventory Status ── */}
                {showSection('inventory') && (
                <div className="db-card">
                    <div className="db-card-header">
                        <span className="db-card-icon">📦</span> INVENTORY STATUS
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--db-accent)', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => navigate('/inventory-alerts')}>Stock Alerts →</span>
                    </div>
                    <div className="db-card-body">
                        {/* Accurate open-stock-alert count → clickable badge */}
                        <div className="db-stat-row" style={{ cursor: 'pointer' }} onClick={() => navigate('/inventory-alerts')}
                             title="Items below min / reorder, out of stock, or overstocked">
                            <span className="db-stat-label">⚠ Stock Alerts</span>
                            <span className="db-stat-val" style={{
                                color: stockAlertCount > 0 ? '#dc2626' : '#16a34a',
                                background: stockAlertCount > 0 ? '#fee2e2' : '#dcfce7',
                                borderRadius: 12, padding: '1px 10px', fontWeight: 700,
                            }}>{stockAlertCount == null ? '…' : stockAlertCount}</span>
                        </div>
                        {[
                            { label: 'Total Items',     val: fmtN(inventory?.totalItems),  color: '#1e293b', route: null },
                            { label: 'Low Stock Items', val: fmtN(inventory?.lowStock),    color: '#d97706', route: '/inventory-alerts' },
                            { label: 'Out of Stock',    val: fmtN(inventory?.outOfStock),  color: '#dc2626', route: '/inventory-alerts' },
                            { label: 'Pending GRN',     val: fmtN(inventory?.pendingGRN),  color: '#7c3aed', route: null },
                            { label: 'Stock Value',     val: fmtM(inventory?.stockValue),  color: '#16a34a', route: null },
                        ].map(r => (
                            <div key={r.label} className="db-stat-row"
                                 style={r.route ? { cursor: 'pointer' } : undefined}
                                 onClick={r.route ? () => navigate(r.route) : undefined}>
                                <span className="db-stat-label">{r.label}</span>
                                <span className="db-stat-val" style={{ color: r.color }}>{r.val}</span>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {/* ── Financial Summary ── */}
                {showSection('financials') && (
                <div className="db-card db-card-wide">
                    <div className="db-card-header"><span className="db-card-icon">💰</span> FINANCIAL SUMMARY</div>
                    <div className="db-card-body">
                        <BarRow label="Customer Invoice" value={financials?.customerInvoices} max={finMax} color="#1e40af" />
                        <BarRow label="Supplier Invoice" value={financials?.supplierInvoices} max={finMax} color="#16a34a" />
                        <BarRow label="Receipts"         value={financials?.receipts}         max={finMax} color="#0891b2" />
                        <BarRow label="Payments"         value={financials?.payments}         max={finMax} color="#7c3aed" />
                        <BarRow label="Receivables"      value={financials?.receivables}      max={finMax} color="#f59e0b" />
                        <BarRow label="Payables"         value={financials?.payables}         max={finMax} color="#f97316" />
                    </div>
                </div>
                )}

                {/* ── Job Costing Summary ── */}
                {showSection('jobCosting') && (
                <div className="db-card db-card-wide">
                    <div className="db-card-header">
                        <span className="db-card-icon">📊</span> JOB COSTING SUMMARY
                    </div>
                    <div className="db-card-body db-costing-body">
                        <div className="db-costing-stats">
                            {[
                                { label: 'Budget Amount', val: fmtM(budget),   color: '#1e40af' },
                                { label: 'Actual Cost',   val: fmtM(actual),   color: actual > budget ? '#dc2626' : '#1e293b' },
                                { label: 'Variance',      val: fmtM(variance), color: variance >= 0 ? '#16a34a' : '#dc2626' },
                            ].map(r => (
                                <div key={r.label} className="db-stat-row">
                                    <span className="db-stat-label">{r.label}</span>
                                    <span className="db-stat-val" style={{ color: r.color, fontWeight: 700 }}>{r.val}</span>
                                </div>
                            ))}
                            <div style={{ marginTop: 10 }}>
                                <div className="db-stat-label" style={{ marginBottom: 6 }}>Completion</div>
                                <div className="db-completion-track">
                                    <div className="db-completion-fill" style={{ width: `${completion}%` }} />
                                </div>
                                <div className="db-stat-val" style={{ color: '#1e40af', marginTop: 4 }}>{completion.toFixed(1)}%</div>
                            </div>
                        </div>
                        <div className="db-costing-donut">
                            <Donut pct={completion} color="var(--db-accent)" size={110} />
                        </div>
                    </div>
                </div>
                )}

                {/* ── Most Over-Budget Jobs ── */}
                {showSection('jobCosting') && <OverBudgetWidget />}

            </div>
        </div>
    );
};

export default Dashboard;
