import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate, statusBadgeCfg, today } from '../inventoryConstants';
import AlertModal from '../../common/AlertModal';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { searchText: '', status: '', fromJobId: '', toJobId: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ── New Transfer header modal ─────────────────────────────────
const NewTransferModal = ({ jobs, currentUser, onClose, onCreated }) => {
    const [form,   setForm]   = useState({ fromJobId: '', toJobId: '', transferDate: today(), transferReason: '', notes: '' });
    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState('');

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const submit = async () => {
        if (!form.fromJobId)                               return setErr('From Job is required.');
        if (!form.toJobId)                                 return setErr('To Job is required.');
        if (form.fromJobId === form.toJobId)               return setErr('From and To jobs must be different.');
        if (!form.transferReason.trim())                   return setErr('Transfer Reason is required.');
        setErr(''); setSaving(true);
        try {
            const r = await fetch(`${variables.API_URL}stocktransfer/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    transferId: 0, fromJobId: form.fromJobId, toJobId: form.toJobId,
                    transferDate: form.transferDate, transferReason: form.transferReason,
                    notes: form.notes || null, createdBy: currentUser,
                }),
            });
            const d = await r.json();
            if (!r.ok) { setErr(d?.message || 'Save failed.'); return; }
            onCreated(d.transferId);
        } finally { setSaving(false); }
    };

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000 }}>
            <div style={{ background:'#fff', borderRadius:10, width:500, maxWidth:'94vw', boxShadow:'0 12px 40px rgba(0,0,0,.22)' }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, color:'#0f172a' }}>
                    New Stock Transfer
                </div>
                <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', marginBottom:4 }}>
                                From Job <span style={{ color:'#dc2626' }}>*</span>
                            </label>
                            <select className="pf-input" style={{ margin:0 }} value={form.fromJobId} onChange={e => set('fromJobId', e.target.value)}>
                                <option value="">-- Select --</option>
                                {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', marginBottom:4 }}>
                                To Job <span style={{ color:'#dc2626' }}>*</span>
                            </label>
                            <select className="pf-input" style={{ margin:0 }} value={form.toJobId} onChange={e => set('toJobId', e.target.value)}>
                                <option value="">-- Select --</option>
                                {jobs.filter(j => j.jobId !== form.fromJobId).map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', marginBottom:4 }}>
                            Transfer Date
                        </label>
                        <input type="date" className="pf-input" style={{ margin:0 }} value={form.transferDate} onChange={e => set('transferDate', e.target.value)} />
                    </div>
                    <div>
                        <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', marginBottom:4 }}>
                            Transfer Reason <span style={{ color:'#dc2626' }}>*</span>
                        </label>
                        <textarea className="pf-input pf-textarea" rows={2} style={{ margin:0 }}
                            placeholder="Why is this stock being transferred?"
                            value={form.transferReason} onChange={e => set('transferReason', e.target.value)} />
                    </div>
                    <div>
                        <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', marginBottom:4 }}>
                            Remarks
                        </label>
                        <input type="text" className="pf-input" style={{ margin:0 }}
                            placeholder="Optional remarks"
                            value={form.notes} onChange={e => set('notes', e.target.value)} />
                    </div>
                    {err && (
                        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#dc2626' }}>
                            ⚠ {err}
                        </div>
                    )}
                </div>
                <div style={{ padding:'12px 20px', display:'flex', justifyContent:'flex-end', gap:8, borderTop:'1px solid #f1f5f9' }}>
                    <button onClick={onClose} disabled={saving} style={{ padding:'7px 18px', borderRadius:6, border:'1px solid #cbd5e1', background:'#f8fafc', fontSize:13, cursor:'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={submit} disabled={saving}
                        style={{ padding:'7px 18px', borderRadius:6, border:'none', background:'#3730a3', color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?.7:1 }}>
                        {saving ? 'Creating…' : 'Create & Add Items →'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main list ─────────────────────────────────────────────────
const StockTransfer = () => {
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const { getStatusConfig, getModuleStatuses } = useLookup();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const canAdd = canDo('/inventory-transfer', 'ADD');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(200);
    const [sortCol,    setSortCol]   = useState('TransferDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });

    const [jobs,       setJobs]      = useState([]);
    const [showNew,    setShowNew]   = useState(false);
    const [alertMsg,   setAlertMsg]  = useState(null);

    const gridRef = useRef({ pageSize: 200, sortCol: 'TransferDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&excludeClosedStatus=true&approvalStatus=Approved`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobs(d.data || [])).catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.fromJobId)  q.set('fromJobId',  af.fromJobId);
        if (af.toJobId)    q.set('toJobId',    af.toJobId);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}stocktransfer/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (jobOpts) => ({
        searchText: { label: 'Search',    type: 'text',        placeholder: 'Transfer #, job…' },
        status:     { label: 'Status',    type: 'multiselect', options: getModuleStatuses('STR').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        fromJobId:  { label: 'From Job',  type: 'select',      placeholder: 'All Jobs', options: jobOpts },
        toJobId:    { label: 'To Job',    type: 'select',      placeholder: 'All Jobs', options: jobOpts },
        dateFrom:   { label: 'Date From', type: 'date' },
        dateTo:     { label: 'Date To',   type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        registerFilters('stock-transfer', buildDefs([]), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('stock-transfer');
    }, []); // eslint-disable-line

    useEffect(() => {
        const jobOpts = jobs.map(j => ({ value: j.jobId, label: j.jobId + (j.projectName ? ' — ' + j.projectName : '') }));
        updateFilterDefs('stock-transfer', buildDefs(jobOpts));
    }, [jobs, getModuleStatuses]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage         = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
        </th>
    );

    const pageNums = () => {
        const range = 5, start = Math.max(1, Math.min(page - 2, totalPages - range + 1));
        return Array.from({ length: Math.min(range, totalPages) }, (_, i) => start + i);
    };

    return (
        <div className="po-page">
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}

            {showNew && (
                <NewTransferModal
                    jobs={jobs}
                    currentUser={currentUser}
                    onClose={() => setShowNew(false)}
                    onCreated={(id) => navigate(`/inventory-transfer/${id}?tab=items`)}
                />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Stock Transfers</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && (
                                <button className="po-btn-pri" onClick={() => setShowNew(true)}>+ New Transfer</button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="TransferNo">Transfer #</Th>
                                <Th col="TransferDate">Date</Th>
                                <Th col="FromJobId">From Job</Th>
                                <Th col="ToJobId">To Job</Th>
                                <th>Lines</th>
                                <Th col="Status">Status</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={6} className="po-empty">No stock transfers found.</td></tr>
                            ) : rows.map(t => {
                                const sCfg = statusBadgeCfg(getStatusConfig('STR', t.status));
                                return (
                                    <tr key={t.transferId} className="po-row-link" onClick={() => navigate(`/inventory-transfer/${t.transferId}`)}>
                                        <td><span className="po-num-link">{t.transferNo}</span></td>
                                        <td>{fmtDate(t.transferDate)}</td>
                                        <td>
                                            <span style={{ fontFamily:'Courier New', fontSize:11, color:'#065f46', background:'#d1fae5', padding:'2px 6px', borderRadius:4 }}>
                                                {t.fromJobId}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontFamily:'Courier New', fontSize:11, color:'#1e40af', background:'#dbeafe', padding:'2px 6px', borderRadius:4 }}>
                                                {t.toJobId}
                                            </span>
                                        </td>
                                        <td style={{ color:'#64748b' }}>{t.lineCount}</td>
                                        <td>
                                            <span className="po-status-badge" style={{ background:sCfg.bg, color:sCfg.color }}>
                                                <span className="po-status-dot" style={{ background:sCfg.dot }} />
                                                {sCfg.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockTransfer;
