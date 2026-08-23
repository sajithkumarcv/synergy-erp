/* ============================================================================
   My Approvals grid — show the Job No. on PO and PR rows

   sp_GetMyApprovals reads TBL_APPROVAL_TRANSACTION, which stores only the
   module + document id, so the approvals queue had no way to show which job a
   PO/PR belongs to. Approvers were identifying documents by number alone.

   Adds JobId + JobTitle + SupplierName via one OUTER APPLY that resolves the
   underlying document per module:
     PO  -> TBL_PURCHASE_ORDER      (PoId)        + supplier name
     PR  -> TBL_PURCHASE_REQUEST    (PrId)
     INV -> TBL_INVOICE             (InvoiceId)
     JOB -> TBL_JOB                 (JobNumId - the numeric surrogate)
     BOM -> TBL_BOM_HEADER          (BomHeaderId)
     SRV -> TBL_SRV_HEADER          (SrvId)
     IRN -> via TBL_STOCK_ISSUE_RETURN.IssueId -> TBL_STOCK_ISSUE.JobId
     MH  -> TBL_MANHOUR             (BatchId), only when the batch is one job
     STR -> TBL_STOCK_TRANSFER.FromJobId
   ADJ, RV, PV, CN and DN have no job on the document at all and stay NULL.
   Supplier is PO-only.

   Purely additive - three new output columns, no parameter or filter change, so
   any caller that does not select them is unaffected. Safe to run before the
   API build that consumes them.

   APPLY TO: SYNERGYINDIA (the restored live db now used by dev) first, then
   prod SYNERPINDIA. Needs the matching API build - MyApprovalItem gains
   JobId/JobTitle/SupplierName.

   BEFORE APPLYING, confirm the target's current definition matches the one this
   was written from (dev SYNERP, 2026-08-18):
     SELECT m.definition FROM sys.sql_modules m
     JOIN sys.objects o ON o.object_id = m.object_id
     WHERE o.name = 'sp_GetMyApprovals';
   ============================================================================ */

