import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import './ProcurementDashboard.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtM = (n) => {
    if (n == null) return '—';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `AED ${(n / 1_000).toFixed(0)}K`;
    return `AED ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};
const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString();

// ── Donut (single value) ─────────────────────────────────────────────────────
const Donut = ({ pct, size = 132, center, cap }) => {
    const r = 55, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 132 132">
                <defs>
                    <linearGradient id="pa-donut-g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#0e7490" />
                    </linearGradient>
                </defs>
                <circle cx="66" cy="66" r={r} fill="none" stroke="#eef1f6" strokeWidth="13" />
                <circle cx="66" cy="66" r={r} fill="none" stroke="url(#pa-donut-g)" strokeWidth="13"
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 66 66)" />
            </svg>
            <div className="pa-donut-center">
                <div className="pa-donut-num">{center}</div>
                {cap && <div className="pa-donut-cap">{cap}</div>}
            </div>
        </div>
    );
};

// ── Stat card ────────────────────────────────────────────────────────────────
const Stat = ({ label, value, sub, icon, color, soft, onClick }) => (
    <div className={`pa-stat${onClick ? '' : ' no-link'}`} onClick={onClick}
         style={{ '--pa-c': color, '--pa-soft': soft }}>
        <div className="pa-stat-top">
            <span className="pa-stat-icon" style={{ background: soft }}>{icon}</span>
            {onClick && <span className="pa-stat-arrow">→</span>}
        </div>
        <div className="pa-stat-num">{value}</div>
        <div className="pa-stat-lbl">{label}</div>
        {sub && <div className="pa-stat-sub">{sub}</div>}
    </div>
);

// ═════════════════════════════════════════════════════════════════════════════
const ProcurementDashboard = () => {
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    useEffect(() => {
        fetch(`${variables.API_URL}dashboard/procurement-analytics`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setD)
            .catch(() => setD('err'));
    }, []);

    if (d === null) return <div className="pa"><div className="pa-loading"><div className="pa-spinner" /><span>Loading procurement analytics…</span></div></div>;
    if (d === 'err') return <div className="pa"><div className="pa-loading"><span>Unable to load procurement analytics.</span></div></div>;

    const ov = d.overview || {}, pay = d.payments || {};
    const topSup = d.topSuppliers || [];
    const eng = d.engagement || { totalSuppliers: 0, engagedSuppliers: 0 };
    const cats = d.categories || [];
    const trend = d.trend || [];

    const engagedPct  = eng.totalSuppliers > 0 ? Math.round((eng.engagedSuppliers / eng.totalSuppliers) * 100) : 0;
    const maxCat      = Math.max(...cats.map(c => c.supplierCount), 1);
    const totalCatSup = cats.reduce((s, c) => s + c.supplierCount, 0) || 1;
    const maxSpend    = Math.max(...topSup.map(s => s.spendBase), 1);
    const maxTrend    = Math.max(...trend.map(t => t.spendBase), 1);

    return (
        <div className="pa">
            {/* ── Hero ── */}
            <div className="pa-hero">
                <div>
                    <div className="pa-hero-eyebrow">Procurement</div>
                    <div className="pa-hero-title">E-Procurement Analytics</div>
                    <div className="pa-hero-sub">Suppliers, spend &amp; purchasing overview</div>
                </div>
                <div className="pa-hero-badge">
                    <div className="pa-hero-badge-num">{fmtN(pay.vendorCount)}</div>
                    <div className="pa-hero-badge-lbl">Active Vendors</div>
                </div>
            </div>

            {/* ── Overview ── */}
            <div className="pa-section">Overview</div>
            <div className="pa-stats">
                <Stat label="Total PR"             value={fmtN(ov.totalPR)}             icon="📝" color="#2563eb" soft="#eff6ff" onClick={() => navigate('/purchase-requests')} />
                <Stat label="Total PO"             value={fmtN(ov.totalPO)}             icon="📦" color="#059669" soft="#ecfdf5" onClick={() => navigate('/purchase-orders')} />
                <Stat label="PO Outstanding"       value={fmtN(ov.poOutstanding)}       icon="🕑" color="#d97706" soft="#fffbeb" onClick={() => navigate('/purchase-orders')} />
                <Stat label="Material Outstanding" value={fmtN(ov.materialOutstanding)} icon="📥" color="#7c3aed" soft="#f5f3ff" onClick={() => navigate('/grn')} />
            </div>

            {/* ── Payment Monitoring ── */}
            <div className="pa-section">Payment Monitoring</div>
            <div className="pa-stats">
                <Stat label="Total Invoices" value={fmtN(pay.totalInvoice)} icon="🧾" color="#4c1d95" soft="#f5f3ff" onClick={() => navigate('/supplier-invoice')} />
                <Stat label="Open Payments"  value={fmtN(pay.openPayment)}  icon="💳" color="#b45309" soft="#fffbeb" onClick={() => navigate('/payment-vouchers')} />
                <Stat label="Vendors"        value={fmtN(pay.vendorCount)}  icon="🏢" color="#0e7490" soft="#ecfeff" onClick={() => navigate('/suppliers')} />
            </div>

            {/* ── Top suppliers + category ── */}
            <div className="pa-grid2">
                <div className="pa-panel">
                    <div className="pa-panel-head">
                        <span className="pa-panel-icon">🏆</span>
                        <span className="pa-panel-title">Top Suppliers by Spend</span>
                    </div>
                    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                        <div className="pa-donut-wrap">
                            <Donut pct={engagedPct} center={fmtN(eng.totalSuppliers)} cap="suppliers" />
                            <div className="pa-donut-tag">{engagedPct}% engaged</div>
                            <div className="pa-donut-sub">{fmtN(eng.engagedSuppliers)} with orders</div>
                        </div>
                        <div className="pa-rank" style={{ flex: 1, minWidth: 0 }}>
                            {topSup.length === 0 && <div className="pa-empty">No supplier spend yet.</div>}
                            {topSup.map((s, i) => (
                                <div key={s.supplierName + i} className="pa-rank-row">
                                    <div className="pa-rank-head">
                                        <span className="pa-rank-name"><span className="pa-rank-idx">{i + 1}</span>{s.supplierName}</span>
                                        <span className="pa-rank-val">{fmtM(s.spendBase)}</span>
                                    </div>
                                    <div className="pa-track"><div className="pa-fill" style={{ width: `${Math.max(3, (s.spendBase / maxSpend) * 100)}%` }} /></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="pa-panel">
                    <div className="pa-panel-head">
                        <span className="pa-panel-icon">📊</span>
                        <span className="pa-panel-title">Suppliers by Category</span>
                        <span className="pa-panel-sub">{fmtN(totalCatSup)} total</span>
                    </div>
                    <div className="pa-rank">
                        {cats.length === 0 && <div className="pa-empty">No categories.</div>}
                        {cats.map((c, i) => (
                            <div key={c.categoryName + i} className="pa-rank-row">
                                <div className="pa-rank-head">
                                    <span className="pa-rank-name">{c.categoryName}</span>
                                    <span className="pa-rank-val">{fmtN(c.supplierCount)} · {Math.round((c.supplierCount / totalCatSup) * 100)}%</span>
                                </div>
                                <div className="pa-track"><div className="pa-fill" style={{ width: `${Math.max(3, (c.supplierCount / maxCat) * 100)}%` }} /></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Spending trend ── */}
            <div className="pa-panel">
                <div className="pa-panel-head">
                    <span className="pa-panel-icon">💰</span>
                    <span className="pa-panel-title">Total Spending</span>
                    <span className="pa-panel-sub">last 6 months · AED</span>
                </div>
                <div className="pa-chart">
                    <div className="pa-chart-grid"><div /><div /><div /><div /></div>
                    <div className="pa-cols">
                        {trend.map((t, i) => {
                            const h = maxTrend > 0 ? Math.max(4, (t.spendBase / maxTrend) * 150) : 4;
                            return (
                                <div key={i} className="pa-col">
                                    <div className="pa-col-val">{t.spendBase > 0 ? fmtM(t.spendBase) : ''}</div>
                                    <div className="pa-col-bar" style={{ height: h }} />
                                    <div className="pa-col-lbl">{t.monthLabel}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProcurementDashboard;
