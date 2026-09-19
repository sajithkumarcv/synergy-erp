import React from 'react';
import { variables, authHeaders } from '../../Variable';
import { useLookup } from '../../LookupContext';
import { useApprovalLevels, pendingLevelCode } from '../../common/useApprovalLevels';
import PrPrintModal from './PrPrintModal';
import '../po/PoPrint.css';

// ── PR Info View (print-style, read-only — no letterhead) ──────────
// Loads the full PR header, then renders the print document in info-only mode.
// The status shows the real approval level.
//
// Used by the PR grid's 👁 View and by the 👁 in My Approvals.
//   onOpenFull (optional) adds an "Open full page" button to the toolbar.
const PrInfoModal = ({ prId, onClose, onOpenFull }) => {
    const [pr,    setPr]    = React.useState(null);
    const [error, setError] = React.useState(false);
    const { getStatusConfig } = useLookup();
    const levels = useApprovalLevels('PR', pr ? [pr] : [], 'prId');

    React.useEffect(() => {
        fetch(`${variables.API_URL}purchaserequest/${prId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(setPr)
            .catch(() => setError(true));
    }, [prId]);

    if (error) return null;
    if (!pr) {
        return (
            <div className="po-print-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
                <div style={{ color: '#fff', margin: 'auto', fontSize: 14 }}>Loading…</div>
            </div>
        );
    }
    const shown = pendingLevelCode(pr.status, levels[pr.prId]);
    const cfg   = getStatusConfig('PR', shown) || getStatusConfig('PR', pr.status);
    return (
        <PrPrintModal pr={pr} infoOnly statusLabel={cfg?.statusLabel || pr.status}
                      onOpenFull={onOpenFull} onClose={onClose} />
    );
};

export default PrInfoModal;