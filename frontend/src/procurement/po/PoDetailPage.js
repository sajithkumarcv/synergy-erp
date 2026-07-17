import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { PO_TABS, fmtDate, fmt, statusBadgeCfg, PRIORITY_CONFIG } from '../procurementConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import PoOverviewTab    from './tabs/PoOverviewTab';
import PoLinesTab       from './tabs/PoLinesTab';
import PoMetaTab        from './tabs/PoMetaTab';
import PoDocumentsTab   from './tabs/PoDocumentsTab';
import PoGrnTab         from './tabs/PoGrnTab';
import PoSrvTab         from './tabs/PoSrvTab';
import PoAnnexuresTab   from './tabs/PoAnnexuresTab';
import PoAmendmentsTab  from './tabs/PoAmendmentsTab';
import PoHoldLogTab     from './tabs/PoHoldLogTab';
import PoPrintModal         from './PoPrintModal';
import PoPrintModal2        from './PoPrintModal2';
import PoPrintModal3        from './PoPrintModal3';
import RevisePoModal        from './RevisePoModal';
import ApprovalHistoryTab   from '../../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../../approval/ApprovalStatusBanner';
import JobClosedBanner      from '../../jobs/JobClosedBanner';
import { InlineError }      from '../../common/InlineError';
import '../../jobs/JobDetail.css';
import '../Procurement.css';

