import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import ConfirmModal from '../../../common/ConfirmModal';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt } from '../../inventoryConstants';
import { useFieldConfig } from '../../../FieldConfigContext';
import AmountInput from '../../../common/AmountInput';

// ── Issue line picker ─────────────────────────────────────────
// Fetches returnable lines from the source issue and lets the user pick one
const IssueLinePicker = ({ issueId, selectedLineId, onSelect }) => {
    const [lines,   setLines]   = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!issueId) return;
        setLoading(true);
        fetch(`${variables.API_URL}stockissuereturn/issue-lines/${issueId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(() => setLines([]))
            .finally(() => setLoading(false));
    }, [issueId]);

    if (loading) return <div style={{ fontSize: 12, color: '#64748b' }}>⏳ Loading issue lines…</div>;
    if (lines.length === 0) return (
        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
            No returnable lines available for this issue.
        </div>
    );

    const selected = lines.find(l => l.issueLineId === selectedLineId);

    if (selected) return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="prd-lf-input" style={{
                flex: 1, background: '#f0f9ff', color: '#1e40af', fontWeight: 500,
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            }}>
                ✓ <strong>{selected.itemCode}</strong> — {selected.itemName}
                <span style={{ marginLeft: 8, color: '#166534', fontSize: 10.5, fontWeight: 600 }}>
                    (avail: {fmt(selected.availableToReturnQty, 4)})
                </span>
            </span>
            <button type="button" onClick={() => onSelect(null)}
                style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
        </div>
    );

    return (
        <select className="prd-lf-input" value={selectedLineId || ''}
            onChange={e => {
                const id = Number(e.target.value);
                onSelect(id ? lines.find(l => l.issueLineId === id) : null);
            }}>
            <option value="">— Select issue line to return —</option>
            {lines.map(l => (
                <option key={l.issueLineId} value={l.issueLineId}>
                    {l.itemCode} — {l.itemName} (issued: {fmt(l.issuedQty, 4)}, avail: {fmt(l.availableToReturnQty, 4)})
                </option>
            ))}
        </select>
    );
};

// ── IssueReturnLinesTab ───────────────────────────────────────
const IssueReturnLinesTab = ({ issueReturn, lines, onRefresh }) => {
    const currentUser             = useCurrentUser();
    const { lookups, getStatusConfig } = useLookup();
    const { isReq } = useFieldConfig('STOCK_ISSUE_RETURN_LINE');
    const { uoms }                = lookups;

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('IRN', issueReturn.status)?.canEdit ?? (issueReturn.status === 'Draft')) && canDo('/inventory-issue-return', 'EDIT');

    const EMPTY_FORM = { issueLine: null, itemDesc: '', returnQty: '', uomId: '', unitCost: '', notes: '' };
    const [showForm,  setShowForm]  = useState(false);
    const [editLine,  setEditLine]  = useState(null);
    const [form,      setForm]      = useState(EMPTY_FORM);
    const [saving,    setSaving]    = useState(false);
    const [deleting,  setDeleting]  = useState(null);
    const [error,     setError]     = useState('');
    const [confirm,   setConfirm]   = useState(null);

    const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleIssueLineSelect = useCallback((line) => {
        if (!line) {
            setForm(f => ({ ...f, issueLine: null, itemDesc: '', unitCost: '' }));
            return;
        }
        setForm(f => ({
            ...f,
            issueLine: line,
            itemDesc:  '',
            unitCost:  String(line.unitCost ?? 0),
            uomId:     line.uomId ? String(line.uomId) : '',
        }));
    }, []);

    const openAdd = () => {
        setEditLine(null);
        setForm(EMPTY_FORM);
        setError('');
        setShowForm(true);
    };

    const openEdit = (l) => {
        setEditLine(l);
        setForm({
            issueLine: { issueLineId: l.issueLineId, itemCode: l.itemCode, itemName: l.itemName, availableToReturnQty: 0 },
            itemDesc:  l.itemDesc || '',
            returnQty: l.returnQty != null ? String(l.returnQty) : '',
            uomId:     l.uomId ? String(l.uomId) : '',
            unitCost:  l.unitCost != null ? String(l.unitCost) : '',
            notes:     l.notes || '',
        });
        setError('');
        setShowForm(true);
    };

    const lineTotal = () => (Number(form.returnQty) || 0) * (Number(form.unitCost) || 0);

    const save = () => {
        if (!form.issueLine)                                                                             { setError('Select an issue line.'); return; }
        if (!form.returnQty || isNaN(Number(form.returnQty)) || Number(form.returnQty) <= 0)             { setError('Valid return quantity required.'); return; }
        if (form.unitCost === '' || isNaN(Number(form.unitCost)) || Number(form.unitCost) < 0)           { setError('Valid unit cost required.'); return; }

        // Client-side qty guard for new lines
        if (!editLine && form.issueLine.availableToReturnQty != null) {
            if (Number(form.returnQty) > form.issueLine.availableToReturnQty) {
                setError(`Return qty exceeds available qty (${fmt(form.issueLine.availableToReturnQty, 4)}).`);
                return;
            }
        }

        setError(''); setSaving(true);
        fetch(`${variables.API_URL}stockissuereturn/line/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                returnLineId: editLine?.returnLineId || 0,
                returnId:     issueReturn.returnId,
                issueLineId:  form.issueLine.issueLineId,
                lineNum:      editLine?.lineNum || 0,
                itemDesc:     form.itemDesc.trim() || null,
                returnQty:    Number(form.returnQty),
                uomId:        form.uomId ? Number(form.uomId) : null,
                unitCost:     Number(form.unitCost),
                notes:        form.notes.trim() || null,
                createdBy:    currentUser,
                modifiedBy:   editLine ? currentUser : null,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving line.'); return; }
                setShowForm(false);
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const deleteLine = (lineId) => {
        setConfirm({
            title: 'Delete Line',
            message: 'Delete this return line?',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setDeleting(lineId);
                try {
                    const res = await fetch(
                        `${variables.API_URL}stockissuereturn/line/${lineId}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    if (!res.ok) { const d = await res.json(); setError(d?.message || 'Failed to delete line.'); return; }
                    onRefresh();
                } catch { setError('Network error. Please try again.'); }
                finally { setDeleting(null); }
            },
        });
    };

    const grandTotal = lines.reduce((s, l) => s + (l.returnQty || 0) * (l.unitCost || 0), 0);

    return (
        <div>
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {/* Info banner */}
            <div style={{
                padding: '8px 14px',
                background: issueReturn.costingType === 'EXC_COSTING' ? '#f3e8ff' : '#f0fdf4',
                borderBottom: `1px solid ${issueReturn.costingType === 'EXC_COSTING' ? '#d8b4fe' : '#86efac'}`,
                fontSize: 12,
                color: issueReturn.costingType === 'EXC_COSTING' ? '#6d28d9' : '#166534',
                display: 'flex', alignItems: 'center', gap: 6
            }}>
                <span>↩</span>
                <strong>Return</strong> — items are being returned to{' '}
                {issueReturn.costingType === 'EXC_COSTING'
                    ? 'job stock (EXC costing — QtyJobStock will increase)'
                    : 'general warehouse stock (INC costing — QtyOnHand will increase)'}
            </div>

            <div className="prd-lines-wrap">
                {/* Toolbar */}
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Return Lines ({lines.length})</span>
                    {canEdit && (
                        <button className="prd-add-btn" onClick={openAdd}>+ Add Line</button>
                    )}
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table className="prd-lines-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Item Code</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right' }}>Return Qty</th>
                                <th>UOM</th>
                                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                                <th>Notes</th>
                                {canEdit && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 9 : 8} className="prd-lines-empty">
                                        No return lines yet. {canEdit && 'Click "+ Add Line" to begin.'}
                                    </td>
                                </tr>
                            ) : lines.map(l => (
                                <tr key={l.returnLineId}>
                                    <td><span className="prd-line-num">{l.lineNum}</span></td>
                                    <td>
                                        <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                            {l.itemCode || '—'}
                                        </span>
                                    </td>
                                    <td style={{ color: '#1e293b' }}>{l.itemDesc || l.itemName || '—'}</td>
                                    <td className="prd-num-cell" style={{ color: '#7c3aed', fontWeight: 500 }}>{fmt(l.returnQty, 4)}</td>
                                    <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                    <td className="prd-num-cell">{fmt(l.unitCost)}</td>
                                    <td className="prd-num-cell" style={{ fontWeight: 600 }}>{fmt((l.returnQty || 0) * (l.unitCost || 0))}</td>
                                    <td style={{ fontSize: 11, color: '#64748b' }}>{l.notes || '—'}</td>
                                    {canEdit && (
                                        <td>
                                            <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                            <button className="prd-line-act prd-line-del"
                                                onClick={() => deleteLine(l.returnLineId)}
                                                disabled={deleting === l.returnLineId}>
                                                {deleting === l.returnLineId ? '…' : 'Del'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        {lines.length > 0 && (
                            <tfoot>
                                <tr style={{ background: '#f4f7fb', fontWeight: 600 }}>
                                    <td colSpan={6} style={{ textAlign: 'right', fontSize: 11, color: '#3a5070', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                                        Total Return Value
                                    </td>
                                    <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e3a5f' }}>{fmt(grandTotal)}</td>
                                    <td />{canEdit && <td />}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* ── Add / Edit inline form ── */}
                {showForm && (
                    <div className="prd-line-form">
                        <div className="prd-line-form-title">{editLine ? 'Edit Return Line' : 'Add Return Line'}</div>
                        {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}

                        {/* Row 1: Issue line picker */}
                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Issue Line {isReq('issueLineId') && <span className="req">*</span>}</label>
                                {editLine ? (
                                    // Can't change the issue line on edit — just show it
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span className="prd-lf-input" style={{ flex: 1, background: '#f8fafc', color: '#374151', fontSize: 13 }}>
                                            <strong>{form.issueLine?.itemCode}</strong> — {form.issueLine?.itemName}
                                        </span>
                                    </div>
                                ) : (
                                    <IssueLinePicker
                                        issueId={issueReturn.issueId}
                                        selectedLineId={form.issueLine?.issueLineId}
                                        onSelect={handleIssueLineSelect}
                                    />
                                )}
                            </div>
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Description Override</label>
                                <input className="prd-lf-input" type="text" name="itemDesc" value={form.itemDesc}
                                    onChange={handle} placeholder="Leave blank to use item name" />
                            </div>
                        </div>

                        {/* Row 2: Qty / UOM / Unit Cost / Line Total */}
                        <div className="prd-lf-row">
                            <div className="prd-lf-field">
                                <label>Return Qty {isReq('returnQty') && <span className="req">*</span>}</label>
                                <input className="prd-lf-input" type="number" name="returnQty"
                                    value={form.returnQty} onChange={handle} min="0" step="0.0001" />
                                {form.issueLine && !editLine && form.issueLine.availableToReturnQty != null && (
                                    <div style={{ fontSize: 10.5, marginTop: 3, color: '#64748b' }}>
                                        Max returnable: <strong style={{ color: '#166534' }}>{fmt(form.issueLine.availableToReturnQty, 4)}</strong>
                                    </div>
                                )}
                            </div>
                            <div className="prd-lf-field">
                                <label>UOM</label>
                                <input className="prd-lf-input"
                                    value={(uoms || []).find(u => String(u.id) === String(form.uomId))?.name || '—'}
                                    readOnly
                                    style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                    title="UOM follows the issue line and cannot be changed. To return part of an issued unit, enter a fraction (e.g. 0.5). Stock is converted to the item's base UOM at posting." />
                            </div>
                            <div className="prd-lf-field">
                                <label>Unit Cost {isReq('unitCost') && <span className="req">*</span>}</label>
                                <AmountInput className="prd-lf-input"
                                    value={form.unitCost} onChange={v => handle({ target: { name: 'unitCost', value: v } })} />
                            </div>
                            <div className="prd-lf-field">
                                <label>Line Total</label>
                                <div style={{ padding: '7px 0' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>
                                        {fmt(lineTotal())}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Notes */}
                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Notes</label>
                                <input className="prd-lf-input" type="text" name="notes" value={form.notes}
                                    onChange={handle} placeholder="Optional line note…" />
                            </div>
                        </div>

                        <div className="prd-lf-actions">
                            <button className="prd-lf-cancel" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                            <button className="prd-lf-save" onClick={save} disabled={saving}>
                                {saving ? 'Saving…' : editLine ? 'Update Line' : 'Add Line'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IssueReturnLinesTab;
