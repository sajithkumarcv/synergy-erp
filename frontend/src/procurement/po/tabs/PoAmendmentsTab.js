import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { fmt, fmtDate } from '../../procurementConstants';

const Section = ({ title, children }) => (
    <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '0 0 8px', borderBottom: '2px solid #e2e8f0', marginBottom: 12 }}>
            {title}
        </div>
        {children}
    </div>
);

const PoAmendmentsTab = ({ po }) => {
    const [amendments,  setAmendments]  = useState([]);
    const [revisions,   setRevisions]   = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [aRes, rRes] = await Promise.all([
                fetch(`${variables.API_URL}purchaseorder/${po.poId}/amendments`, { headers: authHeaders() }),
                fetch(`${variables.API_URL}purchaseorder/${po.poId}/revisions`,  { headers: authHeaders() }),
            ]);
            const [aData, rData] = await Promise.all([
                aRes.json().catch(() => []),
                rRes.json().catch(() => []),
            ]);
            if (!aRes.ok) { setError(aData?.message || 'Failed to load amendment log.'); return; }
            if (!rRes.ok) { setError(rData?.message || 'Failed to load revision log.');  return; }
            setAmendments(Array.isArray(aData) ? aData : []);
            setRevisions(Array.isArray(rData)  ? rData  : []);
        } catch (e) {
            setError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setLoading(false); }
    }, [po.poId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading…</div>;

    return (
        <div style={{ padding: '16px 0' }}>
            {error && (
                <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#b91c1c' }}>
                    {error}
                </div>
            )}

            {/* ── Revision history ── */}
            <Section title="Revision History">
                {revisions.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>No revisions recorded.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={th}>Date</th>
                                <th style={th}>Revision No</th>
                                <th style={{ ...th, textAlign: 'left' }}>Reason</th>
                                <th style={th}>Revised By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {revisions.map(r => (
                                <tr key={r.RevisionLogId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={td}>{fmtDate(r.RevisedDate)}</td>
                                    <td style={{ ...td, textAlign: 'center' }}>
                                        <span style={{ fontFamily: 'Courier New', fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                                            Rev {r.RevisionNo}
                                        </span>
                                    </td>
                                    <td style={{ ...td, textAlign: 'left', color: '#475569' }}>{r.Reason}</td>
                                    <td style={td}>{r.RevisedBy}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>

            {/* ── Line amendment history ── */}
            <Section title="Line Amendments">
                {amendments.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>No line amendments recorded.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={th}>Date</th>
                                <th style={th}>Line</th>
                                <th style={{ ...th, textAlign: 'left' }}>Item</th>
                                <th style={th}>Old Qty</th>
                                <th style={th}>New Qty</th>
                                <th style={th}>Old Price</th>
                                <th style={th}>New Price</th>
                                <th style={{ ...th, textAlign: 'left' }}>Reason</th>
                                <th style={th}>Amended By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {amendments.map(r => {
                                const qtyChanged   = r.OldQty   !== r.NewQty;
                                const priceChanged = r.OldPrice !== r.NewPrice;
                                return (
                                    <tr key={r.AmendmentId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={td}>{fmtDate(r.AmendedDate)}</td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <span style={{ fontFamily: 'Courier New', fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                                                {r.LineNum}
                                            </span>
                                        </td>
                                        <td style={{ ...td, textAlign: 'left' }}>
                                            <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>
                                                {r.ItemCode}
                                            </span>
                                            {r.ItemDesc}
                                        </td>
                                        <td style={td}>{fmt(r.OldQty)}</td>
                                        <td style={{ ...td, color: qtyChanged ? '#b45309' : 'inherit', fontWeight: qtyChanged ? 600 : 400 }}>{fmt(r.NewQty)}</td>
                                        <td style={td}>{fmt(r.OldPrice)}</td>
                                        <td style={{ ...td, color: priceChanged ? '#b45309' : 'inherit', fontWeight: priceChanged ? 600 : 400 }}>{fmt(r.NewPrice)}</td>
                                        <td style={{ ...td, textAlign: 'left', color: '#475569', maxWidth: 220 }}>{r.Reason}</td>
                                        <td style={td}>{r.AmendedBy}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </Section>
        </div>
    );
};

const th = { padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#475569', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', textAlign: 'right', color: '#1e293b', border: '1px solid #f1f5f9', verticalAlign: 'top' };

export default PoAmendmentsTab;
