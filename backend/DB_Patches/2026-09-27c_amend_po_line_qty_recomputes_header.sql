-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27c  sp_AmendPOLineQty must recompute the PO header total.
--
-- Reducing a quantity on an Approved or Partial PO updated the PO line, the linked GRN
-- detail, the PR line and the BOM - but never TBL_PURCHASE_ORDER.TotalAmount, so the header
-- stayed at the old, higher figure. Last of the PO write paths still missing the recompute:
--     sp_SetPOLine      add / edit a line, qty, price, GST %      - correct
--     sp_SetPO          header save: Discount %, GST amount       - correct (added 2026-08-23)
--     sp_AmendPOLine    amend qty + price                          - correct
--     sp_DeletePOLine   delete a line                              - fixed 2026-09-27
--     sp_RevisePO       status only, touches no amounts            - n/a
--     sp_AmendPOLineQty amend qty only                             - THIS PATCH
--
-- Uses the identical formula to the other four:
--     subtotal - subtotal * header Discount% + line tax + header TaxAmount
-- Header TaxAmount is read, never written - the user types it on the PO Overview tab.
--
-- No data fix is needed: one amendment has ever been run and 0 PO headers currently disagree
-- with their lines, so this is a forward-looking fix only.
--
-- Anchor-checked against the live definition, all-or-nothing, idempotent.
-- QUOTED_IDENTIFIER is set ON explicitly - sqlcmd runs with it OFF and a procedure keeps
-- whatever it was created under.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(200), @rep NVARCHAR(2000);
    DECLARE @n INT, @pos INT, @scan INT;

    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_AmendPOLineQty'));
    IF @def IS NULL THROW 50060, 'sp_AmendPOLineQty not found.', 1;

    IF CHARINDEX(N'@AqPoId', @def) > 0
    BEGIN
        PRINT 'sp_AmendPOLineQty : already patched, left alone.';
        COMMIT;
        RETURN;
    END

    SET @old = N'SELECT @PoLineId AS PoLineId;';
    SET @rep =
          N'-- 4. Recompute the header total from the lines - SAME formula as sp_SetPOLine,' + CHAR(13) + CHAR(10)
        + N'    --    sp_SetPO, sp_AmendPOLine and sp_DeletePOLine. Without this, reducing a' + CHAR(13) + CHAR(10)
        + N'    --    quantity left TotalAmount at the old, higher value. (2026-09-27)' + CHAR(13) + CHAR(10)
        + N'    DECLARE @AqPoId INT = (SELECT PoId FROM proj.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @PoLineId);' + CHAR(13) + CHAR(10)
        + N'    IF @AqPoId IS NOT NULL' + CHAR(13) + CHAR(10)
        + N'        UPDATE po' + CHAR(13) + CHAR(10)
        + N'        SET    po.TotalAmount = ISNULL(t.Sub,0) - ISNULL(t.Sub,0) * ISNULL(po.Discount,0) / 100.0' + CHAR(13) + CHAR(10)
        + N'                                + ISNULL(t.Tax,0) + ISNULL(po.TaxAmount,0)' + CHAR(13) + CHAR(10)
        + N'        FROM   proj.TBL_PURCHASE_ORDER po' + CHAR(13) + CHAR(10)
        + N'        OUTER APPLY (SELECT SUM(pol.OrderedQty * pol.UnitPrice) AS Sub,' + CHAR(13) + CHAR(10)
        + N'                            SUM(pol.OrderedQty * pol.UnitPrice * ISNULL(pol.TaxPct,0) / 100.0) AS Tax' + CHAR(13) + CHAR(10)
        + N'                     FROM proj.TBL_PURCHASE_ORDER_LINE pol' + CHAR(13) + CHAR(10)
        + N'                     WHERE pol.PoId = @AqPoId AND pol.IsActive = 1) t' + CHAR(13) + CHAR(10)
        + N'        WHERE  po.PoId = @AqPoId;' + CHAR(13) + CHAR(10)
        + CHAR(13) + CHAR(10)
        + N'    SELECT @PoLineId AS PoLineId;';

    SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
    IF @n <> 1 THROW 50061, 'sp_AmendPOLineQty: expected exactly 1 anchor. Nothing changed.', 1;

    SET @new = REPLACE(@def, @old, @rep);

    SET @scan = 1;
    WHILE 1 = 1
    BEGIN
        SET @pos = CHARINDEX(N'CREATE', @new, @scan);
        IF @pos = 0 THROW 50062, 'Could not find the CREATE keyword. Nothing changed.', 1;
        IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
        SET @scan = @pos + 6;
    END
    SET @new = STUFF(@new, @pos, 6, N'ALTER ');

    EXEC sp_executesql @new;
    PRINT 'sp_AmendPOLineQty : patched.';

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_AmendPOLineQty')) LIKE '%@AqPoId%'
            THEN 'OK - sp_AmendPOLineQty recomputes the header total' ELSE 'NOT PATCHED' END AS result,
       (SELECT m.uses_quoted_identifier FROM sys.sql_modules m
        WHERE m.object_id = OBJECT_ID('PROJ.sp_AmendPOLineQty')) AS qi_on;
GO
