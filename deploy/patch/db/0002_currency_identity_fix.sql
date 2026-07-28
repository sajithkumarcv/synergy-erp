/* ─────────────────────────────────────────────────────────────────────────
   0002_currency_identity_fix.sql
   proj.TBL_CURRENCY.CurrencyId was created WITHOUT the IDENTITY property in
   this DB, so proj.sp_AdminCurrencySave (which omits CurrencyId expecting
   auto-generation) inserts NULL into a NOT NULL column and fails.

   SQL Server can't ALTER COLUMN to add IDENTITY to an existing column, so
   this rebuilds the table: drop the 5 FKs pointing at it (captured and
   redropped/recreated dynamically, so exact FK names/tables never need to
   be hand-typed), recreate TBL_CURRENCY with CurrencyId IDENTITY(1,1),
   copy every existing row back with its EXACT original CurrencyId (via
   IDENTITY_INSERT) so FK_CUSTOMER_CURRENCY / FK_SUPPLIER etc. keep pointing
   at the right currency, then restore the FKs.

   Guarded: skips entirely if CurrencyId is already IDENTITY in this DB, so
   it's safe to run on all 3 company DBs even though only some may need it.
   Run the check below FIRST against ESI_PMS_IND / SYN_PMS_IND / SYN_PMS_UAE
   to see which ones actually need it — this script no-ops on the others:
       SELECT is_identity FROM sys.columns
       WHERE object_id = OBJECT_ID('proj.TBL_CURRENCY') AND name = 'CurrencyId';
   ───────────────────────────────────────────────────────────────────────── */
SET XACT_ABORT ON;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('proj.TBL_CURRENCY') AND name = 'CurrencyId' AND is_identity = 1)
BEGIN
    PRINT 'proj.TBL_CURRENCY.CurrencyId is already IDENTITY — nothing to do.';
    RETURN;
END

BEGIN TRAN;

    -- 1) Capture every FK pointing at TBL_CURRENCY (name, table, column, delete/update rule)
    --    before dropping, so we can recreate them identically afterward.
    IF OBJECT_ID('tempdb..#FkCapture') IS NOT NULL DROP TABLE #FkCapture;
    SELECT
        fk.name                                                    AS FkName,
        SCHEMA_NAME(t.schema_id)                                   AS ParentSchema,
        t.name                                                     AS ParentTable,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id)       AS ParentColumn,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS RefColumn,
        fk.delete_referential_action_desc                          AS OnDelete,
        fk.update_referential_action_desc                          AS OnUpdate
    INTO #FkCapture
    FROM sys.foreign_keys fk
    JOIN sys.tables t ON fk.parent_object_id = t.object_id
    JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    WHERE fk.referenced_object_id = OBJECT_ID('proj.TBL_CURRENCY');

    -- 2) Drop those FKs (dynamic — uses the real names captured above).
    DECLARE @dropSql NVARCHAR(MAX) = N'';
    SELECT @dropSql = @dropSql +
        N'ALTER TABLE ' + QUOTENAME(ParentSchema) + N'.' + QUOTENAME(ParentTable) +
        N' DROP CONSTRAINT ' + QUOTENAME(FkName) + N';' + CHAR(10)
    FROM #FkCapture;
    IF LEN(@dropSql) > 0 EXEC sp_executesql @dropSql;

    -- 3) Move the current table aside.
    EXEC sp_rename 'proj.TBL_CURRENCY', 'TBL_CURRENCY_OLD';

    -- 4) Recreate with CurrencyId as IDENTITY (columns/types/nullability match the
    --    live schema exactly, as read from sys.columns).
    CREATE TABLE proj.TBL_CURRENCY (
        CurrencyId      INT             IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CurrencyName    VARCHAR(100)    NOT NULL,
        ShortName       VARCHAR(10)     NOT NULL,
        Symbol          NVARCHAR(20)    NOT NULL,
        CurrencyFormat  VARCHAR(50)     NOT NULL,
        DecimalPlaces   TINYINT         NOT NULL,
        ExchangeRate    DECIMAL(18,6)   NOT NULL,
        IsBaseCurrency  BIT             NOT NULL,
        IsActive        BIT             NOT NULL,
        CreatedDate     DATETIME        NULL,
        ModifiedDate    DATETIME        NULL,
        CreatedBy       NVARCHAR(100)   NULL,
        ModifiedBy      NVARCHAR(100)   NULL,
        SortOrder       INT             NULL
    );

    -- 5) Copy every row back, preserving the EXACT original CurrencyId values
    --    (critical — TBL_CUSTOMER/TBL_SUPPLIER/etc. reference these numbers).
    SET IDENTITY_INSERT proj.TBL_CURRENCY ON;

    INSERT INTO proj.TBL_CURRENCY
        (CurrencyId, CurrencyName, ShortName, Symbol, CurrencyFormat, DecimalPlaces,
         ExchangeRate, IsBaseCurrency, IsActive, CreatedDate, ModifiedDate, CreatedBy, ModifiedBy, SortOrder)
    SELECT
        CurrencyId, CurrencyName, ShortName, Symbol, CurrencyFormat, DecimalPlaces,
        ExchangeRate, IsBaseCurrency, IsActive, CreatedDate, ModifiedDate, CreatedBy, ModifiedBy, SortOrder
    FROM proj.TBL_CURRENCY_OLD;

    SET IDENTITY_INSERT proj.TBL_CURRENCY OFF;

    DROP TABLE proj.TBL_CURRENCY_OLD;

    -- 6) Recreate the 5 FKs exactly as captured (dynamic — no hardcoded names).
    DECLARE @addSql NVARCHAR(MAX) = N'';
    SELECT @addSql = @addSql +
        N'ALTER TABLE ' + QUOTENAME(ParentSchema) + N'.' + QUOTENAME(ParentTable) +
        N' ADD CONSTRAINT ' + QUOTENAME(FkName) +
        N' FOREIGN KEY (' + QUOTENAME(ParentColumn) + N')' +
        N' REFERENCES proj.TBL_CURRENCY (' + QUOTENAME(RefColumn) + N')' +
        CASE WHEN OnDelete <> 'NO_ACTION' THEN N' ON DELETE ' + REPLACE(OnDelete, '_', ' ') ELSE N'' END +
        CASE WHEN OnUpdate <> 'NO_ACTION' THEN N' ON UPDATE ' + REPLACE(OnUpdate, '_', ' ') ELSE N'' END +
        N';' + CHAR(10)
    FROM #FkCapture;
    IF LEN(@addSql) > 0 EXEC sp_executesql @addSql;

    DROP TABLE #FkCapture;

    -- 7) Record in the patch ledger.
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_DB_PATCH WHERE PatchNo = 2)
        INSERT proj.TBL_DB_PATCH (PatchNo, FileName, Description)
        VALUES (2, N'0002_currency_identity_fix.sql',
                N'Rebuilt proj.TBL_CURRENCY with CurrencyId as IDENTITY(1,1); preserved existing IDs and the 5 referencing FKs.');

COMMIT;
PRINT 'Patch 2 applied — TBL_CURRENCY rebuilt with IDENTITY, all data and FKs preserved.';
