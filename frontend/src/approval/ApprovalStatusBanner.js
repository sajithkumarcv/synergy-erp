import React from 'react';

// ── Lightweight banner shown on document detail pages ────────────────────
// Shows current approval state without loading the full history tab.
//
// Props:
//   transaction – the ApprovalTransaction object (or null/undefined)
//   loading     – bool
const ApprovalStatusBanner = ({ transaction: tx, loading }) => {
    if (loading) return null;
    if (!tx) return null;

    const isPending   = tx.currentStatus === 'Pending';
    const isApproved  = ['Approved','Confirmed'].includes(tx.finalAction);
    const isRejected  = tx.finalAction === 'Rejected';
    const isSentBack  = tx.finalAction === 'SentBack';
    const isCancelled = tx.finalAction === 'Cancelled';

    let bg, border, color, icon, text;

    if (isPending) {
        bg = '#fef3c7'; border = '#fde68a'; color = '#92400e'; icon = '⏳';
        text = `Pending approval — Level ${tx.currentLevelNo} of ${tx.totalLevels}`;
        if (tx.levelName) text += ` · ${tx.levelName}`;
    } else if (isApproved) {
        bg = '#dcfce7'; border = '#86efac'; color = '#166534'; icon = '✔';
        text = `Approved by ${tx.finalActionBy || '—'}`;
    } else if (isRejected) {
        bg = '#fee2e2'; border = '#fca5a5'; color = '#991b1b'; icon = '✖';
        text = `Rejected by ${tx.finalActionBy || '—'}`;
        if (tx.finalRemarks) text += ` — "${tx.finalRemarks}"`;
    } else if (isSentBack) {
        bg = '#fef3c7'; border = '#fde68a'; color = '#92400e'; icon = '↩';
        text = `Sent back for revision`;
        if (tx.finalRemarks) text += ` — "${tx.finalRemarks}"`;
    } else if (isCancelled) {
        bg = '#f1f5f9'; border = '#cbd5e1'; color = '#475569'; icon = '⊘';
        text = `Approval cancelled`;
    } else {
        return null;
    }

    // Build user chips for pending state
    const currentUsers = isPending && tx.approverUsers ? tx.approverUsers.split(', ').filter(Boolean) : [];
    const nextUsers    = isPending && tx.nextApproverUsers ? tx.nextApproverUsers.split(', ').filter(Boolean) : [];

    return (
        <div style={{
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 14,
            fontSize: 12.5,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15 }}>{icon}</span>
                <span style={{ color, fontWeight: 500 }}>{text}</span>

                {/* Current approver chips */}
                {currentUsers.length > 0 && (
                    <>
                        <span style={{ color: '#92400e', opacity: 0.5 }}>·</span>
                        <span style={{ fontSize: 11.5, color: '#92400e' }}>Pending with:</span>
                        {currentUsers.map(name => (
                            <span key={name} style={{ fontSize: 11, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 12, padding: '1px 8px', fontWeight: 600 }}>
                                {name}
                            </span>
                        ))}
                    </>
                )}
            </div>

            {/* Next approver row */}
            {nextUsers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#78716c' }}>
                        Up next — Level {tx.nextLevelNo}{tx.nextLevelName ? ` · ${tx.nextLevelName}` : ''}:
                    </span>
                    {nextUsers.map(name => (
                        <span key={name} style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 12, padding: '1px 8px', fontWeight: 600 }}>
                            {name}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ApprovalStatusBanner;
