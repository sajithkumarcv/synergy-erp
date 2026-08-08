import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import './Manhour.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = {
    searchText: '', jobId: '', status: '', createdBy: '', dateFrom: '', dateTo: ''
};

const fmtDate = d => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const fmt = n => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span style={{ opacity: .35 }}>⇅</span>;
    return <span style={{ color: '#1d4ed8' }}>{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const StatusBadge = ({ row }) => (
    <span className="mh-status-badge" style={{ background: row.badgeBg || '#f1f5f9', color: row.badgeColor || '#475569' }}>
        <span className="mh-status-dot" style={{ background: row.badgeDot || '#94a3b8' }} />
        {row.status}
    </span>
);

// ── Confirm dialog ────────────────────────────────────────────────────────
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 380, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Confirm Delete</div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>{message}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="mh-btn-sec" onClick={onCancel}>Cancel</button>
                <button className="mh-btn-pri" style={{ background: '#dc2626' }} onClick={onConfirm}>Delete</button>
            </div>
        </div>
    </div>
);

// ── Main component ────────────────────────────────────────────────────────
const Manhour = () => {
    const navigate      = useNavigate();
    const { getModuleStatuses } = useLookup();
    const currentUser   = useCurrentUser();

    const [filters,   setFiltersState] = useState({ ...DEFAULT_FILTERS });
    const [applied,   setApplied]      = useState({ ...DEFAULT_FILTERS });
    const [data,      setData]         = useState([]);
    const [loading,   setLoading]      = useState(false);
    const [page,      setPage]         = useState(1);
    const [pageSize,  setPageSize]     = useState(200);
    const [totalRows, setTotalRows]    = useState(0);
    const [totalPages,setTotalPages]   = useState(1);
    const [sortCol,   setSortCol]      = useState('DocumentDate');
    const [sortDir,   setSortDir]      = useState('DESC');
    const [toast,     setToast]        = useState([]);
    const [confirmId, setConfirmId]    = useState(null);

    const showToast = (msg, type = 'success') => {
        const id = Date.now();
        setToast(p => [...p, { id, msg, type }]);
        setTimeout(() => setToast(p => p.filter(t => t.id !== id)), 3500);
    };

    const load = useCallback(() => {
        setLoading(true);
        const q = new URLSearchParams({
            searchText: applied.searchText || '',
            jobId:      applied.jobId      || '',
            status:     applied.status     || '',
            createdBy:  applied.createdBy  || '',
            dateFrom:   applied.dateFrom   || '',
            dateTo:     applied.dateTo     || '',
            page, pageSize, sortCol, sortDir,
        });
        fetch(`${variables.API_URL}manhour/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setData(d.data || []); setTotalRows(d.totalRows || 0); setTotalPages(d.totalPages || 1); })
            .catch(() => showToast('Failed to load manhour records.', 'error'))
            .finally(() => setLoading(false));
    }, [applied, page, pageSize, sortCol, sortDir]);

    useEffect(() => { load(); }, [load]);

    const applyFilters = () => {
        setApplied({ ...filters });
        setPage(1);
    };

    const resetFilters = () => {
        setFiltersState(DEFAULT_FILTERS);
        setApplied(DEFAULT_FILTERS);
        setPage(1);
    };

    const handleSort = col => {
        if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
        else { setSortCol(col); setSortDir('ASC'); }
        setPage(1);
    };

    const doDelete = async () => {
        try {
            const res = await fetch(
                `${variables.API_URL}manhour/${confirmId}?deletedBy=${encodeURIComponent(currentUser)}`,
                { method: 'DELETE', headers: authHeaders() }
            );
            if (!res.ok) { const d = await res.json(); showToast(d.message || 'Delete failed.', 'error'); return; }
            showToast('Deleted successfully.');
            load();
        } catch { showToast('Network error.', 'error'); }
        finally   { setConfirmId(null); }
    };

    const thProps = col => ({
        onClick: () => handleSort(col),
        style: { cursor: 'pointer' },
    });

    return (
        <div className="mh-page">
            {/* Header */}
            <div className="mh-page-header">
                <div>
                    <div className="mh-page-title">Manhour Uploads</div>
                    <div className="mh-page-subtitle">Excel-driven employee manhour entries per job</div>
                </div>
                <button className="mh-btn-pri" onClick={() => navigate('/manhour/new')}>
                    + New Upload
                </button>
            </div>

            {/* Filters */}
            <div className="mh-filter-bar">
                <div className="mh-filter-group">
                    <label>Search</label>
                    <input className="mh-filter-input" placeholder="Doc no / Job / Description…"
                        value={filters.searchText}
                        onChange={e => setFiltersState(p => ({ ...p, searchText: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && applyFilters()} />
                </div>
                <div className="mh-filter-group" style={{ maxWidth: 160 }}>
                    <label>Job ID</label>
                    <input className="mh-filter-input" placeholder="Job ID"
                        value={filters.jobId}
                        onChange={e => setFiltersState(p => ({ ...p, jobId: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && applyFilters()} />
                </div>
                <div className="mh-filter-group" style={{ maxWidth: 160 }}>
                    <label>Status</label>
                    <select className="mh-filter-input" value={filters.status}
                        onChange={e => setFiltersState(p => ({ ...p, status: e.target.value }))}>
                        <option value="">All</option>
                        {getModuleStatuses('MH').map(s => <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>)}
                    </select>
                </div>
                <div className="mh-filter-group" style={{ maxWidth: 140 }}>
                    <label>Date From</label>
                    <input type="date" className="mh-filter-input"
                        value={filters.dateFrom}
                        onChange={e => setFiltersState(p => ({ ...p, dateFrom: e.target.value }))} />
                </div>
                <div className="mh-filter-group" style={{ maxWidth: 140 }}>
                    <label>Date To</label>
                    <input type="date" className="mh-filter-input"
                        value={filters.dateTo}
                        onChange={e => setFiltersState(p => ({ ...p, dateTo: e.target.value }))} />
                </div>
                <div className="mh-filter-group" style={{ maxWidth: 140 }}>
                    <label>Created By</label>
                    <input className="mh-filter-input" placeholder="Username"
                        value={filters.createdBy}
                        onChange={e => setFiltersState(p => ({ ...p, createdBy: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && applyFilters()} />
                </div>
                <button className="mh-filter-btn mh-filter-search" onClick={applyFilters}>Search</button>
                <button className="mh-filter-btn mh-filter-reset"  onClick={resetFilters}>Reset</button>
            </div>

            {/* Toolbar */}
            <div className="mh-toolbar">
                <div className="mh-count-info">
                    {loading ? 'Loading…' : `${totalRows.toLocaleString()} record${totalRows !== 1 ? 's' : ''}`}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Rows:</span>
                    {PAGE_SIZES.map(s => (
                        <button key={s}
                            className={`mh-pag-btn ${pageSize === s ? 'active' : ''}`}
                            onClick={() => { setPageSize(s); setPage(1); }}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="mh-table-wrap">
                {!loading && data.length === 0 ? (
                    <div className="mh-empty">
                        <div className="mh-empty-icon">⏱</div>
                        <div className="mh-empty-text">No manhour records found</div>
                        <div className="mh-empty-sub">Adjust filters or create a new upload</div>
                    </div>
                ) : (
                    <table className="mh-table">
                        <thead>
                            <tr>
                                <th {...thProps('DocumentNo')}>Doc No <SortIcon col="DocumentNo" sortCol={sortCol} sortDir={sortDir} /></th>
                                <th {...thProps('DocumentDate')}>Date <SortIcon col="DocumentDate" sortCol={sortCol} sortDir={sortDir} /></th>
                                <th>Jobs</th>
                                <th>Employees</th>
                                <th>NH Hrs</th>
                                <th>OT Hrs</th>
                                <th {...thProps('Status')}>Status <SortIcon col="Status" sortCol={sortCol} sortDir={sortDir} /></th>
                                <th {...thProps('CreatedBy')}>Created By <SortIcon col="CreatedBy" sortCol={sortCol} sortDir={sortDir} /></th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(row => (
                                <tr key={row.batchId}>
                                    <td>
                                        <span style={{ fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }}
                                            onClick={() => navigate(`/manhour/${row.batchId}`)}>
                                            {row.documentNo}
                                        </span>
                                    </td>
                                    <td>{fmtDate(row.documentDate)}</td>
                                    <td style={{ textAlign: 'center', color: '#475569' }}>
                                        {row.jobCount === 1
                                            ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>1 job</span>
                                            : <span style={{ fontWeight: 600 }}>{row.jobCount} jobs</span>}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{row.totalEmployees}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(row.totalHours)}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(row.totalOTHours)}</td>
                                    <td><StatusBadge row={row} /></td>
                                    <td style={{ fontSize: 12, color: '#64748b' }}>{row.createdBy}</td>
                                    <td>
                                        <div className="mh-action-btns">
                                            <button className="mh-btn-icon" title="View"
                                                onClick={() => navigate(`/manhour/${row.batchId}`)}>👁</button>
                                            {row.canEdit && (
                                                <button className="mh-btn-icon" title="Edit"
                                                    onClick={() => navigate(`/manhour/${row.batchId}/edit`)}>✏️</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="mh-pagination">
                        <div className="mh-pag-info">
                            Page {page} of {totalPages} · {totalRows.toLocaleString()} records
                        </div>
                        <div className="mh-pag-btns">
                            <button className="mh-pag-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                            <button className="mh-pag-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                                const p     = start + i;
                                return p <= totalPages ? (
                                    <button key={p} className={`mh-pag-btn ${p === page ? 'active' : ''}`}
                                        onClick={() => setPage(p)}>{p}</button>
                                ) : null;
                            })}
                            <button className="mh-pag-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                            <button className="mh-pag-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirm delete */}
            {confirmId && (
                <ConfirmDialog
                    message="Delete this manhour record? This action cannot be undone."
                    onConfirm={doDelete}
                    onCancel={() => setConfirmId(null)}
                />
            )}

            {/* Toast */}
            <div className="mh-toast">
                {toast.map(t => (
                    <div key={t.id} className={`mh-toast-item mh-toast-${t.type}`}>{t.msg}</div>
                ))}
            </div>
        </div>
    );
};

export default Manhour;
