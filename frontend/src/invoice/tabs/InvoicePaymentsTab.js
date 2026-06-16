import React from 'react';
import { useNavigate } from 'react-router-dom';
import { fmt, fmtDate } from '../invoiceConstants';

// ─────────────────────────────────────────────────────────────────────
// InvoicePaymentsTab — Receipt Voucher allocations applied to this invoice.
// AllocatedAmount is in the invoice's own currency.
// ─────────────────────────────────────────────────────────────────────
const RV_STATUS_CFG = {
    Draft:           { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    PendingApproval: { bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
    PendingL1:       { bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
    Approved:        { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    Rejected:        { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    Cancelled:       { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
};

const fmtAudit = (by, dt) => {
    if (!by) return '—';
    const d = dt ? new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return d ? `${by} · ${d}` : by;
};

const TH_L = { padding: '9px 10px', textAlign: 'left',  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#475569', whiteSpace: 'nowrap' };
const TH_R = { ...TH_L, textAlign: 'right' };
const TD   = { padding: '8px 10px', verticalAlign: 'middle' };
const TD_R = { ...TD, textAlign: 'right', fontFamily: 'Courier New, monospace', fontSize: 12 };

const InvoicePaymentsTab = ({ invoice, payments = [], loading = false, error = null }) => {
    const navigate = useNavigate();
    const ccy = invoice?.currencyShort || '';

    const totalPaid   = payments.reduce((s, p) => s + Number(p.allocatedAmount || 0), 0);
    const invoiceTot  = Number(invoice?.totalAmount || 0);
    const outstanding = invoiceTot - totalPaid;

    if (loading) return (
        <div className="jd-tab-body">
            <div style={{ padding: '20px 0', color: '#64748b', fontSize: 13 }}>Loading payments…</div>
        </div>
    );

    if (error) return (
        <div className="jd-tab-body">
            <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5 }}>
                ✕ {error}
            </div>
        </div>
    );

    return (
        <div className="jd-tab-body">
            {/* ── Balance strip (invoice currency) ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16,
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
                {[
                    { label: 'Invoice Total', val: invoiceTot,  color: '#1e293b' },
                    { label: 'Paid',          val: totalPaid,   color: '#166534' },
                    { label: 'Outstanding',   val: outstanding, color: outstanding > 0.005 ? '#b45309' : '#166534' },
                ].map((k, i) => (
                    <div key={k.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        {i > 0 && <span style={{ color: '#cbd5e1', marginRight: 8 }}>|</span>}
                        <span style={{ color: '#64748b' }}>{k.label}:</span>
                        <strong style={{ fontFamily: 'monospace', color: k.color }}>{fmt(k.val)}</strong>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{ccy}</span>
                    </div>
                ))}
            </div>

            {payments.length === 0 ? (
                <div className="jd-empty-card">
                    No payments or credits recorded yet. They appear here once an approved Receipt Voucher or Credit Note is allocated to this invoice.
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
                        color: '#374151', marginBottom: 8 }}>Payments &amp; Credits Applied</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={TH_L}>Ref No</th>
                                <th style={TH_L}>Date</th>
                                <th style={TH_L}>Mode</th>
                                <th style={TH_L}>Reference</th>
                                <th style={TH_L}>Bank</th>
                                <th style={TH_L}>Status</th>
                                <th style={TH_R}>Applied ({ccy})</th>
                                <th style={TH_L}>Recorded By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map((p, i) => {
                                const cfg = RV_STATUS_CFG[p.rvStatus] || RV_STATUS_CFG.Draft;
                                const isCN = p.sourceType === 'CN';
                                return (
                                    <tr key={`${p.sourceType}-${p.allocationId}`}
                                        style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600 }}>
                                            <span className="po-num-link" style={{ cursor: 'pointer', color: '#1d4ed8' }}
                                                onClick={() => navigate(isCN ? `/credit-notes/${p.rvId}` : `/receipt-vouchers/${p.rvId}`)}>
                                                {p.rvNumber}
                                            </span>
                                            {isCN && (
                                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#7c3aed',
                                                    background: '#f3e8ff', padding: '1px 6px', borderRadius: 10 }}>CREDIT</span>
                                            )}
                                        </td>
                                        <td style={TD}>{fmtDate(p.rvDate)}</td>
                                        <td style={TD}>{p.paymentMode || '—'}</td>
                                        <td style={TD}>
                                            {p.referenceNo || '—'}
                                            {p.referenceDate && (
                                                <span style={{ color: '#94a3b8', fontSize: 11 }}> · {fmtDate(p.referenceDate)}</span>
                                            )}
                                        </td>
                                        <td style={TD}>{p.bankName || '—'}</td>
                                        <td style={TD}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
                                                fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                                                background: cfg.bg, color: cfg.color }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot }} />
                                                {p.rvStatus}
                                            </span>
                                            {p.rvCurrency && p.rvCurrency !== ccy && (
                                                <span style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                                    RV in {p.rvCurrency} @ {Number(p.rvExchangeRate).toFixed(4)}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ ...TD_R, fontWeight: 700 }}>{fmt(p.allocatedAmount)}</td>
                                        <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(p.createdBy, p.createdDate)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                                <td style={TD} colSpan={6}>Total Paid</td>
                                <td style={{ ...TD_R, fontWeight: 700 }}>{fmt(totalPaid)}</td>
                                <td style={TD} />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
};

export default InvoicePaymentsTab;
