-- 2026-10-16: Backlog report, "PO -> GRN" tab - show only POs that can really be waiting for goods
--
-- Apply to: SYNERP
--
-- sp_BacklogPoToGrn only skipped Cancelled and Received POs, so Draft, Pending Approval, Rejected and Closed POs were all
-- listed as "pending GRN" (the screenshot was full of Draft POs), it did not check PoIsActive, and "Pending Value" added up
-- raw amounts in each PO's own currency (178 million of mixed currencies). Now:
--   * PO is active and its status is Approved / Sent / Partial / Hold (same as the POs Pending GRN page)
--   * the line is not Cancelled / Closed and still has quantity to receive
--   * new columns: ExchangeRate, PendingValueBase (pending value x the PO's exchange rate), DaysOverdue (expected date passed)
--   * existing columns are unchanged (PendingValue stays in the PO's own currency)
-- Read-only. Restore script: D:\Projects\_synergy_backups\_REVERT_2026-10-16_backlog_po_to_grn.sql   Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_BacklogPoToGrn
    @JobId      NVARCHAR(50) = NULL,
    @SupplierId INT          = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);

    SELECT
        po.PoId,
        po.PoNumber,
        po.PoDate,
        po.SupplierId,
        s.SupplierName,
        po.JobId,
        j.ProjectName,
        po.Status          AS PoStatus,
        po.Priority,
        po.DeliveryDate,
        cur.ShortName      AS CurrencyShort,
        ISNULL(po.ExchangeRate, 1)                                        AS ExchangeRate,
        pol.PoLineId,
        pol.LineNum,
        pol.ItemCode,
        pol.ItemDesc,
        pol.UomName,
        pol.OrderedQty,
        pol.ReceivedQty,
        ROUND(pol.OrderedQty - pol.ReceivedQty, 4)                        AS PendingQty,
        pol.UnitPrice,
        ROUND((pol.OrderedQty - pol.ReceivedQty) * pol.UnitPrice, 2)      AS PendingValue,
        ROUND((pol.OrderedQty - pol.ReceivedQty) * pol.UnitPrice * ISNULL(po.ExchangeRate, 1), 2) AS PendingValueBase,
        CASE WHEN po.DeliveryDate IS NOT NULL AND CAST(po.DeliveryDate AS DATE) < @Today
             THEN DATEDIFF(DAY, CAST(po.DeliveryDate AS DATE), @Today) ELSE 0 END AS DaysOverdue
    FROM  proj.TBL_PURCHASE_ORDER_LINE pol
    JOIN  proj.TBL_PURCHASE_ORDER       po  ON po.PoId        = pol.PoId AND po.IsActive = 1
    LEFT JOIN proj.TBL_SUPPLIER         s   ON s.SupplierId   = po.SupplierId
    LEFT JOIN proj.TBL_CURRENCY         cur ON cur.CurrencyId = po.CurrencyId
    LEFT JOIN proj.TBL_JOB              j   ON j.JobId         = po.JobId
    WHERE pol.IsActive = 1
      AND po.Status IN (N'Approved', N'Sent', N'Partial', N'Hold')
      AND ISNULL(pol.LineStatus, N'') NOT IN (N'Cancelled', N'Closed')
      AND (pol.OrderedQty - pol.ReceivedQty) > 0.0001
      AND (@JobId      IS NULL OR po.JobId      = @JobId)
      AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
    ORDER BY DaysOverdue DESC, po.PoDate, po.PoNumber, pol.LineNum;
END
GO
