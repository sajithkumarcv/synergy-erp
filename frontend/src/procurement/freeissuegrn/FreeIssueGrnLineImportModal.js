import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import AlertModal from '../../common/AlertModal';

// Header aliases → canonical field
const COL_MAP = {
    'description': 'description', 'desc': 'description', 'materialdescription': 'description', 'material': 'description', 'item': 'description',
    'qty': 'qty', 'quantity': 'qty',
    'uom': 'uomName', 'unit': 'uomName', 'unitofmeasure': 'uomName', 'uomname': 'uomName',
    'remarks': 'remarks', 'remark': 'remarks', 'note': 'remarks', 'notes': 'remarks',
};

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');

// Self-contained Excel importer for Free Issue GRN material lines.
// Posts each valid row to the existing lines/save endpoint (no new backend needed).
const FreeIssueGrnLineImportModal = ({ grn, onClose, onImported }) => {
    const currentUser = useCurrentUser();

    const [step,       setStep]       = useState('upload');   // upload | preview | done
    const [fileName,   setFileName]   = useState('');
    const [rows,       setRows]       = useState([]);
    const [parseError, setParseError] = useState('');
    const [importing,  setImporting]  = useState(false);
    const [results,    setResults]    = useState(null);
    const [alertMsg,   setAlertMsg]   = useState(null);
    const fileRef = useRef(null);

    const validRows   = rows.filter(r => r._errors.length === 0);
    const invalidRows = rows.filter(r => r._errors.length > 0);

    const downloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const hdr = ['Description', 'Qty', 'UOM', 'Remarks'];
        const samples = [
            ['MS Plate 10mm', 10, 'Nos', 'Yard bay 3'],
            ['Angle bar 50x50', 25, 'M', ''],
        ];
        const ws = XLSX.utils.aoa_to_sheet([hdr, ...samples]);
        ws['!cols'] = [40, 10, 10, 30].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'Material Lines');
        XLSX.writeFile(wb, 'FreeIssueGRN_Lines_Template.xlsx');
    };

    const parseWb = (wb) => {
        const wsName = wb.SheetNames.includes('Material Lines') ? 'Material Lines' : wb.SheetNames[0];
        const ws  = wb.Sheets[wsName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        let headerIdx = -1;
        for (let i = 0; i < Math.min(aoa.length, 5); i++) {
            const r = aoa[i].map(norm);
            if (r.includes('description') || r.includes('desc')) { headerIdx = i; break; }
        }
        if (headerIdx === -1) return { error: 'Could not find a header row with a Description column.' };
        const cols = aoa[headerIdx].map(c => COL_MAP[norm(c)] || null);
        const out = [];
        for (let i = headerIdx + 1; i < aoa.length; i++) {
            const raw = aoa[i];
            if (raw.every(c => !String(c ?? '').trim())) continue;
            const o = {};
            cols.forEach((k, ci) => { if (k) o[k] = String(raw[ci] ?? '').trim(); });
            const errors = [];
            if (!o.description) errors.push('Description required');
            if (o.qty && isNaN(Number(o.qty))) errors.push('Qty must be a number');
            out.push({ ...o, _errors: errors, _rowNum: i + 1 });
        }
        return { rows: out };
    };

    const handleFile = (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        setParseError(''); setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array' });
                const { rows: parsed, error } = parseWb(wb);
                if (error) { setParseError(error); return; }
                if (!parsed.length) { setParseError('No data rows found.'); return; }
                setRows(parsed); setStep('preview');
            } catch { setParseError('Failed to read file. Make sure it is a valid .xlsx file.'); }
        };
        reader.readAsArrayBuffer(file);
    };

    const doImport = async () => {
        if (!validRows.length) return;
        setImporting(true);
        const res = [];
        let success = 0;
        try {
            for (const r of validRows) {
                try {
                    const resp = await fetch(`${variables.API_URL}freeissuegrn/lines/save`, {
                        method: 'POST', headers: authHeaders(),
                        body: JSON.stringify({
                            freeIssueGrnDetailId: 0,
                            freeIssueGrnId: grn.freeIssueGrnId,
                            description: r.description,
                            qty: r.qty ? Number(r.qty) : null,
                            uomName: r.uomName || null,
                            remarks: r.remarks || null,
                            createdBy: currentUser,
                        }),
                    });
                    if (resp.ok) { success++; res.push({ rowNumber: r._rowNum, description: r.description, success: true }); }
                    else { const d = await resp.json().catch(() => ({})); res.push({ rowNumber: r._rowNum, description: r.description, success: false, message: d?.message || 'Save failed.' }); }
                } catch { res.push({ rowNumber: r._rowNum, description: r.description, success: false, message: 'Network error.' }); }
            }
            setResults({ successCount: success, failCount: res.length - success, results: res });
            setStep('done');
            if (success > 0 && onImported) onImported();
        } catch { setAlertMsg('Import failed.'); }
        finally { setImporting(false); }
    };

    const reset = () => { setStep('upload'); setFileName(''); setRows([]); setParseError(''); setResults(null); if (fileRef.current) fileRef.current.value = ''; };

    const ov  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' };
    const pan = { background: '#fff', borderRadius: 12, width: '92%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' };
    const btnPri = { padding: '8px 18px', background: '#1e40af', color: '#fff', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
    const btnSec = { padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 7, cursor: 'pointer', fontSize: 13 };
    const th = { textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0' };
    const td = { padding: '6px 10px', fontSize: 12.5, borderBottom: '1px solid #f1f5f9' };

    return (
        <div style={ov} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            <div style={pan} onMouseDown={e => e.stopPropagation()}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Import Material Lines from Excel</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{grn?.freeIssueGrnNumber} · Job {grn?.jobId}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 0, fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
                </div>

                <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
                    {step === 'upload' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
                            <div style={{ fontSize: 36 }}>📊</div>
                            <div style={{ fontWeight: 600, margin: '8px 0' }}>Select your Excel file</div>
                            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 14 }}>
                                Columns: <strong>Description</strong> (required), <strong>Qty</strong>, <strong>UOM</strong>, <strong>Remarks</strong>.
                            </div>
                            <button onClick={() => fileRef.current?.click()} style={btnPri}>Browse File…</button>
                            {parseError && <div style={{ color: '#dc2626', marginTop: 12, fontSize: 13 }}>⚠ {parseError}</div>}
                            <div style={{ marginTop: 16, fontSize: 12.5 }}>
                                <span style={{ color: '#64748b' }}>Don't have the template? </span>
                                <button onClick={downloadTemplate} style={{ ...btnSec, padding: '5px 12px' }}>↓ Download Template</button>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <>
                            <div style={{ marginBottom: 10, fontSize: 13 }}>📄 {fileName} · <strong>{validRows.length}</strong> valid{invalidRows.length ? ` · ${invalidRows.length} with errors (skipped)` : ''}</div>
                            {invalidRows.length > 0 && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 12 }}>
                                    {invalidRows.slice(0, 8).map(r => <div key={r._rowNum}>Row {r._rowNum}: {r._errors.join(' · ')}</div>)}
                                </div>
                            )}
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr><th style={th}>#</th><th style={th}>Description</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={th}>UOM</th><th style={th}>Remarks</th></tr></thead>
                                <tbody>
                                    {validRows.map(r => (
                                        <tr key={r._rowNum}>
                                            <td style={td}>{r._rowNum}</td>
                                            <td style={td}>{r.description}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{r.qty || '—'}</td>
                                            <td style={td}>{r.uomName || '—'}</td>
                                            <td style={td}>{r.remarks || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {validRows.length === 0 && <div style={{ color: '#64748b', padding: 12 }}>No valid rows. Fix the file and re-upload.</div>}
                        </>
                    )}

                    {step === 'done' && results && (
                        <div>
                            <div style={{ fontSize: 30, textAlign: 'center' }}>{results.successCount > 0 ? '✅' : '❌'}</div>
                            <div style={{ textAlign: 'center', fontWeight: 600, margin: '6px 0' }}>
                                {results.successCount} imported{results.failCount ? ` · ${results.failCount} failed` : ''}
                            </div>
                            {results.failCount > 0 && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 8, fontSize: 12, marginTop: 8 }}>
                                    {results.results.filter(r => !r.success).map(r => <div key={r.rowNumber}>Row {r.rowNumber} ({r.description}): {r.message}</div>)}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                    <button onClick={downloadTemplate} style={btnSec}>↓ Template</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {step === 'upload' && <button onClick={onClose} style={btnSec}>Cancel</button>}
                        {step === 'preview' && <>
                            <button onClick={reset} style={btnSec}>← Back</button>
                            <button onClick={doImport} disabled={importing || !validRows.length} style={btnPri}>
                                {importing ? 'Importing…' : `Import ${validRows.length} line${validRows.length !== 1 ? 's' : ''}`}
                            </button>
                        </>}
                        {step === 'done' && <>
                            <button onClick={reset} style={btnSec}>Import another</button>
                            <button onClick={onClose} style={btnPri}>Done</button>
                        </>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FreeIssueGrnLineImportModal;
