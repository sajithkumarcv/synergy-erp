import React from 'react';

/**
 * Per-column filter boxes that sit in a second header row of a list grid.
 *
 *   <thead>
 *     <tr>{…sortable column headers…}</tr>
 *     <tr className="grid-colfilter-row">
 *       <ColFilter value={colF.jobId} onChange={v => setColF(p => ({ ...p, jobId: v }))} placeholder="Job no." />
 *       <th />                                    ← columns with no filter
 *       …
 *     </tr>
 *   </thead>
 *
 * IMPORTANT — these narrow the rows already on screen, nothing more. Every
 * list grid here is server-paged, so a column filter searches the current
 * page only; a match sitting on page 3 will not appear. The sidebar filter
 * panel is the one that queries the whole table. Pages using this should say
 * so in the record count (see `matchNote`).
 */

const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '3px 6px',
    fontSize: 11.5,
    color: '#1e293b',
    border: '1px solid #cbd5e1',
    borderRadius: 4,
    background: '#fff',
    outline: 'none',
};

export const ColFilter = ({ value, onChange, placeholder, style }) => (
    <th style={{ padding: '4px 6px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', ...style }}>
        <div style={{ position: 'relative' }}>
            <input
                type="text"
                value={value}
                placeholder={placeholder || 'Filter…'}
                onChange={e => onChange(e.target.value)}
                style={{ ...inputStyle, paddingRight: value ? 18 : 6 }}
                onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
                onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
            />
            {value && (
                <span
                    onClick={() => onChange('')}
                    title="Clear"
                    style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
                             cursor: 'pointer', color: '#94a3b8', fontSize: 13, lineHeight: 1 }}>
                    ×
                </span>
            )}
        </div>
    </th>
);

/** Case-insensitive "contains" across every non-empty filter (AND). */
export const applyColFilters = (rows, filters) =>
    Object.entries(filters)
        .filter(([, v]) => (v || '').trim())
        .reduce((acc, [key, v]) => {
            const needle = v.trim().toLowerCase();
            return acc.filter(r => String(r[key] ?? '').toLowerCase().includes(needle));
        }, rows);

export const hasColFilters = (filters) => Object.values(filters).some(v => (v || '').trim());

/**
 * Count suffix that keeps the header honest: the grid's headline number is the
 * server-side total, which a page-local filter does not change.
 */
export const matchNote = (filters, shownCount, pageCount) =>
    hasColFilters(filters)
        ? ` · showing ${shownCount} of ${pageCount} on this page`
        : '';
