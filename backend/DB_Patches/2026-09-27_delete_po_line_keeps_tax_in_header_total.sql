-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27  Deleting a PO line must not strip the tax out of the header total.
--
-- sp_SetPOLine recomputes the header as:
--     Subtotal - (Subtotal * header Discount%) + line tax + header TaxAmount
-- sp_DeletePOLine recomputed it as just:
--     SUM(OrderedQty * UnitPrice)
-- so deleting a line dropped the line tax, the header discount AND the manually entered
-- header TaxAmount, leaving TBL_PURCHASE_ORDER.TotalAmount as the bare pre-tax subtotal.
-- It stayed wrong until someone saved another line on that PO (which re-runs the correct
-- recompute). Line deletion is Draft-only, which is why only a few POs are affected.
--
-- Job Overview / budget were never affected - they read the lines, not the header. What was
-- understated is the PO list, the PO report and the printed PO, i.e. what is owed to the
-- supplier.
--
-- Part 1 fixes the procedure (anchor-checked, all-or-nothing, idempotent).
-- Part 2 corrects the POs whose header is still wrong - plain UPDATE, only rows that do not
-- match their own lines, so it is safe to run twice and a no-op once they are right.
-- On the India data as of 2026-09-26 that is 3 POs: PO-26-0342, PO-26-0171, PO-26-0337.
-- ─────────────────────────────────────────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- ── Part 1: the procedure ────────────────────────────────────────────────────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(400), @rep NVARCHAR(1200);
    DECLARE @n INT, @p INT, @r INT, @plen INT, @pos INT;

    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_DeletePOLine'));
    IF @def IS NULL THROW 50020, 'sp_DeletePOLine not found.', 1;

    SET @old = N'SET TotalAmount = (SELECT ISNULL(SUM(OrderedQty*UnitPrice),0) FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId=@PoId)';
    SET @rep = N'SET TotalAmount = (SELECT ISNULL(t.Sub,0) - ISNULL(t.Sub,0) * ISNULL(h.Discount,0) / 100.0'
             + N' + ISNULL(t.Tax,0) + ISNULL(h.TaxAmount,0)'
             + N' FROM PROJ.TBL_PURCHASE_ORDER h'
             + N' OUTER APPLY (SELECT SUM(pol.OrderedQty * pol.UnitPrice) AS Sub,'
             + N' SUM(pol.OrderedQty * pol.UnitPrice * ISNULL(pol.TaxPct,0) / 100.0) AS Tax'
             + N' FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = @PoId AND pol.IsActive = 1) t'
             + N' WHERE h.PoId = @PoId)';

    IF CHARINDEX(N'OUTER APPLY (SELECT SUM(pol.OrderedQty * pol.UnitPrice) AS Sub', @def) > 0
        PRINT 'sp_DeletePOLine : already patched, left alone.';
    ELSE
    BEGIN
        SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
        IF @n <> 1 THROW 50021, 'sp_DeletePOLine: expected exactly 1 anchor. Nothing changed.', 1;

        SET @new  = REPLACE(@def, @old, @rep);
        SET @p    = CHARINDEX(N'PROCEDURE', @new);
        SET @plen = @p - 1;
        SET @r    = CHARINDEX(N'ETAERC', REVERSE(LEFT(@new, @plen)));
        IF @r = 0 THROW 50022, 'sp_DeletePOLine: could not find the CREATE keyword. Nothing changed.', 1;
        SET @pos  = @plen - @r - 4;
        SET @new  = STUFF(@new, @pos, 6, N'ALTER ');
        EXEC sp_executesql @new;
        PRINT 'sp_DeletePOLine : patched.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── Part 2: correct the headers left wrong by the old behaviour ──────────────
-- What it will change (run this first to see it):
SELECT po.PoId, po.PoNumber, po.Status, po.JobId,
       CONVERT(DECIMAL(18,2), po.TotalAmount) AS header_now,
       CONVERT(DECIMAL(18,2), ISNULL(t.Sub,0) - ISNULL(t.Sub,0) * ISNULL(po.Discount,0) / 100.0
                              + ISNULL(t.Tax,0) + ISNULL(po.TaxAmount,0)) AS header_should_be
FROM PROJ.TBL_PURCHASE_ORDER po
OUTER APPLY (SELECT SUM(pol.OrderedQty * pol.UnitPrice) AS Sub,
                    SUM(pol.OrderedQty * pol.UnitPrice * ISNULL(pol.TaxPct,0) / 100.0) AS Tax
             FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = po.PoId AND pol.IsActive = 1) t
WHERE po.IsActive = 1
  AND ABS(po.TotalAmount - (ISNULL(t.Sub,0) - ISNULL(t.Sub,0) * ISNULL(po.Discount,0) / 100.0
                            + ISNULL(t.Tax,0) + ISNULL(po.TaxAmount,0))) >= 0.05;
GO

UPDATE po
SET    po.TotalAmount = ISNULL(t.Sub,0) - ISNULL(t.Sub,0) * ISNULL(po.Discount,0) / 100.0
                        + ISNULL(t.Tax,0) + ISNULL(po.TaxAmount,0)
FROM   PROJ.TBL_PURCHASE_ORDER po
OUTER APPLY (SELECT SUM(pol.OrderedQty * pol.UnitPrice) AS Sub,
                    SUM(pol.OrderedQty * pol.UnitPrice * ISNULL(pol.TaxPct,0) / 100.0) AS Tax
             FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = po.PoId AND pol.IsActive = 1) t
WHERE  po.IsActive = 1
  AND  ABS(po.TotalAmount - (ISNULL(t.Sub,0) - ISNULL(t.Sub,0) * ISNULL(po.Discount,0) / 100.0
                             + ISNULL(t.Tax,0) + ISNULL(po.TaxAmount,0))) >= 0.05;
GO

-- ── verification: both must come back clean ──────────────────────────────────
SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_DeletePOLine')) LIKE '%ISNULL(pol.TaxPct,0)%'
            THEN 'OK - sp_DeletePOLine keeps tax, discount and header TaxAmount'
            ELSE 'NOT PATCHED' END AS proc_result;

SELECT COUNT(*) AS headers_still_wrong
FROM PROJ.TBL_PURCHASE_ORDER po
OUTER APPLY (SELECT SUM(pol.OrderedQty * pol.UnitPrice) AS Sub,
                    SUM(pol.OrderedQty * pol.UnitPrice * ISNULL(pol.TaxPct,0) / 100.0) AS Tax
             FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = po.PoId AND pol.IsActive = 1) t
WHERE po.IsActive = 1
  AND ABS(po.TotalAmount - (ISNULL(t.Sub,0) - ISNULL(t.Sub,0) * ISNULL(po.Discount,0) / 100.0
                            + ISNULL(t.Tax,0) + ISNULL(po.TaxAmount,0))) >= 0.05;
GO
