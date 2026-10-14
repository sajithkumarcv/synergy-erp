/* =====================================================================================================
   "POs pending GRN" screen (Procurement menu): purchase orders that still have lines waiting to be received.
   Same idea as the "PRs pending PO" worklist (2026-10-06_pr_pending_po_screen.sql), one step later in the chain.

   1. PROJ.sp_GetPoPendingGrn - one row per PO line that still has quantity to receive
        @Status     comma-separated PO statuses to include (default 'Approved,Sent,Partial'); POs of Completed / Cancelled jobs are left out
        @SupplierId optional; @JobId optional
      Returns the PO header fields, approval date (from the approval transaction), expected delivery date, days overdue,
      open quantity/value (document currency and base currency) and the date of the last GRN on the line.
      Read-only. Revert: DROP PROCEDURE PROJ.sp_GetPoPendingGrn and delete menu 1124.
   2. Menu row 1124 "POs Pending GRN" under PROCUREMENT (menu 10) + view rights for ADMIN, PROCUREMENT OFFICER,
      DEPARTMENT HEAD, Procurement Manager and Store. Idempotent.
   ===================================================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_GetPoPendingGrn
    @Status     NVARCHAR(200) = N'Approved,Sent,Partial',
    @SupplierId INT           = NULL,
    @JobId      NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);

    SELECT
        po.PoId, po.PoNumber, po.PoDate, po.DeliveryDate,
        po.SupplierId, COALESCE(s.SupplierName, po.VendorName) AS SupplierName,
        po.JobId, j.ProjectName AS JobName,
        po.Status AS PoStatus,
        cur.ShortName AS CurrencyShort, ISNULL(po.ExchangeRate, 1) AS ExchangeRate,
        ap.ApprovedDate,
        DATEDIFF(DAY, CAST(COALESCE(ap.ApprovedDate, po.PoDate) AS DATE), @Today) AS DaysSinceApproval,
        CASE WHEN po.DeliveryDate IS NOT NULL AND CAST(po.DeliveryDate AS DATE) < @Today
             THEN DATEDIFF(DAY, CAST(po.DeliveryDate AS DATE), @Today) ELSE 0 END AS DaysOverdue,
        pol.PoLineId, pol.LineNum, pol.ItemId, pol.ItemCode, pol.ItemDesc, pol.UomName,
        pol.OrderedQty, pol.ReceivedQty,
        ROUND(pol.OrderedQty - pol.ReceivedQty, 4)                                         AS OpenQty,
        pol.UnitPrice,
        ROUND((pol.OrderedQty - pol.ReceivedQty) * pol.UnitPrice, 2)                       AS OpenValue,
        ROUND((pol.OrderedQty - pol.ReceivedQty) * pol.UnitPrice * ISNULL(po.ExchangeRate, 1), 2) AS OpenValueBase,
        pol.LineStatus,
        (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER_LINE x
          WHERE x.PoId = po.PoId AND x.IsActive = 1 AND x.LineStatus NOT IN (N'Cancelled', N'Closed')) AS TotalLines,
        rc.LastGrnDate
    FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
    JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId AND po.IsActive = 1
    LEFT JOIN PROJ.TBL_JOB       j   ON j.JobId = po.JobId
    LEFT JOIN PROJ.TBL_SUPPLIER  s   ON s.SupplierId = po.SupplierId
    LEFT JOIN PROJ.TBL_CURRENCY  cur ON cur.CurrencyId = po.CurrencyId
    OUTER APPLY (
        SELECT TOP 1 t.CompletedDate AS ApprovedDate
        FROM PROJ.TBL_APPROVAL_TRANSACTION t
        JOIN PROJ.TBL_APPROVAL_MODULE m ON m.ModuleId = t.ModuleId AND m.ModuleCode = N'PO'
        WHERE t.DocumentId = po.PoId AND t.FinalAction = N'Approved'
        ORDER BY t.TransactionId DESC
    ) ap
    OUTER APPLY (
        SELECT MAX(g.GrnDate) AS LastGrnDate
        FROM PROJ.TBL_GRN_DETAIL gd
        JOIN PROJ.TBL_GRN_HEADER g ON g.GrnId = gd.GrnId AND g.IsActive = 1 AND g.Status NOT IN (N'Cancelled')
        WHERE gd.PoLineId = pol.PoLineId AND gd.IsActive = 1
    ) rc
    WHERE pol.IsActive = 1
      AND pol.LineStatus NOT IN (N'Cancelled', N'Closed')
      AND (pol.OrderedQty - pol.ReceivedQty) > 0.0001
      AND (j.JobStatusId IS NULL OR j.JobStatusId NOT IN (4, 5))   -- not Completed / Cancelled jobs
      AND po.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(ISNULL(NULLIF(@Status, N''), N'Approved,Sent,Partial'), N','))
      AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
      AND (@JobId      IS NULL OR po.JobId      = @JobId)
    ORDER BY DaysOverdue DESC, po.DeliveryDate, po.PoNumber, pol.LineNum;
END
GO

-- -- Menu -------------------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 10)
    THROW 50000, 'Parent menu 10 (PROCUREMENT) not found. Aborting.', 1;
GO
IF EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1124 AND MenuUrl <> '/po-pending-grn')
    THROW 50000, 'MenuId 1124 already exists with a DIFFERENT MenuUrl. Choose another MenuId. Aborting.', 1;
GO
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1124)
BEGIN
    SET IDENTITY_INSERT PROJ.TBL_MENU ON;
    INSERT INTO PROJ.TBL_MENU (MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (1124, 10, 'POs Pending GRN', '/po-pending-grn', 'clock', 4, 1);
    SET IDENTITY_INSERT PROJ.TBL_MENU OFF;
END
GO
INSERT INTO PROJ.TBL_ROLE_MENU (RoleId, MenuId, CanView)
SELECT r.RoleId, 1124, 1
FROM (VALUES (1), (4), (1010), (1011), (1012)) AS r(RoleId)
WHERE EXISTS (SELECT 1 FROM PROJ.TBL_ROLES ro WHERE ro.RoleId = r.RoleId)
  AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLE_MENU rm WHERE rm.RoleId = r.RoleId AND rm.MenuId = 1124);
GO
SELECT MenuId, ParentMenuId, MenuName, MenuUrl, MenuOrder FROM PROJ.TBL_MENU WHERE MenuId = 1124;
SELECT RoleId, MenuId, CanView FROM PROJ.TBL_ROLE_MENU WHERE MenuId = 1124;
GO
