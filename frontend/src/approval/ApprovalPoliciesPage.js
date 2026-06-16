import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import '../procurement/Procurement.css';
import AlertModal from '../common/AlertModal';

// ── Helpers ───────────────────────────────────────────────────────────────
const APPROVER_TYPES = [
    { value: 'ANY',  label: 'Anyone (no specific approver)' },
    { value: 'ROLE', label: 'Role' },
    { value: 'USER', label: 'Specific User' },
];
const norm = (t) => (t || 'ROLE').toUpperCase();

const BLANK_LEVEL = {
    levelId: 0, levelNo: 1, levelName: '', approverType: 'ROLE', approverId: '',
    isMandatory: true, allowSelfApproval: false, timeoutHours: '', onTimeoutAction: '',
};

const SectionHead = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#3a5070', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 18, marginBottom: 10 }}>
        {children}
    </div>
);
const LABEL = { fontSize: 10.5, fontWeight: 600, color: '#64748b', marginBottom: 3 };
const CHKBOX = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569', cursor: 'pointer' };

// ── Level row editor ──────────────────────────────────────────────────────
const LevelRow = ({ level, index, roles, users, onChange, onRemove, onAddParallel, canRemove, isParallel }) => {
    const set = (k, v) => onChange(index, { ...level, [k]: v });
    const type = norm(level.approverType);
    const needsApprover = type === 'ROLE' || type === 'USER';
    const optionList = type === 'ROLE' ? roles : type === 'USER' ? users : [];
    const knownType = APPROVER_TYPES.some(t => t.value === type);
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f1f5f9', background: isParallel ? '#fafbff' : 'transparent' }}>
            <div style={{ flexShrink: 0, marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <input
                    type="number" min={1} max={99}
                    value={level.levelNo}
                    onChange={e => set('levelNo', Math.max(1, parseInt(e.target.value, 10) || 1))}
                    title="Level number — duplicate it on another row to add a parallel approver"
                    style={{ width: 38, height: 28, borderRadius: '50%', background: isParallel ? '#7c3aed' : '#1e3a5f', color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'text', padding: 0 }} />
                {isParallel && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>PARALLEL</span>
                )}
            </div>
            <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 140px' }}>
                    <div style={LABEL}>Level Name</div>
                    <input className="pf-input" placeholder="e.g. HOD Approval"
                        value={level.levelName} onChange={e => set('levelName', e.target.value)} />
                </div>
                <div style={{ flex: '0 0 150px' }}>
                    <div style={LABEL}>Approver Type</div>
                    <select className="pf-input" value={knownType ? type : ''}
                        onChange={e => {
                            const nt = e.target.value;
                            onChange(index, { ...level, approverType: nt, approverId: nt === 'ANY' ? '' : level.approverId });
                        }}>
                        {!knownType && <option value="">⚠ {type} (re-select)</option>}
                        {APPROVER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>
                <div style={{ flex: '0 0 180px' }}>
                    <div style={LABEL}>
                        Approver {type === 'ROLE' ? '(Role)' : type === 'USER' ? '(User)' : ''}
                    </div>
                    {needsApprover ? (
                        <select className="pf-input" value={level.approverId ?? ''}
                            onChange={e => set('approverId', e.target.value ? Number(e.target.value) : '')}>
                            <option value="">— Select —</option>
                            {optionList.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="pf-input" style={{ background: '#f8fafc', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                            {type === 'ANY' ? 'Anyone can act' : '—'}
                        </div>
                    )}
                </div>
                <div style={{ flex: '0 0 80px' }}>
                    <div style={LABEL}>Timeout (hrs)</div>
                    <input type="number" min="0" className="pf-input" placeholder="—"
                        value={level.timeoutHours} onChange={e => set('timeoutHours', e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', paddingTop: 22 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={level.isMandatory}
                            onChange={e => set('isMandatory', e.target.checked)} />
                        Mandatory
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={level.allowSelfApproval}
                            onChange={e => set('allowSelfApproval', e.target.checked)} />
                        Self-Approve
                    </label>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 20, flexShrink: 0 }}>
                <button onClick={() => onAddParallel(index)}
                    title="Add another approver at this same level (parallel)"
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #c4b5fd', background: '#ede9fe', color: '#7c3aed', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    + Parallel
                </button>
                {canRemove && (
                    <button onClick={() => onRemove(index)}
                        title="Remove this approver row"
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}>
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
};

// ── Policy slide-over form ────────────────────────────────────────────────
const PolicyForm = ({ policy, modules, roles, users, onSaved, onClose, currentUser }) => {
    const isNew = !policy;
    const [form, setForm] = useState(isNew ? {
        policyId: 0, moduleCode: modules[0]?.moduleCode || '', policyName: '',
        description: '', amountFrom: '', amountTo: '',
        isSequential: true, isActive: true, sortOrder: 0,
    } : {
        policyId:    policy.policyId,
        moduleCode:  policy.moduleCode,
        policyName:  policy.policyName,
        description: policy.description || '',
        amountFrom:  policy.amountFrom ?? '',
        amountTo:    policy.amountTo   ?? '',
        isSequential: policy.isSequential,
        isActive:    policy.isActive,
        sortOrder:   policy.sortOrder,
    });
    const [levels, setLevels] = useState(
        isNew ? [{ ...BLANK_LEVEL }]
              : (policy._levels || [{ ...BLANK_LEVEL }])
    );
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const selectedModule = modules.find(m => m.moduleCode === form.moduleCode);

    // Next free LevelNo = max existing + 1
    const nextLevelNo = (rows) => (rows.length === 0 ? 1 : Math.max(...rows.map(r => Number(r.levelNo) || 1)) + 1);

    const addLevel        = () => setLevels(prev => [...prev, { ...BLANK_LEVEL, levelNo: nextLevelNo(prev) }]);
    const addParallel     = (i) => setLevels(prev => {
        const target = prev[i];
        return [
            ...prev.slice(0, i + 1),
            { ...BLANK_LEVEL, levelNo: target.levelNo },   // same LevelNo = parallel
            ...prev.slice(i + 1),
        ];
    });
    const updateLevel = (i, upd) => setLevels(prev => prev.map((l, idx) => idx === i ? upd : l));
    // Removing a row no longer renumbers — duplicate LevelNos are now legitimate.
    const removeLevel = (i) => setLevels(prev => prev.filter((_, idx) => idx !== i));

    const save = async () => {
        if (!form.moduleCode) { setError('Module is required.'); return; }
        if (!form.policyName.trim()) { setError('Policy name is required.'); return; }
        const badLevel = levels.find(l => {
            const t = norm(l.approverType);
            if (t !== 'ROLE' && t !== 'USER' && t !== 'ANY') return true;
            if ((t === 'ROLE' || t === 'USER') && !l.approverId) return true;
            return false;
        });
        if (badLevel) {
            setError(`Level ${badLevel.levelNo}: choose a valid approver type and (for Role/User) an approver.`);
            return;
        }
        setError(''); setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}approval/policies/save`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    ...form,
                    amountFrom: form.amountFrom !== '' ? Number(form.amountFrom) : null,
                    amountTo:   form.amountTo   !== '' ? Number(form.amountTo)   : null,
                    sortOrder:  Number(form.sortOrder) || 0,
                    savedBy:    currentUser,
                    levels: levels.map(l => {
                        const t = norm(l.approverType);
                        return {
                            levelId:          Number(l.levelId) || 0,
                            levelNo:          Number(l.levelNo) || 1,
                            levelName:        l.levelName || null,
                            approverType:     t,
                            approverId:       (t === 'ROLE' || t === 'USER') && l.approverId ? Number(l.approverId) : null,
                            isMandatory:      l.isMandatory,
                            allowSelfApproval: l.allowSelfApproval,
                            timeoutHours:     l.timeoutHours !== '' ? Number(l.timeoutHours) : null,
                            onTimeoutAction:  l.onTimeoutAction || null,
                        };
                    }),
                }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.message || 'Save failed.'); return; }
            onSaved();
        } catch {
            setError('Network error.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 720 }}>
                <div className="pf-header">
                    <div className="pf-header-title">{isNew ? 'New Approval Policy' : `Edit — ${policy.policyName}`}</div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}
                    <SectionHead>Policy Details</SectionHead>
                    <div className="pf-row">
                        <div className="pf-field" style={{ flex: '0 0 180px' }}>
                            <label>Module <span className="req">*</span></label>
                            <select className="pf-input" value={form.moduleCode}
                                onChange={e => setF('moduleCode', e.target.value)}>
                                {modules.map(m => (
                                    <option key={m.moduleCode} value={m.moduleCode}>{m.moduleName}</option>
                                ))}
                            </select>
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Policy Name <span className="req">*</span></label>
                            <input className="pf-input" value={form.policyName}
                                onChange={e => setF('policyName', e.target.value)} />
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 80px' }}>
                            <label>Sort Order</label>
                            <input type="number" className="pf-input" value={form.sortOrder}
                                onChange={e => setF('sortOrder', e.target.value)} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Description</label>
                            <input className="pf-input" placeholder="Optional description…"
                                value={form.description} onChange={e => setF('description', e.target.value)} />
                        </div>
                    </div>
                    {selectedModule?.isAmountBased && (
                        <>
                            <SectionHead>Amount Range</SectionHead>
                            <div className="pf-row">
                                <div className="pf-field">
                                    <label>Amount From</label>
                                    <input type="number" min="0" step="any" className="pf-input" placeholder="0 = no lower limit"
                                        value={form.amountFrom} onChange={e => setF('amountFrom', e.target.value)} />
                                </div>
                                <div className="pf-field">
                                    <label>Amount To</label>
                                    <input type="number" min="0" step="any" className="pf-input" placeholder="blank = no upper limit"
                                        value={form.amountTo} onChange={e => setF('amountTo', e.target.value)} />
                                </div>
                            </div>
                        </>
                    )}
                    <div style={{ display: 'flex', gap: 20, marginTop: 12, marginBottom: 4 }}>
                        <label style={CHKBOX}>
                            <input type="checkbox" checked={form.isSequential}
                                onChange={e => setF('isSequential', e.target.checked)} />
                            Sequential approval (levels in order)
                        </label>
                        <label style={CHKBOX}>
                            <input type="checkbox" checked={form.isActive}
                                onChange={e => setF('isActive', e.target.checked)} />
                            Active
                        </label>
                    </div>
                    <SectionHead>Approval Levels</SectionHead>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                        Edit the number in each badge to group rows by level. Two rows sharing the same
                        level number are <strong style={{ color: '#7c3aed' }}>parallel approvers</strong> —
                        any one of them can act to advance the document.
                    </div>
                    {(() => {
                        const counts = levels.reduce((acc, l) => {
                            const n = Number(l.levelNo) || 0;
                            acc[n] = (acc[n] || 0) + 1;
                            return acc;
                        }, {});
                        return levels.map((l, i) => (
                            <LevelRow key={l.levelId || `new-${i}`} index={i} level={l}
                                roles={roles} users={users}
                                onChange={updateLevel}
                                onRemove={removeLevel}
                                onAddParallel={addParallel}
                                canRemove={levels.length > 1}
                                isParallel={counts[Number(l.levelNo) || 0] > 1} />
                        ));
                    })()}
                    <button onClick={addLevel}
                        style={{ marginTop: 10, padding: '6px 14px', borderRadius: 6, border: '1px dashed #94a3b8', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>
                        + Add Level
                    </button>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : (isNew ? 'Create Policy' : 'Save Changes')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Delegate slide-over form ──────────────────────────────────────────────
const DelegateForm = ({ delegate, levelOptions, users, onSaved, onClose, currentUser }) => {
    const isNew = !delegate;
    const today = new Date().toISOString().slice(0, 10);

    const [form, setForm] = useState(isNew ? {
        delegateId:     0,
        levelId:        levelOptions[0]?.levelId || '',
        originalUserId: '',
        delegateUserId: '',
        fromDate:       today,
        toDate:         today,
        reason:         '',
        isActive:       true,
    } : {
        delegateId:     delegate.delegateId,
        levelId:        delegate.levelId,
        originalUserId: delegate.originalUserId,
        delegateUserId: delegate.delegateUserId,
        fromDate:       delegate.fromDate ? delegate.fromDate.slice(0, 10) : today,
        toDate:         delegate.toDate   ? delegate.toDate.slice(0, 10)   : today,
        reason:         delegate.reason   || '',
        isActive:       delegate.isActive,
    });
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        if (!form.levelId)        { setError('Approval level is required.');  return; }
        if (!form.originalUserId) { setError('Original approver is required.'); return; }
        if (!form.delegateUserId) { setError('Delegate user is required.');    return; }
        if (!form.fromDate)       { setError('From date is required.');        return; }
        if (!form.toDate)         { setError('To date is required.');          return; }

        setError(''); setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}approval/delegates/save`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    delegateId:     Number(form.delegateId),
                    levelId:        Number(form.levelId),
                    originalUserId: Number(form.originalUserId),
                    delegateUserId: Number(form.delegateUserId),
                    fromDate:       form.fromDate,
                    toDate:         form.toDate,
                    reason:         form.reason.trim() || null,
                    isActive:       form.isActive,
                    savedBy:        currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.message || 'Save failed.'); return; }
            onSaved();
        } catch {
            setError('Network error.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 560 }}>
                <div className="pf-header">
                    <div className="pf-header-title">{isNew ? 'New Approval Delegate' : 'Edit Delegate'}</div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                    <SectionHead>Delegation Details</SectionHead>
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Approval Level <span className="req">*</span></label>
                            <select className="pf-input" value={form.levelId}
                                onChange={e => setF('levelId', e.target.value)}>
                                <option value="">— Select level —</option>
                                {levelOptions.map(l => (
                                    <option key={l.levelId} value={l.levelId}>{l.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Original Approver <span className="req">*</span></label>
                            <select className="pf-input" value={form.originalUserId}
                                onChange={e => setF('originalUserId', e.target.value)}>
                                <option value="">— Select user —</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Delegated To <span className="req">*</span></label>
                            <select className="pf-input" value={form.delegateUserId}
                                onChange={e => setF('delegateUserId', e.target.value)}>
                                <option value="">— Select user —</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <SectionHead>Date Range</SectionHead>
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>From Date <span className="req">*</span></label>
                            <input type="date" className="pf-input" value={form.fromDate}
                                onChange={e => setF('fromDate', e.target.value)} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>To Date <span className="req">*</span></label>
                            <input type="date" className="pf-input" value={form.toDate}
                                onChange={e => setF('toDate', e.target.value)} />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Reason</label>
                            <textarea className="pf-input" rows={2} placeholder="Optional — e.g. annual leave, travel…"
                                style={{ resize: 'vertical' }}
                                value={form.reason} onChange={e => setF('reason', e.target.value)} />
                        </div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                        <label style={CHKBOX}>
                            <input type="checkbox" checked={form.isActive}
                                onChange={e => setF('isActive', e.target.checked)} />
                            Delegation is active
                        </label>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : (isNew ? 'Add Delegate' : 'Save Changes')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Delegate status badge ─────────────────────────────────────────────────
const DelegateStatusBadge = ({ isActive, isCurrentlyActive, fromDate, toDate }) => {
    if (!isActive)
        return <span style={{ fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#94a3b8', borderRadius: 6, padding: '2px 8px' }}>Inactive</span>;

    const today = new Date().toISOString().slice(0, 10);
    const from = fromDate ? fromDate.slice(0, 10) : '';
    const to   = toDate   ? toDate.slice(0, 10)   : '';

    if (isCurrentlyActive)
        return <span style={{ fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '2px 8px' }}>Active Now</span>;
    if (from > today)
        return <span style={{ fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '2px 8px' }}>Scheduled</span>;
    if (to < today)
        return <span style={{ fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 8px' }}>Expired</span>;

    return <span style={{ fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#94a3b8', borderRadius: 6, padding: '2px 8px' }}>—</span>;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Main page ─────────────────────────────────────────────────────────────
const ApprovalPoliciesPage = () => {
    const currentUser = useCurrentUser();

    // ── shared reference data
    const [modules,   setModules]   = useState([]);
    const [roles,     setRoles]     = useState([]);
    const [users,     setUsers]     = useState([]);

    // ── tab
    const [activeTab, setActiveTab] = useState('policies');

    // ── Policies tab state
    const [policies,    setPolicies]    = useState([]);
    const [allLevels,   setAllLevels]   = useState([]);
    const [loadingPol,  setLoadingPol]  = useState(false);
    const [editPolicy,  setEditPolicy]  = useState(null);   // null=closed, false=new, obj=edit
    const [filterModule, setFilterModule] = useState('');

    // ── Delegates tab state
    const [delegates,    setDelegates]    = useState([]);
    const [loadingDel,   setLoadingDel]   = useState(false);
    const [editDelegate, setEditDelegate] = useState(null); // null=closed, false=new, obj=edit
    const [delConfirm,   setDelConfirm]   = useState(null); // id to confirm-delete
    const [alertMsg, setAlertMsg] = useState(null);

    // ── Load reference data once
    useEffect(() => {
        fetch(`${variables.API_URL}approval/modules`, { headers: authHeaders() })
            .then(r => r.json()).then(setModules).catch(console.error);

        fetch(`${variables.API_URL}user/roles`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRoles((d || []).map(r => ({ id: r.roleId, name: r.roleName }))))
            .catch(console.error);

        fetch(`${variables.API_URL}user/search?pageSize=500&status=Active`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setUsers((d.data || []).map(u => ({ id: u.userId, name: u.fullName || u.userName }))))
            .catch(console.error);
    }, []);

    // ── Load policies
    const loadPolicies = useCallback(() => {
        setLoadingPol(true);
        fetch(`${variables.API_URL}approval/policies`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setPolicies(d.policies || []); setAllLevels(d.levels || []); })
            .catch(console.error)
            .finally(() => setLoadingPol(false));
    }, []);

    useEffect(() => { loadPolicies(); }, [loadPolicies]);

    // ── Load delegates
    const loadDelegates = useCallback(() => {
        setLoadingDel(true);
        fetch(`${variables.API_URL}approval/delegates`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setDelegates(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoadingDel(false));
    }, []);

    useEffect(() => {
        if (activeTab === 'delegates') loadDelegates();
    }, [activeTab, loadDelegates]);

    // ── Policy helpers
    const openNewPolicy  = () => setEditPolicy(false);
    const openEditPolicy = (p) => {
        const levels = allLevels.filter(l => l.policyId === p.policyId);
        setEditPolicy({ ...p, _levels: levels.length > 0 ? levels : [{ ...BLANK_LEVEL }] });
    };

    const visiblePolicies = filterModule
        ? policies.filter(p => p.moduleCode === filterModule)
        : policies;
    const uniqueModules = [...new Map(policies.map(p => [p.moduleCode, { code: p.moduleCode, name: p.moduleName }])).values()];

    // ── Delegate helpers — build the level picker options from allLevels + policies
    const levelOptions = allLevels.map(l => {
        const pol = policies.find(p => p.policyId === l.policyId);
        return {
            levelId: l.levelId,
            label: pol
                ? `${pol.moduleCode} | ${pol.policyName} › L${l.levelNo}${l.levelName ? ' ' + l.levelName : ''}`
                : `Level ${l.levelId}`,
        };
    }).sort((a, b) => a.label.localeCompare(b.label));

    const deleteDelegate = async (id) => {
        try {
            const res = await fetch(`${variables.API_URL}approval/delegates/${id}?deletedBy=${encodeURIComponent(currentUser)}`, {
                method: 'DELETE', headers: authHeaders(),
            });
            if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to delete delegate.'); return; }
            setDelConfirm(null); loadDelegates();
        } catch { setAlertMsg('Network error. Please try again.'); }
    };

    // ── Tab bar styles
    const tabStyle = (active) => ({
        padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        borderBottom: active ? '2px solid #1e3a5f' : '2px solid transparent',
        color: active ? '#1e3a5f' : '#64748b',
        background: 'none', border: 'none', borderBottomStyle: 'solid',
        borderBottomWidth: 2,
        borderBottomColor: active ? '#1e3a5f' : 'transparent',
    });

    return (
        <div className="po-grid-wrap">
            {/* ── Page header ── */}
            <div className="po-grid-header" style={{ paddingBottom: 0 }}>
                <div className="po-title-row" style={{ marginBottom: 12 }}>
                    <h1 className="po-title">Approval Configuration</h1>
                    {activeTab === 'policies' && (
                        <button className="po-btn-pri" onClick={openNewPolicy}>+ New Policy</button>
                    )}
                    {activeTab === 'delegates' && (
                        <button className="po-btn-pri" onClick={() => setEditDelegate(false)}>+ Add Delegate</button>
                    )}
                </div>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: 0 }}>
                    <button style={tabStyle(activeTab === 'policies')} onClick={() => setActiveTab('policies')}>
                        Policies
                    </button>
                    <button style={tabStyle(activeTab === 'delegates')} onClick={() => setActiveTab('delegates')}>
                        Delegates
                        {delegates.filter(d => d.isCurrentlyActive).length > 0 && (
                            <span style={{ marginLeft: 6, background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                                {delegates.filter(d => d.isCurrentlyActive).length} active
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* ══════════════ POLICIES TAB ══════════════ */}
            {activeTab === 'policies' && (
                <>
                    {/* Module filter pills */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 0 4px' }}>
                        {[{ code: '', name: 'All' }, ...uniqueModules].map(m => {
                            const active = filterModule === m.code;
                            return (
                                <button key={m.code} onClick={() => setFilterModule(m.code)}
                                    style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: active ? '2px solid #1e3a5f' : '1px solid #e2e8f0', background: active ? '#1e3a5f18' : '#f8fafc', color: active ? '#1e3a5f' : '#64748b' }}>
                                    {m.name}
                                </button>
                            );
                        })}
                    </div>

                    <div className="po-table-wrap" style={{ position: 'relative' }}>
                        {loadingPol && (
                            <div className="po-loading-overlay">
                                <div className="po-spinner"><div className="po-spinner-ring" /><div className="po-spinner-text">Loading…</div></div>
                            </div>
                        )}
                        {!loadingPol && visiblePolicies.length === 0 ? (
                            <div className="po-empty">
                                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                                <div>No approval policies configured yet.</div>
                                <button className="po-btn-pri" style={{ marginTop: 12 }} onClick={openNewPolicy}>+ Create First Policy</button>
                            </div>
                        ) : (
                            <table className="po-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 80 }}>Module</th>
                                        <th>Policy Name</th>
                                        <th style={{ width: 120, textAlign: 'right' }}>Amount From</th>
                                        <th style={{ width: 120, textAlign: 'right' }}>Amount To</th>
                                        <th style={{ width: 70, textAlign: 'center' }}>Levels</th>
                                        <th style={{ width: 80, textAlign: 'center' }}>Sequential</th>
                                        <th style={{ width: 70, textAlign: 'center' }}>Active</th>
                                        <th style={{ width: 40 }} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblePolicies.map(p => {
                                        const lvls = allLevels.filter(l => l.policyId === p.policyId);
                                        return (
                                            <tr key={p.policyId}>
                                                <td>
                                                    <span style={{ background: '#1e3a5f18', color: '#1e3a5f', border: '1px solid #1e3a5f40', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                                        {p.moduleCode}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.policyName}</div>
                                                    {p.description && <div style={{ fontSize: 11, color: '#64748b' }}>{p.description}</div>}
                                                    {lvls.length > 0 && (
                                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                                            {lvls.map(l => (
                                                                <span key={l.levelId} style={{ fontSize: 10.5, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 6px' }}>
                                                                    L{l.levelNo} {l.levelName || l.approverName || '—'}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                                    {p.amountFrom != null ? Number(p.amountFrom).toLocaleString() : '—'}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                                    {p.amountTo != null ? Number(p.amountTo).toLocaleString() : '∞'}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#1e3a5f' }}>{p.totalLevels}</td>
                                                <td style={{ textAlign: 'center', fontSize: 13 }}>{p.isSequential ? '✔' : '—'}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: p.isActive ? '#166534' : '#dc2626' }}>
                                                        {p.isActive ? 'Yes' : 'No'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button className="po-act-btn" onClick={() => openEditPolicy(p)} title="Edit">✎</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {editPolicy !== null && (
                        <PolicyForm
                            policy={editPolicy === false ? null : editPolicy}
                            modules={modules}
                            roles={roles}
                            users={users}
                            currentUser={currentUser}
                            onSaved={() => { setEditPolicy(null); loadPolicies(); }}
                            onClose={() => setEditPolicy(null)}
                        />
                    )}
                </>
            )}

            {/* ══════════════ DELEGATES TAB ══════════════ */}
            {activeTab === 'delegates' && (
                <>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 0 8px' }}>
                        <button className="po-act-btn" onClick={loadDelegates} style={{ fontSize: 12 }}>↺ Refresh</button>
                        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                            {delegates.length} record{delegates.length !== 1 ? 's' : ''}
                        </div>
                    </div>

                    <div className="po-table-wrap" style={{ position: 'relative' }}>
                        {loadingDel && (
                            <div className="po-loading-overlay">
                                <div className="po-spinner"><div className="po-spinner-ring" /><div className="po-spinner-text">Loading…</div></div>
                            </div>
                        )}
                        {!loadingDel && delegates.length === 0 ? (
                            <div className="po-empty">
                                <div style={{ fontSize: 32, marginBottom: 8 }}>🔄</div>
                                <div>No delegates configured.</div>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                                    Delegates allow a user to act on behalf of an approver for a date range.
                                </div>
                                <button className="po-btn-pri" style={{ marginTop: 12 }} onClick={() => setEditDelegate(false)}>
                                    + Add First Delegate
                                </button>
                            </div>
                        ) : (
                            <table className="po-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 80 }}>Module</th>
                                        <th>Policy › Level</th>
                                        <th>Original Approver</th>
                                        <th>Delegated To</th>
                                        <th style={{ width: 100 }}>From</th>
                                        <th style={{ width: 100 }}>To</th>
                                        <th style={{ width: 100 }}>Status</th>
                                        <th style={{ width: 60 }} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {delegates.map(d => (
                                        <tr key={d.delegateId}>
                                            <td>
                                                <span style={{ background: '#1e3a5f18', color: '#1e3a5f', border: '1px solid #1e3a5f40', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                                    {d.moduleCode}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600, fontSize: 12 }}>{d.policyName}</div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                                    L{d.levelNo}{d.levelName ? ' — ' + d.levelName : ''}
                                                </div>
                                            </td>
                                            <td style={{ fontSize: 13 }}>{d.originalUserName}</td>
                                            <td style={{ fontSize: 13, fontWeight: 600 }}>{d.delegateUserName}</td>
                                            <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmtDate(d.fromDate)}</td>
                                            <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmtDate(d.toDate)}</td>
                                            <td>
                                                <DelegateStatusBadge
                                                    isActive={d.isActive}
                                                    isCurrentlyActive={d.isCurrentlyActive}
                                                    fromDate={d.fromDate}
                                                    toDate={d.toDate}
                                                />
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button className="po-act-btn" title="Edit"
                                                        onClick={() => setEditDelegate(d)}>✎</button>
                                                    <button title="Remove"
                                                        onClick={() => setDelConfirm(d.delegateId)}
                                                        style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
                                                        ✕
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Delete confirmation modal */}
                    {delConfirm !== null && (
                        <div className="pf-overlay">
                            <div style={{ background: '#fff', borderRadius: 10, padding: 28, maxWidth: 360, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}
                                onClick={e => e.stopPropagation()}>
                                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#1e3a5f' }}>Remove Delegate?</div>
                                <div style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>
                                    This will deactivate the delegation. The delegate will no longer be able to act on behalf of the original approver.
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button className="pf-btn-sec" onClick={() => setDelConfirm(null)}>Cancel</button>
                                    <button className="pf-btn-pri" style={{ background: '#dc2626', borderColor: '#dc2626' }}
                                        onClick={() => deleteDelegate(delConfirm)}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {editDelegate !== null && (
                        <DelegateForm
                            delegate={editDelegate === false ? null : editDelegate}
                            levelOptions={levelOptions}
                            users={users}
                            currentUser={currentUser}
                            onSaved={() => { setEditDelegate(null); loadDelegates(); }}
                            onClose={() => setEditDelegate(null)}
                        />
                    )}
                </>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default ApprovalPoliciesPage;
