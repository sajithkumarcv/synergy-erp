import React, { useState, useEffect, useRef } from 'react';
import { authHeaders } from '../Variable';

// ── LookupSelect ─────────────────────────────────────────────────────────────
// The searchable dropdown used for master-data pickers (job, supplier,
// customer, …). Replaces the type-blind live-search that every form used to
// copy-paste: clicking the field opens the list, typing filters it.
//
// The list opens on click because the search endpoints treat a blank searchText
// as "no filter" and return the first page — so the field can be browsed by
// someone who doesn't already know the code they're looking for.
//
// Usage:
//   <LookupSelect
//       value={form.supplierId}
//       label={form.supplierLabel}
//       placeholder="Select or type to search supplier…"
//       error={errors.supplierId}
//       tone="green"
//       buildUrl={t => `${variables.API_URL}supplier/search?searchText=${encodeURIComponent(t)}&pageSize=25&page=1`}
//       itemKey={s => s.supplierId}
//       renderItem={s => <><strong>{s.supplierCode}</strong> — {s.supplierName}</>}
//       onSelect={s => { … }}
//       onClear={() => { … }}
//   />
//
const TONES = {
    blue:  { background: '#f0f9ff', color: '#1e40af' },
    green: { background: '#f0fdf4', color: '#166534' },
};

const dropStyle = {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
    background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto',
};
const dropItem = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

const LookupSelect = ({
    value,
    label,
    buildUrl,
    renderItem,
    itemKey,
    onSelect,
    onClear,
    placeholder = 'Select or type to search…',
    error,
    tone = 'blue',
    disabled = false,
    debounceMs = 280,
    autoFocus = false,
}) => {
    const [search,  setSearch]  = useState('');
    const [results, setResults] = useState([]);
    const [open,    setOpen]    = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        const onDown = e => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    useEffect(() => {
        if (!open || disabled) return;
        // Debounce keystrokes, but open instantly — waiting 280ms to show a list
        // the user just clicked for reads as lag.
        const typing = search.trim().length > 0;
        const t = setTimeout(() => {
            fetch(buildUrl(search.trim()), { headers: authHeaders() })
                .then(r => (r.ok ? r.json() : null))
                // Endpoints are inconsistent: some return {data:[…]}, some a bare array.
                .then(d => setResults(Array.isArray(d) ? d : (d?.data || [])))
                .catch(console.error);
        }, typing ? debounceMs : 0);
        return () => clearTimeout(t);
        // buildUrl is excluded on purpose: callers pass an inline arrow, so a new
        // identity every render would refetch in a loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, open, disabled, debounceMs]);

    const pick = (item) => {
        setSearch(''); setResults([]); setOpen(false);
        onSelect(item);
    };

    if (value) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pf-input" style={{ ...TONES[tone], fontWeight: 500, flex: 1 }}>✓ {label}</span>
                <button type="button" onClick={() => { setSearch(''); setResults([]); onClear(); }}
                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px',
                             cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative' }} ref={boxRef}>
            <input className={`pf-input${error ? ' pf-input-err' : ''}`}
                value={search}
                disabled={disabled}
                autoFocus={autoFocus}
                onChange={e => { setSearch(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                placeholder={placeholder} autoComplete="off" />
            {open && results.length > 0 && (
                <div style={dropStyle}>
                    {results.map(item => (
                        <div key={itemKey(item)} style={dropItem}
                            onClick={() => pick(item)}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            {renderItem(item)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LookupSelect;
