import React, { useState } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import ConfirmModal from '../../common/ConfirmModal';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { fmt, FormSection } from '../invoiceConstants';
import '../../procurement/Procurement.css';
import { useFieldConfig } from '../../FieldConfigContext';
import { InlineError } from '../../common/InlineError';
import InvoiceImportModal from '../InvoiceImportModal';

// ── Line Edit Slide-over ─────────────────────────────────────────────
const BLANK_LINE = {
    invoiceLineId: 0,
    lineNum: 0,
    description: '',
    uomName: '',
    unitPrice: '',
    qty: '1',
    vatPercent: '',   // resolved in LineModal against the configured VAT list
    notes: '',
};

const LineModal = ({ invoiceId, line, onSaved, onClose, currentUser, ccy }) => {
    const { isReq } = useFieldConfig('INVOICE_LINE');
    const { getVList, getSetting, lookups } = useLookup();
    const vatOptions = getVList('Tax', 'VATRate');
    const defaultVat = getSetting('Biz.Tax.DefaultVatRate', '5');
    const uoms       = lookups?.uoms || [];

    // TBL_INVOICE_LINE stores the unit as TEXT only (UomName, no UomId), and lines
    // saved before this was a dropdown hold whatever was typed - a code ('LS'), a
    // name ('Lump Sum'), or something not in the UOM master. Map a known code or name
    // to the master NAME so the dropdown shows it selected; leave anything
    // unrecognised untouched so re-saving an old line never erases its unit.
    const toUomName = raw => {
        const s = String(raw || '').trim();
        if (!s) return '';
        const hit = uoms.find(u =>
            String(u.name || '').toLowerCase() === s.toLowerCase() ||
            String(u.code || '').toLowerCase() === s.toLowerCase());
        return hit ? hit.name : s;
    };
    // ── VAT: what is SHOWN must always be what is SAVED ─────────────────────
    // The bug this fixes: Biz.Tax.DefaultVatRate was 5, but 5 was not in the VAT
    // list (0/12/18/15/28). A <select> whose value matches no option displays its
    // FIRST option instead - here "0% (Zero-rated/Exempt)". The user saw 0% already
    // showing, picked it, no change event fired (it was already on screen), and the
    // line saved at the invisible 5%.
    //
    // Rules now: compare numerically (a stored 5.00 must match an option "5"); never
    // start from a rate that is not in the list; and never silently fall back to 0%
    // either - a new line with no valid default starts BLANK and must be chosen.
    const hasVat  = v => v !== '' && v != null;
    const vatHit  = v => hasVat(v) ? vatOptions.find(o => Number(o.value) === Number(v)) : null;
    const asVat   = v => { const hit = vatHit(v); return hit ? String(hit.value) : (hasVat(v) ? String(v) : ''); };

    const [form,   setForm]   = useState(line ? {
        invoiceLineId: line.invoiceLineId,
        lineNum:       line.lineNum,
        description:   line.description   || '',
        uomName:       toUomName(line.uomName),
        unitPrice:     line.unitPrice      ?? '',
        qty:           line.qty            ?? '1',
        vatPercent:    asVat(line.vatPercent),
        notes:         line.notes          || '',
    } : { ...BLANK_LINE, vatPercent: vatHit(defaultVat) ? asVat(defaultVat) : '' });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');
    // Show the unit price with thousands separators when not focused; raw while editing.
    const [priceFocused, setPriceFocused] = useState(false);

    const qty        = Number(form.qty)       || 0;
    const unitPrice  = Number(form.unitPrice) || 0;
    const vatPercent = Number(form.vatPercent)|| 0;
    const amount     = qty * unitPrice;
    const taxAmount  = amount * vatPercent / 100;
    const lineTotal  = amount + taxAmount;

    const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); };

    const validate = () => {
        const e = {};
        if (!form.description.trim())             e.description = 'Description is required.';
        if (!form.qty || Number(form.qty) <= 0)   e.qty         = 'Qty must be > 0.';
        if (Number(form.unitPrice) < 0)           e.unitPrice   = 'Unit Price cannot be negative.';
        // A tax rate must be one that is actually configured - never a phantom default.
        if (!vatHit(form.vatPercent))             e.vatPercent  = 'Choose a VAT rate from the list.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}invoice/line/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                invoiceLineId: form.invoiceLineId,
                invoiceId,
                lineNum:       form.lineNum,
                description:   form.description.trim(),
                uomName:       form.uomName || null,
                unitPrice:     Number(form.unitPrice),
                qty:           Number(form.qty),
                vatPercent:    Number(form.vatPercent),
                notes:         form.notes || null,
                createdBy:     currentUser,
                modifiedBy:    currentUser,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d?.message || 'Save failed.'); return; }
                onSaved();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel">
                <div className="pf-header">
                    <div className="pf-header-title">{form.invoiceLineId ? 'Edit Line' : 'Add Line'}</div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    <FormSection label="Description" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Description {isReq('description') && <span className="req">*</span>}</label>
                            <textarea className={`pf-input pf-textarea${errors.description ? ' pf-input-err' : ''}`}
                                rows={2}
                                placeholder="Item / service description…"
                                value={form.description}
                                onChange={e => set('description', e.target.value)} />
                            {errors.description && <span className="pf-field-err">{errors.description}</span>}
                        </div>
                    </div>

                    <FormSection label="Quantity & Pricing" />
                    <div className="pf-row">
                        <div className="pf-field" style={{ flex: '0 0 110px' }}>
                            <label>Qty {isReq('qty') && <span className="req">*</span>}</label>
                            <input type="number" min="0.0001" step="any"
                                className={`pf-input${errors.qty ? ' pf-input-err' : ''}`}
                                value={form.qty}
                                onChange={e => set('qty', e.target.value)} />
                            {errors.qty && <span className="pf-field-err">{errors.qty}</span>}
                        </div>
                        {/* Wider than the old 100px text box - "Lump Sum (LS)" must fit. */}
                        <div className="pf-field" style={{ flex: '0 0 150px' }}>
                            <label>UOM</label>
                            <select className="pf-input"
                                value={form.uomName}
                                onChange={e => set('uomName', e.target.value)}>
                                <option value="">— Select —</option>
                                {/* A legacy value not in the master stays selectable, so editing
                                    an old line never silently wipes its unit. */}
                                {form.uomName && !uoms.some(u => u.name === form.uomName) && (
                                    <option value={form.uomName}>{form.uomName} (not in UOM list)</option>
                                )}
                                {uoms.map(u => (
                                    <option key={u.id} value={u.name}>
                                        {u.name}{u.code && u.code !== u.name ? ` (${u.code})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="pf-field">
                            <label>Unit Price</label>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                {ccy && (
                                    <span style={{
                                        padding: '0 8px', height: 36, display: 'flex', alignItems: 'center',
                                        background: '#f1f5f9', border: '1px solid #d1d5db', borderRight: 'none',
                                        borderRadius: '6px 0 0 6px', fontSize: 12, fontWeight: 700,
                                        color: '#475569', whiteSpace: 'nowrap', flexShrink: 0,
                                    }}>{ccy}</span>
                                )}
                                <input type="text" inputMode="decimal"
                                    className={`pf-input${errors.unitPrice ? ' pf-input-err' : ''}`}
                                    style={ccy ? { borderRadius: '0 6px 6px 0', borderLeft: 'none', textAlign: 'right' } : { textAlign: 'right' }}
                                    value={priceFocused
                                        ? form.unitPrice
                                        : (form.unitPrice !== '' ? fmt(unitPrice) : '')}
                                    onChange={e => set('unitPrice', e.target.value.replace(/[^0-9.]/g, ''))}
                                    onBlur={e => {
                                        setPriceFocused(false);
                                        const n = parseFloat(e.target.value.replace(/,/g, ''));
                                        if (!isNaN(n)) set('unitPrice', n.toFixed(2));
                                    }}
                                    onFocus={() => {
                                        setPriceFocused(true);
                                        const n = parseFloat(form.unitPrice);
                                        if (!isNaN(n) && n === 0) set('unitPrice', '');
                                    }}
                                    placeholder="0.00" />
                            </div>
                            {errors.unitPrice && <span className="pf-field-err">{errors.unitPrice}</span>}
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 110px' }}>
                            <label>VAT %</label>
                            <select className={`pf-input${errors.vatPercent ? ' pf-input-err' : ''}`}
                                value={form.vatPercent}
                                onChange={e => set('vatPercent', e.target.value)}>
                                {/* Explicit placeholder, so an unset rate is visibly unset instead
                                    of the browser silently displaying the first option. */}
                                {!hasVat(form.vatPercent) && <option value="">— Select VAT —</option>}
                                {/* An old line saved at a rate no longer in the list stays visible
                                    as itself, so choosing another rate genuinely changes the value. */}
                                {hasVat(form.vatPercent) && !vatHit(form.vatPercent) && (
                                    <option value={form.vatPercent}>{form.vatPercent}% (not in VAT list)</option>
                                )}
                                {vatOptions.map(o => (
                                    <option key={o.value} value={String(o.value)}>{o.label}</option>
                                ))}
                            </select>
                            {errors.vatPercent && <span className="pf-field-err">{errors.vatPercent}</span>}
                        </div>
                    </div>

                    {/* Live totals preview */}
                    <div style={{
                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                        padding: '12px 16px', marginTop: 4, display: 'flex', gap: 24,
                    }}>
                        {[
                            { label: 'Amount',           val: `${ccy ? ccy + ' ' : ''}${fmt(amount)}`,   color: '#1e293b' },
                            { label: `Tax (${vatPercent}%)`, val: `${ccy ? ccy + ' ' : ''}${fmt(taxAmount)}`, color: '#64748b' },
                            { label: 'Line Total',       val: `${ccy ? ccy + ' ' : ''}${fmt(lineTotal)}`, color: '#1e40af', bold: true },
                        ].map(item => (
                            <div key={item.label}>
                                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>
                                    {item.label}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontWeight: item.bold ? 700 : 600, fontSize: item.bold ? 15 : 14, color: item.color }}>
                                    {item.val}
                                </div>
                            </div>
                        ))}
                    </div>

                    <FormSection label="Notes" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Line Notes</label>
                            <input className="pf-input" placeholder="Optional line note…"
                                value={form.notes} onChange={e => set('notes', e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : (form.invoiceLineId ? 'Update Line' : 'Add Line')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main Lines Tab ───────────────────────────────────────────────────
const InvoiceLinesTab = ({ invoice, lines = [], onRefresh }) => {
    const currentUser     = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const [editLine,    setEditLine]    = useState(null);   // null=closed, 0=new, obj=edit
    const [deleting,    setDeleting]    = useState(null);
    const [showImport,  setShowImport]  = useState(false);
    // Delete-line error surfaces here. (LineModal has its own `error` state for
    // save errors — that one is scoped to the modal and not visible from here.)
    const [deleteError, setDeleteError] = useState('');
    const [confirm,     setConfirm]     = useState(null);

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('INV', invoice?.status)?.canEdit ?? (invoice?.status === 'Draft')) && canDo('/invoices', 'EDIT');

    const deleteLine = (line) => {
        setConfirm({
            title: 'Delete Line',
            message: `Delete line "${line.description}"?`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setDeleting(line.invoiceLineId);
                setDeleteError('');
                try {
                    const res = await fetch(
                        `${variables.API_URL}invoice/line/${line.invoiceLineId}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setDeleteError(d?.message || `Delete failed (HTTP ${res.status}).`); return; }
                    onRefresh();
                } catch (e) { setDeleteError(`Network error — ${e?.message || 'could not reach the server.'}`); }
                finally { setDeleting(null); }
            },
        });
    };

    const subTotal   = lines.reduce((s, l) => s + (l.amount    || 0), 0);
    const taxTotal   = lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    const grandTotal = subTotal + taxTotal;
    const ccy        = invoice.currencyShort || invoice.currencyCode || '';

    return (
        <div className="jd-tab-body">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            <InlineError error={deleteError} onDismiss={() => setDeleteError('')} />
            {canEdit && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
                    <button className="po-btn-sec" style={{ fontSize: 13, padding: '7px 16px' }}
                            onClick={() => setShowImport(true)}>
                        📥 Import from Excel
                    </button>
                    <button className="po-btn-pri" style={{ fontSize: 13, padding: '7px 16px' }}
                            onClick={() => setEditLine(0)}>
                        + Add Line
                    </button>
                </div>
            )}

            {lines.length === 0 ? (
                <div className="jd-empty-card">
                    No lines added yet.{canEdit && ' Click "+ Add Line" to start.'}
                </div>
            ) : (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={TH}>#</th>
                                    <th style={{ ...TH, textAlign: 'left', minWidth: 220 }}>Description</th>
                                    <th style={{ ...TH, width: 60 }}>UOM</th>
                                    <th style={{ ...TH_NUM, width: 80 }}>Qty</th>
                                    <th style={{ ...TH_NUM, width: 110 }}>Unit Price</th>
                                    <th style={{ ...TH_NUM, width: 110 }}>Amount</th>
                                    <th style={{ ...TH_NUM, width: 60 }}>VAT %</th>
                                    <th style={{ ...TH_NUM, width: 100 }}>Tax Amt</th>
                                    <th style={{ ...TH_NUM, width: 110, color: '#1e40af' }}>Total</th>
                                    {canEdit && <th style={{ ...TH, width: 80 }}></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, i) => {
                                    const lineTotal = (l.amount || 0) + (l.taxAmount || 0);
                                    return (
                                        <tr key={l.invoiceLineId}
                                            style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                            <td style={{ ...TD, color: '#94a3b8', width: 30 }}>{l.lineNum}</td>
                                            <td style={TD}>
                                                <div>{l.description}</div>
                                                {l.notes && (
                                                    <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                                                        {l.notes}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ ...TD, color: '#475569', textAlign: 'center' }}>
                                                {l.uomName || '—'}
                                            </td>
                                            <td style={TD_NUM}>{fmt(l.qty, 4).replace(/\.?0+$/, '')}</td>
                                            <td style={TD_NUM}>{ccy && <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 3 }}>{ccy}</span>}{fmt(l.unitPrice)}</td>
                                            <td style={TD_NUM}>{ccy && <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 3 }}>{ccy}</span>}{fmt(l.amount)}</td>
                                            <td style={{ ...TD_NUM, color: '#64748b' }}>{l.vatPercent}%</td>
                                            <td style={{ ...TD_NUM, color: '#64748b' }}>{ccy && <span style={{ fontSize: 11, marginRight: 3 }}>{ccy}</span>}{fmt(l.taxAmount)}</td>
                                            <td style={{ ...TD_NUM, fontWeight: 700, color: '#1e3a5f' }}>{ccy && <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 3 }}>{ccy}</span>}{fmt(lineTotal)}</td>
                                            {canEdit && (
                                                <td style={{ ...TD, textAlign: 'right' }}>
                                                    <button style={ACT_BTN} onClick={() => setEditLine(l)}>✎</button>
                                                    <button style={{ ...ACT_BTN, color: '#dc2626', marginLeft: 4 }}
                                                            onClick={() => deleteLine(l)}
                                                            disabled={deleting === l.invoiceLineId}>
                                                        {deleting === l.invoiceLineId ? '…' : '✕'}
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals footer */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <div style={{ width: 300, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={TOT_ROW}>
                                <span style={{ color: '#64748b' }}>Sub Total</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ccy && <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 4 }}>{ccy}</span>}{fmt(subTotal)}</span>
                            </div>
                            <div style={TOT_ROW}>
                                <span style={{ color: '#64748b' }}>Tax Amount</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#64748b' }}>{ccy && <span style={{ fontSize: 11, marginRight: 4 }}>{ccy}</span>}{fmt(taxTotal)}</span>
                            </div>
                            <div style={{ ...TOT_ROW, background: '#1e3a5f', color: '#fff', padding: '10px 16px', fontWeight: 700 }}>
                                <span>Total Amount</span>
                                <span style={{ fontFamily: 'monospace', fontSize: 16 }}>{ccy && <span style={{ fontSize: 12, marginRight: 5, opacity: 0.75 }}>{ccy}</span>}{fmt(grandTotal)}</span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {editLine !== null && (
                <LineModal
                    invoiceId={invoice.invoiceId}
                    line={editLine === 0 ? null : editLine}
                    currentUser={currentUser}
                    ccy={invoice.currencyShort || invoice.currencyCode || ''}
                    onSaved={() => { setEditLine(null); onRefresh(); }}
                    onClose={() => setEditLine(null)}
                />
            )}
            {showImport && (
                <InvoiceImportModal
                    invoice={invoice}
                    onClose={() => setShowImport(false)}
                    onImported={() => { setShowImport(false); onRefresh(); }}
                />
            )}
        </div>
    );
};

// ── Styles ────────────────────────────────────────────────────────────
const TH     = { padding: '9px 10px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#475569', whiteSpace: 'nowrap' };
const TH_NUM = { ...TH, textAlign: 'right' };
const TD     = { padding: '8px 10px', verticalAlign: 'top' };
const TD_NUM = { ...TD, textAlign: 'right', fontFamily: 'Courier New, monospace', fontSize: 12 };
const TOT_ROW = { display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const ACT_BTN = { padding: '3px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 13, cursor: 'pointer', color: '#475569' };

export default InvoiceLinesTab;
