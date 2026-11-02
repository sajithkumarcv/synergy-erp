-- 2026-11-02d: Tax Treatment applies to every supplier, not only India.
--   * Dropdown list (TBL_VLIST Supplier/GstTreatment) gets two more items: VAT_REGISTERED, VAT_NOT_REGISTERED.
--       India suppliers pick:      Registered Regular / Registered Composition / Unregistered / Overseas
--       All other countries pick:  VAT Registered / Not VAT Registered / Overseas
--   * sp_SetSupplier now requires a Tax Treatment for every supplier, checks it fits the country,
--     and a VAT Registered supplier needs a VAT Number (TRN) or Tax Number. India GST rules (2026-11-02a) are unchanged.
--   * Approval checklist "Tax details" follows the treatment (a Not VAT Registered supplier can be approved without a number).
-- Needs 2026-11-02a and 2026-11-02b applied first. Existing data untouched (existing suppliers must pick a Tax Treatment next time they are edited).
-- Idempotent. All or nothing. The procedure is located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @sql NVARCHAR(MAX);

    IF COL_LENGTH('proj.TBL_SUPPLIER', 'GstTreatment') IS NULL OR OBJECT_ID(N'proj.fn_SupplierApprovalChecklist') IS NULL
    BEGIN SET @msg = 'Apply 2026-11-02a and 2026-11-02b first.'; THROW 50001, @msg, 1; END

    -- 1) Dropdown items -----------------------------------------------------
    DECLARE @items TABLE (ItemValue NVARCHAR(100), ItemDescription NVARCHAR(200), SortOrder INT);
    INSERT INTO @items VALUES
        (N'VAT_REGISTERED',     N'VAT Registered',     5),
        (N'VAT_NOT_REGISTERED', N'Not VAT Registered', 6);
    INSERT INTO proj.TBL_VLIST (TypeName, ListName, ItemValue, ItemDescription, IsActive, CreatedBy, SortOrder)
    SELECT N'Supplier', N'GstTreatment', i.ItemValue, i.ItemDescription, 1, N'SYSTEM', i.SortOrder
    FROM @items i
    WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_VLIST v
                      WHERE v.TypeName = N'Supplier' AND v.ListName = N'GstTreatment' AND v.ItemValue = i.ItemValue);
    PRINT CONCAT('TBL_VLIST Supplier/GstTreatment: ', @@ROWCOUNT, ' item(s) added.');

    -- 2) Checklist follows the treatment --------------------------------------
    SET @sql = N'
CREATE OR ALTER FUNCTION proj.fn_SupplierApprovalChecklist (@SupplierId INT)
RETURNS TABLE
AS RETURN
(
    SELECT 0 AS SortNo, ''COUNTRY'' AS ItemKey, ''Country selected'' AS ItemLabel,
           CAST(CASE WHEN s.CountryId IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS IsOk
    FROM proj.TBL_SUPPLIER s WHERE s.SupplierId = @SupplierId
    UNION ALL
    SELECT 1, ''BANK'', ''At least one active bank account'',
           CAST(CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER_BANK b WHERE b.SupplierId = s.SupplierId AND b.IsActive = 1) THEN 1 ELSE 0 END AS BIT)
    FROM proj.TBL_SUPPLIER s WHERE s.SupplierId = @SupplierId
    UNION ALL
    SELECT 2, ''TAX'', ''Tax treatment, with GST number (India) or VAT number when registered'',
           CAST(CASE WHEN ISNULL(s.GstTreatment, '''') = '''' THEN 0
                     WHEN EXISTS (SELECT 1 FROM proj.TBL_COUNTRY c WHERE c.CountryId = s.CountryId AND (c.CountryName = ''India'' OR c.CountryCode = ''IND''))
                          THEN CASE WHEN s.GstTreatment IN (''REGISTERED_REGULAR'', ''REGISTERED_COMPOSITION'')
                                         AND LEN(LTRIM(RTRIM(ISNULL(s.TaxNumber, '''')))) <> 15 THEN 0 ELSE 1 END
                     WHEN s.GstTreatment = ''VAT_REGISTERED''
                          THEN CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(s.VatNumber, ''''))), '''') IS NOT NULL
                                      OR NULLIF(LTRIM(RTRIM(ISNULL(s.TaxNumber, ''''))), '''') IS NOT NULL THEN 1 ELSE 0 END
                     ELSE 1 END AS BIT)
    FROM proj.TBL_SUPPLIER s WHERE s.SupplierId = @SupplierId
    UNION ALL
    SELECT 3, ''CONTACT'', ''At least one contact person'',
           CAST(CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER_CONTACT x WHERE x.SupplierId = s.SupplierId AND x.IsActive = 1) THEN 1 ELSE 0 END AS BIT)
    FROM proj.TBL_SUPPLIER s WHERE s.SupplierId = @SupplierId
    UNION ALL
    SELECT 4, ''ADDRESS'', ''At least one address'',
           CAST(CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER_ADDRESS x WHERE x.SupplierId = s.SupplierId AND x.IsActive = 1) THEN 1 ELSE 0 END AS BIT)
    FROM proj.TBL_SUPPLIER s WHERE s.SupplierId = @SupplierId
)';
    EXEC (@sql);

    -- 3) sp_SetSupplier -----------------------------------------------------
    DECLARE @block NVARCHAR(MAX) = N'-- 2026-11-02d tax treatment for every country
    IF NULLIF(LTRIM(RTRIM(ISNULL(@GstTreatment, ''''))), '''') IS NULL
    BEGIN RAISERROR(''Tax Treatment is required.'', 16, 1); RETURN; END
    DECLARE @IsIndiaSupplier BIT = CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_COUNTRY WHERE CountryId = @CountryId AND (CountryName = ''India'' OR CountryCode = ''IND'')) THEN 1 ELSE 0 END;
    IF @IsIndiaSupplier = 1 AND @GstTreatment NOT IN (''REGISTERED_REGULAR'', ''REGISTERED_COMPOSITION'', ''UNREGISTERED'', ''OVERSEAS'')
    BEGIN RAISERROR(''This Tax Treatment is not valid for a supplier in India.'', 16, 1); RETURN; END
    IF @IsIndiaSupplier = 0 AND @GstTreatment NOT IN (''VAT_REGISTERED'', ''VAT_NOT_REGISTERED'', ''OVERSEAS'')
    BEGIN RAISERROR(''This Tax Treatment is not valid for a supplier outside India.'', 16, 1); RETURN; END
    IF @IsIndiaSupplier = 0 AND @GstTreatment = ''VAT_REGISTERED''
       AND NULLIF(LTRIM(RTRIM(ISNULL(@VatNumber, ''''))), '''') IS NULL AND NULLIF(LTRIM(RTRIM(ISNULL(@TaxNumber, ''''))), '''') IS NULL
    BEGIN RAISERROR(''VAT Number (TRN) is required for a VAT registered supplier.'', 16, 1); RETURN; END

    ';
    SET @m = N'IF @SupplierId = 0';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetSupplier'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_SetSupplier not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-02d', @def) > 0
        PRINT 'sp_SetSupplier: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_SetSupplier: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, @block + @m);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_SetSupplier: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_SetSupplier: altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
