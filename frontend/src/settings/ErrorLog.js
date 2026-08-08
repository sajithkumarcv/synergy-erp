import React, { useState, useCallback, useEffect } from 'react';
import { variables, authHeaders } from '../Variable';
import '../reports/Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const weekAgo      = () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); };
const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = {
    dateFrom: weekAgo(), dateTo: today(),
    logLevel: '', source: '', controller: '', userId: '', searchText: '',
};

const fmtDateTime = d => d
    ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

const LEVEL_STYLE = {
    Error: { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
    Warn:  { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    Warning: { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    Info:  { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
};

const LevelBadge = ({ level }) => {
    const s = LEVEL_STYLE[level] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />{level || '—'}
        </span>
    );
};

const SourceBadge = ({ source }) => {
    const isClient = source === 'CLIENT';
    return (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: isClient ? '#f5f3ff' : '#ecfeff', color: isClient ? '#6d28d9' : '#0e7490' }}>
            {isClient ? '🖥 CLIENT' : '⚙ SERVER'}
        </span>
    );
};

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = []; const delta = 2;
    for (let i = 1; i <= totalPages; i++) { if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i); else if (pages[pages.length - 1] !== '…') pages.push('…'); }
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">Showing <strong>{totalRows === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)}</strong> of <strong>{totalRows}</strong></div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)} disabled={page === 1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
                {pages.map((p, i) => p === '…' ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span> : <button key={p} className={`rpt-pag-btn ${page === p ? 'active' : ''}`} onClick={() => onPage(p)}>{p}</button>)}
                <button className="rpt-pag-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages || totalPages === 0}>›</button>
                <button className="rpt-pag-btn" onClick={() => onPage(totalPages)} disabled={page === totalPages || totalPages === 0}>»</button>
            </div>
            <div className="rpt-pag-size">Rows: <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>{PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
    );
};

// ── Detail modal ───────────────────────────────────────────────
const LogDetailModal = ({ row, onClose }) => {
    if (!row) return null;
    const Field = ({ label, value, mono }) => (
        <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12.5, color: '#1e293b', fontFamily: mono ? 'monospace' : 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: mono ? '#f8fafc' : 'transparent', border: mono ? '1px solid #e2e8f0' : 'none', borderRadius: mono ? 6 : 0, padding: mono ? '8px 10px' : 0, maxHeight: mono ? 240 : 'none', overflowY: mono ? 'auto' : 'visible' }}>
                {value || <span style={{ color: '#94a3b8' }}>—</span>}
            </div>
        </div>
    );
    return (
        <div onClick={e => e.target === e.currentTarget && onClose()}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <LevelBadge level={row.logLevel} /><SourceBadge source={row.source} />
                        <span style={{ fontSize: 12, color: '#64748b' }}>#{row.logId} · {fmtDateTime(row.logDate)}</span>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ padding: 20, overflowY: 'auto' }}>
                    <Field label="Message" value={row.message} />
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}><Field label="Source / Controller" value={row.controller} /></div>
                        <div style={{ flex: 1, minWidth: 160 }}><Field label="Action" value={row.action} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 160 }}><Field label="User" value={row.userId} /></div>
                        <div style={{ flex: 1, minWidth: 160 }}><Field label="IP" value={row.ipAddress} /></div>
                        <div style={{ flex: 1, minWidth: 200 }}><Field label="Request Path" value={row.requestPath} /></div>
                    </div>
                    {row.innerException && <Field label="Inner Exception" value={row.innerException} mono />}
                    <Field label="Stack Trace" value={row.stackTrace} mono />
                </div>
            </div>
        </div>
    );
};

