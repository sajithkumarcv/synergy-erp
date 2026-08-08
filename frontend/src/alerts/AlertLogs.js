import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../Variable';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';
import '../procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { alertId: '', status: '', dateFrom: '', dateTo: '' };

const S = {
  page:       { padding: '24px' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:      { fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 },
  card:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { background: '#f8fafc', padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' },
  td:         { padding: '10px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
  empty:      { padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 },
  badge:      (status) => {
    const map = {
      Success:      ['#dcfce7', '#15803d'],
      Failed:       ['#fef2f2', '#dc2626'],
      NoData:       ['#fef9c3', '#854d0e'],
      Running:      ['#dbeafe', '#1e40af'],
      NoRecipients: ['#f3e8ff', '#6b21a8'],
    };
    const [bg, clr] = map[status] || ['#f1f5f9', '#64748b'];
    return { display: 'inline-block', padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: bg, color: clr };
  },
  recipBadge: (status) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
    background: status === 'Sent' ? '#dcfce7' : '#fef2f2',
    color:      status === 'Sent' ? '#15803d' : '#dc2626',
  }),
  expandRow:  { background: '#f8faff', borderBottom: '1px solid #e2e8f0' },
  subTh:      { padding: '7px 14px', background: '#eff6ff', color: '#1e40af', fontWeight: 600, textAlign: 'left', fontSize: 12 },
  subTd:      { padding: '7px 14px', borderBottom: '1px solid #e2e8f0', color: '#374151', fontSize: 12 },
  btnGhost:   { background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  pager:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';
const fmtMs   = (ms) => ms > 0 ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`) : '—';

export default function AlertLogs() {
  const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
  const { getVList } = useLookup();

  const [alerts,     setAlerts]     = useState([]);
  const [logs,       setLogs]       = useState([]);
  const [totalRows,  setTotalRows]  = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(200);
  const [loading,    setLoading]    = useState(false);
  const [recipients, setRecipients] = useState({});
  const [expanded,   setExpanded]   = useState(null);

  const gridRef = useRef({ pageSize: 20, applied: DEFAULT_FILTERS });
  useEffect(() => { gridRef.current = { pageSize, applied: gridRef.current.applied }; }, [pageSize]);

  // Load alert list for the filter dropdown
  const loadAlerts = useCallback(async () => {
    const r = await fetch(`${variables.API_URL}EmailAlertConfig`, { headers: authHeaders() });
    if (r.ok) setAlerts(await r.json());
  }, []);

  const loadLogs = useCallback((pg, ps, af) => {
    setLoading(true);
    setExpanded(null);
    const q = new URLSearchParams({ page: pg, pageSize: ps });
    if (af.alertId)  q.set('alertId',  af.alertId);
    // multiselect gives comma-separated; API takes single status — send first selected only
    if (af.status)   q.set('status',   af.status.split(',')[0]);
    if (af.dateFrom) q.set('dateFrom', af.dateFrom);
    if (af.dateTo)   q.set('dateTo',   af.dateTo);
    fetch(`${variables.API_URL}EmailAlertConfig/logs?${q}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(res => {
        const data  = res.data  ?? res;  // backwards compat if old API
        const total = res.totalRows ?? data.length;
        const pages = Math.max(1, Math.ceil(total / ps));
        setLogs(Array.isArray(data) ? data : []);
        setTotalRows(total);
        setTotalPages(pages);
        setPage(pg);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useEffect(() => { loadLogs(1, 20, DEFAULT_FILTERS); }, [loadLogs]);

  // ── Register FilterContext ────────────────────────────────────
  useEffect(() => {
    const onApply = (vals) => {
      gridRef.current.applied = vals;
      const { pageSize: ps } = gridRef.current;
      loadLogs(1, ps, vals);
    };
    registerFilters('alert-logs', {
      alertId:  { label: 'Alert',     type: 'select', options: [], placeholder: 'All Alerts' },
      status:   { label: 'Status',    type: 'multiselect',
                  options: getVList('Alert', 'Status') },
      dateFrom: { label: 'Date From', type: 'date' },
      dateTo:   { label: 'Date To',   type: 'date' },
    }, DEFAULT_FILTERS, onApply);
    return () => unregisterFilters('alert-logs');
  }, [getVList]); // eslint-disable-line

  // Update alertId options once alerts load
  useEffect(() => {
    if (!alerts.length) return;
    updateFilterDefs('alert-logs', {
      alertId:  { label: 'Alert', type: 'select', placeholder: 'All Alerts',
                  options: alerts.map(a => ({ value: String(a.alertId), label: a.alertName })) },
      status:   { label: 'Status', type: 'multiselect',
                  options: getVList('Alert', 'Status') },
      dateFrom: { label: 'Date From', type: 'date' },
      dateTo:   { label: 'Date To',   type: 'date' },
    });
  }, [alerts, updateFilterDefs, getVList]);

  const toggleExpand = async (logId) => {
    if (expanded === logId) { setExpanded(null); return; }
    setExpanded(logId);
    if (!recipients[logId]) {
      const r = await fetch(
        `${variables.API_URL}EmailAlertConfig/logs/${logId}/recipients`,
        { headers: authHeaders() }
      );
      if (r.ok) {
        const data = await r.json();
        setRecipients(p => ({ ...p, [logId]: data }));
      }
    }
  };

  const changePage = (pg) => {
    const { pageSize: ps, applied: af } = gridRef.current;
    loadLogs(pg, ps, af);
  };

  const changePageSize = (ps) => {
    setPageSize(ps);
    gridRef.current.pageSize = ps;
    loadLogs(1, ps, gridRef.current.applied);
  };

  // ── Pagination component ──────────────────────────────────────
  const from  = Math.min((page - 1) * pageSize + 1, totalRows);
  const to    = Math.min(page * pageSize, totalRows);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>Alert Logs</h1>
        <select style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' }}
          value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>

      <div style={S.card}>
        {loading && (
          <div style={{ padding: '12px 18px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
            Loading…
          </div>
        )}
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 36 }}></th>
              <th style={S.th}>Run Date</th>
              <th style={S.th}>Alert Name</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Data Rows</th>
              <th style={S.th}>Recipients</th>
              <th style={S.th}>Duration</th>
              <th style={S.th}>Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading
              ? <tr><td colSpan={8} style={{ ...S.td, ...S.empty }}>No logs found.</td></tr>
              : logs.map(l => (
              <React.Fragment key={l.logId}>
                <tr style={{ background: expanded === l.logId ? '#f0f9ff' : undefined }}>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <button style={{ ...S.btnGhost, padding: '2px 7px' }} onClick={() => toggleExpand(l.logId)}>
                      {expanded === l.logId ? '▲' : '▼'}
                    </button>
                  </td>
                  <td style={S.td}><span style={{ fontSize: 12, color: '#475569' }}>{fmtDate(l.runDate)}</span></td>
                  <td style={S.td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{l.alertName}</span></td>
                  <td style={S.td}><span style={S.badge(l.status)}>{l.status}</span></td>
                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 600 }}>{l.dataRowCount ?? '—'}</td>
                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 600 }}>{l.recipientCount ?? '—'}</td>
                  <td style={{ ...S.td, color: '#64748b' }}>{fmtMs(l.durationMs)}</td>
                  <td style={S.td}>
                    {l.errorMessage
                      ? <span style={{ color: '#dc2626', fontSize: 11 }} title={l.errorMessage}>
                          {l.errorMessage.length > 50 ? l.errorMessage.slice(0, 50) + '…' : l.errorMessage}
                        </span>
                      : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                </tr>

                {expanded === l.logId && (
                  <tr key={`${l.logId}-r`}>
                    <td colSpan={8} style={S.expandRow}>
                      <div style={{ padding: '12px 18px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 8 }}>
                          Recipients for this run
                        </div>
                        {!recipients[l.logId]
                          ? <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading…</div>
                          : recipients[l.logId].length === 0
                          ? <div style={{ color: '#94a3b8', fontSize: 12 }}>No recipient records.</div>
                          : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                {['Name', 'Email', 'Status', 'Sent At', 'Error'].map(h => (
                                  <th key={h} style={S.subTh}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {recipients[l.logId].map(r => (
                                <tr key={r.recipientLogId}>
                                  <td style={S.subTd}>{r.fullName || '—'}</td>
                                  <td style={S.subTd}>{r.email}</td>
                                  <td style={S.subTd}><span style={S.recipBadge(r.status)}>{r.status}</span></td>
                                  <td style={S.subTd}>{fmtDate(r.sentDate)}</td>
                                  <td style={{ ...S.subTd, color: '#dc2626' }}>{r.errorMessage || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={S.pager}>
          <span>
            {totalRows > 0 ? `${from}–${to} of ${totalRows} logs` : '0 logs'}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button style={S.btnGhost} onClick={() => changePage(1)} disabled={page <= 1}>«</button>
            <button style={S.btnGhost} onClick={() => changePage(page - 1)} disabled={page <= 1}>‹ Prev</button>
            <span style={{ padding: '0 8px', fontSize: 13 }}>Page {page} / {totalPages}</span>
            <button style={S.btnGhost} onClick={() => changePage(page + 1)} disabled={page >= totalPages}>Next ›</button>
            <button style={S.btnGhost} onClick={() => changePage(totalPages)} disabled={page >= totalPages}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}
