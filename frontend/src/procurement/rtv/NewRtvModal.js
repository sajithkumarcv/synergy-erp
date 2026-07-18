import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import LookupSelect from '../../common/LookupSelect';

const LOOKUP_PAGE_SIZE = 25;

const today = () => new Date().toISOString().slice(0, 10);

const NewRtvModal = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();

    const [form, setForm] = useState({
        rtvDate:      today(),
        supplierId:   '',
        supplierLabel:'',
        grnId:        '',
        grnLabel:     '',
        returnReason: '',
        remarks:      '',
    });
    const [grnSearch,    setGrnSearch]    = useState('');
    const [grnResults,   setGrnResults]   = useState([]);
    const [errors,       setErrors]       = useState({});
    const [saving,       setSaving]       = useState(false);
    const [error,        setError]        = useState('');


    // GRN typeahead (search by GRN number)
    useEffect(() => {
        if (!grnSearch.trim()) { setGrnResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}grn/search?searchText=${encodeURIComponent(grnSearch)}&pageSize=8&status=Received`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setGrnResults(Array.isArray(d) ? d : (d.data || []))).catch(() => {});
        }, 280);
        return () => clearTimeout(t);
    }, [grnSearch]);

    const set = (k, v) => {
        setForm(p => ({ ...p, [k]: v }));
        if (errors[k]) setErrors(p => ({ ...p, [k]: undefined }));
    };

    const pickSupplier = (s) => {
        setForm(p => ({ ...p, supplierId: String(s.supplierId || s.SupplierId), supplierLabel: s.supplierName || s.SupplierName }));
        setErrors(p => ({ ...p, supplierId: undefined }));
    };

    const clearSupplier = () => {
        setForm(p => ({ ...p, supplierId: '', supplierLabel: '' }));
    };

    const pickGrn = (g) => {
        setGrnSearch(''); setGrnResults([]);
        setForm(p => ({
            ...p,
            grnId:    String(g.grnId || g.GrnId),
            grnLabel: g.grnNumber || g.GrnNumber,
            // auto-fill supplier from GRN if not already set
            supplierId:    p.supplierId    || String(g.supplierId   || g.SupplierId   || ''),
            supplierLabel: p.supplierLabel || (g.supplierName || g.SupplierName || ''),
        }));
    };

    const clearGrn = () => {
        setGrnSearch('');
        setForm(p => ({ ...p, grnId: '', grnLabel: '' }));
    };

    const save = async () => {
        const e = {};
        if (!form.supplierId)        e.supplierId   = 'Supplier is required.';
        if (!form.returnReason.trim()) e.returnReason = 'Return reason is required.';
        setErrors(e);
        if (Object.keys(e).length) return;

        setError(''); setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}rtv/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    rtvId:        0,
                    rtvDate:      form.rtvDate,
                    supplierId:   Number(form.supplierId),
                    grnId:        form.grnId ? Number(form.grnId) : null,
                    returnReason: form.returnReason.trim(),
                    remarks:      form.remarks.trim() || null,
                    createdBy:    currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setError(d?.message || 'Error creating RTV.'); return; }
            onSaved(d.id);
        } catch (e) {
            setError('Network error.');
        } finally { setSaving(false); }
    };

    const dropStyle = {
        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
        background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto',
    };
    const dropItem = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    return (
        <div className="pf-overlay">
            <div className="pf-panel">
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Return to Vendor</div>
                        <div className="pf-header-sub">Enter the return details. You can add lines after creation.</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">

                    {/* RTV Date */}
                    <div className="pf-field">
                        <label className="pf-label">RTV Date <span style={{ color: '#e53e3e' }}>*</span></label>
                        <input type="date" className="pf-input"
                            value={form.rtvDate}
                            onChange={e => set('rtvDate', e.target.value)} />
                    </div>

                    {/* Supplier */}
                    <div className="pf-field">
                        <label className="pf-label">Supplier <span style={{ color: '#e53e3e' }}>*</span></label>
                        <LookupSelect
                            value={form.supplierId}
                            label={form.supplierLabel}
                            error={errors.supplierId}
                            tone="green"
                            autoFocus
                            placeholder="Select or type to search supplier…"
                            buildUrl={t => `${variables.API_URL}supplier/search?searchText=${encodeURIComponent(t)}&pageSize=${LOOKUP_PAGE_SIZE}`}
                            itemKey={s => s.supplierId || s.SupplierId}
                            renderItem={s => (
                                <>
                                    <span style={{ fontWeight: 600, fontSize: 12 }}>{s.supplierCode || s.SupplierCode}</span>
                                    <span style={{ color: '#64748b', marginLeft: 8 }}>{s.supplierName || s.SupplierName}</span>
                                </>
                            )}
                            onSelect={pickSupplier}
                            onClear={clearSupplier}
                        />
                        {errors.supplierId && <div className="pf-err">{errors.supplierId}</div>}
                    </div>

                    {/* GRN Reference (optional) */}
                    <div className="pf-field">
                        <label className="pf-label">GRN Reference <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                        {form.grnLabel ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ flex: 1, padding: '7px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, fontSize: 13, color: '#1e40af' }}>
                                    {form.grnLabel}
                                </span>
                                <button onClick={clearGrn} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>✕</button>
                            </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <input className="pf-input"
                                    placeholder="Type GRN number to search…"
                                    value={grnSearch}
                                    onChange={e => setGrnSearch(e.target.value)} />
                                {grnResults.length > 0 && (
                                    <div style={dropStyle}>
                                        {grnResults.map(g => (
                                            <div key={g.grnId || g.GrnId} style={dropItem}
                                                onMouseDown={() => pickGrn(g)}>
                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{g.grnNumber || g.GrnNumber}</span>
                                                <span style={{ color: '#64748b', marginLeft: 8 }}>{g.supplierName || g.SupplierName}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Return Reason */}
                    <div className="pf-field">
                        <label className="pf-label">Return Reason <span style={{ color: '#e53e3e' }}>*</span></label>
                        <textarea className={`pf-input${errors.returnReason ? ' pf-input-err' : ''}`}
                            rows={2} placeholder="e.g. Wrong quantity received, damaged goods, over-delivery…"
                            value={form.returnReason}
                            onChange={e => set('returnReason', e.target.value)}
                            style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                        {errors.returnReason && <div className="pf-err">{errors.returnReason}</div>}
                    </div>

                    {/* Remarks */}
                    <div className="pf-field">
                        <label className="pf-label">Remarks <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                        <input className="pf-input"
                            placeholder="Any additional notes…"
                            value={form.remarks}
                            onChange={e => set('remarks', e.target.value)} />
                    </div>

                    {error && (
                        <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#b91c1c' }}>
                            {error}
                        </div>
                    )}
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create RTV'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewRtvModal;
