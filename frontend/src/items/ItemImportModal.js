import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import AlertModal from '../common/AlertModal';

// ── Download sample template (generated in-browser via SheetJS) ──────────────
const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Item Master ──────────────────────────────────────────────────
    const imHeaders = [
        'ItemCode', 'ItemName', 'ItemNameAr', 'ShortDescription',
        'CategoryName', 'BudgetHeader', 'ItemTypeName',
        'BaseUom', 'PurchaseUom', 'SalesUom',
        'Barcode', 'HSCode',
        'IsStockable', 'IsSaleable', 'IsPurchasable', 'IsActive',
    ];
    // Sample rows use values that exist in the DB masters so they import as-is.
    // Category / BudgetHeader / Item Type / UOM may be a name, code, or numeric id.
    const imSamples = [
        ['ITM-001', 'GI Pipe 50mm',       'أنبوب مجلفن',   'GI pipe 50mm OD',            'Galvanized Iron', 'Steel Materials',      'Material',   'MTR', 'MTR', 'MTR', '6291041500213', '7306.30', 'YES', 'YES', 'YES', 'YES'],
        ['ITM-002', 'Copper Cable 4mm',   '',               '4mm copper flex cable',      'Electrical',      'Electrical Materials', 'Material',   'MTR', 'MTR', 'MTR', '',              '8544.49', 'YES', 'YES', 'YES', 'YES'],
        ['ITM-003', 'Welding Consumable', '',               'Consumable for welding',     'Consumable',      'Consumables',          'Consumable', 'NOS', 'NOS', 'NOS', '6291041500220', '',        'YES', 'YES', 'YES', 'YES'],
    ];
    const imWs = XLSX.utils.aoa_to_sheet([imHeaders, ...imSamples]);
    imWs['!cols'] = [12, 32, 22, 36, 22, 20, 18, 10, 10, 10, 16, 12, 11, 11, 13, 11].map(w => ({ wch: w }));

    // YES/NO dropdown validation on flag columns (cols M–P = index 12–15)
    const yesNoDV = {
        type: 'list', formula1: '"YES,NO"', showErrorMessage: true,
        errorTitle: 'Invalid', error: 'Enter YES or NO', sqref: 'M2:P10000',
    };
    if (!imWs['!dataValidations']) imWs['!dataValidations'] = [];
    imWs['!dataValidations'].push(yesNoDV);

    XLSX.utils.book_append_sheet(wb, imWs, 'Item Master');

    // ── Sheet 2: Item Variants ────────────────────────────────────────────────
    const varHeaders = [
        'ItemCode', 'SKUCode',
        'Brand', 'Model', 'Colour', 'Size', 'Grade',
        'SupplierPartNo', 'ManufacturerPartNo',
        'StandardCost', 'ListPrice', 'CurrencyCode',
        'Weight', 'WeightUom',
        'MinStockLevel', 'MaxStockLevel', 'ReorderLevel',
        'LeadTimeDays', 'ShelfLifeDays',
        'CountryOfOrigin',
        'IsDefault', 'IsActive',
    ];
    const varSamples = [
        ['ITM-001', 'ITM-001-A', 'ASTM',  'SCH40',  'Black', '50mm',  'A106-B', 'SP-5001',  'MFR-SP50',  45.50, 55.00, 'AED', 3.20, 'KG', 10,  500, 50, 14, '',  'UNITED ARAB EMIRATES', 'YES', 'YES'],
        ['ITM-001', 'ITM-001-B', 'ASTM',  'SCH80',  'Black', '50mm',  'A106-B', 'SP-5002',  'MFR-SP50H', 62.00, 75.00, 'AED', 4.15, 'KG', 10,  300, 30, 14, '',  'UNITED ARAB EMIRATES', 'NO',  'YES'],
        ['ITM-002', 'ITM-002-A', 'Nexans','NYY-J',   'Red',   '4mm2',  '',       'NC-4001',  '',          18.75, 22.00, 'AED', 0.45, 'KG', 5,   200, 20, 21, '',  'FRANCE',                'YES', 'YES'],
    ];
    const varWs = XLSX.utils.aoa_to_sheet([varHeaders, ...varSamples]);
    varWs['!cols'] = [12, 14, 15, 15, 11, 11, 11, 18, 20, 13, 11, 11, 10, 10, 13, 13, 12, 12, 12, 22, 10, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, varWs, 'Item Variants');

    // ── Sheet 3: Reference Data (valid values from the live masters) ──────────
    // A cell in the Item Master sheet may use the Code, the Name, or the id.
    const uomRef = [
        ['EA', 'Each'], ['PCS', 'Pieces'], ['NOS', 'Numbers'], ['MTR', 'Metre'],
        ['CM', 'Centimetre'], ['MM', 'Millimetre'], ['FT', 'Feet'], ['INCH', 'Inch'],
        ['KG', 'Kilogram'], ['GM', 'Gram'], ['TON', 'Metric Ton'], ['LTR', 'Litre'],
        ['ML', 'Millilitre'], ['GAL', 'Gallon'], ['M3', 'Cubic Metre'], ['BOX', 'Box'],
        ['BAG', 'Bag'], ['DRUM', 'Drum'], ['PLT', 'Pallet'], ['HR', 'Hour'],
        ['DAY', 'Day'], ['MTH', 'Month'], ['JOB', 'Job'], ['LS', 'Lump Sum'], ['LOT', 'Lot'],
    ];
    const typeRef = ['Material', 'Service', 'Equipment', 'Consumable', 'Labour',
        'Subcontract', 'Equipment Hire', 'Overhead', 'Commission / Agency Fee'];
    const catRef = ['Aluminium', 'Bellow', 'Consumable', 'Container', 'Electrical',
        'Enclosure Accessories', 'Fastener', 'Free issue material', 'Galvanized Iron',
        'Gas', 'HVAC systems', 'Hydraulic', 'Instrumentation', 'Insulation'];
    const budgetRef = ['Steel Materials', 'Electrical Materials', 'Consumables', 'Pipes & Fittings',
        'Instrumentation', 'Insulation Materials', 'Non Ferrous Materials', 'Enclosure Accessories',
        'Bought Outs', 'Sub Contract', 'Miscellaneous'];
    const curRef = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'OMR', 'INR'];

    const refHeader = ['UOM Code', 'UOM Name', '', 'Item Type', '', 'Category (examples)', '', 'Budget Header (examples)', '', 'Currency'];
    const maxLen = Math.max(uomRef.length, typeRef.length, catRef.length, budgetRef.length, curRef.length);
    const refRows = [refHeader];
    for (let i = 0; i < maxLen; i++) {
        refRows.push([
            uomRef[i]?.[0] || '', uomRef[i]?.[1] || '', '',
            typeRef[i] || '', '',
            catRef[i] || '', '',
            budgetRef[i] || '', '',
            curRef[i] || '',
        ]);
    }
    const refWs = XLSX.utils.aoa_to_sheet(refRows);
    refWs['!cols'] = [10, 16, 3, 24, 3, 26, 3, 26, 3, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, refWs, 'Reference Data');

    XLSX.writeFile(wb, 'Item_Master_Import_Template.xlsx');
};

