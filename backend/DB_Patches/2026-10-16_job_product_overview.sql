/* =====================================================================================================
   "Job - Product Overview" report (Reports > Inventory, next to Item Ledger): pick a job and a product and see, side by side,
   the purchase orders for that product on that job (ordered / received) and the issue notes (issue qty / issued qty).

   1. PROJ.sp_GetJobProductList @JobId
        Products that appear on the job: PO lines (PO not Draft/Cancelled/Rejected) and issue note lines (not Cancelled).
        Returns ItemId, ItemCode, ItemName, PoQty (ordered), IssuedQty (confirmed issues) for the dropdown.
   2. PROJ.sp_GetJobProductOverview @JobId, @ItemId  - TWO result sets
        (1) PO lines: PoId, PoNumber, PoDate, DeliveryDate, SupplierName, PoStatus, LineNum, OrderedQty, ReceivedQty, OpenQty,
            UomName, UnitPrice, LineStatus
        (2) Issue lines: IssueId, IssueNo, IssueDate, Status, IssuedTo, CostingType, LineNum, IssueQty (what the note says),
            IssuedQty (only Confirmed notes have actually moved stock), UomName, UnitCost
   3. Menu row 1125 under Reports > Inventory (parent 77), view rights copied from the Item Ledger menu (71). Idempotent.
   Both procedures are read-only. Revert: DROP PROCEDURE both, delete menu 1125 and its PROJ.TBL_ROLE_MENU rows.
   ===================================================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_GetJobProductList
    @JobId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH po AS (
        SELECT pol.ItemId, SUM(pol.OrderedQty) AS PoQty
        FROM PROJ.TBL_PURCHASE_ORDER po
        JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1 AND pol.LineStatus <> N'Cancelled'
        WHERE po.JobId = @JobId AND po.IsActive = 1 AND po.Status NOT IN (N'Draft', N'Cancelled', N'Rejected')
        GROUP BY pol.ItemId
    ),
    iss AS (
        SELECT sl.ItemId,
               SUM(CASE WHEN si.Status = N'Confirmed' THEN sl.Qty ELSE 0 END) AS IssuedQty
        FROM PROJ.TBL_STOCK_ISSUE si
        JOIN PROJ.TBL_STOCK_ISSUE_LINE sl ON sl.IssueId = si.IssueId AND sl.IsActive = 1
        WHERE si.JobId = @JobId AND si.IsActive = 1 AND si.Status <> N'Cancelled'
        GROUP BY sl.ItemId
    ),
    items AS (
        SELECT ItemId FROM po
        UNION
        SELECT ItemId FROM iss
    )
    SELECT i.ItemId, i.ItemCode, i.ItemName,
           ISNULL(po.PoQty, 0)     AS PoQty,
           ISNULL(iss.IssuedQty, 0) AS IssuedQty
    FROM items x
    JOIN PROJ.TBL_ITEM i ON i.ItemId = x.ItemId
    LEFT JOIN po  ON po.ItemId  = x.ItemId
    LEFT JOIN iss ON iss.ItemId = x.ItemId
    ORDER BY i.ItemCode;
END
GO

CREATE OR ALTER PROCEDURE PROJ.sp_GetJobProductOverview
    @JobId  NVARCHAR(50),
    @ItemId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- (1) purchase orders for this product on this job
    SELECT po.PoId, po.PoNumber, po.PoDate, po.DeliveryDate,
           COALESCE(s.SupplierName, po.VendorName) AS SupplierName,
           po.Status AS PoStatus,
           pol.LineNum, pol.OrderedQty, pol.ReceivedQty,
           ROUND(pol.OrderedQty - pol.ReceivedQty, 4) AS OpenQty,
           pol.UomName, pol.UnitPrice, pol.LineStatus
    FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
    JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId AND po.IsActive = 1
    LEFT JOIN PROJ.TBL_SUPPLIER  s  ON s.SupplierId = po.SupplierId
    WHERE pol.IsActive = 1 AND pol.LineStatus <> N'Cancelled'
      AND pol.ItemId = @ItemId AND po.JobId = @JobId
      AND po.Status NOT IN (N'Draft', N'Cancelled', N'Rejected')
    ORDER BY po.PoDate DESC, po.PoId DESC, pol.LineNum;

    -- (2) issue notes for this product on this job
    SELECT si.IssueId, si.IssueNo, si.IssueDate, si.Status, si.IssuedTo, si.CostingType,
           sl.LineNum,
           sl.Qty AS IssueQty,
           CASE WHEN si.Status = N'Confirmed' THEN sl.Qty ELSE 0 END AS IssuedQty,
           u.UomName, sl.UnitCost
    FROM PROJ.TBL_STOCK_ISSUE_LINE sl
    JOIN PROJ.TBL_STOCK_ISSUE si ON si.IssueId = sl.IssueId AND si.IsActive = 1
    LEFT JOIN PROJ.TBL_ITEM      it ON it.ItemId = sl.ItemId
    LEFT JOIN PROJ.TBL_ITEM_UOM  u  ON u.UomId   = it.BaseUomId
    WHERE sl.IsActive = 1 AND sl.ItemId = @ItemId AND si.JobId = @JobId AND si.Status <> N'Cancelled'
    ORDER BY si.IssueDate DESC, si.IssueNo DESC, sl.LineNum;
END
GO

-- -- Menu -------------------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 77)
    THROW 50000, 'Parent menu 77 (Reports > Inventory) not found. Aborting.', 1;
GO
IF EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1125 AND MenuUrl <> '/reports/job-product-overview')
    THROW 50000, 'MenuId 1125 already exists with a DIFFERENT MenuUrl. Choose another MenuId. Aborting.', 1;
GO
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1125)
BEGIN
    SET IDENTITY_INSERT PROJ.TBL_MENU ON;
    INSERT INTO PROJ.TBL_MENU (MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (1125, 77, 'Job - Product Overview', '/reports/job-product-overview', NULL, 5, 1);
    SET IDENTITY_INSERT PROJ.TBL_MENU OFF;
END
GO
INSERT INTO PROJ.TBL_ROLE_MENU (RoleId, MenuId, CanView)
SELECT rm.RoleId, 1125, rm.CanView
FROM PROJ.TBL_ROLE_MENU rm
WHERE rm.MenuId = 71
  AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLE_MENU x WHERE x.RoleId = rm.RoleId AND x.MenuId = 1125);
GO
SELECT MenuId, ParentMenuId, MenuName, MenuUrl, MenuOrder FROM PROJ.TBL_MENU WHERE MenuId = 1125;
SELECT RoleId, MenuId, CanView FROM PROJ.TBL_ROLE_MENU WHERE MenuId = 1125 ORDER BY RoleId;
GO