const ErrorLog = () => {
    const [filters, setFilters]   = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');
    const [page, setPage]         = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const [totalRows, setTotalRows] = useState(0);
    const [detail, setDetail]     = useState(null);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    const load = useCallback(async (pageArg, sizeArg) => {
        setLoading(true); setError('');
        const p = new URLSearchParams();
        if (filters.dateFrom)   p.set('dateFrom',   filters.dateFrom);
        if (filters.dateTo)     p.set('dateTo',     filters.dateTo);
        if (filters.logLevel)   p.set('logLevel',   filters.logLevel);
        if (filters.source)     p.set('source',     filters.source);
        if (filters.controller) p.set('controller', filters.controller);
        if (filters.userId)     p.set('userId',     filters.userId);
        if (filters.searchText) p.set('searchText', filters.searchText);
        p.set('page', pageArg); p.set('pageSize', sizeArg);
        try {
            const res = await fetch(`${variables.API_URL}log/search?${p}`, { headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) { setError(d?.message || 'Error loading log.'); setRows([]); setTotalRows(0); return; }
            setRows(d.data || []); setTotalRows(d.totalRows || 0);
        } catch { setError('Network error.'); setRows([]); setTotalRows(0); }
        finally { setLoading(false); }
    }, [filters]);

    useEffect(() => { load(1, pageSize); }, []); // eslint-disable-line

    const runSearch = () => { setPage(1); load(1, pageSize); };
    const goPage    = (pp) => { setPage(pp); load(pp, pageSize); };
    const changeSize = (s) => { setPageSize(s); setPage(1); load(1, s); };
    const clearAll  = () => { setFilters({ ...DEFAULT_FILTERS }); };

    const totalPages = Math.max(0, Math.ceil(totalRows / pageSize));

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)' }}>🐞</div>
                <div>
                    <div className="rpt-header-title">Error Log</div>
                    <div className="rpt-header-sub">{loading ? 'Loading…' : `${totalRows} log entr${totalRows !== 1 ? 'ies' : 'y'}`}</div>
                </div>
                <div className="rpt-header-actions">
                    <button className="rpt-btn-export" onClick={() => load(page, pageSize)}>↻ Refresh</button>
                </div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">Date From</span><input className="rpt-filter-input" type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} /></div>
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">Date To</span><input className="rpt-filter-input" type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} /></div>
                    <div className="rpt-filter-group w140">
                        <span className="rpt-filter-label">Level</span>
                        <select className="rpt-filter-select" value={filters.logLevel} onChange={e => setF('logLevel', e.target.value)}>
                            <option value="">All Levels</option>
                            {['Error', 'Warning', 'Info'].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w140">
                        <span className="rpt-filter-label">Source</span>
                        <select className="rpt-filter-select" value={filters.source} onChange={e => setF('source', e.target.value)}>
                            <option value="">All</option>
                            <option value="SERVER">Server (API)</option>
                            <option value="CLIENT">Client (Browser)</option>
                        </select>
                    </div>
                    <div className="rpt-filter-group w180"><span className="rpt-filter-label">Controller / Source</span><input className="rpt-filter-input" type="text" placeholder="e.g. StockIssue…" value={filters.controller} onChange={e => setF('controller', e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} /></div>
                    <div className="rpt-filter-group w140"><span className="rpt-filter-label">User</span><input className="rpt-filter-input" type="text" placeholder="Username…" value={filters.userId} onChange={e => setF('userId', e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} /></div>
                    <div className="rpt-filter-group wflex"><span className="rpt-filter-label">Search</span><input className="rpt-filter-input" type="text" placeholder="Message, action, path, stack…" value={filters.searchText} onChange={e => setF('searchText', e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} /></div>
                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}>
                        <span className="rpt-filter-label">&nbsp;</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="rpt-btn-clear" onClick={clearAll}>Clear</button>
                            <button className="rpt-btn-run" onClick={runSearch} disabled={loading}>{loading ? '⏳' : '▶ Search'}</button>
                        </div>
                    </div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Loading…</span></div>}
                {!loading && rows.length === 0 && !error && <div className="rpt-state"><div className="rpt-state-icon">✓</div><span>No log entries match the filters.</span></div>}
                {!loading && rows.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 150 }}>Time</th>
                                        <th style={{ width: 80 }}>Level</th>
                                        <th style={{ width: 90 }}>Source</th>
                                        <th>Controller / Action</th>
                                        <th>Message</th>
                                        <th style={{ width: 100 }}>User</th>
                                        <th>Path</th>
                                        <th style={{ width: 60 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.logId} style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                                            <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDateTime(r.logDate)}</td>
                                            <td><LevelBadge level={r.logLevel} /></td>
                                            <td><SourceBadge source={r.source} /></td>
                                            <td style={{ fontSize: 11.5 }}>
                                                <div style={{ fontWeight: 600, color: '#334155' }}>{r.controller || '—'}</div>
                                                {r.action && <div style={{ color: '#94a3b8', fontSize: 10.5 }}>{r.action}</div>}
                                            </td>
                                            <td style={{ fontSize: 12, color: '#1e293b', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message}</td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.userId || '—'}</td>
                                            <td style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.requestPath || '—'}</td>
                                            <td><button className="rpt-pag-btn" onClick={e => { e.stopPropagation(); setDetail(r); }}>View</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} totalRows={totalRows} onPage={goPage} onPageSize={changeSize} />
                    </>
                )}
            </div>

            {detail && <LogDetailModal row={detail} onClose={() => setDetail(null)} />}
        </div>
    );
};

export default ErrorLog;
