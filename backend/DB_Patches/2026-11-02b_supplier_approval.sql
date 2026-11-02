-- 2026-11-02b: supplier approval (replaces the free "AVL Approved" tick) and "approved suppliers only" on the PO.
--   * TBL_SUPPLIER: ApprovedBy, ApprovedDate, ApprovalRemarks (new). IsApprovedVendor stays the approved flag.
--   * proj.fn_SupplierApprovalChecklist: country, bank, tax, contact, address.
--   * sp_ApproveSupplier / sp_WithdrawSupplierApproval. Approve is refused until the checklist is complete.
--   * Menu action APPROVE on the Supplier menu, granted to ADMIN, FIN_MGR, FIN_OFFCR (by role code).
--   * sp_SetSupplier no longer touches IsApprovedVendor (approval only through sp_ApproveSupplier).
--   * sp_SetSupplierBank: any bank save/delete withdraws the supplier's approval.
--   * sp_SetPO: a new PO, or a changed supplier on an existing PO, must use an approved supplier.
-- Needs 2026-11-02a applied first. Existing approved suppliers stay approved. Existing data untouched.
-- Idempotent. All or nothing. Procedures are located by ASCII markers that must each occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @i INT, @n INT, @m NVARCHAR(400), @r NVARCHAR(MAX), @sql NVARCHAR(MAX);

    IF COL_LENGTH('proj.TBL_SUPPLIER', 'GstTreatment') IS NULL
    BEGIN SET @msg = 'Apply 2026-11-02a_supplier_gst_treatment.sql first.'; THROW 50001, @msg, 1; END

    -- 1) Columns -----------------------------------------------------------
    IF COL_LENGTH('proj.TBL_SUPPLIER', 'ApprovedBy') IS NULL
        EXEC (N'ALTER TABLE proj.TBL_SUPPLIER ADD ApprovedBy NVARCHAR(100) NULL, ApprovedDate DATETIME NULL, ApprovalRemarks NVARCHAR(500) NULL');

    -- 2) VW_SUPPLIER exposes them -------------------------------------------
    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.VW_SUPPLIER'));
    IF @def IS NULL BEGIN SET @msg = 'proj.VW_SUPPLIER not found.'; THROW 50001, @msg, 1; END
    IF CHARINDEX(N'S.ApprovedBy', @def) = 0
    BEGIN
        SET @m = N'S.IsApprovedVendor, S.IsOnHold,';
        IF (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m) <> 1
        BEGIN SET @msg = 'VW_SUPPLIER: marker not found exactly once - live definition differs from the one this patch was written from.'; THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, N'S.IsApprovedVendor, S.IsOnHold, S.ApprovedBy, S.ApprovedDate, S.ApprovalRemarks,');
        SET @cpos = PATINDEX(N'%CREATE[ ]%VIEW%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'VW_SUPPLIER: CREATE VIEW not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'VW_SUPPLIER: altered.';
    END
    ELSE PRINT 'VW_SUPPLIER: already applied.';

    -- 3) Checklist function ---------------------------------------------------
    SET @sql = N'
