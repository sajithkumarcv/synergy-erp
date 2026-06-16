import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';

/* ── Decision config ─────────────────────────────────────────── */
const DECISIONS = [
    {
        key:   'Accept',
        label: 'Accept',
        icon:  '✅',
        desc:  'All items received in full, no issues found.',
        bg:    '#f0fdf4', border: '#86efac', color: '#166534',
    },
    {
        key:   'ConditionalAccept',
        label: 'Conditional Accept',
        icon:  '⚠️',
        desc:  'Items accepted with minor observations or conditions noted.',
        bg:    '#fffbeb', border: '#fcd34d', color: '#92400e',
    },
    {
        key:   'Reject',
        label: 'Reject',
        icon:  '❌',
        desc:  'Items rejected — will not be received. Raise a Return to Vendor.',
        bg:    '#fef2f2', border: '#fca5a5', color: '#991b1b',
    },
];

/* ─────────────────────────────────────────────────────────────────
   GrnQcModal
   Intercepts Draft → Received status change.
   Steps:
     1. Checklist (mandatory items must be checked for Accept/ConditionalAccept)
     2. Overall remarks
     3. Usage Decision (Accept / Conditional Accept / Reject)  ← NEW
   On confirm:
     Accept / ConditionalAccept → save log, then call onConfirm() → status → Received
     Reject                     → save log, then call onReject()  → status stays Draft
   ───────────────────────────────────────────────────────────────── */