// ── Column map: Excel header → internal key ────────────────────────────────
const COL_MAP = {
    'itemcode':         'itemCode',
    'itemname':         'itemName',
    'itemnamear':       'itemNameAr',
    'shortdescription': 'shortDescription',
    'categoryname':     'categoryName',
    'budgetheader':     'budgetHeader',
    'budgetcategory':   'budgetHeader',
    'costheader':       'budgetHeader',
    'itemtypename':     'itemTypeName',
    'baseuom':          'baseUom',
    'purchaseuom':      'purchaseUom',
    'salesuom':         'salesUom',
    'barcode':          'barcode',
    'hscode':           'hsCode',
    'isstockable':      'isStockable',
    'issaleable':       'isSaleable',
    'ispurchasable':    'isPurchasable',
    'isactive':         'isActive',
};

const REQUIRED = ['itemName', 'budgetHeader', 'itemTypeName', 'baseUom'];
const DISPLAY_COLS = [
    { key: 'itemCode',      label: 'Item Code' },
    { key: 'itemName',      label: 'Item Name' },
    { key: 'categoryName',  label: 'Category' },
    { key: 'budgetHeader',  label: 'Budget Header' },
    { key: 'itemTypeName',  label: 'Type' },
    { key: 'baseUom',       label: 'Base UOM' },
    { key: 'isStockable',   label: 'Stockable' },
];

