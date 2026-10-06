/* =====================================================================================================
   "PRs pending PO" screen (Procurement menu): purchase requests that still have lines waiting for a PO.

   1. PROJ.sp_GetPrPendingPo  - one row per PR line that still has quantity to order
        @Status   comma-separated PR statuses to include (default 'Approved,Partial'); PRs of Completed / Cancelled jobs are left out
        @JobId    optional; @Priority optional
      Returns the PR header fields, the approval date (from the approval transaction), days waiting,
      pending quantity/value and the last purchase price / supplier / date of the item.
   2. Menu row 1121 "PRs Pending PO" under PROCUREMENT (menu 10) + view rights for ADMIN, PROCUREMENT OFFICER,
      DEPARTMENT HEAD, Procurement Manager. Idempotent.
   ===================================================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_GetPrPendingPo
    @Status   NVARCHAR(200) = N'Approved,Partial',
    @JobId    NVARCHAR(50)  = NULL,
    @Priority NVARCHAR(20)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        pr.PrId, pr.PrNumber, pr.PrDate, pr.JobId, j.ProjectName AS JobName, pr.Priority,
        pr.Status AS PrStatus, pr.RequestedBy,
        ap.ApprovedDate,
        DATEDIFF(DAY, CAST(COALESCE(ap.ApprovedDate, pr.PrDate) AS DATE), CAST(GETDATE() AS DATE)) AS DaysWaiting,
        pl.PrLineId, pl.LineNum, pl.ItemId, pl.ItemCode, pl.ItemDesc, pl.UomName,
        pl.RequiredQty, pl.PoCreatedQty,
        ROUND(pl.RequiredQty - pl.PoCreatedQty, 4)                      AS PendingQty,
        pl.EstUnitPrice,
        ROUND((pl.RequiredQty - pl.PoCreatedQty) * ISNULL(pl.EstUnitPrice, 0), 2) AS PendingValue,
        pl.RequiredDate, pl.LineStatus,
        (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST_LINE x
          WHERE x.PrId = pr.PrId AND x.IsActive = 1 AND x.LineStatus NOT IN (N'Cancelled', N'Closed')) AS TotalLines,
        lp.LastPrice, lp.LastPriceCurrency, lp.LastSupplier, lp.LastPoDate
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE pl
    JOIN PROJ.TBL_PURCHASE_REQUEST      pr ON pr.PrId = pl.PrId AND pr.IsActive = 1
    LEFT JOIN PROJ.TBL_JOB              j  ON j.JobId = pr.JobId
    OUTER APPLY (
        SELECT TOP 1 t.CompletedDate AS ApprovedDate
        FROM PROJ.TBL_APPROVAL_TRANSACTION t
        JOIN PROJ.TBL_APPROVAL_MODULE m ON m.ModuleId = t.ModuleId AND m.ModuleCode = N'PR'
        WHERE t.DocumentId = pr.PrId AND t.FinalAction = N'Approved'
        ORDER BY t.TransactionId DESC
    ) ap
    OUTER APPLY (
        SELECT TOP 1 pol.UnitPrice AS LastPrice, cur.ShortName AS LastPriceCurrency,
                     COALESCE(s.SupplierName, po.VendorName) AS LastSupplier, po.PoDate AS LastPoDate
        FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
        JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId AND po.IsActive = 1 AND po.Status NOT IN (N'Draft', N'Cancelled')
        LEFT JOIN PROJ.TBL_CURRENCY cur ON cur.CurrencyId = po.CurrencyId
        LEFT JOIN PROJ.TBL_SUPPLIER s   ON s.SupplierId = po.SupplierId
        WHERE pol.IsActive = 1 AND pol.ItemId = pl.ItemId AND pol.UnitPrice > 0
        ORDER BY po.PoDate DESC, po.PoId DESC
    ) lp
    WHERE pl.IsActive = 1
      AND pl.LineStatus NOT IN (N'Cancelled', N'Closed')
      AND pl.RequiredQty > pl.PoCreatedQty
      AND (j.JobStatusId IS NULL OR j.JobStatusId NOT IN (4, 5))   -- not Completed / Cancelled jobs
      AND pr.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(ISNULL(NULLIF(@Status, N''), N'Approved,Partial'), N','))
      AND (@JobId    IS NULL OR pr.JobId    = @JobId)
      AND (@Priority IS NULL OR pr.Priority = @Priority)
    ORDER BY DaysWaiting DESC, pr.PrNumber, pl.LineNum;
END
GO

-- ── Menu ───────────────────────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 10)
    THROW 50000, 'Parent menu 10 (PROCUREMENT) not found. Aborting.', 1;
GO
IF EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1121 AND MenuUrl <> '/pr-pending-po')
    THROW 50000, 'MenuId 1121 already exists with a DIFFERENT MenuUrl. Choose another MenuId. Aborting.', 1;
GO
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1121)
BEGIN
    SET IDENTITY_INSERT PROJ.TBL_MENU ON;
    INSERT INTO PROJ.TBL_MENU (MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (1121, 10, 'PRs Pending PO', '/pr-pending-po', 'clock', 3, 1);
    SET IDENTITY_INSERT PROJ.TBL_MENU OFF;
END
GO
INSERT INTO PROJ.TBL_ROLE_MENU (RoleId, MenuId, CanView)
SELECT r.RoleId, 1121, 1
FROM (VALUES (1), (4), (1010), (1011)) AS r(RoleId)
WHERE EXISTS (SELECT 1 FROM PROJ.TBL_ROLES ro WHERE ro.RoleId = r.RoleId)
  AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLE_MENU rm WHERE rm.RoleId = r.RoleId AND rm.MenuId = 1121);
GO
SELECT MenuId, ParentMenuId, MenuName, MenuUrl, MenuOrder FROM PROJ.TBL_MENU WHERE MenuId = 1121;
SELECT RoleId, MenuId, CanView FROM PROJ.TBL_ROLE_MENU WHERE MenuId = 1121;
GO
