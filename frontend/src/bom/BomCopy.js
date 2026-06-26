import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
// reuses bf-*, bom-is-* classes from Bom.css

const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmt = (n) =>
    n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// ── Step indicator ──────────────────────────────────────────────────────────
const STEPS = [
    { n: 1, label: 'Target Job' },
    { n: 2, label: 'Source BOM'  },
    { n: 3, label: 'Verify & Copy' },
];

const Stepper = ({ step }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '11px 22px', background: '#163660', borderBottom: '1px solid rgba(255,255,255,.12)', flexShrink: 0 }}>
        {STEPS.map((s, i) => (
            <React.Fragment key={s.n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: step > s.n ? '#4ade80' : step === s.n ? '#fff' : 'rgba(255,255,255,.18)',
                        color:      step > s.n ? '#fff'    : step === s.n ? '#163660' : 'rgba(255,255,255,.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700,
                    }}>
                        {step > s.n ? '✓' : s.n}
                    </div>
                    <span style={{
                        fontSize: 11.5, whiteSpace: 'nowrap',
                        fontWeight: step === s.n ? 600 : 400,
                        color: step >= s.n ? '#fff' : 'rgba(255,255,255,.4)',
                    }}>
                        {s.label}
                    </span>
                </div>
                {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.2)', margin: '0 10px' }} />
                )}
            </React.Fragment>
        ))}
    </div>
);

// ── Shared small info row ───────────────────────────────────────────────────
const InfoRow = ({ label, value }) => (
    <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>
            {label}
        </div>
        <div style={{ fontSize: 12.5, color: '#1e3a5f', fontWeight: 500 }}>{value || '—'}</div>
    </div>
);