const PoDetailPage = () => {
    const { poId }          = useParams();
    const navigate          = useNavigate();
    const [searchParams]    = useSearchParams();
    const currentUser       = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { canDo }           = usePermission();

    // Read query params set by PoForm after creation
    const initialPrId = searchParams.get('prId') || '';
    const initialTab  = searchParams.get('tab')  || 'overview';
    const autoPrint   = searchParams.get('print') === '1';

    const [po,         setPo]        = useState(null);
    const [loading,    setLoading]   = useState(true);
    const [error,      setError]     = useState(null);
    const [activeTab,  setActiveTab] = useState(initialTab);
    const [showPrint,  setShowPrint] = useState(false);  // 1 = format1, 2 = format2
    const [fmtOpen,    setFmtOpen]  = useState(false);
    const [approvalTx, setApprovalTx] = useState(null);
    const [revising,      setRevising]      = useState(false);
    const [actionError,   setActionError]   = useState('');
    const [showRevise,    setShowRevise]    = useState(false);
    const [showClose,       setShowClose]       = useState(false);
    const [closeReason,     setCloseReason]     = useState('');
    const [closing,         setClosing]         = useState(false);
    const [closeError,      setCloseError]      = useState('');
    const [closeLines,      setCloseLines]      = useState([]);   // lines with undelivered balance
    const [closeLinesLoading, setCloseLinesLoading] = useState(false);
    const [markingSent,   setMarkingSent]   = useState(false);
    const [showSent,      setShowSent]      = useState(false);
    const [showHold,      setShowHold]      = useState(false);
    const [holdReason,    setHoldReason]    = useState('');
    const [holdBusy,      setHoldBusy]      = useState(false);
    const [holdError,     setHoldError]     = useState('');
    const [showRelease,   setShowRelease]   = useState(false);
    const [releaseReason, setReleaseReason] = useState('');
    const [releaseBusy,   setReleaseBusy]   = useState(false);
    const [releaseError,  setReleaseError]  = useState('');
    // Light-weight line count used by the Approval tab pre-submit guard.
    // The full lines view still lives inside PoLinesTab; we just track a
    // count here so the approval submit knows whether to block.
    const [linesCount,  setLinesCount]  = useState(null);   // null = not loaded yet

    const loadPo = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}purchaseorder/${poId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setPo(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
        // Refresh the line count alongside the header so the approval pre-check
        // always sees the current state.
        fetch(`${variables.API_URL}purchaseorder/lines/${poId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setLinesCount(Array.isArray(d) ? d.length : 0))
            .catch(() => setLinesCount(null));
    }, [poId]);

    useEffect(() => { loadPo(); }, [loadPo]);
    useEffect(() => { if (po && autoPrint) setShowPrint(1); }, [po, autoPrint]);

    const renderTab = () => {
        if (!po) return null;
        switch (activeTab) {
            case 'overview':   return <PoOverviewTab  po={po} onRefresh={loadPo} />;
            case 'lines':      return <PoLinesTab     po={po} onRefresh={loadPo} initialPrId={initialPrId} />;
            case 'meta':       return <PoMetaTab      po={po} onRefresh={loadPo} />;
            case 'documents':  return <PoDocumentsTab po={po} />;
            case 'approval':   return (
                <ApprovalHistoryTab
                    moduleCode="PO"
                    documentId={po.poId}
                    documentNo={po.poNumber}
                    documentAmount={po.totalAmount}
                    currencyId={po.currencyId}
                    linesCount={linesCount}
                    lineLabel="PO line items"
                    onStatusChange={loadPo}
                    onTransactionLoad={setApprovalTx}
                />
            );
            case 'grns':       return <PoGrnTab        po={po} />;
            case 'srvs':       return <PoSrvTab        po={po} />;
            case 'amendments': return <PoAmendmentsTab po={po} />;
            case 'annexures':  return <PoAnnexuresTab  po={po} onRefresh={loadPo} />;
            case 'holdlog':    return <PoHoldLogTab    po={po} />;
            default:           return null;
        }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading purchase order…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/purchase-orders')}>← Back to Purchase Orders</button>
        </div>
    );
    if (!po) return null;

    const statusData = getStatusConfig('PO', po.status);
    const statusCfg  = statusBadgeCfg(statusData);
    const priCfg     = PRIORITY_CONFIG[po.priority] || {};
    const canRevise  = canDo('/purchase-orders', 'REVISE');
    // Draft POs can be printed as a preview (without company logo); other statuses
    // follow the status config / default rule.
    const isDraft    = po.status === 'Draft';
    const canPrint   = ((statusData?.canPrint ?? (po.status !== 'Draft')) || isDraft) && canDo('/purchase-orders', 'PRINT');

    const handleMarkSent = async () => {
        setMarkingSent(true); setActionError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/changestatus`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ id: po.poId, status: 'Sent', changedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setActionError(d?.message || 'Failed to mark as Sent.'); return; }
            setShowSent(false);
            loadPo();
        } catch (e) {
            setActionError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setMarkingSent(false); }
    };

    const handleRevise = () => setShowRevise(true);

    const handleClosePo = async () => {
        if (!closeReason.trim()) { setCloseError('A reason is required to close the PO.'); return; }
        setClosing(true); setCloseError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/changestatus`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ id: po.poId, status: 'Closed', changedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setCloseError(d?.message || `Close failed (HTTP ${res.status}).`); return; }
            setShowClose(false);
            setCloseReason('');
            setCloseLines([]);
            loadPo();
        } catch (e) {
            setCloseError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setClosing(false); }
    };

    const handleReviseSubmit = async (reason, password) => {
        setActionError('');
        setRevising(true);
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/${po.poId}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, revisedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { return d?.message || `Revision failed (HTTP ${res.status}).`; }
            setShowRevise(false);
            loadPo();
            return null;
        } catch (e) {
            return `Network error — ${e?.message || 'could not reach the server.'}`;
        } finally { setRevising(false); }
    };

    const handleHold = async () => {
        if (!holdReason.trim()) { setHoldError('A reason is required to place the PO on hold.'); return; }
        setHoldBusy(true); setHoldError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/${po.poId}/hold`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason: holdReason.trim(), holdBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setHoldError(d?.message || `Hold failed (HTTP ${res.status}).`); return; }
            setShowHold(false); setHoldReason('');
            loadPo();
        } catch (e) {
            setHoldError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setHoldBusy(false); }
    };

    const handleRelease = async () => {
        if (!releaseReason.trim()) { setReleaseError('A reason is required to release the hold.'); return; }
        setReleaseBusy(true); setReleaseError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/${po.poId}/release`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ releasedBy: currentUser, reason: releaseReason.trim() }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setReleaseError(d?.message || `Release failed (HTTP ${res.status}).`); return; }
            setShowRelease(false); setReleaseReason('');
            loadPo();
        } catch (e) {
            setReleaseError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setReleaseBusy(false); }
    };

    return (
        <div className="jd-page">
            {showPrint === 1 && <PoPrintModal  po={po} preview={isDraft} onClose={() => setShowPrint(false)} />}
            {showPrint === 2 && <PoPrintModal2 po={po} preview={isDraft} onClose={() => setShowPrint(false)} />}
            {showPrint === 3 && <PoPrintModal3 po={po} preview={isDraft} onClose={() => setShowPrint(false)} />}
            {showRevise && (
                <RevisePoModal
                    po={po}
                    onClose={() => setShowRevise(false)}
                    onSubmit={handleReviseSubmit}
                />
            )}
            {/* ── HOLD MODAL ── */}
            {/* ── MARK AS SENT MODAL ── */}
            {showSent && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '2px solid #93c5fd' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>📤 Mark PO as Sent</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18, background: '#f8fafc', borderRadius: 6, padding: '8px 12px', borderLeft: '3px solid #93c5fd' }}>
                            Mark <strong>{po.poNumber}</strong> as <strong>Sent</strong> to the vendor? This indicates the purchase order has been dispatched.
                        </div>
                        {actionError && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                                ⚠ {actionError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => { setShowSent(false); setActionError(''); }} disabled={markingSent}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={handleMarkSent} disabled={markingSent}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: markingSent ? .7 : 1 }}>
                                {markingSent ? 'Marking…' : '📤 Mark as Sent'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showHold && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '2px solid #fdba74' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>🔴 Place PO on Hold</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
                            <strong>{po.poNumber}</strong> — While on hold, no GRNs or service receipts can be raised against this PO.
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Hold Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={holdReason}
                                onChange={e => { setHoldReason(e.target.value); setHoldError(''); }}
                                placeholder="e.g. Supplier quality issue under investigation…"
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #fdba74', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                autoFocus
                            />
                        </div>
                        {holdError && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                                ⚠ {holdError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => { setShowHold(false); setHoldReason(''); setHoldError(''); }} disabled={holdBusy}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={handleHold} disabled={holdBusy}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#ea580c', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: holdBusy ? .7 : 1 }}>
                                {holdBusy ? 'Holding…' : '🔴 Place on Hold'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── RELEASE MODAL ── */}
            {showRelease && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '2px solid #86efac' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 6 }}>🟢 Release PO Hold</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14, background: '#f8fafc', borderRadius: 6, padding: '8px 12px', borderLeft: '3px solid #cbd5e1' }}>
                            <strong>{po.poNumber}</strong> — The PO will be restored to <strong>{po.statusBeforeHold || '—'}</strong> and GRNs / service receipts will be allowed again.
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Release Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={releaseReason}
                                onChange={e => { setReleaseReason(e.target.value); setReleaseError(''); }}
                                placeholder="e.g. Quality issue resolved, supplier confirmed…"
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                autoFocus
                            />
                        </div>
                        {releaseError && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                                ⚠ {releaseError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => { setShowRelease(false); setReleaseReason(''); setReleaseError(''); }} disabled={releaseBusy}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={handleRelease} disabled={releaseBusy}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: releaseBusy ? .7 : 1 }}>
                                {releaseBusy ? 'Releasing…' : '🟢 Release Hold'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showClose && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 500, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>🔒 Close Purchase Order</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                            <strong>{po.poNumber}</strong> — Closing will prevent any further GRNs against this PO.
                            Any undelivered balance will be released from committed budget.
                        </div>

                        {/* ── Undelivered lines warning ── */}
                        {closeLinesLoading && (
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Checking lines…</div>
                        )}
                        {!closeLinesLoading && closeLines.length > 0 && (
                            <div style={{ marginBottom: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '3px solid #f59e0b', borderRadius: 7, padding: '12px 14px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                                    ⚠ {closeLines.length} line{closeLines.length > 1 ? 's have' : ' has'} undelivered balance
                                </div>
                                <div style={{ fontSize: 11.5, color: '#78350f', marginBottom: 10 }}>
                                    Consider going to the <strong>Amendments</strong> tab and reducing each line's ordered qty
                                    to its received qty before closing — this keeps your budget committed figure accurate.
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                    <thead>
                                        <tr style={{ background: '#fef3c7' }}>
                                            <th style={{ textAlign: 'left',  padding: '4px 8px', color: '#92400e', fontWeight: 700 }}>Item</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px', color: '#92400e', fontWeight: 700 }}>Ordered</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px', color: '#92400e', fontWeight: 700 }}>Received</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px', color: '#dc2626', fontWeight: 700 }}>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {closeLines.map(l => (
                                            <tr key={l.poLineId} style={{ borderBottom: '1px solid #fef3c7' }}>
                                                <td style={{ padding: '4px 8px', color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {l.itemCode && <span style={{ color: '#64748b', marginRight: 4 }}>{l.itemCode}</span>}
                                                    {l.itemDesc}
                                                </td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#475569', fontFamily: 'Courier New' }}>{Number(l.orderedQty)}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#475569', fontFamily: 'Courier New' }}>{Number(l.receivedQty)}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#dc2626', fontWeight: 700, fontFamily: 'Courier New' }}>
                                                    {Number(l.orderedQty) - Number(l.receivedQty)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div style={{ marginTop: 8, fontSize: 11, color: '#92400e' }}>
                                    You can still close without amending — the undelivered balance will simply be written off.
                                </div>
                            </div>
                        )}
                        {!closeLinesLoading && closeLines.length === 0 && (
                            <div style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                                ✓ All lines are fully received — safe to close.
                            </div>
                        )}

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={closeReason}
                                onChange={e => { setCloseReason(e.target.value); setCloseError(''); }}
                                placeholder="e.g. Supplier unable to deliver remaining balance…"
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                autoFocus
                            />
                        </div>
                        {closeError && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                                ⚠ {closeError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            {closeLines.length > 0 ? (
                                <button
                                    onClick={() => { setShowClose(false); setActiveTab('amendments'); }}
                                    style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fef9c3', color: '#92400e', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                                    ✏️ Go to Amendments
                                </button>
                            ) : <span />}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setShowClose(false); setCloseReason(''); setCloseError(''); setCloseLines([]); }} disabled={closing}
                                    style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button onClick={handleClosePo} disabled={closing}
                                    style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#374151', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: closing ? .7 : 1 }}>
                                    {closing ? 'Closing…' : '🔒 Close PO'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/purchase-orders')}>← Purchase Orders</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{po.poNumber}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">
                            {po.vendorName || 'No Vendor'}
                        </span>
                        {po.priority && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project" style={{ background: priCfg.bg, color: priCfg.color, padding: '1px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                                {po.priority}
                            </span></>
                        )}
                        {po.linkedPRs && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">PR: {po.linkedPRs}</span></>
                        )}
                        {po.jobId && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">{po.jobId}{po.jobTitle ? ` — ${po.jobTitle}` : ''}</span></>
                        )}
                        {po.currencyShort && (
                            <><span className="jd-header-dot">·</span>
                            <span style={{
                                fontFamily: 'Courier New, monospace',
                                fontSize: 12, fontWeight: 700,
                                background: '#dbeafe', color: '#1e40af',
                                padding: '2px 9px', borderRadius: 4,
                                letterSpacing: '.05em', whiteSpace: 'nowrap',
                            }}>
                                {po.currencyShort}
                                {po.exchangeRate && Number(po.exchangeRate) !== 1 && (
                                    <span style={{ marginLeft: 5, fontWeight: 500, color: '#1e40af', opacity: .75 }}>
                                        @ {po.exchangeRate}
                                    </span>
                                )}
                            </span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label}
                    </span>

                    {po.status === 'Approved' && canDo('/purchase-orders', 'SEND') && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => { setActionError(''); setShowSent(true); }}
                            disabled={markingSent}
                            title="Mark this PO as sent to the vendor"
                            style={{ display: 'flex', alignItems: 'center', gap: 5,
                                     background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' }}
                        >
                            {markingSent ? '…' : '📤 Mark as Sent'}
                        </button>
                    )}
                    {/* Hold: shown on Approved/Sent/Partial */}
                    {['Approved','Sent','Partial'].includes(po.status) && canDo('/purchase-orders', 'HOLD') && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => { setHoldReason(''); setHoldError(''); setShowHold(true); }}
                            title="Place PO on hold — blocks GRNs and service receipts"
                            style={{ display: 'flex', alignItems: 'center', gap: 5,
                                     background: '#fff7ed', color: '#9a3412', borderColor: '#fdba74' }}
                        >
                            🔴 Hold PO
                        </button>
                    )}
                    {/* Release: shown only when on Hold */}
                    {po.status === 'Hold' && canDo('/purchase-orders', 'HOLD') && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => { setReleaseReason(''); setReleaseError(''); setShowRelease(true); }}
                            title="Release the hold and restore previous status"
                            style={{ display: 'flex', alignItems: 'center', gap: 5,
                                     background: '#dcfce7', color: '#166534', borderColor: '#86efac' }}
                        >
                            🟢 Release Hold
                        </button>
                    )}
                    {['Approved','Sent','Partial'].includes(po.status) && canRevise && (
                        <button
                            className="jd-stage-btn"
                            onClick={handleRevise}
                            disabled={revising}
                            title="Reset to Draft for editing — increments revision counter"
                            style={{ display: 'flex', alignItems: 'center', gap: 5,
                                     background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}
                        >
                            {revising ? '…' : '✏️ Revise PO'}
                        </button>
                    )}
                    {['Approved','Sent','Partial','Received'].includes(po.status) && canDo('/purchase-orders', 'CLOSE') && (
                        <button
                            className="jd-stage-btn"
                            onClick={async () => {
                                setCloseReason(''); setCloseError(''); setCloseLines([]);
                                setShowClose(true);
                                setCloseLinesLoading(true);
                                try {
                                    const r = await fetch(`${variables.API_URL}purchaseorder/lines/${po.poId}`, { headers: authHeaders() });
                                    const lines = await r.json();
                                    const undelivered = (Array.isArray(lines) ? lines : [])
                                        .filter(l => l.isActive !== false && l.lineStatus !== 'Cancelled' && l.lineStatus !== 'Closed'
                                                  && Number(l.orderedQty) > Number(l.receivedQty));
                                    setCloseLines(undelivered);
                                } catch { /* non-critical, ignore */ }
                                finally { setCloseLinesLoading(false); }
                            }}
                            title="Close PO — no further GRNs allowed, undelivered balance released"
                            style={{ display: 'flex', alignItems: 'center', gap: 5,
                                     background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' }}
                        >
                            🔒 Close PO
                        </button>
                    )}

                    {canPrint && (
                        <div style={{ position: 'relative', display: 'inline-flex' }}>
                            <button className="jd-stage-btn"
                                    onClick={() => { setShowPrint(1); setFmtOpen(false); }}
                                    style={{ borderRight: 'none', borderRadius: '6px 0 0 6px' }}>
                                🖨 Print PO
                            </button>
                            <button className="jd-stage-btn"
                                    onClick={() => setFmtOpen(o => !o)}
                                    style={{ borderRadius: '0 6px 6px 0', padding: '0 9px' }}>
                                ▾
                            </button>
                            {fmtOpen && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                                         onClick={() => setFmtOpen(false)} />
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, zIndex: 200,
                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                                        boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 190, marginTop: 4,
                                    }}>
                                        {[
                                            { fmt: 1, label: '📄 Format 1 — Classic'     },
                                            { fmt: 2, label: '📄 Format 2 — Modern'     },
                                            { fmt: 3, label: '📄 Format 3 — With T&C'   },
                                        ].map(({ fmt: f, label }) => (
                                            <div key={f}
                                                 onClick={() => { setShowPrint(f); setFmtOpen(false); }}
                                                 style={{ padding: '9px 16px', cursor: 'pointer', fontSize: 13,
                                                          color: '#1e293b', borderBottom: f !== 3 ? '1px solid #f1f5f9' : 'none' }}
                                                 onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                 onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                {label}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Date',           val: fmtDate(po.poDate),                cls: '' },
                    po.revision > 0 && { label: 'Revision', val: `Rev ${po.revision}`, cls: 'jd-kpi-mono' },
                    po.jobId       && { label: 'Job',          val: po.jobId,                          cls: 'jd-kpi-mono' },
                    po.linkedPRs   && { label: 'PR Refs',      val: po.linkedPRs,                      cls: 'jd-kpi-mono' },
                    po.vendorRef   && { label: 'Vendor Ref',   val: po.vendorRef,                      cls: 'jd-kpi-mono' },
                    po.paymentTermName && { label: 'Payment Terms',
                        // "Other" is just a bucket — show the actual terms the user typed.
                        val: (po.paymentTermCode === 'OTHER' && po.paymentTermsOther)
                            ? po.paymentTermsOther : po.paymentTermName,
                        cls: '' },
                    po.expenseCategoryName && { label: 'Budget Category',
                        val: po.expenseCategoryCode ? `${po.expenseCategoryCode} — ${po.expenseCategoryName}` : po.expenseCategoryName,
                        cls: '', hl: true },
                    po.deliveryDate    && { label: 'Delivery',      val: fmtDate(po.deliveryDate),      cls: '' },
                    { label: 'Total',          val: fmt(po.totalAmount),                cls: 'jd-kpi-blue' },
                    { label: 'Total w/ Tax',   val: fmt(po.linesTotalWithTax),          cls: 'jd-kpi-blue' },
                    // Live paid/balance (computed in sp_GetPO from approved PV allocations,
                    // tagged-PoId first then prorated SI-line fallback for legacy rows).
                    Number(po.paidAmount) > 0    && { label: 'Paid',    val: fmt(po.paidAmount),    cls: '' },
                    po.balanceAmount != null     && { label: 'Balance', val: fmt(po.balanceAmount),
                        cls: Number(po.balanceAmount) <= 0 ? 'jd-kpi-green' : 'jd-kpi-amber' },
                ].filter(Boolean).map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls}`}
                                 style={k.hl ? { background: '#fef3c7', color: '#92400e', padding: '2px 10px',
                                                 borderRadius: 8, fontWeight: 700, display: 'inline-block' } : undefined}>
                                {k.val}
                            </div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {PO_TABS
                    .filter(tab => !tab.approvedOnly || po.status !== 'Draft')
                    .map(tab => (
                        <button
                            key={tab.key}
                            className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <span className="jd-tab-icon">{tab.icon}</span>
                            {tab.label}
                            {tab.key === 'lines'     && po.lineCount     > 0 && <span className="jd-tab-badge">{po.lineCount}</span>}
                            {tab.key === 'documents' && po.documentCount > 0 && <span className="jd-tab-badge">{po.documentCount}</span>}
                        </button>
                    ))
                }
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                <InlineError error={actionError} onDismiss={() => setActionError('')} />

                {/* ── HOLD BANNER ── */}
                {po.status === 'Hold' && (
                    <div style={{
                        background: '#fff7ed', border: '1px solid #fdba74', borderLeft: '4px solid #ea580c',
                        borderRadius: 8, padding: '12px 18px', marginBottom: 14,
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}>
                        <span style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0 }}>🔴</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#9a3412', fontSize: 13, marginBottom: 2 }}>
                                This PO is currently on HOLD
                            </div>
                            <div style={{ fontSize: 12, color: '#c2410c' }}>
                                No GRNs or service receipts can be raised while the PO is on hold.
                                {po.holdReason && <span> &nbsp;·&nbsp; <em>Reason: {po.holdReason}</em></span>}
                            </div>
                            {(po.holdBy || po.holdDate) && (
                                <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>
                                    {po.holdBy && <>Placed by <strong>{po.holdBy}</strong></>}
                                    {po.holdDate && <> on {new Date(po.holdDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</>}
                                </div>
                            )}
                        </div>
                        {canDo('/purchase-orders', 'HOLD') && (
                            <button
                                onClick={() => { setReleaseReason(''); setReleaseError(''); setShowRelease(true); }}
                                style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 6, border: '1px solid #86efac',
                                         background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                🟢 Release
                            </button>
                        )}
                    </div>
                )}

                {activeTab !== 'approval' && (
                    <>
                        <JobClosedBanner jobId={po?.jobId} />
                        <ApprovalStatusBanner transaction={approvalTx} />
                    </>
                )}
                {renderTab()}
            </div>
        </div>
    );
};

export default PoDetailPage;
