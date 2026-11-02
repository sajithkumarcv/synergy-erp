-- 2026-11-02a: GST Treatment on the supplier.
--   * TBL_SUPPLIER.GstTreatment (new, nullable) + VW_SUPPLIER exposes it.
--   * Dropdown list in TBL_VLIST: Supplier / GstTreatment (admin can rename or deactivate items).
--   * sp_SetSupplier now refuses (hard block):
--       - no Country
--       - India supplier with no Tax Treatment (the field was called "GST Treatment"; the database column is still GstTreatment)
--       - GST registered (Regular / Composition) with no GST number (Tax Number) or one that is not 15 characters
--     Other countries and Unregistered / Overseas are unaffected.
--   Bank details are NOT checked here - the PO screen only warns.
-- Existing data untouched. Idempotent. All or nothing.
-- Each procedure/view is located by ASCII markers that must each occur exactly once in the live definition.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @i INT, @n INT, @m NVARCHAR(400), @r NVARCHAR(MAX);

    -- 1) Column ------------------------------------------------------------
    IF COL_LENGTH('proj.TBL_SUPPLIER', 'GstTreatment') IS NULL
    BEGIN
        EXEC (N'ALTER TABLE proj.TBL_SUPPLIER ADD GstTreatment NVARCHAR(50) NULL');
        PRINT 'TBL_SUPPLIER.GstTreatment: added.';
    END
    ELSE PRINT 'TBL_SUPPLIER.GstTreatment: already there.';

    -- 2) Dropdown list -----------------------------------------------------
    DECLARE @items TABLE (ItemValue NVARCHAR(100), ItemDescription NVARCHAR(200), SortOrder INT);
    INSERT INTO @items VALUES
        (N'REGISTERED_REGULAR',     N'Registered Business - Regular',     1),
        (N'REGISTERED_COMPOSITION', N'Registered Business - Composition', 2),
        (N'UNREGISTERED',           N'Unregistered Business',             3),
        (N'OVERSEAS',               N'Overseas',                          4);

    INSERT INTO proj.TBL_VLIST (TypeName, ListName, ItemValue, ItemDescription, IsActive, CreatedBy, SortOrder)
    SELECT N'Supplier', N'GstTreatment', i.ItemValue, i.ItemDescription, 1, N'SYSTEM', i.SortOrder
    FROM @items i
    WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_VLIST v
                      WHERE v.TypeName = N'Supplier' AND v.ListName = N'GstTreatment' AND v.ItemValue = i.ItemValue);
    PRINT CONCAT('TBL_VLIST Supplier/GstTreatment: ', @@ROWCOUNT, ' item(s) added.');

    -- 3) VW_SUPPLIER exposes the column ------------------------------------
    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.VW_SUPPLIER'));
    IF @def IS NULL BEGIN SET @msg = 'proj.VW_SUPPLIER not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'S.GstTreatment', @def) > 0
        PRINT 'VW_SUPPLIER: already applied.';
    ELSE
    BEGIN
        SET @m = N'S.VatNumber, S.TaxNumber,';
        IF (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m) <> 1
        BEGIN SET @msg = 'VW_SUPPLIER: marker not found exactly once - live definition differs from the one this patch was written from.'; THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, N'S.VatNumber, S.TaxNumber, S.GstTreatment,');
        SET @cpos = PATINDEX(N'%CREATE[ ]%VIEW%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'VW_SUPPLIER: CREATE VIEW not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'VW_SUPPLIER: altered.';
    END

    -- 4) sp_SetSupplier -----------------------------------------------------
    DECLARE @tag NVARCHAR(100) = N'-- 2026-11-02a supplier gst';
    DECLARE @edits TABLE (Id INT IDENTITY(1,1), Marker NVARCHAR(400), Replacement NVARCHAR(MAX));

    DECLARE @block NVARCHAR(MAX) = N'
    -- 2026-11-02a supplier gst
    IF @CountryId IS NULL
    BEGIN RAISERROR(''Country is required.'', 16, 1); RETURN; END
    IF EXISTS (SELECT 1 FROM proj.TBL_COUNTRY WHERE CountryId = @CountryId AND (CountryName = ''India'' OR CountryCode = ''IND''))
    BEGIN
        IF NULLIF(LTRIM(RTRIM(ISNULL(@GstTreatment, ''''))), '''') IS NULL
        BEGIN RAISERROR(''Tax Treatment is required for a supplier in India.'', 16, 1); RETURN; END
        IF @GstTreatment IN (''REGISTERED_REGULAR'', ''REGISTERED_COMPOSITION'')
        BEGIN
            IF NULLIF(LTRIM(RTRIM(ISNULL(@TaxNumber, ''''))), '''') IS NULL
            BEGIN RAISERROR(''GST Number (Tax Number) is required for a GST registered supplier.'', 16, 1); RETURN; END
            IF LEN(LTRIM(RTRIM(@TaxNumber))) <> 15
            BEGIN RAISERROR(''GST Number must be 15 characters (GSTIN).'', 16, 1); RETURN; END
        END
    END

    ';

    INSERT INTO @edits (Marker, Replacement) VALUES
      (N'@Rating             TINYINT        = NULL,',
       N'@Rating             TINYINT        = NULL,' + CHAR(13) + CHAR(10) + N'    @GstTreatment       NVARCHAR(50)   = NULL,'),
      (N'TradeLicenseNo, TradeLicenseExpiry, CountryId, Rating,',
       N'TradeLicenseNo, TradeLicenseExpiry, CountryId, Rating, GstTreatment,'),
      (N'@TradeLicenseNo, @TradeLicenseExpiry, @CountryId, @Rating,',
       N'@TradeLicenseNo, @TradeLicenseExpiry, @CountryId, @Rating, @GstTreatment,'),
      (N'Rating             = @Rating,',
       N'Rating             = @Rating,' + CHAR(13) + CHAR(10) + N'            GstTreatment       = @GstTreatment,'),
      (N'IF @SupplierId = 0',
       @block + N'IF @SupplierId = 0');

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetSupplier'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_SetSupplier not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(@tag, @def) > 0
        PRINT 'sp_SetSupplier: already applied.';
    ELSE
    BEGIN
        SELECT @i = MIN(Id) FROM @edits;
        WHILE @i IS NOT NULL
        BEGIN
            SELECT @m = Marker, @r = Replacement FROM @edits WHERE Id = @i;
            SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
            IF @n <> 1
            BEGIN SET @msg = CONCAT('sp_SetSupplier: marker ', @i, ' found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
            SET @def = REPLACE(@def, @m, @r);
            SELECT @i = MIN(Id) FROM @edits WHERE Id > @i;
        END

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
