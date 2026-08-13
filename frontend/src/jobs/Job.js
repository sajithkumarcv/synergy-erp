import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInitialFilters } from '../utils/useInitialFilters';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import { useFilters } from '../FilterContext';
import { useFieldConfig } from '../FieldConfigContext';
import { usePermission } from '../PermissionContext';
import './Job.css';
import RowLink from '../common/RowLink';

// ── Helpers ───────────────────────────────────────────────────
const fmt     = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Amount input helpers — format on blur, strip on focus/change
const stripAmt = (v) => String(v).replace(/,/g, '');
const fmtAmt   = (v) => { const n = parseFloat(stripAmt(v)); return isNaN(n) ? v : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const parseAmt = (v) => parseFloat(stripAmt(String(v))) || 0;

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { searchText: '', customerId: '', jobTypeIds: '', jobStatusIds: '', jobStageId: '', dateFrom: '', dateTo: '' };

const STATUS_MAP = {
  1: { label: 'Active',    bg: '#dcfce7', color: '#166534' },
  2: { label: 'Waiting',   bg: '#fef9c3', color: '#854d0e' },
  3: { label: 'Freezed',   bg: '#dbeafe', color: '#1e40af' },
  4: { label: 'Completed', bg: '#d1fae5', color: '#065f46' },
  5: { label: 'Cancelled', bg: '#fee2e2', color: '#991b1b' },
};

const StatusBadge = ({ id }) => {
  const s = STATUS_MAP[id] || { label: 'Unknown', bg: '#f1f5f9', color: '#64748b' };
  return <span className="job-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
};

// Approval status can be 'Draft', 'Approved', 'Rejected', or one of several
// in-flight strings ('PendingApproval', 'PendingL1'..'PendingL4', 'Submitted',
// 'L1Approved', 'SentBack', etc. — the exact wording depends on how many
// levels the job's approval policy has). Colour by category, show raw text.
const ApprovalBadge = ({ status }) => {
  const s = (status || 'Draft').trim();
  const up = s.toUpperCase();
  let bg = '#f1f5f9', color = '#64748b'; // Draft / unknown — grey
  if (up === 'APPROVED')                          { bg = '#dcfce7'; color = '#166534'; } // green
  else if (up === 'REJECTED')                      { bg = '#fee2e2'; color = '#991b1b'; } // red
  else if (up === 'SENTBACK' || up === 'SENT BACK'){ bg = '#fce7f3'; color = '#9d174d'; } // pink
  else if (up !== 'DRAFT')                          { bg = '#fef9c3'; color = '#854d0e'; } // amber — any in-flight state
  return <span className="job-badge" style={{ background: bg, color }}>{s}</span>;
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <span className="sort-icon sort-none">⇅</span>;
  return <span className="sort-icon sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ═══════════════════════════════════════════════════════════════
// NEW JOB FORM  — with live Job ID preview + costing flag
// ═══════════════════════════════════════════════════════════════
const JobForm = ({ jobTypes, jobStages, onClose, onSaved }) => {
  const currentUser = useCurrentUser();
  const { lookups }  = useLookup();
  const { isReq }    = useFieldConfig('JOB');
  const { currencies, jobStatuses } = lookups;

  const [form, setForm] = useState({
    jobTypeId:               '',
    jobStageId:              jobStages[0]?.jobStageId || '',
    customerId:              '',
    customerName:            '',
    jobCurrencyId:           currencies[0] ? String(currencies[0].id) : '',
    jobExcRate:              currencies[0]?.exchangeRate ?? 1,
    jobDescription:          '',
    jobDate:                 new Date().toISOString().slice(0, 10),
    projectName:             '',
    lpoDate:                 '',
    contractRef:             '',
    lpoRef:                  '',
    jobStatusId:             jobStatuses[0]?.id || 1,
    externalRef:             '',
    orderValue:              '',
    jobAdvanceAmount:        '',
    jobExpectedCompleteDate: '',
    jobExpectedDeliveryDate: '',
    parentJobId:             '',   // only required when preview.requiresParentJob
    parentJobLabel:          '',   // display text for selected parent job
    budgetCategoryId:        '',   // no longer exposed on the create form — always sent as null
  });

  // Auto-select first stage once stages are available
  useEffect(() => {
    if (jobStages.length > 0 && !form.jobStageId)
      setForm(p => ({ ...p, jobStageId: jobStages[0].jobStageId }));
  }, [jobStages]); // eslint-disable-line

  // Auto-select first currency + exchange rate once currencies load
  useEffect(() => {
    if (currencies.length > 0 && !form.jobCurrencyId)
      setForm(p => ({ ...p, jobCurrencyId: String(currencies[0].id), jobExcRate: currencies[0].exchangeRate ?? 1 }));
  }, [currencies]); // eslint-disable-line

  // Auto-select first job status once statuses load
  useEffect(() => {
    if (jobStatuses.length > 0 && !form.jobStatusId)
      setForm(p => ({ ...p, jobStatusId: jobStatuses[0].id }));
  }, [jobStatuses]); // eslint-disable-line

  // ── Job ID preview state ──────────────────────────────────────
  const [preview,        setPreview]       = useState(null);   // { previewJobId, jobTypeName, isCostingRequired, nextSeries }
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch preview whenever jobTypeId changes
  useEffect(() => {
    if (!form.jobTypeId) { setPreview(null); return; }
    setPreviewLoading(true);
    fetch(`${variables.API_URL}job/preview-id/${encodeURIComponent(form.jobTypeId)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setPreview(d))
      .catch(console.error)
      .finally(() => setPreviewLoading(false));
  }, [form.jobTypeId]);

  // Clear parent job when job type no longer requires it
  useEffect(() => {
    if (!preview?.requiresParentJob) {
      setForm(p => ({ ...p, parentJobId: '', parentJobLabel: '' }));
      setParentSearch('');
      setParentResults([]);
    }
  }, [preview?.requiresParentJob]); // eslint-disable-line

  // ── Customer search ───────────────────────────────────────────
  const [errors, setErrors] = useState({});
  const [saving, setSaving]           = useState(false);
  const [custSearch, setCustSearch]   = useState('');
  const [custResults, setCustResults] = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [custCredit, setCustCredit]   = useState(null);   // credit flag / hold of the picked customer

  // ── Parent Job search ─────────────────────────────────────────
  const [parentSearch,  setParentSearch]  = useState('');
  const [parentResults, setParentResults] = useState([]);
  const [parentLoading, setParentLoading] = useState(false);

  useEffect(() => {
    if (!parentSearch || parentSearch === form.parentJobLabel) { setParentResults([]); return; }
    const t = setTimeout(() => {
      setParentLoading(true);
      fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(parentSearch)}&pageSize=20&page=1&sortCol=JobDate&sortDir=DESC`, { headers: authHeaders() })
        .then(r => r.json())
        // Guard: an additional job (one that already has a parent) cannot
        // itself be used as a parent — only top-level jobs are valid parents.
        // We also keep the existing job-type guard (requiresParentJob means
        // the job-type itself is configured as an additional-job type).
        .then(d => setParentResults((d.data || []).filter(j => !j.parentJobId && !j.requiresParentJob)))
        .catch(console.error).finally(() => setParentLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [parentSearch]); // eslint-disable-line

  const pickParent = (j) => {
    // Defensive guard — list filter already strips these, but block again here
    // so a stale dropdown row or future regression cannot create a grandchild.
    if (j.parentJobId) {
      setErrors(p => ({ ...p, parentJobId: `Job ${j.jobId} is itself an additional job (parent: ${j.parentJobId}) and cannot be used as a parent.` }));
      return;
    }
    if (j.requiresParentJob) {
      setErrors(p => ({ ...p, parentJobId: `Job ${j.jobId} is of an additional-job type and cannot be used as a parent.` }));
      return;
    }
    const label = `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`;
    setForm(p => ({ ...p, parentJobId: j.jobId, parentJobLabel: label }));
    setParentSearch(label);
    setParentResults([]);
    if (errors.parentJobId) setErrors(p => ({ ...p, parentJobId: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.jobTypeId)                          e.jobTypeId     = 'Job Type is required.';
    if (preview?.requiresParentJob && !form.parentJobId)
                                                  e.parentJobId   = 'Parent Job is required for this job type.';
    if (!form.jobStageId)                         e.jobStageId    = 'Job Stage is required.';
    if (!form.customerId)                         e.customerId    = 'Customer is required.';
    if (!form.jobDate)                            e.jobDate       = 'Job Date is required.';
    if (!form.jobCurrencyId)                      e.jobCurrencyId = 'Currency is required.';
    if (!form.jobExcRate || Number(form.jobExcRate) <= 0)
                                                  e.jobExcRate    = 'Exchange Rate must be greater than 0.';
    if (form.orderValue && parseAmt(form.orderValue) < 0)
                                                  e.orderValue    = 'Order Value cannot be negative.';
    if (form.jobAdvanceAmount && parseAmt(form.jobAdvanceAmount) < 0)
                                                  e.jobAdvanceAmount = 'Advance Amount cannot be negative.';
    if (form.jobExpectedCompleteDate && form.jobDate &&
        form.jobExpectedCompleteDate < form.jobDate)
                                                  e.jobExpectedCompleteDate = 'Completion date cannot be before Job Date.';
    if (form.jobExpectedDeliveryDate && form.jobExpectedCompleteDate &&
        form.jobExpectedDeliveryDate < form.jobExpectedCompleteDate)
                                                  e.jobExpectedDeliveryDate = 'Delivery date cannot be before Completion date.';
    return e;
  };

  const handle = (e) => {
    const { name, value } = e.target;
    if (name === 'jobCurrencyId') {
      // Auto-fill exchange rate from the selected currency
      const cur = currencies.find(c => String(c.id) === value);
      setForm(p => ({ ...p, jobCurrencyId: value, jobExcRate: cur?.exchangeRate ?? p.jobExcRate }));
    } else {
      setForm(p => ({ ...p, [name]: value }));
    }
    if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
  };

  useEffect(() => {
    if (!custSearch || custSearch === form.customerName) { setCustResults([]); return; }
    const t = setTimeout(() => {
      setCustLoading(true);
      fetch(`${variables.API_URL}customer/search?searchText=${encodeURIComponent(custSearch)}&pageSize=8&page=1&sortCol=CustomerName&sortDir=ASC`, { headers: authHeaders() })
        .then(r => r.json()).then(d => setCustResults(d.data || []))
        .catch(console.error).finally(() => setCustLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [custSearch]); // eslint-disable-line

  const pickCustomer = (c) => {
    setForm(p => ({ ...p, customerId: c.customerId, customerName: c.customerName }));
    setCustSearch(c.customerName); setCustResults([]);
    setCustCredit({
      flag:      (c.creditFlag || 'GREEN').toUpperCase(),
      flagLabel: c.creditFlagLabel || 'Good Standing',
      hold:      !!c.creditHold,
      holdNote:  c.creditHoldNote || null,
    });
  };

  const [saveError, setSaveError] = useState('');

  const save = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    setSaveError('');

    // Convert empty strings to null for nullable fields — both dates
    // (System.Text.Json in .NET 8 can't deserialize "" to DateTime?) and
    // optional text fields (so unfilled fields store as NULL, not '').
    const d2n = v => v || null;

    fetch(`${variables.API_URL}job/save`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        ...form, jobId: null,
        jobCreatedBy:               currentUser,
        customerId:                 Number(form.customerId),
        jobCurrencyId:              Number(form.jobCurrencyId),
        jobExcRate:                 Number(form.jobExcRate),
        orderValue:                 parseAmt(form.orderValue),
        jobAdvanceAmount:           parseAmt(form.jobAdvanceAmount),
        jobStatusId:                Number(form.jobStatusId),
        lpoDate:                    d2n(form.lpoDate),
        jobExpectedCompleteDate:    d2n(form.jobExpectedCompleteDate),
        jobExpectedDeliveryDate:    d2n(form.jobExpectedDeliveryDate),
        jobDescription:             d2n(form.jobDescription),
        projectName:                d2n(form.projectName),
        contractRef:                d2n(form.contractRef),
        lpoRef:                     d2n(form.lpoRef),
        externalRef:                d2n(form.externalRef),
        parentJobId:                form.parentJobId || null,
        parentJobLabel:             undefined,   // UI-only — strip before sending
        budgetCategoryId:           form.budgetCategoryId ? Number(form.budgetCategoryId) : null,
      })
    })
    .then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (!ok) {
        // ASP.NET Core model validation errors come as { title, errors: { field: [msgs] } }
        // SP / controller errors come as { message: "..." }
        const msg = d?.message
          || d?.title
          || (d?.errors ? Object.entries(d.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ') : null)
          || 'Failed to create job. Please try again.';
        setSaveError(msg);
        return;
      }
      const newJobId = d.jobId;

      // In-house job types (IsCostingRequired = 0) skip Terms/Meta entry —
      // auto-fill with fixed defaults so only Engineer + Documents remain.
      if (preview?.isCostingRequired === false) {
        Promise.all([
          fetch(`${variables.API_URL}job/${encodeURIComponent(newJobId)}/terms`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
              jobId:             newJobId,
              jobPaymentTerms:   'INHOUSE',
              warrantyTerms:     'INHOUSE',
              jobDeliveryTerms:  'INHOUSE',
              createdBy:         currentUser,
            }),
          }),
          Promise.all([
            fetch(`${variables.API_URL}job/bays`,           { headers: authHeaders() }).then(r => r.json()),
            fetch(`${variables.API_URL}job/categories`,      { headers: authHeaders() }).then(r => r.json()),
            fetch(`${variables.API_URL}job/quality-levels`,  { headers: authHeaders() }).then(r => r.json()),
          ]).then(([bays, cats, quals]) => {
            const bay  = (bays  || []).find(b => (b.bayName          || '').trim().toLowerCase() === 'default');
            const cat  = (cats  || []).find(c => (c.jobCategoryName  || '').trim().toLowerCase() === 'default');
            const qual = (quals || []).find(q => (q.qualityLevelName || '').trim().toLowerCase() === 'default');
            if (!bay || !cat || !qual) return; // no 'Default' row configured — skip silently
            return fetch(`${variables.API_URL}job/${encodeURIComponent(newJobId)}/meta`, {
              method: 'POST', headers: authHeaders(),
              body: JSON.stringify({
                bayId:          bay.bayId,
                jobCategoryId:  cat.jobCategoryId,
                qualityLevelId: qual.qualityLevelId,
                totalUnits:     1,
                modifiedBy:     currentUser,
              }),
            });
          }),
        ])
        .catch(console.error)
        .finally(() => { onSaved(newJobId); onClose(); });
      } else {
        onSaved(newJobId);
        onClose();
      }
    })
    .catch(() => setSaveError('Network error. Please check your connection.'))
    .finally(() => setSaving(false));
  };

  const Sec = ({ label }) => (
    <div className="jf-section">
      <span className="jf-section-label">{label}</span>
      <div className="jf-section-line" />
    </div>
  );

  return (
    <div className="jf-overlay">
      <div className="jf-panel" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="jf-header">
          <div>
            <div className="jf-header-title">+ New Job</div>
            <div className="jf-header-sub">Fill in the details to create a new job</div>
          </div>
          <button className="jf-close" onClick={onClose}>✕</button>
        </div>

        <div className="jf-body">

          {/* ── Save error banner ── */}
          {saveError && (
            <div className="jf-validation-banner" style={{ background: '#fee2e2', borderColor: '#fca5a5' }}>
              <span>❌</span>
              <div><strong>Save failed:</strong> {saveError}</div>
            </div>
          )}

          {/* ── Validation summary banner ── */}
          {Object.keys(errors).length > 0 && (
            <div className="jf-validation-banner">
              <span className="jf-validation-icon">⚠️</span>
              <div>
                <strong>Please fix the following errors before saving:</strong>
                <ul className="jf-validation-list">
                  {Object.values(errors).map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              JOB ID PREVIEW BANNER
              Shown immediately — updates on job type change
          ══════════════════════════════════════════════════ */}
          <div className="jf-id-preview-wrap">
            {previewLoading ? (
              <div className="jf-id-preview jf-id-loading">
                <span className="jf-id-spinner" />
                <span>Generating Job ID…</span>
              </div>
            ) : preview ? (
              <div className="jf-id-preview">
                {/* Job ID */}
                <div className="jf-id-main">
                  <span className="jf-id-label">Job ID will be</span>
                  <span className="jf-id-value">{preview.previewJobId}</span>
                  <span className="jf-id-series">Series #{preview.nextSeries}</span>
                </div>
                {/* Costing required badge */}
                <div className="jf-id-flags">
                  {preview.isCostingRequired ? (
                    <span className="jf-costing-badge jf-costing-yes">
                      📊 Costing Required
                    </span>
                  ) : (
                    <span className="jf-costing-badge jf-costing-no">
                      ✓ No Costing Required
                    </span>
                  )}
                  {preview.requiresParentJob && (
                    <span className="jf-costing-badge jf-costing-yes">
                      🔗 Parent Job Required
                    </span>
                  )}
                  <span className="jf-type-badge">{preview.jobTypeName}</span>
                </div>
              </div>
            ) : (
              <div className="jf-id-preview jf-id-empty">
                Select a Job Type to see the assigned Job ID
              </div>
            )}
          </div>

          <Sec label="Job Identity" />
          <div className="jf-row">
            <div className="jf-field">
              <label>Job Type {isReq('jobTypeId') && <span className="req">*</span>}</label>
              <select name="jobTypeId" className={`jf-input${errors.jobTypeId ? ' jf-input-err' : ''}`} value={form.jobTypeId} onChange={handle}>
                <option value="">-- Select --</option>
                {jobTypes.map(t => <option key={t.jobTypeId} value={t.jobTypeId}>{t.jobTypeName}</option>)}
              </select>
              {errors.jobTypeId && <span className="jf-err-msg">{errors.jobTypeId}</span>}
            </div>
            <div className="jf-field">
              <label>Stage</label>
              <select name="jobStageId" className="jf-input" value={form.jobStageId} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }}>
                {jobStages.map(s => <option key={s.jobStageId} value={s.jobStageId}>{s.jobStageName}</option>)}
              </select>
            </div>
            <div className="jf-field">
              <label>Status</label>
              <select name="jobStatusId" className="jf-input" value={form.jobStatusId} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }}>
                {jobStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="jf-field" style={{ flex: '0 0 150px' }}>
              <label>Job Date {isReq('jobDate') && <span className="req">*</span>}</label>
              <input type="date" name="jobDate" className={`jf-input${errors.jobDate ? ' jf-input-err' : ''}`} value={form.jobDate} onChange={handle} />
              {errors.jobDate && <span className="jf-err-msg">{errors.jobDate}</span>}
            </div>
          </div>

          {/* ── Parent Job (only when job type requires it) ── */}
          {preview?.requiresParentJob && (
            <>
              <Sec label="Parent Job" />
              <div className="jf-row">
                <div className="jf-field jf-f2" style={{ position: 'relative' }}>
                  <label>Parent Job <span className="req">*</span></label>
                  <input
                    className={`jf-input ${form.parentJobId ? 'jf-input-ok' : ''}${errors.parentJobId ? ' jf-input-err' : ''}`}
                    placeholder="Type Job ID or description to search…"
                    value={parentSearch}
                    onChange={e => {
                      setParentSearch(e.target.value);
                      if (!e.target.value) setForm(p => ({ ...p, parentJobId: '', parentJobLabel: '' }));
                      if (errors.parentJobId) setErrors(p => ({ ...p, parentJobId: undefined }));
                    }}
                  />
                  {parentLoading && <span className="jf-cust-spinner">⏳</span>}
                  {form.parentJobId && (
                    <span
                      style={{ position: 'absolute', right: 8, top: 32, cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}
                      onClick={() => { setForm(p => ({ ...p, parentJobId: '', parentJobLabel: '' })); setParentSearch(''); }}
                    >✕</span>
                  )}
                  {errors.parentJobId && <span className="jf-err-msg">{errors.parentJobId}</span>}
                  {parentResults.length > 0 && (
                    <div className="jf-cust-dropdown">
                      {parentResults.map(j => (
                        <div key={j.jobId} className="jf-cust-option" onClick={() => pickParent(j)}>
                          <span className="jf-cust-code">{j.jobId}</span>
                          <span className="jf-cust-name">{j.projectName || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {form.parentJobId && (
                  <div className="jf-field" style={{ flex: '0 0 auto', alignSelf: 'flex-end', paddingBottom: 2 }}>
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                      ✓ {form.parentJobId}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          <Sec label="Customer" />
          <div className="jf-row">
            <div className="jf-field jf-f2" style={{ position: 'relative' }}>
              <label>Customer {isReq('customerId') && <span className="req">*</span>}</label>
              <input
                className={`jf-input ${form.customerId ? 'jf-input-ok' : ''}${errors.customerId ? ' jf-input-err' : ''}`}
                placeholder="Type to search customer…"
                value={custSearch}
                onChange={e => {
                  setCustSearch(e.target.value);
                  if (!e.target.value) { setForm(p => ({ ...p, customerId: '', customerName: '' })); setCustCredit(null); }
                  if (errors.customerId) setErrors(p => ({ ...p, customerId: undefined }));
                }}
              />
              {custLoading && <span className="jf-cust-spinner">⏳</span>}
              {errors.customerId && <span className="jf-err-msg">{errors.customerId}</span>}
              {custResults.length > 0 && (
                <div className="jf-cust-dropdown">
                  {custResults.map(c => {
                    const f = (c.creditFlag || 'GREEN').toUpperCase();
                    const dot = c.creditHold ? '#dc2626' : f === 'RED' ? '#dc2626' : f === 'YELLOW' ? '#ca8a04' : '#16a34a';
                    return (
                      <div key={c.customerId} className="jf-cust-option" onClick={() => pickCustomer(c)}>
                        <span className="jf-cust-code">{c.customerCode}</span>
                        <span className="jf-cust-name">{c.customerName}</span>
                        <span title={c.creditHold ? 'On credit hold' : (c.creditFlagLabel || '')}
                              style={{ marginLeft: 'auto', width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                      </div>
                    );
                  })}
                </div>
              )}
              {/* ── Credit warning for the picked customer ── */}
              {custCredit && (custCredit.hold || custCredit.flag !== 'GREEN') && (() => {
                const danger = custCredit.hold || custCredit.flag === 'RED';
                const c = danger
                  ? { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: '⛔' }
                  : { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: '⚠' };
                return (
                  <div style={{ marginTop: 8, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: c.color, lineHeight: 1.5 }}>
                    <strong>{c.icon} {custCredit.hold ? 'Customer is on CREDIT HOLD' : `Credit flag: ${custCredit.flagLabel}`}</strong>
                    {custCredit.hold && custCredit.holdNote && <div style={{ marginTop: 2 }}>Reason: {custCredit.holdNote}</div>}
                    <div style={{ marginTop: 2, fontWeight: 500 }}>
                      {danger
                        ? 'Please review the account / get approval before creating a job for this customer.'
                        : 'Proceed with caution — this customer is not in good standing.'}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="jf-field jf-f2">
              <label>Project Name</label>
              <input name="projectName" className="jf-input" value={form.projectName} onChange={handle} placeholder="Site / project description" />
            </div>
            <div className="jf-field">
              <label>External Ref</label>
              <input name="externalRef" className="jf-input" value={form.externalRef} onChange={handle} placeholder="Client ref" />
            </div>
          </div>

          <Sec label="References" />
          <div className="jf-row">
            <div className="jf-field">
              <label>Contract Ref</label>
              <input name="contractRef" className="jf-input" value={form.contractRef} onChange={handle} />
            </div>
            <div className="jf-field">
              <label>LPO Ref</label>
              <input name="lpoRef" className="jf-input" value={form.lpoRef} onChange={handle} />
            </div>
            <div className="jf-field" style={{ flex: '0 0 150px' }}>
              <label>LPO Date</label>
              <input type="date" name="lpoDate" className="jf-input" value={form.lpoDate} onChange={handle} />
            </div>
          </div>

          <Sec label="Financial" />
          <div className="jf-row">
            <div className="jf-field">
              <label>Currency {isReq('jobCurrencyId') && <span className="req">*</span>}</label>
              <select name="jobCurrencyId" className={`jf-input${errors.jobCurrencyId ? ' jf-input-err' : ''}`} value={form.jobCurrencyId} onChange={handle}>
                <option value="">-- Select --</option>
                {currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name} ({c.shortName})</option>)}
              </select>
              {errors.jobCurrencyId && <span className="jf-err-msg">{errors.jobCurrencyId}</span>}
            </div>
            <div className="jf-field" style={{ flex: '0 0 140px' }}>
              <label>Exc. Rate {isReq('jobExcRate') && <span className="req">*</span>}</label>
              <input
                type="number" name="jobExcRate"
                className="jf-input"
                value={form.jobExcRate}
                onChange={handle}
                step="0.000001"
                style={{ background: '#f0f4fa', color: '#3a5070' }}
                title="Auto-filled from currency master — edit if needed"
              />
            </div>
            <div className="jf-field">
              <label>Order Value</label>
              <input
                type="text" inputMode="decimal" name="orderValue"
                className={`jf-input${errors.orderValue ? ' jf-input-err' : ''}`}
                style={{ textAlign: 'right' }}
                value={form.orderValue}
                placeholder="0.00"
                onChange={e => { setForm(p => ({ ...p, orderValue: stripAmt(e.target.value) })); if (errors.orderValue) setErrors(p => ({ ...p, orderValue: undefined })); }}
                onBlur={() => setForm(p => ({ ...p, orderValue: p.orderValue ? fmtAmt(p.orderValue) : '' }))}
                onFocus={e => { e.target.select(); setForm(p => ({ ...p, orderValue: stripAmt(p.orderValue) })); }}
              />
              {errors.orderValue && <span className="jf-err-msg">{errors.orderValue}</span>}
            </div>
            <div className="jf-field">
              <label>Advance</label>
              <input
                type="text" inputMode="decimal" name="jobAdvanceAmount"
                className={`jf-input${errors.jobAdvanceAmount ? ' jf-input-err' : ''}`}
                style={{ textAlign: 'right' }}
                value={form.jobAdvanceAmount}
                placeholder="0.00"
                onChange={e => { setForm(p => ({ ...p, jobAdvanceAmount: stripAmt(e.target.value) })); if (errors.jobAdvanceAmount) setErrors(p => ({ ...p, jobAdvanceAmount: undefined })); }}
                onBlur={() => setForm(p => ({ ...p, jobAdvanceAmount: p.jobAdvanceAmount ? fmtAmt(p.jobAdvanceAmount) : '' }))}
                onFocus={e => { e.target.select(); setForm(p => ({ ...p, jobAdvanceAmount: stripAmt(p.jobAdvanceAmount) })); }}
              />
              {errors.jobAdvanceAmount && <span className="jf-err-msg">{errors.jobAdvanceAmount}</span>}
            </div>
          </div>

          <Sec label="Timeline" />
          <div className="jf-row">
            <div className="jf-field">
              <label>Exp. Completion</label>
              <input type="date" name="jobExpectedCompleteDate" className={`jf-input${errors.jobExpectedCompleteDate ? ' jf-input-err' : ''}`} value={form.jobExpectedCompleteDate} onChange={handle} />
              {errors.jobExpectedCompleteDate && <span className="jf-err-msg">{errors.jobExpectedCompleteDate}</span>}
            </div>
            <div className="jf-field">
              <label>Exp. Delivery</label>
              <input type="date" name="jobExpectedDeliveryDate" className={`jf-input${errors.jobExpectedDeliveryDate ? ' jf-input-err' : ''}`} value={form.jobExpectedDeliveryDate} onChange={handle} />
              {errors.jobExpectedDeliveryDate && <span className="jf-err-msg">{errors.jobExpectedDeliveryDate}</span>}
            </div>
          </div>

          <Sec label="Description" />
          <div className="jf-row">
            <div className="jf-field" style={{ flex: 1 }}>
              <label>Job Description</label>
              <textarea name="jobDescription" className="jf-input jf-textarea" rows={3}
                value={form.jobDescription} onChange={handle}
                placeholder="Describe the scope of work…" />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="jf-footer">
          <div className="jf-footer-left">
            {preview && (
              <span className="jf-footer-id-hint">
                Will create: <strong>{preview.previewJobId}</strong>
                {preview.isCostingRequired  && <span className="jf-footer-costing"> · Costing required</span>}
              {preview.requiresParentJob && <span className="jf-footer-costing"> · Parent job required</span>}
              </span>
            )}
          </div>
          <div className="jf-footer-right">
            <button className="jf-btn-sec" onClick={onClose}>Cancel</button>
            <button className="jf-btn-pri" onClick={save} disabled={saving || !preview}>
              {saving ? 'Creating…' : `Create ${preview?.previewJobId || 'Job'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN JOB LIST PAGE
// ═══════════════════════════════════════════════════════════════
export const Job = () => {
  const navigate = useNavigate();
  const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
  const { canDo } = usePermission();
  const canAdd    = canDo('/jobs', 'ADD');
  const { baseCurrencyCode } = useLookup();
  // Seeded from dashboard tiles (e.g. "Active Jobs" → jobStatusIds='1') —
  // see [[weberp-synergy-fork]]. Falls back to DEFAULT_FILTERS untouched
  // when this route was reached any other way.
  const initialFilters = useInitialFilters(DEFAULT_FILTERS);

  const [rows, setRows]         = useState([]);
  const [totalRows, setTotal]   = useState(0);
  const [totalPages, setPages]  = useState(1);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(200);
  // Default: grouped by Job Type, newest-created first within each type
  // (the secondary "CreatedDate DESC" tiebreak lives in sp_SearchJobs itself
  // whenever sorting by JobTypeName, not just on this initial load).
  const [sortCol, setSortCol]   = useState('JobTypeName');
  const [sortDir, setSortDir]   = useState('ASC');
  const [loading, setLoading]   = useState(false);
  const [applied, setApplied]   = useState(initialFilters);
  const [jobTypes,  setJobTypes]  = useState([]);
  const [jobStages, setJobStages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm,  setShowForm]  = useState(false);

  const gridRef = useRef({ pageSize: 200, sortCol: 'JobTypeName', sortDir: 'ASC', applied: DEFAULT_FILTERS });
  useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

  useEffect(() => {
    const h = authHeaders();
    fetch(`${variables.API_URL}job/types`,  { headers: h }).then(r => r.json()).then(d => setJobTypes(Array.isArray(d)  ? d : [])).catch(console.error);
    fetch(`${variables.API_URL}job/stages`, { headers: h }).then(r => r.json()).then(d => setJobStages(Array.isArray(d) ? d : [])).catch(console.error);
    fetch(`${variables.API_URL}customer/search?pageSize=500&page=1&sortCol=CustomerName&sortDir=ASC`, { headers: h })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setCustomers(d.data || []))
      .catch(console.error);
  }, []);

  const load = useCallback((pg, ps, sc, sd, af) => {
    setLoading(true);
    const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
    if (af.searchText)   q.set('searchText',   af.searchText);
    if (af.customerId)   q.set('customerId',   af.customerId);
    if (af.jobTypeIds)   q.set('jobTypeIds',   af.jobTypeIds);
    if (af.jobStatusIds) q.set('jobStatusIds', af.jobStatusIds);
    if (af.jobStageId)   q.set('jobStageId',   af.jobStageId);
    if (af.dateFrom)     q.set('dateFrom',     af.dateFrom);
    if (af.dateTo)       q.set('dateTo',       af.dateTo);
    fetch(`${variables.API_URL}job/search?${q}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(1, pageSize, sortCol, sortDir, initialFilters); }, [load]); // eslint-disable-line

  // Mount-only: register with empty options to avoid re-render loop
  useEffect(() => {
    const onApply = (vals) => {
      const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
      setApplied({ ...vals }); setPage(1);
      load(1, ps, sc, sd, vals);
    };
    registerFilters('job', {
      searchText:   { label: 'Search',    type: 'text',        placeholder: 'Job ID, customer, project…' },
      customerId:   { label: 'Customer',  type: 'select',      placeholder: 'All Customers', options: [] },
      jobTypeIds:   { label: 'Job Type',  type: 'multiselect', options: [] },
      jobStatusIds: { label: 'Status',    type: 'multiselect',
                      options: Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label })) },
      jobStageId:   { label: 'Stage',     type: 'select',      placeholder: 'All Stages',    options: [] },
      dateFrom:     { label: 'Date From', type: 'date' },
      dateTo:       { label: 'Date To',   type: 'date' },
    }, initialFilters, onApply);
    return () => unregisterFilters('job');
  }, []); // eslint-disable-line

  // Patch dropdown options once lookups are ready (never re-registers)
  useEffect(() => {
    updateFilterDefs('job', {
      searchText:   { label: 'Search',    type: 'text',        placeholder: 'Job ID, customer, project…' },
      customerId:   { label: 'Customer',  type: 'select',      placeholder: 'All Customers',
                      options: customers.map(c => ({ value: String(c.customerId), label: c.customerName })) },
      jobTypeIds:   { label: 'Job Type',  type: 'multiselect',
                      options: jobTypes.map(t => ({ value: t.jobTypeId, label: t.jobTypeName })) },
      jobStatusIds: { label: 'Status',    type: 'multiselect',
                      options: Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label })) },
      jobStageId:   { label: 'Stage',     type: 'select',      placeholder: 'All Stages',
                      options: jobStages.map(s => ({ value: s.jobStageId, label: s.jobStageName })) },
      dateFrom:     { label: 'Date From', type: 'date' },
      dateTo:       { label: 'Date To',   type: 'date' },
    });
  }, [jobTypes, jobStages, customers]); // eslint-disable-line

  const handleSort = (col) => {
    const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
    setSortCol(col); setSortDir(dir); setPage(1);
    load(1, pageSize, col, dir, applied);
  };
  const goPage        = (p)  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
  const changePageSize= (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

  const Th = ({ col, children, style }) => (
    <th className="th-sortable" style={style} onClick={() => handleSort(col)}>
      <span className="th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></span>
    </th>
  );

  const pageNums = () => {
    const cur = page, range = 5;
    let start = Math.max(1, cur - Math.floor(range / 2));
    let end   = Math.min(totalPages, start + range - 1);
    if (end - start < range - 1) start = Math.max(1, end - range + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  return (
    <div className="job-page">

      {showForm && (
        <JobForm
          jobTypes={jobTypes}
          jobStages={jobStages}
          onClose={() => setShowForm(false)}
          onSaved={(newJobId) => { setShowForm(false); navigate(`/jobs/${newJobId}`); }}
        />
      )}

      <div className="job-grid-wrap">
        <div className="job-grid-header">
          <div className="job-title-row">
            <div>
              <h2 className="job-page-title">Jobs</h2>
              <div className="job-page-sub">
                <strong style={{ color: 'var(--primary,#1e3a5f)', fontWeight: 700, fontSize: 13 }}>{totalRows}</strong>{' '}
                record{totalRows !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="job-toolbar">
              <select className="job-select" style={{ width: 110 }} value={pageSize}
                onChange={e => changePageSize(Number(e.target.value))}>
                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
              {canAdd && <button className="job-btn-pri" onClick={() => setShowForm(true)}>+ New Job</button>}
            </div>
          </div>
        </div>

        <div className="job-table-wrap">
          {loading && (
            <div className="job-loading-overlay">
              <div className="job-spinner">
                <div className="job-spinner-ring" />
                <span className="job-spinner-text">Loading…</span>
              </div>
            </div>
          )}
          <table className={`job-table${loading ? ' tbl-loading' : ''}`}>
            <thead><tr>
              <Th col="JobId">Job No.</Th>
              <Th col="JobDate">Date</Th>
              <Th col="CustomerName">Customer</Th>
              <Th col="ProjectName">Project</Th>
              <Th col="JobTypeName">Type</Th>
              <Th col="JobStageName">Stage</Th>
              <Th col="OrderValue" style={{ textAlign: 'right' }}>Order Value</Th>
              <th>Status</th>
              <th>Approval</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && !loading
                ? <tr><td colSpan="9" className="job-empty">No jobs found. Use the filters on the left or create a new job.</td></tr>
                : rows.map(j => (
                  <tr key={j.jobId}>
                    <td>
                      <RowLink className="job-id-link" to={`/jobs/${encodeURIComponent(j.jobId)}`}>
                        {j.jobId}
                      </RowLink>
                    </td>
                    <td>{fmtDate(j.jobDate)}</td>
                    <td>
                      <div className="job-cust-cell">
                        <span className="job-cust-name">{j.customerName || '—'}</span>
                        {j.customerCode && <span className="job-cust-code">{j.customerCode}</span>}
                      </div>
                    </td>
                    <td className="job-project-cell" title={j.projectName}>{j.projectName || '—'}</td>
                    <td><span className="job-type-badge">{j.jobTypeName || '—'}</span></td>
                    <td>{j.jobStageName || '—'}</td>
                    <td className="job-num-cell"
                      title={j.orderValue && j.jobExcRate && j.jobExcRate !== 1
                        ? `${fmt(j.orderValue * j.jobExcRate)} ${baseCurrencyCode || ''} (base)`
                        : undefined}>
                      {j.orderValue
                        ? <>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: j.jobExcRate && j.jobExcRate !== 1 ? '#7c3aed' : '#64748b', marginRight: 4 }}>
                              {j.currencySymbol || ''}
                            </span>
                            {fmt(j.orderValue)}
                          </>
                        : '—'}
                    </td>
                    <td><StatusBadge id={j.jobStatusId} /></td>
                    <td><ApprovalBadge status={j.approvalStatus} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="job-pagination">
          <div className="page-info">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            &nbsp;·&nbsp;{totalRows} total record{totalRows !== 1 ? 's' : ''}
          </div>
          <div className="page-controls">
            <button className="page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
            <button className="page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
            {pageNums().map(n => (
              <button key={n} className={`page-btn ${n === page ? 'page-btn-active' : ''}`}
                onClick={() => goPage(n)}>{n}</button>
            ))}
            <button className="page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
            <button className="page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Job;
