import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { DOC_STATUS, RECEIPT_TYPE, fmt, fmtDate, fmtDateTime } from '../inventoryConstants';
import '../Inventory.css';
import { useFieldConfig } from '../../FieldConfigContext';
import { InlineError } from '../../common/InlineError';

// ── Helpers ────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
    const s = DOC_STATUS[status] || { label: status, color: '#64748b', bg: '#f1f5f9' };
    return <span className="inv-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
};

const TypeTag = ({ type }) => {
    const t = RECEIPT_TYPE[type] || { label: type, color: '#64748b', bg: '#f1f5f9' };
    return <span className="inv-type-tag" style={{ background: t.bg, color: t.color }}>{t.label}</span>;
};

// ── Item search input ──────────────────────────────────────────
const ItemSearch = ({ value, onSelect, placeholder = 'Search items…' }) => {
    const [q, setQ]         = useState(value?.itemName || '');
    const [results, setRes] = useState([]);
    const [open, setOpen]   = useState(false);
    const timer             = useRef(null);

    useEffect(() => { if (!value) setQ(''); }, [value]);

    const search = (text) => {
        setQ(text);
        clearTimeout(timer.current);
        if (!text.trim()) { setRes([]); setOpen(false); return; }
        timer.current = setTimeout(() => {
            fetch(`${variables.API_URL}item/search?searchText=${encodeURIComponent(text)}&pageSize=15`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => { setRes(d.data || []); setOpen(true); })
                .catch(() => {});
        }, 280);
    };

    const pick = (item) => {
        setQ(`${item.itemCode} — ${item.itemName}`);
        setOpen(false);
        onSelect(item);
    };

    if (value) return (
        <div className="invd-item-selected">
            <span style={{ fontWeight: 700, color: '#1e40af' }}>{value.itemCode}</span>
            <span style={{ color: '#374151' }}>{value.itemName}</span>
            <button className="invd-item-clear" onClick={() => onSelect(null)}>×</button>
        </div>
    );

    return (
        <div className="invd-item-search">
            <input className="invd-input" placeholder={placeholder} value={q} onChange={e => search(e.target.value)}
                onFocus={() => q && results.length && setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 200)} />
            {open && results.length > 0 && (
                <div className="invd-item-dropdown">
                    {results.map(it => (
                        <div key={it.itemId} className="invd-item-opt" onMouseDown={() => pick(it)}>
                            <span className="invd-item-opt-code">{it.itemCode}</span>
                            <span>{it.itemName}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Lines Tab ──────────────────────────────────────────────────
const LinesTab = ({ receipt, lines, onRefresh, currentUser }) => {
    const isConfirmed = receipt.status === 'Confirmed';
    const { isReq } = useFieldConfig('STOCK_RECEIPT_LINE');
    const [saving,  setSaving]  = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [form, setForm]       = useState({ item: null, itemDesc: '', qty: '', unitCost: '', uomId: '', uomName: '', isJobStock: receipt.receiptType === 'JOB', jobId: receipt.jobId || '', jobIsStockJob: null, notes: '' });
    const [formErr, setFormErr] = useState({});
    const [editLine, setEditLine] = useState(null);  // line being edited

    // Job live-search (excludes Closed/Cancelled/Freezed jobs)
    const [jobSearch,  setJobSearch]  = useState('');
    const [jobResults, setJobResults] = useState([]);
    const [jobLabel,   setJobLabel]   = useState('');

    useEffect(() => {
        if (!jobSearch.trim()) { setJobResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(jobSearch)}&pageSize=10&page=1&excludeClosedStatus=true`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setJobResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [jobSearch]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const openAdd = () => {
        setEditLine(null);
        setForm({ item: null, itemDesc: '', qty: '', unitCost: '', uomId: '', uomName: '', isJobStock: receipt.receiptType === 'JOB', jobId: receipt.jobId || '', jobIsStockJob: null, notes: '' });
        setJobLabel(receipt.jobId || ''); setJobSearch(''); setJobResults([]);
        setFormErr({});
        setAddOpen(true);
    };

    const openEdit = (line) => {
        setEditLine(line);
        setForm({
            item: { itemId: line.itemId, itemCode: line.itemCode, itemName: line.itemName },
            itemDesc: line.itemDesc || '',
            qty: String(line.qty),
            unitCost: String(line.unitCost),
            uomId: line.uomId || '',
            uomName: line.uomName || '',
            isJobStock: line.isJobStock,
            jobId: line.lineJobId || '',
            jobIsStockJob: null,
            notes: line.notes || '',
        });
        setJobLabel(line.lineJobId || ''); setJobSearch(''); setJobResults([]);
        setFormErr({});
        setAddOpen(true);
    };

    const validateForm = () => {
        const e = {};
        if (!form.item)             e.item    = 'Select an item.';
        if (!form.qty || isNaN(parseFloat(form.qty)) || parseFloat(form.qty) <= 0) e.qty = 'Enter a valid qty.';
        if (!form.unitCost || isNaN(parseFloat(form.unitCost)) || parseFloat(form.unitCost) < 0) e.unitCost = 'Enter a valid cost.';
        return e;
    };

    const [saveError, setSaveError] = useState('');

    const saveLine = async () => {
        setSaveError('');
        const e = validateForm();
        setFormErr(e);
        if (Object.keys(e).length) return;
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}stockreceipt/line/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    receiptLineId: editLine?.receiptLineId || 0,
                    receiptId:     receipt.receiptId,
                    lineNum:       editLine?.lineNum || 0,
                    itemId:        form.item.itemId,
                    itemDesc:      form.itemDesc || null,
                    qty:           parseFloat(form.qty),
                    uomId:         form.uomId || null,
                    unitCost:      parseFloat(form.unitCost),
                    isJobStock:    form.isJobStock,
                    jobId:         form.isJobStock ? (form.jobId || null) : null,
                    notes:         form.notes || null,
                    createdBy:     currentUser,
                    modifiedBy:    currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setSaveError(d?.message || `Save failed (HTTP ${res.status}).`); return; }
            setAddOpen(false);
            onRefresh();
        } catch (e) {
            setSaveError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setSaving(false); }
    };

    const [deleteError,   setDeleteError]   = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);  // line pending deletion

    const deleteLine = async (lineId) => {
        setDeleteError('');
        setDeleting(lineId);
        try {
            const res = await fetch(`${variables.API_URL}stockreceipt/line/${lineId}?modifiedBy=${encodeURIComponent(currentUser)}`,
                { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setDeleteError(d?.message || `Delete failed (HTTP ${res.status}).`);
                return;
            }
            setConfirmDelete(null);
            onRefresh();
        } catch (e) {
            setDeleteError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setDeleting(null); }
    };

    const totalCost = lines.reduce((s, l) => s + (l.qty * l.unitCost), 0);

    return (
        <div>
            <div className="invd-lines-toolbar">
                <span className="invd-lines-title">
                    Lines
                    <span style={{ marginLeft: 8, fontSize: 11, background: '#2e5fa3', color: '#fff', borderRadius: 10, padding: '1px 8px', fontWeight: 700 }}>{lines.length}</span>
                </span>
                {!isConfirmed && (
                    <button className="inv-btn inv-btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={openAdd}>+ Add Line</button>
                )}
            </div>

            {lines.length === 0 && !addOpen ? (
                <div className="inv-empty" style={{ padding: '32px 16px' }}>
                    <div className="inv-empty-icon">📦</div>
                    <div className="inv-empty-title">No lines yet</div>
                    {!isConfirmed && <div className="inv-empty-sub">Click "Add Line" to begin.</div>}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="invd-lines-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Item</th>
                                <th>Description</th>
                                <th className="right">Qty</th>
                                <th>UOM</th>
                                <th className="right">Unit Cost</th>
                                <th className="right">Total</th>
                                <th>Job Stock</th>
                                {!isConfirmed && <th></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map(l => (
                                <tr key={l.receiptLineId}>
                                    <td style={{ color: '#94a3b8', fontSize: 11 }}>{l.lineNum}</td>
                                    <td>
                                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 12 }}>{l.itemCode}</div>
                                        <div style={{ fontSize: 11, color: '#64748b' }}>{l.itemName}</div>
                                    </td>
                                    <td style={{ color: '#64748b', fontSize: 12 }}>{l.itemDesc || '—'}</td>
                                    <td className="right" style={{ fontWeight: 600 }}>{fmt(l.qty, 4)}</td>
                                    <td style={{ color: '#64748b', fontSize: 12 }}>{l.uomName || '—'}</td>
                                    <td className="right">{fmt(l.unitCost)}</td>
                                    <td className="right" style={{ fontWeight: 600 }}>{fmt(l.qty * l.unitCost)}</td>
                                    <td>
                                        {l.isJobStock ? (
                                            <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                                                {l.lineJobId || 'Job'}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#94a3b8', fontSize: 11 }}>Store</span>
                                        )}
                                    </td>
                                    {!isConfirmed && (
                                        <td style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => openEdit(l)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>Edit</button>
                                            <button onClick={() => { setDeleteError(''); setConfirmDelete(l); }} disabled={deleting === l.receiptLineId}
                                                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
                                                {deleting === l.receiptLineId ? '…' : 'Del'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Total */}
            {lines.length > 0 && (
                <div className="invd-totals">
                    <div className="invd-total-item">
                        <span className="invd-total-label">Total Cost</span>
                        <span className="invd-total-val">{fmt(totalCost)}</span>
                    </div>
                </div>
            )}

            {/* Delete line confirmation modal */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget && deleting === null) setConfirmDelete(null); }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '24px 28px', width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#1e293b' }}>Delete line?</h3>
                        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
                            Remove <strong style={{ color: '#1e40af' }}>{confirmDelete.itemCode}</strong>
                            {confirmDelete.itemName ? ` — ${confirmDelete.itemName}` : ''} (qty {fmt(confirmDelete.qty, 4)} {confirmDelete.uomName || ''})
                            from this GRN? This line has not been posted to stock yet.
                        </p>
                        {deleteError && (
                            <div style={{ marginBottom: 12, padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#b91c1c' }}>
                                {deleteError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setConfirmDelete(null)} disabled={deleting !== null}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={() => deleteLine(confirmDelete.receiptLineId)} disabled={deleting !== null}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: deleting !== null ? 0.7 : 1 }}>
                                {deleting !== null ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit form */}
            {addOpen && (
                <div className="invd-add-line" style={{ marginTop: 14 }}>
                    <h4>{editLine ? 'Edit Line' : 'Add Line'}</h4>
                    <div className="invd-form-grid" style={{ gridTemplateColumns: '1fr 1fr 90px 90px 110px 90px' }}>
                        <div className="invd-field" style={{ gridColumn: '1/3' }}>
                            <label className="invd-label">Item {isReq('itemId') && <span className="req">*</span>}</label>
                            <ItemSearch value={form.item} onSelect={item => setForm(f => ({
                                ...f,
                                item,
                                uomId:   item ? (item.baseUomId || '') : '',
                                uomName: item ? (item.baseUomName || item.baseUomCode || '') : '',
                            }))} />
                            {formErr.item && <span style={{ color: '#dc2626', fontSize: 11 }}>{formErr.item}</span>}
                        </div>
                        <div className="invd-field">
                            <label className="invd-label">Qty {isReq('qty') && <span className="req">*</span>}</label>
                            <input className={`invd-input${formErr.qty ? ' error' : ''}`} type="number" min="0" step="0.0001" value={form.qty} onChange={e => set('qty', e.target.value)} />
                            {formErr.qty && <span style={{ color: '#dc2626', fontSize: 11 }}>{formErr.qty}</span>}
                        </div>
                        <div className="invd-field">
                            <label className="invd-label">UOM</label>
                            <input className="invd-input" readOnly value={form.uomName || '—'}
                                title="Stock unit — comes from the item's base UOM and cannot be changed"
                                style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }} />
                        </div>
                        <div className="invd-field">
                            <label className="invd-label">Unit Cost {isReq('unitCost') && <span className="req">*</span>}</label>
                            <input className={`invd-input${formErr.unitCost ? ' error' : ''}`} type="number" min="0" step="0.01" value={form.unitCost} onChange={e => set('unitCost', e.target.value)} />
                            {formErr.unitCost && <span style={{ color: '#dc2626', fontSize: 11 }}>{formErr.unitCost}</span>}
                        </div>
                        <div className="invd-field">
                            <label className="invd-label">Total</label>
                            <input className="invd-input" readOnly value={form.qty && form.unitCost ? fmt(parseFloat(form.qty || 0) * parseFloat(form.unitCost || 0)) : '—'} style={{ background: '#f8fafc' }} />
                        </div>
                    </div>
                    <div className="invd-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8 }}>
                        <div className="invd-field">
                            <label className="invd-label">Description</label>
                            <input className="invd-input" placeholder="Override description" value={form.itemDesc} onChange={e => set('itemDesc', e.target.value)} />
                        </div>
                        <div className="invd-field">
                            <label className="invd-label">Notes</label>
                            <input className="invd-input" placeholder="Line notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
                        </div>
                        <div className="invd-field">
                            <label className="invd-label">
                                <input type="checkbox" checked={form.isJobStock}
                                    onChange={e => { const on = e.target.checked; setForm(f => ({ ...f, isJobStock: on, jobId: on ? f.jobId : '', jobIsStockJob: on ? f.jobIsStockJob : null })); if (!on) { setJobLabel(''); setJobSearch(''); setJobResults([]); } }}
                                    style={{ marginRight: 5 }} />
                                Link to a Job
                            </label>
                            {form.isJobStock && (
                                <div style={{ marginTop: 4, position: 'relative' }}>
                                    {jobLabel ? (
                                        <>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <span className="invd-input" style={{ flex: 1, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>✓ {jobLabel}</span>
                                            <button type="button"
                                                onClick={() => { setJobLabel(''); setForm(f => ({ ...f, jobId: '', jobIsStockJob: null })); setJobSearch(''); setJobResults([]); }}
                                                style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                        </div>
                                        {form.jobIsStockJob != null && (
                                            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600,
                                                color: form.jobIsStockJob ? '#0369a1' : '#9a3412' }}>
                                                {form.jobIsStockJob
                                                    ? '🏭 In-house job → adds to general store stock'
                                                    : '👤 Customer job → reserved as job stock'}
                                            </div>
                                        )}
                                        </>
                                    ) : (
                                        <>
                                            <input className="invd-input" value={jobSearch} autoComplete="off"
                                                onChange={e => setJobSearch(e.target.value)} placeholder="Search job…" />
                                            {jobResults.length > 0 && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                                                    {jobResults.map(j => (
                                                        <div key={j.jobId}
                                                            style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, borderBottom: '1px solid #f1f5f9' }}
                                                            onClick={() => {
                                                                setForm(f => ({ ...f, jobId: j.jobId, jobIsStockJob: !!j.isStockJob }));
                                                                setJobLabel(`${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`);
                                                                setJobSearch(''); setJobResults([]);
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                            <strong>{j.jobId}</strong>
                                                            {j.projectName  && <span style={{ marginLeft: 6 }}>{j.projectName}</span>}
                                                            {j.customerName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>({j.customerName})</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="invd-form-actions">
                        <button className="inv-btn inv-btn-ghost"
                            onClick={() => { setSaveError(''); setAddOpen(false); }} disabled={saving}>
                            Cancel
                        </button>
                        <button className="inv-btn inv-btn-primary" onClick={saveLine} disabled={saving}>
                            {saving ? 'Saving…' : (editLine ? 'Update Line' : 'Add Line')}
                        </button>
                    </div>
                    <InlineError error={saveError} onDismiss={() => setSaveError('')} />
                </div>
            )}

            {/* Surfaces SP RAISERROR / FK / network errors raised by Delete. */}
            <InlineError error={deleteError} onDismiss={() => setDeleteError('')} style={{ marginTop: 12 }} />
        </div>
    );
};

// ── Info Tab ───────────────────────────────────────────────────
const InfoTab = ({ receipt, onRefresh, currentUser }) => {
    const isConfirmed = receipt.status === 'Confirmed';
    const [form, setForm]   = useState({
        receiptDate:  receipt.receiptDate?.slice(0, 10) || '',
        receiptType:  receipt.receiptType,
        jobId:        receipt.jobId || '',
        supplierId:   receipt.supplierId != null ? String(receipt.supplierId) : '',
        supplierName: receipt.supplierName || '',
        supplierRef:  receipt.supplierRef  || '',
        poNumber:     receipt.poNumber     || '',
        notes:        receipt.notes        || '',
    });
    const [saving,    setSaving]    = useState(false);
    const [saved,     setSaved]     = useState(false);
    const [infoError, setInfoError] = useState('');
    const [supplierOptions, setSupplierOptions] = useState([]);
    const [jobSearch,  setJobSearch]  = useState('');
    const [jobResults, setJobResults] = useState([]);

    useEffect(() => {
        if (isConfirmed) return;
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierOptions((d.data || []).map(s => ({
                value: String(s.supplierId),
                label: s.supplierCode ? `${s.supplierCode} — ${s.supplierName}` : s.supplierName,
                name:  s.supplierName,
            }))))
            .catch(console.error);
    }, [isConfirmed]);

    useEffect(() => {
        if (!jobSearch.trim()) { setJobResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(jobSearch)}&pageSize=10&page=1&excludeClosedStatus=true`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setJobResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [jobSearch]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        setInfoError(''); setSaving(true); setSaved(false);
        try {
            const res = await fetch(`${variables.API_URL}stockreceipt/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    receiptId:    receipt.receiptId,
                    receiptDate:  form.receiptDate || null,
                    receiptType:  form.receiptType,
                    jobId:        form.jobId || null,
                    supplierId:   form.supplierId ? Number(form.supplierId) : null,
                    supplierName: form.supplierName || null,
                    supplierRef:  form.supplierRef  || null,
                    poNumber:     form.poNumber     || null,
                    notes:        form.notes        || null,
                    modifiedBy:   currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setInfoError(d?.message || `Save failed (HTTP ${res.status}).`); return; }
            setSaved(true); onRefresh();
        } catch (e) { setInfoError(`Network error — ${e?.message || 'could not reach the server.'}`); }
        finally { setSaving(false); }
    };

    return (
        <div className="invd-info-form">
            <div className="invd-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="invd-field">
                    <label className="invd-label">Receipt Type</label>
                    {isConfirmed
                        ? <input className="invd-input" readOnly value={RECEIPT_TYPE[form.receiptType]?.label || form.receiptType} style={{ background: '#f8fafc' }} />
                        : <select className="invd-select" value={form.receiptType} onChange={e => set('receiptType', e.target.value)}>
                            {Object.entries(RECEIPT_TYPE).map(([val, cfg]) => (
                                <option key={val} value={val}>{cfg.label}</option>
                            ))}
                          </select>
                    }
                </div>
                <div className="invd-field">
                    <label className="invd-label">Receipt Date</label>
                    <input className="invd-input" type="date" value={form.receiptDate} onChange={e => set('receiptDate', e.target.value)} readOnly={isConfirmed} style={isConfirmed ? { background: '#f8fafc' } : {}} />
                </div>
                {(form.receiptType === 'JOB' || receipt.receiptType === 'JOB') && (
                    <div className="invd-field">
                        <label className="invd-label">Job ID</label>
                        {isConfirmed ? (
                            <input className="invd-input" readOnly value={form.jobId || '—'} style={{ background: '#f8fafc' }} />
                        ) : form.jobId ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span className="invd-input" style={{ flex: 1, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>✓ {form.jobId}</span>
                                <button type="button" onClick={() => { set('jobId', ''); setJobSearch(''); setJobResults([]); }}
                                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                            </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <input className="invd-input" value={jobSearch} autoComplete="off"
                                    onChange={e => setJobSearch(e.target.value)} placeholder="Search job…" />
                                {jobResults.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                                        {jobResults.map(j => (
                                            <div key={j.jobId}
                                                style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, borderBottom: '1px solid #f1f5f9' }}
                                                onClick={() => { set('jobId', j.jobId); setJobSearch(''); setJobResults([]); }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                <strong>{j.jobId}</strong>
                                                {j.projectName  && <span style={{ marginLeft: 6 }}>{j.projectName}</span>}
                                                {j.customerName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>({j.customerName})</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                <div className="invd-field">
                    <label className="invd-label">Supplier</label>
                    {isConfirmed
                        ? <input className="invd-input" readOnly value={form.supplierName || '—'} style={{ background: '#f8fafc' }} />
                        : <select className="invd-select" value={form.supplierId}
                            onChange={e => {
                                const opt = supplierOptions.find(o => o.value === e.target.value);
                                setForm(f => ({ ...f, supplierId: e.target.value, supplierName: opt?.name || '' }));
                            }}>
                            <option value="">— Select supplier —</option>
                            {/* keep the previously-saved free-text supplier visible if it predates the master link */}
                            {form.supplierId === '' && form.supplierName &&
                                <option value="" disabled>{`(current: ${form.supplierName})`}</option>}
                            {supplierOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                    }
                </div>
                <div className="invd-field">
                    <label className="invd-label">Supplier Ref</label>
                    <input className="invd-input" value={form.supplierRef} onChange={e => set('supplierRef', e.target.value)} readOnly={isConfirmed} style={isConfirmed ? { background: '#f8fafc' } : {}} />
                </div>
                <div className="invd-field">
                    <label className="invd-label">PO Number</label>
                    <input className="invd-input" value={form.poNumber} onChange={e => set('poNumber', e.target.value)} readOnly={isConfirmed} style={isConfirmed ? { background: '#f8fafc' } : {}} />
                </div>
                <div className="invd-field invd-full-row">
                    <label className="invd-label">Notes</label>
                    <textarea className="invd-input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} readOnly={isConfirmed} style={{ resize: 'vertical', ...(isConfirmed ? { background: '#f8fafc' } : {}) }} />
                </div>
            </div>
            {!isConfirmed && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                        <button className="inv-btn inv-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                        {saved && <span style={{ color: '#16a34a', fontSize: 12 }}>✓ Saved</span>}
                    </div>
                    <InlineError error={infoError} onDismiss={() => setInfoError('')} />
                </>
            )}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.8 }}>
                    <div>Created by <strong>{receipt.createdBy}</strong> on {fmtDateTime(receipt.createdDate)}</div>
                    {receipt.modifiedBy && <div>Last modified by <strong>{receipt.modifiedBy}</strong> on {fmtDateTime(receipt.modifiedDate)}</div>}
                </div>
            </div>
        </div>
    );
};

// ── Main Detail Page ───────────────────────────────────────────
const GrnDetailPage = () => {
    const { id }        = useParams();
    const navigate      = useNavigate();
    const currentUser   = useCurrentUser();
    const [receipt, setReceipt] = useState(null);
    const [lines,   setLines]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('info');
    const [confirming, setConfirming] = useState(false);
    const [pageError,  setPageError]  = useState('');
    const [confirmModal, setConfirmModal] = useState(false);
    const [confirmPwd,   setConfirmPwd]   = useState('');
    const [confirmErr,   setConfirmErr]   = useState('');
    const [voidModal, setVoidModal]   = useState(false);
    const [voidReason, setVoidReason] = useState('');
    const [voidPwd,    setVoidPwd]    = useState('');
    const [voidErr,    setVoidErr]    = useState('');
    const [voiding,    setVoiding]    = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}stockreceipt/${id}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setReceipt(d.receipt); setLines(d.lines || []); })
            .catch(() => navigate('/inventory-grn'))
            .finally(() => setLoading(false));
    }, [id, navigate]);

    useEffect(() => { load(); }, [load]);

    const openConfirm = () => {
        // Pre-check: refuse to confirm an empty GRN — same rule the backend
        // enforces, surfaced earlier so the user gets a clear message instead
        // of a generic SP error.
        if (!lines || lines.length === 0) {
            window.alert(
                'Cannot confirm this GRN.\n\n' +
                'No line items have been added yet.\n\n' +
                'Add at least one line on the Lines tab and try again.'
            );
            return;
        }
        setConfirmPwd(''); setConfirmErr(''); setConfirmModal(true);
    };

    const doConfirm = async () => {
        if (!confirmPwd) { setConfirmErr('Password is required.'); return; }
        setConfirmErr(''); setPageError('');
        setConfirming(true);
        try {
            const res = await fetch(`${variables.API_URL}stockreceipt/${id}/confirm`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ modifiedBy: currentUser, password: confirmPwd }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setConfirmErr(d?.message || `Confirm failed (HTTP ${res.status}).`); return; }
            setConfirmModal(false); setConfirmPwd('');
            load();
        } catch (e) { setConfirmErr(`Network error — ${e?.message || 'could not reach the server.'}`); }
        finally { setConfirming(false); }
    };

    const openVoid = () => { setVoidReason(''); setVoidPwd(''); setVoidErr(''); setVoidModal(true); };

    const doVoid = async () => {
        if (!voidReason.trim()) { setVoidErr('A reason is required.'); return; }
        if (!voidPwd)           { setVoidErr('Password is required.'); return; }
        setVoidErr(''); setVoiding(true);
        try {
            const res = await fetch(`${variables.API_URL}stockreceipt/${id}/cancel`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ cancelledBy: currentUser, reason: voidReason.trim(), password: voidPwd }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setVoidErr(d?.message || `Void failed (HTTP ${res.status}).`); return; }
            setVoidModal(false); setVoidPwd('');
            load();
        } catch (e) { setVoidErr(`Network error — ${e?.message || 'could not reach the server.'}`); }
        finally { setVoiding(false); }
    };

    if (loading) return <div className="inv-loading" style={{ padding: 40 }}><div className="inv-spinner" />Loading GRN…</div>;
    if (!receipt) return null;

    const isConfirmed = receipt.status === 'Confirmed';
    return (
        <div className="invd-shell">
            {/* Top bar */}
            <div className="invd-topbar">
                <button className="invd-back" onClick={() => navigate('/inventory-grn')}>← GRNs</button>
                <div>
                    <div className="invd-doc-no">{receipt.receiptNo}</div>
                    <div className="invd-doc-date">{fmtDate(receipt.receiptDate)}</div>
                </div>
                <TypeTag type={receipt.receiptType} />
                <div className="invd-status-area">
                    <StatusBadge status={receipt.status} />
                    {!isConfirmed && lines.length > 0 && (
                        <button className="inv-btn inv-btn-confirm" onClick={openConfirm} disabled={confirming} style={{ fontSize: 12 }}>
                            {confirming ? 'Confirming…' : '✓ Confirm GRN'}
                        </button>
                    )}
                    {isConfirmed && !receipt.grnId && (
                        <button onClick={openVoid} disabled={voiding}
                            style={{ fontSize: 12, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 14px', fontWeight: 600, cursor: 'pointer' }}>
                            {voiding ? 'Voiding…' : '⟲ Cancel / Void'}
                        </button>
                    )}
                </div>
            </div>

            {/* Info strip */}
            <div className="invd-infostrip">
                {receipt.supplierName && (
                    <div className="invd-info-item">
                        <span className="invd-info-label">Supplier</span>
                        <span className="invd-info-val">{receipt.supplierName}</span>
                    </div>
                )}
                {receipt.jobId && (
                    <div className="invd-info-item">
                        <span className="invd-info-label">Job</span>
                        <span className="invd-info-val" style={{ color: '#1e40af', cursor: 'pointer' }} onClick={() => navigate(`/jobs/${receipt.jobId}`)}>{receipt.jobId} ↗</span>
                    </div>
                )}
                {receipt.poNumber && (
                    <div className="invd-info-item">
                        <span className="invd-info-label">PO No.</span>
                        <span className="invd-info-val">{receipt.poNumber}</span>
                    </div>
                )}
                {receipt.supplierRef && (
                    <div className="invd-info-item">
                        <span className="invd-info-label">Supplier Ref</span>
                        <span className="invd-info-val">{receipt.supplierRef}</span>
                    </div>
                )}
                <div className="invd-info-item">
                    <span className="invd-info-label">Lines</span>
                    <span className="invd-info-val">{lines.length}</span>
                </div>
                <div className="invd-info-item">
                    <span className="invd-info-label">Total Cost</span>
                    <span className="invd-info-val">{fmt(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))}</span>
                </div>
            </div>

            {/* Confirm banner for draft */}
            {!isConfirmed && lines.length > 0 && (
                <div style={{ padding: '0 24px', marginTop: 12 }}>
                    <div className="invd-confirm-banner">
                        <span>⚠️</span>
                        <span><strong>Draft GRN</strong> — click "Confirm GRN" to post stock to inventory. This action cannot be undone.</span>
                    </div>
                </div>
            )}

            {/* Page-level error surface (Confirm GRN failures, etc.) */}
            <div style={{ padding: '0 24px' }}>
                <InlineError error={pageError} onDismiss={() => setPageError('')} />
            </div>

            {/* Tabs */}
            <div className="invd-tabs">
                {[{ key: 'info', label: 'Info', icon: '📋' }, { key: 'lines', label: 'Lines', icon: '📦' }].map(t => (
                    <div key={t.key} className={`invd-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
                        {t.icon} {t.label}
                    </div>
                ))}
            </div>

            {/* Body */}
            <div className="invd-body">
                {activeTab === 'lines' && <LinesTab receipt={receipt} lines={lines} onRefresh={load} currentUser={currentUser} />}
                {activeTab === 'info'  && <InfoTab  receipt={receipt} onRefresh={load} currentUser={currentUser} />}
            </div>

            {/* Confirm GRN — password authorisation modal */}
            {confirmModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget && !confirming) setConfirmModal(false); }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#1e293b' }}>Confirm GRN</h3>
                        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                            {receipt.receiptNo} — confirming will post <strong>{lines.length}</strong> line(s) to stock
                            (total {fmt(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))}) and cannot be undone without a reversal.
                        </p>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                                Your password <span style={{ color: '#e53e3e' }}>*</span>
                            </label>
                            <input
                                type="password"
                                value={confirmPwd}
                                onChange={e => setConfirmPwd(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') doConfirm(); }}
                                placeholder="Enter your login password to confirm"
                                autoFocus
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
                            />
                        </div>
                        {confirmErr && (
                            <div style={{ marginBottom: 14, padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#b91c1c' }}>
                                {confirmErr}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setConfirmModal(false)} disabled={confirming}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={doConfirm} disabled={confirming}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#0f766e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: confirming ? 0.7 : 1 }}>
                                {confirming ? 'Confirming…' : '✓ Confirm GRN'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel / Void — reason + password authorisation modal */}
            {voidModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget && !voiding) setVoidModal(false); }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#1e293b' }}>Cancel / Void GRN</h3>
                        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                            {receipt.receiptNo} — this reverses all posted stock (creates <strong>RECEIPT-REV</strong> entries) and marks the GRN Cancelled.
                            Blocked if any item has since been consumed.
                        </p>
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                                Reason <span style={{ color: '#e53e3e' }}>*</span>
                            </label>
                            <textarea rows={3} value={voidReason} onChange={e => setVoidReason(e.target.value)}
                                placeholder="e.g. Wrong items received, duplicate entry…" autoFocus
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                                Your password <span style={{ color: '#e53e3e' }}>*</span>
                            </label>
                            <input type="password" value={voidPwd} onChange={e => setVoidPwd(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') doVoid(); }}
                                placeholder="Enter your login password to confirm"
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }} />
                        </div>
                        {voidErr && (
                            <div style={{ marginBottom: 14, padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#b91c1c' }}>
                                {voidErr}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setVoidModal(false)} disabled={voiding}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={doVoid} disabled={voiding}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: voiding ? 0.7 : 1 }}>
                                {voiding ? 'Voiding…' : '⟲ Void GRN'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrnDetailPage;
