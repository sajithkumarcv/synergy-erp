import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../Variable';
import { fmt, fmtDate } from './jobConstants';
import { STATUS } from './jobConstants';
import useOwnerCompany from '../hooks/useOwnerCompany';
import { useLookup } from '../LookupContext';
import { CompanyHeaderBand } from '../components/print/PrintCompanyHeader';
import '../procurement/po/PoPrint.css';
import './JobReport.css';

// ── Helpers ────────────────────────────────────────────────────
const statusBadgeStyle = (s = '') => {
    const v = s.toLowerCase();
    if (v.includes('approv') || v.includes('confirm')) return { background: '#dcfce7', color: '#166534' };
    if (v.includes('cancel'))  return { background: '#fee2e2', color: '#991b1b' };
    if (v.includes('draft'))   return { background: '#fef3c7', color: '#92400e' };
    if (v.includes('hold'))    return { background: '#e0f2fe', color: '#0369a1' };
    return { background: '#f1f5f9', color: '#475569' };
};

const SpendBar = ({ actual, budget }) => {
    if (!budget || budget <= 0) return null;
    const pct  = Math.min((actual / budget) * 100, 100);
    const over = actual > budget;
    return (
        <div className="jr-spend-bar-track">
            <div className="jr-spend-bar-fill" style={{
                width: `${pct}%`,
                background: over ? '#dc2626' : pct > 80 ? '#f59e0b' : '#16a34a',
            }} />
        </div>
    );
};

