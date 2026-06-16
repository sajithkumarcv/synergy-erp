import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import ApprovalHistoryTab from '../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../approval/ApprovalStatusBanner';
import './Manhour.css';
import { useFieldConfig } from '../FieldConfigContext';

const fmtDate = d => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const fmt2 = n => n != null
    ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const today = () => new Date().toISOString().slice(0, 10);

// ── Exact accepted headers (case-insensitive) — anything else rejects the file ──
// JOBID | EMPID | NH | OT | SITE | TYPE
const COL_MAP = {
    'jobid': 'jobId',
    'empid': 'employeeId',
    'nh':    'hours',
    'ot':    'otHours',
    'site':  'site',
    'type':  'mType',
};

const REQUIRED_COLS = ['jobid', 'empid', 'nh'];       // must be present
const ALLOWED_COLS  = new Set(Object.keys(COL_MAP));  // anything else → reject

// ── Download template — driven by VList values ────────────────────────────────
const downloadTemplate = (siteOptionsArg = [], typeOptionsArg = []) => {
    // Coerce to arrays — callers may pass a non-array (e.g. a mis-shaped lookup)
    const siteOptions = Array.isArray(siteOptionsArg) ? siteOptionsArg : [];
    const typeOptions = Array.isArray(typeOptionsArg) ? typeOptionsArg : [];
    const s0 = siteOptions[0]?.value || 'Y';
    const t0 = typeOptions[0]?.value || 'M';
    const t1 = typeOptions[1]?.value || 'E';

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: data template ────────────────────────────────────────────
    const ws = XLSX.utils.aoa_to_sheet([
        ['JOBID', 'EMPID', 'NH', 'OT', 'SITE', 'TYPE'],
        ['EC26-900001', 'ESI-001', 8,   0,   s0, t0],
        ['EC26-900001', 'ESI-002', 8,   2.5, s0, t0],
        ['EC26-900002', 'ESI-003', 8,   0,   s0, t1],
    ]);
    ws['!cols'] = [14, 12, 8, 8, 10, 10].map(w => ({ wch: w }));

    // Data-validation dropdowns for SITE (col E) and TYPE (col F)
    ws['!dataValidations'] = [];
    if (siteOptions.length) {
        ws['!dataValidations'].push({
            sqref: 'E2:E1048576', type: 'list',
            formula1: '"' + siteOptions.map(o => o.value).join(',') + '"',
            showDropDown: false, showErrorMessage: true,
            errorTitle: 'Invalid SITE',
            error: 'Allowed: ' + siteOptions.map(o => `${o.value} (${o.label})`).join(', '),
        });
    }
    if (typeOptions.length) {
        ws['!dataValidations'].push({
            sqref: 'F2:F1048576', type: 'list',
            formula1: '"' + typeOptions.map(o => o.value).join(',') + '"',
            showDropDown: false, showErrorMessage: true,
            errorTitle: 'Invalid TYPE',
            error: 'Allowed: ' + typeOptions.map(o => `${o.value} (${o.label})`).join(', '),
        });
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Manhours');

    // ── Sheet 2: reference (allowed values) ──────────────────────────────
    const refRows = [
        ['Column', 'Value', 'Description', ''],
        ['SITE', '', '', ''],
        ...siteOptions.map(o => ['', o.value, o.label, '']),
        ['', '', '', ''],
        ['TYPE', '', '', ''],
        ...typeOptions.map(o => ['', o.value, o.label, '']),
        ['', '', '', ''],
        ['JOBID',    'Required', 'Job number (e.g. EC26-900001)', ''],
        ['EMPID',    'Required', 'Employee code (e.g. ESI-001)',  ''],
        ['NH',       'Required', 'Normal hours (> 0, ≤ 24)',      ''],
        ['OT',       'Optional', 'Overtime hours (default 0)',     ''],
        ['REMARKS',  'Optional', 'Free text notes',               ''],
    ];
    const refWs = XLSX.utils.aoa_to_sheet(refRows);
    refWs['!cols'] = [12, 12, 32, 4].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, refWs, 'Reference');

    XLSX.writeFile(wb, 'ManhourUpload_Template.xlsx');
};

