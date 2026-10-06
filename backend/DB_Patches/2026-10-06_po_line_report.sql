/* =====================================================================================================
   PO report - item-line wise (one row per purchase order line).
   1. PROJ.sp_ReportPoLines - same filters as the PO grid (sp_SearchPOs: search, status, supplier, job, job type, budget category,
      priority, created by, dates - dates are on the PO created date, as in the grid); search also matches item code / description. Amounts are shown in the PO currency and in
      base currency (x PO ExchangeRate). Tax is the line TaxPct.
   2. Menu row 1122 "PO Report - Item Lines" under Reports > Procurement (next to Purchase Orders) + view rights copied from the existing PO report menu.
   Idempotent.
   ===================================================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_ReportPoLines
    @SearchText        NVARCHAR(100) = NULL,   -- PO no, vendor ref, job, supplier, item code / description
    @Status            NVARCHAR(200) = NULL,   -- comma-separated; PendingApproval / PendingLn work like the PO grid
    @SupplierId        INT           = NULL,
    @JobId             NVARCHAR(50)  = NULL,
    @JobTypeIds        NVARCHAR(500) = NULL,
    @ExpenseCategoryId INT           = NULL,
    @Priority          NVARCHAR(20)  = NULL,
    @CreatedBy         NVARCHAR(100) = NULL,
    @DateFrom          DATE          = NULL,
    @DateTo            DATE          = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        po.PoId, po.PoNumber, CONVERT(DATE, po.PoDate) AS PoDate, po.Status AS PoStatus, po.Priority,
        po.SupplierId, COALESCE(s.SupplierName, po.VendorName) AS VendorName, po.VendorRef,
        po.JobId, j.ProjectName AS JobTitle,
        ec.CategoryCode AS ExpenseCategoryCode, ec.CategoryName AS ExpenseCategoryName,
        cur.ShortName AS CurrencyShort, ISNULL(po.ExchangeRate, 1) AS ExchangeRate,
        CONVERT(DATE, po.DeliveryDate) AS DeliveryDate, po.CreatedBy,
        pl.PoLineId, pl.LineNum, pl.ItemId, pl.ItemCode, pl.ItemDesc, pl.UomName,
        pl.OrderedQty, ISNULL(pl.ReceivedQty, 0) AS ReceivedQty,
        pl.OrderedQty - ISNULL(pl.ReceivedQty, 0) AS BalanceQty,
        pl.UnitPrice, ISNULL(pl.TaxPct, 0) AS TaxPct, pl.LineStatus,
        ROUND(pl.OrderedQty * pl.UnitPrice, 2)                                    AS LineAmount,
        ROUND(pl.OrderedQty * pl.UnitPrice * (1 + ISNULL(pl.TaxPct, 0) / 100.0), 2) AS LineAmountWithTax,
        ROUND(pl.OrderedQty * pl.UnitPrice * ISNULL(po.ExchangeRate, 1), 2)       AS LineAmountBase,
        ROUND(ISNULL(pl.ReceivedQty, 0) * pl.UnitPrice * ISNULL(po.ExchangeRate, 1), 2) AS ReceivedAmountBase,
        pr.PrNumber, pl.Remarks
    FROM PROJ.TBL_PURCHASE_ORDER_LINE pl
    JOIN PROJ.TBL_PURCHASE_ORDER po   ON po.PoId = pl.PoId AND po.IsActive = 1
    LEFT JOIN PROJ.TBL_CURRENCY cur   ON cur.CurrencyId = po.CurrencyId
    LEFT JOIN PROJ.TBL_JOB j          ON j.JobId = po.JobId
    LEFT JOIN PROJ.TBL_SUPPLIER s     ON s.SupplierId = po.SupplierId
    LEFT JOIN PROJ.TBL_JOB_EXPENSE_CATEGORY ec ON ec.ExpenseCategoryId = po.ExpenseCategoryId
    LEFT JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pl.PrLineId
    LEFT JOIN PROJ.TBL_PURCHASE_REQUEST pr       ON pr.PrId = prl.PrId
    WHERE pl.IsActive = 1
      AND (@SearchText IS NULL OR po.PoNumber    LIKE N'%'+@SearchText+N'%'
                               OR po.VendorRef   LIKE N'%'+@SearchText+N'%'
                               OR po.JobId       LIKE N'%'+@SearchText+N'%'
                               OR s.SupplierName LIKE N'%'+@SearchText+N'%'
                               OR s.SupplierCode LIKE N'%'+@SearchText+N'%'
                               OR pl.ItemCode    LIKE N'%'+@SearchText+N'%'
                               OR pl.ItemDesc    LIKE N'%'+@SearchText+N'%')
      AND (@Status     IS NULL OR po.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Status, ','))
           OR (po.Status LIKE 'Pending%' AND EXISTS (SELECT 1 FROM proj.fn_PendingApprovalLevel('PO', po.PoId) lv WHERE EXISTS (SELECT 1 FROM STRING_SPLIT(@Status, ',') sv WHERE LTRIM(RTRIM(sv.value)) IN (N'PendingApproval', N'PendingL' + CAST(lv.LevelNo AS NVARCHAR(3)))))))
      AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
      AND (@JobId      IS NULL OR po.JobId      = @JobId)
      AND (@JobTypeIds IS NULL OR @JobTypeIds = '' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, ',')))
      AND (@ExpenseCategoryId IS NULL OR po.ExpenseCategoryId = @ExpenseCategoryId)
      AND (@Priority   IS NULL OR po.Priority   = @Priority)
      AND (@CreatedBy  IS NULL OR po.CreatedBy LIKE N'%'+@CreatedBy+N'%')
      AND (@DateFrom   IS NULL OR CAST(po.CreatedDate AS DATE) >= @DateFrom)
      AND (@DateTo     IS NULL OR CAST(po.CreatedDate AS DATE) <= @DateTo)
    ORDER BY po.PoDate DESC, po.PoNumber, pl.LineNum;
END
GO

-- ── Menu ───────────────────────────────────────────────────────────────────────────────────────────
DECLARE @ParentId INT, @PoRptMenu INT;
SELECT TOP 1 @PoRptMenu = MenuId, @ParentId = ParentMenuId FROM PROJ.TBL_MENU WHERE MenuUrl = '/reports/po' AND IsActive = 1;
IF @PoRptMenu IS NULL THROW 50000, 'Existing PO report menu (/reports/po) not found. Aborting.', 1;
IF EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1122 AND MenuUrl <> '/reports/po-lines')
    THROW 50000, 'MenuId 1122 already exists with a DIFFERENT MenuUrl. Choose another MenuId. Aborting.', 1;
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1122)
BEGIN
    SET IDENTITY_INSERT PROJ.TBL_MENU ON;
    INSERT INTO PROJ.TBL_MENU (MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    SELECT 1122, @ParentId, 'PO Report - Item Lines', '/reports/po-lines', MenuIcon, MenuOrder, 1
    FROM PROJ.TBL_MENU WHERE MenuId = @PoRptMenu;
    SET IDENTITY_INSERT PROJ.TBL_MENU OFF;
END
INSERT INTO PROJ.TBL_ROLE_MENU (RoleId, MenuId, CanView)
SELECT rm.RoleId, 1122, rm.CanView
FROM PROJ.TBL_ROLE_MENU rm
WHERE rm.MenuId = @PoRptMenu
  AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLE_MENU x WHERE x.RoleId = rm.RoleId AND x.MenuId = 1122);
GO
SELECT MenuId, ParentMenuId, MenuName, MenuUrl, MenuOrder FROM PROJ.TBL_MENU WHERE MenuId IN (1122) OR MenuUrl = '/reports/po';
SELECT RoleId, MenuId, CanView FROM PROJ.TBL_ROLE_MENU WHERE MenuId = 1122;
GO