export const GrnQcModal = ({ grn, currentUser, onConfirm, onReject, onCancel }) => {
    const [items,         setItems]         = useState([]);
    const [remarks,       setRemarks]       = useState('');
    const [decision,      setDecision]      = useState('');
    const [decisionNotes, setDecisionNotes] = useState('');
    const [loading,       setLoading]       = useState(true);
    const [saving,        setSaving]        = useState(false);
    const [error,         setError]         = useState('');

    useEffect(() => {
        setLoading(true);
        fetch(`${variables.API_URL}grn/qc-items`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setItems((Array.isArray(d) ? d : []).map(i => ({ ...i, isChecked: false, notes: '' }))))
            .catch(() => setError('Failed to load QC checklist.'))
            .finally(() => setLoading(false));
    }, []);

    const toggle  = (idx) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, isChecked: !it.isChecked } : it));
    const setNote = (idx, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: val } : it));

    const requiredUnchecked = items.filter(i => i.isRequired && !i.isChecked);
    const needsChecklist    = decision === 'Accept' || decision === 'ConditionalAccept';
    const allRequiredDone   = !needsChecklist || requiredUnchecked.length === 0;
    const needsRejectReason = decision === 'Reject';
    const rejectReasonGiven = !needsRejectReason || decisionNotes.trim().length > 0;

    const canConfirm = decision !== '' && allRequiredDone && rejectReasonGiven;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setSaving(true); setError('');
        try {
            const saveRes = await fetch(`${variables.API_URL}grn/${grn.grnId}/qc-log`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    checkedBy:     currentUser,
                    remarks:       remarks.trim() || null,
                    items:         items.map(i => ({
                        qcItemId:  i.qcItemId,
                        itemName:  i.itemName,
                        isChecked: i.isChecked,
                        notes:     i.notes.trim() || null,
                    })),
                    decision,
                    decisionNotes: decisionNotes.trim() || null,
                    decisionBy:    currentUser,
                }),
            });
            const saveData = await saveRes.json().catch(() => ({}));
            if (!saveRes.ok) { setError(saveData?.message || 'Failed to save QC log.'); return; }

            if (decision === 'Reject') {
                onReject();
            } else {
                onConfirm();
            }
        } catch (e) {
            setError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setSaving(false); }
    };

    const decisionCfg = DECISIONS.find(d => d.key === decision);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 580, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,.22)' }}>

                {/* ── Header ── */}
                <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>
                        🔍 Quality & Verification Checklist
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        <strong>{grn.grnNumber}</strong> — Complete the checklist and record a Usage Decision.
                    </div>
                </div>

                {/* ── Scrollable body ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 32 }}>Loading checklist…</div>
                    ) : (
                        <>
                            {/* ── Section 1: Checklist ── */}
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                                1 · Inspection Checklist
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                {items.map((item, idx) => (
                                    <div key={item.qcItemId} style={{
                                        background: item.isChecked ? '#f0fdf4' : '#fafafa',
                                        border:     `1px solid ${item.isChecked ? '#86efac' : item.isRequired ? '#fca5a5' : '#e2e8f0'}`,
                                        borderRadius: 8, padding: '9px 13px', transition: 'all .12s',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                            <input type="checkbox" checked={item.isChecked} onChange={() => toggle(idx)}
                                                style={{ marginTop: 2, width: 15, height: 15, cursor: 'pointer', accentColor: '#16a34a', flexShrink: 0 }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                    {item.itemName}
                                                    {item.isRequired && (
                                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 8 }}>Required</span>
                                                    )}
                                                </div>
                                                {item.description && (
                                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.description}</div>
                                                )}
                                                {item.isChecked && (
                                                    <input type="text" value={item.notes} onChange={e => setNote(idx, e.target.value)}
                                                        placeholder="Notes (optional)…"
                                                        style={{ marginTop: 5, width: '100%', padding: '4px 8px', border: '1px solid #bbf7d0', borderRadius: 5, fontSize: 12, background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* ── Section 2: Overall remarks ── */}
                            <div style={{ marginTop: 16 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                    2 · Overall Remarks / Observations
                                </label>
                                <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
                                    placeholder="Any general observations about this receipt…"
                                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                            </div>

                            {/* ── Section 3: Usage Decision ── */}
                            <div style={{ marginTop: 18 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                                    3 · Usage Decision <span style={{ color: '#dc2626' }}>*</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    {DECISIONS.map(d => (
                                        <div key={d.key} onClick={() => { setDecision(d.key); if (d.key !== 'Reject') setDecisionNotes(''); }}
                                            style={{
                                                display: 'flex', alignItems: 'flex-start', gap: 12,
                                                padding: '11px 14px', borderRadius: 8, cursor: 'pointer',
                                                background: decision === d.key ? d.bg : '#fafafa',
                                                border:     `2px solid ${decision === d.key ? d.border : '#e2e8f0'}`,
                                                transition: 'all .12s',
                                            }}>
                                            <input type="radio" checked={decision === d.key} onChange={() => setDecision(d.key)}
                                                style={{ marginTop: 2, accentColor: d.color, flexShrink: 0 }} />
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: decision === d.key ? d.color : '#374151' }}>
                                                    {d.icon} {d.label}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{d.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Rejection reason — required when Reject selected */}
                                {decision === 'Reject' && (
                                    <div style={{ marginTop: 10 }}>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', display: 'block', marginBottom: 4 }}>
                                            Rejection Reason <span style={{ color: '#dc2626' }}>*</span>
                                        </label>
                                        <textarea rows={2} value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)}
                                            placeholder="Describe why the goods are being rejected…"
                                            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${decisionNotes.trim() ? '#fca5a5' : '#f87171'}`, borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fef2f2' }} />
                                    </div>
                                )}

                                {/* Conditions notes — optional for ConditionalAccept */}
                                {decision === 'ConditionalAccept' && (
                                    <div style={{ marginTop: 10 }}>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: '#92400e', display: 'block', marginBottom: 4 }}>
                                            Conditions / Observations (optional)
                                        </label>
                                        <textarea rows={2} value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)}
                                            placeholder="Describe any conditions under which these goods are accepted…"
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fffbeb' }} />
                                    </div>
                                )}
                            </div>

                            {/* ── Readiness banner ── */}
                            {decision && (
                                <div style={{ marginTop: 14, fontSize: 12, borderRadius: 6, padding: '8px 12px', fontWeight: 500,
                                    background: canConfirm ? (decision === 'Reject' ? '#fef2f2' : '#f0fdf4') : '#fffbeb',
                                    border:     `1px solid ${canConfirm ? (decision === 'Reject' ? '#fca5a5' : '#86efac') : '#fcd34d'}`,
                                    color:      canConfirm ? (decision === 'Reject' ? '#991b1b' : '#166534') : '#92400e',
                                }}>
                                    {decision === 'Reject' && canConfirm  && '❌ GRN will be logged as Rejected — status stays Draft. Raise a Return to Vendor for these items.'}
                                    {decision !== 'Reject' && canConfirm  && `✓ Ready — GRN will be marked as Received (${decisionCfg?.label}).`}
                                    {!canConfirm && needsChecklist        && requiredUnchecked.length > 0 && `⚠ ${requiredUnchecked.length} mandatory checklist item${requiredUnchecked.length > 1 ? 's' : ''} not yet checked.`}
                                    {!canConfirm && needsRejectReason     && !rejectReasonGiven && '⚠ Please enter a rejection reason.'}
                                </div>
                            )}
                        </>
                    )}

                    {error && (
                        <div style={{ marginTop: 10, color: '#dc2626', fontSize: 12, padding: '7px 12px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                            ⚠ {error}
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 8 }}>
                    <button onClick={onCancel} disabled={saving}
                        style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={handleConfirm} disabled={saving || loading || !canConfirm}
                        style={{
                            padding: '8px 22px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                            cursor:  canConfirm ? 'pointer' : 'not-allowed',
                            opacity: saving ? .7 : 1,
                            background: !canConfirm      ? '#94a3b8'
                                      : decision === 'Reject' ? '#dc2626'
                                      : decision === 'ConditionalAccept' ? '#d97706'
                                      : '#16a34a',
                            color: '#fff',
                        }}>
                        {saving ? 'Saving…'
                            : !decision      ? 'Select a Usage Decision'
                            : decision === 'Reject'            ? '❌ Record Rejection'
                            : decision === 'ConditionalAccept' ? '⚠️ Conditional Accept & Receive'
                            : '✅ Accept & Mark as Received'}
                    </button>
                </div>
            </div>
        </div>
    );
};


/* ─────────────────────────────────────────────────────────────────
   DECISION BADGE helper
   ───────────────────────────────────────────────────────────────── */
const DecisionBadge = ({ decision }) => {
    if (!decision) return null;
    const cfg = {
        Accept:            { label: 'Accepted',             bg: '#dcfce7', color: '#166534', icon: '✅' },
        ConditionalAccept: { label: 'Conditional Accept',   bg: '#fef9c3', color: '#854d0e', icon: '⚠️' },
        Reject:            { label: 'Rejected',             bg: '#fee2e2', color: '#991b1b', icon: '❌' },
    }[decision] || { label: decision, bg: '#f1f5f9', color: '#475569', icon: '—' };

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20,
            background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
            {cfg.icon} {cfg.label}
        </span>
    );
};


/* ─────────────────────────────────────────────────────────────────
   GrnQcLogTab
   Shows all QC log entries for this GRN, with Usage Decision badge.
   ───────────────────────────────────────────────────────────────── */
export const GrnQcLogTab = ({ grn }) => {
    const [data,    setData]    = useState({ headers: [], details: [] });
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        setLoading(true); setError('');
        fetch(`${variables.API_URL}grn/${grn.grnId}/qc-log`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => setData(d))
            .catch(() => setError('Failed to load QC log.'))
            .finally(() => setLoading(false));
    }, [grn.grnId]);

    if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading QC log…</div>;
    if (error)   return <div style={{ padding: 24, color: '#dc2626', fontSize: 13 }}>⚠ {error}</div>;

    if (data.headers.length === 0) return (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>
            No QC confirmation recorded for this GRN yet.
        </div>
    );

    return (
        <div style={{ padding: '20px 24px', maxWidth: 720 }}>
            {data.headers.map((h, hi) => {
                const hDetails = data.details.filter(d => d.qcLogId === h.qcLogId);
                const checked  = hDetails.filter(d => d.isChecked).length;
                const total    = hDetails.length;
                const dt       = h.checkedDate ? new Date(h.checkedDate) : null;
                const dateStr  = dt ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const timeStr  = dt ? dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

                const isReject    = h.decision === 'Reject';
                const headerBg    = isReject ? '#fef2f2' : '#f0fdf4';
                const headerBorder = isReject ? '#fecaca' : '#d1fae5';

                return (
                    <div key={h.qcLogId} style={{ marginBottom: hi < data.headers.length - 1 ? 24 : 0,
                        border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>

                        {/* ── Log header ── */}
                        <div style={{ background: headerBg, borderBottom: `1px solid ${headerBorder}`, padding: '12px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: isReject ? '#991b1b' : '#166534' }}>
                                            QC Record #{hi + 1}
                                        </span>
                                        <DecisionBadge decision={h.decision} />
                                    </div>
                                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                                        Inspected by: <strong>{h.checkedByName || h.checkedBy}</strong>
                                    </div>
                                    {h.remarks && (
                                        <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3, fontStyle: 'italic' }}>
                                            "{h.remarks}"
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 11, color: '#475569' }}>{dateStr}</div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{timeStr}</div>
                                    <div style={{ fontSize: 11, color: isReject ? '#dc2626' : '#16a34a', fontWeight: 600, marginTop: 2 }}>
                                        {checked}/{total} checked
                                    </div>
                                </div>
                            </div>

                            {/* Decision details strip */}
                            {(h.decisionNotes || h.decisionBy) && (
                                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6,
                                    background: isReject ? '#fef2f2' : '#fffbeb',
                                    border: `1px solid ${isReject ? '#fecaca' : '#fcd34d'}` }}>
                                    {h.decisionNotes && (
                                        <div style={{ fontSize: 12, color: isReject ? '#991b1b' : '#92400e', fontWeight: 500 }}>
                                            {isReject ? '❌ Rejection reason: ' : '⚠️ Conditions: '}
                                            <span style={{ fontWeight: 400, fontStyle: 'italic' }}>{h.decisionNotes}</span>
                                        </div>
                                    )}
                                    {h.decisionBy && (
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: h.decisionNotes ? 3 : 0 }}>
                                            Decision by: <strong>{h.decisionByName || h.decisionBy}</strong>
                                            {h.decisionDate && (
                                                <span style={{ color: '#94a3b8', marginLeft: 6 }}>
                                                    {new Date(h.decisionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Checklist items ── */}
                        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {hDetails.map(det => (
                                <div key={det.qcDetailId} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                    padding: '6px 10px', borderRadius: 6,
                                    background: det.isChecked ? '#f0fdf4' : '#fef2f2',
                                    border: `1px solid ${det.isChecked ? '#d1fae5' : '#fecaca'}`,
                                }}>
                                    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                                        {det.isChecked ? '✅' : '❌'}
                                    </span>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{det.itemName}</div>
                                        {det.notes && (
                                            <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>{det.notes}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
