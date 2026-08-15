-- ═══════════════════════════════════════════════════════════════════════
-- Dashboard "Active Jobs" KPI: exclude In House Jobs, show them as a
-- separate informative sub-count
-- 2026-08-13
--
-- sp_GetDashboard's first result set (top KPI strip): ActiveJobs now
-- excludes job types with IsCostingRequired=0 (In House Jobs), and a new
-- ActiveJobsInHouse column carries that excluded count separately, shown
-- as a small "+N In House Jobs" sub-line on the tile.
--
-- Deliberately scoped to ONLY the top KPI strip's ActiveJobs (first result
-- set) — the separate "Active Jobs" row inside the JOB SUMMARY card
-- (second result set) was left untouched; user only asked about the top
-- strip tile shown in their screenshot.
--
-- Needs: backend rebuild (DashboardController.cs gained activeJobsInHouse
-- field) + frontend redeploy (Dashboard.js KPI card renders the sub-line).
-- No data migration, safe to re-run (ALTERs an existing proc).
-- ═══════════════════════════════════════════════════════════════════════

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

ALTER PROCEDURE proj.sp_GetDashboard
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        (SELECT COUNT(*) FROM proj.TBL_JOB j JOIN proj.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
         WHERE j.JobStatusId=1 AND jt.IsCostingRequired = 1)                                                              AS ActiveJobs,
        (SELECT COUNT(*) FROM proj.TBL_JOB j JOIN proj.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
         WHERE j.JobStatusId=1 AND jt.IsCostingRequired = 0)                                                              AS ActiveJobsInHouse,
        (SELECT COUNT(*) FROM proj.TBL_PURCHASE_REQUEST  WHERE IsActive=1 AND Status NOT IN ('Cancelled','Rejected','Ordered','Closed')) AS OpenPRs,
        (SELECT COUNT(*) FROM proj.TBL_PURCHASE_ORDER    WHERE IsActive=1 AND Status NOT IN ('Cancelled','Received','Completed')) AS OpenPOs,
        (SELECT COUNT(*)
         FROM proj.TBL_APPROVAL_TRANSACTION t
         WHERE t.CurrentStatus = 'Pending'
           AND t.CurrentLevelNo <= t.TotalLevels
           AND EXISTS (
               SELECT 1 FROM proj.TBL_APPROVAL_LEVEL al
               WHERE al.PolicyId = t.PolicyId AND al.LevelNo = t.CurrentLevelNo AND al.IsActive = 1
                 AND (
                       al.ApproverType = 'ANY'
                    OR (al.ApproverType = 'User' AND al.ApproverId = @UserId)
                    OR (al.ApproverType = 'Role' AND EXISTS (
                           SELECT 1 FROM proj.TBL_USER_ROLES ur
                           WHERE ur.UserId = @UserId AND ur.RoleId = al.ApproverId))
                 )
           )
        )                                                                                                                  AS PendingApprovals,
        (SELECT COUNT(*) FROM proj.TBL_INVOICE           WHERE IsActive=1 AND Status='Confirmed')                         AS OpenInvoices;

    SELECT
        SUM(CASE WHEN JobStatusId=1 THEN 1 ELSE 0 END) AS ActiveJobs,
        SUM(CASE WHEN JobStatusId=4 THEN 1 ELSE 0 END) AS CompletedJobs,
        SUM(CASE WHEN JobStatusId=5 THEN 1 ELSE 0 END) AS CancelledJobs,
        SUM(CASE WHEN JobStatusId=2 THEN 1 ELSE 0 END) AS WaitingJobs,
        SUM(CASE WHEN JobStatusId=3 THEN 1 ELSE 0 END) AS FreezedJobs
    FROM proj.TBL_JOB;

    SELECT TOP 6
        t.TransactionId, m.ModuleCode, t.DocumentNo,
        t.DocumentAmount, t.SubmittedDate,
        DATEDIFF(DAY, t.SubmittedDate, GETDATE()) AS DaysPending,
        t.CurrentLevelNo, t.TotalLevels, t.DocumentId
    FROM proj.TBL_APPROVAL_TRANSACTION t
    JOIN proj.TBL_APPROVAL_MODULE m ON m.ModuleId = t.ModuleId
    WHERE t.CurrentStatus = 'Pending'
      AND t.CurrentLevelNo <= t.TotalLevels
      AND EXISTS (
          SELECT 1 FROM proj.TBL_APPROVAL_LEVEL al
          WHERE al.PolicyId=t.PolicyId AND al.LevelNo=t.CurrentLevelNo AND al.IsActive=1
            AND (
                  al.ApproverType='ANY'
               OR (al.ApproverType='User' AND al.ApproverId=@UserId)
               OR (al.ApproverType='Role' AND EXISTS (
                      SELECT 1 FROM proj.TBL_USER_ROLES ur
                      WHERE ur.UserId=@UserId AND ur.RoleId=al.ApproverId))
            )
      )
    ORDER BY t.SubmittedDate;

    SELECT
        SUM(CASE WHEN Status='Draft'           THEN 1 ELSE 0 END) AS DraftPR,
        SUM(CASE WHEN Status='PendingApproval' THEN 1 ELSE 0 END) AS PendingPR,
        SUM(CASE WHEN Status='Approved'        THEN 1 ELSE 0 END) AS ApprovedPR
    FROM proj.TBL_PURCHASE_REQUEST WHERE IsActive=1;

    SELECT
        SUM(CASE WHEN Status='Draft'    THEN 1 ELSE 0 END) AS DraftPO,
        SUM(CASE WHEN Status='Sent'     THEN 1 ELSE 0 END) AS SentPO,
        SUM(CASE WHEN Status='Partial'  THEN 1 ELSE 0 END) AS PartialPO,
        SUM(CASE WHEN Status='Approved' THEN 1 ELSE 0 END) AS ApprovedPO
    FROM proj.TBL_PURCHASE_ORDER WHERE IsActive=1;

    SELECT
        COUNT(*)                                                           AS TotalItems,
        SUM(CASE WHEN QtyOnHand <= 0                   THEN 1 ELSE 0 END) AS OutOfStock,
        SUM(CASE WHEN QtyOnHand > 0 AND QtyOnHand <= 5 THEN 1 ELSE 0 END) AS LowStock,
        ISNULL(SUM(QtyOnHand * AvgUnitCost), 0)                            AS StockValue,
        (SELECT COUNT(*) FROM proj.TBL_GRN_HEADER
         WHERE IsActive=1 AND Status NOT IN ('Confirmed','Cancelled'))      AS PendingGRN
    FROM proj.TBL_STOCK_BALANCE;

    SELECT
        ISNULL((SELECT SUM(TotalAmount)    FROM proj.TBL_INVOICE           WHERE IsActive=1 AND Status IN ('Confirmed','Paid')),0) AS CustomerInvoices,
        ISNULL((SELECT SUM(TotalAmount)    FROM proj.TBL_SUPPLIER_INVOICE  WHERE IsActive=1 AND Status='Approved'),0)             AS SupplierInvoices,
        ISNULL((SELECT SUM(AmountReceived) FROM proj.TBL_RECEIPT_VOUCHER   WHERE IsActive=1 AND Status='Approved'),0)             AS Receipts,
        ISNULL((SELECT SUM(AmountPaid)     FROM proj.TBL_PAYMENT_VOUCHER   WHERE IsActive=1 AND Status='Approved'),0)             AS Payments,
        ISNULL((SELECT SUM(TotalAmount)    FROM proj.TBL_INVOICE           WHERE IsActive=1 AND Status IN ('Confirmed','Paid')),0)
          - ISNULL((SELECT SUM(AmountReceived) FROM proj.TBL_RECEIPT_VOUCHER WHERE IsActive=1 AND Status='Approved'),0)           AS Receivables,
        ISNULL((SELECT SUM(TotalAmount)    FROM proj.TBL_SUPPLIER_INVOICE  WHERE IsActive=1 AND Status='Approved'),0)
          - ISNULL((SELECT SUM(AmountPaid) FROM proj.TBL_PAYMENT_VOUCHER   WHERE IsActive=1 AND Status='Approved'),0)             AS Payables;

    SELECT
        ISNULL(SUM(f.OrderValue),    0)                                        AS TotalOrderValue,
        ISNULL((SELECT SUM(ActualAmount) FROM proj.VW_JOB_COST_ACTUAL), 0)     AS TotalActualCost,
        ISNULL(SUM(f.TotalInvoicing), 0)                                       AS TotalInvoiced
    FROM proj.TBL_JOB_FINANCE f
    JOIN proj.TBL_JOB j ON j.JobId = f.JobId
    WHERE j.JobStatusId IN (1,2,3);
END
GO
