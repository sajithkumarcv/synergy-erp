import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useCanDo } from '../../PermissionContext';
import { fmtDate, fmt } from '../procurementConstants';
import '../Procurement.css';

const PAGE_URL = '/grn-unregistration';

// ── Shared style tokens (same palette as the rest of the app) ────────────────
const th  = { padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
const td  = { padding: '7px 10px', color: '#334155', borderBottom: '1px solid #f1f5f9' };
const tdRight = { ...td, textAlign: 'right' };
const noteBox  = { padding: '10px 14px', border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 6, color: '#334155', fontSize: 12.5 };
const errBox   = { padding: '10px 14px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 6, color: '#475569', fontSize: 12.5 };
const sectionLabel = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 };

const GrnUnregistrationPage = () => {
    const currentUser = useCurrentUser();
    const canExecute  = useCanDo(PAGE_URL, 'EXECUTE');

    const [eligible,        setEligible]        = useState([]);
    const [loadingList,     setLoadingList]     = useState(true);
    const [selectedId,      setSelectedId]      = useState('');
    const [preview,         setPreview]         = useState(null);
    const [loadingPrev,     setLoadingPrev]     = useState(false);
    const [reason,          setReason]          = useState('');
    const [submitting,      setSubmitting]      = useState(false);
    const [clearingInvoice, setClearingInvoice] = useState(false);
    const [result,          setResult]          = useState(null);
    const [error,           setError]           = useState(null);

    const loadEligible = useCallback(() => {
        setLoadingList(true); setError(null);
        fetch(`${variables.API_URL}grnunregistration/eligible`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setEligible(d || []))
            .catch(e => setError('Failed to load eligible GRNs: ' + e.message))
            .finally(() => setLoadingList(false));
    }, []);

    useEffect(() => { loadEligible(); }, [loadEligible]);

    useEffect(() => {
        if (!selectedId) { setPreview(null); return; }
        setLoadingPrev(true); setPreview(null); setResult(null); setError(null);
        fetch(`${variables.API_URL}grnunregistration/${selectedId}/preview`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setPreview(d))
            .catch(e => setError('Failed to load GRN preview: ' + e.message))
            .finally(() => setLoadingPrev(false));
    }, [selectedId]);

    const handleExecute = async () => {
        if (!reason.trim() || reason.trim().length < 5) {
            setError('Please enter a reason (at least 5 characters).');
            return;
        }
        if (!window.confirm(
            `Unregister ${preview?.header?.grnNumber}?\n\n` +
            `This permanently cancels the GRN and reverses received quantities on ${preview?.header?.poNumber}.`
        )) return;
        setSubmitting(true); setError(null);
        try {
            const res = await fetch(`${variables.API_URL}grnunregistration/execute`, {
                method:  'POST', headers: authHeaders(),
                body: JSON.stringify({ grnId: parseInt(selectedId, 10), cancelledBy: currentUser, cancelReason: reason.trim() }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d?.message || 'Unregistration failed.'); return; }
            setResult({ grnNumber: preview.header.grnNumber, poNumber: preview.header.poNumber, newPoStatus: d.newPoStatus });
            setSelectedId(''); setPreview(null); setReason('');
            loadEligible();
        } finally { setSubmitting(false); }
    };

    const clearInvoice = async () => {
        if (!window.confirm(`Remove invoice reference "${h?.invoiceNo}" from ${h?.grnNumber}?`)) return;
        setClearingInvoice(true); setError(null);
        try {
            const res = await fetch(`${variables.API_URL}grn/${selectedId}/clear-invoice?modifiedBy=${encodeURIComponent(currentUser)}`,
                { method: 'POST', headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) { setError(d?.message || 'Failed to clear invoice reference.'); return; }
            const prev = await fetch(`${variables.API_URL}grnunregistration/${selectedId}/preview`, { headers: authHeaders() });
            setPreview(await prev.json());
        } catch { setError('Network error clearing invoice reference.'); }
        finally { setClearingInvoice(false); }
    };

    const h = preview?.header;
    const isBlocked = h?.alreadyCancelled || h?.hasInvoice || h?.wouldGoNegative || h?.hasPostGrnIssues;
    const canSubmit = canExecute && reason.trim().length >= 5 && !submitting && preview && !isBlocked;

    return (
        <div className="prd-page" style={{ maxWidth: '80%', width: '80%' }}>
            <div className="prd-page-header">
                <div className="prd-page-title">GRN Unregistration</div>
                <div className="prd-page-subtitle">
                    Physically cancel a GRN with no downstream stock movement. Once stock has been issued,
                    use Return to Vendor (RTV) or Stock Adjustment instead — the original GRN must be preserved
                    for audit and costing accuracy.
                </div>
            </div>

            {/* Success banner */}
            {result && (
                <div style={{ ...noteBox, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{result.grnNumber} unregistered</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                            {result.poNumber} status updated to <strong style={{ color: '#334155' }}>{result.newPoStatus}</strong>.
                            Received quantities have been reversed.
                        </div>
                    </div>
                    <button onClick={() => setResult(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>✕</button>
                </div>
            )}

            {/* ── Step 1: Select GRN ─────────────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
                <div style={sectionLabel}>Select GRN</div>
                {loadingList ? (
                    <div style={{ color: '#94a3b8', fontSize: 12.5 }}>Loading eligible GRNs…</div>
                ) : eligible.length === 0 ? (
                    <div style={noteBox}>
                        No GRNs are currently eligible for unregistration. Only <strong>Received</strong> GRNs without an invoice can be unregistered.
                    </div>
                ) : (
                    <select className="prd-input" style={{ maxWidth: 560 }}
                        value={selectedId}
                        onChange={e => { setSelectedId(e.target.value); setResult(null); setError(null); }}>
                        <option value="">— Select a GRN —</option>
                        {eligible.map(g => (
                            <option key={g.grnId} value={g.grnId}>
                                {g.grnNumber} · {g.supplierName || 'No Supplier'} · {fmtDate(g.grnDate)} · PO: {g.poNumber || '—'}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* ── Step 2: Preview ─────────────────────────────────────────────── */}
            {selectedId && (
                <div style={{ marginBottom: 20 }}>
                    <div style={sectionLabel}>Review impact</div>
                    {loadingPrev ? (
                        <div style={{ color: '#94a3b8', fontSize: 12.5 }}>Loading preview…</div>
                    ) : preview ? (
                        <>
                            {/* Blocking notes (neutral palette, no emoji) */}
                            {h?.alreadyCancelled && (
                                <div style={{ ...errBox, marginBottom: 12 }}>
                                    This GRN has already been cancelled and cannot be unregistered again.
                                </div>
                            )}
                            {h?.hasInvoice && (
                                <div style={{ ...errBox, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div>
                                        Invoice <strong style={{ color: '#334155' }}>{h.invoiceNo}</strong> is recorded against this GRN. Remove the invoice reference before unregistering.
                                    </div>
                                    {canExecute && (
                                        <button onClick={clearInvoice} disabled={clearingInvoice}
                                            style={{
                                                flexShrink: 0, padding: '5px 12px',
                                                border: '1px solid #cbd5e1', background: '#fff',
                                                color: '#334155', borderRadius: 5,
                                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                opacity: clearingInvoice ? 0.6 : 1,
                                            }}>
                                            {clearingInvoice ? 'Clearing…' : 'Clear Invoice Ref'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* GRN summary — same KPI strip layout as detail pages */}
                            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 16, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }}>
                                {[
                                    { label: 'GRN No.',  val: h?.grnNumber },
                                    { label: 'Date',     val: fmtDate(h?.grnDate) },
                                    { label: 'PO No.',   val: h?.poNumber },
                                    { label: 'Supplier', val: h?.supplierName },
                                    { label: 'Total',    val: fmt(h?.totalAmount) },
                                ].map(k => (
                                    <div key={k.label} style={{ minWidth: 110 }}>
                                        <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{k.val || '—'}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Guard: negative stock */}
                            {h?.wouldGoNegative && (
                                <div style={{ ...errBox, marginBottom: 12 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Stock balance insufficient — cannot unregister</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                                        Items from this GRN have already been consumed. Removing this receipt would make stock go negative.
                                    </div>
                                    {(preview.lines || []).filter(l => l.wouldGoNegative).map(l => (
                                        <div key={l.grnDetailId} style={{ fontSize: 12, paddingLeft: 12, marginBottom: 2 }}>
                                            <strong>{l.itemCode || l.itemDesc}</strong> — current balance: <strong>{l.currentStock}</strong>, qty to reverse: <strong>{l.acceptedQty}</strong>
                                        </div>
                                    ))}
                                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, color: '#475569' }}>
                                        Use a <strong>Stock Adjustment Entry</strong> with a negative quantity to record the correction while preserving the original receipt history.
                                    </div>
                                </div>
                            )}

                            {/* Guard: post-GRN issues */}
                            {h?.hasPostGrnIssues && (
                                <div style={{ ...errBox, marginBottom: 12 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Stock movement recorded after this GRN — cannot unregister</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                                        Stock has been issued for items in this GRN after its receipt date. Physically removing this receipt would invalidate the audit trail and average costing.
                                    </div>
                                    {(preview.lines || []).filter(l => l.firstPostIssue).map(l => (
                                        <div key={l.grnDetailId} style={{ fontSize: 12, paddingLeft: 12, marginBottom: 2 }}>
                                            <strong>{l.itemCode || l.itemDesc}</strong> — first issue after GRN: <strong>{l.firstPostIssue}</strong>
                                        </div>
                                    ))}
                                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, color: '#475569' }}>
                                        Use one of: <strong>Return to Vendor (RTV)</strong> to send goods back; <strong>Stock Adjustment</strong> for a quantity correction; or a <strong>Credit Note</strong> for a financial correction. The original GRN stays in history.
                                    </div>
                                </div>
                            )}

                            {/* PO impact note */}
                            {h?.poStatusAfter && (() => {
                                const parts = h.poStatusAfter.split(' > ');
                                return (
                                    <div style={{ ...noteBox, marginBottom: 12 }}>
                                        PO status will change: <strong style={{ color: '#334155' }}>{parts[0]}</strong>
                                        {parts[1] && <>{' → '}<strong style={{ color: '#334155' }}>{parts[1]}</strong></>}
                                    </div>
                                );
                            })()}

                            {/* Lines table — OvTable palette */}
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ ...th, width: 40 }}>#</th>
                                            <th style={th}>Item Code</th>
                                            <th style={th}>Description</th>
                                            <th style={{ ...th, textAlign: 'right' }}>Ordered</th>
                                            <th style={{ ...th, textAlign: 'right' }}>Received</th>
                                            <th style={{ ...th, textAlign: 'right' }}>Rejected</th>
                                            <th style={{ ...th, textAlign: 'right' }}>To reverse</th>
                                            <th style={th}>UOM</th>
                                            <th style={{ ...th, textAlign: 'right' }}>Unit Price</th>
                                            <th style={{ ...th, textAlign: 'right' }}>Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(preview.lines || []).map(l => (
                                            <tr key={l.grnDetailId}>
                                                <td style={td}>{l.lineNum}</td>
                                                <td style={td}>{l.itemCode || '—'}</td>
                                                <td style={td}>{l.itemDesc}</td>
                                                <td style={tdRight}>{fmt(l.orderedQty)}</td>
                                                <td style={{ ...tdRight, color: '#64748b' }}>{fmt(l.receivedQty)}</td>
                                                <td style={tdRight}>{l.rejectedQty > 0 ? fmt(l.rejectedQty) : '—'}</td>
                                                <td style={tdRight}>{fmt(l.acceptedQty)}</td>
                                                <td style={td}>{l.uomName || '—'}</td>
                                                <td style={tdRight}>{fmt(l.unitPrice)}</td>
                                                <td style={tdRight}>{fmt(l.lineTotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {/* ── Step 3: Reason + Confirm ─────────────────────────────────────── */}
            {preview && !h?.alreadyCancelled && (
                <div style={{ marginBottom: 20 }}>
                    <div style={sectionLabel}>Reason &amp; confirm</div>
                    {error && <div style={{ ...errBox, marginBottom: 12 }}>{error}</div>}

                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                        Cancellation reason <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea className="prd-input" rows={3}
                        style={{ maxWidth: 560, resize: 'vertical' }}
                        placeholder="Describe why this GRN is being unregistered…"
                        value={reason}
                        onChange={e => { setReason(e.target.value); setError(null); }} />
                    <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                        {reason.trim().length} characters (minimum 5)
                    </div>

                    <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button className="prd-btn prd-btn-ghost" disabled={submitting}
                            onClick={() => { setSelectedId(''); setPreview(null); setReason(''); setError(null); }}>
                            Cancel
                        </button>
                        {!canExecute ? (
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>You do not have permission to execute GRN unregistration.</div>
                        ) : (
                            <button onClick={handleExecute} disabled={!canSubmit}
                                title={
                                    h?.hasInvoice       ? 'Invoice exists — remove it first' :
                                    h?.wouldGoNegative  ? 'Stock would go negative — cannot unregister' :
                                    h?.hasPostGrnIssues ? 'Stock issued after GRN date — reverse issues first' : ''
                                }
                                style={{
                                    padding: '6px 16px',
                                    border: '1px solid #cbd5e1', background: '#fff',
                                    color: '#334155', borderRadius: 5,
                                    fontSize: 12, fontWeight: 600,
                                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                                    opacity: canSubmit ? 1 : 0.55,
                                }}>
                                {submitting ? 'Processing…' : 'Unregister GRN'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {error && !preview && (
                <div style={{ ...errBox, marginTop: 12 }}>{error}</div>
            )}
        </div>
    );
};

export default GrnUnregistrationPage;
