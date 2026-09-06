import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import AlertModal from '../common/AlertModal';

// Header aliases so a sheet someone renamed by hand still parses. Keys are
// normalised (lowercased, spaces stripped) — see norm() below.
const COL_MAP = {
    'section': 'section', 'bomsection': 'section', 'sectioncode': 'section', 'header': 'section',
    'itemcode': 'itemCode', 'item': 'itemCode', 'code': 'itemCode', 'partno': 'itemCode', 'partnumber': 'itemCode',
    'qty': 'qty', 'quantity': 'qty', 'requestedqty': 'qty',
    'uom': 'uom', 'unitofmeasure': 'uom', 'unit': 'uom',
    'unitprice': 'unitPrice', 'price': 'unitPrice', 'rate': 'unitPrice',
    'reqdate': 'reqDate', 'requireddate': 'reqDate', 'requesteddate': 'reqDate', 'date': 'reqDate',
    'critical': 'critical', 'iscritical': 'critical',
    'remarks': 'remarks', 'remark': 'remarks', 'notes': 'remarks', 'description': 'remarks',
};

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');

const truthy = (v) => ['1', 'y', 'yes', 'true', 'x'].includes(String(v ?? '').trim().toLowerCase());

// Excel dates arrive as a Date (cellDates) or as text — normalise both to
// YYYY-MM-DD, which is what the API parses.
const toIsoDate = (v) => {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) {
        const p = (n) => String(n).padStart(2, '0');
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    const d = new Date(v);
    return isNaN(d) ? null : toIsoDate(d);   // null = unparseable, flagged as a row error
};

/**
 * Import BOM lines from Excel — same shape as the Employee and Budget importers:
 * download template → fill → upload → preview with per-row errors → import.
 *
 * Sections are resolved against THIS BOM's job type (the `sections` prop, already
 * loaded by BomDetailPage), because the same section code exists once per job
 * type. Item codes are validated server-side by sp_ImportBomDetail — there are
 * thousands of items and pulling them all just to validate would be wasteful;
 * they are fetched only when someone asks for the template, to fill its
 * reference sheet.
 *
 * A row whose Section+ItemCode already exists on the BOM ADDS its qty to that
 * line rather than duplicating it (the proc reports "Merged into existing line").
 */
