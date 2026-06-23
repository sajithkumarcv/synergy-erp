import React, { useState, useEffect, useRef, useCallback } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { fmt } from '../jobConstants';
import AlertModal from '../../common/AlertModal';
import ConfirmModal from '../../common/ConfirmModal';

const MAT_STATUS = {
  Open:      { bg: '#dbeafe', color: '#1e40af' },
  Partial:   { bg: '#fef9c3', color: '#854d0e' },
  Complete:  { bg: '#dcfce7', color: '#166534' },
  Cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

// ── Debounced BOM search ──────────────────────────────────────
const BomSearch = ({ onSelect, placeholder = 'Search active BOM…' }) => {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const timer   = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = q => {
    clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(() => {
      setLoading(true);
      fetch(`${variables.API_URL}bom/search?q=${encodeURIComponent(q)}&status=Active&pageSize=10`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => { setResults(Array.isArray(d) ? d : (d.data || [])); setOpen(true); })
        .catch(() => {}).finally(() => setLoading(false));
    }, 300);
  };

  const select = b => {
    onSelect(b);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="mat-bom-search" ref={wrapRef}>
      <input className="mat-input" value={query} placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); search(e.target.value); }}
        onFocus={() => results.length > 0 && setOpen(true)} />
      {loading && <span className="mat-is-spinner" />}
      {open && results.length > 0 && (
        <div className="mat-is-dropdown">
          {results.map(b => (
            <div key={b.bomId} className="mat-is-option"
              onMouseDown={() => select(b)}>
              <span className="mat-is-code">{b.bomCode || b.bomId}</span>
              <span className="mat-is-name">{b.bomName}{b.bomVersion ? ` v${b.bomVersion}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Debounced item search ─────────────────────────────────────
const ItemSearch = ({ displayValue, onSelect }) => {
  const [query,   setQuery]   = useState(displayValue || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const timer   = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => { setQuery(displayValue || ''); }, [displayValue]);

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = q => {
    clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(() => {
      setLoading(true);
      fetch(`${variables.API_URL}item/search?q=${encodeURIComponent(q)}&pageSize=12`, { headers: authHeaders() })
        .then(r => r.json()).then(d => { setResults(Array.isArray(d) ? d : (d.data || [])); setOpen(true); })
        .catch(() => {}).finally(() => setLoading(false));
    }, 300);
  };

  return (
    <div className="mat-item-search" ref={wrapRef}>
      <input className="mat-input" value={query} placeholder="Search item…"
        onChange={e => { setQuery(e.target.value); search(e.target.value); }}
        onFocus={() => results.length > 0 && setOpen(true)} />
      {loading && <span className="mat-is-spinner" />}
      {open && results.length > 0 && (
        <div className="mat-is-dropdown">
          {results.map(it => (
            <div key={it.itemId} className="mat-is-option"
              onMouseDown={() => { onSelect(it); setQuery(`${it.itemCode} — ${it.itemName}`); setOpen(false); }}>
              <span className="mat-is-code">{it.itemCode}</span>
              <span className="mat-is-name">{it.itemName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const emptyMaterialRow = () => ({
  jobMaterialId: 0, jobBomId: null, bomLineId: null,
  componentItemId: 0, componentItemCode: '', componentItemName: '',
  uomId: 0, uomCode: '', plannedQty: '', issuedQty: 0, returnedQty: 0, remarks: '',
});

// ── BOM assignment row (add form) ─────────────────────────────
const AddBomRow = ({ uoms, onSave, onCancel }) => {
  const [form, setForm] = useState({ bomId: 0, bomCode: '', bomName: '', bomVersion: '',
    plannedQty: '', plannedUomId: '', remarks: '' });

  const valid = form.bomId > 0 && Number(form.plannedQty) > 0 && form.plannedUomId;

  return (
    <tr className="mat-add-row">
      <td colSpan={2}>
        <BomSearch onSelect={b => setForm(p => ({ ...p, bomId: b.bomId, bomCode: b.bomCode || '', bomName: b.bomName, bomVersion: b.bomVersion || '' }))} />
        {form.bomId > 0 && <div className="mat-bom-selected">{form.bomCode} — {form.bomName}{form.bomVersion ? ` v${form.bomVersion}` : ''}</div>}
      </td>
      <td>
        <input type="number" className="mat-input mat-input-sm mat-input-num" min="0.0001" step="any"
          placeholder="Qty" value={form.plannedQty}
          onChange={e => setForm(p => ({ ...p, plannedQty: e.target.value }))} />
      </td>
      <td>
        <select className="mat-input mat-input-sm" value={form.plannedUomId}
          onChange={e => setForm(p => ({ ...p, plannedUomId: e.target.value }))}>
          <option value="">UOM</option>
          {uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode}</option>)}
        </select>
      </td>
      <td>
        <input className="mat-input mat-input-sm" placeholder="Remarks"
          value={form.remarks}
          onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} />
      </td>
      <td className="mat-actions">
        <button className="mat-act-save" disabled={!valid} onClick={() => onSave(form)}>✓</button>
        <button className="mat-act-cancel" onClick={onCancel}>✕</button>
      </td>
    </tr>
  );
};

// ══════════════════════════════════════════════════════════════
// MaterialsTab
// ══════════════════════════════════════════════════════════════
const MaterialsTab = ({ job, onRefresh }) => {
  const currentUser = useCurrentUser();

  // BOM assignments
  const [boms,       setBoms]       = useState([]);
  const [bomsLoading, setBomsLoading] = useState(true);
  const [showAddBom,  setShowAddBom]  = useState(false);
  const [savingBom,   setSavingBom]   = useState(false);

  // Material lines
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addRow,     setAddRow]     = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [editRow,    setEditRow]    = useState(null);
  const [uoms,       setUoms]       = useState([]);
  const [alertMsg,   setAlertMsg]   = useState(null);
  const [confirm,    setConfirm]    = useState(null);

  const loadBoms = useCallback(() => {
    setBomsLoading(true);
    fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/boms`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setBoms(Array.isArray(d) ? d : []))
      .catch(e => console.error('Load BOMs:', e)).finally(() => setBomsLoading(false));
  }, [job.jobId]);

  const loadMaterials = useCallback(() => {
    setLoading(true);
    fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/materials`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(e => console.error('Load materials:', e)).finally(() => setLoading(false));
  }, [job.jobId]);

  useEffect(() => { loadBoms(); loadMaterials(); }, [loadBoms, loadMaterials]);

  useEffect(() => {
    fetch(`${variables.API_URL}item/uoms`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setUoms(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const saveJobBom = async form => {
    setSavingBom(true);
    try {
      const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/boms`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          jobBomId: 0, bomId: Number(form.bomId),
          plannedQty: Number(form.plannedQty),
          plannedUomId: Number(form.plannedUomId),
          remarks: form.remarks || null,
          sortOrder: boms.length,
          createdBy: currentUser, modifiedBy: currentUser,
        })
      });
      const d = await res.json();
      if (!res.ok) { setAlertMsg(d?.message || 'Failed to add BOM.'); return; }
      setShowAddBom(false);
      loadBoms();
      onRefresh();
    } catch { setAlertMsg('Network error. Please try again.'); }
    finally { setSavingBom(false); }
  };

  const deleteJobBom = (id) => {
    setConfirm({
      title: 'Remove BOM',
      message: 'Remove this BOM? Its generated material lines will also be removed.',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/boms/${id}`, {
            method: 'DELETE', headers: authHeaders()
          });
          if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to remove BOM.'); return; }
          loadBoms(); loadMaterials(); onRefresh();
        } catch { setAlertMsg('Network error. Please try again.'); }
      },
    });
  };

  const generate = () => {
    if (boms.length === 0) { setAlertMsg('No BOMs assigned to this job yet.'); return; }
    setConfirm({
      title: 'Generate Materials',
      message: `Generate materials from ${boms.length} BOM(s)? Existing BOM-sourced lines will be replaced. Manually added lines are preserved.`,
      confirmLabel: 'Generate',
      confirmStyle: { background: '#1e40af', color: '#fff' },
      onConfirm: async () => {
        setConfirm(null);
        setGenerating(true);
    try {
      const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/generate-materials`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ createdBy: currentUser })
      });
      const d = await res.json();
      if (!res.ok) { setAlertMsg(d?.message || 'Failed to generate materials.'); return; }
      loadMaterials();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setGenerating(false); }
      },
    });
  };

  const saveAddLine = async () => {
    if (!addRow.componentItemId) { setAlertMsg('Select an item.'); return; }
    if (!addRow.plannedQty || Number(addRow.plannedQty) <= 0) { setAlertMsg('Enter a valid planned quantity.'); return; }
    if (!addRow.uomId) { setAlertMsg('Select a UOM.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/materials`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          ...addRow, plannedQty: Number(addRow.plannedQty),
          issuedQty: 0, returnedQty: 0,
          createdBy: currentUser, modifiedBy: currentUser,
        })
      });
      const d = await res.json();
      if (!res.ok) { setAlertMsg(d?.message || 'Failed to save material line.'); return; }
      setAddRow(null); loadMaterials();
    } catch { setAlertMsg('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  const saveInlineEdit = async (row, field, value) => {
    setEditRow(null);
    try {
      const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/materials`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...row, [field]: value, modifiedBy: currentUser })
      });
      if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to save changes.'); }
      loadMaterials();
    } catch { setAlertMsg('Network error. Please try again.'); }
  };

  const totPlanned   = rows.reduce((s, r) => s + Number(r.plannedQty   || 0), 0);
  const totIssued    = rows.reduce((s, r) => s + Number(r.issuedQty    || 0), 0);
  const totRemaining = rows.reduce((s, r) => s + Number(r.remainingQty || 0), 0);

  return (
    <div className="mat-tab">

      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

      {/* ── BOM Assignments panel ── */}
      <div className="mat-bom-panel">
        <div className="mat-bom-panel-header">
          <span className="mat-bom-panel-title">BOM Assignments</span>
          <span className="mat-bom-count-badge">{boms.length}</span>
          <div style={{ flex: 1 }} />
          <button className="mat-btn-gen" onClick={generate} disabled={generating || boms.length === 0}>
            {generating ? 'Generating…' : '⚡ Generate Materials'}
          </button>
          <button className="mat-btn-add" onClick={() => setShowAddBom(true)} disabled={showAddBom || savingBom}>
            + Add BOM
          </button>
        </div>

        <table className="mat-bom-table">
          <thead>
            <tr>
              <th>BOM</th>
              <th>Finished Item</th>
              <th className="mat-num">Planned Qty</th>
              <th>UOM</th>
              <th>Remarks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {showAddBom && (
              <AddBomRow uoms={uoms} onSave={saveJobBom} onCancel={() => setShowAddBom(false)} />
            )}
            {boms.map(b => (
              <tr key={b.jobBomId} className="mat-bom-row">
                <td>
                  <div className="mat-bom-cell">
                    <span className="mat-is-code">{b.bomCode || b.bomId}</span>
                    <span className="mat-bom-name">{b.bomName}</span>
                    {b.bomVersion && <span className="mat-bom-ver">v{b.bomVersion}</span>}
                    <span className={`mat-bom-status mat-bom-status-${(b.bomStatus||'').toLowerCase()}`}>{b.bomStatus}</span>
                  </div>
                </td>
                <td className="mat-bom-item">{b.finishedItemCode && <><span className="mat-item-code">{b.finishedItemCode}</span> {b.finishedItemName}</>}</td>
                <td className="mat-num mat-planned">{fmt(b.plannedQty)}</td>
                <td className="mat-uom">{b.plannedUomCode}</td>
                <td className="mat-bom-remarks">{b.remarks || <span className="mat-remarks-empty">—</span>}</td>
                <td className="mat-actions">
                  <button className="mat-act-del" onClick={() => deleteJobBom(b.jobBomId)} title="Remove BOM">✕</button>
                </td>
              </tr>
            ))}
            {!bomsLoading && boms.length === 0 && !showAddBom && (
              <tr><td colSpan={6} className="mat-empty">No BOMs assigned yet. Click "+ Add BOM" to assign one or more BOMs with planned quantities.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Material lines ── */}
      <div className="mat-toolbar">
        <div className="mat-toolbar-left">
          <span className="mat-title">Material Plan</span>
          {rows.length > 0 && (
            <>
              <div className="mat-kpi-inline"><span className="mat-kpi-label">Lines</span><span className="mat-kpi-val">{rows.length}</span></div>
              <div className="mat-kpi-inline mat-kpi-blue"><span className="mat-kpi-label">Planned</span><span className="mat-kpi-val">{fmt(totPlanned)}</span></div>
              <div className="mat-kpi-inline mat-kpi-amber"><span className="mat-kpi-label">Issued</span><span className="mat-kpi-val">{fmt(totIssued)}</span></div>
              <div className={`mat-kpi-inline ${totRemaining > 0 ? 'mat-kpi-red' : 'mat-kpi-green'}`}><span className="mat-kpi-label">Remaining</span><span className="mat-kpi-val">{fmt(totRemaining)}</span></div>
            </>
          )}
        </div>
        <div className="mat-toolbar-right">
          <button className="mat-btn-add" onClick={() => setAddRow(emptyMaterialRow())} disabled={!!addRow}>
            + Add Line
          </button>
        </div>
      </div>

      <div className="mat-grid-wrap">
        {loading && (
          <div className="mat-overlay">
            <div className="mat-spinner-ring" /><span>Loading…</span>
          </div>
        )}
        <table className="mat-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>UOM</th>
              <th className="mat-num">Planned Qty</th>
              <th className="mat-num">Issued Qty</th>
              <th className="mat-num">Returned</th>
              <th className="mat-num">Remaining</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {addRow && (
              <tr className="mat-add-row">
                <td>
                  <ItemSearch
                    displayValue={addRow.componentItemCode ? `${addRow.componentItemCode} — ${addRow.componentItemName}` : ''}
                    onSelect={it => setAddRow(p => ({ ...p, componentItemId: it.itemId, componentItemCode: it.itemCode, componentItemName: it.itemName, uomId: it.baseUomId || 0 }))}
                  />
                </td>
                <td>
                  <select className="mat-input mat-input-sm" value={addRow.uomId}
                    onChange={e => setAddRow(p => ({ ...p, uomId: Number(e.target.value) }))}>
                    <option value="">UOM</option>
                    {uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode}</option>)}
                  </select>
                </td>
                <td>
                  <input type="number" className="mat-input mat-input-sm mat-input-num" min="0.0001" step="any"
                    value={addRow.plannedQty}
                    onChange={e => setAddRow(p => ({ ...p, plannedQty: e.target.value }))} />
                </td>
                <td colSpan={3} />
                <td />
                <td>
                  <input className="mat-input mat-input-sm" placeholder="Remarks"
                    value={addRow.remarks}
                    onChange={e => setAddRow(p => ({ ...p, remarks: e.target.value }))} />
                </td>
                <td><span className="mat-source-manual">Manual</span></td>
                <td className="mat-actions">
                  <button className="mat-act-save" onClick={saveAddLine} disabled={saving}>{saving ? '…' : '✓'}</button>
                  <button className="mat-act-cancel" onClick={() => setAddRow(null)}>✕</button>
                </td>
              </tr>
            )}

            {rows.map(row => {
              const st = MAT_STATUS[row.status] || MAT_STATUS.Open;
              const isEditing = editRow?.id === row.jobMaterialId;
              return (
                <tr key={row.jobMaterialId} className={`mat-row ${row.status === 'Complete' ? 'mat-row-complete' : ''}`}>
                  <td>
                    <div className="mat-item-cell">
                      <span className="mat-item-code">{row.componentItemCode}</span>
                      <span className="mat-item-name">{row.componentItemName}</span>
                      {row.skuCode && <span className="mat-sku">{row.skuCode}</span>}
                    </div>
                  </td>
                  <td className="mat-uom">{row.uomCode}</td>
                  <td className="mat-num mat-planned">{fmt(row.plannedQty)}</td>
                  <td className="mat-num mat-issued">{fmt(row.issuedQty)}</td>
                  <td className="mat-num">{fmt(row.returnedQty)}</td>
                  <td className="mat-num">
                    <span className={Number(row.remainingQty) > 0 ? 'mat-remaining-pos' : 'mat-remaining-zero'}>
                      {fmt(row.remainingQty)}
                    </span>
                  </td>
                  <td>
                    <span className="mat-status-badge" style={{ background: st.bg, color: st.color }}>
                      {row.status}
                    </span>
                  </td>
                  <td>
                    {isEditing && editRow.field === 'remarks' ? (
                      <input className="mat-input mat-input-sm" autoFocus
                        defaultValue={row.remarks || ''}
                        onBlur={e => saveInlineEdit(row, 'remarks', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditRow(null); }} />
                    ) : (
                      <span className="mat-remarks-cell"
                        onClick={() => setEditRow({ id: row.jobMaterialId, field: 'remarks' })}
                        title="Click to edit">
                        {row.remarks || <span className="mat-remarks-empty">—</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.jobBomId
                      ? <span className="mat-source-bom">BOM</span>
                      : <span className="mat-source-manual">Manual</span>}
                  </td>
                  <td className="mat-actions">
                  </td>
                </tr>
              );
            })}

            {!loading && rows.length === 0 && !addRow && (
              <tr>
                <td colSpan={10} className="mat-empty">
                  {boms.length > 0
                    ? 'Click "⚡ Generate Materials" to explode the BOMs into a material plan.'
                    : 'Assign BOMs above first, then generate the material plan. Or add lines manually.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MaterialsTab;
