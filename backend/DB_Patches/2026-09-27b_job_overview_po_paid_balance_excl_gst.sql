-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27b  Job Overview PO list: Paid and Balance excluding GST too.
--
-- The earlier patch (2026-09-27_job_overview_po_list_excl_gst.sql) moved the PO Amount
-- column to the pre-tax value so it reconciles with Budget vs Actual, but left Paid and
-- Balance on the tax-inclusive header. Side by side in one grid that reads as broken - a row
-- showed 10,129,925.50 - 0.00 = 11,953,312.09. All three columns must be on one basis.
--
-- Payments are made GST-inclusive, so Paid is PRO-RATED by the PO's own ex/incl ratio rather
-- than subtracting a tax-inclusive cash figure from a pre-tax value. Balance is then simply
-- PO Amount - Paid, both pre-tax, and every row adds up. Full GST-inclusive payables stay on
-- the supplier invoice and payment voucher screens, where the tax belongs.
--
-- Adds to RS7 (nothing removed, nothing renamed - the old columns stay for any other caller):
--     PaidAmountExTax / PaidAmountExTaxBase
--     BalanceExTax    / BalanceExTaxBase
--
-- Anchor-checked against the live definition, all-or-nothing, idempotent. Requires the
-- 2026-09-27 patch to have been applied first (it anchors on PoAmountExTaxBase).
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

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(400), @rep NVARCHAR(2000);
    DECLARE @n INT, @pos INT, @scan INT;

    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_GetJobOverview'));
    IF @def IS NULL THROW 50050, 'sp_GetJobOverview not found.', 1;

    IF CHARINDEX(N'PoAmountExTaxBase', @def) = 0
        THROW 50051, 'Apply 2026-09-27_job_overview_po_list_excl_gst.sql first. Nothing changed.', 1;

    IF CHARINDEX(N'BalanceExTaxBase', @def) > 0
    BEGIN
        PRINT 'sp_GetJobOverview : already patched, left alone.';
        COMMIT;
        RETURN;
    END

    SET @old = N'proj.fn_ToBase(ISNULL(lx.ExTax, 0), po.ExchangeRate) / @Div AS PoAmountExTaxBase';
    -- ratio = pre-tax / tax-inclusive for THIS PO; 1 when the header is zero or missing.
    SET @rep = @old
        + N', ISNULL(ISNULL(lx.ExTax,0) / NULLIF(po.TotalAmount, 0), 1) AS ExTaxRatio'
        + N', ROUND(ISNULL(paid.PoPaid, 0) / NULLIF(ISNULL(po.ExchangeRate, 1), 0), 2)'
        + N'   * ISNULL(ISNULL(lx.ExTax,0) / NULLIF(po.TotalAmount, 0), 1) AS PaidAmountExTax'
        + N', ISNULL(lx.ExTax, 0) - ROUND(ISNULL(paid.PoPaid, 0) / NULLIF(ISNULL(po.ExchangeRate, 1), 0), 2)'
        + N'   * ISNULL(ISNULL(lx.ExTax,0) / NULLIF(po.TotalAmount, 0), 1) AS BalanceExTax'
        + N', ISNULL(paid.PoPaid, 0) * ISNULL(ISNULL(lx.ExTax,0) / NULLIF(po.TotalAmount, 0), 1) / @Div AS PaidAmountExTaxBase'
        + N', (proj.fn_ToBase(ISNULL(lx.ExTax, 0), po.ExchangeRate)'
        + N'    - ISNULL(paid.PoPaid, 0) * ISNULL(ISNULL(lx.ExTax,0) / NULLIF(po.TotalAmount, 0), 1)) / @Div AS BalanceExTaxBase';

    SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
    IF @n <> 1 THROW 50052, 'sp_GetJobOverview: expected exactly 1 anchor. Nothing changed.', 1;

    SET @new = REPLACE(@def, @old, @rep);

    -- first CREATE that is actually followed by PROC (a leading comment may contain the word)
    SET @scan = 1;
    WHILE 1 = 1
    BEGIN
        SET @pos = CHARINDEX(N'CREATE', @new, @scan);
        IF @pos = 0 THROW 50053, 'Could not find the CREATE keyword. Nothing changed.', 1;
        IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
        SET @scan = @pos + 6;
    END
    SET @new = STUFF(@new, @pos, 6, N'ALTER ');

    EXEC sp_executesql @new;
    PRINT 'sp_GetJobOverview : Paid and Balance now available excluding GST.';

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_GetJobOverview')) LIKE '%BalanceExTaxBase%'
            THEN 'OK - RS7 returns PaidAmountExTax / BalanceExTax' ELSE 'NOT PATCHED' END AS result,
       (SELECT m.uses_quoted_identifier FROM sys.sql_modules m
        WHERE m.object_id = OBJECT_ID('PROJ.sp_GetJobOverview')) AS qi_on;
GO
