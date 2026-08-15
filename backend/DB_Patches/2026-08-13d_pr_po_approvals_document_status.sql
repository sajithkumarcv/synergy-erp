-- ═══════════════════════════════════════════════════════════════════════
-- sp_GetAllApprovals: join in each document's own lifecycle status
-- (Draft/Sent/Partial/Received/... for PO, Draft/Submitted/Ordered/...
-- for PR) — used by the new "PR & PO Approvals" page's Stage column
-- 2026-08-13
--
-- Previously this proc only ever read TBL_APPROVAL_TRANSACTION.CurrentStatus
-- (the generic Pending/Approved/Rejected/Cancelled approval-workflow
-- status). New LEFT JOINs to TBL_PURCHASE_ORDER / TBL_PURCHASE_REQUEST
-- (matched by DocumentId + ModuleCode) pull each row's real document
-- status, then LEFT JOIN to the existing TBL_DOCUMENT_STATUS lookup for
-- its label + badge colors — reusing the same colors the rest of the app
-- already uses for these statuses, nothing new invented. Only PO/PR are
-- joined; every other module's DocumentStatus/-Label/-Bg/-Color come back
-- NULL, unaffected by this change. New @DocumentStatus filter param
-- (comma list, same CHARINDEX pattern as the existing @Status/@ModuleCode).
--
-- Needs: backend rebuild (ApprovalController.cs gained a documentStatus
-- query param + 4 new response fields) + frontend redeploy
-- (PrPoApprovalsPage.js — Module + Document Stage are both checkbox
-- filters now, new Stage column).
-- No data migration, safe to re-run (ALTERs an existing proc).
-- ═══════════════════════════════════════════════════════════════════════

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

