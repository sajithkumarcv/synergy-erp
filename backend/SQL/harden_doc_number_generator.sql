-- ═══════════════════════════════════════════════════════════════════
-- Harden sp_GetNextDocNumber against stale-counter duplicates
-- Run once against ERPDB.
--
-- Problem: the generator trusted TBL_DOCUMENT_SERIES.CurrentSeries alone.
-- When documents are seeded/migrated without advancing the counter, the
-- next generated number can duplicate an existing one (this is what
-- produced two PR-26-0001 rows).
--
-- Fix: the generator now issues MAX(counter, highest-existing-number) + 1,
-- reading the real maximum from each doctype's own table via a configured
-- SourceTable / SourceNumberColumn mapping. It self-heals stale counters
-- and can never re-issue an existing number. Doctypes with no mapping
-- (MH = date-based scheme, SR = unused) keep the old counter-only behaviour.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Mapping columns on the series config table
IF COL_LENGTH('proj.TBL_DOCUMENT_SERIES', 'SourceTable') IS NULL
    ALTER TABLE proj.TBL_DOCUMENT_SERIES ADD SourceTable NVARCHAR(128) NULL;
GO
IF COL_LENGTH('proj.TBL_DOCUMENT_SERIES', 'SourceNumberColumn') IS NULL
    ALTER TABLE proj.TBL_DOCUMENT_SERIES ADD SourceNumberColumn NVARCHAR(128) NULL;
GO

-- 2. Populate the mapping (doctype -> table.column holding the formatted number)
UPDATE s SET s.SourceTable = m.Tbl, s.SourceNumberColumn = m.Col
FROM proj.TBL_DOCUMENT_SERIES s
JOIN (VALUES
    ('ADJ','TBL_STOCK_ADJUSTMENT',    'AdjustmentNo'),
    ('CN', 'TBL_CREDIT_NOTE',         'CnNumber'),
    ('DBN','TBL_DEBIT_NOTE',          'DnNumber'),
    ('DN', 'TBL_DELIVERY',            'DeliveryNo'),
    ('GRN','TBL_STOCK_RECEIPT',       'ReceiptNo'),
    ('INV','TBL_INVOICE',             'InvoiceNo'),
    ('IRN','TBL_STOCK_ISSUE_RETURN',  'ReturnNo'),
    ('ISN','TBL_STOCK_ISSUE',         'IssueNo'),
    ('PO', 'TBL_PURCHASE_ORDER',      'PoNumber'),
    ('PR', 'TBL_PURCHASE_REQUEST',    'PrNumber'),
    ('PV', 'TBL_PAYMENT_VOUCHER',     'PvNumber'),
    ('RTV','TBL_RETURN_TO_VENDOR',    'RtvNumber'),
    ('RV', 'TBL_RECEIPT_VOUCHER',     'RvNumber'),
    ('SRV','TBL_SRV_HEADER',          'SrvNo')
) m(DocTypeId, Tbl, Col) ON m.DocTypeId = s.DocTypeId;
GO

