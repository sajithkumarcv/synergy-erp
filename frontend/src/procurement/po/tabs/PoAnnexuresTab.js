import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { usePermission } from '../../../PermissionContext';

// ── Annexures tab ─────────────────────────────────────────────────────────────
// Multi-page typed specification documents attached to a PO. Each annexure is
// auto-lettered (A, B, C…) and carries a list of typeable rows + a set of PO
// lines it covers. Editable only while the PO is Draft / Rejected.
const PoAnnexuresTab = ({ po, onRefresh }) => {
    const currentUser   = useCurrentUser();
    const { canDo }     = usePermission();
    const canEditPo     = canDo('/purchase-orders', 'EDIT');
    const isDraft       = po.status === 'Draft' || po.status === 'Rejected';
    const canEdit       = canEditPo && isDraft;

    const [annexures, setAnnexures] = useState([]);   // [{ annexureId, annexureCode, title, notes, details:[], linkedLineIds:[] }]
    const [poLines,   setPoLines]   = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [err,       setErr]       = useState('');
    const [expanded,  setExpanded]  = useState({});   // annexureId → bool

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [annexRes, linesRes] = await Promise.all([
                fetch(`${variables.API_URL}purchaseorder/${po.poId}/annexures`, { headers: authHeaders() }),
                fetch(`${variables.API_URL}purchaseorder/lines/${po.poId}`,     { headers: authHeaders() }),
            ]);
            const annexData = await annexRes.json();
            const linesData = await linesRes.json();
            const detailsBy = {};
            (annexData.details || []).forEach(d => {
                (detailsBy[d.annexureId] ??= []).push(d);
            });
            const linksBy = {};
            (annexData.links || []).forEach(l => {
                (linksBy[l.annexureId] ??= []).push(l.poLineId);
            });
            const annexes = (annexData.headers || []).map(h => ({
                ...h,
                details:        (detailsBy[h.annexureId] || []).sort((a, b) => a.lineNum - b.lineNum),
                linkedLineIds:  linksBy[h.annexureId] || [],
            }));
            setAnnexures(annexes);
            setPoLines(Array.isArray(linesData) ? linesData : []);
        } catch {
            setErr('Failed to load annexures.');
        } finally {
            setLoading(false);
        }
    }, [po.poId]);

    useEffect(() => { load(); }, [load]);

    const addAnnexure = async () => {
        setErr('');
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/annexure/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ annexureId: 0, poId: po.poId, annexureCode: null, title: '', notes: '', sortOrder: 0, createdBy: currentUser }),
            });
            const d = await res.json();
            if (!res.ok) { setErr(d?.message || 'Failed to create annexure.'); return; }
            setExpanded(p => ({ ...p, [d.annexureId]: true }));
            load();
        } catch { setErr('Network error.'); }
    };

    const saveHeader = async (a, patch) => {
        const body = {
            annexureId:   a.annexureId,
            poId:         po.poId,
            annexureCode: patch.annexureCode ?? a.annexureCode,
            title:        patch.title        ?? a.title,
            notes:        patch.notes        ?? a.notes,
            sortOrder:    a.sortOrder || 0,
            modifiedBy:   currentUser,
        };
        await fetch(`${variables.API_URL}purchaseorder/annexure/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify(body),
        });
    };

    const deleteAnnexure = async (a) => {
        if (!window.confirm(`Delete Annexure-${a.annexureCode}?`)) return;
        await fetch(`${variables.API_URL}purchaseorder/annexure/${a.annexureId}?modifiedBy=${encodeURIComponent(currentUser)}`, {
            method: 'DELETE', headers: authHeaders(),
        });
        load();
    };

    const addRow = async (a) => {
        await fetch(`${variables.API_URL}purchaseorder/annexure/detail/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ annexureDetailId: 0, annexureId: a.annexureId, lineNum: 0, description: '', remarks: '', createdBy: currentUser }),
        });
        load();
    };

    const saveRow = async (row, patch) => {
        await fetch(`${variables.API_URL}purchaseorder/annexure/detail/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                annexureDetailId: row.annexureDetailId,
                annexureId:       row.annexureId,
                lineNum:          row.lineNum,
                description:      patch.description ?? row.description,
                remarks:          patch.remarks     ?? row.remarks,
                modifiedBy:       currentUser,
            }),
        });
    };

    const deleteRow = async (row) => {
        await fetch(`${variables.API_URL}purchaseorder/annexure/detail/${row.annexureDetailId}?modifiedBy=${encodeURIComponent(currentUser)}`, {
            method: 'DELETE', headers: authHeaders(),
        });
        load();
    };

    const toggleLink = async (a, poLineId) => {
        const next = a.linkedLineIds.includes(poLineId)
            ? a.linkedLineIds.filter(id => id !== poLineId)
            : [...a.linkedLineIds, poLineId];
        await fetch(`${variables.API_URL}purchaseorder/annexure/links/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ annexureId: a.annexureId, poLineIds: next.join(','), createdBy: currentUser }),
        });
        load();
    };

    if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading annexures…</div>;

    const th  = { padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
    const td  = { padding: '7px 10px', color: '#334155', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
    const inp = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, color: '#334155', fontFamily: 'inherit' };

    return (
        <div className="jd-tab-body">
            {err && <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>⚠ {err}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Annexures ({annexures.length})
                    {!isDraft && <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>— read-only (PO not in Draft)</span>}
                </div>
                {canEdit && (
                    <button onClick={addAnnexure}
                        style={{ padding: '6px 14px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        + Add Annexure
                    </button>
                )}
            </div>

            {annexures.length === 0 ? (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No annexures attached to this PO yet.
                    {canEdit && <> Click <strong>+ Add Annexure</strong> above to create the first one.</>}
                </div>
            ) : annexures.map(a => {
                const isOpen = expanded[a.annexureId] !== false;
                return (
                    <div key={a.annexureId} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 14, background: '#fff' }}>
                        {/* Header bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: isOpen ? '1px solid #f1f5f9' : 'none', background: '#f8fafc', borderRadius: '8px 8px 0 0' }}>
                            <button onClick={() => setExpanded(p => ({ ...p, [a.annexureId]: !isOpen }))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#64748b', padding: 0 }}>
                                {isOpen ? '▼' : '▶'}
                            </button>
                            <strong style={{ color: '#334155', fontSize: 13 }}>Annexure-{a.annexureCode}</strong>
                            {canEdit ? (
                                <input value={a.title || ''} placeholder="Title (e.g. Material Specification)"
                                    style={{ ...inp, flex: 1, fontWeight: 500 }}
                                    onChange={e => setAnnexures(prev => prev.map(x => x.annexureId === a.annexureId ? { ...x, title: e.target.value } : x))}
                                    onBlur={e => saveHeader(a, { title: e.target.value })} />
                            ) : (
                                <span style={{ flex: 1, color: '#64748b', fontSize: 12 }}>{a.title || <em>Untitled</em>}</span>
                            )}
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                                {a.details.length} row{a.details.length !== 1 ? 's' : ''} · {a.linkedLineIds.length} line{a.linkedLineIds.length !== 1 ? 's' : ''}
                            </span>
                            {canEdit && (
                                <button onClick={() => deleteAnnexure(a)}
                                    style={{ padding: '3px 8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                                    Delete
                                </button>
                            )}
                        </div>

                        {isOpen && (
                            <div style={{ padding: 14 }}>
                                {/* Notes */}
                                {(canEdit || a.notes) && (
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Notes / Scope summary</div>
                                        {canEdit ? (
                                            <textarea rows={2} value={a.notes || ''}
                                                style={{ ...inp, resize: 'vertical' }}
                                                onChange={e => setAnnexures(prev => prev.map(x => x.annexureId === a.annexureId ? { ...x, notes: e.target.value } : x))}
                                                onBlur={e => saveHeader(a, { notes: e.target.value })} />
                                        ) : (
                                            <div style={{ color: '#334155', fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{a.notes}</div>
                                        )}
                                    </div>
                                )}

                                {/* Detail rows */}
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Specification rows</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ ...th, width: 50, textAlign: 'center' }}>#</th>
                                            <th style={th}>Description</th>
                                            <th style={{ ...th, width: 200 }}>Remarks</th>
                                            {canEdit && <th style={{ ...th, width: 50 }} />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {a.details.length === 0 ? (
                                            <tr><td colSpan={canEdit ? 4 : 3} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 16 }}>No rows yet. {canEdit && <>Click <strong>+ Add Row</strong> below.</>}</td></tr>
                                        ) : a.details.map(row => (
                                            <tr key={row.annexureDetailId}>
                                                <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{row.lineNum}</td>
                                                <td style={td}>
                                                    {canEdit ? (
                                                        <textarea rows={2} value={row.description || ''}
                                                            style={{ ...inp, resize: 'vertical' }}
                                                            onChange={e => setAnnexures(prev => prev.map(x => x.annexureId === a.annexureId
                                                                ? { ...x, details: x.details.map(d => d.annexureDetailId === row.annexureDetailId ? { ...d, description: e.target.value } : d) }
                                                                : x))}
                                                            onBlur={e => saveRow(row, { description: e.target.value })} />
                                                    ) : (
                                                        <div style={{ whiteSpace: 'pre-wrap' }}>{row.description}</div>
                                                    )}
                                                </td>
                                                <td style={td}>
                                                    {canEdit ? (
                                                        <input value={row.remarks || ''}
                                                            style={inp}
                                                            onChange={e => setAnnexures(prev => prev.map(x => x.annexureId === a.annexureId
                                                                ? { ...x, details: x.details.map(d => d.annexureDetailId === row.annexureDetailId ? { ...d, remarks: e.target.value } : d) }
                                                                : x))}
                                                            onBlur={e => saveRow(row, { remarks: e.target.value })} />
                                                    ) : (row.remarks || '—')}
                                                </td>
                                                {canEdit && (
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <button onClick={() => deleteRow(row)}
                                                            style={{ padding: '2px 6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>
                                                            ✕
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {canEdit && (
                                    <button onClick={() => addRow(a)}
                                        style={{ padding: '4px 12px', border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b', borderRadius: 4, cursor: 'pointer', fontSize: 11, marginBottom: 14 }}>
                                        + Add Row
                                    </button>
                                )}

                                {/* Linked PO lines */}
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                                        PO lines covered by this annexure
                                    </div>
                                    {poLines.length === 0 ? (
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>No PO lines exist yet.</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {poLines.map(l => {
                                                const checked = a.linkedLineIds.includes(l.poLineId);
                                                return (
                                                    <label key={l.poLineId}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 5,
                                                            padding: '4px 10px', borderRadius: 4,
                                                            border: '1px solid ' + (checked ? '#94a3b8' : '#e2e8f0'),
                                                            background: checked ? '#f1f5f9' : '#fff',
                                                            fontSize: 11.5, color: '#334155',
                                                            cursor: canEdit ? 'pointer' : 'default',
                                                            opacity: canEdit ? 1 : 0.85,
                                                        }}>
                                                        <input type="checkbox" checked={checked} disabled={!canEdit}
                                                            onChange={() => toggleLink(a, l.poLineId)}
                                                            style={{ margin: 0 }} />
                                                        <span style={{ fontWeight: 600 }}>L{l.lineNum}</span>
                                                        <span style={{ color: '#64748b' }}>{(l.itemDesc || '').slice(0, 40)}{(l.itemDesc || '').length > 40 ? '…' : ''}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default PoAnnexuresTab;
