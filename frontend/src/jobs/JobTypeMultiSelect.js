import React, { useState, useEffect, useRef } from 'react';

// Searchable multiselect with a chip-based collapsed view and an "All"
// toggle in the open panel — value/onChange work in comma-joined-string
// terms, same convention as every other multiselect in this app.
// `options` uses the same {value, label} shape as every other filter
// definition's `options` array (matches def.options in FilterContext-driven
// pages), so this can be used both standalone and as the shared FilterPanel's
// 'chip-multiselect' field type (see Layout.js) — not just for Job Type,
// despite the name (kept for now since that's the only field using it so far).
const JobTypeMultiSelect = ({ options, value, onChange, placeholder = 'Select…', allLabel = 'All Types' }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrap = useRef(null);

    useEffect(() => {
        const handler = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const opts = options || [];
    const selectedIds = (value || '').split(',').filter(Boolean);
    const selectedSet = new Set(selectedIds);

    const needle   = search.trim().toLowerCase();
    const filtered = needle ? opts.filter(o => o.label.toLowerCase().includes(needle)) : opts;
    const filteredAllSelected = filtered.length > 0 && filtered.every(o => selectedSet.has(o.value));
    const allSelected = opts.length > 0 && selectedIds.length === opts.length;

    const toggle = (id) => {
        const next = selectedSet.has(id) ? selectedIds.filter(v => v !== id) : [...selectedIds, id];
        onChange(next.join(','));
    };
    const toggleAll = () => {
        if (filteredAllSelected) {
            const filteredIds = new Set(filtered.map(o => o.value));
            onChange(selectedIds.filter(id => !filteredIds.has(id)).join(','));
        } else {
            onChange(Array.from(new Set([...selectedIds, ...filtered.map(o => o.value)])).join(','));
        }
    };
    const remove = (id, e) => { e.stopPropagation(); onChange(selectedIds.filter(v => v !== id).join(',')); };

    // Chips when a few are picked; a plain count once it'd get cluttered;
    // allLabel when every option is selected.
    let label = null;
    if (opts.length === 0) label = '—';
    else if (selectedIds.length === 0) label = placeholder;
    else if (allSelected) label = allLabel;
    else if (selectedIds.length > 3) label = `${selectedIds.length} selected`;

    return (
        <div ref={wrap} style={{ position: 'relative' }}>
            <div onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 190, maxWidth: 340,
                         padding: '4px 8px', border: `1px solid ${selectedIds.length ? '#93c5fd' : '#d1d5db'}`, borderRadius: 6,
                         background: '#fff', cursor: 'pointer', height: 32, boxSizing: 'border-box', fontSize: 13 }}>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', overflow: 'hidden' }}>
                    {label
                        ? <span style={{ color: selectedIds.length ? '#1d4ed8' : '#94a3b8', fontWeight: selectedIds.length ? 600 : 400 }}>{label}</span>
                        : selectedIds.map(id => {
                            const o = opts.find(x => x.value === id);
                            return (
                                <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#e2e8f0', color: '#334155', borderRadius: 4, padding: '2px 6px', fontSize: 12, whiteSpace: 'nowrap' }}>
                                    {o?.label || id}
                                    <span onClick={e => remove(id, e)} style={{ cursor: 'pointer', color: '#64748b', fontWeight: 700 }}>✕</span>
                                </span>
                            );
                        })}
                </div>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>▾</span>
            </div>
            {open && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 2, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.1)', minWidth: 230, maxHeight: 320, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search…"
                        style={{ margin: 8, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12.5, outline: 'none' }} />
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>
                            <input type="checkbox" checked={filteredAllSelected} onChange={toggleAll} />
                            All
                        </label>
                        {filtered.map(o => (
                            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
                                <input type="checkbox" checked={selectedSet.has(o.value)} onChange={() => toggle(o.value)} />
                                {o.label}
                            </label>
                        ))}
                        {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>No matches.</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default JobTypeMultiSelect;
