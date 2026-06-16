import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate } from '../procurementConstants';
import RtvOverviewTab from './tabs/RtvOverviewTab';
import RtvLinesTab    from './tabs/RtvLinesTab';
import PostRtvModal   from './PostRtvModal';
import '../../jobs/JobDetail.css';
import '../Procurement.css';

const RTV_TABS = [
    { key: 'overview', label: 'Overview', icon: '📋' },
    { key: 'lines',    label: 'Lines',    icon: '↩️', badge: true },
];

const RtvDetailPage = () => {
    const { rtvId }      = useParams();
    const navigate       = useNavigate();
    const currentUser    = useCurrentUser();
    const { canDo }      = usePermission();
    const canEdit        = canDo('/rtv', 'EDIT');
    const canDelete      = canDo('/rtv', 'DELETE');

    const [rtv,       setRtv]       = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [posting,    setPosting]    = useState(false);
    const [showPost,   setShowPost]   = useState(false);
    const [deleting,  setDeleting]  = useState(false);
    const [actionErr, setActionErr] = useState('');
    const [linesCount, setLinesCount] = useState(null);

    const loadRtv = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}rtv/${rtvId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setRtv(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
        // Line count for the post-RTV pre-check.
        fetch(`${variables.API_URL}rtv/${rtvId}/lines`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setLinesCount(Array.isArray(d) ? d.length : 0))
            .catch(() => setLinesCount(null));
    }, [rtvId]);

    useEffect(() => { loadRtv(); }, [loadRtv]);

    const postRtv = () => {
        if (linesCount === 0) {
            setActionErr('No line items added yet. Add at least one return line on the Lines tab first.');
            return;
        }
        setShowPost(true);
    };

    const handlePostSubmit = async (reason, password) => {
        setPosting(true); setActionErr('');
        try {
            const res = await fetch(`${variables.API_URL}rtv/${rtvId}/post`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ postedBy: currentUser, reason, password }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || `Post failed (HTTP ${res.status}).`;
            setShowPost(false);
            loadRtv();
            return null;
        } catch (e) {
            return `Network error — ${e?.message || 'could not reach the server.'}`;
        } finally { setPosting(false); }
    };

    const deleteRtv = async () => {
        if (!window.confirm('Delete this RTV? This cannot be undone.')) return;
        setDeleting(true); setActionErr('');
        try {
            const res = await fetch(`${variables.API_URL}rtv/${rtvId}`, {
                method: 'DELETE', headers: authHeaders(),
            });
            const d = await res.json();
            if (!res.ok) { setActionErr(d.message || 'Error deleting RTV.'); setDeleting(false); return; }
            navigate('/rtv');
        } catch { setActionErr('Network error.'); setDeleting(false); }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading return to vendor…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/rtv')}>← Back to RTVs</button>
        </div>
    );
    if (!rtv) return null;

    const isDraft    = rtv.status === 'Draft';
    const isPosted   = rtv.status === 'Posted';
    const lineCount  = rtv.lineCount || 0;

    const statusStyle = {
        background: isPosted          ? '#dcfce7'
                  : rtv.status === 'Cancelled' ? '#fee2e2'
                  : '#e0f2fe',
        color:      isPosted          ? '#166534'
                  : rtv.status === 'Cancelled' ? '#991b1b'
                  : '#0369a1',
        padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 5,
    };
    const dotColor = isPosted ? '#16a34a' : rtv.status === 'Cancelled' ? '#dc2626' : '#0284c7';

    return (
        <div className="jd-page">
            {showPost && (
                <PostRtvModal
                    rtv={rtv}
                    onClose={() => setShowPost(false)}
                    onSubmit={handlePostSubmit}
                />
            )}
            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/rtv')}>← RTV</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{rtv.rtvNumber}</div>
                    <div className="jd-header-info">
                        {rtv.supplierName && (
                            <span className="jd-header-customer">{rtv.supplierName}</span>
                        )}
                        {rtv.grnNumber && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">GRN: {rtv.grnNumber}</span></>
                        )}
                        {rtv.poNumber && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">PO: {rtv.poNumber}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span style={statusStyle}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                        {rtv.status}
                    </span>

                    {isDraft && lineCount > 0 && canEdit && (
                        <button className="jd-stage-btn"
                            style={{ background: '#0f766e', color: '#fff', border: 'none' }}
                            onClick={postRtv} disabled={posting}>
                            {posting ? 'Posting…' : '✓ Post RTV'}
                        </button>
                    )}

                    {isDraft && canDelete && (
                        <button className="jd-stage-btn"
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}
                            onClick={deleteRtv} disabled={deleting}>
                            {deleting ? 'Deleting…' : '🗑 Delete'}
                        </button>
                    )}
                </div>
            </div>

            {actionErr && (
                <div style={{ margin: '0 0 10px', padding: '10px 14px', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 7, color: '#991b1b', fontSize: 13 }}>
                    ⚠ {actionErr}
                </div>
            )}

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'RTV Date',    val: fmtDate(rtv.rtvDate),    cls: '' },
                    rtv.grnNumber && { label: 'Source GRN',  val: rtv.grnNumber,         cls: 'jd-kpi-mono' },
                    rtv.poNumber  && { label: 'PO',          val: rtv.poNumber,           cls: 'jd-kpi-mono' },
                    rtv.supplierName && { label: 'Supplier', val: rtv.supplierName,       cls: '' },
                    { label: 'Total Return', val: fmt(rtv.totalAmount),   cls: 'jd-kpi-blue' },
                    { label: 'Lines',        val: lineCount,              cls: '' },
                ].filter(Boolean).map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── POST INFO BANNER ── */}
            {isDraft && lineCount === 0 && (
                <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12, color: '#92400e', marginBottom: 10 }}>
                    💡 Add return lines before posting. Use <strong>📋 Import from GRN</strong> on the Lines tab if a GRN is linked.
                </div>
            )}
            {isDraft && lineCount > 0 && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, color: '#166534', marginBottom: 10 }}>
                    ✅ Ready to post — {lineCount} return line{lineCount !== 1 ? 's' : ''} recorded.
                    Posting will deduct stock and create offsetting ledger entries.
                </div>
            )}
            {isPosted && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 7, fontSize: 12, color: '#166534', marginBottom: 10 }}>
                    ✔ RTV posted — stock OUT entries have been created. This record is now read-only.
                </div>
            )}

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {RTV_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.key === 'lines' && lineCount > 0 && (
                            <span className="jd-tab-badge">{lineCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                {activeTab === 'overview' && <RtvOverviewTab rtv={rtv} onRefresh={loadRtv} />}
                {activeTab === 'lines'    && <RtvLinesTab    rtv={rtv} onRefresh={loadRtv} />}
            </div>
        </div>
    );
};

export default RtvDetailPage;