CREATE OR ALTER FUNCTION proj.fn_SupplierApprovalChecklist (@SupplierId INT)
RETURNS TABLE
AS RETURN
(
    SELECT 1 AS SortNo, ''BANK'' AS ItemKey, ''At least one active bank account'' AS ItemLabel,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER_BANK b WHERE b.SupplierId = s.SupplierId AND b.IsActive = 1) THEN 1 ELSE 0 END AS BIT) AS IsOk
    FROM proj.TBL_SUPPLIER s WHERE s.SupplierId = @SupplierId
    UNION ALL
    SELECT 0, ''COUNTRY'', ''Country selected'',
           CAST(CASE WHEN s.CountryId IS NOT NULL THEN 1 ELSE 0 END AS BIT)
    FROM proj.TBL_SUPPLIER s WHERE s.SupplierId = @SupplierId
    UNION ALL
    SELECT 2, ''TAX'', ''Tax details (GST for India, VAT or tax number otherwise)'',
           CAST(CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_COUNTRY c WHERE c.CountryId = s.CountryId AND (c.CountryName = ''India'' OR c.CountryCode = ''IND''))
                     THEN CASE WHEN ISNULL(s.GstTreatment, '''') = '''' THEN 0
                               WHEN s.GstTreatment IN (''REGISTERED_REGULAR'', ''REGISTERED_COMPOSITION'')
                                    AND LEN(LTRIM(RTRIM(ISNULL(s.TaxNumber, '''')))) <> 15 THEN 0
                               ELSE 1 END
                     ELSE CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(s.VatNumber, ''''))), '''') IS NOT NULL
                                 OR NULLIF(LTRIM(RTRIM(ISNULL(s.TaxNumber, ''''))), '''') IS NOT NULL THEN 1 ELSE 0 END
                END AS BIT)
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

    -- 4) Approve / withdraw procedures ---------------------------------------------
    SET @sql = N'
CREATE OR ALTER PROCEDURE proj.sp_ApproveSupplier
    @SupplierId INT,
    @ApprovedBy NVARCHAR(100),
    @Remarks    NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId)
    BEGIN RAISERROR(''Supplier not found.'', 16, 1); RETURN; END

    DECLARE @missing NVARCHAR(1000) =
        STUFF((SELECT '', '' + ItemLabel FROM proj.fn_SupplierApprovalChecklist(@SupplierId) WHERE IsOk = 0 ORDER BY SortNo FOR XML PATH('''')), 1, 2, '''');
    IF @missing IS NOT NULL
    BEGIN
        DECLARE @err NVARCHAR(1200) = ''The supplier cannot be approved yet. Missing: '' + @missing + ''.'';
        RAISERROR(''%s'', 16, 1, @err); RETURN;
    END

    UPDATE proj.TBL_SUPPLIER
    SET IsApprovedVendor = 1, ApprovedBy = @ApprovedBy, ApprovedDate = GETDATE(),
        ApprovalRemarks = NULLIF(LTRIM(RTRIM(@Remarks)), ''''),
        ModifiedBy = @ApprovedBy, ModifiedDate = GETDATE()
    WHERE SupplierId = @SupplierId;

    SELECT CAST(@SupplierId AS NVARCHAR(20));
END';
    EXEC (@sql);

    SET @sql = N'
CREATE OR ALTER PROCEDURE proj.sp_WithdrawSupplierApproval
    @SupplierId INT,
    @ModifiedBy NVARCHAR(100),
    @Remarks    NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId)
    BEGIN RAISERROR(''Supplier not found.'', 16, 1); RETURN; END

    UPDATE proj.TBL_SUPPLIER
    SET IsApprovedVendor = 0, ApprovedBy = NULL, ApprovedDate = NULL,
        ApprovalRemarks = NULLIF(LTRIM(RTRIM(@Remarks)), ''''),
        ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
    WHERE SupplierId = @SupplierId;

    SELECT CAST(@SupplierId AS NVARCHAR(20));
END';
    EXEC (@sql);

    SET @sql = N'
CREATE OR ALTER PROCEDURE proj.sp_GetSupplierApproval
    @SupplierId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SortNo, ItemKey, ItemLabel, IsOk FROM proj.fn_SupplierApprovalChecklist(@SupplierId) ORDER BY SortNo;
END';
    EXEC (@sql);

    -- 5) Menu action APPROVE on the Supplier menu, by role code ------------------------
    DECLARE @supMenu INT = (SELECT MenuId FROM proj.TBL_MENU WHERE MenuUrl = '/suppliers');
    IF @supMenu IS NULL BEGIN SET @msg = 'Supplier menu (/suppliers) not found.'; THROW 50001, @msg, 1; END

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_MENU_ACTIONS WHERE MenuId = @supMenu AND ActionCode = 'APPROVE')
        INSERT INTO proj.TBL_MENU_ACTIONS (MenuId, ActionName, ActionCode, IsActive) VALUES (@supMenu, 'Approve', 'APPROVE', 1);

    DECLARE @actId INT = (SELECT ActionId FROM proj.TBL_MENU_ACTIONS WHERE MenuId = @supMenu AND ActionCode = 'APPROVE');

    INSERT INTO proj.TBL_ROLE_MENU_ACTION (RoleId, MenuId, ActionId, IsAllowed)
    SELECT r.RoleId, @supMenu, @actId, 1
    FROM proj.TBL_ROLES r
    WHERE r.RoleCode IN ('ADMIN', 'FIN_MGR', 'FIN_OFFCR')
      AND NOT EXISTS (SELECT 1 FROM proj.TBL_ROLE_MENU_ACTION x WHERE x.RoleId = r.RoleId AND x.MenuId = @supMenu AND x.ActionId = @actId);

    -- 6) Marker edits on three existing procedures --------------------------------------
    DECLARE @tag NVARCHAR(50) = N'2026-11-02b';
    DECLARE @edits TABLE (Id INT IDENTITY(1,1), ObjName SYSNAME, Marker NVARCHAR(400), Replacement NVARCHAR(MAX));

    DECLARE @bankBlock NVARCHAR(MAX) = N'-- 2026-11-02b withdraw approval on bank change
        UPDATE s SET IsApprovedVendor = 0, ApprovedBy = NULL, ApprovedDate = NULL,
                     ApprovalRemarks = ''Approval withdrawn: bank details were changed. Approve the supplier again.''
        FROM proj.TBL_SUPPLIER s
        WHERE s.IsApprovedVendor = 1
          AND s.SupplierId = ISNULL(NULLIF(@SupplierId, 0), (SELECT b.SupplierId FROM proj.TBL_SUPPLIER_BANK b WHERE b.SupplierBankId = @SupplierBankId));
        ';
    DECLARE @poNew NVARCHAR(MAX) = N'-- 2026-11-02b approved supplier only
        IF NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId AND IsApprovedVendor = 1)
            THROW 50511, ''This supplier is not approved. Only approved suppliers can be used on a purchase order.'', 1;

        ';
    DECLARE @poEdit NVARCHAR(MAX) = N'-- 2026-11-02b approved supplier only
        IF NULLIF(@SupplierId, 0) IS NOT NULL
           AND ISNULL((SELECT SupplierId FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId), 0) <> @SupplierId
           AND NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId AND IsApprovedVendor = 1)
            THROW 50511, ''This supplier is not approved. Only approved suppliers can be used on a purchase order.'', 1;

        ';

    INSERT INTO @edits (ObjName, Marker, Replacement) VALUES
      (N'sp_SetSupplier', N'@IsActive, @IsApprovedVendor, @IsOnHold, @LeadTimeDays, @PaymentMode,',
                          N'@IsActive, 0, @IsOnHold, @LeadTimeDays, @PaymentMode,'),
      (N'sp_SetSupplier', N'IsApprovedVendor   = @IsApprovedVendor,',
                          N'IsApprovedVendor   = IsApprovedVendor, -- 2026-11-02b approval only through sp_ApproveSupplier'),
      (N'sp_SetSupplierBank', N'SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));',
                          @bankBlock + N'SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));'),
      (N'sp_SetSupplierBank', N'SELECT CAST(@SupplierBankId AS NVARCHAR(20));',
                          @bankBlock + N'SELECT CAST(@SupplierBankId AS NVARCHAR(20));'),
      (N'sp_SetPO', N'DECLARE @IsClosed BIT = 0, @StatusName NVARCHAR(50) = '''';',
                          @poNew + N'DECLARE @IsClosed BIT = 0, @StatusName NVARCHAR(50) = '''';'),
      (N'sp_SetPO', N'-- 2026-10-28f job lock',
                          @poEdit + N'-- 2026-10-28f job lock');

    DECLARE @objs TABLE (Id INT IDENTITY(1,1), ObjName SYSNAME);
    INSERT INTO @objs (ObjName) VALUES (N'sp_SetSupplier'), (N'sp_SetSupplierBank'), (N'sp_SetPO');

    DECLARE @o INT, @obj SYSNAME;
    SELECT @o = MIN(Id) FROM @objs;
    WHILE @o IS NOT NULL
    BEGIN
        SELECT @obj = ObjName FROM @objs WHERE Id = @o;
        SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.' + @obj));
        IF @def IS NULL BEGIN SET @msg = CONCAT('proj.', @obj, ' not found.'); THROW 50001, @msg, 1; END

        IF CHARINDEX(@tag, @def) > 0
            PRINT CONCAT(@obj, ': already applied.');
        ELSE
        BEGIN
            SELECT @i = MIN(Id) FROM @edits WHERE ObjName = @obj;
            WHILE @i IS NOT NULL
            BEGIN
                SELECT @m = Marker, @r = Replacement FROM @edits WHERE Id = @i;
                SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
                IF @n <> 1
                BEGIN SET @msg = CONCAT(@obj, ': marker #', @i, ' found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
                SET @def = REPLACE(@def, @m, @r);
                SELECT @i = MIN(Id) FROM @edits WHERE ObjName = @obj AND Id > @i;
            END

            SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
            IF @cpos = 0 BEGIN SET @msg = CONCAT(@obj, ': CREATE PROCEDURE not found.'); THROW 50003, @msg, 1; END
            SET @def = STUFF(@def, @cpos, 6, N'ALTER');
            EXEC (@def);
            PRINT CONCAT(@obj, ': altered.');
        END

        SELECT @o = MIN(Id) FROM @objs WHERE Id > @o;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
