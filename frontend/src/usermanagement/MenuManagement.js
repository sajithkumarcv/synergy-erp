import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { usePermission } from '../PermissionContext';
import '../procurement/Procurement.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const ICON_OPTIONS = [
  'dashboard','masters','procurement','inventory','job','finance','settings',
];

const EMPTY_FORM = {
  menuId:       0,
  parentMenuId: '',
  menuName:     '',
  menuUrl:      '',
  menuIcon:     '',
  menuOrder:    0,
  isActive:     true,
};

// ─────────────────────────────────────────────────────────────────────────────
const MenuManagement = () => {
  const { reload: reloadPermissions } = usePermission();

  const [menus,    setMenus]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [formError, setFormError] = useState({});

  const [expandedGroups, setExpandedGroups] = useState({});

  // ── Load full menu tree ───────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true); setError('');
    fetch(`${variables.API_URL}menu/all`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        const list = d.menus || [];
        setMenus(list);
        // Default: expand all parent groups
        const groups = {};
        list.filter(m => m.parentMenuId == null || m.parentMenuId === 0).forEach(m => { groups[m.menuId] = true; });
        setExpandedGroups(groups);
      })
      .catch(() => setError('Failed to load menus.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived lists ─────────────────────────────────────────────────────────
  const parents  = menus.filter(m => !m.parentMenuId).sort((a, b) => a.menuOrder - b.menuOrder);
  const childrenOf = (pid) => menus.filter(m => m.parentMenuId === pid).sort((a, b) => a.menuOrder - b.menuOrder);

  // ── Form helpers ──────────────────────────────────────────────────────────
  const openNew = (parentMenuId = '') => {
    setForm({ ...EMPTY_FORM, parentMenuId: parentMenuId || '', menuOrder: menus.length + 1 });
    setFormError({});
    setShowForm(true);
  };

  const openEdit = (m) => {
    setForm({
      menuId:       m.menuId,
      parentMenuId: m.parentMenuId ?? '',
      menuName:     m.menuName,
      menuUrl:      m.menuUrl  || '',
      menuIcon:     m.menuIcon || '',
      menuOrder:    m.menuOrder,
      isActive:     m.isActive,
    });
    setFormError({});
    setShowForm(true);
  };

  const validate = () => {
    const e = {};
    if (!form.menuName.trim()) e.menuName = 'Name is required.';
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setFormError(e); return; }

    setSaving(true); setError('');
    try {
      const body = {
        menuId:       form.menuId,
        parentMenuId: form.parentMenuId !== '' ? Number(form.parentMenuId) : null,
        menuName:     form.menuName.trim(),
        menuUrl:      form.menuUrl.trim()  || null,
        menuIcon:     form.menuIcon.trim() || null,
        menuOrder:    Number(form.menuOrder),
        isActive:     form.isActive,
      };
      const res = await fetch(`${variables.API_URL}menu`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.message || 'Save failed.'); return; }
      setSuccess(form.menuId === 0 ? 'Menu created.' : 'Menu updated.');
      setShowForm(false);
      load();
      reloadPermissions();
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    try {
      const body = {
        menuId:       m.menuId,
        parentMenuId: m.parentMenuId ?? null,
        menuName:     m.menuName,
        menuUrl:      m.menuUrl  || null,
        menuIcon:     m.menuIcon || null,
        menuOrder:    m.menuOrder,
        isActive:     !m.isActive,
      };
      const res = await fetch(`${variables.API_URL}menu`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setError(d?.message || 'Failed to update menu item.'); return; }
      load(); reloadPermissions();
    } catch {
      setError('Network error.');
    }
  };

  const toggleGroup = (id) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="po-grid-wrap">
      {/* Header */}
      <div className="po-grid-header">
        <div className="po-title-row">
          <h1 className="po-title">Menu Management</h1>
          <button className="po-btn-pri" onClick={() => openNew()}>+ New Menu</button>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          Manage the application menu structure. Changes take effect immediately for all users.
        </div>
      </div>

      {error   && <div style={{ margin: '0 24px 12px', padding: '8px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12.5 }}>⚠ {error}</div>}
      {success && <div style={{ margin: '0 24px 12px', padding: '8px 14px', background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: 12.5 }}>✓ {success}</div>}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</div>
      ) : (
        <div style={{ padding: '0 24px 24px' }}>
          {parents.map(parent => (
            <div key={parent.menuId} style={{ marginBottom: 14 }}>
              {/* Parent row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#f1f5f9', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '8px 14px',
              }}>
                <button onClick={() => toggleGroup(parent.menuId)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#475569', padding: '0 4px' }}>
                  {expandedGroups[parent.menuId] ? '▾' : '▸'}
                </button>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', flex: 1 }}>
                  {parent.menuName}
                  {parent.menuUrl && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginLeft: 8 }}>{parent.menuUrl}</span>}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', marginRight: 6 }}>order {parent.menuOrder}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  background: parent.isActive ? '#dcfce7' : '#fee2e2',
                  color: parent.isActive ? '#166534' : '#991b1b',
                }}>{parent.isActive ? 'Active' : 'Inactive'}</span>
                <button className="po-act-btn"
                        onClick={() => openEdit(parent)}
                        style={{ fontSize: 11, padding: '3px 10px' }}>Edit</button>
                <button className="po-act-btn"
                        onClick={() => toggleActive(parent)}
                        style={{ fontSize: 11, padding: '3px 10px', color: parent.isActive ? '#92400e' : '#166534' }}>
                  {parent.isActive ? 'Disable' : 'Enable'}
                </button>
                <button className="po-act-btn"
                        onClick={() => openNew(parent.menuId)}
                        style={{ fontSize: 11, padding: '3px 10px', color: '#1d4ed8' }}>+ Child</button>
              </div>

              {/* Children */}
              {expandedGroups[parent.menuId] && childrenOf(parent.menuId).map(child => (
                <div key={child.menuId} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid #f1f5f9', padding: '7px 14px 7px 36px',
                  opacity: child.isActive ? 1 : 0.55,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: '#334155', flex: 1 }}>{child.menuName}</span>
                  {child.menuUrl && (
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{child.menuUrl}</span>
                  )}
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>order {child.menuOrder}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                    background: child.isActive ? '#dcfce7' : '#fee2e2',
                    color: child.isActive ? '#166534' : '#991b1b',
                  }}>{child.isActive ? 'Active' : 'Inactive'}</span>
                  <button className="po-act-btn"
                          onClick={() => openEdit(child)}
                          style={{ fontSize: 11, padding: '3px 10px' }}>Edit</button>
                  <button className="po-act-btn"
                          onClick={() => toggleActive(child)}
                          style={{ fontSize: 11, padding: '3px 10px', color: child.isActive ? '#92400e' : '#166534' }}>
                    {child.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="pf-overlay">
          <div className="pf-modal" style={{ maxWidth: 500 }}>
            <div className="pf-modal-header">
              <h3 className="pf-modal-title">{form.menuId === 0 ? 'New Menu Entry' : 'Edit Menu Entry'}</h3>
              <button className="pf-close-btn" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className="pf-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Parent */}
              <div className="pf-field">
                <label className="pf-label">Parent Menu</label>
                <select className="pf-input"
                        value={form.parentMenuId}
                        onChange={e => setForm(f => ({ ...f, parentMenuId: e.target.value }))}>
                  <option value="">— None (top-level) —</option>
                  {parents.filter(p => p.menuId !== form.menuId).map(p => (
                    <option key={p.menuId} value={p.menuId}>{p.menuName}</option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div className="pf-field">
                <label className="pf-label">Menu Name *</label>
                <input className={`pf-input${formError.menuName ? ' pf-input-error' : ''}`}
                       value={form.menuName}
                       onChange={e => setForm(f => ({ ...f, menuName: e.target.value }))}
                       placeholder="e.g. Purchase Request" />
                {formError.menuName && <div className="pf-field-error">{formError.menuName}</div>}
              </div>

              {/* URL */}
              <div className="pf-field">
                <label className="pf-label">URL</label>
                <input className="pf-input"
                       value={form.menuUrl}
                       onChange={e => setForm(f => ({ ...f, menuUrl: e.target.value }))}
                       placeholder="e.g. /purchase-requests (blank = group only)" />
              </div>

              {/* Icon + Order in a row */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="pf-field" style={{ flex: 1 }}>
                  <label className="pf-label">Icon</label>
                  <select className="pf-input"
                          value={form.menuIcon}
                          onChange={e => setForm(f => ({ ...f, menuIcon: e.target.value }))}>
                    <option value="">— none —</option>
                    {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                  </select>
                </div>
                <div className="pf-field" style={{ width: 100 }}>
                  <label className="pf-label">Order</label>
                  <input className="pf-input" type="number" min="1"
                         value={form.menuOrder}
                         onChange={e => setForm(f => ({ ...f, menuOrder: e.target.value }))} />
                </div>
              </div>

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="mnu-active" checked={form.isActive}
                       onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                <label htmlFor="mnu-active" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                  Active (visible to users)
                </label>
              </div>
            </div>

            <div className="pf-modal-footer">
              <button className="pf-btn-sec" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="pf-btn-pri" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : form.menuId === 0 ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { MenuManagement };
export default MenuManagement;
