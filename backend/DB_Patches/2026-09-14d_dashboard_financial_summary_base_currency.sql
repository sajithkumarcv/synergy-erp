-- =====================================================================
-- 2026-09-14d  sp_GetDashboard's Financial Summary + Job Costing totals
-- mix currencies — found in the same sweep as 2026-09-14b/c, prompted by
-- the user asking whether the currency-mismatch issue was solved across
-- ALL modules. This is the highest-blast-radius one found: it feeds the
-- main Dashboard's "FINANCIAL SUMMARY" card (Customer Invoice, Supplier
-- Invoice, Receipts, Payments, Receivables, Payables) and the "Total
-- Order Value" / "Total Invoiced" tiles in "JOB COSTING SUMMARY" — every
-- user sees these on login, now carrying a base-currency label after
-- today's AED-hardcode fix, which made the wrong-currency values look
-- more authoritative, not less.
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- BUG: the Financial Summary block summed TBL_INVOICE.TotalAmount,
-- TBL_SUPPLIER_INVOICE.TotalAmount, TBL_RECEIPT_VOUCHER.AmountReceived
-- and TBL_PAYMENT_VOUCHER.AmountPaid with no ExchangeRate — all four
-- tables carry their own locked-in rate, unused here. The Job Costing
-- block separately summed TBL_JOB_FINANCE.OrderValue and .TotalInvoicing
-- the same way — that table also carries its own ExchangeRate.
-- VW_JOB_COST_ACTUAL (feeding TotalActualCost, the third Job Costing
-- tile) already converts correctly via fn_ToBase and is untouched.
--
-- No qualifying non-base-currency row exists in either block on dev
-- today (the one AED invoice is still Draft, excluded by the status
-- filter already), so this cannot be shown as a live before/after diff
-- on current data — same situation as 2026-09-14b's poValue fix.
--
-- FIX: every SUM in both blocks now goes through fn_ToBase(amount, rate).
-- Everything else in the proc (job/approval counts, PR/PO/stock tiles,
-- pending-approvals list) is unchanged.
--
-- Full-body CREATE OR ALTER of one procedure. No table changes.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetDashboard
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

    -- Base currency (fn_ToBase = amount * ExchangeRate) — was raw TotalAmount /
    -- AmountReceived / AmountPaid, which mixes currencies once any invoice,
    -- receipt or payment is in a non-base currency.
    SELECT
        ISNULL((SELECT SUM(proj.fn_ToBase(TotalAmount, ExchangeRate))    FROM proj.TBL_INVOICE           WHERE IsActive=1 AND Status IN ('Confirmed','Paid')),0) AS CustomerInvoices,
        ISNULL((SELECT SUM(proj.fn_ToBase(TotalAmount, ExchangeRate))    FROM proj.TBL_SUPPLIER_INVOICE  WHERE IsActive=1 AND Status='Approved'),0)             AS SupplierInvoices,
        ISNULL((SELECT SUM(proj.fn_ToBase(AmountReceived, ExchangeRate)) FROM proj.TBL_RECEIPT_VOUCHER   WHERE IsActive=1 AND Status='Approved'),0)             AS Receipts,
        ISNULL((SELECT SUM(proj.fn_ToBase(AmountPaid, ExchangeRate))     FROM proj.TBL_PAYMENT_VOUCHER   WHERE IsActive=1 AND Status='Approved'),0)             AS Payments,
        ISNULL((SELECT SUM(proj.fn_ToBase(TotalAmount, ExchangeRate))    FROM proj.TBL_INVOICE           WHERE IsActive=1 AND Status IN ('Confirmed','Paid')),0)
          - ISNULL((SELECT SUM(proj.fn_ToBase(AmountReceived, ExchangeRate)) FROM proj.TBL_RECEIPT_VOUCHER WHERE IsActive=1 AND Status='Approved'),0)           AS Receivables,
        ISNULL((SELECT SUM(proj.fn_ToBase(TotalAmount, ExchangeRate))    FROM proj.TBL_SUPPLIER_INVOICE  WHERE IsActive=1 AND Status='Approved'),0)
          - ISNULL((SELECT SUM(proj.fn_ToBase(AmountPaid, ExchangeRate)) FROM proj.TBL_PAYMENT_VOUCHER   WHERE IsActive=1 AND Status='Approved'),0)             AS Payables;

    -- TotalActualCost (VW_JOB_COST_ACTUAL) already converts via fn_ToBase — untouched.
    -- TotalOrderValue / TotalInvoiced now do too: TBL_JOB_FINANCE carries its own
    -- ExchangeRate, previously unused here.
    SELECT
        ISNULL(SUM(proj.fn_ToBase(f.OrderValue, f.ExchangeRate)),    0)               AS TotalOrderValue,
        ISNULL((SELECT SUM(ActualAmount) FROM proj.VW_JOB_COST_ACTUAL), 0)            AS TotalActualCost,
        ISNULL(SUM(proj.fn_ToBase(f.TotalInvoicing, f.ExchangeRate)), 0)              AS TotalInvoiced
    FROM proj.TBL_JOB_FINANCE f
    JOIN proj.TBL_JOB j ON j.JobId = f.JobId
    WHERE j.JobStatusId IN (1,2,3);
END
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item = 'sp_GetDashboard', Status = CASE
    WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetDashboard')) LIKE '%fn_ToBase(TotalAmount, ExchangeRate)%'
     AND OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetDashboard')) LIKE '%fn_ToBase(f.OrderValue, f.ExchangeRate)%'
    THEN 'OK' ELSE 'MISSING' END;
GO
