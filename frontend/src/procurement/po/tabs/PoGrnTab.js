import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../../Variable';
import { fmtDate, fmt } from '../../procurementConstants';

const STATUS_CFG = {
    Draft:      { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Received:   { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    Posted:     { bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
    Cancelled:  { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
};

const StatusBadge = ({ status }) => {
    const c = STATUS_CFG[status] || STATUS_CFG.Draft;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
            background: c.bg, color: c.color, padding: '3px 9px',
            borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
            {status}
        </span>
    );
};

const PoGrnTab = ({ po }) => {
    const navigate = useNavigate();
    const [grns,    setGrns]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        fetch(`${variables.API_URL}grn/search?poId=${po.poId}&pageSize=100&page=1`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setGrns(d.data || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [po.poId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div className="jd-tab-body">
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading GRNs…</div>
        </div>
    );

    if (error) return (
        <div className="jd-tab-body">
            <div style={{ color: '#dc2626', fontSize: 13 }}>⚠ {error}</div>
        </div>
    );

    return (
        <div className="jd-tab-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Goods Receipt Notes
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                    {grns.length} GRN{grns.length !== 1 ? 's' : ''} linked to this PO
                </div>
            </div>

            {grns.length === 0 ? (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8,
                    padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No GRNs have been raised against this PO yet.
                </div>
            ) : (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <table className="po-table" style={{ margin: 0 }}>
                        <thead>
                            <tr>
                                <th>GRN #</th>
                                <th>Date</th>
                                <th>Job</th>
                                <th>DO / Ref</th>
                                <th>Invoice</th>
                                <th style={{ textAlign: 'right' }}>Total Amount</th>
                                <th>Status</th>
                                <th style={{ width: 80 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {grns.map(g => (
                                <tr key={g.grnId}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => navigate(`/grn/${g.grnId}`)}>
                                    <td>
                                        <span style={{
                                            fontFamily: 'Courier New', fontWeight: 700,
                                            color: '#1e40af', fontSize: 12,
                                            background: '#dbeafe', padding: '2px 7px', borderRadius: 4
                                        }}>
                                            {g.grnNumber}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 12.5 }}>{fmtDate(g.grnDate)}</td>
                                    <td>
                                        {g.jobId
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11,
                                                color: '#0f766e', background: '#ccfbf1',
                                                padding: '2px 6px', borderRadius: 4 }}>{g.jobId}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#475569' }}>{g.doNo || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                    <td style={{ fontSize: 12, color: '#475569' }}>{g.invoiceNo || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1e40af' }}>
                                        {g.totalAmount ? fmt(g.totalAmount) : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td><StatusBadge status={g.status} /></td>
                                    <td onClick={e => e.stopPropagation()}>
                                        <button
                                            className="po-act-btn po-act-open"
                                            onClick={() => navigate(`/grn/${g.grnId}`)}>
                                            Open
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PoGrnTab;
