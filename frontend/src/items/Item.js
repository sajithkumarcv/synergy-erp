import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { useFieldConfig } from '../FieldConfigContext';
import { usePermission } from '../PermissionContext';
import ItemImportModal from './ItemImportModal';
import './Item.css';
import RowLink from '../common/RowLink';

const PAGE_SIZES      = [10, 20, 50, 100];
const DEFAULT_FILTERS = { searchText: '', categoryId: '', subCategoryId: '', itemTypeId: '', isActive: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <span className="item-sort-none">⇅</span>;
  return <span className="item-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ═══════════════════════════════════════════════════════════════
// NEW ITEM FORM (slide-over)
// ═══════════════════════════════════════════════════════════════
const ItemForm = ({ categories, itemTypes, uoms, onClose, onSaved }) => {
  const currentUser = useCurrentUser();
  const { isReq } = useFieldConfig('ITEM');

  const [form, setForm] = useState({
    itemId: 0, itemCode: '', itemName: '', itemNameAr: '', shortDescription: '',
    categoryId: '', itemTypeId: '',
    baseUomId: '', purchaseUomId: '', salesUomId: '',
    barcode: '', hsCode: '',
    isStockable: false, isSaleable: true, isPurchasable: true, isActive: true,
  });
  const [parentCatId, setParentCatId] = useState('');
  const [saving, setSaving] = useState(false);

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const parentCats = categories.filter(c => !c.parentCategoryId);
  const subCats    = parentCatId
    ? categories.filter(c => String(c.parentCategoryId) === String(parentCatId))
    : [];

  const handleParentCat = (e) => {
    setParentCatId(e.target.value);
    setForm(p => ({ ...p, categoryId: '' }));
  };

  const save = async () => {
    if (!form.itemName.trim()) { alert('Item Name is required.'); return; }
    if (!form.itemTypeId)      { alert('Item Type is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${variables.API_URL}item/save`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          categoryId:    form.categoryId    ? Number(form.categoryId)    : null,
          itemTypeId:    form.itemTypeId    ? Number(form.itemTypeId)    : null,
          baseUomId:     form.baseUomId     ? Number(form.baseUomId)     : null,
          purchaseUomId: form.purchaseUomId ? Number(form.purchaseUomId) : null,
          salesUomId:    form.salesUomId    ? Number(form.salesUomId)    : null,
          createdBy: currentUser,
        })
      });
      const d = await res.json();
      if (!res.ok) { alert(d?.message || 'Failed to save item.'); return; }
      onSaved(d.itemId); onClose();
    } catch { alert('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  const Sec = ({ label }) => (
    <div className="if-section">
      <span className="if-section-label">{label}</span>
      <div className="if-section-line" />
    </div>
  );

  return (
    <div className="if-overlay">
      <div className="if-panel" onClick={e => e.stopPropagation()}>

        <div className="if-header">
          <div>
            <div className="if-header-title">+ New Item</div>
            <div className="if-header-sub">Fill in the details to create a new item</div>
          </div>
          <button className="if-close" onClick={onClose}>✕</button>
        </div>

        <div className="if-body">

          <Sec label="Identity" />
          <div className="if-row">
            <div className="if-field" style={{ flex: '0 0 150px' }}>
              <label>Item Code</label>
              <input name="itemCode" className="if-input" value={form.itemCode} onChange={handle} placeholder="Auto if blank" />
            </div>
            <div className="if-field if-f2">
              <label>Item Name {isReq('itemName') && <span className="req">*</span>}</label>
              <input name="itemName" className="if-input" value={form.itemName} onChange={handle} placeholder="Full item name" />
            </div>
            <div className="if-field if-f2">
              <label>Arabic Name</label>
              <input name="itemNameAr" className="if-input" value={form.itemNameAr} onChange={handle} dir="rtl" placeholder="الاسم بالعربي" />
            </div>
          </div>
          <div className="if-row">
            <div className="if-field" style={{ flex: 1 }}>
              <label>Short Description</label>
              <textarea name="shortDescription" className="if-input if-textarea" rows={2} value={form.shortDescription} onChange={handle} placeholder="Brief description of the item…" />
            </div>
          </div>

          <Sec label="Classification" />
          <div className="if-row">
            <div className="if-field">
              <label>Item Type <span className="req">*</span></label>
              <select name="itemTypeId" className="if-input" value={form.itemTypeId} onChange={handle}>
                <option value="">-- Select --</option>
                {itemTypes.map(t => <option key={t.itemTypeId} value={t.itemTypeId}>{t.typeName}</option>)}
              </select>
            </div>
            <div className="if-field">
              <label>Category</label>
              <select className="if-input" value={parentCatId} onChange={handleParentCat}>
                <option value="">-- Select --</option>
                {parentCats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
              </select>
            </div>
            <div className="if-field">
              <label>Sub-Category</label>
              <select name="categoryId" className="if-input" value={form.categoryId} onChange={handle}
                disabled={!parentCatId || subCats.length === 0}>
                <option value="">{!parentCatId ? '— select category first —' : subCats.length === 0 ? '— no sub-categories —' : '-- Select --'}</option>
                {subCats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
              </select>
            </div>
          </div>

          <Sec label="Units of Measure" />
          <div className="if-row">
            <div className="if-field">
              <label>Base UOM</label>
              <select name="baseUomId" className="if-input" value={form.baseUomId} onChange={handle}>
                <option value="">-- Select --</option>
                {uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}
              </select>
            </div>
            <div className="if-field">
              <label>Purchase UOM</label>
              <select name="purchaseUomId" className="if-input" value={form.purchaseUomId} onChange={handle}>
                <option value="">-- Select --</option>
                {uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}
              </select>
            </div>
            <div className="if-field">
              <label>Sales UOM</label>
              <select name="salesUomId" className="if-input" value={form.salesUomId} onChange={handle}>
                <option value="">-- Select --</option>
                {uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}
              </select>
            </div>
          </div>

          <Sec label="Identifiers" />
          <div className="if-row">
            <div className="if-field">
              <label>Barcode</label>
              <input name="barcode" className="if-input" value={form.barcode} onChange={handle} placeholder="EAN / UPC" />
            </div>
            <div className="if-field">
              <label>HS Code</label>
              <input name="hsCode" className="if-input" value={form.hsCode} onChange={handle} placeholder="Customs tariff code" />
            </div>
          </div>

          <Sec label="Flags" />
          <div className="if-check-row">
            <label className="if-check"><input type="checkbox" name="isStockable"   checked={!!form.isStockable}   onChange={handle} /><span>Stockable</span></label>
            <label className="if-check"><input type="checkbox" name="isSaleable"    checked={!!form.isSaleable}    onChange={handle} /><span>Saleable</span></label>
            <label className="if-check"><input type="checkbox" name="isPurchasable" checked={!!form.isPurchasable} onChange={handle} /><span>Purchasable</span></label>
            <label className="if-check"><input type="checkbox" name="isActive"      checked={!!form.isActive}      onChange={handle} /><span>Active</span></label>
          </div>

        </div>

        <div className="if-footer">
          <button className="if-btn-sec" onClick={onClose}>Cancel</button>
          <button className="if-btn-pri" onClick={save} disabled={saving || !form.itemName.trim()}>
            {saving ? 'Creating…' : 'Create Item'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ITEM LIST PAGE
// ═══════════════════════════════════════════════════════════════
export const Item = () => {
  const navigate = useNavigate();
  const { canDo } = usePermission();
  const canAdd    = canDo('/items', 'ADD');
  const { registerFilters, unregisterFilters, updateFilterDefs, setFilter } = useFilters();

  const [rows,      setRows]      = useState([]);
  const [totalRows, setTotal]     = useState(0);
  const [totalPages,setPages]     = useState(1);
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(20);
  const [sortCol,   setSortCol]   = useState('ItemName');
  const [sortDir,   setSortDir]   = useState('ASC');
  const [loading,   setLoading]   = useState(false);
  const [applied,   setApplied]   = useState({ ...DEFAULT_FILTERS });
  const [categories,setCategories]= useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [uoms,      setUoms]      = useState([]);
  const [showForm,   setShowForm]   = useState(false);
  const [showImport, setShowImport] = useState(false);

  const gridRef = useRef({ pageSize: 20, sortCol: 'ItemName', sortDir: 'ASC', applied: DEFAULT_FILTERS });
  useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

  useEffect(() => {
    fetch(`${variables.API_URL}item/types`,      { headers: authHeaders() }).then(r => r.json()).then(d => setItemTypes(Array.isArray(d)  ? d : [])).catch(console.error);
    fetch(`${variables.API_URL}item/categories`, { headers: authHeaders() }).then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : [])).catch(console.error);
    fetch(`${variables.API_URL}item/uoms`,       { headers: authHeaders() }).then(r => r.json()).then(d => setUoms(Array.isArray(d)       ? d : [])).catch(console.error);
  }, []);

  const load = useCallback((pg, ps, sc, sd, af) => {
    setLoading(true);
    const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
    if (af.searchText)    q.set('searchText', af.searchText);
    const catId = af.subCategoryId || af.categoryId;
    if (catId)            q.set('categoryId', catId);
    if (af.itemTypeId)    q.set('itemTypeId', af.itemTypeId);
    if (af.isActive !== '') q.set('isActive', af.isActive);
    fetch(`${variables.API_URL}item/search?${q}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

  // Mount-only: register with empty options to avoid re-render loop
  useEffect(() => {
    const onApply = (vals) => {
      const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
      setApplied({ ...vals }); setPage(1);
      load(1, ps, sc, sd, vals);
    };
    registerFilters('item', {
      searchText:    { label: 'Search',       type: 'text',   placeholder: 'Name, code, barcode…' },
      itemTypeId:    { label: 'Type',          type: 'select', placeholder: 'All Types',      options: [] },
      categoryId:    { label: 'Category',      type: 'select', placeholder: 'All Categories', options: [] },
      subCategoryId: { label: 'Sub-Category',  type: 'select', placeholder: 'All Sub-Categories', options: [] },
      isActive:      { label: 'Status',        type: 'select', placeholder: 'All',
                       options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
    }, DEFAULT_FILTERS, onApply);
    return () => unregisterFilters('item');
  }, []); // eslint-disable-line

  // Patch options when data loads. buildDefs is defined inside the effect so the
  // onChange cascade always captures the freshest categories/itemTypes.
  useEffect(() => {
    const parentCats = categories.filter(c => !c.parentCategoryId);
    const buildDefs = (selCatId) => {
      const subOpts = selCatId
        ? categories.filter(c => String(c.parentCategoryId) === String(selCatId))
                    .map(c => ({ value: c.categoryId, label: c.categoryName }))
        : [];
      return {
        searchText:    { label: 'Search',       type: 'text',   placeholder: 'Name, code, barcode…' },
        itemTypeId:    { label: 'Type',          type: 'select', placeholder: 'All Types',
                         options: itemTypes.map(t => ({ value: t.itemTypeId, label: t.typeName })) },
        categoryId:    { label: 'Category',      type: 'select', placeholder: 'All Categories',
                         options: parentCats.map(c => ({ value: c.categoryId, label: c.categoryName })),
                         onChange: (val) => {
                           setFilter('item', 'subCategoryId', '');
                           updateFilterDefs('item', buildDefs(val));
                         }},
        subCategoryId: { label: 'Sub-Category',  type: 'select', placeholder: 'All Sub-Categories',
                         options: subOpts },
        isActive:      { label: 'Status',        type: 'select', placeholder: 'All',
                         options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
      };
    };
    updateFilterDefs('item', buildDefs(''));
  }, [itemTypes, categories]); // eslint-disable-line

  const handleSort = (col) => {
    const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
    setSortCol(col); setSortDir(dir); setPage(1);
    load(1, pageSize, col, dir, applied);
  };
  const goPage = (p) => {
    const pg = Math.max(1, Math.min(p, totalPages));
    setPage(pg); load(pg, pageSize, sortCol, sortDir, applied);
  };
  const changePageSize = (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

  const Th = ({ col, children, style }) => (
    <th style={style} onClick={() => handleSort(col)}>
      <span className="item-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></span>
    </th>
  );

  const pageNums = () => {
    const range = 5;
    let start = Math.max(1, page - Math.floor(range / 2));
    let end   = Math.min(totalPages, start + range - 1);
    if (end - start < range - 1) start = Math.max(1, end - range + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  return (
    <div className="item-page">

      {showForm && (
        <ItemForm
          categories={categories} itemTypes={itemTypes} uoms={uoms}
          onClose={() => setShowForm(false)}
          onSaved={(id) => { setShowForm(false); navigate(`/items/${id}`); }}
        />
      )}

      {showImport && (
        <ItemImportModal
          onClose={() => setShowImport(false)}
          onImported={() => load(page, pageSize, sortCol, sortDir, applied)}
        />
      )}

      <div className="item-grid-wrap">
        <div className="item-grid-header">
          <div className="item-title-row">
            <div>
              <h2 className="item-page-title">Items</h2>
              <div className="item-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
            </div>
            <div className="item-toolbar">
              <select className="item-select" style={{ width: 110 }} value={pageSize}
                onChange={e => changePageSize(Number(e.target.value))}>
                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
              {canAdd && (
                <>
                  <button className="item-btn-import" onClick={() => setShowImport(true)}>⬆ Import</button>
                  <button className="item-btn-pri" onClick={() => setShowForm(true)}>+ New Item</button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="item-table-wrap">
          {loading && (
            <div className="item-loading-overlay">
              <div className="item-spinner">
                <div className="item-spinner-ring" />
                <span className="item-spinner-text">Loading…</span>
              </div>
            </div>
          )}
          <table className={`item-table${loading ? ' item-tbl-loading' : ''}`}>
            <thead><tr>
              <Th col="ItemCode">Code</Th>
              <Th col="ItemName">Name</Th>
              <Th col="ItemTypeName">Type</Th>
              <Th col="CategoryName">Category</Th>
              <th>UOM</th>
              <th>Status</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && !loading
                ? <tr><td colSpan="7" className="item-empty">No items found. Use the filters on the left or create a new item.</td></tr>
                : rows.map(item => (
                  <tr key={item.itemId}>
                    <td>
                      <RowLink className="item-id-link" to={`/items/${item.itemId}`}>
                        {item.itemCode || `#${item.itemId}`}
                      </RowLink>
                    </td>
                    <td className="item-name-cell">
                      <span className="item-name-main" title={item.itemName}>{item.itemName}</span>
                      {item.itemNameAr && <span className="item-name-ar">{item.itemNameAr}</span>}
                    </td>
                    <td>{item.itemTypeName ? <span className="item-type-badge">{item.itemTypeName}</span> : '—'}</td>
                    <td>
                      {item.parentCategoryName
                        ? <div style={{ lineHeight: 1.4 }}>
                            <div style={{ fontSize: 11.5, color: '#1e293b', fontWeight: 500 }}>{item.parentCategoryName}</div>
                            <div style={{ fontSize: 10.5, color: '#64748b' }}>{item.categoryName}</div>
                          </div>
                        : <span>{item.categoryName || '—'}</span>}
                    </td>
                    <td>{item.baseUomName || '—'}</td>
                    <td>
                      {item.isActive
                        ? <span className="item-active-badge">Active</span>
                        : <span className="item-inactive-badge">Inactive</span>}
                    </td>
                    <td className="item-actions-cell">
                      <RowLink className="item-act-btn item-act-open" to={`/items/${item.itemId}`}>
                        Open
                      </RowLink>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="item-pagination">
          <div className="item-page-info">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            &nbsp;·&nbsp;{totalRows} total record{totalRows !== 1 ? 's' : ''}
          </div>
          <div className="item-page-controls">
            <button className="item-page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
            <button className="item-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
            {pageNums().map(n => (
              <button key={n} className={`item-page-btn ${n === page ? 'item-page-btn-active' : ''}`}
                onClick={() => goPage(n)}>{n}</button>
            ))}
            <button className="item-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
            <button className="item-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Item;
