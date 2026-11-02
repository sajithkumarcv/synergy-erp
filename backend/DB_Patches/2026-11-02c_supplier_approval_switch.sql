-- 2026-11-02c: per-company switch for "only approved suppliers on a PO".
--   Setting Biz.Supplier.RequireApprovedForPO  ('1' = PO needs an approved supplier, '0' = off, any supplier can be used).
--   sp_SetPO checks the setting; the PO supplier pick-list reads the same setting.
--   Supplier approval itself (checklist, Approve / Withdraw) works the same whatever the setting.
-- Needs 2026-11-02b applied first. Idempotent. All or nothing. Run per database, one at a time. Run with sqlcmd -I.
--
-- >>> SET THE VALUE FOR THIS DATABASE BELOW BEFORE RUNNING: '1' for Synergy India, '0' for Synergy UAE until finance has cleaned up the suppliers.
-- It is only written when the setting does not exist yet; re-running never overwrites a value changed later in Company Settings.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @InitialValue NVARCHAR(1) = N'1';   -- <<< '1' India, '0' UAE

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @i INT, @n INT, @m NVARCHAR(400), @r NVARCHAR(MAX);

    IF @InitialValue NOT IN (N'0', N'1')
    BEGIN SET @msg = '@InitialValue must be 0 or 1.'; THROW 50001, @msg, 1; END

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Biz.Supplier.RequireApprovedForPO')
    BEGIN
        INSERT INTO proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy)
        VALUES (N'Biz.Supplier.RequireApprovedForPO', @InitialValue,
                N'1 = a PO can only be raised for an approved supplier (pick-list shows approved suppliers only, save is refused otherwise). 0 = any supplier can be used on a PO.',
                N'PATCH-2026-11-02c');
        PRINT CONCAT('Biz.Supplier.RequireApprovedForPO: added with value ', @InitialValue);
    END
    ELSE PRINT 'Biz.Supplier.RequireApprovedForPO: already there, value left as it is.';

    DECLARE @edits TABLE (Id INT IDENTITY(1,1), Marker NVARCHAR(400), Replacement NVARCHAR(MAX));
    -- Order matters: the "AND NOT EXISTS" line (edit path) is changed first so the "IF NOT EXISTS" marker (new-PO path) stays unique.
    INSERT INTO @edits (Marker, Replacement) VALUES
      (N'AND NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId AND IsApprovedVendor = 1)',
       N'AND ISNULL((SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N''Biz.Supplier.RequireApprovedForPO''), N''1'') = N''1'' -- 2026-11-02c switch'
       + CHAR(13) + CHAR(10) + N'           AND NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId AND IsApprovedVendor = 1)'),
      (N'IF NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId AND IsApprovedVendor = 1)',
       N'IF ISNULL((SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N''Biz.Supplier.RequireApprovedForPO''), N''1'') = N''1'' -- 2026-11-02c switch'
       + CHAR(13) + CHAR(10) + N'           AND NOT EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE SupplierId = @SupplierId AND IsApprovedVendor = 1)');

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetPO'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_SetPO not found.'; THROW 50001, @msg, 1; END
    IF CHARINDEX(N'2026-11-02b approved supplier only', @def) = 0
    BEGIN SET @msg = 'sp_SetPO: apply 2026-11-02b_supplier_approval.sql first.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-02c switch', @def) > 0
        PRINT 'sp_SetPO: already applied.';
    ELSE
    BEGIN
        SELECT @i = MIN(Id) FROM @edits;
        WHILE @i IS NOT NULL
        BEGIN
            SELECT @m = Marker, @r = Replacement FROM @edits WHERE Id = @i;
            SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
            IF @n <> 1
            BEGIN SET @msg = CONCAT('sp_SetPO: marker #', @i, ' found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
            SET @def = REPLACE(@def, @m, @r);
            SELECT @i = MIN(Id) FROM @edits WHERE Id > @i;
        END
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_SetPO: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_SetPO: altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
