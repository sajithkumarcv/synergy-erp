import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { STATUS, AUDIT_ACTION_CONFIG, fmtDateTime, fmtRelative, fmt, fmtDate, canEdit } from '../jobConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';

// ── Finance input helpers ─────────────────────────────────────
const stripFmt  = (v) => String(v).replace(/,/g, '');
const fmtInput  = (v) => {
    const n = parseFloat(stripFmt(v));
    if (isNaN(n)) return v;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseAmt  = (v) => parseFloat(stripFmt(v));

// ─────────────────────────────────────────────────────────────
// OverviewTab  — KPI cards + job info grid + audit timeline
// ─────────────────────────────────────────────────────────────
const ADJ_STATUS = {
    1: { label: 'Open',        bg: '#dbeafe', color: '#1e40af' },
    2: { label: 'In Progress', bg: '#fef9c3', color: '#854d0e' },
    3: { label: 'Completed',   bg: '#dcfce7', color: '#166534' },
    4: { label: 'On Hold',     bg: '#fce7f3', color: '#9d174d' },
    5: { label: 'Cancelled',   bg: '#fee2e2', color: '#991b1b' },
};

const OverviewTab = ({ job, onRefresh, userRole, currentUser }) => {
    const navigate       = useNavigate();
    const { canDo }      = usePermission();
    const { lookups, baseCurrency, baseCurrencyCode } = useLookup();
    const { currencies } = lookups;

    const [audit,           setAudit]          = useState([]);
    const [loadingAudit,    setLoadingAudit]    = useState(true);
    const [additionalJobs,  setAdditionalJobs]  = useState([]);
    const [loadingAddl,     setLoadingAddl]     = useState(false);

    // Finance edit state
    const [showFinEdit,  setShowFinEdit]  = useState(false);
    const [finForm,      setFinForm]      = useState({ currencyId: '', exchangeRate: '', orderValue: '', advanceAmount: '' });
    const [saving,       setSaving]       = useState(false);
    const [finError,     setFinError]     = useState('');

    useEffect(() => {
        if (!job?.jobId) return;
        setLoadingAudit(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/audit`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setAudit(Array.isArray(d) ? d : []))
            .catch(console.error).finally(() => setLoadingAudit(false));
    }, [job?.jobId]);

    useEffect(() => {
        if (!job?.jobId) return;
        setLoadingAddl(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/additional-jobs`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setAdditionalJobs(Array.isArray(d) ? d : []))
            .catch(console.error).finally(() => setLoadingAddl(false));
    }, [job?.jobId]);

    if (!job) return null;

    const status        = STATUS[job.jobStatusId] || STATUS[1];
    // KPI amounts are shown in the JOB currency (as stored).
    const jobCcy        = job.currencyName || baseCurrencyCode || '';
    const jobExcRate    = Number(job.jobExcRate || 1);
    const baseCode      = baseCurrencyCode || jobCcy;
    const isForeign     = baseCurrency != null && job.jobCurrencyId != null
        ? Number(job.jobCurrencyId) !== Number(baseCurrency.id)
        : jobExcRate !== 1;
    const budget        = Number(job.orderValue        || 0);
    const actual        = Number(job.totalActual       || 0);
    const invoiced      = Number(job.totalInvoicing    || 0);
    const payments      = Number(job.totalPayments     || 0);
    const credits       = Number(job.totalCredit       || 0);
    const advance       = Number(job.jobAdvanceAmount  || 0);
    const balInvoice    = budget   - invoiced;              // Order Value − Invoiced
    const balPayment    = invoiced - payments - credits;    // Invoiced − Payments − Credit Notes
    const actPct        = budget > 0 ? Math.min(100, Math.round((actual   / budget) * 100)) : 0;
    const invPct        = budget > 0 ? Math.min(100, Math.round((invoiced / budget) * 100)) : 0;

    const openFinEdit = () => {
        // OrderValue / Advance are stored in the JOB currency — edit them as-is.
        setFinForm({
            currencyId:    String(job.jobCurrencyId || ''),
            exchangeRate:  String(job.jobExcRate    || ''),
            orderValue:    job.orderValue         ? fmtInput(job.orderValue)         : '',
            advanceAmount: job.jobAdvanceAmount   ? fmtInput(job.jobAdvanceAmount)   : '',
        });
        setFinError('');
        setShowFinEdit(true);
    };

    const handleCurrency = (e) => {
        const id    = e.target.value;
        const cur   = currencies.find(c => String(c.id) === id);
        const isBase = baseCurrency != null && Number(id) === Number(baseCurrency.id);
        setFinForm(p => ({ ...p, currencyId: id, exchangeRate: isBase ? '1' : (cur ? String(cur.exchangeRate) : p.exchangeRate) }));
    };

    const saveFinance = () => {
        const cid = Number(finForm.currencyId);
        const er  = parseFloat(finForm.exchangeRate);
        const ov  = parseAmt(finForm.orderValue);
        const aa  = parseAmt(finForm.advanceAmount);
        if (!cid)              { setFinError('Please select a currency.');                     return; }
        if (isNaN(er) || er <= 0) { setFinError('Exchange rate must be greater than 0.');     return; }
        if (isNaN(ov) || ov < 0) { setFinError('Order value must be a positive number.');     return; }
        const aa2 = (finForm.advanceAmount === '' || finForm.advanceAmount == null) ? 0 : aa;
        if (isNaN(aa2) || aa2 < 0) { setFinError('Advance amount must be a positive number.'); return; }

        setSaving(true); setFinError('');
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/finance`, {
            method:  'PATCH',
            headers: authHeaders(),
            body:    JSON.stringify({ currencyId: cid, exchangeRate: er, orderValue: ov, advanceAmount: aa2, modifiedBy: currentUser }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setFinError(d.message || 'Save failed.'); return; }
                setShowFinEdit(false);
                onRefresh();
            })
            .catch(() => setFinError('Network error.'))
            .finally(() => setSaving(false));
    };

    const allowFinEdit = canDo('/jobs', 'EDIT_FINANCE') && canEdit(job?.jobStatusId);

    return (
        <div className="ov-wrap">
            {/* ── KPI strip ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                <div className="ov-kpi-row" style={{ flex: 1 }}>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Order Value</div>
                        <div className="ov-kpi-value">{fmt(budget)}</div>
                        <div className="ov-kpi-sub">
                            {jobCcy}
                            {isForeign && <> · ≈ {fmt(budget * jobExcRate)} {baseCode}</>}
                        </div>
                    </div>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Actual Cost</div>
                        <div className="ov-kpi-value ov-kpi-warn">{fmt(actual)}</div>
                        <div className="ov-kpi-sub">{actPct}% of order</div>
                    </div>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Invoiced</div>
                        <div className="ov-kpi-value ov-kpi-good">{fmt(invoiced)}</div>
                        <div className="ov-kpi-sub">{invPct}% of order</div>
                    </div>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Bal. to Invoice</div>
                        <div className={`ov-kpi-value ${balInvoice < 0 ? 'ov-kpi-danger' : 'ov-kpi-good'}`}>{fmt(balInvoice)}</div>
                        <div className="ov-kpi-sub">Order − Invoiced</div>
                    </div>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Credit Notes</div>
                        <div className="ov-kpi-value">{fmt(credits)}</div>
                        <div className="ov-kpi-sub">Applied</div>
                    </div>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Bal. Payments</div>
                        <div className={`ov-kpi-value ${balPayment < 0 ? 'ov-kpi-danger' : balPayment > 0 ? 'ov-kpi-warn' : 'ov-kpi-good'}`}>{fmt(balPayment)}</div>
                        <div className="ov-kpi-sub">Invoiced − Paid − Credits</div>
                    </div>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Advance</div>
                        <div className="ov-kpi-value">{fmt(advance)}</div>
                        <div className="ov-kpi-sub">Received</div>
                    </div>
                    <div className="ov-kpi">
                        <div className="ov-kpi-label">Status</div>
                        <div className="ov-kpi-status">
                            <span className="ov-status-dot" style={{ background: status.dot }} />
                            <span style={{ color: status.color, fontWeight: 700 }}>{status.label}</span>
                        </div>
                        <div className="ov-kpi-sub">{job.jobStageName || '—'}</div>
                    </div>
                </div>

                {/* Edit finance button — role-gated */}
                {allowFinEdit && !showFinEdit && (
                    <button
                        onClick={openFinEdit}
                        style={{
                            alignSelf: 'flex-start', marginTop: 10, marginLeft: 10, flexShrink: 0,
                            background: '#2e5fa3', color: '#fff', border: '1px solid #2e5fa3',
                            borderRadius: 6, padding: '5px 13px', fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                        title="Edit order value and advance amount"
                    >
                        ✏️ Edit Financials
                    </button>
                )}
            </div>

            {/* ── Finance edit panel ── */}
            {showFinEdit && (
                <div style={{
                    background: '#f8fafc', border: '1px solid #b6cae8', borderLeft: '3px solid #2e5fa3',
                    borderRadius: 8, padding: '14px 18px', marginBottom: 16,
                    display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
                }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2e5fa3', width: '100%', marginBottom: 2 }}>
                        Edit Financial Values
                    </div>

                    {finError && (
                        <div style={{ width: '100%', background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
                            {finError}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Currency</label>
                        <select
                            className="tab-input"
                            style={{ width: 180 }}
                            value={finForm.currencyId}
                            onChange={handleCurrency}
                        >
                            <option value="">-- Select --</option>
                            {currencies.map(c => (
                                <option key={c.id} value={String(c.id)}>{c.name} ({c.shortName})</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Exc. Rate</label>
                        {(() => {
                            const isBase = baseCurrency != null && finForm.currencyId !== '' &&
                                Number(finForm.currencyId) === Number(baseCurrency.id);
                            return (
                                <input
                                    className="tab-input"
                                    type="number"
                                    step="0.000001"
                                    style={{ width: 120, textAlign: 'right', opacity: isBase ? 0.6 : 1, cursor: isBase ? 'not-allowed' : 'text' }}
                                    value={isBase ? '1' : finForm.exchangeRate}
                                    onChange={e => !isBase && setFinForm(p => ({ ...p, exchangeRate: e.target.value }))}
                                    disabled={isBase}
                                    title={isBase ? 'Base currency — exchange rate is always 1' : 'Exchange rate vs base currency'}
                                />
                            );
                        })()}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Order Value</label>
                        <input
                            className="tab-input"
                            type="text"
                            inputMode="decimal"
                            style={{ width: 160, textAlign: 'right' }}
                            placeholder="0.00"
                            value={finForm.orderValue}
                            onChange={e => setFinForm(p => ({ ...p, orderValue: stripFmt(e.target.value) }))}
                            onBlur={() => setFinForm(p => ({ ...p, orderValue: p.orderValue ? fmtInput(p.orderValue) : '' }))}
                            onFocus={e => { e.target.select(); setFinForm(p => ({ ...p, orderValue: stripFmt(p.orderValue) })); }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Advance Amount</label>
                        <input
                            className="tab-input"
                            type="text"
                            inputMode="decimal"
                            style={{ width: 160, textAlign: 'right' }}
                            placeholder="0.00"
                            value={finForm.advanceAmount}
                            onChange={e => setFinForm(p => ({ ...p, advanceAmount: stripFmt(e.target.value) }))}
                            onBlur={() => setFinForm(p => ({ ...p, advanceAmount: p.advanceAmount ? fmtInput(p.advanceAmount) : '' }))}
                            onFocus={e => { e.target.select(); setFinForm(p => ({ ...p, advanceAmount: stripFmt(p.advanceAmount) })); }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="tab-btn-pri"
                            onClick={saveFinance}
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                            className="tab-btn-sec"
                            onClick={() => setShowFinEdit(false)}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Progress bars ── */}
            {budget > 0 && (
                <div className="ov-progress-wrap">
                    <div className="ov-progress-label">
                        <span>Actual Cost</span>
                        <span><strong>{actPct}%</strong> of order ({fmt(actual)} / {fmt(budget)})</span>
                    </div>
                    <div className="ov-progress-track">
                        <div className="ov-progress-fill" style={{
                            width: `${actPct}%`,
                            background: actPct > 90 ? '#dc2626' : actPct > 70 ? '#d97706' : '#16a34a'
                        }} />
                    </div>
                    <div className="ov-progress-label" style={{ marginTop: 10 }}>
                        <span>Invoiced</span>
                        <span><strong>{invPct}%</strong> of order ({fmt(invoiced)} / {fmt(budget)})</span>
                    </div>
                    <div className="ov-progress-track">
                        <div className="ov-progress-fill" style={{
                            width: `${invPct}%`,
                            background: '#2e5fa3'
                        }} />
                    </div>
                </div>
            )}

            {/* ── Job details grid ── */}
            <div className="ov-detail-grid">
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Job Details</div>
                    <div className="ov-detail-rows">
                        <Row label="Job No."      value={<span className="ov-jobid">{job.jobId}</span>} />
                        <Row label="Type"         value={job.jobTypeName} />
                        <Row label="Stage"        value={job.jobStageName} />
                        <Row label="Job Date"     value={job.jobDate ? new Date(job.jobDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'} />
                        <Row label="Exc. Rate"    value={job.jobExcRate} />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Customer & Project</div>
                    <div className="ov-detail-rows">
                        <Row label="Customer"     value={job.customerName} />
                        <Row label="Code"         value={job.customerCode} />
                        <Row label="Project"      value={job.projectName} />
                        <Row label="External Ref" value={job.externalRef} />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">References & Dates</div>
                    <div className="ov-detail-rows">
                        <Row label="Contract Ref"   value={job.contractRef} />
                        <Row label="LPO Ref"        value={job.lpoRef} />
                        <Row label="LPO Date"       value={job.lpoDate ? new Date(job.lpoDate).toLocaleDateString('en-GB') : '—'} />
                        <Row label="Exp. Complete"  value={job.jobExpectedCompleteDate ? new Date(job.jobExpectedCompleteDate).toLocaleDateString('en-GB') : '—'} />
                        <Row label="Exp. Delivery"  value={job.jobExpectedDeliveryDate ? new Date(job.jobExpectedDeliveryDate).toLocaleDateString('en-GB') : '—'} />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Audit Info</div>
                    <div className="ov-detail-rows">
                        <Row label="Created By"   value={job.jobCreatedBy} />
                        <Row label="Created"      value={job.jobCreatedDate ? new Date(job.jobCreatedDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'} />
                        <Row label="Modified By"  value={job.jobLastModifiedBy || '—'} />
                        <Row label="Last Updated" value={job.jobLastUpdatedDate ? new Date(job.jobLastUpdatedDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'} />
                    </div>
                </div>
            </div>

            {/* ── Description ── */}
            {job.jobDescription && (
                <div className="ov-desc-card">
                    <div className="ov-detail-card-title">Job Description</div>
                    <p className="ov-desc-text">{job.jobDescription}</p>
                </div>
            )}

            {/* ── Additional Jobs ── */}
            {(loadingAddl || additionalJobs.length > 0) && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f' }}>🔗 Additional Jobs</span>
                        {additionalJobs.length > 0 && (
                            <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                                {additionalJobs.length}
                            </span>
                        )}
                    </div>
                    {loadingAddl ? (
                        <div style={{ color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>Loading…</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        {['Job No.', 'Description', 'LPO Ref', 'LPO Date', 'Order Value', 'Stage', 'Status', ''].map(h => (
                                            <th key={h} style={{
                                                padding: '7px 10px', textAlign: h === 'Order Value' ? 'right' : 'left',
                                                fontSize: 11, fontWeight: 700, color: '#64748b',
                                                textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap',
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {additionalJobs.map((r, i) => {
                                        const jid = r.jobId || r.JobId;
                                        const sid = r.jobStatusId ?? r.JobStatusId;
                                        const st  = ADJ_STATUS[sid] || { label: 'Unknown', bg: '#f1f5f9', color: '#64748b' };
                                        return (
                                            <tr key={jid}
                                                style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f8fafc'}>
                                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                                    <button onClick={() => navigate(`/jobs/${encodeURIComponent(jid)}`)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e5fa3', fontWeight: 700, fontSize: 12.5, padding: 0, textDecoration: 'underline' }}>
                                                        {jid}
                                                    </button>
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#475569', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.jobDescription || r.JobDescription || '—'}
                                                </td>
                                                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11.5, color: '#64748b' }}>
                                                    {r.lpoRef || r.LpoRef || '—'}
                                                </td>
                                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#64748b' }}>
                                                    {fmtDate(r.lpoDate || r.LpoDate)}
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'Courier New' }}>
                                                    {(r.orderValue || r.OrderValue) ? fmt(r.orderValue ?? r.OrderValue) : '—'}
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                    {r.jobStageName || r.JobStageName || '—'}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ background: st.bg, color: st.color, borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                                                        {st.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <button onClick={() => navigate(`/jobs/${encodeURIComponent(jid)}`)}
                                                        style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: '#2e5fa3', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                                                        Open
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                                        <td colSpan={4} style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                                            TOTAL ({additionalJobs.length} jobs)
                                        </td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Courier New', fontSize: 12.5, color: '#1e3a5f' }}>
                                            {fmt(additionalJobs.reduce((s, r) => s + (r.orderValue || r.OrderValue || 0), 0))}
                                        </td>
                                        <td colSpan={3} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Activity Timeline ── */}
            <div className="ov-timeline-wrap">
                <div className="ov-timeline-title">Activity Timeline</div>
                {loadingAudit
                    ? <div className="ov-timeline-loading">Loading activity…</div>
                    : audit.length === 0
                        ? <div className="ov-timeline-empty">No activity recorded yet.</div>
                        : (
                            <div className="ov-timeline">
                                {audit.map(a => {
                                    const cfg = AUDIT_ACTION_CONFIG[a.action] || { label: a.action, icon: '•', color: '#64748b' };
                                    return (
                                        <div key={a.auditId} className="ov-timeline-item">
                                            <div className="ov-tl-icon" style={{ color: cfg.color }}>{cfg.icon}</div>
                                            <div className="ov-tl-line" />
                                            <div className="ov-tl-body">
                                                <div className="ov-tl-header">
                                                    <span className="ov-tl-action" style={{ color: cfg.color }}>{cfg.label}</span>
                                                    <span className="ov-tl-section">{a.section}</span>
                                                    <span className="ov-tl-time" title={fmtDateTime(a.createdDate)}>{fmtRelative(a.createdDate)}</span>
                                                </div>
                                                {(a.newValue || a.oldValue) && (
                                                    <div className="ov-tl-detail">
                                                        {a.oldValue && <span className="ov-tl-old">← {a.oldValue}</span>}
                                                        {a.newValue && <span className="ov-tl-new">{a.newValue}</span>}
                                                    </div>
                                                )}
                                                <div className="ov-tl-by">by {a.createdBy}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                }
            </div>
        </div>
    );
};

const Row = ({ label, value }) => (
    <div className="ov-row">
        <span className="ov-row-label">{label}</span>
        <span className="ov-row-value">{value || '—'}</span>
    </div>
);

export default OverviewTab;
