import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import '../procurement/Procurement.css';
import './Manhour.css';
import { useFieldConfig } from '../FieldConfigContext';

const PAGE_SIZES = [20, 50, 100, 200];

// Style map keyed by ItemValue — extend here if new types are added via VList
const EMP_TYPE_STYLE = {
    COMPANY:    { color: '#1e40af', bg: '#dbeafe', dot: '#3b82f6' },
    OUTSOURCED: { color: '#7c2d12', bg: '#ffedd5', dot: '#f97316' },
};
const defaultStyle = { color: '#475569', bg: '#f1f5f9', dot: '#94a3b8' };
const empTypeCfg = (value, empTypeOptions) => {
    const opt = (empTypeOptions || []).find(o => o.value === value);
    return { label: opt?.label || value, ...(EMP_TYPE_STYLE[value] || defaultStyle) };
};

const EmpTypeBadge = ({ type, empTypeOptions }) => {
    const c = empTypeCfg(type, empTypeOptions);
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: c.bg, color: c.color, whiteSpace: 'nowrap',
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
            {c.label}
        </span>
    );
};

// ── Supplier searchable picker (portal dropdown, server-side search) ──────
const SupplierSelect = ({ value, supplierName, supplierCode, onChange, hasError }) => {
    const [q,      setQ]      = useState('');
    const [res,    setRes]    = useState([]);
    const [coords, setCoords] = useState(null);
    const timer    = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { if (!value) { setQ(''); setRes([]); } }, [value]);

    useEffect(() => {
        if (!res.length) return;
        const h = () => {
            const el = inputRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setCoords({ top: r.bottom + 2, left: r.left, width: r.width });
        };
        window.addEventListener('scroll', h, true);
        window.addEventListener('resize', h);
        return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h); };
    }, [res.length]);

    const positionMenu = () => {
        const el = inputRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setCoords({ top: r.bottom + 2, left: r.left, width: r.width });
    };

    const search = text => {
        setQ(text);
        clearTimeout(timer.current);
        if (!text.trim()) { setRes([]); return; }
        timer.current = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(text)}&pageSize=20`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => { setRes(Array.isArray(d) ? d : (d.data || [])); positionMenu(); })
                .catch(() => {});
        }, 280);
    };

    const select = s => {
        setRes([]);
        setQ('');
        onChange({ supplierId: s.supplierId, supplierName: s.supplierName, supplierCode: s.supplierCode });
    };

    const clear = () => { setQ(''); setRes([]); onChange({ supplierId: null, supplierName: '', supplierCode: '' }); };

    if (value && supplierName) return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fff7ed', border: `1px solid ${hasError ? '#dc2626' : '#fed7aa'}`,
            borderRadius: 6, padding: '6px 10px',
        }}>
            <div style={{ flex: 1, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: '#7c2d12', fontFamily: 'monospace', marginRight: 6 }}>
                    {supplierCode}
                </span>
                <span style={{ color: '#1e293b' }}>{supplierName}</span>
            </div>
            <button type="button" onClick={clear}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1, padding: 0 }}>
                ×
            </button>
        </div>
    );

    return (
        <div style={{ position: 'relative' }}>
            <input ref={inputRef}
                className={`pf-input${hasError ? ' pf-input-err' : ''}`}
                type="text" placeholder="Search supplier name or code…"
                value={q}
                onChange={e => search(e.target.value)}
                onFocus={positionMenu}
                onBlur={() => setTimeout(() => setRes([]), 200)}
            />
            {res.length > 0 && coords && createPortal(
                <div style={{
                    position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
                    zIndex: 99999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
                    boxShadow: '0 4px 16px rgba(0,0,0,.18)', maxHeight: 220, overflowY: 'auto',
                }}>
                    {res.map(s => (
                        <div key={s.supplierId}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                            onMouseDown={() => select(s)}
                            onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <strong style={{ color: '#7c2d12', marginRight: 8, fontFamily: 'monospace' }}>{s.supplierCode}</strong>
                            <span style={{ color: '#1e293b' }}>{s.supplierName}</span>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

// ── Add / Edit form panel ─────────────────────────────────────────────────
const EmployeeForm = ({ initial, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { isReq }   = useFieldConfig('EMPLOYEE');
    const { getVList } = useLookup();
    const empTypeOptions = getVList('Employee', 'EmployeeType'); // [{value,label}] from VList
    const isNew = !initial?.employeeId;

    const [form, setForm] = useState({
        empCode:      initial?.empCode      || '',
        employeeName: initial?.employeeName || '',
        empType:      initial?.empType      || 'COMPANY',
        supplierId:   initial?.supplierId   || null,
        supplierName: initial?.supplierName || '',
        supplierCode: initial?.supplierCode || '',
        isActive:     initial?.isActive ?? true,
    });
    const [errors,  setErrors]  = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = () => {
        const e = {};
        if (!form.empCode.trim())                          e.empCode      = 'Employee code is required.';
        if (!form.employeeName.trim())                     e.employeeName = 'Employee name is required.';
        if (form.empType === 'OUTSOURCED' && !form.supplierId)
                                                           e.supplierId   = 'Select the subcontractor from the supplier list.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}employee/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                employeeId:   isNew ? 0 : initial.employeeId,
                empCode:      form.empCode.trim().toUpperCase(),
                employeeName: form.employeeName.trim(),
                empType:      form.empType,
                supplierId:   form.empType === 'OUTSOURCED' ? form.supplierId : null,
                isActive:     form.isActive,
                savedBy:      currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                onSaved();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 500 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">{isNew ? 'New Employee' : 'Edit Employee'}</div>
                        {!isNew && <div className="pf-header-sub">{initial.empCode} — {initial.employeeName}</div>}
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    {/* Employee Type toggle */}
                    <div className="pf-field" style={{ marginBottom: 14 }}>
                        <label>Employee Type</label>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            {empTypeOptions.map(t => {
                                const cfg = empTypeCfg(t.value, empTypeOptions);
                                return (
                                    <button key={t.value} type="button"
                                        onClick={() => setForm(p => ({ ...p, empType: t.value, supplierId: null, supplierName: '', supplierCode: '' }))}
                                        style={{
                                            flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 13,
                                            fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                                            border: `2px solid ${form.empType === t.value ? cfg.dot : '#e2e8f0'}`,
                                            background: form.empType === t.value ? cfg.bg : '#f8fafc',
                                            color: form.empType === t.value ? cfg.color : '#94a3b8',
                                        }}>
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field" style={{ flex: '0 0 140px' }}>
                            <label>Emp Code {isReq('empCode') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.empCode ? ' pf-input-err' : ''}`}
                                type="text" name="empCode" value={form.empCode}
                                onChange={handle}
                                placeholder={form.empType === 'COMPANY' ? 'e.g. ESI-004' : 'e.g. SUP-001'}
                                style={{ textTransform: 'uppercase' }}
                                autoFocus={isNew} />
                            {errors.empCode && <span className="pf-field-err">{errors.empCode}</span>}
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Employee Name {isReq('employeeName') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.employeeName ? ' pf-input-err' : ''}`}
                                type="text" name="employeeName" value={form.employeeName}
                                onChange={handle} placeholder="Full name" />
                            {errors.employeeName && <span className="pf-field-err">{errors.employeeName}</span>}
                        </div>
                    </div>

                    {/* Supplier picker — only for OUTSOURCED */}
                    {form.empType === 'OUTSOURCED' && (
                        <div className="pf-field">
                            <label>Subcontractor (Supplier) <span className="req">*</span></label>
                            <SupplierSelect
                                value={form.supplierId}
                                supplierName={form.supplierName}
                                supplierCode={form.supplierCode}
                                hasError={!!errors.supplierId}
                                onChange={({ supplierId, supplierName, supplierCode }) =>
                                    setForm(p => ({ ...p, supplierId, supplierName, supplierCode }))
                                }
                            />
                            {errors.supplierId && <span className="pf-field-err">{errors.supplierId}</span>}
                        </div>
                    )}

                    <div className="pf-row">
                        {!isNew && (
                            <div className="pf-field" style={{ flex: '0 0 120px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 22 }}>
                                    <input type="checkbox" name="isActive" checked={form.isActive}
                                        onChange={handle}
                                        style={{ width: 15, height: 15, accentColor: '#16a34a' }} />
                                    Active
                                </label>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : isNew ? 'Create' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Excel template download ───────────────────────────────────────────────
const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
        ['EMP_CODE', 'EMP_NAME',   'EMP_TYPE',   'SUPPLIER_CODE'],
        ['ESI-999',  'John Doe',   'COMPANY',    ''],
        ['SUP-999',  'Jane Smith', 'OUTSOURCED', 'SUPP-03'],
    ]);
    ws['!cols'] = [12, 30, 12, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'Employee_Import_Template.xlsx');
};

const exportErrors = rows => {
    const errRows = rows.filter(r => r._errors?.length);
    if (!errRows.length) return;
    const ws = XLSX.utils.json_to_sheet(errRows.map(r => ({
        Row:           r._row,
        EMP_CODE:      r.empCode,
        EMP_NAME:      r.employeeName,
        EMP_TYPE:      r.empType,
        SUPPLIER_CODE: r.supplierCode || '',
        Errors:        r._errors.join('; '),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'Employee_Import_Errors.xlsx');
};

// ── Employee Excel Upload modal ───────────────────────────────────────────
const EmployeeUpload = ({ onClose, onDone }) => {
    const currentUser    = useCurrentUser();
    const { getVList }   = useLookup();
    const empTypeOptions = getVList('Employee', 'EmployeeType');
    const fileRef        = useRef(null);
    const dropRef        = useRef(null);

    const [previewRows,  setPreviewRows]  = useState([]);
    const [parsing,      setParsing]      = useState(false);
    const [uploading,    setUploading]    = useState(false);
    const [result,       setResult]       = useState(null);   // { imported, failed, results }
    const [toast,        setToast]        = useState({ msg: '', type: '' });
    const [suppliers,    setSuppliers]    = useState([]);     // for supplier code validation

    // Load active suppliers for validation
    useEffect(() => {
        fetch(`${variables.API_URL}supplier/search?pageSize=500`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSuppliers(Array.isArray(d) ? d : (d.data || [])))
            .catch(() => {});
    }, []);

    const showToast = (msg, type = 'ok') => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: '', type: '' }), 4000);
    };

    const parseFile = useCallback((f) => {
        if (!f) return;
        setParsing(true); setPreviewRows([]); setResult(null);

        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb  = XLSX.read(e.target.result, { type: 'array', cellDates: false });
                const ws  = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                if (raw.length < 2) { showToast('File is empty or has no data rows.', 'error'); setParsing(false); return; }

                const header = raw[0].map(h => String(h).trim().toUpperCase());
                const col = k => header.indexOf(k);

                const iCode  = col('EMP_CODE'),
                      iName  = col('EMP_NAME'),
                      iType  = col('EMP_TYPE'),
                      iSupp  = col('SUPPLIER_CODE');

                if (iCode < 0 || iName < 0) {
                    showToast('Missing required columns: EMP_CODE, EMP_NAME. Please use the template.', 'error');
                    setParsing(false); return;
                }

                // Build supplier lookup by code (upper)
                const suppByCode = {};
                suppliers.forEach(s => { suppByCode[s.supplierCode?.toUpperCase()] = s; });

                const seenCodes = new Set();
                const parsed    = [];

                for (let i = 1; i < raw.length; i++) {
                    const row = raw[i];
                    if (row.every(c => c === '' || c == null)) continue;

                    const empCode      = String(row[iCode]  || '').trim().toUpperCase();
                    const employeeName = String(row[iName]  || '').trim();
                    const empTypeRaw   = String(row[iType]  || '').trim().toUpperCase();
                    const supplierCode = iSupp >= 0 ? String(row[iSupp] || '').trim().toUpperCase() : '';

                    // EMP_TYPE must match a VList value or blank (defaults to first VList entry)
                    const VALID_TYPES = empTypeOptions.length > 0
                        ? empTypeOptions.map(o => o.value)
                        : ['COMPANY', 'OUTSOURCED'];           // fallback if VList not loaded yet
                    const defaultType = VALID_TYPES[0] || 'COMPANY';
                    const empType = VALID_TYPES.includes(empTypeRaw) ? empTypeRaw : defaultType;
                    const errs    = [];

                    if (!empCode)      errs.push('EMP_CODE is required');
                    if (!employeeName) errs.push('EMP_NAME is required');

                    // Invalid EMP_TYPE → hard error (not silent default)
                    if (empTypeRaw && !VALID_TYPES.includes(empTypeRaw))
                        errs.push(`EMP_TYPE "${empTypeRaw}" is invalid — must be: ${VALID_TYPES.join(' or ')}`);

                    if (empCode && seenCodes.has(empCode)) errs.push(`Duplicate EMP_CODE in file`);
                    if (empCode) seenCodes.add(empCode);

                    let supplierId = null;
                    // Supplier validation: required for OUTSOURCED; warn if provided for COMPANY
                    if (empType === 'OUTSOURCED') {
                        if (!supplierCode) {
                            errs.push('SUPPLIER_CODE is required for OUTSOURCED');
                        } else {
                            const s = suppByCode[supplierCode];
                            if (!s) errs.push(`SUPPLIER_CODE "${supplierCode}" not found — check the Reference sheet for valid codes`);
                            else supplierId = s.supplierId;
                        }
                    } else if (supplierCode) {
                        errs.push(`SUPPLIER_CODE provided but EMP_TYPE is COMPANY — remove it or change EMP_TYPE to OUTSOURCED`);
                    }

                    parsed.push({
                        _row: i + 1, _errors: errs,
                        empCode, employeeName, empType,
                        supplierCode: supplierCode || null,
                        supplierId,
                    });
                }

                setPreviewRows(parsed);
                const errCount = parsed.filter(r => r._errors.length > 0).length;
                if (errCount > 0)
                    showToast(`${parsed.length} rows parsed — ${errCount} have errors. Fix before uploading.`, 'error');
                else
                    showToast(`${parsed.length} rows parsed — all valid. Ready to import.`);
            } catch {
                showToast('Failed to parse file.', 'error');
            } finally {
                setParsing(false);
            }
        };
        reader.readAsArrayBuffer(f);
    }, [suppliers, empTypeOptions]);

    const handleFileChange = e => parseFile(e.target.files?.[0]);

    const handleDrop = e => {
        e.preventDefault();
        dropRef.current?.classList.remove('eu-drop-active');
        parseFile(e.dataTransfer.files?.[0]);
    };

    const validRows  = previewRows.filter(r => r._errors.length === 0);
    const errorRows  = previewRows.filter(r => r._errors.length > 0);
    const canUpload  = validRows.length > 0 && !uploading;

    const doUpload = async () => {
        if (!canUpload) return;
        setUploading(true); setResult(null);
        try {
            const res = await fetch(`${variables.API_URL}employee/import`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    rows: validRows.map(r => ({
                        empCode:      r.empCode,
                        employeeName: r.employeeName,
                        empType:      r.empType,
                        supplierCode: r.supplierCode,
                    })),
                    savedBy: currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { showToast(d.message || 'Import failed.', 'error'); return; }
            setResult(d);
            if (d.failed === 0) {
                showToast(`✓ ${d.imported} employee${d.imported !== 1 ? 's' : ''} imported successfully.`);
                onDone();
            } else {
                showToast(`${d.imported} imported, ${d.failed} failed — check results below.`, 'error');
            }
        } catch {
            showToast('Network error.', 'error');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 820, width: '95vw' }}>

                {/* Header */}
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">📤 Import Employees from Excel</div>
                        <div className="pf-header-sub">Upload .xlsx / .xls / .csv using the standard template</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>

                    {/* Toast */}
                    {toast.msg && (
                        <div style={{
                            marginBottom: 12, padding: '9px 14px', borderRadius: 8, fontSize: 13,
                            background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
                            color:      toast.type === 'error' ? '#991b1b' : '#166534',
                            border:     `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`,
                        }}>{toast.msg}</div>
                    )}

                    {/* Step 1 — Template + Drop zone */}
                    <div style={{ marginBottom: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                                Step 1 — Download template, fill it in, then upload
                            </div>
                            <button onClick={downloadTemplate} style={{
                                fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                                border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e40af', fontWeight: 600,
                            }}>
                                ⬇ Download Template
                            </button>
                        </div>

                        {/* Column guide */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {[
                                { col: 'EMP_CODE',      desc: 'Required. e.g. ESI-001',         req: true  },
                                { col: 'EMP_NAME',      desc: 'Required. Full name',             req: true  },
                                { col: 'EMP_TYPE',      desc: 'COMPANY or OUTSOURCED',           req: false },
                                { col: 'SUPPLIER_CODE', desc: 'Required if OUTSOURCED',          req: false },
                            ].map(({ col, desc, req }) => (
                                <div key={col} style={{
                                    background: req ? '#eff6ff' : '#f8fafc',
                                    border: `1px solid ${req ? '#bfdbfe' : '#e2e8f0'}`,
                                    borderRadius: 6, padding: '4px 10px', fontSize: 11,
                                }}>
                                    <span style={{ fontWeight: 700, color: req ? '#1e40af' : '#475569', fontFamily: 'monospace' }}>{col}</span>
                                    {req && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
                                    <span style={{ color: '#64748b', marginLeft: 6 }}>{desc}</span>
                                </div>
                            ))}
                        </div>

                        {/* Drop zone */}
                        <div ref={dropRef}
                            onClick={() => fileRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('eu-drop-active'); }}
                            onDragLeave={() => dropRef.current?.classList.remove('eu-drop-active')}
                            onDrop={handleDrop}
                            style={{
                                border: '2px dashed #cbd5e1', borderRadius: 10, padding: '28px 20px',
                                textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s, background .15s',
                                background: '#fafbfc',
                            }}>
                            {parsing
                                ? <div style={{ color: '#64748b', fontSize: 13 }}>⏳ Parsing file…</div>
                                : <>
                                    <div style={{ fontSize: 32, marginBottom: 6 }}>📂</div>
                                    <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                                        Click or drag & drop your Excel file here
                                    </div>
                                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                                        .xlsx, .xls or .csv accepted
                                    </div>
                                </>
                            }
                            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                                style={{ display: 'none' }} onChange={handleFileChange} />
                        </div>
                    </div>

                    {/* Step 2 — Preview */}
                    {previewRows.length > 0 && !result && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                                    Step 2 — Preview &amp; validate
                                    <span style={{ marginLeft: 10, fontWeight: 400, color: '#64748b' }}>
                                        {validRows.length} valid · {errorRows.length} error{errorRows.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                {errorRows.length > 0 && (
                                    <button onClick={() => exportErrors(previewRows)} style={{
                                        fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                                        border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b', fontWeight: 600,
                                    }}>
                                        ⬇ Export Errors
                                    </button>
                                )}
                            </div>

                            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            {['Row','Emp Code','Name','Type','Supplier Code','Status'].map(h => (
                                                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewRows.map((r, i) => (
                                            <tr key={i} style={{ background: r._errors.length ? '#fff5f5' : i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{r._row}</td>
                                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{r.empCode}</td>
                                                <td style={{ padding: '6px 10px' }}>{r.employeeName}</td>
                                                <td style={{ padding: '6px 10px' }}>
                                                    <EmpTypeBadge type={r.empType} empTypeOptions={empTypeOptions} />
                                                </td>
                                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#7c2d12' }}>{r.supplierCode || '—'}</td>
                                                <td style={{ padding: '6px 10px' }}>
                                                    {r._errors.length === 0
                                                        ? <span style={{ color: '#166534', fontWeight: 600, fontSize: 11 }}>✓ OK</span>
                                                        : <span style={{ color: '#dc2626', fontSize: 11 }} title={r._errors.join('\n')}>
                                                            ✗ {r._errors.join(' · ')}
                                                          </span>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {errorRows.length > 0 && (
                                <div style={{ marginTop: 8, fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px' }}>
                                    ⚠ {errorRows.length} row{errorRows.length !== 1 ? 's' : ''} with errors will be skipped.
                                    {validRows.length > 0 ? ` ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''} will be imported.` : ' No rows to import.'}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3 — Result */}
                    {result && (
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                                Import Result
                            </div>
                            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            {['Emp Code','Name','Result'].map(h => (
                                                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.results.map((r, i) => (
                                            <tr key={i} style={{ background: r.success ? (i % 2 === 0 ? '#fff' : '#f8fafc') : '#fff5f5', borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{r.empCode}</td>
                                                <td style={{ padding: '6px 10px' }}>{r.employeeName}</td>
                                                <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: r.success ? '#166534' : '#dc2626' }}>
                                                    {r.success ? '✓ ' : '✗ '}{r.message}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="pf-footer" style={{ justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        {previewRows.length > 0 && !result &&
                            `${validRows.length} valid · ${errorRows.length} errors`}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="pf-btn-sec" onClick={onClose}>
                            {result ? 'Close' : 'Cancel'}
                        </button>
                        {previewRows.length > 0 && !result && (
                            <button className="pf-btn-pri" onClick={doUpload}
                                disabled={!canUpload}
                                style={{ opacity: canUpload ? 1 : 0.5 }}>
                                {uploading ? 'Importing…' : `Import ${validRows.length} Employee${validRows.length !== 1 ? 's' : ''}`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Main list page ────────────────────────────────────────────────────────
const Employee = () => {
    const { getVList }   = useLookup();
    const empTypeOptions = getVList('Employee', 'EmployeeType');

    const [rows,         setRows]         = useState([]);
    const [loading,      setLoading]      = useState(false);
    const [search,       setSearch]       = useState('');
    const [statusFilter, setStatusFilter] = useState('active');   // 'all'|'active'|'inactive'
    const [typeFilter,   setTypeFilter]   = useState('all');      // 'all'|'COMPANY'|'OUTSOURCED'
    const [pageSize,     setPageSize]     = useState(20);
    const [page,         setPage]         = useState(1);
    const [sortCol,      setSortCol]      = useState('empType');
    const [sortDir,      setSortDir]      = useState('ASC');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [formTarget,   setFormTarget]   = useState(null);
    const [showUpload,   setShowUpload]   = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}employee`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => setRows(Array.isArray(data) ? data : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    // Client-side filter + sort + paginate
    const filtered = rows.filter(r => {
        const matchSearch = !search.trim() ||
            (r.empCode            || '').toLowerCase().includes(search.toLowerCase()) ||
            (r.employeeName       || '').toLowerCase().includes(search.toLowerCase()) ||
            (r.subcontractorName  || '').toLowerCase().includes(search.toLowerCase());
        const matchStatus =
            statusFilter === 'active'   ? r.isActive :
            statusFilter === 'inactive' ? !r.isActive : true;
        const matchType     = typeFilter === 'all' || r.empType === typeFilter;
        const matchSupplier = !supplierFilter || String(r.supplierId) === supplierFilter;
        return matchSearch && matchStatus && matchType && matchSupplier;
    });

    const sorted = [...filtered].sort((a, b) => {
        const av = a[sortCol] ?? '';
        const bv = b[sortCol] ?? '';
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
        return sortDir === 'ASC' ? cmp : -cmp;
    });

    const totalRows  = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize);

    const handleSort = col => {
        if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
        else { setSortCol(col); setSortDir('ASC'); }
        setPage(1);
    };

    const goPage = p => setPage(Math.max(1, Math.min(p, totalPages)));

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
        return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
    };

    const Th = ({ col, children, right }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}
            style={right ? { textAlign: 'right' } : {}}>
            <div className="po-th-inner" style={right ? { justifyContent: 'flex-end' } : {}}>
                {children} <SortIcon col={col} />
            </div>
        </th>
    );

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    const countOf = (type) => rows.filter(r => r.empType === type && r.isActive).length;

    const supplierOptions = Array.from(
        rows.reduce((map, r) => {
            if (r.supplierId && !map.has(r.supplierId))
                map.set(r.supplierId, { id: r.supplierId, code: r.supplierCode, name: r.supplierName });
            return map;
        }, new Map()).values()
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return (
        <div className="po-page">
            {formTarget !== null && (
                <EmployeeForm
                    initial={formTarget || null}
                    onClose={() => setFormTarget(null)}
                    onSaved={() => { setFormTarget(null); load(); }}
                />
            )}
            {showUpload && (
                <EmployeeUpload
                    onClose={() => setShowUpload(false)}
                    onDone={() => { load(); }}
                />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Employees</div>
                            <div className="po-page-sub">
                                {rows.filter(r => r.isActive).length} active
                                &nbsp;·&nbsp;{countOf('COMPANY')} company
                                &nbsp;·&nbsp;{countOf('OUTSOURCED')} outsourced
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setShowUpload(true)} style={{
                                fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                                border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontWeight: 600,
                            }}>
                                📤 Import Excel
                            </button>
                            <button className="po-btn-pri" onClick={() => setFormTarget(false)}>+ New Employee</button>
                        </div>
                    </div>

                    <div className="po-toolbar" style={{ justifyContent: 'flex-start', paddingTop: 10, flexWrap: 'wrap', gap: 8 }}>

                        {/* Employee Type filter — driven by VList */}
                        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                            {[{ value: 'all', label: 'All Types' }, ...empTypeOptions].map(t => {
                                const cfg = t.value === 'all' ? { color: '#fff', bg: '#475569' } : empTypeCfg(t.value, empTypeOptions);
                                const active = typeFilter === t.value;
                                return (
                                    <button key={t.value}
                                        onClick={() => { setTypeFilter(t.value); setPage(1); }}
                                        style={{
                                            padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                                            background: active ? cfg.bg  : '#fff',
                                            color:      active ? '#fff'  : '#64748b',
                                            fontWeight: active ? 600 : 400,
                                        }}>
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Active / Inactive filter */}
                        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                            {[['active','Active'],['inactive','Inactive'],['all','All']].map(([val, label]) => (
                                <button key={val}
                                    onClick={() => { setStatusFilter(val); setPage(1); }}
                                    style={{
                                        padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                                        background: statusFilter === val ? '#475569' : '#fff',
                                        color:      statusFilter === val ? '#fff' : '#64748b',
                                        fontWeight: statusFilter === val ? 600 : 400,
                                    }}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        <input
                            className="pf-input"
                            style={{ width: 220, padding: '5px 10px', fontSize: 13 }}
                            type="text"
                            placeholder="Search code, name, agency…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                        />

                        {supplierOptions.length > 0 && (
                            <select className="po-select"
                                value={supplierFilter}
                                onChange={e => { setSupplierFilter(e.target.value); setPage(1); }}>
                                <option value="">All Suppliers</option>
                                {supplierOptions.map(s => (
                                    <option key={s.id} value={String(s.id)}>
                                        {s.code ? `${s.code} – ${s.name}` : s.name}
                                    </option>
                                ))}
                            </select>
                        )}

                        <select className="po-select" value={pageSize}
                            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                        </select>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner">
                                <div className="po-spinner-ring" />
                                <span className="po-spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="empType">Type</Th>
                                <Th col="empCode">Emp Code</Th>
                                <Th col="employeeName">Employee Name</Th>
                                <Th col="subcontractorName">Subcontractor / Agency</Th>
                                <Th col="isActive">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 && !loading ? (
                                <tr><td colSpan={7} className="po-empty">No employees found.</td></tr>
                            ) : paginated.map(r => (
                                <tr key={r.employeeId} style={!r.isActive ? { opacity: 0.55 } : {}}>
                                    <td style={{ padding: '8px 12px' }}>
                                        <EmpTypeBadge type={r.empType} empTypeOptions={empTypeOptions} />
                                    </td>
                                    <td>
                                        <span style={{
                                            fontFamily: 'Courier New', fontSize: 12, fontWeight: 700,
                                            background: '#f1f5f9', color: '#334155',
                                            padding: '2px 7px', borderRadius: 4
                                        }}>
                                            {r.empCode}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{r.employeeName}</td>
                                    <td style={{ fontSize: 12, color: '#64748b' }}>
                                        {r.supplierName
                                            ? <span>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#7c2d12', marginRight: 5 }}>{r.supplierCode}</span>
                                                {r.supplierName}
                                              </span>
                                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                                    </td>
                                    <td>
                                        {r.isActive
                                            ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Active</span>
                                            : <span style={{ background: '#f1f5f9', color: '#94a3b8', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Inactive</span>}
                                    </td>
                                    <td>
                                        <button className="po-act-btn po-act-open"
                                            onClick={() => setFormTarget(r)}>Edit</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                        &nbsp;·&nbsp;{totalRows} record{totalRows !== 1 ? 's' : ''}
                    </div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`}
                                onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Employee;
