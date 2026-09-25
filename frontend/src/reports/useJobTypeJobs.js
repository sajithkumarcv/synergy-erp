import { useState, useEffect, useRef } from 'react';
import { variables, authHeaders } from '../Variable';

// Job Type + Job dropdown data for the PO / PR / GRN reports.
//   jobTypeIds  comma-joined JobTypeIds currently selected ('' = all types)
//   jobId       currently selected job ('' = none)
//   onJobInvalid  called when the selected job is not of the selected job type(s)
//                 any more, so the caller can clear it
// The job list is re-fetched whenever the selected types change, so the Job dropdown only ever
// offers jobs of the chosen kind(s).
const useJobTypeJobs = (jobTypeIds, jobId, onJobInvalid) => {
    const [jobTypes, setJobTypes] = useState([]);
    const [jobs,     setJobs]     = useState([]);
    const latest = useRef({ jobId, onJobInvalid });
    latest.current = { jobId, onJobInvalid };

    useEffect(() => {
        fetch(`${variables.API_URL}job/types`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setJobTypes(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        let alive = true;
        const q = new URLSearchParams({ pageSize: 500, page: 1, sortCol: 'JobId', sortDir: 'ASC', approvalStatus: 'Approved' });
        if (jobTypeIds) q.set('jobTypeIds', jobTypeIds);
        fetch(`${variables.API_URL}job/search?${q}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => {
                if (!alive) return;
                const list = d.data || [];
                setJobs(list);
                const cur = latest.current;
                if (jobTypeIds && cur.jobId && !list.some(j => j.jobId === cur.jobId)) cur.onJobInvalid();
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [jobTypeIds]);

    return { jobTypes, jobs };
};

export default useJobTypeJobs;