ALTER PROCEDURE PROJ.sp_GetMyApprovals
    @UserId   INT,
    @Page     INT = 1,
    @PageSize INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Pending AS (
        SELECT
            t.TransactionId, m.ModuleCode, m.ModuleName,
            t.DocumentId, t.DocumentNo, t.DocumentAmount,
            t.CurrentLevelNo, t.TotalLevels, t.SubmittedBy, t.SubmittedDate,
            t.PolicyId
        FROM   PROJ.TBL_APPROVAL_TRANSACTION t
        JOIN   PROJ.TBL_APPROVAL_MODULE      m ON m.ModuleId = t.ModuleId
        WHERE  t.CurrentStatus = 'Pending'
    ),
    CurLvl AS (
        SELECT
            p.TransactionId,
            STUFF((
                SELECT ', ' + (CASE
                                WHEN al.ApproverType = 'Role' THEN ISNULL(r.RoleName,'(role)')
                                WHEN al.ApproverType = 'User' THEN ISNULL(uu.FullName,'(user)')
                                ELSE 'Anyone'
                              END)
                FROM PROJ.TBL_APPROVAL_LEVEL al
                LEFT JOIN PROJ.TBL_ROLES r  ON r.RoleId  = al.ApproverId AND al.ApproverType = 'Role'
                LEFT JOIN PROJ.TBL_USERS uu ON uu.UserId = al.ApproverId AND al.ApproverType = 'User'
                WHERE al.PolicyId = p.PolicyId AND al.LevelNo = p.CurrentLevelNo AND al.IsActive = 1
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS LevelName,
            STUFF((
                SELECT DISTINCT ', ' + cu.FullName
                FROM PROJ.TBL_APPROVAL_LEVEL al
                JOIN PROJ.TBL_USER_ROLES cur ON cur.RoleId = al.ApproverId AND al.ApproverType = 'Role'
                JOIN PROJ.TBL_USERS      cu  ON cu.UserId  = cur.UserId AND cu.IsActive = 1
                WHERE al.PolicyId = p.PolicyId AND al.LevelNo = p.CurrentLevelNo AND al.IsActive = 1
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS ApproverUsers
        FROM Pending p
    ),
    NextLvl AS (
        SELECT
            p.TransactionId,
            (p.CurrentLevelNo + 1) AS NextLevelNo,
            STUFF((
                SELECT ', ' + (CASE
                                WHEN al.ApproverType = 'Role' THEN ISNULL(r.RoleName,'(role)')
                                WHEN al.ApproverType = 'User' THEN ISNULL(uu.FullName,'(user)')
                                ELSE 'Anyone'
                              END)
                FROM PROJ.TBL_APPROVAL_LEVEL al
                LEFT JOIN PROJ.TBL_ROLES r  ON r.RoleId  = al.ApproverId AND al.ApproverType = 'Role'
                LEFT JOIN PROJ.TBL_USERS uu ON uu.UserId = al.ApproverId AND al.ApproverType = 'User'
                WHERE al.PolicyId = p.PolicyId AND al.LevelNo = p.CurrentLevelNo + 1 AND al.IsActive = 1
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS NextLevelName,
            STUFF((
                SELECT DISTINCT ', ' + nu.FullName
                FROM PROJ.TBL_APPROVAL_LEVEL al
                JOIN PROJ.TBL_USER_ROLES nur ON nur.RoleId = al.ApproverId AND al.ApproverType = 'Role'
                JOIN PROJ.TBL_USERS      nu  ON nu.UserId  = nur.UserId AND nu.IsActive = 1
                WHERE al.PolicyId = p.PolicyId AND al.LevelNo = p.CurrentLevelNo + 1 AND al.IsActive = 1
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS NextApproverUsers
        FROM Pending p
    )
    SELECT
        p.TransactionId, p.ModuleCode, p.ModuleName,
        p.DocumentId, p.DocumentNo, p.DocumentAmount,
        p.CurrentLevelNo, p.TotalLevels,
        c.LevelName,
        p.SubmittedBy, p.SubmittedDate,
        c.ApproverUsers,
        n.NextLevelNo, n.NextLevelName, n.NextApproverUsers,
        jb.JobId, jb.JobTitle, jb.SupplierName,
        CASE WHEN p.SubmittedBy = u.UserName AND NOT EXISTS (
                SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL al
                WHERE al.PolicyId = p.PolicyId AND al.LevelNo = p.CurrentLevelNo
                  AND al.IsActive = 1 AND al.AllowSelfApproval = 1
             ) THEN 0 ELSE 1 END AS CanAct,
        COUNT(*) OVER() AS TotalRows
    FROM Pending p
    JOIN PROJ.TBL_USERS u ON u.UserId = @UserId
    LEFT JOIN CurLvl  c ON c.TransactionId = p.TransactionId
    LEFT JOIN NextLvl n ON n.TransactionId = p.TransactionId
    OUTER APPLY (
        -- Job (and, for PO, the supplier) of the underlying document, resolved
        -- per module from TBL_APPROVAL_MODULE's DocumentTable/DocumentIdColumn
        -- mapping. Modules with no job at all - ADJ, RV, PV, CN, DN - simply
        -- match nothing and yield NULL, exactly as before this change.
        SELECT TOP 1 src.JobId, j.ProjectName AS JobTitle, src.SupplierName
        FROM (
            -- Supplier master name, falling back to the name typed on the PO -
            -- same precedence sp_SearchPOs and the PO printouts use.
            SELECT po.JobId, ISNULL(s.SupplierName, po.VendorName) AS SupplierName
            FROM PROJ.TBL_PURCHASE_ORDER po
            LEFT JOIN PROJ.TBL_SUPPLIER s ON s.SupplierId = po.SupplierId
            WHERE p.ModuleCode = 'PO' AND po.PoId = p.DocumentId
            UNION ALL
            SELECT pr.JobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_PURCHASE_REQUEST pr
            WHERE p.ModuleCode = 'PR' AND pr.PrId = p.DocumentId
            UNION ALL
            SELECT inv.JobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_INVOICE inv
            WHERE p.ModuleCode = 'INV' AND inv.InvoiceId = p.DocumentId
            UNION ALL
            -- The JOB module's document IS a job; approvals reference it by the
            -- numeric surrogate JobNumId, not the JobId string.
            SELECT jo.JobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_JOB jo
            WHERE p.ModuleCode = 'JOB' AND jo.JobNumId = p.DocumentId
            UNION ALL
            SELECT bh.JobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_BOM_HEADER bh
            WHERE p.ModuleCode = 'BOM' AND bh.BomHeaderId = p.DocumentId
            UNION ALL
            SELECT sh.JobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_SRV_HEADER sh
            WHERE p.ModuleCode = 'SRV' AND sh.SrvId = p.DocumentId
            UNION ALL
            -- An issue return has no job of its own; it inherits the job of the
            -- issue it reverses.
            SELECT si.JobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_STOCK_ISSUE_RETURN irn
            JOIN PROJ.TBL_STOCK_ISSUE si ON si.IssueId = irn.IssueId
            WHERE p.ModuleCode = 'IRN' AND irn.ReturnId = p.DocumentId
            UNION ALL
            -- A manhour batch is many rows. Show the job only when the whole
            -- batch belongs to one - never an arbitrary pick from a mixed batch.
            -- HAVING COUNT(*) > 0 stops the bare aggregate returning an all-NULL
            -- row for every non-MH document.
            SELECT CASE WHEN COUNT(DISTINCT mh.JobId) = 1 THEN MIN(mh.JobId) END,
                   CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_MANHOUR mh
            WHERE p.ModuleCode = 'MH' AND mh.BatchId = p.DocumentId
            HAVING COUNT(*) > 0
            UNION ALL
            -- Stock transfer moves stock between two jobs; the source is the
            -- one that identifies the document.
            SELECT st.FromJobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_STOCK_TRANSFER st
            WHERE p.ModuleCode = 'STR' AND st.TransferId = p.DocumentId
        ) src
        LEFT JOIN PROJ.TBL_JOB j ON j.JobId = src.JobId
        ORDER BY CASE WHEN src.JobId IS NULL THEN 1 ELSE 0 END
    ) jb
    WHERE
        -- DIRECT match only: user must be the configured approver at THIS level
        -- (any row at CurrentLevelNo). Senior short-circuit still works from
        -- the document detail page, but it no longer clutters this queue.
        EXISTS (
            SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL al
            WHERE al.PolicyId = p.PolicyId AND al.LevelNo = p.CurrentLevelNo AND al.IsActive = 1
              AND (
                    al.ApproverType = 'ANY'
                 OR (al.ApproverType = 'User' AND al.ApproverId = @UserId)
                 OR (al.ApproverType = 'Role' AND EXISTS (
                        SELECT 1 FROM PROJ.TBL_USER_ROLES ur
                        WHERE ur.UserId = @UserId AND ur.RoleId = al.ApproverId))
              )
        )
        -- Active delegation still counts as direct authorization
        OR EXISTS (
            SELECT 1 FROM PROJ.TBL_APPROVAL_DELEGATE ad
            JOIN PROJ.TBL_APPROVAL_LEVEL al ON al.LevelId = ad.LevelId
            WHERE al.PolicyId = p.PolicyId AND al.LevelNo = p.CurrentLevelNo AND al.IsActive = 1
              AND ad.DelegateUserId = @UserId
              AND ad.IsActive       = 1
              AND CAST(GETDATE() AS date) BETWEEN ad.FromDate AND ad.ToDate
        )
    ORDER BY p.SubmittedDate
    OFFSET (@Page - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
