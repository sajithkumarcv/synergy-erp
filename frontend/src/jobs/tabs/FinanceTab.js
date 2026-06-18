import React from 'react';
import { fmt } from '../jobConstants';
import { useLookup } from '../../LookupContext';

// ─────────────────────────────────────────────────────────────
// FinanceTab  — read-only financial summary (role-protected)
// Figures are shown in the JOB's own currency (as stored). When the
// job currency differs from the base currency, each amount is also
// annotated with the base-currency equivalent (amount × job rate).
// ─────────────────────────────────────────────────────────────
const FinanceTab = ({ job }) => {
    const { baseCurrency, baseCurrencyCode } = useLookup();
    if (!job) return null;

    const excRate        = Number(job.jobExcRate        || 1);
    // orderValue and advance are stored in job currency.
    // totalInvoicing, totalPayments, totalCredit, totalExpenses are stored in BASE
    // (maintained by sp_RecalcJobInvoicing/Payments/Credits/Expenses). Divide by
    // excRate to convert to job currency so all figures are consistent for display.
    const orderValue     = Number(job.orderValue        || 0);
    const advance        = Number(job.jobAdvanceAmount  || 0);
    const totalInvoicing = Number(job.totalInvoicing    || 0) / excRate;
    const totalPayments  = Number(job.totalPayments     || 0) / excRate;
    const totalCredit    = Number(job.totalCredit       || 0) / excRate;
    const outstanding    = totalInvoicing - totalPayments - totalCredit;
    const unInvoiced     = orderValue - totalInvoicing;

    const jobCode  = job.currencyName || baseCurrencyCode || '';
    const baseCode = baseCurrencyCode || jobCode;
    // Foreign when the job currency differs from the configured base currency.
    const isForeign = baseCurrency != null && job.jobCurrencyId != null
        ? Number(job.jobCurrencyId) !== Number(baseCurrency.id)
        : excRate !== 1;
    const toBase = (v) => v * excRate;

    // Numeric values are job-currency amounts: formatted, and (when foreign)
    // annotated with the base-currency equivalent. Strings (e.g. "Margin %") render as-is.
    const Row = ({ label, value, bold, highlight }) => {
        const isNum = typeof value === 'number';
        return (
            <div className={`fin-row ${bold ? 'fin-row-bold' : ''} ${highlight ? 'fin-row-highlight' : ''}`}>
                <span className="fin-row-label">{label}</span>
                <span className="fin-row-value">
                    {isNum ? fmt(value) : value}
                    {isNum && isForeign && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>
                            ≈ {fmt(toBase(value))} {baseCode}
                        </span>
                    )}
                </span>
            </div>
        );
    };

    const Divider = () => <div className="fin-divider" />;

    // ── Semicircular collection gauge ─────────────────────────
    // The full arc represents the Invoiced amount, split into Received (green),
    // Credit (purple) and the still-Outstanding remainder (amber). The centre
    // shows the settled percentage = (Received + Credit) / Invoiced.
    const Gauge = ({ invoiced, received, credit }) => {
        const cx = 130, cy = 122, r = 96, sw = 20;
        const settled = received + credit;
        const pct   = invoiced > 0 ? Math.min(settled / invoiced, 1) : 0;
        const fRecv = invoiced > 0 ? Math.min(received / invoiced, 1) : 0;
        const fCred = invoiced > 0 ? Math.min((received + credit) / invoiced, 1) : 0;

        const polar = (ang) => {
            const a = ang * Math.PI / 180;
            return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
        };
        const arc = (f0, f1) => {
            if (f1 <= f0) return '';
            const p0 = polar(180 - f0 * 180), p1 = polar(180 - f1 * 180);
            return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
        };

        return (
            <svg viewBox="0 0 260 150" style={{ width: '100%', maxWidth: 280 }}>
                <path d={arc(0, 1)}        fill="none" stroke="#eef2f7" strokeWidth={sw} strokeLinecap="round" />
                <path d={arc(fCred, 1)}    fill="none" stroke="#dc2626" strokeWidth={sw} />
                <path d={arc(fRecv, fCred)} fill="none" stroke="#7c3aed" strokeWidth={sw} />
                <path d={arc(0, fRecv)}    fill="none" stroke="#16a34a" strokeWidth={sw} strokeLinecap="round" />
                <text x={cx} y={cy - 14} textAnchor="middle" fontSize="30" fontWeight="800" fill="#1e293b">
                    {(pct * 100).toFixed(0)}%
                </text>
                <text x={cx} y={cy + 6} textAnchor="middle" fontSize="11" fill="#94a3b8"
                      style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>collected</text>
            </svg>
        );
    };

    // The three coloured segments that make up the arc — they sum to Invoiced.
    const gaugeSegments = [
        { label: 'Received',    value: totalPayments, color: '#16a34a' },
        { label: 'Credit',      value: totalCredit,   color: '#7c3aed' },
        { label: 'Outstanding', value: outstanding,   color: '#dc2626' },
    ];

    return (
        <div className="tab-section">
            <div className="tab-toolbar">
                <span className="tab-section-title">Financial Summary</span>
                <span className="fin-currency-badge">
                    {jobCode}{isForeign && <> · Rate {excRate} → {baseCode}</>}
                </span>
            </div>

            {/* ── Collection gauge ── */}
            <div className="fin-card" style={{ marginBottom: 14, display: 'flex',
                alignItems: 'center', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Gauge invoiced={totalInvoicing} received={totalPayments} credit={totalCredit} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 200 }}>
                    {/* Invoiced = the whole arc (sum of the three segments below) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                        paddingBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b', flex: 1 }}>
                            Invoiced
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b',
                            fontFamily: 'monospace' }}>
                            {jobCode} {fmt(totalInvoicing)}
                        </span>
                    </div>
                    {gaugeSegments.map(g => (
                        <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 12, height: 12, borderRadius: 3,
                                background: g.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12.5, color: '#64748b', flex: 1 }}>{g.label}</span>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b',
                                fontFamily: 'monospace' }}>
                                {jobCode} {fmt(g.value)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="fin-layout">
                {/* ── Contract ── */}
                <div className="fin-card">
                    <div className="fin-card-title">📋 Contract</div>
                    <Row label="Order Value"       value={orderValue} bold />
                    <Row label="Advance Received"  value={advance} />
                    <Divider />
                    <Row label="Invoiced to Date"  value={totalInvoicing} />
                    <Row label="Un-Invoiced"       value={unInvoiced}
                         highlight={unInvoiced > 0} />
                </div>

                {/* ── Payments ── */}
                <div className="fin-card">
                    <div className="fin-card-title">💳 Payments</div>
                    <Row label="Total Invoiced"    value={totalInvoicing} />
                    <Row label="Total Received"    value={totalPayments} bold />
                    <Row label="Credit Notes"      value={totalCredit} />
                    <Divider />
                    <Row label="Outstanding"       value={outstanding}
                         highlight={outstanding > 0} bold />
                </div>

                {/* ── Profitability ── */}
                <div className="fin-card">
                    <div className="fin-card-title">📊 Profitability</div>
                    <Row label="Order Value"       value={orderValue} />
                    <Row label="Total Expenses"    value={Number(job.totalExpenses || 0) / excRate} />
                    <Divider />
                    <Row label="Gross Margin"
                         value={orderValue - Number(job.totalExpenses || 0) / excRate}
                         bold
                         highlight={orderValue - Number(job.totalExpenses || 0) / excRate < 0} />
                    <Row label="Margin %"
                         value={orderValue > 0
                            ? `${((orderValue - Number(job.totalExpenses || 0) / excRate) / orderValue * 100).toFixed(1)}%`
                            : '—'} />
                </div>
            </div>

            <div className="fin-note">
                <span>ℹ️</span>
                <span>
                    {isForeign
                        ? `Figures are in the job currency (${jobCode}); the ≈ value is the base-currency equivalent at rate ${excRate}.`
                        : 'Invoicing and payment data will reflect once transactions are posted.'}
                </span>
            </div>
        </div>
    );
};

export default FinanceTab;
