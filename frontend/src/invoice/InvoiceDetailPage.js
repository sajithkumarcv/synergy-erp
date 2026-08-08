import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import ConfirmModal from '../common/ConfirmModal';
import { useLookup } from '../LookupContext';
import { resolvePrintFormat } from '../print/printFormats';
import { usePermission } from '../PermissionContext';
import { INVOICE_TABS, fmt, fmtDate, statusBadgeCfg } from './invoiceConstants';
import InvoiceOverviewTab  from './tabs/InvoiceOverviewTab';
import InvoiceLinesTab     from './tabs/InvoiceLinesTab';
import InvoicePaymentsTab  from './tabs/InvoicePaymentsTab';
import InvoiceDocumentsTab from './tabs/InvoiceDocumentsTab';
import InvoicePrintModal   from './InvoicePrintModal';
import InvoicePrintModal2  from './InvoicePrintModal2';
import InvoicePrintModal3  from './InvoicePrintModal3';
import ApprovalHistoryTab   from '../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../approval/ApprovalStatusBanner';
import { InlineError } from '../common/InlineError';
import '../jobs/JobDetail.css';
import '../procurement/Procurement.css';

// ── Copy Invoice Modal ────────────────────────────────────────────────
const CopyInvoiceModal = ({ invoice, onClose, onCopied }) => {
    const currentUser  = useCurrentUser();
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
    const [dueDate,     setDueDate]     = useState('');
    const [copying,     setCopying]     = useState(false);
    const [err,         setErr]         = useState('');

    const doCopy = async () => {
        if (!invoiceDate) { setErr('Invoice date is required.'); return; }
        setCopying(true); setErr('');
        try {
            const res = await fetch(`${variables.API_URL}invoice/${invoice.invoiceId}/copy`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    newInvoiceDate: invoiceDate,
                    newDueDate:     dueDate || null,
                    createdBy:      currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setErr(d?.message || 'Copy failed.'); return; }
            onCopied(d.newInvoiceId, d.newInvoiceNo);
        } catch { setErr('Network error. Please try again.'); }
        finally { setCopying(false); }
    };

    const Row = ({ label, children }) => (
        <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                {label}
            </label>
            {children}
        </div>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: 'var(--primary,#2e5fa3)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>⎘ Copy Invoice</div>
                        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 2 }}>
                            Copying from <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fef9c3' }}>{invoice.invoiceNo}</span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                </div>

                <div style={{ padding: '18px 20px' }}>
                    {/* Source summary */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                        {[
                            ['Customer',   invoice.customerName],
                            ['Job',        invoice.jobId || '—'],
                            ['Currency',   invoice.currencyShort],
                            ['Lines',      invoice.lineCount ?? '—'],
                            ['LPO No',     invoice.lpoNo  || '—'],
                        ].map(([lbl, val]) => (
                            <div key={lbl}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.4px' }}>{lbl}</div>
                                <div style={{ fontSize: 12.5, color: '#1e3a5f', fontWeight: 500 }}>{val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Notice */}
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: '#92400e' }}>ℹ️ What gets copied: </span>
                        <span style={{ color: '#78350f' }}>All line descriptions, quantities &amp; VAT% are copied. <strong>All prices are reset to 0</strong> — fill them in after copying.</span>
                    </div>

                    {err && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 14 }}>
                            ❌ {err}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 14 }}>
                        <div style={{ flex: 1 }}>
                            <Row label={<>Invoice Date <span style={{ color: '#dc2626' }}>*</span></>}>
                                <input type="date" className="pf-input"
                                    value={invoiceDate}
                                    onChange={e => { setInvoiceDate(e.target.value); setErr(''); }} />
                            </Row>
                        </div>
                        <div style={{ flex: 1 }}>
                            <Row label="Due Date">
                                <input type="date" className="pf-input"
                                    value={dueDate}
                                    onChange={e => setDueDate(e.target.value)} />
                            </Row>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="pf-btn-sec" onClick={onClose} disabled={copying}>Cancel</button>
                    <button
                        onClick={doCopy}
                        disabled={copying || !invoiceDate}
                        style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600, background: copying ? '#64748b' : 'var(--primary,#2e5fa3)', color: '#fff', border: 'none', borderRadius: 6, cursor: copying ? 'not-allowed' : 'pointer', opacity: !invoiceDate ? .5 : 1 }}>
                        {copying ? 'Copying…' : '⎘ Copy Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Revise Modal ──────────────────────────────────────────────────────
const ReviseModal = ({ invoiceNo, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState('');

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason for the revision.'); return; }
        if (!password.trim()) { setErr('Please enter the authorisation password.'); return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        if (result !== true) {
            setErr(typeof result === 'string' ? result : 'Operation failed — wrong password or not authorised.');
            setBusy(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                <div style={{ background: '#b45309', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>✎ Revise Confirmed Invoice</div>
                        <div style={{ color: '#fde68a', fontSize: 12, marginTop: 2 }}>{invoiceNo}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ padding: '18px 20px' }}>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12.5, color: '#92400e' }}>
                        ⚠ This will revert the invoice to <strong>Draft</strong> (Rev {'{n+1}'}), cancel the current approval, and allow editing. All active receipts must be unregistered first.
                    </div>
                    {err && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 12 }}>
                            {err}
                        </div>
                    )}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                            Reason for Revision <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <textarea
                            className="pf-input pf-textarea"
                            rows={3}
                            placeholder="e.g. Wrong amount, line correction, customer request…"
                            value={reason}
                            onChange={e => { setReason(e.target.value); setErr(''); }}
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                            Authorisation Password <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                            type="password" autoComplete="new-password"
                            className="pf-input"
                            placeholder="Enter invoice revision password"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setErr(''); }}
                            onKeyDown={e => e.key === 'Enter' && !busy && submit()}
                        />
                    </div>
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                    <button
                        onClick={submit}
                        disabled={busy}
                        style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600, background: busy ? '#d97706' : '#b45309', color: '#fff', border: 'none', borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        {busy ? 'Verifying…' : 'Revise Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const InvoiceDetailPage = () => {
    const { id }              = useParams();
    const navigate            = useNavigate();
    const [searchParams]      = useSearchParams();
    const autoPrint           = searchParams.get('print') === '1';
    const currentUser         = useCurrentUser();
    const { getStatusConfig, getSetting } = useLookup();
    const printFmt = resolvePrintFormat('INV', getSetting);   // configured layout (Company Settings → Print Formats)
    const { canDo }           = usePermission();

    const [invoice,    setInvoice]   = useState(null);
    const [lines,      setLines]     = useState([]);
    const [payments,   setPayments]  = useState([]);
    const [payLoading, setPayLoading] = useState(false);
    const [payError,   setPayError]  = useState(null);
    const [loading,    setLoading]   = useState(true);
    const [error,      setError]     = useState(null);
    const [activeTab,  setActiveTab] = useState('overview');
    const [deleting,     setDeleting]   = useState(false);
    const [actionError,  setActionError]= useState('');
    const [revising,     setRevising]   = useState(false);
    const [showRevise,   setShowRevise] = useState(false);
    const [showCopy,     setShowCopy]   = useState(false);
    const [showPrint,  setShowPrint]  = useState(false);   // holds the active format number while the modal is open
    const [approvalTx, setApprovalTx] = useState(null);
    const [confirm,    setConfirm]    = useState(null);

    const loadInvoice = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}invoice/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setInvoice(d.invoice); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    const loadPayments = useCallback(() => {
        setPayLoading(true); setPayError(null);
        fetch(`${variables.API_URL}invoice/${id}/payments`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setPayments(Array.isArray(d) ? d : []))
            .catch(e => setPayError(e.message))
            .finally(() => setPayLoading(false));
    }, [id]);

    useEffect(() => { loadInvoice(); loadPayments(); }, [loadInvoice, loadPayments]);
    useEffect(() => { if (invoice && autoPrint) setShowPrint(printFmt); }, [invoice, autoPrint, printFmt]);

    const deleteInvoice = () => {
        setConfirm({
            title: 'Delete Invoice',
            message: 'Delete this invoice? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setActionError('');
                setDeleting(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}invoice/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setActionError(d?.message || `Delete failed (HTTP ${res.status}).`); return; }
                    navigate('/invoices');
                } catch (e) { setActionError(`Network error — ${e?.message || 'could not reach the server.'}`); }
                finally { setDeleting(false); }
            },
        });
    };

    // Returns true on success, or an error-message string on failure
    const handleRevise = async (reason, password) => {
        setRevising(true);
        try {
            const res = await fetch(`${variables.API_URL}invoice/${id}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, revisedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Revision failed.';
            setShowRevise(false);
            loadInvoice();
            loadPayments();
            return true;
        } catch { return 'Network error. Please try again.'; }
        finally { setRevising(false); }
    };

    // ── Render tab content ──────────────────────────────────────────
    const renderTab = () => {
        if (!invoice) return null;
        switch (activeTab) {
            case 'overview':  return <InvoiceOverviewTab  invoice={invoice} onRefresh={loadInvoice} />;
            case 'lines':     return <InvoiceLinesTab     invoice={invoice} lines={lines} onRefresh={loadInvoice} />;
            case 'payments':  return <InvoicePaymentsTab  invoice={invoice} payments={payments} loading={payLoading} error={payError} />;
            case 'documents': return <InvoiceDocumentsTab invoice={invoice} />;
            case 'approval':  return (
                <ApprovalHistoryTab
                    moduleCode="INV"
                    documentId={invoice.invoiceId}
                    documentNo={invoice.invoiceNo}
                    documentAmount={invoice.totalAmount}
                    currencyId={invoice.currencyId}
                    linesCount={lines.length}
                    lineLabel="invoice lines"
                    onStatusChange={loadInvoice}
                    onTransactionLoad={setApprovalTx}
                />
            );
            default:          return null;
        }
    };

    // ── Loading / Error states ──────────────────────────────────────
    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading invoice…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/invoices')}>
                ← Back to Invoices
            </button>
        </div>
    );
    if (!invoice) return null;

    const statusData = getStatusConfig('INV', invoice.status);
    const statusCfg  = statusBadgeCfg(statusData);
    const canDelete  = (statusData?.canDelete ?? invoice.status === 'Draft') && canDo('/invoices', 'DELETE');
    // Draft invoices can be printed as a preview (logo/address hidden + DRAFT
    // watermark + PREVIEW banners); other statuses follow the status config.
    const isDraft    = invoice.status === 'Draft';
    // Same fix as PoDetailPage's isNotApproved: an invoice sitting in
    // PendingApproval/PendingL1-3 was previously treated as "not draft" for
    // print purposes and printed as the final document with no watermark,
    // even though it hasn't cleared approval yet. Draft/Pending*/Rejected all
    // force the preview watermark now.
    const isNotApproved = isDraft || invoice.status?.startsWith('Pending') || invoice.status === 'Rejected';
    const canPrint   = ((statusData?.canPrint  ?? invoice.status !== 'Draft') || isNotApproved) && canDo('/invoices', 'PRINT');
    const canRevise  = invoice.status === 'Confirmed' && canDo('/invoices', 'REVISE');
    const canCopy    = canDo('/invoices', 'ADD');

    // Payment roll-up (invoice currency) for the KPI strip.
    const totalPaid   = payments.reduce((s, p) => s + Number(p.allocatedAmount || 0), 0);
    const outstanding = Number(invoice.totalAmount || 0) - totalPaid;

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/invoices')}>← Invoices</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{invoice.invoiceNo}</div>
                    <div className="jd-header-info">
                        {invoice.customerName && (
                            <span className="jd-header-customer">{invoice.customerName}</span>
                        )}
                        {invoice.jobId && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">Job: {invoice.jobId}</span></>
                        )}
                        {invoice.lpoNo && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">LPO: {invoice.lpoNo}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge"
                          style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label}
                    </span>

                    {canCopy && (
                        <button className="jd-stage-btn"
                                onClick={() => setShowCopy(true)}
                                title="Create a new Draft invoice with the same details — prices reset to 0"
                                style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}>
                            ⎘ Copy Invoice
                        </button>
                    )}

                    {canRevise && (
                        <button className="jd-stage-btn"
                                onClick={() => setShowRevise(true)}
                                disabled={revising}
                                title="Reset to Draft for editing — requires reason and password"
                                style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                            {revising ? '…' : '✏️ Revise Invoice'}
                        </button>
                    )}

                    {canPrint && (
                        // Print opens the configured layout (Company Settings → Print Formats)
                        <button className="jd-stage-btn"
                                onClick={() => setShowPrint(printFmt)}
                                style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                            🖨 Print
                        </button>
                    )}

                    {canDelete && (
                        <button className="jd-stage-btn" onClick={deleteInvoice} disabled={deleting}
                                style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            {deleting ? 'Deleting…' : '🗑 Delete'}
                        </button>
                    )}

                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Invoice Date', val: fmtDate(invoice.invoiceDate), cls: '' },
                    { label: 'Due Date',     val: fmtDate(invoice.dueDate),     cls: '' },
                    invoice.customerName && { label: 'Customer', val: invoice.customerName, cls: '' },
                    invoice.jobId        && { label: 'Job',      val: invoice.jobId,        cls: 'jd-kpi-mono' },
                    { label: 'Currency',  val: (
                        <span style={{
                            fontFamily: 'Courier New, monospace', fontSize: 13, fontWeight: 700,
                            background: '#dbeafe', color: '#1e40af',
                            padding: '2px 9px', borderRadius: 4, letterSpacing: '.05em',
                        }}>{invoice.currencyShort}</span>
                    ), cls: '' },
                    { label: 'Lines',     val: lines.length,                               cls: '' },
                    { label: 'Sub Total', val: fmt(invoice.subTotal),                       cls: '' },
                    { label: 'Tax',       val: fmt(invoice.taxAmount),                      cls: '' },
                    { label: 'Total',     val: `${invoice.currencyShort || ''} ${fmt(invoice.totalAmount)}`, cls: 'jd-kpi-blue' },
                    payments.length > 0 && { label: 'Paid',        val: fmt(totalPaid),   cls: 'jd-kpi-green' },
                    payments.length > 0 && { label: 'Outstanding', val: fmt(outstanding), cls: outstanding > 0.005 ? 'jd-kpi-amber' : 'jd-kpi-green' },
                ].filter(Boolean).map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {INVOICE_TABS.map(tab => {
                    let badge = null;
                    if (tab.badge) {
                        if (tab.key === 'lines'     && lines.length          > 0) badge = lines.length;
                        if (tab.key === 'payments'  && payments.length        > 0) badge = payments.length;
                        if (tab.key === 'documents' && invoice.documentCount > 0) badge = invoice.documentCount;
                    }
                    return (
                        <button key={tab.key}
                                className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                                onClick={() => setActiveTab(tab.key)}>
                            <span className="jd-tab-icon">{tab.icon}</span>
                            {tab.label}
                            {badge != null && (
                                <span className="jd-tab-badge">{badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                <InlineError error={actionError} onDismiss={() => setActionError('')} />
                {activeTab !== 'approval' && (
                    <ApprovalStatusBanner transaction={approvalTx} />
                )}
                {renderTab()}
            </div>

            {/* ── COPY MODAL ── */}
            {showCopy && (
                <CopyInvoiceModal
                    invoice={invoice}
                    onClose={() => setShowCopy(false)}
                    onCopied={(newId) => { setShowCopy(false); navigate(`/invoices/${newId}`); }}
                />
            )}

            {/* ── REVISE MODAL ── */}
            {showRevise && (
                <ReviseModal
                    invoiceNo={invoice.invoiceNo}
                    onClose={() => setShowRevise(false)}
                    onConfirm={handleRevise}
                />
            )}

            {/* ── PRINT MODAL ── */}
            {showPrint === 1 && (
                <InvoicePrintModal
                    invoice={invoice}
                    lines={lines}
                    preview={isNotApproved}
                    onClose={() => setShowPrint(false)}
                />
            )}
            {showPrint === 2 && (
                <InvoicePrintModal2
                    invoice={invoice}
                    lines={lines}
                    preview={isNotApproved}
                    onClose={() => setShowPrint(false)}
                />
            )}
            {showPrint === 3 && (
                <InvoicePrintModal3
                    invoice={invoice}
                    lines={lines}
                    preview={isNotApproved}
                    onClose={() => setShowPrint(false)}
                />
            )}
        </div>
    );
};

export default InvoiceDetailPage;
