import { useEffect, useState } from 'react';
import { variables, authHeaders } from '../Variable';

// ─────────────────────────────────────────────────────────────────────────
// Which approval level is each pending document on?
//
// A document waiting for approval is very often stored with the plain status
// 'PendingApproval' whatever level it is at (the level text is optional on an
// approval policy, and most policies leave it blank). The real level lives on the
// approval transaction. List pages call this once per page of rows and show
// "Pending Level 3 Approval" on the badge instead of a bare "Pending Approval".
//
//   const levels = useApprovalLevels('PO', rows, 'poId');
//   const code   = pendingLevelCode(row.status, levels[row.poId]);   // 'PendingL3' | row.status
//
// One request per page, and none when nothing on the page is pending. Failure is
// silent: the badge just falls back to the stored status.
// GET approval/levels?moduleCode=PO&ids=1,2,3 -> [{ documentId, levelNo, totalLevels }]
// ─────────────────────────────────────────────────────────────────────────

const isPending = (s) => typeof s === 'string' && s.startsWith('Pending');

export const useApprovalLevels = (moduleCode, rows, idKey, statusKey = 'status') => {
    const [levels, setLevels] = useState({});
    const ids = (rows || []).filter(r => isPending(r[statusKey]) && r[idKey] != null).map(r => r[idKey]);
    const key = ids.join(',');

    useEffect(() => {
        if (!key) { setLevels({}); return undefined; }
        let live = true;
        fetch(`${variables.API_URL}approval/levels?moduleCode=${encodeURIComponent(moduleCode)}&ids=${key}`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : []))
            .then(list => {
                if (!live) return;
                const map = {};
                (Array.isArray(list) ? list : []).forEach(x => { map[x.documentId] = x; });
                setLevels(map);
            })
            .catch(() => { if (live) setLevels({}); });
        return () => { live = false; };
    }, [moduleCode, key]);

    return levels;
};

// The status CODE to look up for the badge: 'PendingL<n>' for a pending document
// whose level is known (1-4, the codes that exist in TBL_DOCUMENT_STATUS), else
// the stored status unchanged.
export const pendingLevelCode = (status, level) =>
    (isPending(status) && level && level.levelNo >= 1 && level.levelNo <= 4)
        ? `PendingL${level.levelNo}`
        : status;