// ── Job-search typeahead (used in Step 1) ───────────────────────────────────
const JobSearchInput = ({ onChange, error }) => {
    const [query,   setQuery]   = useState('');
    const [results, setResults] = useState([]);
    const [open,    setOpen]    = useState(false);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);
    const wrap  = useRef(null);

    useEffect(() => {
        const h = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const doSearch = (q) => {
        setQuery(q);
        if (!q) { onChange(null); }
        clearTimeout(timer.current);
        if (!q.trim()) { setResults([]); setOpen(false); return; }
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const r = await fetch(
                    `${variables.API_URL}job/search?searchText=${encodeURIComponent(q)}&pageSize=10&page=1&sortCol=JobDate&sortDir=DESC&excludeClosedStatus=true&approvalStatus=Approved`,
                    { headers: authHeaders() }
                );
                const d = await r.json();
                setResults(d.data || []);
                setOpen(true);
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
    };

    const select = (j) => {
        const lbl = `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`;
        setQuery(lbl);
        setOpen(false);
        onChange({
            jobId:          j.jobId,
            jobTypeId:      j.jobTypeId || '',
            customerName:   j.customerName || '',
            jobDescription: j.jobDescription || '',
        });
    };

    return (
        <div className="bom-item-search" ref={wrap}>
            <input
                className={`bf-input${error ? ' bf-input-err' : ''}`}
                placeholder="Type Job ID or description to search…"
                value={query}
                onChange={e => doSearch(e.target.value)}
            />
            {loading && <span className="bom-is-spinner" />}
            {open && results.length > 0 && (
                <div className="bom-is-dropdown" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                    {results.map(j => (
                        <div key={j.jobId} className="bom-is-option" onClick={e => { e.stopPropagation(); select(j); }}>
                            <span className="bom-is-code">{j.jobId}</span>
                            <span className="bom-is-name">{j.projectName || '—'}</span>
                            {j.customerName && (
                                <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 'auto' }}>{j.customerName}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// STEP 1 — Select Target Job
// ═══════════════════════════════════════════════════════════════════
const Step1 = ({ onNext, onClose }) => {
    const [job,      setJob]      = useState(null);
    const [checking, setChecking] = useState(false);
    const [checkErr, setCheckErr] = useState('');
    const [fieldErr, setFieldErr] = useState('');

    const handleJobSelect = async (jobObj) => {
        setJob(null); setCheckErr(''); setFieldErr('');
        if (!jobObj) return;
        setChecking(true);
        try {
            const r = await fetch(
                `${variables.API_URL}bom/search?jobId=${encodeURIComponent(jobObj.jobId)}&pageSize=1&page=1`,
                { headers: authHeaders() }
            );
            const d = await r.json();
            if ((d.totalRows || 0) > 0) {
                setCheckErr(
                    `Job ${jobObj.jobId} already has an active BOM (${d.data[0]?.bomStatus || ''}). ` +
                    `Please select a different job.`
                );
                return;
            }
        } catch { /* non-fatal — let the server validate */ }
        finally { setChecking(false); }
        setJob(jobObj);
    };

    const next = () => {
        if (!job) { setFieldErr('Please select a target job.'); return; }
        onNext(job);
    };

    return (
        <>
            <div className="bf-body">
                <div className="bf-section">
                    <span className="bf-section-label">Target Job</span>
                    <div className="bf-section-line" />
                </div>
                <p style={{ fontSize: 12.5, color: '#475569', margin: '0 0 12px' }}>
                    Select the job that will receive the copied BOM. The job must not already have a BOM.
                </p>

                <JobSearchInput error={!!fieldErr} onChange={handleJobSelect} />

                {fieldErr && (
                    <div style={{ color: '#dc2626', fontSize: 11, marginTop: 5 }}>{fieldErr}</div>
                )}
                {checking && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>⏳ Checking for existing BOM…</div>
                )}
                {checkErr && (
                    <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '9px 13px', fontSize: 12.5, marginTop: 8 }}>
                        ⚠️ {checkErr}
                    </div>
                )}

                {job && !checkErr && (
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '13px 16px', marginTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '.5px' }}>Selected Job</span>
                            <span style={{ background: '#0ea5e9', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>✓ Available</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                            <InfoRow label="Job ID"      value={<span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f', fontSize: 13 }}>{job.jobId}</span>} />
                            <InfoRow label="Job Type"    value={job.jobTypeId} />
                            <InfoRow label="Customer"    value={job.customerName} />
                            <InfoRow label="Description" value={job.jobDescription} />
                        </div>
                    </div>
                )}
            </div>

            <div className="bf-footer">
                <button className="bf-btn-sec" onClick={onClose}>Cancel</button>
                <button className="bf-btn-pri" onClick={next} disabled={!job || !!checkErr || checking}>
                    Next → Select Source BOM
                </button>
            </div>
        </>
    );
};

// ═══════════════════════════════════════════════════════════════════
// STEP 2 — Select Source BOM
// ═══════════════════════════════════════════════════════════════════
const STATUS_CHIP = {
    Draft:    { background: '#fef9c3', color: '#854d0e' },
    Approved: { background: '#dcfce7', color: '#166534' },
};

const TH = { padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10.5, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid #d4dce9', whiteSpace: 'nowrap' };
const TD = { padding: '8px 10px', borderBottom: '1px solid #f0f4f8', fontSize: 12.5, color: '#334155', whiteSpace: 'nowrap' };

const Step2 = ({ targetJob, onNext, onBack }) => {
    const [searchText,     setSearchText]     = useState('');
    const [jobTypeFilter,  setJobTypeFilter]  = useState(targetJob.jobTypeId || '');
    const [jobTypes,       setJobTypes]       = useState([]);
    const [rows,           setRows]           = useState([]);
    const [loading,        setLoading]        = useState(false);
    const [selected,       setSelected]       = useState(null);
    const [fieldErr,       setFieldErr]       = useState('');
    const timer = useRef(null);

    useEffect(() => {
        fetch(`${variables.API_URL}job/types`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setJobTypes(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, []);

    const doSearch = useCallback(async (text, typeId) => {
        setLoading(true);
        try {
            const q = new URLSearchParams({ page: 1, pageSize: 60, sortColumn: 'BomDate', sortDirection: 'DESC' });
            if (text) q.set('searchText', text);
            const r = await fetch(`${variables.API_URL}bom/search?${q}`, { headers: authHeaders() });
            const d = await r.json();
            let data = d.data || [];
            // client-side job-type filter (sp_SearchBoms doesn't expose a jobTypeId param)
            if (typeId) data = data.filter(b => b.jobTypeId === typeId);
            setRows(data);
        } catch { setRows([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { doSearch('', targetJob.jobTypeId || ''); }, []); // eslint-disable-line

    const onSearchChange = (text) => {
        setSearchText(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => doSearch(text, jobTypeFilter), 350);
    };

    const onTypeChange = (typeId) => {
        setJobTypeFilter(typeId);
        doSearch(searchText, typeId);
    };

    const next = () => {
        if (!selected) { setFieldErr('Please select a source BOM.'); return; }
        onNext(selected);
    };

    return (
        <>
            <div className="bf-body" style={{ padding: '14px 22px' }}>
                <div className="bf-section">
                    <span className="bf-section-label">Source BOM</span>
                    <div className="bf-section-line" />
                </div>
                <p style={{ fontSize: 12.5, color: '#475569', margin: '0 0 10px' }}>
                    Choose the BOM to copy from. Its line items will be duplicated into job{' '}
                    <strong style={{ color: '#1e3a5f' }}>{targetJob.jobId}</strong>.
                </p>

                {/* Filters */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                        className="bf-input"
                        placeholder="Search job no., customer, description…"
                        style={{ flex: 1 }}
                        value={searchText}
                        onChange={e => onSearchChange(e.target.value)}
                    />
                    <select
                        className="bf-input"
                        style={{ flex: '0 0 165px' }}
                        value={jobTypeFilter}
                        onChange={e => onTypeChange(e.target.value)}
                    >
                        <option value="">All Job Types</option>
                        {jobTypes.map(t => (
                            <option key={t.jobTypeId} value={t.jobTypeId}>{t.jobTypeName}</option>
                        ))}
                    </select>
                </div>

                {fieldErr && (
                    <div style={{ color: '#dc2626', fontSize: 11, marginBottom: 6 }}>{fieldErr}</div>
                )}

                {/* BOM grid */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', position: 'relative', maxHeight: 320, overflowY: 'auto' }}>
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,251,253,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                            <span style={{ fontSize: 12.5, color: '#64748b' }}>Loading…</span>
                        </div>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: '#eef2f8' }}>
                            <tr>
                                <th style={TH}>Job No.</th>
                                <th style={TH}>Customer</th>
                                <th style={TH}>Type</th>
                                <th style={TH}>Date</th>
                                <th style={{ ...TH, textAlign: 'center' }}>Ver</th>
                                <th style={{ ...TH, textAlign: 'center' }}>Lines</th>
                                <th style={{ ...TH, textAlign: 'right' }}>Value</th>
                                <th style={TH}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: 12.5 }}>
                                        No BOMs found.
                                    </td>
                                </tr>
                            ) : rows.map(b => {
                                const isSel = selected?.bomHeaderId === b.bomHeaderId;
                                const chip  = STATUS_CHIP[b.bomStatus] || { background: '#f1f5f9', color: '#64748b' };
                                return (
                                    <tr key={b.bomHeaderId}
                                        onClick={e => { e.stopPropagation(); setSelected(b); setFieldErr(''); }}
                                        style={{
                                            cursor: 'pointer',
                                            background:  isSel ? '#eff6ff' : undefined,
                                            borderLeft:  isSel ? '3px solid #2e5fa3' : '3px solid transparent',
                                        }}>
                                        <td style={TD}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2e5fa3', fontSize: 11.5 }}>
                                                {b.jobId}
                                            </span>
                                        </td>
                                        <td style={{ ...TD, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.customerName || '—'}</td>
                                        <td style={TD}>
                                            <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 10, padding: '1px 7px', fontSize: 10.5, fontWeight: 600 }}>
                                                {b.jobTypeName || '—'}
                                            </span>
                                        </td>
                                        <td style={{ ...TD, color: '#64748b' }}>{fmtDate(b.bomDate)}</td>
                                        <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: '#475569' }}>v{b.bomVersion}</td>
                                        <td style={{ ...TD, textAlign: 'center', color: '#64748b' }}>{b.lineCount}</td>
                                        <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                            {b.totalBomValue > 0 ? fmt(b.totalBomValue) : '—'}
                                        </td>
                                        <td style={TD}>
                                            <span style={{ ...chip, borderRadius: 8, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>
                                                {b.bomStatus}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Selected source summary */}
                {selected && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '10px 14px', marginTop: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                            ✓ Selected Source BOM
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <InfoRow label="BOM ID"   value={<span style={{ fontFamily: 'monospace', fontWeight: 700 }}>BOM-{selected.jobId}-v{selected.bomVersion}</span>} />
                            <InfoRow label="Customer" value={selected.customerName} />
                            <InfoRow label="Type"     value={selected.jobTypeName} />
                            <InfoRow label="Lines"    value={selected.lineCount} />
                            <InfoRow label="Status"   value={selected.bomStatus} />
                        </div>
                    </div>
                )}
            </div>

            <div className="bf-footer">
                <button className="bf-btn-sec" onClick={onBack}>← Back</button>
                <button className="bf-btn-pri" onClick={next} disabled={!selected}>
                    Next → Verify &amp; Copy
                </button>
            </div>
        </>
    );
};

// ═══════════════════════════════════════════════════════════════════
// STEP 3 — Verify & Copy
// ═══════════════════════════════════════════════════════════════════
const Step3 = ({ targetJob, sourceBom, onBack, onClose }) => {
    const navigate      = useNavigate();
    const currentUser   = useCurrentUser();
    const expectedText  = `BOM-${sourceBom.jobId}-v${sourceBom.bomVersion}`;

    const [verifyText, setVerifyText] = useState('');
    const [copying,    setCopying]    = useState(false);
    const [copyErr,    setCopyErr]    = useState('');
    const [newBomId,   setNewBomId]   = useState(null);

    const confirmed = verifyText === expectedText;

    const doCopy = async () => {
        if (!confirmed) return;
        setCopying(true); setCopyErr('');
        try {
            const res = await fetch(`${variables.API_URL}bom/copy`, {
                method:  'POST',
                headers: authHeaders(),
                body:    JSON.stringify({
                    sourceBomHeaderId: sourceBom.bomHeaderId,
                    targetJobId:       targetJob.jobId,
                    createdBy:         currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setCopyErr(d?.message || 'Copy failed.'); return; }
            setNewBomId(d.newBomHeaderId);
        } catch { setCopyErr('Network error. Please try again.'); }
        finally { setCopying(false); }
    };

    // ── Success screen ──────────────────────────────────────────────
    if (newBomId) {
        return (
            <>
                <div className="bf-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, padding: 32 }}>
                    <div style={{ fontSize: 52 }}>🎉</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>BOM Copied Successfully!</div>
                    <div style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 1.6 }}>
                        A new Draft BOM has been created for job{' '}
                        <strong style={{ color: '#1e3a5f' }}>{targetJob.jobId}</strong>
                        <br />
                        copied from{' '}
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2e5fa3' }}>
                            BOM-{sourceBom.jobId}-v{sourceBom.bomVersion}
                        </span>
                        .
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                        <button className="bf-btn-sec" onClick={onClose}>Close</button>
                        <button className="bf-btn-pri" onClick={() => navigate(`/bom/${newBomId}`)}>
                            Open New BOM →
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // ── Verify screen ───────────────────────────────────────────────
    const cardStyle = { flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '13px 15px' };

    return (
        <>
            <div className="bf-body">
                <div className="bf-section">
                    <span className="bf-section-label">Review &amp; Confirm</span>
                    <div className="bf-section-line" />
                </div>

                {/* Source → Target diagram */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 14, alignItems: 'stretch' }}>
                    <div style={{ ...cardStyle, background: '#f8fafc', borderRadius: '8px 0 0 8px', borderRight: 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>📄 Copy FROM</div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2e5fa3', fontSize: 13.5, marginBottom: 8 }}>
                            BOM-{sourceBom.jobId}-v{sourceBom.bomVersion}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <InfoRow label="Job"      value={sourceBom.jobId} />
                            <InfoRow label="Customer" value={sourceBom.customerName} />
                            <InfoRow label="Type"     value={sourceBom.jobTypeName} />
                            <InfoRow label="Lines"    value={sourceBom.lineCount} />
                            <InfoRow label="Status"   value={sourceBom.bomStatus} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2e5fa3', color: '#fff', fontSize: 18, padding: '0 10px', fontWeight: 700 }}>
                        →
                    </div>

                    <div style={{ ...cardStyle, background: '#f0f9ff', borderColor: '#bae6fd', borderRadius: '0 8px 8px 0', borderLeft: 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>🏭 New BOM FOR</div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f', fontSize: 13.5, marginBottom: 8 }}>
                            {targetJob.jobId} (Draft v1)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <InfoRow label="Job"      value={targetJob.jobId} />
                            <InfoRow label="Customer" value={targetJob.customerName} />
                            <InfoRow label="Type"     value={targetJob.jobTypeId} />
                            <InfoRow label="Version"  value="v1 (new)" />
                            <InfoRow label="Status"   value="Draft" />
                        </div>
                    </div>
                </div>

                {/* What-gets-copied notice */}
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 5 }}>ℹ️ What gets copied:</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#78350f', lineHeight: 1.9 }}>
                        <li>All <strong>{sourceBom.lineCount}</strong> BOM lines — items, sections, quantities, prices</li>
                        <li>Received Qty, PR Created Qty, PO Created Qty → <strong>reset to 0</strong></li>
                        <li>Item Request Date &amp; Expected Delivery → <strong>cleared</strong></li>
                        <li>New BOM starts as <strong>Draft v1</strong> — ready for editing</li>
                    </ul>
                </div>

                {/* Verification input */}
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 14px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>
                        🔒 Type{' '}
                        <code style={{ background: '#fee2e2', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12, letterSpacing: '.3px' }}>
                            {expectedText}
                        </code>{' '}
                        to confirm:
                    </div>
                    <input
                        className="bf-input"
                        placeholder={expectedText}
                        value={verifyText}
                        onChange={e => { setVerifyText(e.target.value); setCopyErr(''); }}
                        style={{ borderColor: confirmed ? '#16a34a' : verifyText ? '#ef4444' : undefined }}
                        autoFocus
                    />
                    {verifyText && !confirmed && (
                        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                            Text does not match — type exactly: <code>{expectedText}</code>
                        </div>
                    )}
                </div>

                {copyErr && (
                    <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '9px 13px', fontSize: 12.5, marginTop: 10 }}>
                        ❌ {copyErr}
                    </div>
                )}
            </div>

            <div className="bf-footer">
                <button className="bf-btn-sec" onClick={onBack} disabled={copying}>← Back</button>
                <button
                    className="bf-btn-pri"
                    onClick={doCopy}
                    disabled={!confirmed || copying}
                    style={{ background: confirmed ? '#16a34a' : undefined, transition: 'background .2s' }}
                >
                    {copying ? 'Copying…' : '✓ Copy BOM'}
                </button>
            </div>
        </>
    );
};

// ═══════════════════════════════════════════════════════════════════
// BomCopy — main slide-over shell
// ═══════════════════════════════════════════════════════════════════
const BomCopy = ({ onClose }) => {
    const [step,      setStep]      = useState(1);
    const [targetJob, setTargetJob] = useState(null);
    const [sourceBom, setSourceBom] = useState(null);

    return ReactDOM.createPortal(
        <div className="bf-overlay"
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}>
            <div className="bf-panel"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bf-header">
                    <div>
                        <div className="bf-header-title">⎘ Copy BOM from Existing</div>
                        <div className="bf-header-sub">Create a new BOM by copying line items from an existing one</div>
                    </div>
                    <button className="bf-close" onClick={onClose}>✕</button>
                </div>

                {/* Step indicator */}
                <Stepper step={step} />

                {/* Step panels */}
                {step === 1 && (
                    <Step1
                        onNext={job => { setTargetJob(job); setStep(2); }}
                        onClose={onClose}
                    />
                )}
                {step === 2 && (
                    <Step2
                        targetJob={targetJob}
                        onNext={bom => { setSourceBom(bom); setStep(3); }}
                        onBack={() => setStep(1)}
                    />
                )}
                {step === 3 && (
                    <Step3
                        targetJob={targetJob}
                        sourceBom={sourceBom}
                        onBack={() => setStep(2)}
                        onClose={onClose}
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

export default BomCopy;