function parseYesNo(v) {
    const s = String(v ?? '').trim().toUpperCase();
    return s === 'YES' || s === 'TRUE' || s === '1' ? 'YES' : 'NO';
}

function validateRow(row) {
    const errors = [];
    for (const k of REQUIRED) {
        if (!row[k]?.toString().trim()) errors.push(`${k} is required`);
    }
    return errors;
}

function parseSheet(wb) {
    // Prefer "Item Master" sheet; fallback to first sheet
    const sheetName = wb.SheetNames.includes('Item Master')
        ? 'Item Master'
        : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Convert to array-of-arrays so we can find the header row
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Find the header row: look for a row that contains 'ItemName' or 'ItemCode'
    let headerIdx = -1;
    for (let i = 0; i < Math.min(aoa.length, 5); i++) {
        const row = aoa[i].map(c => String(c ?? '').trim().toLowerCase().replace(/\s/g, ''));
        if (row.includes('itemname') || row.includes('itemcode')) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx === -1) return { error: 'Could not find header row. Make sure the file has ItemName and ItemCode columns.' };

    // Build header→key mapping
    const headers = aoa[headerIdx].map(c => String(c ?? '').trim().toLowerCase().replace(/\s+/g, ''));
    const colKeys = headers.map(h => COL_MAP[h] || null);

    // Parse data rows (skip empty rows)
    const rows = [];
    for (let i = headerIdx + 1; i < aoa.length; i++) {
        const raw = aoa[i];
        // Skip completely empty rows
        if (raw.every(c => !String(c ?? '').trim())) continue;

        const obj = {};
        colKeys.forEach((key, ci) => {
            if (key) obj[key] = String(raw[ci] ?? '').trim();
        });

        // Normalise yes/no fields
        ['isStockable', 'isSaleable', 'isPurchasable', 'isActive'].forEach(k => {
            if (obj[k] !== undefined) obj[k] = parseYesNo(obj[k]);
        });

        const errors = validateRow(obj);
        rows.push({ ...obj, _errors: errors, _rowNum: i + 1 });
    }

    return { rows, sheetName };
}

