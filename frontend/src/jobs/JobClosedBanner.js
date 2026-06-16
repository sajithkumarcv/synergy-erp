import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';

/**
 * JobClosedBanner
 * Shows a warning banner when a job is in a closed state (Freezed, Completed, Cancelled).
 * Renders nothing when the job is open or jobId is falsy.
 *
 * Props:
 *   jobId  {string}  — the job ID to check
 */
const JobClosedBanner = ({ jobId }) => {
    const navigate = useNavigate();
    const [info, setInfo] = useState(null); // { isClosed, statusName }

    useEffect(() => {
        if (!jobId) { setInfo(null); return; }
        let cancelled = false;

        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/is-closed`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!cancelled) setInfo(d && d.isClosed ? d : null); })
            .catch(() => { if (!cancelled) setInfo(null); });

        return () => { cancelled = true; };
    }, [jobId]);

    if (!info) return null;

    const bgMap = {
        Freezed:   { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: '🔒' },
        Completed: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: '✔' },
        Cancelled: { bg: '#fff1f2', border: '#fca5a5', color: '#991b1b', icon: '✖' },
    };
    const { bg, border, color, icon } = bgMap[info.statusName] || bgMap['Cancelled'];

    return (
        <div style={{
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 14,
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
        }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ color, fontWeight: 500 }}>
                Job <strong>{jobId}</strong> is <strong>{info.statusName}</strong>.
                New transactions cannot be created on this job.
            </span>
            <button
                onClick={() => navigate(`/jobs/${encodeURIComponent(jobId)}`)}
                style={{
                    marginLeft: 'auto',
                    padding: '3px 10px',
                    borderRadius: 5,
                    border: `1px solid ${border}`,
                    background: 'transparent',
                    color,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                }}>
                Open Job → Revise
            </button>
        </div>
    );
};

export default JobClosedBanner;
