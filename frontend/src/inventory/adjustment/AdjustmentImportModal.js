import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import AlertModal from '../../common/AlertModal';

// ── Download sample template (generated in-browser via SheetJS) ──────────────
// Two sheets: a data template with samples, and a Reference sheet listing the
// column rules plus the valid UOM and Reason codes (data-driven).
const downloadTemplate = (uomList = [], reasons = []) => {
    const wb = XLSX.utils.book_new();

    const headers = ['ItemCode', 'Qty', 'UnitCost', 'UOM', 'Reason', 'Notes'];
    const samples = [
        ['ITM-001', 100, 45.50, 'MTR', 'OPENING_BALANCE', 'Initial load'],
        ['ITM-002', 250, 18.75, 'MTR', 'OPENING_BALANCE', ''],
        ['ITM-003', 40,  62.00, '',    '',                'Base UOM assumed if UOM blank'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...samples]);
    ws['!cols'] = [16, 10, 12, 10, 20, 28].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Opening Stock');

    const refRows = [
        ['Column',   'Required', 'Notes'],
        ['ItemCode', 'Yes',      'Must match an existing active item code'],
        ['Qty',      'Yes',      'Quantity to load — must be greater than zero'],
        ['UnitCost', 'No',       'Cost per unit; defaults to 0 if left blank'],
        ['UOM',      'No',       "UOM code (see list below); blank = item's base unit"],
        ['Reason',   'No',       'Reason code (see list below); blank = header reason'],
        ['Notes',    'No',       'Optional free-text note'],
        ['', '', ''],
        ['Valid UOM codes', 'Name', ''],
        ...uomList.map(u => [u.uomCode, u.uomName, '']),
        ['', '', ''],
        ['Valid Reason codes', 'Description', ''],
        ...reasons.map(r => [r.value, r.label, '']),
    ];
    const refWs = XLSX.utils.aoa_to_sheet(refRows);
    refWs['!cols'] = [20, 30, 44].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, refWs, 'Reference');

    XLSX.writeFile(wb, 'Opening_Stock_Import_Template.xlsx');
};

// ── Column map: Excel header → internal key ─────────────────────────────────
const COL_MAP = {
    'itemcode': 'itemCode', 'code': 'itemCode',
    'qty': 'qty', 'quantity': 'qty',
    'unitcost': 'unitCost', 'cost': 'unitCost', 'rate': 'unitCost',
    'uom': 'uomCode', 'uomcode': 'uomCode', 'unit': 'uomCode',
    'reason': 'reason',
    'notes': 'notes', 'remarks': 'notes',
};

function validateRow(row) {
    const errors = [];
    if (!row.itemCode?.toString().trim()) errors.push('ItemCode is required');
    const q = parseFloat(row.qty);
    if (!row.qty?.toString().trim() || isNaN(q) || q <= 0) errors.push('Qty must be greater than zero');
    if (row.unitCost?.toString().trim() && (isNaN(parseFloat(row.unitCost)) || parseFloat(row.unitCost) < 0))
        errors.push('UnitCost is invalid');
    return errors;
}

function parseSheet(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    let headerIdx = -1;
    for (let i = 0; i < Math.min(aoa.length, 5); i++) {
        const row = aoa[i].map(c => String(c ?? '').trim().toLowerCase().replace(/\s/g, ''));
        if (row.includes('itemcode') || row.includes('code')) { headerIdx = i; break; }
    }
    if (headerIdx === -1) return { error: 'Could not find a header row. The sheet must have an ItemCode column.' };

    const headers = aoa[headerIdx].map(c => String(c ?? '').trim().toLowerCase().replace(/\s+/g, ''));
    const colKeys = headers.map(h => COL_MAP[h] || null);

    const rows = [];
    for (let i = headerIdx + 1; i < aoa.length; i++) {
        const raw = aoa[i];
        if (raw.every(c => !String(c ?? '').trim())) continue;
        const obj = {};
        colKeys.forEach((key, ci) => { if (key) obj[key] = String(raw[ci] ?? '').trim(); });
        const errors = validateRow(obj);
        rows.push({ ...obj, _errors: errors, _rowNum: i + 1 });
    }
    if (rows.length === 0) return { error: 'No data rows found below the header.' };
    return { rows };
}

const cell = { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };
const th   = { ...cell, fontWeight: 700, color: '#475569', background: '#f8fafc', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '.04em' };