// ── Export validation errors ───────────────────────────────────────────────────
const exportErrors = rows => {
    const errRows = rows.filter(r => r._errors?.length);
    if (!errRows.length) return;
    const ws = XLSX.utils.json_to_sheet(errRows.map(r => ({
        Row:        r._row,
        JOBID:      r.jobId   || '',
        EMPID:      r.empCode || '',
        NH:         r.hours      || '',
        OT:         r.otHours    || '',
        SITE:       r.site       || '',
        TYPE:       r.mType      || '',
        Errors:     r._errors.join('; '),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'ManhourUpload_Errors.xlsx');
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const ManhourDetailPage = () => {
    const { id }      = useParams();
    const isNew       = !id || id === 'new';
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const { getVList } = useLookup();
    const { isReq } = useFieldConfig('MANHOUR');

    // Configurable lookups (admin-managed via VList: Manhour.Site / Manhour.Type)
    const siteOptions = getVList('Manhour', 'Site');   // [{value:'Y',label:'Site'},{value:'N',label:'Off-Site'}]
    const typeOptions = getVList('Manhour', 'Type');   // [{value:'M',label:'Mechanical'},{value:'E',label:'Electrical'}]

    const siteLabel = code => siteOptions.find(o => o.value === code)?.label || code || '—';
    const typeLabel = code => typeOptions.find(o => o.value === code)?.label || code || '—';

    // ── State ─────────────────────────────────────────────────────────────
    const [batch,      setBatch]     = useState(null);
    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(!isNew);
    const [activeTab,  setActiveTab] = useState('lines');

    const [form, setForm] = useState({ documentDate: today(), remarks: '' });
    const [errors, setErrors] = useState({});

    const [file,        setFile]       = useState(null);
    const [employees,   setEmployees]  = useState([]);   // for validation
    const [jobs,        setJobs]       = useState([]);   // for validation
    const [previewRows, setPreviewRows]= useState([]);
    const [parsing,     setParsing]    = useState(false);
    const [isDragOver,  setIsDragOver] = useState(false);
    const fileInputRef = useRef();

    const [saving,         setSaving]       = useState(false);
    const [deletingLineId, setDeletingLineId] = useState(null);
    const [lineFilter,     setLineFilter]    = useState({ jobId: '', name: '' });
    const [previewFilter,  setPreviewFilter] = useState('all'); // 'all'|'valid'|'warning'|'error'
    const [toast,          setToast]         = useState([]);
    const [approvalTx,     setApprovalTx]    = useState(null);

    const showToast = (msg, type = 'success') => {
        const id = Date.now();
        setToast(p => [...p, { id, msg, type }]);
        setTimeout(() => setToast(p => p.filter(t => t.id !== id)), 4000);
    };

    // ── Load existing record ───────────────────────────────────────────────
    useEffect(() => {
        if (isNew) return;
        setLoading(true);
        fetch(`${variables.API_URL}manhour/${id}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                setBatch(d.batch);
                setRows(d.rows || []);
                setForm({
                    documentDate: d.batch.documentDate?.slice(0, 10) || today(),
                    remarks:      d.batch.remarks || '',
                });
            })
            .catch(() => showToast('Failed to load record.', 'error'))
            .finally(() => setLoading(false));
    }, [id, isNew]);

    // ── Load employees for validation ─────────────────────────────────────
    useEffect(() => {
        fetch(`${variables.API_URL}manhour/employees`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setEmployees(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    // ── Load active jobs for validation ────────────────────────────────────
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&excludeClosedStatus=true`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobs(d.data || []))
            .catch(console.error);
    }, []);

    // ── Parse Excel file ───────────────────────────────────────────────────
    const parseFile = useCallback((f) => {
        if (!f) return;
        setParsing(true);
        setPreviewRows([]);
        setPreviewFilter('all');

        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb  = XLSX.read(e.target.result, { type: 'array', cellDates: false });
                const ws  = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                if (raw.length < 2) {
                    showToast('Excel file is empty or has no data rows.', 'error');
                    setParsing(false); return;
                }

                const headerRow = raw[0].map(h => String(h).toLowerCase().trim());
                const colIdx = {};
                headerRow.forEach((h, i) => { if (COL_MAP[h]) colIdx[COL_MAP[h]] = i; });

                // ── Step 1: strict header check — must match exactly JOBID|EMPID|NH|OT|SITE|TYPE ──
                const nonEmptyHeaders = headerRow.filter(h => h !== '');

                // Any column not in the allowed set → reject immediately
                const illegal = nonEmptyHeaders.filter(h => !ALLOWED_COLS.has(h));
                if (illegal.length > 0) {
                    showToast(
                        `Invalid column${illegal.length > 1 ? 's' : ''}: ${illegal.map(h => `"${h.toUpperCase()}"`).join(', ')}. ` +
                        'Only JOBID, EMPID, NH, OT, SITE, TYPE are accepted. Use the template.',
                        'error'
                    );
                    setParsing(false); return;
                }

                // Required columns must all be present
                const missingCols = REQUIRED_COLS.filter(h => colIdx[COL_MAP[h]] === undefined);
                if (missingCols.length > 0) {
                    showToast(
                        `Missing required column${missingCols.length > 1 ? 's' : ''}: ` +
                        missingCols.map(h => `"${h.toUpperCase()}"`).join(', ') +
                        '. Use the template.',
                        'error'
                    );
                    setParsing(false); return;
                }

                // ── Headers confirmed — load rows ─────────────────────────
                console.info(`[Manhour Upload] Headers OK — loading ${raw.length - 1} row(s)…`);

                // Allowed VList values (case-insensitive sets)
                const allowedSite = new Set(siteOptions.map(o => o.value.toLowerCase()));
                const allowedType = new Set(typeOptions.map(o => o.value.toLowerCase()));

                // Build lookup maps
                const jobMap = {};
                jobs.forEach(j => { jobMap[String(j.jobId).toLowerCase()] = j; });

                // Key employees by EmpCode (e.g. "ESI-004"), case-insensitive
                const empByCode = {};
                employees.forEach(emp => {
                    empByCode[emp.empCode.toLowerCase()] = emp;
                });

                const seenKeys = new Set();
                const parsed   = [];

                for (let i = 1; i < raw.length; i++) {
                    const row = raw[i];
                    if (row.every(c => c === '' || c == null)) continue;

                    const jobIdRaw = String(row[colIdx.jobId]      || '').trim();
                    const empIdRaw = String(row[colIdx.employeeId] || '').trim();
                    const hoursRaw = row[colIdx.hours];
                    const otRaw    = colIdx.otHours !== undefined ? row[colIdx.otHours] : 0;
                    const site     = colIdx.site  !== undefined ? String(row[colIdx.site]  || '').trim() : '';
                    const mType    = colIdx.mType !== undefined ? String(row[colIdx.mType] || '').trim() : '';

                    const hours   = parseFloat(hoursRaw) || 0;
                    const otHours = parseFloat(otRaw)    || 0;
                    const errs    = [];
                    const warns   = [];

                    // Validate Job
                    let job = null;
                    if (!jobIdRaw) {
                        errs.push('JOBID is required');
                    } else {
                        job = jobMap[jobIdRaw.toLowerCase()];
                        if (!job) errs.push(`Job "${jobIdRaw}" not found or inactive`);
                    }

                    // Validate Employee by EmpCode
                    let emp = null;
                    if (!empIdRaw) {
                        errs.push('EMPID is required');
                    } else {
                        emp = empByCode[empIdRaw.toLowerCase()];
                        if (!emp) errs.push(`Employee "${empIdRaw}" not found in the system`);
                    }

                    // Validate hours
                    if (hours <= 0)           errs.push('NH must be greater than 0');
                    if (hours > 24)           errs.push('NH cannot exceed 24');
                    if (otHours < 0)          errs.push('OT cannot be negative');
                    if (hours + otHours > 24) errs.push('Total (NH + OT) cannot exceed 24');

                    // ── VList value validation — warnings (non-blocking, row still saves) ──
                    if (site && allowedSite.size > 0 && !allowedSite.has(site.toLowerCase()))
                        warns.push(`SITE "${site}" not recognised — allowed: ${siteOptions.map(o => o.value).join(', ')}`);
                    if (mType && allowedType.size > 0 && !allowedType.has(mType.toLowerCase()))
                        warns.push(`TYPE "${mType}" not recognised — allowed: ${typeOptions.map(o => o.value).join(', ')}`);

                    // Duplicate: same job + employee in this upload
                    const key = `${jobIdRaw.toLowerCase()}|${empIdRaw.toLowerCase()}`;
                    if (job && emp && seenKeys.has(key))
                        errs.push('Duplicate: same JOBID + EMPID already in this upload');
                    if (errs.length === 0) seenKeys.add(key);

                    parsed.push({
                        _row:         i + 1,
                        _errors:      errs,
                        _warnings:    warns,
                        jobId:        job?.jobId || jobIdRaw,
                        jobDesc:      job?.jobDescription || '',
                        empCode:      empIdRaw,
                        employeeName: emp?.employeeName || empIdRaw,
                        employeeId:   emp?.employeeId ?? null,
                        hours,
                        otHours,
                        site,
                        mType,
                    });
                }

                setPreviewRows(parsed);
                const errCount  = parsed.filter(r => r._errors.length > 0).length;
                const warnCount = parsed.filter(r => r._warnings.length > 0).length;
                if (errCount > 0)
                    showToast(`${parsed.length} rows parsed — ${errCount} error${errCount !== 1 ? 's' : ''}${warnCount > 0 ? `, ${warnCount} warning${warnCount !== 1 ? 's' : ''}` : ''}.`, 'error');
                else if (warnCount > 0)
                    showToast(`${parsed.length} rows parsed — ${warnCount} warning${warnCount !== 1 ? 's' : ''} (rows still valid). Ready to save.`, 'warning');
                else
                    showToast(`${parsed.length} rows parsed — all valid. Ready to save.`);
            } catch {
                showToast('Failed to parse Excel file.', 'error');
            } finally {
                setParsing(false);
            }
        };
        reader.readAsArrayBuffer(f);
    }, [employees, jobs, siteOptions, typeOptions]);

    const handleFileSelect = f => {
        if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) {
            showToast('Please upload an Excel (.xlsx, .xls) or CSV file.', 'error');
            return;
        }
        setFile(f);
        parseFile(f);
    };

    const onDrop     = e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); };
    const onDragOver = e => { e.preventDefault(); setIsDragOver(true); };
    const onDragLeave = () => setIsDragOver(false);

    // ── Validate ───────────────────────────────────────────────────────────
    const validate = () => {
        const e = {};
        if (!form.documentDate) e.documentDate = 'Date is required.';
        if (previewRows.length === 0 && isNew) e.file = 'Please upload and validate an Excel file.';
        return e;
    };

    const validRows = previewRows.filter(r => r._errors.length === 0);
    const errorRows = previewRows.filter(r => r._errors.length > 0);

    // ── Save ───────────────────────────────────────────────────────────────
    const handleSave = async () => {
        const errs = validate();
        if (Object.keys(errs).length) { setErrors(errs); return; }
        if (isNew && validRows.length === 0) {
            showToast('No valid rows to save.', 'error'); return;
        }

        setSaving(true);
        try {
            const linesToSave = isNew
                ? validRows
                : (previewRows.length > 0 ? validRows : rows.map(r => ({
                    jobId:      r.jobId,
                    employeeId: r.employeeId,
                    hours:      r.hours,
                    otHours:    r.overtimeHours,
                    site:       r.site,
                    mType:      r.mType,
                    remarks:    r.remarks,
                })));

            const payload = {
                batchId:          isNew ? null : parseInt(id),
                documentDate:     form.documentDate,
                remarks:          form.remarks,
                uploadedFileName: file?.name || batch?.uploadedFileName || null,
                savedBy:          currentUser,
                lines:            linesToSave.map(r => ({
                    jobId:         r.jobId,
                    employeeId:    r.employeeId,
                    hours:         r.hours,
                    overtimeHours: r.otHours ?? r.overtimeHours ?? 0,
                    site:          r.site  || null,
                    mType:         r.mType || null,
                    remarks:       r.remarks || null,
                })),
            };

            const res  = await fetch(`${variables.API_URL}manhour/save`, {
                method:  'POST',
                headers: authHeaders(),
                body:    JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                let msg = data.message || 'Save failed.';
                if (data.errors?.length > 0) {
                    const shown = data.errors.slice(0, 3).join(' | ');
                    const extra = data.errors.length > 3 ? ` …+${data.errors.length - 3} more` : '';
                    msg += ` — ${shown}${extra}`;
                }
                showToast(msg, 'error');
                return;
            }
            showToast(`Saved — ${data.documentNo}`);
            setTimeout(() => navigate(`/manhour/${data.batchId}`), 800);
        } catch {
            showToast('Network error. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Delete single line ────────────────────────────────────────────────
    const handleDeleteLine = async (manhourId) => {
        if (!window.confirm('Delete this line?')) return;
        setDeletingLineId(manhourId);
        try {
            const res = await fetch(
                `${variables.API_URL}manhour/line/${manhourId}?deletedBy=${encodeURIComponent(currentUser)}`,
                { method: 'DELETE', headers: authHeaders() }
            );
            const data = await res.json();
            if (!res.ok) { showToast(data.message || 'Delete failed.', 'error'); return; }
            setRows(prev => prev.filter(r => r.manhourId !== manhourId));
            showToast('Line deleted.');
        } catch {
            showToast('Network error.', 'error');
        } finally {
            setDeletingLineId(null);
        }
    };

    // ── Filtered rows (client-side) ───────────────────────────────────────
    const filteredRows = rows.filter(r => {
        const jobOk  = !lineFilter.jobId || r.jobId?.toLowerCase().includes(lineFilter.jobId.toLowerCase());
        const nameOk = !lineFilter.name  ||
            r.employeeName?.toLowerCase().includes(lineFilter.name.toLowerCase()) ||
            r.empCode?.toLowerCase().includes(lineFilter.name.toLowerCase());
        return jobOk && nameOk;
    });

    // ── Render ─────────────────────────────────────────────────────────────
    if (loading) return <div style={{ padding: 32, color: '#64748b' }}>Loading…</div>;

    const canEdit       = isNew || batch?.canEdit;
    const canDeleteLine = !isNew && !canEdit && batch && !['Approved', 'Rejected', 'Cancelled'].includes(batch.status);
    const title         = isNew ? 'New Manhour Upload' : batch?.documentNo || 'Manhour Upload';

    return (
        <div className="mhd-page">
            {/* Page header */}
            <div className="mhd-header">
                <div>
                    <div className="mhd-title">{title}</div>
                    {!isNew && (
                        <div className="mhd-doc-no">
                            {fmtDate(batch?.documentDate)}
                            {batch?.jobCount > 0 && ` · ${batch.jobCount} job${batch.jobCount !== 1 ? 's' : ''}`}
                        </div>
                    )}
                </div>
                <div className="mhd-header-btns">
                    <button className="mh-btn-sec" onClick={() => navigate('/manhour')}>← Back</button>
                    {canEdit && (
                        <button className="mh-btn-sec" onClick={() => downloadTemplate(siteOptions, typeOptions)} title="Download Excel template">
                            ↓ Template
                        </button>
                    )}
                    {canEdit && (
                        <button className="mh-btn-pri" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : isNew ? '💾 Save Upload' : '💾 Update'}
                        </button>
                    )}
                </div>
            </div>

            {/* Approval status banner */}
            {!isNew && <ApprovalStatusBanner transaction={approvalTx} />}

            {/* Stats (view mode) */}
            {!isNew && batch && (
                <div className="mhd-card">
                    <div className="mhd-stats">
                        <div className="mhd-stat-card">
                            <div className="mhd-stat-label">Jobs</div>
                            <div className="mhd-stat-value">{batch.jobCount}</div>
                        </div>
                        <div className="mhd-stat-card">
                            <div className="mhd-stat-label">Employees</div>
                            <div className="mhd-stat-value">{batch.totalEmployees}</div>
                        </div>
                        <div className="mhd-stat-card">
                            <div className="mhd-stat-label">Normal Hours</div>
                            <div className="mhd-stat-value">{fmt2(batch.totalHours)}</div>
                        </div>
                        <div className="mhd-stat-card">
                            <div className="mhd-stat-label">OT Hours</div>
                            <div className="mhd-stat-value">{fmt2(batch.totalOTHours)}</div>
                        </div>
                        <div className="mhd-stat-card">
                            <div className="mhd-stat-label">Total Hours</div>
                            <div className="mhd-stat-value">{fmt2((batch.totalHours || 0) + (batch.totalOTHours || 0))}</div>
                        </div>
                        <div className="mhd-stat-card">
                            <div className="mhd-stat-label">Status</div>
                            <div style={{ marginTop: 4 }}>
                                <span className="mh-status-badge"
                                    style={{ background: batch.badgeBg || '#f1f5f9', color: batch.badgeColor || '#475569' }}>
                                    <span className="mh-status-dot" style={{ background: batch.badgeDot || '#94a3b8' }} />
                                    {batch.status}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
                {[
                    { key: 'lines',    label: 'Lines',    icon: '📋' },
                    { key: 'upload',   label: 'Upload',   icon: '⬆', hide: !canEdit },
                    { key: 'approval', label: 'Approval', icon: '✔', hide: isNew },
                ].filter(t => !t.hide).map(tab => (
                    <button key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            padding: '10px 20px', border: 'none',
                            borderBottom: activeTab === tab.key ? '2px solid #1d4ed8' : '2px solid transparent',
                            background: 'none', color: activeTab === tab.key ? '#1d4ed8' : '#64748b',
                            fontWeight: activeTab === tab.key ? 700 : 500, fontSize: 13.5, cursor: 'pointer',
                        }}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ── LINES TAB ──────────────────────────────────────────────────── */}
            {activeTab === 'lines' && (
                <div className="mhd-card">
                    {/* Header form — date + remarks only */}
                    <div className="mhd-form-grid" style={{ marginBottom: 20 }}>
                        <div className="mhd-field">
                            <label>Date {isReq('documentDate') && <span className="req">*</span>}</label>
                            {canEdit ? (
                                <input type="date"
                                    className={`mhd-input${errors.documentDate ? ' err' : ''}`}
                                    value={form.documentDate}
                                    onChange={e => {
                                        setForm(p => ({ ...p, documentDate: e.target.value }));
                                        setErrors(p => ({ ...p, documentDate: undefined }));
                                    }} />
                            ) : (
                                <div className="mhd-readonly">{fmtDate(form.documentDate)}</div>
                            )}
                            {errors.documentDate && <span className="mhd-err-msg">{errors.documentDate}</span>}
                        </div>

                        <div className="mhd-field" style={{ gridColumn: 'span 2' }}>
                            <label>Remarks</label>
                            {canEdit ? (
                                <textarea className="mhd-textarea"
                                    value={form.remarks}
                                    onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                                    placeholder="Optional remarks…" />
                            ) : (
                                <div className="mhd-readonly" style={{ height: 'auto', minHeight: 36 }}>{form.remarks || '—'}</div>
                            )}
                        </div>
                    </div>

                    {/* Saved rows (view mode) */}
                    {!isNew && rows.length > 0 && (
                        <>
                            {/* Filter bar */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    placeholder="Filter by Job ID…"
                                    value={lineFilter.jobId}
                                    onChange={e => setLineFilter(p => ({ ...p, jobId: e.target.value }))}
                                    style={{
                                        height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                                        fontSize: 12.5, width: 150, outline: 'none', color: '#1e293b',
                                    }}
                                />
                                <input
                                    type="text"
                                    placeholder="Filter by employee…"
                                    value={lineFilter.name}
                                    onChange={e => setLineFilter(p => ({ ...p, name: e.target.value }))}
                                    style={{
                                        height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                                        fontSize: 12.5, width: 180, outline: 'none', color: '#1e293b',
                                    }}
                                />
                                {(lineFilter.jobId || lineFilter.name) && (
                                    <button
                                        onClick={() => setLineFilter({ jobId: '', name: '' })}
                                        style={{
                                            height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                                            background: '#f8fafc', fontSize: 12, cursor: 'pointer', color: '#64748b',
                                        }}>
                                        ✕ Clear
                                    </button>
                                )}
                                <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>
                                    {filteredRows.length !== rows.length
                                        ? `${filteredRows.length} of ${rows.length} rows`
                                        : `${rows.length} rows`}
                                    {' · '}{fmt2(filteredRows.reduce((s, r) => s + (r.hours || 0), 0))} NH hrs
                                </span>
                            </div>

                            <div className="mhd-preview-wrap">
                                <table className="mhd-preview-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Job ID</th>
                                            <th>Job Description</th>
                                            <th>Employee</th>
                                            <th style={{ textAlign: 'right' }}>NH</th>
                                            <th style={{ textAlign: 'right' }}>OT</th>
                                            <th>Site</th>
                                            <th>Type</th>
                                            {canDeleteLine && <th style={{ width: 40 }} />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.map((r, i) => (
                                            <tr key={r.manhourId}>
                                                <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                                                <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{r.jobId}</td>
                                                <td style={{ fontSize: 12, color: '#475569' }}>{r.jobDescription || '—'}</td>
                                                <td>
                                                    <strong>{r.employeeName}</strong>
                                                    <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.empCode}</div>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt2(r.hours)}</td>
                                                <td style={{ textAlign: 'right' }}>{fmt2(r.overtimeHours)}</td>
                                                <td style={{ fontSize: 12 }}>{siteLabel(r.site)}</td>
                                                <td style={{ fontSize: 12 }}>{typeLabel(r.mType)}</td>
                                                {canDeleteLine && (
                                                    <td style={{ textAlign: 'center', padding: '0 4px' }}>
                                                        <button
                                                            title="Delete line"
                                                            disabled={deletingLineId === r.manhourId}
                                                            onClick={() => handleDeleteLine(r.manhourId)}
                                                            style={{
                                                                background: 'none', border: 'none', cursor: 'pointer',
                                                                color: deletingLineId === r.manhourId ? '#94a3b8' : '#ef4444',
                                                                fontSize: 15, padding: '2px 6px', borderRadius: 4,
                                                                lineHeight: 1,
                                                            }}>
                                                            {deletingLineId === r.manhourId ? '…' : '🗑'}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {isNew && previewRows.length === 0 && (
                        <div className="mh-empty" style={{ padding: '24px 0' }}>
                            <div className="mh-empty-icon">📤</div>
                            <div className="mh-empty-text">No data yet</div>
                            <div className="mh-empty-sub">Go to the Upload tab to import an Excel file</div>
                        </div>
                    )}

                    {/* Preview rows after parse */}
                    {previewRows.length > 0 && (() => {
                        const warnRows = previewRows.filter(r => r._errors.length === 0 && (r._warnings?.length || 0) > 0);
                        const shownRows = previewFilter === 'valid'   ? validRows
                                        : previewFilter === 'error'   ? errorRows
                                        : previewFilter === 'warning' ? warnRows
                                        : previewRows;
                        return (
                            <>
                                {/* Filter tab bar */}
                                <div className="mhd-filter-tabs">
                                    {[
                                        { key: 'all',     label: 'All',      count: previewRows.length, cls: 'tab-all' },
                                        { key: 'valid',   label: '✔ Valid',   count: validRows.length,   cls: 'tab-valid' },
                                        { key: 'warning', label: '⚠ Warning', count: warnRows.length,    cls: 'tab-warn' },
                                        { key: 'error',   label: '✖ Error',   count: errorRows.length,   cls: 'tab-err' },
                                    ].map(t => (
                                        <button key={t.key}
                                            className={`mhd-ftab ${t.cls}${previewFilter === t.key ? ' active' : ''}`}
                                            onClick={() => setPreviewFilter(t.key)}
                                            disabled={t.count === 0}>
                                            {t.label}
                                            <span className="mhd-ftab-count">{t.count}</span>
                                        </button>
                                    ))}
                                    {errorRows.length > 0 && (
                                        <button className="mh-btn-sec" style={{ height: 30, fontSize: 12, marginLeft: 'auto' }}
                                            onClick={() => exportErrors(previewRows)}>
                                            ↓ Export Errors
                                        </button>
                                    )}
                                </div>

                                {errors.file && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{errors.file}</div>}

                                {shownRows.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>
                                        No {previewFilter} rows in this upload.
                                    </div>
                                ) : (
                                    <div className="mhd-preview-wrap">
                                        <table className="mhd-preview-table">
                                            <thead>
                                                <tr>
                                                    <th>Row</th>
                                                    <th>Job ID</th>
                                                    <th>Employee</th>
                                                    <th style={{ textAlign: 'right' }}>NH</th>
                                                    <th style={{ textAlign: 'right' }}>OT</th>
                                                    <th>Site</th>
                                                    <th>Type</th>
                                                    <th>Status</th>
                                                    <th>Issues</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {shownRows.map((r, i) => {
                                                    const hasErr  = r._errors.length > 0;
                                                    const hasWarn = (r._warnings?.length || 0) > 0;
                                                    return (
                                                        <tr key={i} className={hasErr ? 'row-err' : hasWarn ? 'row-warn' : 'row-ok'}>
                                                            <td style={{ color: '#94a3b8', fontSize: 11 }}>{r._row}</td>
                                                            <td>
                                                                <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{r.jobId}</span>
                                                                {r.jobDesc && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.jobDesc}</div>}
                                                            </td>
                                                            <td>
                                                                <strong>{r.employeeName}</strong>
                                                                <br /><span style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.empCode}</span>
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                {r.hours > 0 ? r.hours : <span style={{ color: '#dc2626' }}>—</span>}
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>{r.otHours > 0 ? r.otHours : '—'}</td>
                                                            <td style={{ fontSize: 12 }}>{r.site || '—'}</td>
                                                            <td style={{ fontSize: 12 }}>{r.mType || '—'}</td>
                                                            <td>
                                                                {hasErr
                                                                    ? <span className="mhd-row-status-err">✖ Error</span>
                                                                    : hasWarn
                                                                        ? <span style={{ color: '#b45309', fontWeight: 600, fontSize: 11 }}>⚠ Warning</span>
                                                                        : <span className="mhd-row-status-ok">✔ Valid</span>}
                                                            </td>
                                                            <td className="mhd-err-cell">
                                                                {hasErr && <div>{r._errors.join(' · ')}</div>}
                                                                {hasWarn && <div style={{ color: '#b45309', marginTop: hasErr ? 3 : 0 }}>{r._warnings.join(' · ')}</div>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            )}

            {/* ── UPLOAD TAB ──────────────────────────────────────────────────── */}
            {activeTab === 'upload' && canEdit && (
                <div className="mhd-card">
                    <div className="mhd-card-title">Excel Upload</div>
                    <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
                        Upload an Excel file with manhour data for the selected date.
                        Required columns: <strong>JOBID, EMPID, NH</strong>.
                        Optional: <strong>OT, SITE, TYPE</strong>. No other columns are accepted.
                    </p>

                    {!file ? (
                        <div className={`mhd-upload-zone ${isDragOver ? 'dragover' : ''}`}
                            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                            onClick={() => fileInputRef.current?.click()}>
                            <div className="mhd-upload-icon">{parsing ? '⏳' : '📂'}</div>
                            <div className="mhd-upload-text">{parsing ? 'Parsing…' : 'Drop Excel file here or click to browse'}</div>
                            <div className="mhd-upload-sub">.xlsx, .xls, .csv supported</div>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                                style={{ display: 'none' }}
                                onChange={e => handleFileSelect(e.target.files[0])} />
                        </div>
                    ) : (
                        <div>
                            <div className="mhd-upload-file">
                                <span style={{ fontSize: 20 }}>📄</span>
                                <span className="mhd-upload-fname">{file.name}</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{(file.size / 1024).toFixed(1)} KB</span>
                                <button className="mhd-upload-clear" title="Remove file"
                                    onClick={() => { setFile(null); setPreviewRows([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                                    ✕
                                </button>
                            </div>
                            {parsing && <div style={{ marginTop: 12, fontSize: 13, color: '#1d4ed8' }}>⏳ Validating rows…</div>}
                            {!parsing && previewRows.length > 0 && (
                                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span className="mhd-summary-chip mhd-chip-total">Total: {previewRows.length}</span>
                                    <span className="mhd-summary-chip mhd-chip-ok">✔ Valid: {validRows.length}</span>
                                    {errorRows.length > 0 && <span className="mhd-summary-chip mhd-chip-err">✖ Errors: {errorRows.length}</span>}
                                    <button className="mh-btn-sec" style={{ height: 28, fontSize: 12 }}
                                        onClick={() => { setPreviewFilter('all'); setActiveTab('lines'); }}>
                                        View All →
                                    </button>
                                    {errorRows.length > 0 && (
                                        <button className="mh-btn-sec" style={{ height: 28, fontSize: 12 }}
                                            onClick={() => { setPreviewFilter('error'); setActiveTab('lines'); }}>
                                            View Errors →
                                        </button>
                                    )}
                                    <button className="mh-btn-sec" style={{ height: 28, fontSize: 12 }}
                                        onClick={() => { setFile(null); setPreviewRows([]); setPreviewFilter('all'); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                                        Replace File
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {errors.file && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{errors.file}</div>}

                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
                        <button className="mh-btn-sec" onClick={downloadTemplate}>↓ Download Template</button>
                        {errorRows.length > 0 && (
                            <button className="mh-btn-sec" onClick={() => exportErrors(previewRows)}>↓ Export Errors</button>
                        )}
                    </div>
                </div>
            )}

            {/* ── APPROVAL TAB ──────────────────────────────────────────────── */}
            {activeTab === 'approval' && !isNew && batch && (
                <ApprovalHistoryTab
                    moduleCode="MH"
                    documentId={batch.batchId}
                    documentNo={batch.documentNo}
                    documentAmount={null}
                    currencyId={null}
                    onStatusChange={newStatus => setBatch(p => ({ ...p, status: newStatus }))}
                    onTransactionLoad={setApprovalTx}
                />
            )}

            {/* Toast */}
            <div className="mh-toast">
                {toast.map(t => (
                    <div key={t.id} className={`mh-toast-item mh-toast-${t.type}`}>{t.msg}</div>
                ))}
            </div>
        </div>
    );
};

export default ManhourDetailPage;