// ══════════════════════════════════════════════════════════════════
const ItemImportModal = ({ onClose, onImported }) => {
    const currentUser = useCurrentUser();

    const [step,       setStep]       = useState('upload');   // upload | preview | done
    const [fileName,   setFileName]   = useState('');
    const [rows,       setRows]       = useState([]);
    const [parseError, setParseError] = useState('');
    const [importing,  setImporting]  = useState(false);
    const [results,    setResults]    = useState(null);
    const [showErrors, setShowErrors] = useState(false);
    const [alertMsg,   setAlertMsg]   = useState(null);
    const fileRef = useRef(null);

    const validRows   = rows.filter(r => r._errors.length === 0);
    const invalidRows = rows.filter(r => r._errors.length  > 0);

    // ── File pick & parse ─────────────────────────────────────────
    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseError('');
        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array' });
                const { rows: parsed, error } = parseSheet(wb);
                if (error) { setParseError(error); return; }
                if (!parsed.length) { setParseError('No data rows found in the file.'); return; }
                setRows(parsed);
                setStep('preview');
            } catch (err) {
                setParseError('Failed to read file. Make sure it is a valid .xlsx file.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // ── Submit to backend ─────────────────────────────────────────
    const doImport = async () => {
        if (!validRows.length) return;
        setImporting(true);
        try {
            const payload = {
                importedBy: currentUser,
                rows: validRows.map(r => ({
                    itemCode:         r.itemCode         || null,
                    itemName:         r.itemName,
                    itemNameAr:       r.itemNameAr        || null,
                    shortDescription: r.shortDescription  || null,
                    categoryName:     r.categoryName      || null,
                    budgetHeader:     r.budgetHeader      || null,
                    itemTypeName:     r.itemTypeName,
                    baseUom:          r.baseUom,
                    purchaseUom:      r.purchaseUom       || null,
                    salesUom:         r.salesUom          || null,
                    barcode:          r.barcode           || null,
                    hsCode:           r.hsCode            || null,
                    isStockable:      r.isStockable,
                    isSaleable:       r.isSaleable,
                    isPurchasable:    r.isPurchasable,
                    isActive:         r.isActive,
                })),
            };
            const res = await fetch(`${variables.API_URL}item/import`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) { setAlertMsg(data?.message || 'Import failed.'); return; }
            setResults(data);
            setStep('done');
            if (data.successCount > 0 && onImported) onImported();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setImporting(false); }
    };

    const reset = () => {
        setStep('upload'); setFileName(''); setRows([]); setParseError('');
        setResults(null); setShowErrors(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    // ── Render ────────────────────────────────────────────────────
    return (
        <div className="iim-overlay">
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            <div className="iim-panel" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="iim-header">
                    <div>
                        <div className="iim-title">Import Items from Excel</div>
                        <div className="iim-sub">Upload the completed Item Master Import Template (.xlsx)</div>
                    </div>
                    <button className="iim-close" onClick={onClose}>✕</button>
                </div>

                {/* Steps indicator */}
                <div className="iim-steps">
                    {['Upload','Preview','Done'].map((s, i) => {
                        const idx = ['upload','preview','done'].indexOf(step);
                        return (
                            <React.Fragment key={s}>
                                <div className={`iim-step ${i <= idx ? 'iim-step-active' : ''}`}>
                                    <span className="iim-step-dot">{i < idx ? '✓' : i + 1}</span>
                                    <span className="iim-step-lbl">{s}</span>
                                </div>
                                {i < 2 && <div className={`iim-step-line ${i < idx ? 'iim-step-line-done' : ''}`} />}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Body */}
                <div className="iim-body">

                    {/* ── STEP 1: UPLOAD ── */}
                    {step === 'upload' && (
                        <div className="iim-upload-zone">
                            <input ref={fileRef} type="file" accept=".xlsx,.xls"
                                   style={{ display: 'none' }} onChange={handleFile} />
                            <div className="iim-drop-icon">📊</div>
                            <div className="iim-drop-title">Select your Excel file</div>
                            <div className="iim-drop-sub">
                                Use the <strong>Item Master Import Template</strong> (.xlsx).<br/>
                                The file must contain an <em>Item Master</em> sheet with proper headers.
                            </div>
                            <button className="iim-btn-upload" onClick={() => fileRef.current?.click()}>
                                Browse File…
                            </button>
                            {parseError && <div className="iim-parse-error">⚠ {parseError}</div>}
                            <div className="iim-template-row">
                                <span className="iim-template-label">Don't have the template?</span>
                                <button className="iim-btn-template" onClick={downloadTemplate}>
                                    ↓ Download Sample Template
                                </button>
                            </div>
                            <div className="iim-tip">
                                💡 <strong>Tip:</strong> Fill the <em>Item Master</em> sheet, delete sample rows (3–5), then upload.
                                The <em>Category</em>, <em>Budget Header</em>, <em>Item Type</em> and <em>UOM</em> columns accept the <strong>name, code, or numeric id</strong>. Budget Header is required.
                            </div>
                        </div>
                    )}

                    {/* ── STEP 2: PREVIEW ── */}
                    {step === 'preview' && (
                        <>
                            <div className="iim-file-info">
                                <span className="iim-file-icon">📄</span>
                                <span className="iim-file-name">{fileName}</span>
                                <button className="iim-btn-ghost" onClick={reset}>Change file</button>
                            </div>

                            {/* Summary pills */}
                            <div className="iim-summary">
                                <div className="iim-sum-pill iim-sum-total">
                                    <strong>{rows.length}</strong> rows found
                                </div>
                                <div className="iim-sum-pill iim-sum-ok">
                                    <strong>{validRows.length}</strong> valid
                                </div>
                                {invalidRows.length > 0 && (
                                    <div className="iim-sum-pill iim-sum-err">
                                        <strong>{invalidRows.length}</strong> with errors
                                    </div>
                                )}
                            </div>

                            {/* Error rows toggle */}
                            {invalidRows.length > 0 && (
                                <div className="iim-err-banner">
                                    <span>⚠ {invalidRows.length} row{invalidRows.length > 1 ? 's' : ''} have validation errors and will be skipped.</span>
                                    <button className="iim-btn-ghost" onClick={() => setShowErrors(v => !v)}>
                                        {showErrors ? 'Hide errors' : 'Show errors'}
                                    </button>
                                </div>
                            )}
                            {showErrors && invalidRows.length > 0 && (
                                <div className="iim-err-list">
                                    {invalidRows.map(r => (
                                        <div key={r._rowNum} className="iim-err-row">
                                            <span className="iim-err-rownum">Row {r._rowNum}</span>
                                            <span className="iim-err-name">{r.itemName || r.itemCode || '—'}</span>
                                            <span className="iim-err-msgs">{r._errors.join(' · ')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Preview table */}
                            {validRows.length > 0 && (
                                <>
                                    <div className="iim-preview-label">
                                        Preview — {validRows.length} item{validRows.length !== 1 ? 's' : ''} will be imported
                                    </div>
                                    <div className="iim-table-wrap">
                                        <table className="iim-table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    {DISPLAY_COLS.map(c => <th key={c.key}>{c.label}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {validRows.map((r, i) => (
                                                    <tr key={r._rowNum}>
                                                        <td className="iim-td-num">{r._rowNum}</td>
                                                        {DISPLAY_COLS.map(c => (
                                                            <td key={c.key}>
                                                                {c.key === 'isStockable'
                                                                    ? <span className={`iim-yn ${r[c.key] === 'YES' ? 'iim-yn-yes' : 'iim-yn-no'}`}>{r[c.key]}</span>
                                                                    : (r[c.key] || <span className="iim-empty">—</span>)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {validRows.length === 0 && (
                                <div className="iim-no-valid">
                                    No valid rows to import. Fix the errors in your file and re-upload.
                                </div>
                            )}
                        </>
                    )}

                    {/* ── STEP 3: DONE ── */}
                    {step === 'done' && results && (
                        <div className="iim-done">
                            <div className="iim-done-icon">{results.successCount > 0 ? '✅' : '❌'}</div>
                            <div className="iim-done-title">
                                Import Complete
                            </div>
                            <div className="iim-done-summary">
                                <div className="iim-sum-pill iim-sum-ok"><strong>{results.successCount}</strong> imported</div>
                                {results.failCount > 0 &&
                                    <div className="iim-sum-pill iim-sum-err"><strong>{results.failCount}</strong> failed</div>}
                            </div>

                            {results.failCount > 0 && (
                                <div className="iim-err-list" style={{ marginTop: 12 }}>
                                    {results.results.filter(r => !r.success).map(r => (
                                        <div key={r.rowNumber} className="iim-err-row">
                                            <span className="iim-err-rownum">Row {r.rowNumber}</span>
                                            <span className="iim-err-name">{r.itemName || r.itemCode || '—'}</span>
                                            <span className="iim-err-msgs">{r.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {results.successCount > 0 && (
                                <div className="iim-done-success-list">
                                    {results.results.filter(r => r.success).slice(0, 8).map(r => (
                                        <div key={r.rowNumber} className="iim-done-success-row">
                                            <span className="iim-ok-check">✓</span>
                                            <span>{r.itemCode || `ID ${r.itemId}`}</span>
                                            <span className="iim-done-name">{r.itemName}</span>
                                        </div>
                                    ))}
                                    {results.successCount > 8 &&
                                        <div className="iim-done-more">…and {results.successCount - 8} more</div>}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="iim-footer">
                    <button className="iim-btn-sec iim-btn-tmpl" onClick={downloadTemplate}
                            title="Download the Excel import template">
                        ↓ Template
                    </button>
                    <div className="iim-footer-right">
                        {step === 'upload' && (
                            <button className="iim-btn-sec" onClick={onClose}>Cancel</button>
                        )}
                        {step === 'preview' && (
                            <>
                                <button className="iim-btn-sec" onClick={reset}>← Back</button>
                                <button className="iim-btn-pri"
                                        onClick={doImport}
                                        disabled={importing || validRows.length === 0}>
                                    {importing
                                        ? `Importing… (${validRows.length})`
                                        : `Import ${validRows.length} Item${validRows.length !== 1 ? 's' : ''}`}
                                </button>
                            </>
                        )}
                        {step === 'done' && (
                            <>
                                <button className="iim-btn-sec" onClick={reset}>Import another file</button>
                                <button className="iim-btn-pri" onClick={onClose}>Done</button>
                            </>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ItemImportModal;
