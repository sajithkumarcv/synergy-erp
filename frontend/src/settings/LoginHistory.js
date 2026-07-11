import React, { useState, useCallback, useEffect } from 'react';
import { variables, authHeaders } from '../Variable';
import '../reports/Reports.css';

const TOP_SIZES  = [100, 200, 500, 1000];
const PAGE_SIZES = [25, 50, 100, 200];

const fmtDateTime = d => d
    ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

// Status lifecycle: Active → LoggedOut | Expired | ForcedOut | IdleTimeout
const STATUS_STYLE = {
    Active:      { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    LoggedOut:   { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Expired:     { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    ForcedOut:   { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
    IdleTimeout: { bg: '#ffedd5', color: '#9a3412', dot: '#ea580c' },
};

const StatusBadge = ({ status }) => {
    const s = STATUS_STYLE[status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />{status || '—'}
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

const LoginHistory = () => {
    const [rows,     setRows]     = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [top,      setTop]      = useState(200);
    const [status,   setStatus]   = useState('');
    const [search,   setSearch]   = useState('');
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [sortCol,  setSortCol]  = useState('loginTime');
    const [sortDir,  setSortDir]  = useState('desc');

    // Normalise casing defensively so the page survives either a camelCase
    // (typed) or PascalCase (dynamic) JSON shape from the server.
    const norm = (r) => ({
        id:           r.id           ?? r.Id,
        userName:     r.userName     ?? r.UserName,
        fullName:     r.fullName     ?? r.FullName,
        loginTime:    r.loginTime    ?? r.LoginTime,
        logoutTime:   r.logoutTime   ?? r.LogoutTime,
        ipAddress:    r.ipAddress    ?? r.IpAddress,
        userAgent:    r.userAgent    ?? r.UserAgent,
        status:       r.status       ?? r.Status,
        lastActivity: r.lastActivity ?? r.LastActivity,
    });

    // Server returns the newest @top sessions; status/search narrow it client-side.
    const load = useCallback(async (topArg) => {
        setLoading(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}Auth/login-history?top=${topArg}`, { headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) { setError(d?.message || 'Error loading login history.'); setRows([]); return; }
            setRows(Array.isArray(d) ? d.map(norm) : []);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(top); }, []); // eslint-disable-line

    const refresh = () => { load(top); };
    const changeTop = (t) => { setTop(t); setPage(1); load(t); };

    const doSort = (key) => {
        setSortCol(prev => {
            if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
            setSortDir('asc'); return key;
        });
        setPage(1);
    };

    // Client-side filter
    const filtered = rows.filter(r => {
        if (status && r.status !== status) return false;
        if (search) {
            const q = search.toLowerCase();
            const hay = `${r.userName || ''} ${r.fullName || ''} ${r.ipAddress || ''} ${r.userAgent || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    // Client-side sort (date columns compare chronologically; user sorts by name)
    const DATE_COLS = new Set(['loginTime', 'logoutTime', 'lastActivity']);
    const sortVal = (r, key) => {
        if (key === 'user') return (r.fullName || r.userName || '').toLowerCase();
        if (DATE_COLS.has(key)) return r[key] ? new Date(r[key]).getTime() : -Infinity;
        return (r[key] ?? '').toString().toLowerCase();
    };
    const sorted = sortCol
        ? [...filtered].sort((a, b) => {
            const av = sortVal(a, sortCol), bv = sortVal(b, sortCol);
            const cmp = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
            return sortDir === 'asc' ? cmp : -cmp;
        })
        : filtered;

    const totalRows  = sorted.length;
    const totalPages = Math.max(0, Math.ceil(totalRows / pageSize));
    const safePage   = Math.min(page, Math.max(1, totalPages));
    const pageRows   = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

    const activeCount = rows.filter(r => r.status === 'Active').length;

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }}>🔑</div>
                <div>
                    <div className="rpt-header-title">Login History</div>
                    <div className="rpt-header-sub">
                        {loading ? 'Loading…' : `${totalRows} session${totalRows !== 1 ? 's' : ''}${activeCount ? ` · ${activeCount} active` : ''}`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    <button className="rpt-btn-export" onClick={refresh}>↻ Refresh</button>
                </div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
                            <option value="">All Statuses</option>
                            {['Active', 'LoggedOut', 'Expired', 'ForcedOut', 'IdleTimeout'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Search</span>
                        <input className="rpt-filter-input" type="text" placeholder="User, name, IP, device…"
                            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                    </div>
                    <div className="rpt-filter-group w140">
                        <span className="rpt-filter-label">Load</span>
                        <select className="rpt-filter-select" value={top} onChange={e => changeTop(Number(e.target.value))}>
                            {TOP_SIZES.map(s => <option key={s} value={s}>Latest {s}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Loading…</span></div>}
                {!loading && totalRows === 0 && !error && <div className="rpt-state"><div className="rpt-state-icon">✓</div><span>No login sessions match the filters.</span></div>}
                {!loading && totalRows > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        {[
                                            { key: 'user',         label: 'User' },
                                            { key: 'loginTime',    label: 'Login',        w: 155 },
                                            { key: 'logoutTime',   label: 'Logout',       w: 155 },
                                            { key: 'status',       label: 'Status',       w: 120 },
                                            { key: 'ipAddress',    label: 'IP Address',   w: 130 },
                                            { key: 'lastActivity', label: 'Last Activity', w: 155 },
                                            { key: 'userAgent',    label: 'Device / Browser' },
                                        ].map(c => (
                                            <th key={c.key} style={{ width: c.w, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                                                onClick={() => doSort(c.key)}>
                                                {c.label}
                                                <span style={{ marginLeft: 4, opacity: sortCol === c.key ? 1 : 0.3, fontSize: 10 }}>
                                                    {sortCol === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.map(r => (
                                        <tr key={r.id}>
                                            <td style={{ fontSize: 12 }}>
                                                <div style={{ fontWeight: 600, color: '#334155' }}>{r.fullName || r.userName || '—'}</div>
                                                {r.userName && r.fullName && <div style={{ color: '#94a3b8', fontSize: 10.5 }}>{r.userName}</div>}
                                            </td>
                                            <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDateTime(r.loginTime)}</td>
                                            <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDateTime(r.logoutTime)}</td>
                                            <td><StatusBadge status={r.status} /></td>
                                            <td style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'monospace' }}>{r.ipAddress || '—'}</td>
                                            <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDateTime(r.lastActivity)}</td>
                                            <td style={{ fontSize: 11, color: '#94a3b8', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.userAgent || ''}>{r.userAgent || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={safePage} totalPages={totalPages} pageSize={pageSize} totalRows={totalRows}
                            onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1); }} />
                    </>
                )}
            </div>
        </div>
    );
};

export default LoginHistory;