const BomImportModal = ({ bomHeaderId, sections = [], onClose, onImported }) => {
    const currentUser = useCurrentUser();

    const [uomList, setUomList]     = useState([]);
    const [step, setStep]           = useState('upload');
    const [fileName, setFileName]   = useState('');
    const [rows, setRows]           = useState([]);
    const [parseError, setParseError] = useState('');
    const [importing, setImporting] = useState(false);
    const [results, setResults]     = useState(null);
    const [tplLoading, setTplLoading] = useState(false);
    const [alertMsg, setAlertMsg]   = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        fetch(`${variables.API_URL}item/uoms`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setUomList(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const validRows   = rows.filter(r => r._errors.length === 0);
    const invalidRows = rows.filter(r => r._errors.length > 0);

    const findSection = (text) => sections.find(s =>
        norm(s.sectionCode) === norm(text) || norm(s.sectionName) === norm(text));

    // ── Template ────────────────────────────────────────────────
    const downloadTemplate = async () => {
        setTplLoading(true);
        let items = [];
        try {
            const res = await fetch(
                `${variables.API_URL}item/search?isActive=true&pageSize=5000&page=1&sortCol=ItemCode&sortDir=ASC`,
                { headers: authHeaders() });
            if (res.ok) { const d = await res.json(); items = d.data || []; }
        } catch { /* reference sheet is a convenience — the template is still usable without it */ }

        const wb = XLSX.utils.book_new();

        const sampleSection = sections[0]?.sectionCode || 'STEEL';
        const sampleItem    = items[0]?.itemCode || '112204';
        const sampleUom     = uomList[0]?.uomCode || uomList[0]?.uomName || 'NOS';
        const ws = XLSX.utils.aoa_to_sheet([
            ['Section', 'ItemCode', 'Qty', 'UOM', 'UnitPrice', 'ReqDate', 'Critical', 'Remarks'],
            [sampleSection, sampleItem, 10, sampleUom, 125.5, '2026-09-15', 'N', ''],
            [sampleSection, sampleItem, 5,  sampleUom, 0,     '',           'Y', 'Long lead item'],
        ]);
        ws['!cols'] = [20, 18, 10, 10, 12, 12, 9, 30].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'BOM Lines');

        const secWs = XLSX.utils.aoa_to_sheet([
            ['Section Code', 'Section Name'],
            ...sections.map(s => [s.sectionCode, s.sectionName]),
        ]);
        secWs['!cols'] = [22, 34].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, secWs, 'Sections');

        const uomWs = XLSX.utils.aoa_to_sheet([
            ['UOM Code', 'UOM Name'],
            ...uomList.map(u => [u.uomCode, u.uomName]),
        ]);
        uomWs['!cols'] = [14, 22].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, uomWs, 'UOMs');

        if (items.length) {
            const itemWs = XLSX.utils.aoa_to_sheet([
                ['Item Code', 'Item Name'],
                ...items.map(i => [i.itemCode, i.itemName]),
            ]);
            itemWs['!cols'] = [18, 52].map(w => ({ wch: w }));
            XLSX.utils.book_append_sheet(wb, itemWs, 'Items');
        }

        XLSX.writeFile(wb, 'BOM_Lines_Import_Template.xlsx');
        setTplLoading(false);
    };

    // ── Parse ───────────────────────────────────────────────────
    const parseWb = (wb) => {
        const ws = wb.Sheets[wb.SheetNames.includes('BOM Lines') ? 'BOM Lines' : wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        let headerIdx = -1;
        for (let i = 0; i < Math.min(aoa.length, 5); i++) {
            const r = aoa[i].map(norm);
            if (r.includes('itemcode') || r.includes('section') || r.includes('qty')) { headerIdx = i; break; }
        }
        if (headerIdx === -1) return { error: 'Could not find a header row with a Section, ItemCode or Qty column.' };

        const cols = aoa[headerIdx].map(c => COL_MAP[norm(c)] || null);
        if (!cols.includes('itemCode')) return { error: 'Missing required column: ItemCode. Please use the template.' };
        if (!cols.includes('qty'))      return { error: 'Missing required column: Qty. Please use the template.' };

        const out = [];
        for (let i = headerIdx + 1; i < aoa.length; i++) {
            const raw = aoa[i];
            if (raw.every(c => !String(c ?? '').trim())) continue;

            const o = {};
            cols.forEach((k, ci) => {
                if (!k) return;
                o[k] = k === 'reqDate' ? raw[ci] : String(raw[ci] ?? '').trim();
            });
            const errors = [];

            // Section — resolved against this BOM's job type only.
            if (!o.section) errors.push('Section required');
            else if (!findSection(o.section)) errors.push(`Unknown Section "${o.section}"`);

            if (!o.itemCode) errors.push('ItemCode required');

            if (!o.qty || isNaN(Number(o.qty)) || Number(o.qty) <= 0) errors.push('Qty must be > 0');
            if (o.unitPrice && isNaN(Number(o.unitPrice))) errors.push('UnitPrice must be a number');

            // UOM optional — blank falls back to the item's base UOM server-side.
            if (o.uom) {
                const um = uomList.find(u => norm(u.uomCode) === norm(o.uom) || norm(u.uomName) === norm(o.uom));
                if (!um) errors.push(`Unknown UOM "${o.uom}"`);
            }

            const iso = toIsoDate(o.reqDate);
            if (iso === null) errors.push(`ReqDate "${o.reqDate}" is not a date`);
            o._reqDate = iso || '';

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
                const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
                const { rows: parsed, error } = parseWb(wb);
                if (error) { setParseError(error); return; }
                if (!parsed.length) { setParseError('No data rows found.'); return; }
                setRows(parsed); setStep('preview');
            } catch { setParseError('Failed to read file. Make sure it is a valid .xlsx file.'); }
        };
        reader.readAsArrayBuffer(file);
    };

    // ── Import ──────────────────────────────────────────────────
    // One POST for the whole sheet: bom/detail/import loops server-side and
    // returns a per-row result, so a bad line never aborts the rest.
    const doImport = async () => {
        if (!validRows.length) return;
        setImporting(true);
        try {
            const res = await fetch(`${variables.API_URL}bom/detail/import`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    bomHeaderId,
                    importedBy: currentUser,
                    rows: validRows.map(r => ({
                        section:    r.section,
                        itemCode:   r.itemCode,
                        qty:        Number(r.qty),
                        uom:        r.uom || null,
                        unitPrice:  Number(r.unitPrice) || 0,
                        reqDate:    r._reqDate || null,
                        isCritical: truthy(r.critical),
                        remarks:    r.remarks || null,
                    })),
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setAlertMsg(d?.message || 'Import failed.'); return; }

            // Server row numbers are 1..n over the rows we sent; map them back to
            // the spreadsheet row numbers the user is actually looking at.
            const mapped = (d.results || []).map(r => ({
                ...r,
                sheetRow: validRows[r.rowNumber - 1]?._rowNum ?? r.rowNumber,
            }));
            setResults({ ...d, results: mapped });
            setStep('done');
            if (d.successCount > 0 && onImported) onImported();
        } catch {
            setAlertMsg('Network error — could not reach the server.');
        } finally {
            setImporting(false);
        }
    };

    const reset = () => {
        setStep('upload'); setFileName(''); setRows([]); setParseError(''); setResults(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    // ── Styles (same as the budget importer) ────────────────────
    const ov  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' };
    const pan = { background: '#fff', borderRadius: 12, width: '92%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column' };
    const btnPri = { padding: '8px 18px', background: '#1e40af', color: '#fff', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
    const btnSec = { padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 7, cursor: 'pointer', fontSize: 13 };
    const th = { textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0' };
    const td = { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9' };

    return (
        <div style={ov} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            <div style={pan} onMouseDown={e => e.stopPropagation()}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Import BOM Lines from Excel</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {sections.length} section{sections.length !== 1 ? 's' : ''} available for this job type
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 0, fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
                </div>

                <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
                    {step === 'upload' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
                            <div style={{ fontSize: 36 }}>📦</div>
                            <div style={{ fontWeight: 600, margin: '8px 0' }}>Select your Excel file</div>
                            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 14, lineHeight: 1.6 }}>
                                Columns: <strong>Section, ItemCode, Qty, UOM, UnitPrice, ReqDate, Critical, Remarks</strong>.
                                <br />Section and ItemCode and Qty are required; the rest are optional.
                                <br />Blank <strong>UOM</strong> uses the item's base unit. A row matching an existing
                                Section + Item <strong>adds</strong> its qty to that line instead of duplicating it.
                            </div>
                            <button onClick={() => fileRef.current?.click()} style={btnPri}>Browse File…</button>
                            {parseError && <div style={{ color: '#dc2626', marginTop: 12, fontSize: 13 }}>⚠ {parseError}</div>}
                            <div style={{ marginTop: 16, fontSize: 12.5 }}>
                                <span style={{ color: '#64748b' }}>Don't have the template? </span>
                                <button onClick={downloadTemplate} disabled={tplLoading} style={{ ...btnSec, padding: '5px 12px' }}>
                                    {tplLoading ? 'Building…' : '↓ Download Template'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <>
                            <div style={{ marginBottom: 10, fontSize: 13 }}>
                                📄 {fileName} · <strong>{validRows.length}</strong> valid
                                {invalidRows.length ? ` · ${invalidRows.length} with errors (skipped)` : ''}
                            </div>
                            {invalidRows.length > 0 && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 12 }}>
                                    {invalidRows.slice(0, 8).map(r => <div key={r._rowNum}>Row {r._rowNum}: {r._errors.join(' · ')}</div>)}
                                    {invalidRows.length > 8 && <div style={{ color: '#991b1b', marginTop: 4 }}>…and {invalidRows.length - 8} more</div>}
                                </div>
                            )}
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr>
                                    <th style={th}>#</th>
                                    <th style={th}>Section</th>
                                    <th style={th}>Item Code</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                                    <th style={th}>UOM</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Unit Price</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                                    <th style={th}>Req Date</th>
                                </tr></thead>
                                <tbody>
                                    {validRows.map(r => (
                                        <tr key={r._rowNum}>
                                            <td style={td}>{r._rowNum}</td>
                                            <td style={td}>{findSection(r.section)?.sectionName || r.section}</td>
                                            <td style={td}>{r.itemCode}{truthy(r.critical) ? ' ⚠' : ''}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{r.qty}</td>
                                            <td style={td}>{r.uom || '—'}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{r.unitPrice || '0'}</td>
                                            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                                                {(Number(r.qty) * (Number(r.unitPrice) || 0)).toLocaleString()}
                                            </td>
                                            <td style={td}>{r._reqDate || '—'}</td>
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
                                    {results.results.filter(r => !r.success).map(r => (
                                        <div key={r.rowNumber}>Row {r.sheetRow} ({r.itemCode}): {r.message}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                    <button onClick={downloadTemplate} disabled={tplLoading} style={btnSec}>
                        {tplLoading ? 'Building…' : '↓ Template'}
                    </button>
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

export default BomImportModal;
