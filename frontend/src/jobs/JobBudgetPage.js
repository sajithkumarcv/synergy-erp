import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { JobBudgetEditor } from './tabs/JobBudgetTab';

// Dedicated add/edit budget page. The job's Budget tab now shows a read-only
// summary with an "Add / Edit Budget" button that routes here.
const JobBudgetPage = () => {
    const { jobId }  = useParams();
    const navigate   = useNavigate();
    const [job, setJob]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]   = useState('');

    const loadJob = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error('Job not found'); return r.json(); })
            .then(d => setJob(d))
            .catch(() => setError('Could not load this job.'))
            .finally(() => setLoading(false));
    }, [jobId]);

    useEffect(() => { loadJob(); }, [loadJob]);

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1180, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={() => navigate(`/jobs/${encodeURIComponent(jobId)}`)}
                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
                    ← Back to Job
                </button>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Job Budget — {jobId}</h2>
                    {job?.projectName && <div style={{ fontSize: 12, color: '#64748b' }}>{job.projectName}</div>}
                </div>
            </div>

            {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</div>
             : error  ? <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>{error}</div>
             : job    ? <JobBudgetEditor job={job} />
             : null}
        </div>
    );
};

export default JobBudgetPage;
