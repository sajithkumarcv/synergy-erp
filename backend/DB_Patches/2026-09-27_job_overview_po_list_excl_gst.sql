-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27  Job Overview: the PO list must show job cost EXCLUDING GST.
--
-- GST is collected from the customer and passed on - it is not a project cost. Budget vs
-- Actual on the Job Overview already works that way (pre-tax, OrderedQty * UnitPrice) but
-- the PO list lower down the SAME page used the tax-inclusive header TotalAmount, so one
-- screen showed two different numbers for the same job:
--     EC26-300003 Steel Materials   Budget vs Actual 22,297,105.48   PO list 25,940,043.66
-- The 3,642,938.18 gap was 18% GST.
--
-- RS7 now also returns the pre-tax value of each PO, taken from its lines:
--     PoAmountExTax      - in the PO's own currency
--     PoAmountExTaxBase  - converted to base currency (and scaled by @Div like its siblings)
-- TotalAmount is left in place: Paid and Balance are CASH figures, and the supplier is paid
-- the GST-inclusive amount, so those two columns must keep using it.
--
-- Computed from the lines, so it is also immune to the stale-header bug in sp_DeletePOLine
-- (which recomputes TBL_PURCHASE_ORDER.TotalAmount without tax).
--
-- Edited surgically from the LIVE definition (anchor-checked, all-or-nothing, idempotent)
-- because sp_GetJobOverview is long and prod's copy may differ. Verified 2026-09-27: dev
-- SYNERP and the prod India restore hold byte-identical definitions of this procedure.
-- ─────────────────────────────────────────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(600), @rep NVARCHAR(900);
    DECLARE @n INT, @p INT, @r INT, @plen INT, @pos INT;

    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_GetJobOverview'));
    IF @def IS NULL THROW 50010, 'sp_GetJobOverview not found.', 1;

    IF CHARINDEX(N'PoAmountExTax', @def) > 0
    BEGIN
        PRINT 'sp_GetJobOverview : already patched, left alone.';
        COMMIT;
        RETURN;
    END

    SET @new = @def;

    -- ── edit 1: add the two pre-tax columns to RS7 ───────────────────────────
    SET @old = N'(proj.fn_ToBase(po.TotalAmount, po.ExchangeRate) - ISNULL(paid.PoPaid, 0)) / @Div   AS BalanceAmountBase';
    SET @rep = N'(proj.fn_ToBase(po.TotalAmount, po.ExchangeRate) - ISNULL(paid.PoPaid, 0)) / @Div   AS BalanceAmountBase,'
             + N' ISNULL(lx.ExTax, 0) AS PoAmountExTax,'
             + N' proj.fn_ToBase(ISNULL(lx.ExTax, 0), po.ExchangeRate) / @Div AS PoAmountExTaxBase';
    SET @n = (DATALENGTH(@new) - DATALENGTH(REPLACE(@new, @old, N''))) / DATALENGTH(@old);
    IF @n <> 1 THROW 50011, 'sp_GetJobOverview edit 1: expected exactly 1 anchor. Nothing changed.', 1;
    SET @new = REPLACE(@new, @old, @rep);

    -- ── edit 2: the line total it reads ──────────────────────────────────────
    SET @old = N'LEFT JOIN proj.TBL_JOB_EXPENSE_CATEGORY ec ON ec.ExpenseCategoryId = po.ExpenseCategoryId';
    SET @rep = N'LEFT JOIN proj.TBL_JOB_EXPENSE_CATEGORY ec ON ec.ExpenseCategoryId = po.ExpenseCategoryId'
             + N' OUTER APPLY (SELECT SUM(pol.OrderedQty * pol.UnitPrice) AS ExTax'
             + N' FROM proj.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = po.PoId AND pol.IsActive = 1) lx';
    SET @n = (DATALENGTH(@new) - DATALENGTH(REPLACE(@new, @old, N''))) / DATALENGTH(@old);
    IF @n <> 1 THROW 50012, 'sp_GetJobOverview edit 2: expected exactly 1 anchor. Nothing changed.', 1;
    SET @new = REPLACE(@new, @old, @rep);

    -- CREATE -> ALTER
    SET @p    = CHARINDEX(N'PROCEDURE', @new);
    SET @plen = @p - 1;
    SET @r    = CHARINDEX(N'ETAERC', REVERSE(LEFT(@new, @plen)));
    IF @r = 0 THROW 50013, 'sp_GetJobOverview: could not find the CREATE keyword. Nothing changed.', 1;
    SET @pos  = @plen - @r - 4;
    SET @new  = STUFF(@new, @pos, 6, N'ALTER ');

    EXEC sp_executesql @new;
    PRINT 'sp_GetJobOverview : patched.';

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── verification ─────────────────────────────────────────────────────────────
SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_GetJobOverview')) LIKE '%PoAmountExTax%'
            THEN 'OK - sp_GetJobOverview returns the pre-tax PO value'
            ELSE 'NOT PATCHED' END AS result;
GO
