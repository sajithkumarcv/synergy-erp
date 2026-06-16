import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders, getCurrentUser } from '../Variable';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';

const S = {
  page:       { padding:'24px' },
  header:     { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  title:      { fontSize:20, fontWeight:700, color:'#1e293b', margin:0 },
  btnPrimary: { background:'#1e40af', color:'#fff', border:'none', borderRadius:7, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnGhost:   { background:'transparent', color:'#64748b', border:'1px solid #cbd5e1', borderRadius:6, padding:'5px 10px', fontSize:12, cursor:'pointer' },
  btnDanger:  { background:'#ef4444', color:'#fff', border:'none', borderRadius:6, padding:'5px 10px', fontSize:12, cursor:'pointer' },
  btnSuccess: { background:'#16a34a', color:'#fff', border:'none', borderRadius:6, padding:'5px 10px', fontSize:12, cursor:'pointer' },
  table:      { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:         { background:'#f8fafc', padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#475569', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  td:         { padding:'10px 14px', borderBottom:'1px solid #f1f5f9', verticalAlign:'middle' },
  card:       { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden' },
  badge:      (active) => ({ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background: active ? '#dcfce7' : '#f1f5f9', color: active ? '#15803d' : '#64748b' }),
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:      { background:'#fff', borderRadius:12, padding:28, width:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' },
  modalTitle: { fontSize:17, fontWeight:700, color:'#1e293b', marginBottom:20 },
  grid2:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 },
  field:      { marginBottom:16 },
  label:      { display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:5 },
  input:      { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:7, fontSize:13, boxSizing:'border-box' },
  select:     { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:7, fontSize:13, boxSizing:'border-box', background:'#fff' },
  errBox:     { background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:7, padding:'9px 14px', fontSize:13, marginBottom:14 },
  okBox:      { background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:7, padding:'9px 14px', fontSize:13, marginBottom:14 },
  row:        { display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 },
  empty:      { padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 },
  hint:       { fontSize:11, color:'#94a3b8', marginTop:4 },
  runBadge:   (status) => {
    const map = { Success:'#dcfce7:#15803d', Failed:'#fef2f2:#dc2626', NoData:'#fef9c3:#854d0e', Running:'#dbeafe:#1e40af', NoRecipients:'#f3e8ff:#6b21a8' };
    const [bg, clr] = (map[status] || '#f1f5f9:#64748b').split(':');
    return { display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background:bg, color:clr };
  }
};

const DOW_OPTIONS   = [['1','Monday'],['2','Tuesday'],['3','Wednesday'],['4','Thursday'],['5','Friday'],['6','Saturday'],['7','Sunday']];

const defaultForm = () => ({
  alertId:0, alertName:'', alertType:'Stock', groupId:'', templateId:'',
  sqlViewName:'', frequency:'Daily', timeOfDay:'08:00',
  dayOfWeek:'', dayOfMonth:'', isActive:true, skipIfNoData:true
});

const DEFAULT_FILTERS = { alertName: '', alertType: '', status: '' };  // '' = All (no filter)

export default function EmailAlertConfig() {
  const { registerFilters, unregisterFilters } = useFilters();
  const { getVList } = useLookup();

  const [allAlerts, setAllAlerts] = useState([]);   // full unfiltered list
  const allAlertsRef = useRef([]);                  // ref for stable closure in onApply
  const [alerts,    setAlerts]    = useState([]);   // filtered display list
  const [groups,    setGroups]    = useState([]);
  const [templates, setTemplates] = useState([]);
  const [views,     setViews]     = useState([]);
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState(defaultForm());
  const [msg,       setMsg]       = useState({ type:'', text:'' });
  const [loading,   setLoading]   = useState(false);
  const [running,   setRunning]   = useState({});
  const [toast,     setToast]     = useState(null);

  const appliedRef = useRef(DEFAULT_FILTERS);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const applyFilter = useCallback((all, af) => {
    let rows = all;
    if (af.alertName) rows = rows.filter(a => a.alertName?.toLowerCase().includes(af.alertName.toLowerCase()));
    if (af.alertType) rows = rows.filter(a => a.alertType === af.alertType);
    if (af.status === 'Active')   rows = rows.filter(a => a.isActive);
    if (af.status === 'Inactive') rows = rows.filter(a => !a.isActive);
    setAlerts(rows);
  }, []);

  // ── Delete confirm modal ───────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Info modal state ───────────────────────────────────────────
  const [infoAlert,      setInfoAlert]      = useState(null);   // alert being inspected
  const [infoLogs,       setInfoLogs]       = useState([]);
  const [infoLoading,    setInfoLoading]    = useState(false);
  const [infoRecipients, setInfoRecipients] = useState({});     // logId → [recipients]
  const [expandedLog,    setExpandedLog]    = useState(null);

  const load = useCallback(async () => {
    const [ar, gr, tr, vr] = await Promise.all([
      fetch(`${variables.API_URL}EmailAlertConfig`,            { headers: authHeaders() }),
      fetch(`${variables.API_URL}UserGroup`,                   { headers: authHeaders() }),
      fetch(`${variables.API_URL}EmailTemplate`,               { headers: authHeaders() }),
      fetch(`${variables.API_URL}EmailAlertConfig/available-views`, { headers: authHeaders() }),
    ]);
    if (gr.ok) setGroups(await gr.json());
    if (tr.ok) setTemplates(await tr.json());
    if (vr.ok) setViews(await vr.json());
    if (ar.ok) {
      const data = await ar.json();
      allAlertsRef.current = data;
      setAllAlerts(data);
      applyFilter(data, appliedRef.current);
    }
  }, [applyFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Register FilterContext (once — uses refs for stable closure) ──
  useEffect(() => {
    const onApply = (vals) => {
      appliedRef.current = vals;
      applyFilter(allAlertsRef.current, vals);
    };
    registerFilters('email-alerts', {
      alertName: { label: 'Alert Name', type: 'text', placeholder: 'Search alert name…' },
      alertType:  { label: 'Type', type: 'select',
                    options: getVList('Alert', 'Type'),
                    placeholder: 'All Types' },
      status:     { label: 'Status', type: 'radio',
                    options: [
                      { value: '',         label: 'All' },
                      { value: 'Active',   label: 'Active only' },
                      { value: 'Inactive', label: 'Inactive only' },
                    ]},
    }, DEFAULT_FILTERS, onApply);
    return () => unregisterFilters('email-alerts');
  }, [getVList]); // eslint-disable-line

  const openModal = (a = null) => {
    setForm(a ? {
      alertId: a.alertId, alertName: a.alertName, alertType: a.alertType,
      groupId: String(a.groupId), templateId: String(a.templateId),
      sqlViewName: a.sqlViewName, frequency: a.frequency, timeOfDay: a.timeOfDay,
      dayOfWeek: a.dayOfWeek != null ? String(a.dayOfWeek) : '',
      dayOfMonth: a.dayOfMonth != null ? String(a.dayOfMonth) : '',
      isActive: a.isActive, skipIfNoData: a.skipIfNoData
    } : defaultForm());
    setMsg({ type:'', text:'' });
    setModal(true);
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.alertName.trim()) { setMsg({ type:'err', text:'Alert name is required.' }); return; }
    if (!form.groupId)    { setMsg({ type:'err', text:'User group is required.' }); return; }
    if (!form.templateId) { setMsg({ type:'err', text:'Template is required.' }); return; }
    if (!form.sqlViewName){ setMsg({ type:'err', text:'Data source is required.' }); return; }
    if (form.frequency === 'Weekly' && !form.dayOfWeek)
      { setMsg({ type:'err', text:'Day of week is required for Weekly alerts.' }); return; }
    if (form.frequency === 'Monthly' && !form.dayOfMonth)
      { setMsg({ type:'err', text:'Day of month is required for Monthly alerts.' }); return; }

    setLoading(true);
    try {
      const body = {
        alertId: form.alertId, alertName: form.alertName.trim(), alertType: form.alertType,
        groupId: parseInt(form.groupId), templateId: parseInt(form.templateId),
        sqlViewName: form.sqlViewName, frequency: form.frequency, timeOfDay: form.timeOfDay,
        dayOfWeek:  form.dayOfWeek  ? parseInt(form.dayOfWeek)  : null,
        dayOfMonth: form.dayOfMonth ? parseInt(form.dayOfMonth) : null,
        isActive: form.isActive, skipIfNoData: form.skipIfNoData,
        actionBy: getCurrentUser()
      };
      const r = await fetch(`${variables.API_URL}EmailAlertConfig/save`, {
        method:'POST', headers: authHeaders(), body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ type:'err', text: d.message }); return; }
      setMsg({ type:'ok', text: d.message });
      await load();
      setTimeout(() => setModal(false), 800);
    } finally { setLoading(false); }
  };

  const deleteAlert = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.alertId;
    setDeleteTarget(null);
    const r = await fetch(`${variables.API_URL}EmailAlertConfig/${id}`, { method:'DELETE', headers: authHeaders() });
    const d = await r.json();
    if (r.ok) {
      showToast('ok', 'Alert deleted.');
      const newAll = allAlerts.filter(a => a.alertId !== id);
      setAllAlerts(newAll);
      applyFilter(newAll, appliedRef.current);
    } else showToast('err', d.message);
  };

  const runNow = async (id, name) => {
    setRunning(p => ({ ...p, [id]: true }));
    try {
      const r = await fetch(`${variables.API_URL}EmailAlertProcessor/run/${id}`, { method:'POST', headers: authHeaders() });
      const d = await r.json();
      showToast(r.ok ? 'ok' : 'err', d.message);
    } finally {
      setRunning(p => ({ ...p, [id]: false }));
    }
  };

  const openInfo = async (a) => {
    setInfoAlert(a);
    setInfoLogs([]);
    setInfoRecipients({});
    setExpandedLog(null);
    setInfoLoading(true);
    try {
      const r = await fetch(
        `${variables.API_URL}EmailAlertConfig/logs?alertId=${a.alertId}&pageSize=10`,
        { headers: authHeaders() }
      );
      if (r.ok) { const res = await r.json(); setInfoLogs(Array.isArray(res) ? res : (res.data || [])); }
    } catch { /* ignore */ }
    finally { setInfoLoading(false); }
  };

  const toggleLogRecipients = async (logId) => {
    if (expandedLog === logId) { setExpandedLog(null); return; }
    setExpandedLog(logId);
    if (!infoRecipients[logId]) {
      const r = await fetch(
        `${variables.API_URL}EmailAlertConfig/logs/${logId}/recipients`,
        { headers: authHeaders() }
      );
      if (r.ok) {
        const data = await r.json();
        setInfoRecipients(p => ({ ...p, [logId]: data }));
      }
    }
  };

  const fmtDate  = (d) => d ? new Date(d).toLocaleString() : '—';
  const fmtMs    = (ms) => ms > 0 ? (ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`) : '—';

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>Email Alert Configuration</h1>
        <button style={S.btnPrimary} onClick={() => openModal()}>+ New Alert</button>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead>
            <tr>
              {['Alert Name','Type','Group','Frequency','Schedule','Status','Last Run','Last Success','Actions'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0
              ? <tr><td colSpan={9} style={{ ...S.td, ...S.empty }}>No alerts match the current filter.</td></tr>
              : alerts.map(a => (
              <tr key={a.alertId}>
                <td style={S.td}><span style={{ fontWeight:600, color:'#1e293b' }}>{a.alertName}</span></td>
                <td style={S.td}><span style={{ fontSize:12, color:'#475569' }}>{a.alertType}</span></td>
                <td style={S.td}>{a.groupName}</td>
                <td style={S.td}>{a.frequency}</td>
                <td style={S.td}>
                  <span style={{ fontSize:12, color:'#64748b' }}>
                    {a.timeOfDay}
                    {a.frequency === 'Weekly'  && ` · ${DOW_OPTIONS.find(d=>d[0]===String(a.dayOfWeek))?.[1] || ''}`}
                    {a.frequency === 'Monthly' && ` · Day ${a.dayOfMonth}`}
                  </span>
                </td>
                <td style={S.td}><span style={S.badge(a.isActive)}>{a.isActive ? 'Active' : 'Inactive'}</span></td>
                <td style={S.td}><span style={{ fontSize:12, color:'#475569' }}>{fmtDate(a.lastRunDate)}</span></td>
                <td style={S.td}><span style={{ fontSize:12, color:'#475569' }}>{fmtDate(a.lastSuccessDate)}</span></td>
                <td style={S.td}>
                  <div style={{ display:'flex', gap:6 }}>
                    <button style={S.btnGhost} onClick={() => openInfo(a)}>Logs</button>
                    <button style={S.btnGhost} onClick={() => openModal(a)}>Edit</button>
                    <button style={S.btnSuccess} onClick={() => runNow(a.alertId, a.alertName)}
                      disabled={running[a.alertId]}>
                      {running[a.alertId] ? '…' : 'Run'}
                    </button>
                    <button style={S.btnDanger} onClick={() => setDeleteTarget({ alertId: a.alertId, alertName: a.alertName })}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={S.overlay}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalTitle}>{form.alertId === 0 ? 'New Alert' : 'Edit Alert'}</div>
            {msg.text && <div style={msg.type==='err' ? S.errBox : S.okBox}>{msg.text}</div>}

            <div style={S.field}>
              <label style={S.label}>Alert Name *</label>
              <input style={S.input} value={form.alertName} onChange={e => f('alertName', e.target.value)} autoFocus />
            </div>

            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Alert Type</label>
                <select style={S.select} value={form.alertType} onChange={e => f('alertType', e.target.value)}>
                  {getVList('Alert', 'Type').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Data Source (View) *</label>
                <select style={S.select} value={form.sqlViewName} onChange={e => f('sqlViewName', e.target.value)}>
                  <option value="">— Select view —</option>
                  {views.map(v => <option key={v.viewName} value={v.viewName}>{v.viewLabel}</option>)}
                </select>
              </div>
            </div>

            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>User Group *</label>
                <select style={S.select} value={form.groupId} onChange={e => f('groupId', e.target.value)}>
                  <option value="">— Select group —</option>
                  {groups.filter(g => g.isActive).map(g => (
                    <option key={g.groupId} value={g.groupId}>{g.groupName}</option>
                  ))}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Email Template *</label>
                <select style={S.select} value={form.templateId} onChange={e => f('templateId', e.target.value)}>
                  <option value="">— Select template —</option>
                  {templates.filter(t => t.isActive).map(t => (
                    <option key={t.templateId} value={t.templateId}>{t.templateName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Frequency</label>
                <select style={S.select} value={form.frequency} onChange={e => f('frequency', e.target.value)}>
                  {getVList('Alert', 'Frequency').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>
                  Time of Day {form.frequency === 'MultipleDaily' ? '(comma-separated)' : ''}
                </label>
                <input style={S.input} value={form.timeOfDay}
                  onChange={e => f('timeOfDay', e.target.value)}
                  placeholder={form.frequency === 'MultipleDaily' ? '08:00,14:00,18:00' : '08:00'} />
                <div style={S.hint}>Format: HH:MM (24h)</div>
              </div>
            </div>

            {form.frequency === 'Weekly' && (
              <div style={S.field}>
                <label style={S.label}>Day of Week *</label>
                <select style={S.select} value={form.dayOfWeek} onChange={e => f('dayOfWeek', e.target.value)}>
                  <option value="">— Select day —</option>
                  {DOW_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}

            {form.frequency === 'Monthly' && (
              <div style={S.field}>
                <label style={S.label}>Day of Month * (1–28)</label>
                <input style={S.input} type="number" min={1} max={28} value={form.dayOfMonth}
                  onChange={e => f('dayOfMonth', e.target.value)} />
              </div>
            )}

            <div style={{ display:'flex', gap:20 }}>
              <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#374151', cursor:'pointer' }}>
                <input type="checkbox" checked={form.isActive} onChange={e => f('isActive', e.target.checked)} />
                Active
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#374151', cursor:'pointer' }}>
                <input type="checkbox" checked={form.skipIfNoData} onChange={e => f('skipIfNoData', e.target.checked)} />
                Skip if no data
              </label>
            </div>

            <div style={S.row}>
              <button style={S.btnGhost} onClick={() => setModal(false)}>Cancel</button>
              <button style={S.btnPrimary} onClick={save} disabled={loading}>
                {loading ? 'Saving…' : 'Save Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ─────────────────────────────────── */}
      {deleteTarget && (
        <div style={S.overlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ background:'#fff', borderRadius:12, padding:28, width:400,
                        boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}
               onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:20, marginBottom:8 }}>🗑️</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Delete Alert</div>
            <div style={{ fontSize:13, color:'#475569', marginBottom:24, lineHeight:1.6 }}>
              Are you sure you want to delete <strong>"{deleteTarget.alertName}"</strong>?
              <br />This cannot be undone and will remove all run logs.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button style={{ ...S.btnDanger, padding:'8px 20px', fontSize:13, fontWeight:600 }}
                      onClick={deleteAlert}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notification ───────────────────────────────────── */}
      {toast && (
        <div style={{
          position:'fixed', bottom:28, right:28, zIndex:9999,
          background: toast.type === 'ok' ? '#166534' : '#991b1b',
          color:'#fff', borderRadius:10, padding:'14px 20px',
          boxShadow:'0 8px 32px rgba(0,0,0,.22)', fontSize:13, fontWeight:500,
          display:'flex', alignItems:'center', gap:12, maxWidth:380,
          animation:'fadeInUp .2s ease',
        }}>
          <span style={{ fontSize:16 }}>{toast.type === 'ok' ? '✓' : '✕'}</span>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)}
            style={{ background:'rgba(255,255,255,.2)', border:'none', borderRadius:6,
                     color:'#fff', cursor:'pointer', padding:'2px 8px', fontSize:12, marginLeft:4 }}>
            Dismiss
          </button>
        </div>
      )}

      {/* ── Info / Logs Modal ─────────────────────────────────────── */}
      {infoAlert && (
        <div style={S.overlay} onClick={() => setInfoAlert(null)}>
          <div style={{ ...S.modal, width:720, padding:0 }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'#0f172a' }}>{infoAlert.alertName}</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>
                  {infoAlert.alertType} &nbsp;·&nbsp; {infoAlert.groupName} &nbsp;·&nbsp; {infoAlert.frequency} @ {infoAlert.timeOfDay}
                  &nbsp;·&nbsp; <span style={{ color: infoAlert.isActive ? '#16a34a' : '#94a3b8', fontWeight:600 }}>{infoAlert.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <button onClick={() => setInfoAlert(null)}
                style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#94a3b8', lineHeight:1 }}>✕</button>
            </div>

            {/* Alert details strip */}
            <div style={{ display:'flex', gap:0, borderBottom:'1px solid #e2e8f0', fontSize:12 }}>
              {[
                ['Template',   infoAlert.templateName],
                ['View',       infoAlert.sqlViewName],
                ['Last Run',   fmtDate(infoAlert.lastRunDate)],
                ['Last Success', fmtDate(infoAlert.lastSuccessDate)],
                ['Skip Empty', infoAlert.skipIfNoData ? 'Yes' : 'No'],
              ].map(([label, val]) => (
                <div key={label} style={{ flex:1, padding:'10px 16px', borderRight:'1px solid #e2e8f0' }}>
                  <div style={{ color:'#94a3b8', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:3 }}>{label}</div>
                  <div style={{ color:'#1e293b', fontWeight:500, wordBreak:'break-all' }}>{val || '—'}</div>
                </div>
              ))}
            </div>

            {/* Run logs */}
            <div style={{ padding:'16px 24px 0' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
                Recent Run Logs
              </div>
            </div>

            <div style={{ maxHeight:380, overflowY:'auto', padding:'0 24px 20px' }}>
              {infoLoading ? (
                <div style={{ padding:24, textAlign:'center', color:'#94a3b8' }}>Loading…</div>
              ) : infoLogs.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'#94a3b8', fontSize:13 }}>No runs yet for this alert.</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Run Date','Status','Data Rows','Recipients','Duration',''].map(h => (
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:600, color:'#475569', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {infoLogs.map(log => (
                      <>
                        <tr key={log.logId} style={{ borderBottom:'1px solid #f1f5f9', background: expandedLog===log.logId ? '#f0f9ff' : '#fff' }}>
                          <td style={{ padding:'8px 10px', color:'#374151' }}>{fmtDate(log.runDate)}</td>
                          <td style={{ padding:'8px 10px' }}>
                            <span style={S.runBadge(log.status)}>{log.status}</span>
                            {log.errorMessage && (
                              <div style={{ fontSize:10, color:'#dc2626', marginTop:2, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                                   title={log.errorMessage}>
                                {log.errorMessage}
                              </div>
                            )}
                          </td>
                          <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:600, color:'#1e293b' }}>{log.dataRowCount ?? '—'}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:600, color:'#1e293b' }}>{log.recipientCount ?? '—'}</td>
                          <td style={{ padding:'8px 10px', color:'#64748b' }}>{fmtMs(log.durationMs)}</td>
                          <td style={{ padding:'8px 10px' }}>
                            {log.recipientCount > 0 && (
                              <button onClick={() => toggleLogRecipients(log.logId)}
                                style={{ background:'none', border:'1px solid #cbd5e1', borderRadius:5, padding:'2px 8px', fontSize:11, cursor:'pointer', color:'#475569' }}>
                                {expandedLog === log.logId ? 'Hide' : 'Recipients'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedLog === log.logId && (
                          <tr key={`${log.logId}-recip`}>
                            <td colSpan={6} style={{ padding:'0 10px 10px 28px', background:'#f0f9ff' }}>
                              {!infoRecipients[log.logId] ? (
                                <div style={{ padding:'8px 0', color:'#94a3b8', fontSize:12 }}>Loading…</div>
                              ) : (
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                  <thead>
                                    <tr>
                                      {['Name','Email','Status','Sent At'].map(h => (
                                        <th key={h} style={{ padding:'5px 10px', background:'#e0f2fe', color:'#0369a1', fontWeight:600, textAlign:'left' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {infoRecipients[log.logId].map(r => (
                                      <tr key={r.recipientLogId} style={{ borderBottom:'1px solid #e0f2fe' }}>
                                        <td style={{ padding:'5px 10px', color:'#1e293b' }}>{r.fullName}</td>
                                        <td style={{ padding:'5px 10px', color:'#475569' }}>{r.email}</td>
                                        <td style={{ padding:'5px 10px' }}>
                                          <span style={{ padding:'1px 7px', borderRadius:8, fontSize:10, fontWeight:600,
                                            background: r.status==='Sent' ? '#dcfce7' : '#fef2f2',
                                            color:      r.status==='Sent' ? '#15803d' : '#dc2626' }}>
                                            {r.status}
                                          </span>
                                        </td>
                                        <td style={{ padding:'5px 10px', color:'#64748b' }}>{fmtDate(r.sentDate)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
