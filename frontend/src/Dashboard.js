import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from './Variable';
import { useCurrentUserId, useAuth } from './AuthContext';
import './Dashboard.css';

// ── Role-based section config ─────────────────────────────────────────────────
// kpis: which top KPI cards to show
// sections: which dashboard panels to render
const ROLE_CONFIG = {
    'ADMIN': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
        sections: ['jobSummary','myApprovals','procurement','inventory','financials','jobCosting'],
    },
    'DEPARTMENT HEAD': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
        sections: ['jobSummary','myApprovals','procurement','financials','jobCosting'],
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
        sections: ['myApprovals','procurement','inventory'],
    },
    'SR.PROJ.MANAGER': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
        sections: ['jobSummary','myApprovals','procurement','financials','jobCosting'],
    },
    'PROJ.MANAGER': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals'],
        sections: ['jobSummary','myApprovals','procurement','jobCosting'],
    },
    'SR.ENGINEER': {
        kpis:     ['activeJobs','openPRs','pendingApprovals'],
        sections: ['jobSummary','myApprovals','procurement','jobCosting'],
    },
    'ENGINEER': {
        kpis:     ['activeJobs','pendingApprovals'],
        sections: ['jobSummary','myApprovals','jobCosting'],
    },
    'ADMIN CORDINATOR': {
        kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals'],
        sections: ['jobSummary','myApprovals','procurement'],
    },
};

// Fallback — show everything if role not in map
const DEFAULT_CONFIG = {
    kpis:     ['activeJobs','openPRs','openPOs','pendingApprovals','openInvoices'],
    sections: ['jobSummary','myApprovals','procurement','inventory','financials','jobCosting'],
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
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#1e40af', cursor: 'pointer' }}
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

// ═════════════════════════════════════════════════════════════════════════════
const Dashboard = () => {
    const navigate      = useNavigate();
    const userId        = useCurrentUserId();
    const { auth }      = useAuth();
    const role          = (auth?.role || '').toUpperCase().trim();
    const cfg           = ROLE_CONFIG[role] || DEFAULT_CONFIG;
    const showKpi       = (key)     => cfg.kpis.includes(key);
    const showSection   = (key)     => cfg.sections.includes(key);

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

    return (
        <div className="db-page">

            {/* ── TOP KPI STRIP ── */}
            <div className="db-kpi-strip">
                {[
                    { key: 'activeJobs',      label: 'ACTIVE JOBS',      val: fmtN(kpis?.activeJobs),       color: '#166534', bg: '#dcfce7', route: '/jobs' },
                    { key: 'openPRs',         label: 'OPEN PRs',         val: fmtN(kpis?.openPRs),          color: '#1e40af', bg: '#dbeafe', route: '/purchase-requests' },
                    { key: 'openPOs',         label: 'OPEN POs',         val: fmtN(kpis?.openPOs),          color: '#065f46', bg: '#d1fae5', route: '/purchase-orders' },
                    { key: 'pendingApprovals',label: 'PENDING APPROVALS',val: fmtN(kpis?.pendingApprovals), color: '#b45309', bg: '#fef3c7', route: '/my-approvals' },
                    { key: 'openInvoices',    label: 'OPEN INVOICES',    val: fmtN(kpis?.openInvoices),     color: '#4c1d95', bg: '#ede9fe', route: '/invoices' },
                ].filter(k => showKpi(k.key)).map(k => (
                    <div key={k.key} className="db-kpi-card" style={{ background: k.bg }} onClick={() => navigate(k.route)}>
                        <div className="db-kpi-label">{k.label}</div>
                        <div className="db-kpi-val" style={{ color: k.color }}>{k.val}</div>
                    </div>
                ))}
            </div>

            {/* ── Role badge ── */}
            <div className="db-role-badge">
                <span className="db-role-label">👤 {auth?.fullName || auth?.username}</span>
                <span className="db-role-tag">{auth?.role || 'USER'}</span>
            </div>

            {/* ── MAIN GRID ── */}
            <div className="db-grid">

                {/* ── Job Summary ── */}
                {showSection('jobSummary') && (
                <div className="db-card">
                    <div className="db-card-header"><span className="db-card-icon">🏗</span> JOB SUMMARY</div>
                    <div className="db-card-body">
                        {[
                            { label: 'Active Jobs',    val: jobSummary?.activeJobs,    color: '#16a34a' },
                            { label: 'Completed Jobs', val: jobSummary?.completedJobs, color: '#1e40af' },
                            { label: 'Cancelled Jobs', val: jobSummary?.cancelledJobs, color: '#dc2626' },
                            { label: 'Waiting Jobs',   val: jobSummary?.waitingJobs,   color: '#d97706' },
                            { label: 'Freezed Jobs',   val: jobSummary?.freezedJobs,   color: '#475569' },
                        ].filter(r => (r.val || 0) > 0 || r.label === 'Active Jobs').map(r => (
                            <div key={r.label} className="db-stat-row" onClick={() => navigate('/jobs')}>
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
                            { label: 'Draft PR',    val: procurement?.draftPR,    color: '#94a3b8', route: '/purchase-requests' },
                            { label: 'Pending PR',  val: procurement?.pendingPR,  color: '#d97706', route: '/purchase-requests' },
                            { label: 'Approved PR', val: procurement?.approvedPR, color: '#16a34a', route: '/purchase-requests' },
                            { label: 'Draft PO',    val: procurement?.draftPO,    color: '#94a3b8', route: '/purchase-orders' },
                            { label: 'Sent PO',     val: procurement?.sentPO,     color: '#1e40af', route: '/purchase-orders' },
                            { label: 'Approved PO', val: procurement?.approvedPO, color: '#16a34a', route: '/purchase-orders' },
                        ].map(r => (
                            <div key={r.label} className="db-stat-row" onClick={() => navigate(r.route)}>
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
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
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
                            <Donut pct={completion} color="#1e40af" size={110} />
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
