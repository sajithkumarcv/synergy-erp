import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import { useFieldConfig } from '../FieldConfigContext';
import AmountInput from '../common/AmountInput';
import AlertModal from '../common/AlertModal';
import '../jobs/JobDetail.css';
import './Item.css';

const fmt = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const ITEM_TABS = [
  { key: 'overview', label: 'Overview',   icon: '📋' },
  { key: 'variants', label: 'Variants',   icon: '🔖' },
  { key: 'specs',    label: 'Specs',      icon: '📐' },
  { key: 'uom',      label: 'UOM',        icon: '⚖️' },
];

// ─────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────
const OverviewTab = ({ item }) => (
  <div className="ov-wrap">
    <div className="ov-detail-grid">
      <div className="ov-detail-card">
        <div className="ov-detail-card-title">Identity</div>
        <div className="ov-detail-rows">
          <div className="ov-row"><span className="ov-row-label">Item Code</span><span className="ov-row-value tab-mono">{item.itemCode || '—'}</span></div>
          <div className="ov-row"><span className="ov-row-label">Item Name</span><span className="ov-row-value">{item.itemName}</span></div>
          {item.itemNameAr && <div className="ov-row"><span className="ov-row-label">Arabic Name</span><span className="ov-row-value" dir="rtl">{item.itemNameAr}</span></div>}
          <div className="ov-row"><span className="ov-row-label">Barcode</span><span className="ov-row-value tab-mono">{item.barcode || '—'}</span></div>
          <div className="ov-row"><span className="ov-row-label">HS Code</span><span className="ov-row-value tab-mono">{item.hsCode || '—'}</span></div>
        </div>
      </div>
      <div className="ov-detail-card">
        <div className="ov-detail-card-title">Classification</div>
        <div className="ov-detail-rows">
          <div className="ov-row"><span className="ov-row-label">Type</span><span className="ov-row-value">{item.itemTypeName || '—'}</span></div>
          <div className="ov-row"><span className="ov-row-label">Category</span><span className="ov-row-value">{item.categoryName || '—'}</span></div>
        </div>
      </div>
      <div className="ov-detail-card">
        <div className="ov-detail-card-title">Units of Measure</div>
        <div className="ov-detail-rows">
          <div className="ov-row"><span className="ov-row-label">Base UOM</span><span className="ov-row-value">{item.baseUomName || '—'}</span></div>
          <div className="ov-row"><span className="ov-row-label">Purchase UOM</span><span className="ov-row-value">{item.purchaseUomName || '—'}</span></div>
          <div className="ov-row"><span className="ov-row-label">Sales UOM</span><span className="ov-row-value">{item.salesUomName || '—'}</span></div>
        </div>
      </div>
      <div className="ov-detail-card">
        <div className="ov-detail-card-title">Flags</div>
        <div className="ov-detail-rows">
          <div className="ov-row"><span className="ov-row-label">Stockable</span><span className={`tab-badge-${item.isStockable ? 'green' : 'gray'}`}>{item.isStockable ? '✓ Yes' : 'No'}</span></div>
          <div className="ov-row"><span className="ov-row-label">Saleable</span><span className={`tab-badge-${item.isSaleable ? 'green' : 'gray'}`}>{item.isSaleable ? '✓ Yes' : 'No'}</span></div>
          <div className="ov-row"><span className="ov-row-label">Purchasable</span><span className={`tab-badge-${item.isPurchasable ? 'green' : 'gray'}`}>{item.isPurchasable ? '✓ Yes' : 'No'}</span></div>
          <div className="ov-row"><span className="ov-row-label">Status</span><span className={`tab-badge-${item.isActive ? 'green' : 'gray'}`}>{item.isActive ? 'Active' : 'Inactive'}</span></div>
        </div>
      </div>
    </div>
    {item.shortDescription && (
      <div className="ov-desc-card">
        <div className="ov-detail-card-title">Description</div>
        <p className="ov-desc-text">{item.shortDescription}</p>
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────
// VARIANTS TAB
// ─────────────────────────────────────────────────────────────
const VariantsTab = ({ itemId }) => {
  const currentUser = useCurrentUser();
  const { lookups } = useLookup();
  const { isReq } = useFieldConfig('ITEM_VARIANT');
  const { countries } = lookups;

  const [variants, setVariants] = useState([]);
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const load = useCallback(() => {
    fetch(`${variables.API_URL}item/${itemId}/details`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setVariants(Array.isArray(d) ? d : [])).catch(console.error);
  }, [itemId]);
  useEffect(() => { load(); }, [load]);

  const emptyForm = () => ({
    itemDetailId: 0, itemId,
    skuCode: '', countryOfOriginId: '', brand: '', model: '', colour: '', size: '', grade: '',
    supplierPartNo: '', manufacturerPartNo: '',
    standardCost: '', listPrice: '',
    weight: '', weightUom: 'kg', leadTimeDays: '', shelfLifeDays: '',
    minStockLevel: '', maxStockLevel: '', reorderLevel: '',
    isDefault: false, isActive: true,
  });

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const save = async () => {
    if (!form.skuCode) { setAlertMsg('SKU Code is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${variables.API_URL}item/${itemId}/details`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          countryOfOriginId: form.countryOfOriginId ? Number(form.countryOfOriginId) : null,
          standardCost:      form.standardCost      ? Number(form.standardCost)      : null,
          listPrice:         form.listPrice         ? Number(form.listPrice)         : null,
          weight:            form.weight            ? Number(form.weight)            : null,
          leadTimeDays:      form.leadTimeDays       ? Number(form.leadTimeDays)      : null,
          shelfLifeDays:     form.shelfLifeDays      ? Number(form.shelfLifeDays)     : null,
          minStockLevel:     form.minStockLevel      ? Number(form.minStockLevel)     : null,
          maxStockLevel:     form.maxStockLevel      ? Number(form.maxStockLevel)     : null,
          reorderLevel:      form.reorderLevel       ? Number(form.reorderLevel)      : null,
          createdBy:         currentUser,
          modifiedBy:        currentUser,
        })
      });
      const d = await res.json();
      if (!res.ok) { setAlertMsg(d?.message || 'Failed to save variant.'); return; }
      load(); setForm(null);
    } catch { setAlertMsg('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="tab-section">
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
      <div className="tab-toolbar">
        <div className="tab-toolbar-left">
          <span className="tab-section-title">Variants / SKUs</span>
          <span className="tab-count-badge">{variants.length}</span>
        </div>
        {!form && <button className="tab-btn-pri" onClick={() => setForm(emptyForm())}>+ Add Variant</button>}
      </div>

      {form && (
        <div className={`tab-inline-form ${form.itemDetailId > 0 ? 'tab-form-edit' : 'tab-form-new'}`}>
          <div className="tab-form-title">{form.itemDetailId > 0 ? '✎ Edit Variant' : '+ New Variant'}</div>
          <div className="tab-form-row">
            <div className="tab-form-field tab-f-med"><label>SKU Code {isReq('skuCode') && <span className="req">*</span>}</label><input name="skuCode" className="tab-input" value={form.skuCode} onChange={handle} placeholder="e.g. ITEM-001-BLK-L" /></div>
            <div className="tab-form-field"><label>Brand</label><input name="brand" className="tab-input" value={form.brand} onChange={handle} /></div>
            <div className="tab-form-field"><label>Model</label><input name="model" className="tab-input" value={form.model} onChange={handle} /></div>
            <div className="tab-form-field tab-f-sm"><label>Colour</label><input name="colour" className="tab-input" value={form.colour} onChange={handle} /></div>
            <div className="tab-form-field tab-f-sm"><label>Size</label><input name="size" className="tab-input" value={form.size} onChange={handle} /></div>
            <div className="tab-form-field tab-f-sm"><label>Grade</label><input name="grade" className="tab-input" value={form.grade} onChange={handle} /></div>
          </div>
          <div className="tab-form-row">
            <div className="tab-form-field"><label>Supplier Part No.</label><input name="supplierPartNo" className="tab-input" value={form.supplierPartNo} onChange={handle} /></div>
            <div className="tab-form-field"><label>Manufacturer Part No.</label><input name="manufacturerPartNo" className="tab-input" value={form.manufacturerPartNo} onChange={handle} /></div>
            <div className="tab-form-field"><label>Country of Origin</label>
              <select name="countryOfOriginId" className="tab-input" value={form.countryOfOriginId} onChange={handle}>
                <option value="">-- Select --</option>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="tab-form-row">
            <div className="tab-form-field tab-f-sm"><label>Std Cost (base)</label><AmountInput name="standardCost" className="tab-input" value={form.standardCost} onChange={v => handle({ target: { name: 'standardCost', value: v } })} placeholder="0.00" /></div>
            <div className="tab-form-field tab-f-sm"><label>List Price (base)</label><AmountInput name="listPrice" className="tab-input" value={form.listPrice} onChange={v => handle({ target: { name: 'listPrice', value: v } })} placeholder="0.00" /></div>
            <div className="tab-form-field tab-f-sm"><label>Weight</label><input type="number" name="weight" className="tab-input" value={form.weight} onChange={handle} placeholder="0.00" /></div>
            <div className="tab-form-field" style={{ flex: '0 0 80px' }}><label>Wt UOM</label><input name="weightUom" className="tab-input" value={form.weightUom} onChange={handle} placeholder="kg" /></div>
            <div className="tab-form-field tab-f-sm"><label>Lead Time (days)</label><input type="number" name="leadTimeDays" className="tab-input" value={form.leadTimeDays} onChange={handle} /></div>
            <div className="tab-form-field tab-f-sm"><label>Shelf Life (days)</label><input type="number" name="shelfLifeDays" className="tab-input" value={form.shelfLifeDays} onChange={handle} /></div>
          </div>
          <div className="tab-form-row">
            <div className="tab-form-field tab-f-sm"><label>Min Stock</label><input type="number" name="minStockLevel" className="tab-input" value={form.minStockLevel} onChange={handle} placeholder="0" step="any" /></div>
            <div className="tab-form-field tab-f-sm"><label>Reorder Level</label><input type="number" name="reorderLevel" className="tab-input" value={form.reorderLevel} onChange={handle} placeholder="0" step="any" /></div>
            <div className="tab-form-field tab-f-sm"><label>Max Stock</label><input type="number" name="maxStockLevel" className="tab-input" value={form.maxStockLevel} onChange={handle} placeholder="—" step="any" /></div>
          </div>
          <div className="tab-form-row">
            <div className="tab-form-field tab-fcheck">
              <label>&nbsp;</label>
              <label className="tab-check"><input type="checkbox" name="isDefault" checked={!!form.isDefault} onChange={handle} /><span>Default Variant</span></label>
            </div>
            <div className="tab-form-field tab-fcheck">
              <label>&nbsp;</label>
              <label className="tab-check"><input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handle} /><span>Active</span></label>
            </div>
          </div>
          <div className="tab-form-actions">
            <button className="tab-btn-sec" onClick={() => setForm(null)}>Cancel</button>
            <button className={form.itemDetailId > 0 ? 'tab-btn-amber' : 'tab-btn-pri'} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : form.itemDetailId > 0 ? 'Update' : 'Add Variant'}
            </button>
          </div>
        </div>
      )}

      <div className="tab-table-wrap">
        <table className="tab-table">
          <thead><tr>
            <th>SKU</th><th>Brand / Model</th><th>Colour / Size</th>
            <th>Supplier Part</th><th style={{ textAlign:'right' }}>Std Cost</th>
            <th style={{ textAlign:'right' }}>List Price</th>
            <th>Lead (d)</th><th>Default</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {variants.length === 0
              ? <tr><td colSpan="10" className="tab-empty">No variants yet. Add the first SKU.</td></tr>
              : variants.map(v => (
                <tr key={v.itemDetailId} className={form?.itemDetailId === v.itemDetailId ? 'tab-row-editing' : ''}>
                  <td className="tab-mono">{v.skuCode || '—'}</td>
                  <td>{[v.brand, v.model].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{[v.colour, v.size].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="tab-mono">{v.supplierPartNo || '—'}</td>
                  <td style={{ textAlign:'right' }}>{v.standardCost != null ? fmt(v.standardCost) : '—'}</td>
                  <td style={{ textAlign:'right' }}>{v.listPrice    != null ? fmt(v.listPrice)    : '—'}</td>
                  <td style={{ textAlign:'right' }}>{v.leadTimeDays ?? '—'}</td>
                  <td>{v.isDefault ? <span className="tab-badge-blue">Default</span> : '—'}</td>
                  <td>{v.isActive  ? <span className="tab-badge-green">Active</span> : <span className="tab-badge-gray">Inactive</span>}</td>
                  <td className="tab-actions-cell">
                    <button className="tab-act-btn tab-act-edit"
                      onClick={() => setForm({ ...v, countryOfOriginId: v.countryOfOriginId ?? '', standardCost: v.standardCost ?? '', listPrice: v.listPrice ?? '', weight: v.weight ?? '', leadTimeDays: v.leadTimeDays ?? '', shelfLifeDays: v.shelfLifeDays ?? '', minStockLevel: v.minStockLevel ?? '', maxStockLevel: v.maxStockLevel ?? '', reorderLevel: v.reorderLevel ?? '' })}>Edit</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SPECS TAB
// ─────────────────────────────────────────────────────────────
const SpecsTab = ({ itemId }) => {
  const currentUser = useCurrentUser();
  const { isReq } = useFieldConfig('ITEM_SPEC');
  const [specs,  setSpecs]  = useState([]);
  const [form,   setForm]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const load = useCallback(() => {
    fetch(`${variables.API_URL}item/${itemId}/specs`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setSpecs(Array.isArray(d) ? d : [])).catch(console.error);
  }, [itemId]);
  useEffect(() => { load(); }, [load]);

  const emptyForm = () => ({ specId: 0, itemId, specName: '', specValue: '', specUnit: '', sortOrder: specs.length + 1 });
  const handle = (e) => { const { name, value } = e.target; setForm(p => ({ ...p, [name]: value })); };

  const save = async () => {
    if (!form.specName.trim()) { setAlertMsg('Spec Name is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${variables.API_URL}item/${itemId}/specs`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...form, sortOrder: form.sortOrder ? Number(form.sortOrder) : null, createdBy: currentUser, modifiedBy: currentUser })
      });
      const d = await res.json();
      if (!res.ok) { setAlertMsg(d?.message || 'Failed to save specification.'); return; }
      load(); setForm(null);
    } catch { setAlertMsg('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="tab-section">
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
      <div className="tab-toolbar">
        <div className="tab-toolbar-left">
          <span className="tab-section-title">Specifications</span>
          <span className="tab-count-badge">{specs.length}</span>
        </div>
        {!form && <button className="tab-btn-pri" onClick={() => setForm(emptyForm())}>+ Add Spec</button>}
      </div>

      {form && (
        <div className={`tab-inline-form ${form.specId > 0 ? 'tab-form-edit' : 'tab-form-new'}`}>
          <div className="tab-form-title">{form.specId > 0 ? '✎ Edit Spec' : '+ New Specification'}</div>
          <div className="tab-form-row">
            <div className="tab-form-field tab-f2"><label>Spec Name {isReq('specName') && <span className="req">*</span>}</label><input name="specName" className="tab-input" value={form.specName} onChange={handle} placeholder="e.g. Voltage, Diameter, Tensile Strength…" /></div>
            <div className="tab-form-field tab-f2"><label>Value</label><input name="specValue" className="tab-input" value={form.specValue} onChange={handle} placeholder="e.g. 220, 50, Grade A" /></div>
            <div className="tab-form-field tab-f-sm"><label>Unit</label><input name="specUnit" className="tab-input" value={form.specUnit} onChange={handle} placeholder="V, mm, MPa…" /></div>
            <div className="tab-form-field" style={{ flex: '0 0 90px' }}><label>Sort</label><input type="number" name="sortOrder" className="tab-input" value={form.sortOrder} onChange={handle} /></div>
          </div>
          <div className="tab-form-actions">
            <button className="tab-btn-sec" onClick={() => setForm(null)}>Cancel</button>
            <button className={form.specId > 0 ? 'tab-btn-amber' : 'tab-btn-pri'} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : form.specId > 0 ? 'Update' : 'Add Spec'}
            </button>
          </div>
        </div>
      )}

      <div className="tab-table-wrap">
        <table className="tab-table">
          <thead><tr><th>#</th><th>Specification</th><th>Value</th><th>Unit</th><th>Actions</th></tr></thead>
          <tbody>
            {specs.length === 0
              ? <tr><td colSpan="5" className="tab-empty">No specifications yet.</td></tr>
              : specs.map((s, i) => (
                <tr key={s.specId} className={form?.specId === s.specId ? 'tab-row-editing' : ''}>
                  <td style={{ color:'#94a3b8', width:36 }}>{i + 1}</td>
                  <td style={{ fontWeight:500 }}>{s.specName}</td>
                  <td>{s.specValue || '—'}</td>
                  <td><span className="tab-badge-blue">{s.specUnit || '—'}</span></td>
                  <td className="tab-actions-cell">
                    <button className="tab-act-btn tab-act-edit" onClick={() => setForm({ ...s })}>Edit</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// UOM CONVERSIONS TAB
// ─────────────────────────────────────────────────────────────
const UomTab = ({ itemId }) => {
  const currentUser = useCurrentUser();
  const { isReq } = useFieldConfig('ITEM_CONVERSION');
  const [conversions, setConversions] = useState([]);
  const [uoms,        setUoms]        = useState([]);
  const [form,        setForm]        = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [alertMsg,    setAlertMsg]    = useState(null);

  const load = useCallback(() => {
    fetch(`${variables.API_URL}item/${itemId}/uom-conversions`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setConversions(Array.isArray(d) ? d : [])).catch(console.error);
  }, [itemId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`${variables.API_URL}item/uoms`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setUoms(Array.isArray(d) ? d : [])).catch(console.error);
  }, []);

  const emptyForm = () => ({ conversionId: 0, itemId, fromUomId: '', toUomId: '', conversionFactor: '', isActive: true });
  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const save = async () => {
    if (!form.fromUomId || !form.toUomId) { setAlertMsg('Both UOMs are required.'); return; }
    if (!form.conversionFactor)           { setAlertMsg('Conversion Factor is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${variables.API_URL}item/${itemId}/uom-conversions`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...form, fromUomId: Number(form.fromUomId), toUomId: Number(form.toUomId), conversionFactor: Number(form.conversionFactor), createdBy: currentUser, modifiedBy: currentUser })
      });
      const d = await res.json();
      if (!res.ok) { setAlertMsg(d?.message || 'Failed to save UOM conversion.'); return; }
      load(); setForm(null);
    } catch { setAlertMsg('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="tab-section">
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
      <div className="tab-toolbar">
        <div className="tab-toolbar-left">
          <span className="tab-section-title">UOM Conversions</span>
          <span className="tab-count-badge">{conversions.length}</span>
        </div>
        {!form && <button className="tab-btn-pri" onClick={() => setForm(emptyForm())}>+ Add Conversion</button>}
      </div>

      {form && (
        <div className={`tab-inline-form ${form.conversionId > 0 ? 'tab-form-edit' : 'tab-form-new'}`}>
          <div className="tab-form-title">{form.conversionId > 0 ? '✎ Edit Conversion' : '+ New Conversion'}</div>
          <div className="tab-form-row">
            <div className="tab-form-field"><label>From UOM {isReq('fromUomId') && <span className="req">*</span>}</label>
              <select name="fromUomId" className="tab-input" value={form.fromUomId} onChange={handle}>
                <option value="">-- Select --</option>
                {uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}
              </select>
            </div>
            <div className="tab-form-field tab-f-sm"><label>Factor {isReq('conversionFactor') && <span className="req">*</span>}</label>
              <input type="number" name="conversionFactor" className="tab-input" value={form.conversionFactor} onChange={handle} placeholder="e.g. 12" step="any" />
            </div>
            <div className="tab-form-field"><label>To UOM {isReq('toUomId') && <span className="req">*</span>}</label>
              <select name="toUomId" className="tab-input" value={form.toUomId} onChange={handle}>
                <option value="">-- Select --</option>
                {uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}
              </select>
            </div>
            <div className="tab-form-field tab-fcheck">
              <label>&nbsp;</label>
              <label className="tab-check"><input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handle} /><span>Active</span></label>
            </div>
          </div>
          <div className="tab-form-actions">
            <button className="tab-btn-sec" onClick={() => setForm(null)}>Cancel</button>
            <button className={form.conversionId > 0 ? 'tab-btn-amber' : 'tab-btn-pri'} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : form.conversionId > 0 ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      <div className="tab-table-wrap">
        <table className="tab-table">
          <thead><tr><th>From</th><th style={{ textAlign:'center' }}>Factor</th><th>To</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {conversions.length === 0
              ? <tr><td colSpan="5" className="tab-empty">No UOM conversions defined.</td></tr>
              : conversions.map(c => (
                <tr key={c.conversionId} className={form?.conversionId === c.conversionId ? 'tab-row-editing' : ''}>
                  <td><span className="tab-badge-blue">{c.fromUomCode}</span> <span style={{ color:'#94a3b8', fontSize:11 }}>{c.fromUomName}</span></td>
                  <td style={{ textAlign:'center', fontWeight:700, fontFamily:'monospace' }}>× {c.conversionFactor}</td>
                  <td><span className="tab-badge-blue">{c.toUomCode}</span> <span style={{ color:'#94a3b8', fontSize:11 }}>{c.toUomName}</span></td>
                  <td>{c.isActive ? <span className="tab-badge-green">Active</span> : <span className="tab-badge-gray">Inactive</span>}</td>
                  <td className="tab-actions-cell">
                    <button className="tab-act-btn tab-act-edit" onClick={() => setForm({ ...c, fromUomId: String(c.fromUomId), toUomId: String(c.toUomId) })}>Edit</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// EDIT SLIDE-OVER
// ─────────────────────────────────────────────────────────────
const ItemEditSlideOver = ({ item, categories, itemTypes, uoms, budgetCategories = [], onClose, onSaved }) => {
  const currentUser = useCurrentUser();
  const { isReq: isReqItem } = useFieldConfig('ITEM');
  const [form,   setForm]   = useState({ ...item, categoryId: item.categoryId ?? '', itemTypeId: item.itemTypeId ?? '', baseUomId: item.baseUomId ?? '', purchaseUomId: item.purchaseUomId ?? '', salesUomId: item.salesUomId ?? '', budgetCategoryId: item.budgetCategoryId ?? '' });
  const [saving, setSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const handle = (e) => { const { name, value, type, checked } = e.target; setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value })); };

  const parentCats = categories.filter(c => !c.parentCategoryId);

  // Derive the parent category from the item's assigned category on init
  const initParent = () => {
    if (!item.categoryId) return '';
    const cat = categories.find(c => c.categoryId === item.categoryId);
    if (!cat) return '';
    return cat.parentCategoryId ? String(cat.parentCategoryId) : String(cat.categoryId);
  };
  const [parentCatId, setParentCatId] = useState(initParent);
  const subCats = parentCatId
    ? categories.filter(c => String(c.parentCategoryId) === String(parentCatId))
    : [];

  const handleParentCat = (e) => {
    setParentCatId(e.target.value);
    setForm(p => ({ ...p, categoryId: '' }));
  };

  const save = async () => {
    if (!form.itemName.trim()) { setAlertMsg('Item Name is required.'); return; }
    if (!form.itemTypeId)      { setAlertMsg('Item Type is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${variables.API_URL}item/save`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...form, categoryId: form.categoryId ? Number(form.categoryId) : null, itemTypeId: form.itemTypeId ? Number(form.itemTypeId) : null, baseUomId: form.baseUomId ? Number(form.baseUomId) : null, purchaseUomId: form.purchaseUomId ? Number(form.purchaseUomId) : null, salesUomId: form.salesUomId ? Number(form.salesUomId) : null, budgetCategoryId: form.budgetCategoryId ? Number(form.budgetCategoryId) : null, modifiedBy: currentUser })
      });
      const d = await res.json();
      if (!res.ok) { setAlertMsg(d?.message || 'Failed to save item.'); return; }
      onSaved();
    } catch { setAlertMsg('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  const Sec = ({ label }) => <div className="jf-section"><span className="jf-section-label">{label}</span><div className="jf-section-line" /></div>;

  return (
    <div className="jf-overlay">
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
      <div className="jf-panel" onClick={e => e.stopPropagation()}>
        <div className="jf-header">
          <div><div className="jf-header-title">Edit Item — {item.itemCode || `#${item.itemId}`}</div><div className="jf-header-sub">Update item information</div></div>
          <button className="jf-close" onClick={onClose}>✕</button>
        </div>
        <div className="jf-body">
          <Sec label="Identity" />
          <div className="jf-row">
            <div className="jf-field" style={{ flex:'0 0 150px' }}><label>Item Code</label><input name="itemCode" className="jf-input" value={form.itemCode || ''} onChange={handle} /></div>
            <div className="jf-field jf-f2"><label>Item Name {isReqItem('itemName') && <span className="req">*</span>}</label><input name="itemName" className="jf-input" value={form.itemName} onChange={handle} /></div>
            <div className="jf-field jf-f2"><label>Arabic Name</label><input name="itemNameAr" className="jf-input" value={form.itemNameAr || ''} onChange={handle} dir="rtl" /></div>
          </div>
          <div className="jf-row">
            <div className="jf-field" style={{ flex:1 }}><label>Short Description</label><textarea name="shortDescription" className="jf-input jf-textarea" rows={2} value={form.shortDescription || ''} onChange={handle} /></div>
          </div>
          <Sec label="Classification" />
          <div className="jf-row">
            <div className="jf-field"><label>Item Type <span className="req">*</span></label><select name="itemTypeId" className="jf-input" value={form.itemTypeId} onChange={handle}><option value="">-- Select --</option>{itemTypes.map(t => <option key={t.itemTypeId} value={t.itemTypeId}>{t.typeName}</option>)}</select></div>
            <div className="jf-field"><label>Category</label><select className="jf-input" value={parentCatId} onChange={handleParentCat}><option value="">-- Select --</option>{parentCats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}</select></div>
            <div className="jf-field"><label>Sub-Category</label><select name="categoryId" className="jf-input" value={form.categoryId} onChange={handle} disabled={!parentCatId || subCats.length === 0}><option value="">{!parentCatId ? '— select category first —' : subCats.length === 0 ? '— no sub-categories —' : '-- Select --'}</option>{subCats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}</select></div>
          </div>
          <div className="jf-row">
            <div className="jf-field"><label>Budget Header</label><select name="budgetCategoryId" className="jf-input" value={form.budgetCategoryId} onChange={handle}><option value="">-- Select --</option>{budgetCategories.map(b => <option key={b.id} value={b.id}>{b.code ? `${b.code} — ` : ''}{b.name}</option>)}</select></div>
          </div>
          <Sec label="Units of Measure" />
          <div className="jf-row">
            <div className="jf-field"><label>Base UOM</label><select name="baseUomId" className="jf-input" value={form.baseUomId} onChange={handle}><option value="">-- Select --</option>{uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}</select></div>
            <div className="jf-field"><label>Purchase UOM</label><select name="purchaseUomId" className="jf-input" value={form.purchaseUomId} onChange={handle}><option value="">-- Select --</option>{uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}</select></div>
            <div className="jf-field"><label>Sales UOM</label><select name="salesUomId" className="jf-input" value={form.salesUomId} onChange={handle}><option value="">-- Select --</option>{uoms.map(u => <option key={u.uomId} value={u.uomId}>{u.uomCode} – {u.uomName}</option>)}</select></div>
          </div>
          <Sec label="Identifiers" />
          <div className="jf-row">
            <div className="jf-field"><label>Barcode</label><input name="barcode" className="jf-input" value={form.barcode || ''} onChange={handle} /></div>
            <div className="jf-field"><label>HS Code</label><input name="hsCode" className="jf-input" value={form.hsCode || ''} onChange={handle} /></div>
          </div>
          <Sec label="Flags" />
          <div className="jf-check-row">
            <label className="tab-check"><input type="checkbox" name="isStockable"   checked={!!form.isStockable}   onChange={handle} /><span>Stockable</span></label>
            <label className="tab-check"><input type="checkbox" name="isSaleable"    checked={!!form.isSaleable}    onChange={handle} /><span>Saleable</span></label>
            <label className="tab-check"><input type="checkbox" name="isPurchasable" checked={!!form.isPurchasable} onChange={handle} /><span>Purchasable</span></label>
            <label className="tab-check"><input type="checkbox" name="isActive"      checked={!!form.isActive}      onChange={handle} /><span>Active</span></label>
          </div>
        </div>
        <div className="jf-footer">
          <button className="jf-btn-sec" onClick={onClose}>Cancel</button>
          <button className="jf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update Item'}</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ITEM DETAIL PAGE
// ─────────────────────────────────────────────────────────────
const ItemDetailPage = () => {
  const { itemId }    = useParams();
  const navigate      = useNavigate();
  const [item,        setItem]      = useState(null);
  const [loading,     setLoading]   = useState(true);
  const [activeTab,   setActiveTab] = useState('overview');
  const [categories,  setCategories]= useState([]);
  const [itemTypes,   setItemTypes] = useState([]);
  const [uoms,        setUoms]      = useState([]);
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [showEdit,    setShowEdit]  = useState(false);

  const loadItem = useCallback(() => {
    setLoading(true);
    fetch(`${variables.API_URL}item/${encodeURIComponent(itemId)}`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(d => setItem(d))
      .catch(() => navigate('/items'))
      .finally(() => setLoading(false));
  }, [itemId, navigate]);

  useEffect(() => { loadItem(); }, [loadItem]);
  useEffect(() => {
    fetch(`${variables.API_URL}item/types`,      { headers: authHeaders() }).then(r => r.json()).then(d => setItemTypes(Array.isArray(d)  ? d : [])).catch(console.error);
    fetch(`${variables.API_URL}item/categories`, { headers: authHeaders() }).then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : [])).catch(console.error);
    fetch(`${variables.API_URL}item/uoms`,       { headers: authHeaders() }).then(r => r.json()).then(d => setUoms(Array.isArray(d)       ? d : [])).catch(console.error);
    fetch(`${variables.API_URL}Lookup/budgetcategories`, { headers: authHeaders() }).then(r => r.json()).then(d => setBudgetCategories(Array.isArray(d) ? d : [])).catch(console.error);
  }, []);

  const renderTab = () => {
    if (!item) return null;
    switch (activeTab) {
      case 'overview': return <OverviewTab item={item} />;
      case 'variants': return <VariantsTab itemId={item.itemId} />;
      case 'specs':    return <SpecsTab    itemId={item.itemId} />;
      case 'uom':      return <UomTab      itemId={item.itemId} />;
      default:         return null;
    }
  };

  if (loading) return <div className="jd-page-loading"><div className="jd-page-spinner" /><span>Loading item…</span></div>;
  if (!item)   return null;

  return (
    <div className="jd-page">

      {/* HEADER */}
      <div className="jd-header">
        <div className="jd-header-left">
          <button className="jd-back-btn" onClick={() => navigate('/items')}>← Items</button>
          <div className="jd-header-sep" />
          <div className="jd-header-id">{item.itemCode || `#${item.itemId}`}</div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span className="jd-header-customer">{item.itemName}</span>
            {item.itemTypeName && <><span className="jd-header-dot">·</span><span className="jd-header-type">{item.itemTypeName}</span></>}
          </div>
        </div>
        <div className="jd-header-right">
          <button className="jd-edit-btn" onClick={() => setShowEdit(true)}>✏️ Edit Item</button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="jd-kpi-strip">
        {[
          { label: 'Category',  val: item.categoryName   || '—', cls: '' },
          { label: 'Base UOM',  val: item.baseUomName    || '—', cls: '' },
          { label: 'Barcode',   val: item.barcode        || '—', cls: 'jd-kpi-blue' },
          { label: 'HS Code',   val: item.hsCode         || '—', cls: '' },
        ].map((k, i) => (
          <React.Fragment key={k.label}>
            {i > 0 && <div className="jd-kpi-div" />}
            <div className="jd-kpi">
              <div className="jd-kpi-label">{k.label}</div>
              <div className={`jd-kpi-val ${k.cls}`}>{k.val}</div>
            </div>
          </React.Fragment>
        ))}
        <div className="jd-kpi-div" />
        <div className="jd-kpi">
          <div className="jd-kpi-label">Flags</div>
          <div className="itd-flag-row">
            {item.isStockable   && <span className="itd-flag itd-flag-yes">📦 Stock</span>}
            {item.isSaleable    && <span className="itd-flag itd-flag-yes">💰 Sale</span>}
            {item.isPurchasable && <span className="itd-flag itd-flag-yes">🛒 Buy</span>}
            {!item.isActive     && <span className="itd-flag itd-flag-no">Inactive</span>}
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="jd-tabs-bar">
        {ITEM_TABS.map(t => (
          <button key={t.key}
            className={`jd-tab-btn ${activeTab === t.key ? 'jd-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key)}>
            <span className="jd-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div className="jd-tab-content">{renderTab()}</div>

      {/* EDIT SLIDE-OVER */}
      {showEdit && (
        <ItemEditSlideOver
          item={item} categories={categories} itemTypes={itemTypes} uoms={uoms} budgetCategories={budgetCategories}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadItem(); }}
        />
      )}
    </div>
  );
};

export default ItemDetailPage;