// ── JobReportModal ─────────────────────────────────────────────
const JobReportModal = ({ jobId, onClose }) => {
    const { company, loading: coLoading } = useOwnerCompany();
    const { baseCurrency, baseCurrencyCode } = useLookup();
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        if (!jobId) return;
        setLoading(true); setError('');
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/report`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setData(d))
            .catch(e => setError(e.message || 'Failed to load report data.'))
            .finally(() => setLoading(false));
    }, [jobId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

    if (loading || error) {
        return (
            <div className="po-print-overlay" onClick={handleBackdrop}>
                <div className="po-print-toolbar">
                    <div className="po-print-toolbar-left">
                        <span className="po-print-title">📄 Job Report — {jobId}</span>
                    </div>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                </div>
                <div style={{ background: '#fff', borderRadius: 8, padding: '40px 60px',
                              textAlign: 'center', color: error ? '#dc2626' : '#64748b', fontSize: 13 }}>
                    {loading ? 'Loading report…' : `Error: ${error}`}
                </div>
            </div>
        );
    }

    const { header: job, budgetMeta, budgetLines = [], pos = [], invoices = [] } = data;
    if (!job) return null;

    const curr    = job.currencyName || '';
    const status  = STATUS[job.jobStatusId] || { label: job.jobStatusName || '', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };

    // Currency / exchange-rate helpers
    const excRate   = Number(job.jobExcRate || 1);
    const isForeign = baseCurrency != null && job.jobCurrencyId != null
        ? Number(job.jobCurrencyId) !== Number(baseCurrency.id)
        : excRate !== 1;
    const baseCode  = baseCurrencyCode || curr;
    const toBase    = (v) => v * excRate;

    // Financial KPIs (job currency)
    const orderValue    = Number(job.orderValue     || 0);
    const totalInvoiced = Number(job.totalInvoicing || 0);
    const totalPayments = Number(job.totalPayments  || 0);
    const totalCredit   = Number(job.totalCredit    || 0);
    const totalActual   = Number(job.totalActual || job.totalExpenses || 0);
    const outstanding   = totalInvoiced - totalPayments - totalCredit;
    const unInvoiced    = orderValue - totalInvoiced;
    const grossMargin   = orderValue - totalActual;

    // Budget totals (base currency)
    const totalBudget       = budgetLines.reduce((s, r) => s + (r.amountInBaseCurrency || 0), 0);
    const totalActualBudget = budgetLines.reduce((s, r) => s + (r.actualAmount         || 0), 0);
    const totalVariance     = totalBudget - totalActualBudget;

    const F = ({ label, value, mono }) => (
        <div className="jr-field">
            <span className="jr-field-label">{label}</span>
            <span className={`jr-field-val${mono ? ' mono' : ''}`}>{value || '—'}</span>
        </div>
    );

    // KPI box: shows amount in job currency; if foreign, shows base-currency equivalent below
    const Kpi = ({ label, amount, cls }) => (
        <div className="jr-kpi">
            <div className="jr-kpi-label">{label}</div>
            <div className={`jr-kpi-val${cls ? ' ' + cls : ''}`}>
                {curr && <span className="jr-kpi-ccy">{curr} </span>}
                {fmt(amount)}
            </div>
            {isForeign && (
                <div className="jr-kpi-base">
                    ≈ {baseCode} {fmt(toBase(amount))}
                </div>
            )}
        </div>
    );

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar (hidden on print) ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">📄 Job Report — {job.jobId}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close"  onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print"  onClick={() => window.print()}>
                        🖨 Print / Save as PDF
                    </button>
                </div>
            </div>

            {/* ── Printable document ── */}
            <div className="po-print-doc">

                {/* 1. Company header — fixed on print, repeats on every page */}
                <CompanyHeaderBand company={company} loading={coLoading} />

                {/* 2. Document title band */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                        <div className="pop-doc-type" style={{ margin: 0 }}>Job Report</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                            {job.jobDescription || job.projectName || ''}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{job.jobId}</div>
                        <div className="pop-doc-meta">
                            {fmtDate(job.jobDate)}<br />
                            {job.customerName}
                        </div>
                        <span className="pop-doc-status" style={{ background: status.bg, color: status.color }}>
                            {status.label}
                        </span>
                    </div>
                </div>

                {/* 3. Job identity grid */}
                <div className="jr-section">Job Details</div>
                <div className="jr-identity">
                    <F label="Job Type"          value={job.jobTypeName} />
                    <F label="Job Stage"         value={job.jobStageName} />
                    <F label="Job Date"          value={fmtDate(job.jobDate)} />
                    <F label="Expected Complete" value={fmtDate(job.jobExpectedCompleteDate)} />
                    <F label="LPO Ref"           value={job.lpoRef}       mono />
                    <F label="LPO Date"          value={fmtDate(job.lpoDate)} />
                    <F label="Contract Ref"      value={job.contractRef}  mono />
                    <F label="External Ref"      value={job.externalRef}  mono />
                    <F label="Currency"          value={curr + (job.jobExcRate && job.jobExcRate !== 1 ? ` @ ${job.jobExcRate}` : '')} />
                    {job.parentJobId && <F label="Parent Job" value={job.parentJobId} mono />}
                    <F label="Created By"        value={job.jobCreatedBy} />
                    <F label="Last Modified"     value={job.jobLastModifiedBy} />
                </div>

                {/* 4. Financial KPIs */}
                <div className="jr-section">
                    Financial Summary{curr ? ` (${curr})` : ''}
                </div>
                <div className="jr-kpis">
                    <Kpi label="Order Value"  amount={orderValue}    cls="blue"   />
                    <Kpi label="Invoiced"      amount={totalInvoiced} cls="amber"  />
                    <Kpi label="Payments"      amount={totalPayments} cls="green"  />
                    <Kpi label="Credits"       amount={totalCredit}               />
                    <Kpi label="Outstanding"   amount={outstanding}   cls={outstanding > 0 ? 'red' : 'green'} />
                    <Kpi label="Actual Cost"   amount={totalActual}   cls="purple" />
                </div>
                <div className="jr-kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 6 }}>
                    <Kpi label="Un-Invoiced"  amount={unInvoiced}  cls={unInvoiced > 0 ? 'amber' : ''} />
                    <Kpi label="Gross Margin" amount={grossMargin} cls={grossMargin < 0 ? 'red' : 'green'} />
                    {/* Margin % is a ratio — render as plain KPI without dual-currency */}
                    <div className="jr-kpi">
                        <div className="jr-kpi-label">Margin %</div>
                        <div className={`jr-kpi-val${grossMargin < 0 ? ' red' : ' green'}`}>
                            {orderValue > 0
                                ? `${((grossMargin / orderValue) * 100).toFixed(1)}%`
                                : '—'}
                        </div>
                        {isForeign && <div className="jr-kpi-base">&nbsp;</div>}
                    </div>
                </div>

                {/* 5. Budget vs Actual */}
                <div className="jr-section">
                    Budget vs Actual
                    {budgetMeta?.isApproved && (
                        <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700,
                                       background: '#dcfce7', color: '#166534',
                                       padding: '1px 7px', borderRadius: 10 }}>
                            APPROVED  Rev {budgetMeta.currentRvNo}
                        </span>
                    )}
                </div>
                {budgetLines.filter(r => r.budgetedAmount > 0 || r.actualAmount > 0).length === 0 ? (
                    <p className="jr-empty-msg">No budget lines set for this job.</p>
                ) : (
                    <>
                        <table className="jr-table">
                            <thead>
                                <tr>
                                    <th>Cost Category</th>
                                    <th className="r">Budget</th>
                                    <th className="r">Actual</th>
                                    <th className="r">Variance</th>
                                    <th style={{ width: 90 }}>Spend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {budgetLines.filter(r => r.budgetedAmount > 0 || r.actualAmount > 0).map(row => {
                                    const variance = (row.amountInBaseCurrency || 0) - (row.actualAmount || 0);
                                    const spendPct = row.budgetedAmount > 0
                                        ? Math.min(((row.actualAmount || 0) / row.budgetedAmount) * 100, 100).toFixed(0)
                                        : null;
                                    return (
                                        <tr key={row.costCategoryId}>
                                            <td>{row.categoryName}</td>
                                            <td className="r">{row.budgetedAmount > 0 ? fmt(row.amountInBaseCurrency || row.budgetedAmount) : '—'}</td>
                                            <td className="r">{row.actualAmount > 0 ? fmt(row.actualAmount) : '—'}</td>
                                            <td className="r">
                                                {row.budgetedAmount > 0
                                                    ? <span className={variance >= 0 ? 'jr-pos' : 'jr-neg'}>
                                                        {variance >= 0 ? '' : '−'}{fmt(Math.abs(variance))}
                                                      </span>
                                                    : '—'}
                                            </td>
                                            <td>
                                                {spendPct !== null ? (
                                                    <>
                                                        <div style={{ fontSize: 9, color: '#64748b', textAlign: 'right' }}>{spendPct}%</div>
                                                        <SpendBar actual={row.actualAmount || 0} budget={row.budgetedAmount} />
                                                    </>
                                                ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td>TOTAL</td>
                                    <td className="r">{fmt(totalBudget)}</td>
                                    <td className="r">{fmt(totalActualBudget)}</td>
                                    <td className="r" style={{ color: totalVariance >= 0 ? '#86efac' : '#fca5a5' }}>
                                        {totalVariance >= 0 ? '' : '−'}{fmt(Math.abs(totalVariance))}
                                    </td>
                                    <td>
                                        {totalBudget > 0 && (
                                            <>
                                                <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'right' }}>
                                                    {Math.min((totalActualBudget / totalBudget) * 100, 999).toFixed(1)}%
                                                </div>
                                                <SpendBar actual={totalActualBudget} budget={totalBudget} />
                                            </>
                                        )}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                        <p className="jr-table-note">
                            Actuals: Committed POs + Confirmed SRVs + Timesheets + Stock Issues + Approved Expenses
                        </p>
                    </>
                )}

                {/* 6. Purchase Orders */}
                <div className="jr-section">Purchase Orders</div>
                <table className="jr-table">
                    <thead>
                        <tr>
                            <th>PO Number</th>
                            <th>Date</th>
                            <th>Supplier</th>
                            <th>Status</th>
                            <th className="r">Amount</th>
                            <th>CCY</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pos.length === 0 ? (
                            <tr><td colSpan={6} className="jr-empty-cell">No purchase orders linked to this job.</td></tr>
                        ) : pos.map(po => (
                            <tr key={po.poId}>
                                <td className="mono">{po.poNumber}</td>
                                <td>{fmtDate(po.poDate)}</td>
                                <td>{po.supplierName || '—'}</td>
                                <td><span className="jr-badge" style={statusBadgeStyle(po.status)}>{po.status}</span></td>
                                <td className="r">{po.totalAmount != null ? fmt(po.totalAmount) : '—'}</td>
                                <td style={{ fontWeight: 600, color: '#475569' }}>{po.currencyShort || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    {pos.length > 0 && (() => {
                        const byCcy = pos.reduce((a, p) => {
                            const k = p.currencyShort || '—';
                            a[k] = (a[k] || 0) + Number(p.totalAmount || 0);
                            return a;
                        }, {});
                        return (
                            <tfoot>
                                {Object.entries(byCcy).map(([ccy, amt]) => (
                                    <tr key={ccy}>
                                        <td colSpan={4} style={{ textAlign: 'right' }}>Total ({ccy})</td>
                                        <td className="r">{fmt(amt)}</td>
                                        <td style={{ color: '#94a3b8' }}>{ccy}</td>
                                    </tr>
                                ))}
                            </tfoot>
                        );
                    })()}
                </table>

                {/* 8. Customer Invoices */}
                <div className="jr-section">Invoices Raised</div>
                <table className="jr-table">
                    <thead>
                        <tr>
                            <th>Invoice No</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th className="r">Amount</th>
                            <th>CCY</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.length === 0 ? (
                            <tr><td colSpan={5} className="jr-empty-cell">No invoices raised for this job.</td></tr>
                        ) : invoices.map(inv => (
                            <tr key={inv.invoiceId}>
                                <td className="mono">{inv.invoiceNo}</td>
                                <td>{fmtDate(inv.invoiceDate)}</td>
                                <td><span className="jr-badge" style={statusBadgeStyle(inv.status)}>{inv.status}</span></td>
                                <td className="r">{inv.totalAmount != null ? fmt(inv.totalAmount) : '—'}</td>
                                <td style={{ fontWeight: 600, color: '#475569' }}>{inv.currencyShort || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    {invoices.length > 0 && (() => {
                        const byCcy = invoices.reduce((a, inv) => {
                            const k = inv.currencyShort || '—';
                            a[k] = (a[k] || 0) + Number(inv.totalAmount || 0);
                            return a;
                        }, {});
                        return (
                            <tfoot>
                                {Object.entries(byCcy).map(([ccy, amt]) => (
                                    <tr key={ccy}>
                                        <td colSpan={3} style={{ textAlign: 'right' }}>Total ({ccy})</td>
                                        <td className="r">{fmt(amt)}</td>
                                        <td style={{ color: '#94a3b8' }}>{ccy}</td>
                                    </tr>
                                ))}
                            </tfoot>
                        );
                    })()}
                </table>

                {/* 9. Signature block */}
                <div className="jr-sigs">
                    <div>
                        <div className="jr-sig-label">Prepared by</div>
                        <div className="jr-sig-line" />
                        <div className="jr-sig-sub">{job.jobCreatedBy || 'Name / Signature'}</div>
                    </div>
                    <div>
                        <div className="jr-sig-label">Reviewed by</div>
                        <div className="jr-sig-line" />
                        <div className="jr-sig-sub">Name / Signature</div>
                    </div>
                    <div>
                        <div className="jr-sig-label">Authorised by</div>
                        <div className="jr-sig-line" />
                        <div className="jr-sig-sub">Name / Signature</div>
                    </div>
                </div>

                {/* Footer note — captured into @page @bottom-center via string-set in PoPrint.css */}
                <div className="pop-print-footer-note">
                    This is a computer-generated job report.
                    {company?.companyName && <> · {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>

            </div>{/* end po-print-doc */}
        </div>
    );
};

export default JobReportModal;
