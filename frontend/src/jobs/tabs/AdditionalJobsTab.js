import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate } from '../jobConstants';

const STATUS_MAP = {
    1: { label: 'Open',        bg: '#dbeafe', color: '#1e40af' },
    2: { label: 'In Progress', bg: '#fef9c3', color: '#854d0e' },
    3: { label: 'Completed',   bg: '#dcfce7', color: '#166534' },
    4: { label: 'On Hold',     bg: '#fce7f3', color: '#9d174d' },
    5: { label: 'Cancelled',   bg: '#fee2e2', color: '#991b1b' },
};

const StatusBadge = ({ id }) => {
    const s = STATUS_MAP[id] || { label: 'Unknown', bg: '#f1f5f9', color: '#64748b' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
            background: s.bg, color: s.color,
        }}>{s.label}</span>
    );
};

const AdditionalJobsTab = ({ job }) => {
    const navigate = useNavigate();
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!job?.jobId) return;
        setLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/additional-jobs`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [job?.jobId]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 32, color: '#64748b' }}>
            <div style={{ width: 18, height: 18, border: '2px solid #e2e8f0', borderTopColor: '#2e5fa3', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Loading additional jobs…
        </div>
    );

    return (
        <div style={{ padding: '0 0 24px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e3a5f' }}>
                        Additional Jobs
                        {rows.length > 0 && (
                            <span style={{
                                marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#7c3aed',
                                color: '#fff', borderRadius: 10, padding: '1px 8px',
                            }}>{rows.length}</span>
                        )}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                        All additional jobs linked to <strong>{job.jobId}</strong> as their parent
                    </p>
                </div>
            </div>

            {rows.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '48px 24px',
                    background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10,
                    color: '#94a3b8',
                }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>No additional jobs yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                        Create an additional job and select <strong>{job.jobId}</strong> as the parent.
                    </div>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                {['Job No.', 'Type', 'LPO Ref', 'LPO Date', 'Contract Ref', 'Order Value', 'Advance', 'Stage', 'Status', ''].map(h => (
                                    <th key={h} style={{
                                        padding: '8px 12px', textAlign: h === 'Order Value' || h === 'Advance' ? 'right' : 'left',
                                        fontSize: 11, fontWeight: 700, color: '#64748b',
                                        textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={r.JobId || r.jobId}
                                    style={{
                                        background: i % 2 === 0 ? '#fff' : '#f8fafc',
                                        borderBottom: '1px solid #f1f5f9',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f8fafc'}
                                >
                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                        <button
                                            onClick={() => navigate(`/jobs/${encodeURIComponent(r.JobId || r.jobId)}`)}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: '#2e5fa3', fontWeight: 700, fontSize: 13,
                                                padding: 0, textDecoration: 'underline',
                                            }}
                                        >
                                            {r.JobId || r.jobId}
                                        </button>
                                    </td>
                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                        <span style={{
                                            background: '#f3e8ff', color: '#7c3aed',
                                            borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 600,
                                        }}>
                                            {r.JobTypeName || r.jobTypeName || '—'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                                        {r.LpoRef || r.lpoRef || '—'}
                                    </td>
                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                        {fmtDate(r.LpoDate || r.lpoDate)}
                                    </td>
                                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                                        {r.ContractRef || r.contractRef || '—'}
                                    </td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {r.OrderValue || r.orderValue ? fmt(r.OrderValue ?? r.orderValue) : '—'}
                                    </td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {r.JobAdvanceAmount || r.jobAdvanceAmount ? fmt(r.JobAdvanceAmount ?? r.jobAdvanceAmount) : '—'}
                                    </td>
                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#64748b' }}>
                                        {r.JobStageName || r.jobStageName || '—'}
                                    </td>
                                    <td style={{ padding: '9px 12px' }}>
                                        <StatusBadge id={r.JobStatusId ?? r.jobStatusId} />
                                    </td>
                                    <td style={{ padding: '9px 12px' }}>
                                        <button
                                            onClick={() => navigate(`/jobs/${encodeURIComponent(r.JobId || r.jobId)}`)}
                                            style={{
                                                padding: '3px 10px', fontSize: 11, fontWeight: 600,
                                                background: '#2e5fa3', color: '#fff', border: 'none',
                                                borderRadius: 5, cursor: 'pointer',
                                            }}
                                        >Open</button>
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

export default AdditionalJobsTab;
