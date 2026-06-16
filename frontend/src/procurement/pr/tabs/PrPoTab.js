import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../../Variable';
import { fmtDate, fmt, statusBadgeCfg } from '../../procurementConstants';
import { useLookup } from '../../../LookupContext';

const StatusBadge = ({ status, getStatusConfig }) => {
    const cfg = statusBadgeCfg(getStatusConfig('PO', status));
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: cfg.bg, color: cfg.color,
            padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
        </span>
    );
};

const PrPoTab = ({ pr }) => {
    const navigate             = useNavigate();
    const { getStatusConfig } = useLookup();
    const [pos,     setPos]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        fetch(`${variables.API_URL}purchaserequest/${pr.prId}/pos`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setPos(d || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [pr.prId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div className="jd-tab-body">
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading purchase orders…</div>
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
                    Purchase Orders
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                    {pos.length} PO{pos.length !== 1 ? 's' : ''} raised from this PR
                </div>
            </div>

            {pos.length === 0 ? (
                <div style={{
                    background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8,
                    padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13
                }}>
                    No purchase orders have been raised from this PR yet.
                </div>
            ) : (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <table className="po-table" style={{ margin: 0 }}>
                        <thead>
                            <tr>
                                <th>PO Number</th>
                                <th>Date</th>
                                <th>Vendor</th>
                                <th>Job</th>
                                <th>Rev</th>
                                <th style={{ textAlign: 'right' }}>Total Amount</th>
                                <th>Currency</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pos.map(po => (
                                <tr key={po.poId}>
                                    <td>
                                        <button
                                            onClick={() => navigate(`/purchase-orders/${po.poId}`)}
                                            style={{
                                                background: '#dbeafe', border: 'none',
                                                cursor: 'pointer', fontFamily: 'Courier New',
                                                fontWeight: 700, color: '#1e40af', fontSize: 12,
                                                padding: '2px 7px', borderRadius: 4,
                                                textDecoration: 'underline'
                                            }}
                                            title="Open PO detail"
                                        >
                                            {po.poNumber}
                                        </button>
                                    </td>
                                    <td style={{ fontSize: 12.5 }}>{fmtDate(po.poDate)}</td>
                                    <td style={{ fontSize: 12.5, color: '#374151' }}>{po.vendorName || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                    <td>
                                        {po.jobId
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11,
                                                color: '#0f766e', background: '#ccfbf1',
                                                padding: '2px 6px', borderRadius: 4 }}>{po.jobId}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                                        {po.revision > 0 ? `Rev ${po.revision}` : '—'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1e40af' }}>
                                        {po.totalAmount ? fmt(po.totalAmount) : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#475569' }}>{po.currencyShort || '—'}</td>
                                    <td><StatusBadge status={po.status} getStatusConfig={getStatusConfig} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PrPoTab;
