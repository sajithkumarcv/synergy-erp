-- 2026-11-13b: Country on the customer itself (mandatory when adding a customer, like suppliers).
--   * TBL_CUSTOMER gets a nullable CountryId. Existing customers are filled from their default (else first) active address country;
--     customers with no address stay blank until someone picks a country.
--   * VW_CUSTOMER returns CountryId and CountryName (so sp_GetCustomer, which reads the view, returns them).
--   * sp_SetCustomer: new optional @CountryId. A NEW customer without a country is refused ("Country is required."); an unknown
--     country is refused. An edit that sends no country keeps the stored one.
-- Idempotent. All or nothing. The view and procedure are located by ASCII markers that must each occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT;

    -- 1. column
    IF COL_LENGTH('proj.TBL_CUSTOMER', 'CountryId') IS NULL
        EXEC (N'ALTER TABLE proj.TBL_CUSTOMER ADD CountryId INT NULL');

    -- 2. backfill from the default (else first) active address, only where still blank
    EXEC (N'UPDATE c SET CountryId = x.CountryId
            FROM proj.TBL_CUSTOMER c
            CROSS APPLY (SELECT TOP 1 a.CountryId FROM proj.TBL_CUSTOMER_ADDRESS a
                         WHERE a.CustomerId = c.CustomerId AND a.IsActive = 1 AND a.CountryId IS NOT NULL
                         ORDER BY a.IsDefault DESC, a.CustomerAddressId) x
            WHERE c.CountryId IS NULL');

    -- 3. view
    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.VW_CUSTOMER'));
    IF @def IS NULL BEGIN SET @msg = N'proj.VW_CUSTOMER not found.'; RAISERROR(@msg, 16, 1); END
    IF @def NOT LIKE N'%CO.CountryName%'
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, N'C.Web,', N''))) / LEN(N'C.Web,');
        IF @n <> 1 BEGIN SET @msg = N'VW_CUSTOMER marker C.Web, found ' + CAST(@n AS NVARCHAR(10)) + N' times (expected 1).'; RAISERROR(@msg, 16, 1); END
        SET @n = (LEN(@def) - LEN(REPLACE(@def, N'PT.PaymentTermsId;', N''))) / LEN(N'PT.PaymentTermsId;');
        IF @n <> 1 BEGIN SET @msg = N'VW_CUSTOMER end marker found ' + CAST(@n AS NVARCHAR(10)) + N' times (expected 1).'; RAISERROR(@msg, 16, 1); END
        SET @def = REPLACE(@def, N'C.Web,', N'C.Web,
    C.CountryId,
    CO.CountryName                                          AS CountryName,');
        SET @def = REPLACE(@def, N'PT.PaymentTermsId;', N'PT.PaymentTermsId
LEFT JOIN TBL_COUNTRY             CO  ON C.CountryId          = CO.CountryId;');
        SET @cpos = CHARINDEX(N'CREATE', @def);
        IF @cpos = 0 OR @cpos > 20 BEGIN SET @msg = N'VW_CUSTOMER: CREATE keyword not found at start.'; RAISERROR(@msg, 16, 1); END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
    END

    -- 4. procedure
    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetCustomer'));
    IF @def IS NULL BEGIN SET @msg = N'proj.sp_SetCustomer not found.'; RAISERROR(@msg, 16, 1); END
    IF @def NOT LIKE N'%@CountryId%'
    BEGIN
        DECLARE @m1 NVARCHAR(200) = N'@ModifiedBy NVARCHAR(50) = NULL',
                @m2 NVARCHAR(200) = N'SalesPerson, Remarks, IsActive, CreatedBy, CreatedDate',
                @m3 NVARCHAR(200) = N'@SalesPerson, @Remarks, @IsActive, @CreatedBy, GETDATE()',
                @m4 NVARCHAR(200) = N'ModifiedBy = @ModifiedBy,',
                @m5 NVARCHAR(200) = N'IF @CustomerId = 0';
        DECLARE @mk TABLE (m NVARCHAR(200));
        INSERT @mk VALUES (@m1), (@m2), (@m3), (@m4), (@m5);
        DECLARE @bad NVARCHAR(200) = (SELECT TOP 1 m FROM @mk WHERE (LEN(@def) - LEN(REPLACE(@def, m, N''))) / LEN(m) <> 1);
        IF @bad IS NOT NULL BEGIN SET @msg = N'sp_SetCustomer marker not found exactly once: ' + @bad; RAISERROR(@msg, 16, 1); END

        SET @def = REPLACE(@def, @m1, @m1 + N',
    @CountryId INT = NULL');
        SET @def = REPLACE(@def, @m2, N'SalesPerson, Remarks, IsActive, CreatedBy, CreatedDate, CountryId');
        SET @def = REPLACE(@def, @m3, N'@SalesPerson, @Remarks, @IsActive, @CreatedBy, GETDATE(), @CountryId');
        SET @def = REPLACE(@def, @m4, @m4 + N'
            CountryId = ISNULL(@CountryId, CountryId),');
        SET @def = REPLACE(@def, @m5, N'-- 2026-11-13b: country is mandatory on a new customer
    IF @CustomerId = 0 AND @CountryId IS NULL
    BEGIN RAISERROR(''Country is required.'', 16, 1); RETURN; END
    IF @CountryId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proj.TBL_COUNTRY WHERE CountryId = @CountryId)
    BEGIN RAISERROR(''Country not found.'', 16, 1); RETURN; END

    ' + @m5);
        SET @cpos = CHARINDEX(N'CREATE', @def);
        IF @cpos = 0 OR @cpos > 20 BEGIN SET @msg = N'sp_SetCustomer: CREATE keyword not found at start.'; RAISERROR(@msg, 16, 1); END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
    END

    COMMIT TRAN;
    PRINT 'customer country: column, backfill, VW_CUSTOMER and sp_SetCustomer done.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    DECLARE @em NVARCHAR(2000) = ERROR_MESSAGE();
    RAISERROR('Patch 2026-11-13b failed and was rolled back: %s', 16, 1, @em);
END CATCH
GO
