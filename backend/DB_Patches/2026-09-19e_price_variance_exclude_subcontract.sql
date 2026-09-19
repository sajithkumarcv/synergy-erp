-- =====================================================================
-- 2026-09-19e  Item Price Analysis "All items" - leave out subcontract lots
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- PROBLEM: the top rows of proj.sp_ReportPriceVariance were subcontract / service
-- lots. Those are priced per lot ("1 lot = 25,000 today, 40,000 next time") so
-- their "price change" is just a different scope of work, not a supplier price
-- movement - noise that pushed real material price changes off the list.
--
-- RULE: a PO is a subcontract PO when its expense category has
-- TBL_JOB_EXPENSE_CATEGORY.IsSubcontractOrder = 1 (same rule the PO list's
-- "Subcontract only" filter uses). Lines on such POs are now ignored.
--
-- NEW PARAMETER @IncludeSubcontract BIT = 0 (default 0 = exclude). Existing callers
-- that do not pass it get the cleaner report automatically; pass 1 for the old one.
--
-- Surgical, anchor-checked ALTER of the LIVE proc (THROWs if an anchor is not found
-- exactly once); idempotent. Pre-flight length on dev: 4204 (after 2026-09-14).
-- Needs 2026-09-10 + 2026-09-14 price-variance patches already applied.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('proj.sp_ReportPriceVariance'));
IF @def IS NULL THROW 51000, 'proj.sp_ReportPriceVariance not found - apply 2026-09-10_price_variance_report.sql first.', 1;

IF CHARINDEX(N'@IncludeSubcontract', @def) > 0
    PRINT 'sp_ReportPriceVariance already patched - nothing to do.';
ELSE
BEGIN
    DECLARE @a1 NVARCHAR(200) = N'NULL   -- item code / name / barcode, contains';
    DECLARE @r1 NVARCHAR(400) = N'NULL,   -- item code / name / barcode, contains' + CHAR(13) + CHAR(10)
                              + N'    @IncludeSubcontract BIT = 0   -- 1 = also count lots on subcontract-category POs';
    DECLARE @a2 NVARCHAR(200) = N'AND  po.PoDate >= @DateFrom AND po.PoDate <= @DateTo';
    DECLARE @r2 NVARCHAR(800) = @a2 + CHAR(13) + CHAR(10)
        + N'          AND (@IncludeSubcontract = 1 OR NOT EXISTS (SELECT 1 FROM proj.TBL_JOB_EXPENSE_CATEGORY sec' + CHAR(13) + CHAR(10)
        + N'                                                      WHERE sec.ExpenseCategoryId = po.ExpenseCategoryId' + CHAR(13) + CHAR(10)
        + N'                                                        AND ISNULL(sec.IsSubcontractOrder, 0) = 1))';

    DECLARE @n1 INT = (LEN(@def) - LEN(REPLACE(@def, @a1, N''))) / LEN(@a1);
    DECLARE @n2 INT = (LEN(@def) - LEN(REPLACE(@def, @a2, N''))) / LEN(@a2);
    IF @n1 <> 1 OR @n2 <> 1
    BEGIN
        DECLARE @m NVARCHAR(300) = N'Anchor mismatch in sp_ReportPriceVariance (param=' + CAST(@n1 AS NVARCHAR(5))
                                 + N', date filter=' + CAST(@n2 AS NVARCHAR(5)) + N'; each must be 1). Patch by hand.';
        THROW 51001, @m, 1;
    END

    SET @def = REPLACE(REPLACE(@def, @a1, @r1), @a2, @r2);
    DECLARE @pos INT = PATINDEX(N'%CREATE[ ]%PROCEDURE%', @def);
    IF @pos = 0 THROW 51002, 'CREATE PROCEDURE header not found.', 1;
    SET @def = STUFF(@def, @pos, LEN(N'CREATE'), N'ALTER');
    EXEC sp_executesql @def;
    PRINT 'sp_ReportPriceVariance patched.';
END
GO

SELECT Item = 'sp_ReportPriceVariance @IncludeSubcontract',
       Status = CASE WHEN EXISTS (SELECT 1 FROM sys.parameters WHERE object_id = OBJECT_ID('proj.sp_ReportPriceVariance') AND name = '@IncludeSubcontract')
                     THEN 'OK' ELSE 'MISSING' END;
GO
