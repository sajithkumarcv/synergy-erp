import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { useFilters } from '../FilterContext';
import { useInitialFilters } from '../utils/useInitialFilters';
import { fmt, fmtDate, today, statusBadgeCfg } from '../procurement/procurementConstants';
import RowLink from '../common/RowLink';
import '../procurement/Procurement.css';

// PO report, item-line wise: one row per purchase order line (GET reports/po-lines -> sp_ReportPoLines).
// Filters are the same set, with the same panel, as the Purchase Orders grid. Paging and sorting are done here
// on the full result; amounts are in the PO currency, base-currency amounts use the PO exchange rate.

const FILTER_KEY = 'po-lines-report';
const DEFAULT_FILTERS = { searchText: '', status: '', supplierId: '', jobTypeIds: '', jobId: '', expenseCategoryId: '', priority: '', createdBy: '', dateFrom: '', dateTo: '' };
const PAGE_SIZES = [50, 100, 200, 500, 1000];

const csvEsc = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const PoLineReport = () => {
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { getModuleStatuses, getVList, getStatusConfig, baseCurrencyCode } = useLookup();
    const initialFilters = useInitialFilters(DEFAULT_FILTERS, FILTER_KEY);

    const [rows,     setRows]     = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [sortCol,  setSortCol]  = useState('poDate');
    const [sortDir,  setSortDir]  = useState('desc');
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(window.matchMedia('(max-width:768px)').matches ? 20 : 200);

    const [jobTypes,        setJobTypes]        = useState([]);
    const [jobOptions,      setJobOptions]      = useState([]);
    const [supplierOptions, setSupplierOptions] = useState([]);
    const [categoryOptions, setCategoryOptions] = useState([]);
    const [jobOptTypeIds,   setJobOptTypeIds]   = useState(initialFilters.jobTypeIds || '');
    const appliedRef = useRef(initialFilters);

    useEffect(() => {
        fetch(`${variables.API_URL}Lookup/budgetcategories`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setCategoryOptions((Array.isArray(d) ? d : []).map(c => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))))
            .catch(console.error);
        fetch(`${variables.API_URL}job/types`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobTypes(Array.isArray(d) ? d : [])).catch(console.error);
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierOptions((d.data || []).map(s => ({
                value: String(s.supplierId),
                label: s.supplierCode ? `${s.supplierCode} — ${s.supplierName}` : s.supplierName,
            })))).catch(console.error);
    }, []);

    // Job dropdown follows the Job Type selection, as on the PO grid.
    const loadJobOptions = useCallback((jobTypeIds) => {
        setJobOptTypeIds(jobTypeIds || '');
        const q = new URLSearchParams({ pageSize: 500, page: 1, excludeClosedStatus: true });
        if (jobTypeIds) q.set('jobTypeIds', jobTypeIds);
        fetch(`${variables.API_URL}job/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobOptions((d.data || []).map(j => ({
                value: j.jobId, label: j.jobId + (j.projectName ? ' — ' + j.projectName : ''),
            })))).catch(console.error);
    }, []);
    useEffect(() => { loadJobOptions(initialFilters.jobTypeIds); }, []); // eslint-disable-line

    const load = useCallback((af) => {
        setLoading(true); setError('');
        const q = new URLSearchParams();
        Object.entries(af).forEach(([k, v]) => { if (v) q.set(k, v); });
        fetch(`${variables.API_URL}reports/po-lines?${q}`, { headers: authHeaders() })
            .then(async r => {
                const d = await r.json();
                if (!r.ok) { setError(d?.message || 'Error loading report.'); setRows([]); return; }
                setRows(d);
            })
            .catch(() => { setError('Network error.'); setRows([]); })
            .finally(() => setLoading(false));
    }, []);

    const buildDefs = (jobTypeOpts, jobOpts, supplierOpts, jobSearchTypeIds, categoryOpts) => ({
        searchText:  { label: 'Search',     type: 'text',   placeholder: 'PO #, vendor, ref, item…' },
        status:      { label: 'Status',     type: 'multiselect',
                       options: getModuleStatuses('PO').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        supplierId:  { label: 'Supplier',   type: 'searchable-select', placeholder: 'Search supplier…',
                       search: { url: 'supplier/search', valueKey: 'supplierId', codeKey: 'supplierCode', nameKey: 'supplierName' },
                       options: supplierOpts },
        jobTypeIds:  { label: 'Job Type',   type: 'chip-multiselect', options: jobTypeOpts },
        jobId:       { label: 'Job ID',     type: 'searchable-select', placeholder: 'Search job…',
                       search: { url: 'job/search', valueKey: 'jobId', codeKey: 'jobId', nameKey: 'projectName',
                                 params: { excludeClosedStatus: true, ...(jobSearchTypeIds ? { jobTypeIds: jobSearchTypeIds } : {}) } },
                       options: jobOpts },
        expenseCategoryId: { label: 'Budget Category', type: 'select', placeholder: 'All Categories', options: categoryOpts },
        priority:    { label: 'Priority',   type: 'select', placeholder: 'All Priorities', options: getVList('Procurement', 'Priority') },
        createdBy:   { label: 'Created By', type: 'text',   placeholder: 'Username…' },
        dateFrom:    { label: 'Date From',  type: 'date' },
        dateTo:      { label: 'Date To',    type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const prev = appliedRef.current;
            appliedRef.current = { ...vals };
            setPage(1);
            load(vals);
            if (vals.jobTypeIds !== prev.jobTypeIds) loadJobOptions(vals.jobTypeIds);
        };
        registerFilters(FILTER_KEY, buildDefs([], [], [], initialFilters.jobTypeIds, []), initialFilters, onApply);
        load(initialFilters);
        return () => unregisterFilters(FILTER_KEY);
    }, []); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs(FILTER_KEY, buildDefs(
            jobTypes.map(t => ({ value: t.jobTypeId, label: t.jobTypeName })),
            jobOptions, supplierOptions, jobOptTypeIds, categoryOptions));
    }, [jobTypes, jobOptions, supplierOptions, jobOptTypeIds, categoryOptions, getModuleStatuses, getVList]); // eslint-disable-line

    const handleSort = col => {
        setPage(1);
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const sorted = useMemo(() => [...rows].sort((a, b) => {
        const av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
        const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? c : -c;
    }), [rows, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);
    const poCount    = useMemo(() => new Set(rows.map(r => r.poId)).size, [rows]);
    const totalBase  = useMemo(() => rows.reduce((s, r) => s + (r.lineAmountBase || 0), 0), [rows]);
    const recvBase   = useMemo(() => rows.reduce((s, r) => s + (r.receivedAmountBase || 0), 0), [rows]);

    const exportCsv = () => {
        const head = ['PO No', 'PO Date', 'PO Status', 'Supplier', 'Vendor Ref', 'Job', 'Budget Category', 'PR No', 'Line', 'Item Code', 'Item Description',
            'UOM', 'Ordered Qty', 'Received Qty', 'Balance Qty', 'Currency', 'Rate', 'Unit Price', 'Tax %', 'Line Amount', 'Line Amount incl. Tax',
            `Line Amount (${baseCurrencyCode})`, `Received (${baseCurrencyCode})`, 'Line Status', 'Delivery Date', 'Priority', 'Created By', 'Remarks'];
        const lines = [head.join(','), ...sorted.map(r => [
            r.poNumber, r.poDate ? fmtDate(r.poDate) : '', r.poStatus, r.vendorName, r.vendorRef, r.jobId,
            r.expenseCategoryName, r.prNumber, r.lineNum, r.itemCode, r.itemDesc, r.uomName,
            r.orderedQty, r.receivedQty, r.balanceQty, r.currencyShort, r.exchangeRate, r.unitPrice, r.taxPct,
            r.lineAmount, r.lineAmountWithTax, r.lineAmountBase, r.receivedAmountBase, r.lineStatus,
            r.deliveryDate ? fmtDate(r.deliveryDate) : '', r.priority, r.createdBy, r.remarks,
        ].map(csvEsc).join(','))];
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url; a.download = `PO_Item_Lines_${today()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const Th = ({ col, children, right }) => (
        <th className="po-th-sortable" style={right ? { textAlign: 'right' } : undefined} onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <span style={{ opacity: sortCol === col ? 1 : .35 }}>{sortCol !== col ? '⇅' : sortDir === 'asc' ? '↑' : '↓'}</span></div>
        </th>
    );
    const num = (v, d = 2) => v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
    const diffCcy = r => r.exchangeRate && Number(r.exchangeRate) !== 1;

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">PO Report — Item Lines</div>
                            <div className="po-page-sub">
                                {rows.length} line{rows.length !== 1 ? 's' : ''} on {poCount} purchase order{poCount !== 1 ? 's' : ''}
                                {rows.length > 0 && <> · Amount <b>{fmt(totalBase)}</b> {baseCurrencyCode} · Received <b>{fmt(recvBase)}</b> {baseCurrencyCode}</>}
                            </div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {rows.length > 0 && <button className="po-btn-pri" onClick={exportCsv}>⬇ Export CSV</button>}
                        </div>
                    </div>
                </div>

                {error && <div className="po-empty" style={{ color: '#b91c1c' }}>⚠ {error}</div>}

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div>
                        </div>
                    )}
                    <table className={`po-table rt-cards${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="poNumber">PO #</Th>
                                <Th col="poDate">Date</Th>
                                <Th col="vendorName">Supplier</Th>
                                <Th col="jobId">Job</Th>
                                <Th col="prNumber">PR</Th>
                                <Th col="lineNum">Line</Th>
                                <Th col="itemCode">Item Code</Th>
                                <Th col="itemDesc">Description</Th>
                                <th>UOM</th>
                                <Th col="orderedQty" right>Ordered</Th>
                                <Th col="receivedQty" right>Received</Th>
                                <Th col="balanceQty" right>Balance</Th>
                                <Th col="currencyShort">Curr</Th>
                                <Th col="unitPrice" right>Unit Price</Th>
                                <Th col="taxPct" right>Tax %</Th>
                                <Th col="lineAmount" right>Line Amount</Th>
                                <Th col="lineAmountBase" right>{`Amount (${baseCurrencyCode})`}</Th>
                                <Th col="poStatus">PO Status</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.length === 0 && !loading ? (
                                <tr><td colSpan={18} className="po-empty">No PO lines match the filters on the left.</td></tr>
                            ) : paged.map(r => {
                                const cfg = statusBadgeCfg(getStatusConfig('PO', r.poStatus));
                                return (
                                    <tr key={r.poLineId}>
                                        <td data-label="PO #"><RowLink className="po-num-link" to={`/purchase-orders/${r.poId}`}>{r.poNumber}</RowLink></td>
                                        <td data-label="Date">{fmtDate(r.poDate)}</td>
                                        <td data-label="Supplier">{r.vendorName || '—'}</td>
                                        <td data-label="Job">{r.jobId
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                        <td data-label="PR">{r.prNumber || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                        <td data-label="Line">{r.lineNum}</td>
                                        <td data-label="Item Code" style={{ fontFamily: 'Courier New', fontSize: 11.5 }}>{r.itemCode || '—'}</td>
                                        <td data-label="Description">{r.itemDesc || '—'}</td>
                                        <td data-label="UOM">{r.uomName || '—'}</td>
                                        <td data-label="Ordered" className="po-num-cell">{num(r.orderedQty, 4)}</td>
                                        <td data-label="Received" className="po-num-cell">{num(r.receivedQty, 4)}</td>
                                        <td data-label="Balance" className="po-num-cell"
                                            style={r.balanceQty > 0 ? { color: '#b45309', fontWeight: 600 } : undefined}>{num(r.balanceQty, 4)}</td>
                                        <td data-label="Curr" style={diffCcy(r) ? { color: '#7c3aed', fontWeight: 700 } : undefined}>{r.currencyShort || '—'}</td>
                                        <td data-label="Unit Price" className="po-num-cell">{fmt(r.unitPrice)}</td>
                                        <td data-label="Tax %" className="po-num-cell">{num(r.taxPct)}</td>
                                        <td data-label="Line Amount" className="po-num-cell">{fmt(r.lineAmount)}</td>
                                        <td data-label={`Amount (${baseCurrencyCode})`} className="po-num-cell" style={{ fontWeight: 600 }}>{fmt(r.lineAmountBase)}</td>
                                        <td data-label="PO Status">
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.color, padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 700 }}>
                                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot }} />{cfg.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> &nbsp;·&nbsp;{rows.length} line{rows.length !== 1 ? 's' : ''}</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                        <button className="po-page-btn po-page-btn-active">{page}</button>
                        <button className="po-page-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PoLineReport;