const AdjustmentImportModal = ({ adjustmentId, reasons = [], onClose, onImported }) => {
    const currentUser = useCurrentUser();
    const [uomList, setUomList] = useState([]);

    // UOM codes for the template's Reference sheet (lookups only expose id+name).
    useEffect(() => {
        fetch(`${variables.API_URL}item/uoms`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setUomList(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, []);

    const [step,       setStep]       = useState('upload'); // upload | preview | confirm | done
    const [fileName,   setFileName]   = useState('');
    const [rows,       setRows]       = useState([]);
    const [parseError, setParseError] = useState('');
    const [importing,  setImporting]  = useState(false);
    const [results,    setResults]    = useState(null);
    const [alertMsg,   setAlertMsg]   = useState(null);
    const [password,   setPassword]   = useState('');
    const [pwdError,   setPwdError]   = useState('');
    const fileRef = useRef(null);

    const validCount = rows.filter(r => r._errors.length === 0).length;
    const errorCount = rows.length - validCount;

    const handleFile = (file) => {
        if (!file) return;
        setParseError('');
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const res = parseSheet(wb);
                if (res.error) { setParseError(res.error); setRows([]); return; }
                setRows(res.rows);
                setStep('preview');
            } catch {
                setParseError('Could not read the file. Make sure it is a valid .xlsx file.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const doImport = async () => {
        if (!password.trim()) { setPwdError('Enter your password to authorize the import.'); return; }
        const payloadRows = rows.filter(r => r._errors.length === 0).map(r => ({
            itemCode: r.itemCode,
            qty:      parseFloat(r.qty),
            unitCost: r.unitCost ? parseFloat(r.unitCost) : 0,
            uomCode:  r.uomCode || null,
            reason:   r.reason  || null,
            notes:    r.notes   || null,
        }));
        if (payloadRows.length === 0) { setAlertMsg('No valid rows to import.'); return; }
        setImporting(true); setPwdError('');
        try {
            const res = await fetch(`${variables.API_URL}stockadjustment/lines/import`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ adjustmentId: Number(adjustmentId), createdBy: currentUser, password, rows: payloadRows }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.status === 403) { setPwdError(d?.message || 'Incorrect password.'); return; }
            if (!res.ok) { setAlertMsg(d?.message || 'Import failed.'); return; }
            setPassword('');
            // All rows imported cleanly → refresh + close the window.
            if ((d.failCount || 0) === 0) {
                if (d.successCount > 0 && onImported) onImported();
                onClose();
                return;
            }
            // Some rows failed → stay on the results screen so the user sees what to
            // fix. Defer the parent refresh to close time: refreshing now sets the
            // detail page's loading state, which unmounts this modal mid-flow.
            setResults(d);
            setStep('done');
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setImporting(false); }
    };

    const reset = () => { setStep('upload'); setRows([]); setFileName(''); setParseError(''); setResults(null); setPassword(''); setPwdError(''); };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !importing) onClose(); }}>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            <div style={{ background: '#fff', borderRadius: 12, width: 720, maxWidth: '96vw', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Import Opening Stock from Excel</div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>Each row is added as an IN (+) adjustment line</div>
                    </div>
                    <button onClick={onClose} disabled={importing}
                        style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </div>

                <div style={{ padding: 20, overflowY: 'auto' }}>
                    {/* ── Upload step ── */}
                    {step === 'upload' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <span style={{ fontSize: 12.5, color: '#475569' }}>
                                    Columns: <strong>ItemCode</strong>, <strong>Qty</strong>, UnitCost, UOM, Reason, Notes.
                                    Blank UOM uses the item's base unit.
                                </span>
                                <button onClick={() => downloadTemplate(uomList, reasons)}
                                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                                    ⬇ Template
                                </button>
                            </div>
                            <div onClick={() => fileRef.current?.click()}
                                style={{ border: '2px dashed #cbd5e1', borderRadius: 10, padding: '36px 20px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                                <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Click to choose an .xlsx file</div>
                                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>or drop it here</div>
                            </div>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                                onChange={e => handleFile(e.target.files?.[0])} />
                            {parseError && (
                                <div style={{ marginTop: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 7, padding: '8px 12px', fontSize: 12.5 }}>
                                    ⚠ {parseError}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Preview step ── */}
                    {step === 'preview' && (
                        <div>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 12.5, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ color: '#475569' }}>📄 {fileName}</span>
                                <span style={{ color: '#166534', fontWeight: 700 }}>{validCount} valid</span>
                                {errorCount > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>{errorCount} with errors (skipped)</span>}
                                <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer', color: '#475569' }}>
                                    ↺ Choose another file
                                </button>
                            </div>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto', maxHeight: 360 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr>
                                        <th style={th}>#</th><th style={th}>ItemCode</th><th style={{ ...th, textAlign: 'right' }}>Qty</th>
                                        <th style={{ ...th, textAlign: 'right' }}>UnitCost</th><th style={th}>UOM</th><th style={th}>Reason</th><th style={th}>Status</th>
                                    </tr></thead>
                                    <tbody>
                                        {rows.map((r, i) => (
                                            <tr key={i} style={{ background: r._errors.length ? '#fff5f5' : '#fff' }}>
                                                <td style={{ ...cell, color: '#94a3b8' }}>{i + 1}</td>
                                                <td style={{ ...cell, fontWeight: 600, color: '#1e40af' }}>{r.itemCode || '—'}</td>
                                                <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{r.qty || '—'}</td>
                                                <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{r.unitCost || '0'}</td>
                                                <td style={cell}>{r.uomCode || <span style={{ color: '#94a3b8' }}>base</span>}</td>
                                                <td style={cell}>{r.reason || '—'}</td>
                                                <td style={cell}>
                                                    {r._errors.length === 0
                                                        ? <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ OK</span>
                                                        : <span style={{ color: '#dc2626' }} title={r._errors.join('; ')}>⚠ {r._errors.join('; ')}</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Confirm (password approval) step ── */}
                    {step === 'confirm' && (
                        <div>
                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                                    Authorize opening-stock import
                                </div>
                                <div style={{ fontSize: 12.5, color: '#78350f' }}>
                                    You are about to add <strong>{validCount}</strong> stock line{validCount !== 1 ? 's' : ''} (IN) to this adjustment.
                                    Enter your password to confirm.
                                </div>
                            </div>
                            <div style={{ maxWidth: 320 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                    Password
                                </div>
                                <input type="password" autoComplete="new-password" autoFocus value={password}
                                    onChange={e => { setPassword(e.target.value); setPwdError(''); }}
                                    onKeyDown={e => e.key === 'Enter' && doImport()}
                                    placeholder="Your login password"
                                    style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 7, boxSizing: 'border-box' }} />
                                {pwdError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>⚠ {pwdError}</div>}
                            </div>
                        </div>
                    )}

                    {/* ── Done step ── */}
                    {step === 'done' && results && (
                        <div>
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>
                                    ✓ {results.successCount} line{results.successCount !== 1 ? 's' : ''} imported
                                    {results.failCount > 0 && <span style={{ color: '#dc2626' }}> · {results.failCount} failed</span>}
                                </div>
                            </div>
                            {results.failCount > 0 && (
                                <div style={{ border: '1px solid #fecaca', borderRadius: 8, overflow: 'auto', maxHeight: 280 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead><tr><th style={th}>Row</th><th style={th}>ItemCode</th><th style={th}>Error</th></tr></thead>
                                        <tbody>
                                            {results.results.filter(r => !r.success).map((r, i) => (
                                                <tr key={i}>
                                                    <td style={{ ...cell, color: '#94a3b8' }}>{r.rowNumber}</td>
                                                    <td style={{ ...cell, fontWeight: 600 }}>{r.itemCode || '—'}</td>
                                                    <td style={{ ...cell, color: '#dc2626', whiteSpace: 'normal' }}>{r.message}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    {step === 'preview' && (
                        <button onClick={() => setStep('confirm')} disabled={validCount === 0}
                            style={{ background: validCount === 0 ? '#cbd5e1' : '#0f766e', color: '#fff', border: 'none', borderRadius: 7,
                                padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: validCount === 0 ? 'not-allowed' : 'pointer' }}>
                            Continue → {validCount} line{validCount !== 1 ? 's' : ''}
                        </button>
                    )}
                    {step === 'confirm' && (
                        <>
                            <button onClick={() => { setStep('preview'); setPwdError(''); }} disabled={importing}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                                ← Back
                            </button>
                            <button onClick={doImport} disabled={importing}
                                style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 7,
                                    padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                {importing ? 'Importing…' : `🔒 Authorize & Import ${validCount} line${validCount !== 1 ? 's' : ''}`}
                            </button>
                        </>
                    )}
                    {step !== 'confirm' && (
                        <button
                            onClick={() => {
                                // On the results screen the imported lines aren't shown yet
                                // (refresh was deferred) — do it now, then close.
                                if (step === 'done' && results?.successCount > 0 && onImported) onImported();
                                onClose();
                            }}
                            disabled={importing}
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                            {step === 'done' ? 'Close' : 'Cancel'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdjustmentImportModal;
