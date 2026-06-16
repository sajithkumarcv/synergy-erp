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

    return (
        <div className="tab-section">
            <div className="tab-toolbar">
                <span className="tab-section-title">Financial Summary</span>
                <span className="fin-currency-badge">
                    {jobCode}{isForeign && <> · Rate {excRate} → {baseCode}</>}
                </span>
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
