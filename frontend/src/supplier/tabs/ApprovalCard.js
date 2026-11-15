import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../Variable';
import { usePermission } from '../../PermissionContext';
import ValidationModal from '../../common/ValidationModal';

// Supplier approval: checklist (country, bank, tax, contact, address) + Approve / Withdraw.
// Only suppliers that are approved can be picked on a purchase order.

// Short names for the checklist (the full sentence from sp_GetSupplierApproval shows on hover).
const CHECK_LABEL = {
    COUNTRY: 'Country',
    BANK:    'Active bank account',
    TAX:     'Tax treatment (GST / VAT no. if registered)',
    CONTACT: 'Contact person',
    ADDRESS: 'Address',
};
const ApprovalCard = ({ supplier, onRefresh }) => {
    const { canDo } = usePermission();
    const canApprove = canDo('/suppliers', 'APPROVE');
    const [items, setItems]     = useState([]);
    const [remarks, setRemarks] = useState('');
    const [busy, setBusy]       = useState(false);
    const [errors, setErrors]   = useState(null);

    const load = useCallback(() => {
        fetch(`${variables.API_URL}supplier/${supplier.supplierId}/approval`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : []))
            .then(d => setItems(Array.isArray(d) ? d : []))
            .catch(() => setItems([]));
    }, [supplier.supplierId]);

    // Reload when the supplier record changes (bank, tax, country edits come back through onRefresh).
    useEffect(() => { load(); }, [load, supplier]);

    const act = async (path) => {
        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}supplier/${supplier.supplierId}/${path}`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ remarks: remarks.trim() || null }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErrors([d?.message || 'Request failed.']); return; }
            setRemarks('');
            onRefresh();
        } catch { setErrors(['Network error. Please try again.']); }
        finally { setBusy(false); }
    };

    const allOk = items.length > 0 && items.every(i => i.isOk);
    const approved = !!supplier.isApprovedVendor;

    return (
        <div className="ov-detail-card">
            <div className="ov-detail-card-title">Supplier Approval</div>
            <div className="ov-detail-rows">
                <div className="ov-row">
                    <span className="ov-row-label">Status</span>
                    <span className="ov-row-value">
                        {approved
                            ? <span style={{ color: '#047857', fontWeight: 600 }}>✔ Approved</span>
                            : <span style={{ color: '#b45309', fontWeight: 600 }}>Not approved</span>}
                    </span>
                </div>
                {approved && supplier.approvedBy && (
                    <div className="ov-row">
                        <span className="ov-row-label">Approved by</span>
                        <span className="ov-row-value">{supplier.approvedBy}{supplier.approvedDate ? ` · ${new Date(supplier.approvedDate).toLocaleDateString()}` : ''}</span>
                    </div>
                )}
                {supplier.approvalRemarks && (
                    <div className="ov-row">
                        <span className="ov-row-label">Remarks</span>
                        <span className="ov-row-value">{supplier.approvalRemarks}</span>
                    </div>
                )}
            </div>
            {/* checklist: own layout so a long label wraps and the tick/cross always stays visible on the right */}
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(i => (
                    <div key={i.itemKey} title={i.itemLabel}
                        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                        <span style={{ color: '#475569', flex: 1, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.35 }}>
                            {CHECK_LABEL[i.itemKey] || i.itemLabel}
                        </span>
                        <span style={{ color: i.isOk ? '#047857' : '#b91c1c', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {i.isOk ? '✔' : '✖ Missing'}
                        </span>
                    </div>
                ))}
            </div>

            {canApprove && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="jf-input" style={{ flex: 1, minWidth: 160 }} placeholder="Remarks (optional)" value={remarks} onChange={e => setRemarks(e.target.value)} />
                    {!approved && (
                        <button className="jd-edit-btn" disabled={busy || !allOk} title={allOk ? '' : 'Complete the checklist first'} onClick={() => act('approve')}
                            style={busy || !allOk ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
                            {busy ? 'Saving…' : '✔ Approve Supplier'}
                        </button>
                    )}
                    {approved && (
                        <button className="jd-edit-btn" disabled={busy} onClick={() => act('withdraw-approval')}>
                            {busy ? 'Saving…' : 'Withdraw Approval'}
                        </button>
                    )}
                </div>
            )}
            {!approved && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>A supplier must be approved before it can be used on a purchase order. Changing the bank details withdraws the approval.</div>}
            {errors && <ValidationModal errors={errors} onClose={() => setErrors(null)} />}
        </div>
    );
};

export default ApprovalCard;
