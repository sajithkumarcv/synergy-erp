import React, { useState, useRef, useEffect, useCallback } from 'react';
import { variables, authHeaders, getFileUrl } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import useOwnerCompany, { clearOwnerCompanyCache } from '../hooks/useOwnerCompany';
import ValidationModal from '../common/ValidationModal';
import './Settings.css';

const ALLOWED = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

// ── Reusable field ───────────────────────────────────────────────
const Field = ({ label, name, value, onChange, placeholder, type = 'text', full, req }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn: full ? '1 / -1' : undefined }}>
        <label style={{ fontSize:11.5, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em' }}>
            {label}{req && <span style={{ color:'#e53e3e' }}> *</span>}
        </label>
        {type === 'textarea' ? (
            <textarea name={name} value={value || ''} onChange={onChange} placeholder={placeholder} rows={3}
                style={{ border:'1px solid #cbd5e1', borderRadius:6, padding:'7px 10px',
                         fontSize:13, color:'#0f172a', resize:'vertical', fontFamily:'inherit' }} />
        ) : (
            <input type={type} name={name} value={value || ''} onChange={onChange} placeholder={placeholder}
                style={{ border:'1px solid #cbd5e1', borderRadius:6, padding:'7px 10px', fontSize:13, color:'#0f172a' }} />
        )}
    </div>
);

// ── Read-only info row ───────────────────────────────────────────
const InfoRow = ({ label, value }) => !value ? null : (
    <div style={{ display:'flex', gap:8, alignItems:'baseline', padding:'5px 0', borderBottom:'1px solid #f1f5f9' }}>
        <span style={{ color:'#64748b', fontSize:12, minWidth:130, flexShrink:0 }}>{label}</span>
        <span style={{ color:'#0f172a', fontSize:13, fontWeight:500 }}>{value}</span>
    </div>
);

// ── Primary badge ────────────────────────────────────────────────
const PrimaryBadge = () => (
    <span style={{ background:'#dcfce7', color:'#166534', fontSize:10, fontWeight:700,
                   padding:'2px 8px', borderRadius:20, letterSpacing:'.3px' }}>PRIMARY</span>
);

// ════════════════════════════════════════════════════════════════
//  TAB 1 — COMPANY INFO
// ════════════════════════════════════════════════════════════════
const InfoTab = ({ company, onRefresh }) => {
    const [editing,   setEditing]   = useState(false);
    const [form,      setForm]      = useState(null);
    const [saving,    setSaving]    = useState(false);
    const [validErrs, setValidErrs] = useState(null);

    const [preview,   setPreview]   = useState(null);
    const [file,      setFile]      = useState(null);
    const [uploading, setUploading] = useState(false);
    const [logoErr,   setLogoErr]   = useState('');
    const fileRef = useRef();

    useEffect(() => { setPreview(null); setFile(null); }, [company]);

    const startEdit = () => {
        setForm({
            companyName: company?.companyName || '',
            displayName: company?.displayName || '',
            companyCode: company?.companyCode || '',
            trn:         company?.trn         || '',
            phone:       company?.phone       || '',
            fax:         company?.fax         || '',
            email:       company?.email       || '',
            website:     company?.website     || '',
            printNote:   company?.printNote   || '',
        });
        setEditing(true);
    };
    const cancelEdit = () => { setEditing(false); setForm(null); };
    const handle = (e) => { const { name, value } = e.target; setForm(p => ({ ...p, [name]: value })); };

    const save = async () => {
        if (!form.companyName?.trim()) { setValidErrs(['Company Name is required.']); return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}company/owner`, {
                method:'PUT', headers: authHeaders(), body: JSON.stringify(form),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setValidErrs([d?.message || 'Failed to save.']); return; }
            clearOwnerCompanyCache();
            cancelEdit();
            onRefresh();
        } catch { setValidErrs(['Network error. Please try again.']); }
        finally { setSaving(false); }
    };

    const handleFile = (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setLogoErr('');
        if (!ALLOWED.includes(f.type))    { setLogoErr('Only PNG, JPG, SVG or WEBP files are allowed.'); return; }
        if (f.size > 2 * 1024 * 1024)    { setLogoErr('File must be under 2 MB.'); return; }
        setFile(f); setPreview(URL.createObjectURL(f));
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true); setLogoErr('');
        try {
            const fd = new FormData(); fd.append('file', file);
            const token = sessionStorage.getItem('erp_token') || '';
            const res = await fetch(`${variables.API_URL}company/upload-logo`, {
                method:'POST', headers: { Authorization:`Bearer ${token}` }, body: fd,
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setLogoErr(d?.message || 'Upload failed.'); return; }
            clearOwnerCompanyCache(); onRefresh();
        } catch { setLogoErr('Network error. Please try again.'); }
        finally { setUploading(false); }
    };

    const displaySrc = preview || getFileUrl(company?.logoPath);

    return (
        <>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
                {!editing && (
                    <button className="ds-edit-btn" style={{ padding:'7px 18px', fontSize:13 }} onClick={startEdit}>
                        ✏️ Edit Details
                    </button>
                )}
            </div>

            {editing && form ? (
                <div className="ds-overlay">
                    <div className="ds-panel" onClick={e => e.stopPropagation()}>
                        <div className="ds-panel-header">
                            <div>
                                <div style={{ fontWeight:700, fontSize:15, color:'#0f172a' }}>Edit Company Details</div>
                                <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Changes apply to all printed documents</div>
                            </div>
                            <button className="ds-close" onClick={cancelEdit}>✕</button>
                        </div>
                        <div className="ds-panel-body">
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                                <Field label="Company Name" name="companyName" value={form.companyName} onChange={handle} full req
                                       placeholder="Full legal name used on PO / Invoice prints" />
                                <Field label="Display Name" name="displayName" value={form.displayName} onChange={handle} full
                                       placeholder="Short name shown in the app header (e.g. SYNERGY)" />
                                <Field label="Company Code" name="companyCode" value={form.companyCode} onChange={handle} placeholder="e.g. SIP" />
                                <Field label="TRN / GST No." name="trn"    value={form.trn}     onChange={handle} placeholder="Tax registration number" />
                                <Field label="Phone"         name="phone"   value={form.phone}   onChange={handle} placeholder="+971 XXXXXXXXXX" />
                                <Field label="Fax"           name="fax"     value={form.fax}     onChange={handle} placeholder="+971 XXXXXXXXXX" />
                                <Field label="Email"         name="email"   value={form.email}   onChange={handle} type="email" placeholder="info@company.com" />
                                <Field label="Website"       name="website" value={form.website} onChange={handle} placeholder="www.company.com" />
                                <Field label="Print Note"    name="printNote" value={form.printNote} onChange={handle} type="textarea"
                                       placeholder="Note printed at the bottom of invoices/POs…" full />
                            </div>
                        </div>
                        <div className="ds-panel-footer">
                            <button className="ds-edit-btn" onClick={cancelEdit}>Cancel</button>
                            <button onClick={save} disabled={saving}
                                style={{ background: saving ? '#94a3b8' : '#2e5fa3', color:'#fff',
                                         border:'none', borderRadius:6, padding:'7px 22px',
                                         fontSize:13, fontWeight:600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                    {validErrs && <ValidationModal errors={validErrs} onClose={() => setValidErrs(null)} />}
                </div>
            ) : null}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:900 }}>
                {/* Company details */}
                <div className="ds-card" style={{ gridColumn:'1 / -1' }}>
                    <div className="ds-card-top">
                        <span className="ds-card-badge">INFO</span>
                        <span className="ds-card-name">Company Details</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 32px' }}>
                        <div>
                            <InfoRow label="Company Name"  value={company?.companyName} />
                            <InfoRow label="Display Name"  value={company?.displayName} />
                            <InfoRow label="Code"          value={company?.companyCode} />
                            <InfoRow label="TRN / GST"     value={company?.trn} />
                            <InfoRow label="Phone"         value={company?.phone} />
                        </div>
                        <div>
                            <InfoRow label="Fax"     value={company?.fax} />
                            <InfoRow label="Email"   value={company?.email} />
                            <InfoRow label="Website" value={company?.website} />
                        </div>
                    </div>
                    {company?.printNote && (
                        <div style={{ marginTop:10, padding:'8px 12px', background:'#f8fafc',
                                      border:'1px solid #e2e8f0', borderRadius:6,
                                      fontSize:12, color:'#475569', fontStyle:'italic' }}>
                            <span style={{ fontWeight:700, fontStyle:'normal', color:'#64748b',
                                           fontSize:10, textTransform:'uppercase', letterSpacing:'.05em',
                                           display:'block', marginBottom:3 }}>Print Note</span>
                            {company.printNote}
                        </div>
                    )}
                </div>

                {/* Logo preview */}
                <div className="ds-card">
                    <div className="ds-card-top">
                        <span className="ds-card-badge">LOGO</span>
                        <span className="ds-card-name">Company Logo</span>
                    </div>
                    <div style={{ background:'#f8fafc', border:'1px dashed #cbd5e1', borderRadius:8,
                                  padding:20, display:'flex', alignItems:'center', justifyContent:'center', minHeight:110 }}>
                        {displaySrc
                            ? <img src={displaySrc} alt="Logo" style={{ maxHeight:90, maxWidth:'100%', objectFit:'contain' }}
                                   onError={e => { e.target.style.display='none'; }} />
                            : <span style={{ color:'#94a3b8', fontSize:13 }}>No logo set</span>}
                    </div>
                    {preview && (
                        <div style={{ fontSize:11.5, color:'#f59e0b', background:'#fffbeb',
                                      border:'1px solid #fde68a', borderRadius:5, padding:'5px 10px' }}>
                            ⚠ Preview — not saved yet
                        </div>
                    )}
                </div>

                {/* Logo upload */}
                <div className="ds-card">
                    <div className="ds-card-top">
                        <span className="ds-card-badge">UPLOAD</span>
                        <span className="ds-card-name">Upload New Logo</span>
                    </div>
                    <div style={{ fontSize:12, color:'#64748b', lineHeight:1.6 }}>
                        Formats: <strong>PNG, JPG, SVG, WEBP</strong> · Max: <strong>2 MB</strong> · Recommended: <strong>400×120 px</strong>
                    </div>
                    <div style={{ border:'2px dashed #c8d4e4', borderRadius:8, padding:'16px 12px',
                                  textAlign:'center', cursor:'pointer', background:'#f8fafc' }}
                         onClick={() => fileRef.current?.click()}
                         onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#2e5fa3'; }}
                         onDragLeave={e => { e.currentTarget.style.borderColor='#c8d4e4'; }}
                         onDrop={e => {
                             e.preventDefault(); e.currentTarget.style.borderColor='#c8d4e4';
                             const f = e.dataTransfer.files?.[0];
                             if (f) { const dt = new DataTransfer(); dt.items.add(f); fileRef.current.files = dt.files; handleFile({ target:{ files:dt.files } }); }
                         }}>
                        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp"
                               style={{ display:'none' }} onChange={handleFile} />
                        <div style={{ fontSize:26, marginBottom:4 }}>🖼</div>
                        <div style={{ fontSize:13, color:'#475569' }}>
                            {file ? <><strong>{file.name}</strong><br />{(file.size/1024).toFixed(1)} KB</>
                                  : <>Click to browse or drag &amp; drop</>}
                        </div>
                    </div>
                    {logoErr && (
                        <div style={{ fontSize:12.5, color:'#dc2626', background:'#fee2e2',
                                      border:'1px solid #fca5a5', borderRadius:5, padding:'6px 10px' }}>⚠ {logoErr}</div>
                    )}
                    <button onClick={handleUpload} disabled={!file || uploading}
                        style={{ background:(!file||uploading)?'#94a3b8':'#2e5fa3', color:'#fff',
                                 border:'none', borderRadius:7, padding:'8px 18px', fontSize:13,
                                 fontWeight:600, cursor:(!file||uploading)?'not-allowed':'pointer' }}>
                        {uploading ? 'Uploading…' : '⬆ Upload Logo'}
                    </button>
                </div>
            </div>
        </>
    );
};

// ════════════════════════════════════════════════════════════════
//  TAB 2 — ADDRESSES
// ════════════════════════════════════════════════════════════════
const ADDR_BLANK = { addressId:0, addressLine1:'', addressLine2:'', city:'', state:'', country:'', isPrimary:false, sortOrder:0 };

const AddressesTab = ({ company, onRefresh }) => {
    const currentUser = useCurrentUser();
    const [panel,      setPanel]      = useState(null);
    const [form,       setForm]       = useState({});
    const [saving,     setSaving]     = useState(false);
    const [deleting,   setDeleting]   = useState(null);
    const [err,        setErr]        = useState('');
    const [confirmDel, setConfirmDel] = useState(null); // { addressId, label }

    const addresses = company?.addresses || [];

    const openAdd  = () => { setForm({ ...ADDR_BLANK }); setErr(''); setPanel('add'); };
    const openEdit = (a) => { setForm({ ...a, isPrimary:!!a.isPrimary }); setErr(''); setPanel(a); };
    const closePanel = () => { setPanel(null); setForm({}); setErr(''); };

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = async () => {
        if (!form.addressLine1?.trim()) { setErr('Address Line 1 is required.'); return; }
        setSaving(true); setErr('');
        try {
            const res = await fetch(`${variables.API_URL}company/address`, {
                method:'POST', headers: authHeaders(),
                body: JSON.stringify({ ...form, createdBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d?.message || 'Failed to save address.'); return; }
            clearOwnerCompanyCache(); closePanel(); onRefresh();
        } catch { setErr('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    const del = async (id) => {
        setDeleting(id);
        try {
            await fetch(`${variables.API_URL}company/address/${id}`, { method:'DELETE', headers: authHeaders() });
            clearOwnerCompanyCache(); onRefresh();
        } catch { setErr('Network error. Please try again.'); }
        finally { setDeleting(null); setConfirmDel(null); }
    };

    return (
        <>
            {/* Delete confirm modal */}
            {confirmDel && (
                <div className="ds-overlay">
                    <div style={{ background:'#fff', borderRadius:12, padding:28, width:380,
                                  boxShadow:'0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize:20, marginBottom:8 }}>🗑️</div>
                        <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Delete Address</div>
                        <div style={{ fontSize:13, color:'#475569', marginBottom:22, lineHeight:1.6 }}>
                            Delete <strong>"{confirmDel.label}"</strong>? This cannot be undone.
                        </div>
                        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                            <button className="ds-edit-btn" onClick={() => setConfirmDel(null)}>Cancel</button>
                            <button onClick={() => del(confirmDel.addressId)}
                                style={{ background:'#ef4444', color:'#fff', border:'none', borderRadius:6,
                                         padding:'7px 20px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                                {deleting === confirmDel.addressId ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Slide-over panel */}
            {panel !== null && (
                <div className="ds-overlay">
                    <div className="ds-panel" onClick={e => e.stopPropagation()}>
                        <div className="ds-panel-header">
                            <div>
                                <div style={{ fontWeight:700, fontSize:15, color:'#0f172a' }}>
                                    {panel === 'add' ? 'Add Address' : 'Edit Address'}
                                </div>
                                <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Company branch / office address</div>
                            </div>
                            <button className="ds-close" onClick={closePanel}>✕</button>
                        </div>
                        <div className="ds-panel-body">
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                                <Field label="Address Line 1" name="addressLine1" value={form.addressLine1} onChange={handle} full req placeholder="Street / Building" />
                                <Field label="Address Line 2" name="addressLine2" value={form.addressLine2} onChange={handle} full placeholder="Floor / PO Box" />
                                <Field label="City"    name="city"    value={form.city}    onChange={handle} placeholder="Dubai" />
                                <Field label="State"   name="state"   value={form.state}   onChange={handle} placeholder="Dubai" />
                                <Field label="Country" name="country" value={form.country} onChange={handle} placeholder="United Arab Emirates" full />
                                <Field label="Sort Order" name="sortOrder" value={form.sortOrder} onChange={handle} type="number" placeholder="0" />
                                <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:8 }}>
                                    <input type="checkbox" id="addrPrimary" name="isPrimary"
                                           checked={!!form.isPrimary} onChange={handle}
                                           style={{ accentColor:'#2e5fa3', width:15, height:15 }} />
                                    <label htmlFor="addrPrimary" style={{ fontSize:13, color:'#334155', cursor:'pointer', userSelect:'none' }}>
                                        Set as Primary Address
                                    </label>
                                </div>
                            </div>
                            {err && <div style={{ color:'#dc2626', fontSize:12.5, background:'#fee2e2',
                                                  border:'1px solid #fca5a5', borderRadius:5, padding:'6px 10px' }}>⚠ {err}</div>}
                        </div>
                        <div className="ds-panel-footer">
                            <button className="ds-edit-btn" onClick={closePanel}>Cancel</button>
                            <button onClick={save} disabled={saving}
                                style={{ background: saving ? '#94a3b8' : '#2e5fa3', color:'#fff',
                                         border:'none', borderRadius:6, padding:'7px 22px',
                                         fontSize:13, fontWeight:600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Saving…' : 'Save Address'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
                <button className="cs-add-btn" onClick={openAdd}>+ Add Address</button>
            </div>

            {addresses.length === 0 ? (
                <div className="cs-empty">No addresses configured yet. Click <strong>+ Add Address</strong> to add one.</div>
            ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:900 }}>
                    {addresses.map(a => (
                        <div key={a.addressId} className={`cs-row-card ${a.isPrimary ? 'cs-row-primary' : ''}`}>
                            <div className="cs-row-icon">🏢</div>
                            <div className="cs-row-body">
                                <div className="cs-row-title">
                                    {[a.addressLine1, a.addressLine2].filter(Boolean).join(', ')}
                                    {a.isPrimary && <PrimaryBadge />}
                                </div>
                                <div className="cs-row-sub">
                                    {[a.city, a.state, a.country].filter(Boolean).join(', ')}
                                </div>
                            </div>
                            <div className="cs-row-actions">
                                <button className="ds-edit-btn" onClick={() => openEdit(a)}>✏ Edit</button>
                                <button className="cs-del-btn"
                                        onClick={() => setConfirmDel({ addressId: a.addressId, label: a.addressLine1 })}
                                        disabled={deleting === a.addressId}>
                                    {deleting === a.addressId ? '…' : '✕'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

// ════════════════════════════════════════════════════════════════
//  TAB 3 — BANK ACCOUNTS
// ════════════════════════════════════════════════════════════════
const BANK_BLANK = { bankId:0, bankName:'', beneficiary:'', accountNo:'', iban:'', swift:'', currency:'', branchAddress:'', isPrimary:false, sortOrder:0 };

const BanksTab = ({ company, onRefresh }) => {
    const currentUser = useCurrentUser();
    const [panel,      setPanel]      = useState(null);
    const [form,       setForm]       = useState({});
    const [saving,     setSaving]     = useState(false);
    const [deleting,   setDeleting]   = useState(null);
    const [err,        setErr]        = useState('');
    const [confirmDel, setConfirmDel] = useState(null); // { bankId, label }

    const banks = company?.banks || [];

    const openAdd  = () => { setForm({ ...BANK_BLANK }); setErr(''); setPanel('add'); };
    const openEdit = (b) => { setForm({ ...b, isPrimary:!!b.isPrimary }); setErr(''); setPanel(b); };
    const closePanel = () => { setPanel(null); setForm({}); setErr(''); };

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = async () => {
        if (!form.bankName?.trim()) { setErr('Bank Name is required.'); return; }
        setSaving(true); setErr('');
        try {
            const res = await fetch(`${variables.API_URL}company/bank`, {
                method:'POST', headers: authHeaders(),
                body: JSON.stringify({ ...form, createdBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d?.message || 'Failed to save bank account.'); return; }
            clearOwnerCompanyCache(); closePanel(); onRefresh();
        } catch { setErr('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    const del = async (id) => {
        setDeleting(id);
        try {
            await fetch(`${variables.API_URL}company/bank/${id}`, { method:'DELETE', headers: authHeaders() });
            clearOwnerCompanyCache(); onRefresh();
        } catch { setErr('Network error. Please try again.'); }
        finally { setDeleting(null); setConfirmDel(null); }
    };

    return (
        <>
            {/* Delete confirm modal */}
            {confirmDel && (
                <div className="ds-overlay">
                    <div style={{ background:'#fff', borderRadius:12, padding:28, width:380,
                                  boxShadow:'0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize:20, marginBottom:8 }}>🗑️</div>
                        <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Delete Bank Account</div>
                        <div style={{ fontSize:13, color:'#475569', marginBottom:22, lineHeight:1.6 }}>
                            Delete <strong>"{confirmDel.label}"</strong>? This cannot be undone.
                        </div>
                        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                            <button className="ds-edit-btn" onClick={() => setConfirmDel(null)}>Cancel</button>
                            <button onClick={() => del(confirmDel.bankId)}
                                style={{ background:'#ef4444', color:'#fff', border:'none', borderRadius:6,
                                         padding:'7px 20px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                                {deleting === confirmDel.bankId ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {panel !== null && (
                <div className="ds-overlay">
                    <div className="ds-panel" onClick={e => e.stopPropagation()}>
                        <div className="ds-panel-header">
                            <div>
                                <div style={{ fontWeight:700, fontSize:15, color:'#0f172a' }}>
                                    {panel === 'add' ? 'Add Bank Account' : 'Edit Bank Account'}
                                </div>
                                <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Bank account details used on printed documents</div>
                            </div>
                            <button className="ds-close" onClick={closePanel}>✕</button>
                        </div>
                        <div className="ds-panel-body">
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                                <Field label="Bank Name"    name="bankName"    value={form.bankName}    onChange={handle} full req placeholder="e.g. Emirates NBD" />
                                <Field label="Beneficiary" name="beneficiary" value={form.beneficiary} onChange={handle} full placeholder="Account holder name" />
                                <Field label="Account No." name="accountNo"   value={form.accountNo}   onChange={handle} placeholder="1234567890" />
                                <Field label="IBAN"        name="iban"        value={form.iban}        onChange={handle} placeholder="AE070331234567890123456" />
                                <Field label="SWIFT / BIC" name="swift"       value={form.swift}       onChange={handle} placeholder="EBILAEAD" />
                                <Field label="Currency"    name="currency"    value={form.currency}    onChange={handle} placeholder="AED" />
                                <Field label="Branch Address" name="branchAddress" value={form.branchAddress} onChange={handle} type="textarea" full
                                       placeholder="Branch name and address" />
                                <Field label="Sort Order" name="sortOrder" value={form.sortOrder} onChange={handle} type="number" placeholder="0" />
                                <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:8 }}>
                                    <input type="checkbox" id="bankPrimary" name="isPrimary"
                                           checked={!!form.isPrimary} onChange={handle}
                                           style={{ accentColor:'#2e5fa3', width:15, height:15 }} />
                                    <label htmlFor="bankPrimary" style={{ fontSize:13, color:'#334155', cursor:'pointer', userSelect:'none' }}>
                                        Set as Primary Bank Account
                                    </label>
                                </div>
                            </div>
                            {err && <div style={{ color:'#dc2626', fontSize:12.5, background:'#fee2e2',
                                                  border:'1px solid #fca5a5', borderRadius:5, padding:'6px 10px' }}>⚠ {err}</div>}
                        </div>
                        <div className="ds-panel-footer">
                            <button className="ds-edit-btn" onClick={closePanel}>Cancel</button>
                            <button onClick={save} disabled={saving}
                                style={{ background: saving ? '#94a3b8' : '#2e5fa3', color:'#fff',
                                         border:'none', borderRadius:6, padding:'7px 22px',
                                         fontSize:13, fontWeight:600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Saving…' : 'Save Bank Account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
                <button className="cs-add-btn" onClick={openAdd}>+ Add Bank Account</button>
            </div>

            {banks.length === 0 ? (
                <div className="cs-empty">No bank accounts configured yet. Click <strong>+ Add Bank Account</strong> to add one.</div>
            ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:900 }}>
                    {banks.map(b => (
                        <div key={b.bankId} className={`cs-row-card ${b.isPrimary ? 'cs-row-primary' : ''}`}>
                            <div className="cs-row-icon">🏦</div>
                            <div className="cs-row-body">
                                <div className="cs-row-title">
                                    {b.bankName}
                                    {b.isPrimary && <PrimaryBadge />}
                                </div>
                                <div className="cs-row-sub">
                                    {b.beneficiary && <span><strong>Beneficiary:</strong> {b.beneficiary}</span>}
                                    {b.accountNo   && <span> · <strong>A/C:</strong> {b.accountNo}</span>}
                                    {b.iban        && <span> · <strong>IBAN:</strong> {b.iban}</span>}
                                    {b.swift       && <span> · <strong>SWIFT:</strong> {b.swift}</span>}
                                    {b.currency    && <span> · {b.currency}</span>}
                                </div>
                                {b.branchAddress && (
                                    <div style={{ fontSize:11.5, color:'#94a3b8', marginTop:3 }}>{b.branchAddress}</div>
                                )}
                            </div>
                            <div className="cs-row-actions">
                                <button className="ds-edit-btn" onClick={() => openEdit(b)}>✏ Edit</button>
                                <button className="cs-del-btn"
                                        onClick={() => setConfirmDel({ bankId: b.bankId, label: b.bankName })}
                                        disabled={deleting === b.bankId}>
                                    {deleting === b.bankId ? '…' : '✕'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

// ════════════════════════════════════════════════════════════════
//  MAIN — CompanySettings
// ════════════════════════════════════════════════════════════════
const TABS = [
    { key:'info',      label:'Company Info',   icon:'🏢' },
    { key:'addresses', label:'Addresses',       icon:'📍' },
    { key:'banks',     label:'Bank Accounts',   icon:'🏦' },
];

const CompanySettings = () => {
    const [activeTab, setActiveTab] = useState('info');
    const { company, loading, refetch } = useOwnerCompany();

    const refresh = useCallback(() => { refetch(); }, [refetch]);

    return (
        <div className="ds-page">
            {/* Page header */}
            <div className="ds-header">
                <div>
                    <div className="ds-page-title">Company Settings</div>
                    <div className="ds-page-sub">Manage your company profile, addresses and bank accounts</div>
                </div>
            </div>

            {/* Tab bar */}
            <div className="cs-tab-bar">
                {TABS.map(t => (
                    <button key={t.key}
                            className={`cs-tab ${activeTab === t.key ? 'cs-tab-active' : ''}`}
                            onClick={() => setActiveTab(t.key)}>
                        <span>{t.icon}</span> {t.label}
                        {t.key === 'addresses' && !loading && company?.addresses?.length > 0 &&
                            <span className="cs-tab-count">{company.addresses.length}</span>}
                        {t.key === 'banks' && !loading && company?.banks?.length > 0 &&
                            <span className="cs-tab-count">{company.banks.length}</span>}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="cs-tab-body">
                {loading ? (
                    <div className="ds-loading">Loading…</div>
                ) : (
                    <>
                        {activeTab === 'info'      && <InfoTab      company={company} onRefresh={refresh} />}
                        {activeTab === 'addresses' && <AddressesTab company={company} onRefresh={refresh} />}
                        {activeTab === 'banks'     && <BanksTab     company={company} onRefresh={refresh} />}
                    </>
                )}
            </div>
        </div>
    );
};

export default CompanySettings;
