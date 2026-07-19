-- ══════════════════════════════════════════════════════════════════
-- sp_GetJobReportDocs
-- Returns two result sets used by the Job Report print modal:
--   RS1  Linked Purchase Orders       (proj.TBL_PURCHASE_ORDER)
--   RS2  Customer Invoices on the job (proj.TBL_INVOICE)
-- ══════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE proj.sp_GetJobReportDocs
    @JobId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- ── RS1: Purchase Orders ──────────────────────────────────────
    SELECT
        po.PoId,
        po.PoNumber,
        CONVERT(DATE, po.PoDate)  AS PoDate,
        po.Status,
        COALESCE(s.SupplierName, po.VendorName, '—') AS SupplierName,
        po.TotalAmount,
        c.ShortName AS CurrencyShort
    FROM       proj.TBL_PURCHASE_ORDER po
    LEFT JOIN  proj.TBL_SUPPLIER       s  ON s.SupplierId = po.SupplierId
    LEFT JOIN  proj.TBL_CURRENCY       c  ON c.CurrencyId = po.CurrencyId
    WHERE po.JobId    = @JobId
      AND po.IsActive = 1
    ORDER BY po.PoDate DESC;

    -- ── RS2: Customer Invoices ────────────────────────────────────
    SELECT
        inv.InvoiceId,
        inv.InvoiceNo,
        CONVERT(DATE, inv.InvoiceDate) AS InvoiceDate,
        inv.Status,
        inv.TotalAmount,
        c.ShortName AS CurrencyShort
    FROM  proj.TBL_INVOICE inv
    LEFT JOIN proj.TBL_CURRENCY c ON c.CurrencyId = inv.CurrencyId
    WHERE inv.JobId    = @JobId
      AND inv.IsActive = 1
    ORDER BY inv.InvoiceDate DESC;
END;
GO