-- 3. Rewrite the generator with the collision guard
CREATE OR ALTER PROCEDURE [PROJ].[sp_GetNextDocNumber]
    @DocTypeId NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FullYear SMALLINT = YEAR(GETDATE());
    DECLARE @YrDigits TINYINT, @SrcTable NVARCHAR(128), @SrcCol NVARCHAR(128);
    SELECT @YrDigits = YearDigits, @SrcTable = SourceTable, @SrcCol = SourceNumberColumn
    FROM proj.TBL_DOCUMENT_SERIES
    WHERE DocTypeId = @DocTypeId AND IsActive = 1;

    DECLARE @ThisYear SMALLINT =
        CASE WHEN @YrDigits = 4 THEN @FullYear
             ELSE CAST(RIGHT(CAST(@FullYear AS VARCHAR(4)), 2) AS SMALLINT) END;

    DECLARE @result TABLE (
        NewSeries INT, Prefix NVARCHAR(20), Suffix NVARCHAR(20),
        Separator NCHAR(1), IncludeYear BIT, YearDigits TINYINT, PadLength TINYINT);

    -- Atomic increment / yearly reset (unchanged)
    UPDATE proj.TBL_DOCUMENT_SERIES
    SET CurrentYear   = @ThisYear,
        CurrentSeries = CASE
                            WHEN ResetYearly = 1 AND (CurrentYear IS NULL OR CurrentYear <> @ThisYear)
                            THEN StartingSeries
                            ELSE CurrentSeries + 1
                        END
    OUTPUT INSERTED.CurrentSeries, INSERTED.Prefix, INSERTED.Suffix, INSERTED.Separator,
           INSERTED.IncludeYear, INSERTED.YearDigits, INSERTED.PadLength
    INTO @result
    WHERE DocTypeId = @DocTypeId AND IsActive = 1;

    IF NOT EXISTS (SELECT 1 FROM @result)
    BEGIN
        RAISERROR('Document series not found or inactive: %s', 16, 1, @DocTypeId);
        RETURN;
    END

    DECLARE @NewSeries INT, @Prefix NVARCHAR(20), @Suffix NVARCHAR(20),
            @Separator NCHAR(1), @IncYear BIT, @PadLen TINYINT;
    SELECT @NewSeries = NewSeries, @Prefix = Prefix, @Suffix = Suffix,
           @Separator = Separator, @IncYear = IncludeYear, @PadLen = PadLength
    FROM @result;

    DECLARE @YearStr NVARCHAR(4) = CASE WHEN @YrDigits = 4
                                        THEN CAST(@FullYear AS NVARCHAR(4))
                                        ELSE RIGHT(CAST(@FullYear AS NVARCHAR(4)), 2) END;

    -- ── Collision guard: never re-issue an existing number ────────────────
    -- Reads the real highest series for this year from the doctype's table.
    -- Only when a source mapping is configured (MH/SR stay counter-only).
    IF @SrcTable IS NOT NULL AND @SrcCol IS NOT NULL
    BEGIN
        DECLARE @MaxExisting INT = 0;
        DECLARE @sep NCHAR(1) = ISNULL(@Separator, '-');
        DECLARE @pat NVARCHAR(60) = '%' + @sep + @YearStr + @sep + '%';
        DECLARE @sql NVARCHAR(MAX) =
            N'SELECT @m = ISNULL(MAX(TRY_CAST(RIGHT(' + QUOTENAME(@SrcCol) +
            N', CHARINDEX(@sep, REVERSE(' + QUOTENAME(@SrcCol) + N')) - 1) AS INT)), 0)' +
            N' FROM proj.' + QUOTENAME(@SrcTable) +
            N' WHERE ' + QUOTENAME(@SrcCol) + N' LIKE @pat';
        EXEC sp_executesql @sql,
            N'@m INT OUTPUT, @pat NVARCHAR(60), @sep NCHAR(1)',
            @m = @MaxExisting OUTPUT, @pat = @pat, @sep = @sep;

        IF @MaxExisting >= @NewSeries
        BEGIN
            SET @NewSeries = @MaxExisting + 1;
            UPDATE proj.TBL_DOCUMENT_SERIES
            SET CurrentSeries = @NewSeries
            WHERE DocTypeId = @DocTypeId AND IsActive = 1;
        END
    END

    DECLARE @NumStr NVARCHAR(20) = RIGHT(REPLICATE('0', @PadLen) + CAST(@NewSeries AS NVARCHAR(20)), @PadLen);
    DECLARE @DocNumber NVARCHAR(50) =
        ISNULL(@Prefix, '') +
        CASE WHEN @IncYear = 1 THEN ISNULL(@Separator, '-') + @YearStr ELSE '' END +
        ISNULL(@Suffix, '') +
        ISNULL(@Separator, '-') + @NumStr;

    SELECT @DocNumber AS DocNumber, @NewSeries AS NewSeries;
END;
GO