ALTER PROCEDURE proj.sp_GetAllApprovals
    @Status         NVARCHAR(200) = NULL,
    @ModuleCode     NVARCHAR(200) = NULL,
    @DocumentStatus NVARCHAR(300) = NULL,
    @SearchText     NVARCHAR(200) = NULL,
    @SubmittedBy    NVARCHAR(200) = NULL,
    @FinalActionBy  NVARCHAR(200) = NULL,
    @DateFrom       DATE          = NULL,
    @DateTo         DATE          = NULL,
    @PageNumber     INT           = 1,
    @PageSize       INT           = 50,
    @SortCol        NVARCHAR(50)  = 'SubmittedDate',
    @SortDir        NVARCHAR(4)   = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;
    SET @SearchText    = NULLIF(LTRIM(RTRIM(@SearchText)),    '');
    SET @SubmittedBy   = NULLIF(LTRIM(RTRIM(@SubmittedBy)),   '');
    SET @FinalActionBy = NULLIF(LTRIM(RTRIM(@FinalActionBy)), '');

    SELECT
        t.TransactionId,
        m.ModuleCode,
        m.ModuleName,
        t.DocumentId,
        t.DocumentNo,
        t.DocumentAmount,
        t.CurrentStatus,
        t.CurrentLevelNo,
        t.TotalLevels,
        p.PolicyName,
        -- Resolves Role-type approvers to the actual users holding that role
        -- (via TBL_USER_ROLES) instead of just the role name, matching the
        -- same pattern sp_GetApprovalStatus's ApproverUsers column already
        -- uses on document detail pages. Falls back to 'Anyone' when the
        -- level has no specific/resolvable approver (an ApproverType='ANY'
        -- level, or a role currently held by nobody).
        ISNULL(NULLIF(STUFF((
            SELECT DISTINCT ', ' + name FROM (
                SELECT cu.FullName AS name
                FROM proj.TBL_APPROVAL_LEVEL al
                JOIN proj.TBL_USER_ROLES cur ON cur.RoleId = al.ApproverId AND al.ApproverType = 'Role'
                JOIN proj.TBL_USERS cu ON cu.UserId = cur.UserId AND cu.IsActive = 1
                WHERE al.PolicyId = t.PolicyId AND al.LevelNo = t.CurrentLevelNo AND al.IsActive = 1
                UNION ALL
                SELECT ISNULL(u.FullName, '(user)') AS name
                FROM proj.TBL_APPROVAL_LEVEL al
                JOIN proj.TBL_USERS u ON u.UserId = al.ApproverId AND al.ApproverType = 'User'
                WHERE al.PolicyId = t.PolicyId AND al.LevelNo = t.CurrentLevelNo AND al.IsActive = 1
            ) names
            FOR XML PATH(''), TYPE
        ).value('.','NVARCHAR(MAX)'), 1, 2, ''), ''), 'Anyone')                AS CurrentApprover,
        t.SubmittedBy,
        t.SubmittedDate,
        t.CompletedDate,
        t.FinalAction,
        t.FinalActionBy,
        t.FinalRemarks,
        DATEDIFF(DAY, t.SubmittedDate, ISNULL(t.CompletedDate, GETDATE())) AS DaysElapsed,
        ISNULL(po.Status, pr.Status)                                     AS DocumentStatus,
        ISNULL(dsPo.StatusLabel, dsPr.StatusLabel)                       AS DocumentStatusLabel,
        ISNULL(dsPo.BadgeBg,     dsPr.BadgeBg)                           AS DocumentStatusBg,
        ISNULL(dsPo.BadgeColor,  dsPr.BadgeColor)                        AS DocumentStatusColor,
        COUNT(*) OVER() AS TotalRows
    FROM proj.TBL_APPROVAL_TRANSACTION t
    JOIN proj.TBL_APPROVAL_MODULE m ON m.ModuleId = t.ModuleId
    JOIN proj.TBL_APPROVAL_POLICY p ON p.PolicyId = t.PolicyId
    LEFT JOIN proj.TBL_PURCHASE_ORDER   po ON m.ModuleCode = 'PO' AND po.PoId = t.DocumentId
    LEFT JOIN proj.TBL_PURCHASE_REQUEST pr ON m.ModuleCode = 'PR' AND pr.PrId = t.DocumentId
    LEFT JOIN proj.TBL_DOCUMENT_STATUS  dsPo ON dsPo.ModuleName = 'PO' AND dsPo.StatusCode = po.Status
    LEFT JOIN proj.TBL_DOCUMENT_STATUS  dsPr ON dsPr.ModuleName = 'PR' AND dsPr.StatusCode = pr.Status
    WHERE
        (@Status         IS NULL OR CHARINDEX(',' + t.CurrentStatus + ',', ',' + @Status         + ',') > 0)
        AND (@ModuleCode     IS NULL OR CHARINDEX(',' + m.ModuleCode  + ',', ',' + @ModuleCode     + ',') > 0)
        AND (@DocumentStatus IS NULL OR CHARINDEX(',' + ISNULL(po.Status, pr.Status) + ',', ',' + @DocumentStatus + ',') > 0)
        AND (@SearchText   IS NULL OR t.DocumentNo     LIKE N'%' + @SearchText   + N'%'
                                   OR t.SubmittedBy    LIKE N'%' + @SearchText   + N'%'
                                   OR t.FinalActionBy  LIKE N'%' + @SearchText   + N'%')
        AND (@SubmittedBy   IS NULL OR t.SubmittedBy   LIKE N'%' + @SubmittedBy   + N'%')
        AND (@FinalActionBy IS NULL OR t.FinalActionBy LIKE N'%' + @FinalActionBy + N'%')
        AND (@DateFrom IS NULL OR CAST(t.SubmittedDate AS DATE) >= @DateFrom)
        AND (@DateTo   IS NULL OR CAST(t.SubmittedDate AS DATE) <= @DateTo)
    ORDER BY
        CASE WHEN @SortCol='SubmittedDate' AND @SortDir='DESC' THEN t.SubmittedDate  END DESC,
        CASE WHEN @SortCol='SubmittedDate' AND @SortDir='ASC'  THEN t.SubmittedDate  END ASC,
        CASE WHEN @SortCol='DocumentNo'    AND @SortDir='DESC' THEN t.DocumentNo     END DESC,
        CASE WHEN @SortCol='DocumentNo'    AND @SortDir='ASC'  THEN t.DocumentNo     END ASC,
        CASE WHEN @SortCol='CurrentStatus' AND @SortDir='DESC' THEN t.CurrentStatus  END DESC,
        CASE WHEN @SortCol='CurrentStatus' AND @SortDir='ASC'  THEN t.CurrentStatus  END ASC,
        CASE WHEN @SortCol='DaysElapsed'   AND @SortDir='DESC'
             THEN DATEDIFF(DAY, t.SubmittedDate, ISNULL(t.CompletedDate, GETDATE())) END DESC,
        CASE WHEN @SortCol='DaysElapsed'   AND @SortDir='ASC'
             THEN DATEDIFF(DAY, t.SubmittedDate, ISNULL(t.CompletedDate, GETDATE())) END ASC,
        t.SubmittedDate DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO
