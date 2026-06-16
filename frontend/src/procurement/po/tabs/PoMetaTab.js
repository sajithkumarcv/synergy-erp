import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { fmtDate } from '../../procurementConstants';

// ── Helpers ───────────────────────────────────────────────────────
const Field = ({ label, children }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className="prd-ov-val">{children || <span className="prd-ov-val-muted">—</span>}</div>
    </div>
);

const Flag = ({ on, label }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className="prd-ov-val">
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: on ? '#dcfce7' : '#f1f5f9',
                color: on ? '#166534' : '#64748b',
                padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600
            }}>
                {on ? '✓ Yes' : '✗ No'}
            </span>
        </div>
    </div>
);

const SectionLabel = ({ children }) => (
    <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 6, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
        {children}
    </div>
);

// ── Flag definitions ──────────────────────────────────────────────
const DOC_FLAGS = [
    { name: 'isWarranty',      label: 'Warranty'              },
    { name: 'isPreInspection', label: 'Pre-Inspection'        },
    { name: 'isShipping',      label: 'Shipping Docs'         },
    { name: 'isCOO',           label: 'Cert. of Origin'       },
    { name: 'isDrawing',       label: 'Drawing'               },
    { name: 'isMTC',           label: 'Mill Test Certificate' },
    { name: 'isQtn',           label: 'Quotation'             },
    { name: 'isOthers',        label: 'Others'                },
];

const NOTE_FLAGS = [
    { name: 'isNote1', label: 'Note 1' },
    { name: 'isNote2', label: 'Note 2' },
    { name: 'isNote3', label: 'Note 3' },
];

// ── Component ─────────────────────────────────────────────────────
const PoMetaTab = ({ po, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { getStatusConfig } = useLookup();

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const canEdit = getStatusConfig('PO', po.status)?.canEdit
        ?? ['Draft', 'Approved', 'Sent'].includes(po.status);

    const startEdit = () => {
        setForm({
            isWarranty:      !!po.isWarranty,
            isPreInspection: !!po.isPreInspection,
            isShipping:      !!po.isShipping,
            isCOO:           !!po.isCOO,
            isDrawing:       !!po.isDrawing,
            isMTC:           !!po.isMTC,
            isQtn:           !!po.isQtn,
            isOthers:        !!po.isOthers,
            isNote1:         !!po.isNote1,
            isNote2:         !!po.isNote2,
            isNote3:         !!po.isNote3,
            vendorQuoteDate:   po.vendorQuoteDate ? po.vendorQuoteDate.slice(0, 10) : '',
        });
        setEditing(true);
        setError('');
    };

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = () => {
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}purchaseorder/meta/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                poId:            po.poId,
                isWarranty:      form.isWarranty,
                isPreInspection: form.isPreInspection,
                isShipping:      form.isShipping,
                isCOO:           form.isCOO,
                isDrawing:       form.isDrawing,
                isMTC:           form.isMTC,
                isQtn:           form.isQtn,
                isOthers:        form.isOthers,
                isNote1:         form.isNote1,
                isNote2:         form.isNote2,
                isNote3:         form.isNote3,
                vendorQuoteDate:   form.vendorQuoteDate || null,
                modifiedBy:      currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                setEditing(false);
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    // ── shared label style ────────────────────────────────────────
    const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
    const field = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 };
    const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };

    // ── Edit form ─────────────────────────────────────────────────
    if (editing) {
        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Document Requirements */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
                    Document Requirements
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                    {DOC_FLAGS.map(f => (
                        <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: '#1e3a5f', userSelect: 'none' }}>
                            <input type="checkbox" name={f.name} checked={!!form[f.name]} onChange={handle}
                                style={{ width: 15, height: 15, accentColor: '#2e5fa3', cursor: 'pointer' }} />
                            {f.label}
                        </label>
                    ))}
                </div>

                {/* Notes / Conditions */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
                    Notes / Conditions
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                    {NOTE_FLAGS.map(f => (
                        <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: '#1e3a5f', userSelect: 'none' }}>
                            <input type="checkbox" name={f.name} checked={!!form[f.name]} onChange={handle}
                                style={{ width: 15, height: 15, accentColor: '#2e5fa3', cursor: 'pointer' }} />
                            {f.label}
                        </label>
                    ))}
                </div>

                {/* Dates */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
                    Dates
                </div>
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Vendor Quotation Date</label>
                        <input className="pf-input" type="date" name="vendorQuoteDate" value={form.vendorQuoteDate} onChange={handle} />
                    </div>
                    <div style={{ ...field, flex: 2 }} />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Meta'}</button>
                </div>
            </div>
        );
    }

    // ── Read-only view ────────────────────────────────────────────
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✏ Edit Meta</button>}
            </div>

            <div className="prd-ov-grid">
                <SectionLabel>Document Requirements</SectionLabel>
                <Flag on={po.isWarranty}      label="Warranty" />
                <Flag on={po.isPreInspection} label="Pre-Inspection" />
                <Flag on={po.isShipping}      label="Shipping Docs" />
                <Flag on={po.isCOO}           label="Cert. of Origin" />
                <Flag on={po.isDrawing}       label="Drawing" />
                <Flag on={po.isMTC}           label="Mill Test Certificate" />
                <Flag on={po.isQtn}           label="Quotation" />
                <Flag on={po.isOthers}        label="Others" />

                <SectionLabel>Notes / Conditions</SectionLabel>
                <Flag on={po.isNote1} label="Note 1" />
                <Flag on={po.isNote2} label="Note 2" />
                <Flag on={po.isNote3} label="Note 3" />

                <SectionLabel>Dates</SectionLabel>
                <Field label="Vendor Quotation Date">{fmtDate(po.vendorQuoteDate)}</Field>
            </div>
        </div>
    );
};

export default PoMetaTab;
