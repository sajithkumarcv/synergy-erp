import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { usePermission } from '../../../PermissionContext';
import ConfirmModal from '../../../common/ConfirmModal';
import { fmt, fmtDate } from '../../procurementConstants';
import AlertModal from '../../../common/AlertModal';
import AmountInput from '../../../common/AmountInput';

// ── SRV Lines Import Modal — parallel to GrnImportModal ──────────────
const SrvImportModal = ({ invoice, onClose, onImported }) => {
    const [srvs,        setSrvs]        = useState([]);
    const [srvsLoading, setSrvsLoading] = useState(true);
    const [selectedSrv, setSelectedSrv] = useState(null);
    const [srvLines,    setSrvLines]    = useState([]);
    const [linesLoading, setLinesLoading] = useState(false);
    const [selected,    setSelected]    = useState({});
    const [qtyMap,      setQtyMap]      = useState({});
    const [priceMap,    setPriceMap]    = useState({});
    const [importing,   setImporting]   = useState(false);
    const [error,       setError]       = useState('');

    useEffect(() => {
        setSrvsLoading(true);
        fetch(`${variables.API_URL}supplierinvoice/srvs/${invoice.supplierId}`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setSrvs(Array.isArray(d) ? d : []))
            .catch(() => setError('Failed to load SRVs.'))
            .finally(() => setSrvsLoading(false));
    }, [invoice.supplierId]);

    const selectSrv = (srv) => {
        setSelectedSrv(srv);
        setSrvLines([]); setSelected({}); setQtyMap({}); setPriceMap({});
        setLinesLoading(true);
        fetch(`${variables.API_URL}supplierinvoice/srvlines/${srv.srvId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(rows => {
                const list = Array.isArray(rows) ? rows : [];
                setSrvLines(list);
                const sel = {}, qty = {}, price = {};
                list.forEach(l => {
                    sel[l.srvLineId]   = true;
                    qty[l.srvLineId]   = String(l.pendingQty);
                    price[l.srvLineId] = String(l.unitPrice);
                });
                setSelected(sel); setQtyMap(qty); setPriceMap(price);
            })
            .catch(() => setError('Failed to load SRV lines.'))
            .finally(() => setLinesLoading(false));
    };

    const toggle    = id => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const allOn = srvLines.every(l => selected[l.srvLineId]);
        const next  = {};
        srvLines.forEach(l => { next[l.srvLineId] = !allOn; });
        setSelected(p => ({ ...p, ...next }));
    };

    const doImport = async () => {
        const toImport = srvLines.filter(l => selected[l.srvLineId]);
        if (toImport.length === 0) { setError('No lines selected.'); return; }
        const invalid = toImport.filter(l =>
            !qtyMap[l.srvLineId] || isNaN(Number(qtyMap[l.srvLineId])) || Number(qtyMap[l.srvLineId]) <= 0);
        if (invalid.length > 0) { setError('All selected lines must have quantity > 0.'); return; }
        const overQty = toImport.filter(l => Number(qtyMap[l.srvLineId]) > l.pendingQty);
        if (overQty.length > 0) {
            setError(`Qty cannot exceed pending qty for: ${overQty.map(l => l.itemCode || l.itemDesc).join(', ')}`);
            return;
        }
        setImporting(true); setError('');
        let lineNum = (invoice.lines?.length || 0) + 1;
        try {
            for (const l of toImport) {
                const body = {
                    supplierInvLineId: 0,
                    supplierInvoiceId: invoice.supplierInvoiceId,
                    lineNum:           lineNum++,
                    grnDetailId:       null,
                    grnId:             null,
                    srvId:             l.srvId,
                    srvLineId:         l.srvLineId,
                    poLineId:          l.poLineId || null,
                    itemId:            l.itemId   || null,
                    itemCode:          l.itemCode || null,
                    itemDesc:          l.itemDesc || null,
                    uomName:           l.uomName  || null,
                    qty:               Number(qtyMap[l.srvLineId]),
                    unitPrice:         Number(priceMap[l.srvLineId]),
                    taxPct:            l.taxPct || 0,
                    notes:             null,
                };
                const r = await fetch(`${variables.API_URL}supplierinvoice/saveline`, {
                    method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
                });
                if (!r.ok) { const d = await r.json(); throw new Error(d.message || 'Save line failed.'); }
            }
            onImported();
        } catch (e) { setError(e.message); }
        finally { setImporting(false); }
    };

    const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1100,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 };
    const panel   = { background:'#fff', borderRadius:10, width:980, maxWidth:'100%',
        boxShadow:'0 12px 40px rgba(0,0,0,.22)', display:'flex', flexDirection:'column', maxHeight:'88vh' };

    return (
        <div style={overlay}>
            <div style={panel}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontWeight:700, fontSize:15, color:'#1e293b' }}>Import from Service Receipt (SRV)</div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#64748b' }}>✕</button>
                </div>
                <div style={{ overflowY:'auto', flex:1, padding:'16px 20px' }}>
                    {error && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6, padding:'8px 12px', fontSize:12.5, marginBottom:12 }}>⚠ {error}</div>}
                    <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>1) Pick an SRV</div>
                    {srvsLoading ? <div style={{ color:'#94a3b8', fontSize:13 }}>Loading SRVs…</div>
                     : srvs.length === 0 ? <div style={{ color:'#94a3b8', fontSize:13 }}>No SRVs with uninvoiced quantity for this supplier.</div>
                     : (
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, marginBottom:14 }}>
                            <thead><tr style={{ background:'#f8fafc' }}>
                                <th style={{ padding:'7px 10px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>SRV No</th>
                                <th style={{ padding:'7px 10px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Date</th>
                                <th style={{ padding:'7px 10px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>PO</th>
                                <th style={{ padding:'7px 10px', textAlign:'right', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Total</th>
                                <th style={{ width:60, borderBottom:'2px solid #e2e8f0' }} />
                            </tr></thead>
                            <tbody>
                                {srvs.map(s => (
                                    <tr key={s.srvId} style={{ background: selectedSrv?.srvId === s.srvId ? '#eff6ff' : 'transparent', borderBottom:'1px solid #f1f5f9' }}>
                                        <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:600, color:'#1e293b' }}>{s.srvNumber}</td>
                                        <td style={{ padding:'7px 10px', color:'#334155' }}>{fmtDate(s.srvDate)}</td>
                                        <td style={{ padding:'7px 10px', fontFamily:'monospace', color:'#475569' }}>{s.poNumber || '—'}</td>
                                        <td style={{ padding:'7px 10px', textAlign:'right', color:'#334155' }}>{fmt(s.totalAmount)}</td>
                                        <td style={{ padding:'7px 10px' }}>
                                            <button onClick={() => selectSrv(s)} style={{ padding:'4px 10px', fontSize:11, border:'1px solid #cbd5e1', background:'#fff', color:'#334155', borderRadius:4, cursor:'pointer' }}>Pick</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {selectedSrv && (
                        <>
                            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6, marginTop:8 }}>
                                2) Select lines from {selectedSrv.srvNumber}
                            </div>
                            {linesLoading ? <div style={{ color:'#94a3b8', fontSize:13 }}>Loading lines…</div>
                             : srvLines.length === 0 ? <div style={{ color:'#94a3b8', fontSize:13 }}>No uninvoiced lines on this SRV.</div>
                             : (
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                                    <thead><tr style={{ background:'#f8fafc' }}>
                                        <th style={{ padding:'7px 10px', borderBottom:'2px solid #e2e8f0' }}>
                                            <input type="checkbox" onChange={toggleAll}
                                                checked={srvLines.length > 0 && srvLines.every(l => selected[l.srvLineId])} />
                                        </th>
                                        <th style={{ padding:'7px 10px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Item</th>
                                        <th style={{ padding:'7px 10px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>PO</th>
                                        <th style={{ padding:'7px 10px', textAlign:'right', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Pending</th>
                                        <th style={{ padding:'7px 10px', textAlign:'right', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Qty to invoice</th>
                                        <th style={{ padding:'7px 10px', textAlign:'right', fontSize:11, fontWeight:600, color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Unit Price</th>
                                    </tr></thead>
                                    <tbody>
                                        {srvLines.map(l => (
                                            <tr key={l.srvLineId} style={{ borderBottom:'1px solid #f1f5f9' }}>
                                                <td style={{ padding:'7px 10px', textAlign:'center' }}>
                                                    <input type="checkbox" checked={!!selected[l.srvLineId]} onChange={() => toggle(l.srvLineId)} />
                                                </td>
                                                <td style={{ padding:'7px 10px' }}>
                                                    <div style={{ fontWeight:600, color:'#1e293b' }}>{l.itemCode || '—'}</div>
                                                    <div style={{ fontSize:11, color:'#64748b' }}>{l.itemDesc}</div>
                                                </td>
                                                <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:11, color:'#475569' }}>{l.poNumber || '—'}</td>
                                                <td style={{ padding:'7px 10px', textAlign:'right', color:'#334155' }}>{fmt(l.pendingQty)}</td>
                                                <td style={{ padding:'7px 10px', textAlign:'right' }}>
                                                    <input type="number" min="0" step="0.01" style={{ width:90, padding:'4px 6px', fontSize:12, border:'1px solid #e2e8f0', borderRadius:4, textAlign:'right' }}
                                                        value={qtyMap[l.srvLineId] ?? ''}
                                                        onChange={e => setQtyMap(p => ({ ...p, [l.srvLineId]: e.target.value }))} />
                                                </td>
                                                <td style={{ padding:'7px 10px', textAlign:'right' }}>
                                                    <AmountInput style={{ width:100, padding:'4px 6px', fontSize:12, border:'1px solid #e2e8f0', borderRadius:4 }}
                                                        value={priceMap[l.srvLineId] ?? ''}
                                                        onChange={v => setPriceMap(p => ({ ...p, [l.srvLineId]: v }))} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
                <div style={{ padding:'12px 20px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'flex-end', gap:8 }}>
                    <button className="pf-btn-sec" onClick={onClose} disabled={importing}>Cancel</button>
                    <button className="pf-btn-pri" onClick={doImport} disabled={importing || !selectedSrv || srvLines.length === 0}>
                        {importing ? 'Importing…' : `Import selected lines`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── GRN Lines Import Modal ────────────────────────────────────────────
const GrnImportModal = ({ invoice, onClose, onImported }) => {
    const [grns,        setGrns]        = useState([]);
    const [grnsLoading, setGrnsLoading] = useState(true);
    const [selectedGrn, setSelectedGrn] = useState(null);

    const [grnLines,     setGrnLines]     = useState([]);
    const [linesLoading, setLinesLoading] = useState(false);
    const [selected,     setSelected]     = useState({});
    const [qtyMap,       setQtyMap]       = useState({});
    const [priceMap,     setPriceMap]     = useState({});

    const [importing, setImporting] = useState(false);
    const [error,     setError]     = useState('');

    // Load pending GRNs for this supplier
    useEffect(() => {
        setGrnsLoading(true);
        fetch(`${variables.API_URL}supplierinvoice/grns/${invoice.supplierId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setGrns(Array.isArray(d) ? d : []))
            .catch(() => setError('Failed to load GRNs.'))
            .finally(() => setGrnsLoading(false));
    }, [invoice.supplierId]);

    // Load lines when a GRN is selected
    const selectGrn = (grn) => {
        setSelectedGrn(grn);
        setGrnLines([]); setSelected({}); setQtyMap({}); setPriceMap({});
        setLinesLoading(true);
        fetch(`${variables.API_URL}supplierinvoice/grnlines/${grn.grnId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(rows => {
                const list = Array.isArray(rows) ? rows : [];
                setGrnLines(list);
                const sel = {}, qty = {}, price = {};
                list.forEach(l => {
                    sel[l.grnDetailId]   = true;
                    qty[l.grnDetailId]   = String(l.pendingQty);
                    price[l.grnDetailId] = String(l.unitPrice);
                });
                setSelected(sel); setQtyMap(qty); setPriceMap(price);
            })
            .catch(() => setError('Failed to load GRN lines.'))
            .finally(() => setLinesLoading(false));
    };

    const toggle    = id => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const allOn = grnLines.every(l => selected[l.grnDetailId]);
        const next  = {};
        grnLines.forEach(l => { next[l.grnDetailId] = !allOn; });
        setSelected(p => ({ ...p, ...next }));
    };

    const doImport = async () => {
        const toImport = grnLines.filter(l => selected[l.grnDetailId]);
        if (toImport.length === 0) { setError('No lines selected.'); return; }

        const invalid = toImport.filter(l =>
            !qtyMap[l.grnDetailId] || isNaN(Number(qtyMap[l.grnDetailId])) || Number(qtyMap[l.grnDetailId]) <= 0
        );
        if (invalid.length > 0) { setError('All selected lines must have quantity > 0.'); return; }

        const overQty = toImport.filter(l => Number(qtyMap[l.grnDetailId]) > l.pendingQty);
        if (overQty.length > 0) {
            setError(`Qty cannot exceed pending qty for: ${overQty.map(l => l.itemCode || l.itemDesc).join(', ')}`);
            return;
        }

        setImporting(true); setError('');
        let lineNum = (invoice.lines?.length || 0) + 1;

        try {
            for (const l of toImport) {
                const body = {
                    supplierInvLineId: 0,
                    supplierInvoiceId: invoice.supplierInvoiceId,
                    lineNum:           lineNum++,
                    grnDetailId:       l.grnDetailId,
                    grnId:             l.grnId,
                    poLineId:          l.poLineId || null,
                    itemId:            l.itemId   || null,
                    itemCode:          l.itemCode || null,
                    itemDesc:          l.itemDesc || null,
                    uomName:           l.uomName  || null,
                    qty:               Number(qtyMap[l.grnDetailId]),
                    unitPrice:         Number(priceMap[l.grnDetailId]),
                    taxPct:            l.taxPct,
                    notes:             null,
                };
                const r = await fetch(`${variables.API_URL}supplierinvoice/saveline`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify(body)
                });
                if (!r.ok) { const d = await r.json(); throw new Error(d.message || 'Save line failed.'); }
            }
            onImported();
        } catch (e) {
            setError(e.message);
        } finally {
            setImporting(false);
        }
    };

    const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
    const panelStyle   = { background: '#fff', borderRadius: 10, width: '90%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.22)' };
    const headerStyle  = { padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
    const bodyStyle    = { padding: 20, overflowY: 'auto', flex: 1 };
    const footerStyle  = { padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 };

    const allOn = grnLines.length > 0 && grnLines.every(l => selected[l.grnDetailId]);

    return (
        <div style={overlayStyle}>
            <div style={panelStyle}>
                <div style={headerStyle}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Import Lines from GRN</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            Supplier: <strong>{invoice.supplierName}</strong>
                            {selectedGrn && <> · GRN: <strong>{selectedGrn.grnNumber}</strong></>}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
                </div>

                <div style={bodyStyle}>
                    {error && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                            ⚠ {error}
                        </div>
                    )}

                    {/* Step 1 — Pick a GRN */}
                    {!selectedGrn && (
                        <>
                            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 10, fontSize: 13 }}>
                                Step 1 — Select a GRN with pending quantities:
                            </div>
                            {grnsLoading ? (
                                <div style={{ color: '#64748b', fontSize: 13 }}>Loading GRNs…</div>
                            ) : grns.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: 13, padding: 16, textAlign: 'center', background: '#f8fafc', borderRadius: 6 }}>
                                    No pending GRNs found for this supplier.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['GRN #', 'Date', 'PO #', 'Total', 'Status', ''].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', fontSize: 12 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grns.map(g => (
                                            <tr key={g.grnId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 10px', fontFamily: 'Courier New', fontSize: 12, fontWeight: 600, color: '#1e40af' }}>{g.grnNumber}</td>
                                                <td style={{ padding: '8px 10px' }}>{fmtDate(g.grnDate)}</td>
                                                <td style={{ padding: '8px 10px', fontFamily: 'Courier New', fontSize: 12 }}>{g.poNumber || '—'}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(g.totalAmount)}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{g.status}</span>
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <button onClick={() => selectGrn(g)}
                                                        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                        Select
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}

                    {/* Step 2 — Pick lines */}
                    {selectedGrn && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>
                                    Step 2 — Select lines to invoice (adjust qty/price if needed):
                                </div>
                                <button onClick={() => { setSelectedGrn(null); setGrnLines([]); }}
                                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                                    ← Back to GRNs
                                </button>
                            </div>

                            {linesLoading ? (
                                <div style={{ color: '#64748b', fontSize: 13 }}>Loading lines…</div>
                            ) : grnLines.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: 13, padding: 16, textAlign: 'center' }}>No pending lines.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>
                                                <input type="checkbox" checked={allOn} onChange={toggleAll} />
                                            </th>
                                            {['Item', 'UOM', 'Received', 'Invoiced', 'Pending', 'Inv Qty', 'Unit Price', 'Tax %'].map(h => (
                                                <th key={h} style={{ padding: '8px 8px', textAlign: h === 'Item' ? 'left' : 'right', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', fontSize: 12 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grnLines.map(l => {
                                            const checked = !!selected[l.grnDetailId];
                                            return (
                                                <tr key={l.grnDetailId} style={{ borderBottom: '1px solid #f1f5f9', background: checked ? '#f0f9ff' : '#fff' }}>
                                                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                                        <input type="checkbox" checked={checked} onChange={() => toggle(l.grnDetailId)} />
                                                    </td>
                                                    <td style={{ padding: '8px 8px' }}>
                                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{l.itemCode || '—'}</div>
                                                        <div style={{ fontSize: 11, color: '#64748b' }}>{l.itemDesc}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#64748b' }}>{l.uomName || '—'}</td>
                                                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{fmt(l.receivedQty)}</td>
                                                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#94a3b8' }}>{fmt(l.alreadyInvoicedQty)}</td>
                                                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, color: '#166534' }}>{fmt(l.pendingQty)}</td>
                                                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                                        <input
                                                            type="number" min="0.0001" step="0.0001"
                                                            value={qtyMap[l.grnDetailId] || ''}
                                                            onChange={e => setQtyMap(p => ({ ...p, [l.grnDetailId]: e.target.value }))}
                                                            disabled={!checked}
                                                            style={{ width: 80, padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, textAlign: 'right', background: checked ? '#fff' : '#f8fafc' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                                        <AmountInput
                                                            decimals={4}
                                                            value={priceMap[l.grnDetailId] || ''}
                                                            onChange={v => setPriceMap(p => ({ ...p, [l.grnDetailId]: v }))}
                                                            disabled={!checked}
                                                            style={{ width: 90, padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, background: checked ? '#fff' : '#f8fafc' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#64748b' }}>{l.taxPct}%</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>

                <div style={footerStyle}>
                    <button onClick={onClose}
                        style={{ padding: '7px 18px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                        Cancel
                    </button>
                    {selectedGrn && grnLines.length > 0 && (
                        <button onClick={doImport} disabled={importing}
                            style={{ padding: '7px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: importing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: importing ? 0.7 : 1 }}>
                            {importing ? 'Importing…' : `Import ${Object.values(selected).filter(Boolean).length} Line(s)`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Lines Tab ─────────────────────────────────────────────────────────
const InvoiceLinesTab = ({ invoice, lines, onRefresh }) => {
    const { canDo }     = usePermission();
    const canEdit       = canDo('/supplier-invoice', 'EDIT') && invoice.status === 'Draft';
    const [showImport,    setShowImport]    = useState(false);
    const [showSrvImport, setShowSrvImport] = useState(false);
    const [deletingId,    setDeletingId]    = useState(null);
    const [alertMsg,      setAlertMsg]      = useState(null);
    const [confirm,       setConfirm]       = useState(null);

    const deleteLine = (lineId) => {
        setConfirm({
            title: 'Remove Line',
            message: 'Remove this line?',
            confirmLabel: 'Remove',
            onConfirm: async () => {
                setConfirm(null);
                setDeletingId(lineId);
                try {
                    const res = await fetch(`${variables.API_URL}supplierinvoice/deleteline/${lineId}`, {
                        method: 'DELETE', headers: authHeaders()
                    });
                    const d = await res.json();
                    if (!res.ok) { setAlertMsg(d.message || 'Delete failed.'); return; }
                    onRefresh();
                } catch { setAlertMsg('Network error. Please try again.'); }
                finally { setDeletingId(null); }
            },
        });
    };

    return (
        <div style={{ padding: '16px 20px' }}>
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {/* Toolbar */}
            {canEdit && (
                <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="po-btn-pri" onClick={() => setShowImport(true)}>
                        + Import from GRN
                    </button>
                    <button className="po-btn-pri" onClick={() => setShowSrvImport(true)}
                        style={{ background: '#0f766e' }}>
                        + Import from SRV
                    </button>
                </div>
            )}

            {showImport && (
                <GrnImportModal
                    invoice={invoice}
                    onClose={() => setShowImport(false)}
                    onImported={() => { setShowImport(false); onRefresh(); }}
                />
            )}

            {showSrvImport && (
                <SrvImportModal
                    invoice={invoice}
                    onClose={() => setShowSrvImport(false)}
                    onImported={() => { setShowSrvImport(false); onRefresh(); }}
                />
            )}

            {/* Lines Table */}
            {lines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
                    <div style={{ fontWeight: 600, color: '#475569' }}>No invoice lines yet</div>
                    {canEdit && (
                        <div style={{ fontSize: 13, marginTop: 6 }}>
                            Click <strong>Import from GRN</strong> to add lines from a goods receipt.
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['#', 'Item', 'GRN / SRV', 'PO', 'UOM', 'Qty', 'Unit Price', 'Sub Total', 'Tax %', 'Tax Amt', 'Total', canEdit ? 'Action' : null]
                                    .filter(Boolean)
                                    .map(h => (
                                        <th key={h} style={{ padding: '9px 10px', textAlign: ['Qty', 'Unit Price', 'Sub Total', 'Tax %', 'Tax Amt', 'Total'].includes(h) ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', fontSize: 12, whiteSpace: 'nowrap' }}>
                                            {h}
                                        </th>
                                    ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((l, idx) => (
                                <tr key={l.supplierInvLineId} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '9px 10px', color: '#94a3b8', fontSize: 12 }}>{l.lineNum}</td>
                                    <td style={{ padding: '9px 10px' }}>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{l.itemCode || '—'}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', maxWidth: 220 }}>{l.itemDesc}</div>
                                    </td>
                                    <td style={{ padding: '9px 10px' }}>
                                        {l.grnNumber
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>{l.grnNumber}</span>
                                            : l.srvNumber
                                                ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f766e', background: '#ccfbf1', padding: '2px 6px', borderRadius: 4 }}>{l.srvNumber}</span>
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '9px 10px' }}>
                                        {l.poNumber
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{l.poNumber}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '9px 10px', color: '#64748b' }}>{l.uomName || '—'}</td>
                                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'Courier New' }}>{fmt(l.qty)}</td>
                                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'Courier New' }}>{fmt(l.unitPrice)}</td>
                                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'Courier New' }}>{fmt(l.lineTotal)}</td>
                                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748b' }}>{l.taxPct}%</td>
                                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'Courier New' }}>{fmt(l.taxAmount)}</td>
                                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: '#1e293b' }}>{fmt(l.lineTotalWithTax)}</td>
                                    {canEdit && (
                                        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => deleteLine(l.supplierInvLineId)}
                                                disabled={deletingId === l.supplierInvLineId}
                                                style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
                                                {deletingId === l.supplierInvLineId ? '…' : 'Remove'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals footer */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <div style={{ minWidth: 300, background: '#f8fafc', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                            {[
                                { label: 'Sub Total',  val: fmt(invoice.subTotal) },
                                { label: 'Tax Amount', val: fmt(invoice.taxAmount) },
                                { label: 'Total',      val: fmt(invoice.totalAmount), bold: true },
                            ].map(r => (
                                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: r.bold ? '2px solid #334155' : '1px solid #e2e8f0', marginBottom: r.bold ? 0 : 4 }}>
                                    <span style={{ fontSize: 13, color: '#475569', fontWeight: r.bold ? 700 : 400 }}>{r.label}</span>
                                    <span style={{ fontSize: 14, fontFamily: 'Courier New', fontWeight: r.bold ? 700 : 400, color: r.bold ? '#1e293b' : '#475569' }}>{r.val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default InvoiceLinesTab;
