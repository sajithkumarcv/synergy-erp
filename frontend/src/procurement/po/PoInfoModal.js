import React from 'react';
import { variables, authHeaders } from '../../Variable';
import { useLookup } from '../../LookupContext';
import { useApprovalLevels, pendingLevelCode } from '../../common/useApprovalLevels';
import PoPrintModal3 from './PoPrintModal3';
import './PoPrint.css';

// ── PO Info View (print-style, read-only — no letterhead) ──────────
// Same idea as the PR grid's info view: load the PO header, then render the print
// document in info-only mode (company letterhead + print button stripped) so users can
// read a whole PO without leaving the page they are on. The status shows the real
// approval level.
//
// Used by the PO grid's 👁 View and by the 👁 in My Approvals.
//   onOpenFull (optional) adds an "Open full page" button to the toolbar.
const PoInfoModal = ({ poId, onClose, onOpenFull }) => {
    const [po,    setPo]    = React.useState(null);
    const [error, setError] = React.useState(false);
    const { getStatusConfig } = useLookup();
    const levels = useApprovalLevels('PO', po ? [po] : [], 'poId');

    React.useEffect(() => {
        fetch(`${variables.API_URL}purchaseorder/${poId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(setPo)
            .catch(() => setError(true));
    }, [poId]);

    if (error) return null;
    if (!po) {
        return (
            <div className="po-print-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
                <div style={{ color: '#fff', margin: 'auto', fontSize: 14 }}>Loading…</div>
            </div>
        );
    }
    const shown = pendingLevelCode(po.status, levels[po.poId]);
    const cfg   = getStatusConfig('PO', shown) || getStatusConfig('PO', po.status);
    return (
        <PoPrintModal3 po={po} infoOnly statusLabel={cfg?.statusLabel || po.status}
                       onOpenFull={onOpenFull} onClose={onClose} />
    );
};

export default PoInfoModal;
