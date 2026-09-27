-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27k  Give the GRN / GRN-unreg / supplier-invoice reports base-currency columns.
--
-- THE PROBLEM. Three report screens print a per-row currency AND a grand total, but total the
-- DOCUMENT-currency amount, so rows in different currencies are added together:
--     GrnReport.js             rows.reduce((s,r) => s + r.totalAmount)
--     GrnUnregReport.js        same
--     SupplierInvoiceReport.js same, for total / paid / balance
-- The SQL behind them could not support a correct total either - sp_ReportGRNs and
-- sp_ReportGRNUnregs return no exchange rate and no base amount at all.
--
-- HOW BIG THIS GETS. Prod has 15 AED purchase orders at rates 24-26. Summing PO TotalAmount
-- without converting shows 213,340,783.90 against a true 390,079,850.62 - about 45% missing.
-- The reports fixed here are not wrong TODAY (all 196 GRNs and both supplier invoices are
-- INR), but GRNs raised against those AED POs will carry AED and the totals will then
-- understate exactly the same way.
--
-- ALSO FIXED HERE: sp_ReportGRNUnregs still read TBL_GRN_HEADER.TotalAmount, which is NULL on
-- every GRN - 2026-09-27e replaced that column with a computed value in sp_SearchGRNs,
-- sp_GetGRN and sp_ReportGRNs but missed this one, so the unregistration report shows a blank
-- amount on every row. It now computes from the lines like the others, excluding GST.
--
-- Amounts stay EXCLUDING GST for the GRN reports (TBL_GRN_DETAIL.LineTotal), matching
-- 2026-09-27e and the rule that GST is recovered and is not a cost. Supplier invoices are a
-- payables document and stay tax-inclusive; only base-currency variants are added there.
--
-- Nothing is removed or renamed - existing columns keep their meaning, so the current
-- frontend is unaffected until it is changed to total the new *Base columns.
--
-- Anchor-checked against the live definitions, all-or-nothing, idempotent. Note the three
-- procedures do not share line endings (sp_ReportGRNs is CRLF, the other two are LF), so the
-- anchors are single-line.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, anchor NVARCHAR(400), replacement NVARCHAR(MAX));

    INSERT INTO @work (proc_name, anchor, replacement) VALUES
        (N'sp_ReportGRNs',
         N'gd.IsActive = 1), 0) AS TotalAmount,',
         N'gd.IsActive = 1), 0) AS TotalAmount,' + CHAR(13) + CHAR(10)
         + N'        ISNULL((SELECT SUM(gd2.LineTotal) FROM proj.TBL_GRN_DETAIL gd2 WHERE gd2.GrnId = g.GrnId AND gd2.IsActive = 1), 0)' + CHAR(13) + CHAR(10)
         + N'            * ISNULL(g.ExchangeRate, 1)  AS TotalAmountBase,' + CHAR(13) + CHAR(10)
         + N'        ISNULL(g.ExchangeRate, 1)        AS ExchangeRate,'),

        (N'sp_ReportGRNUnregs',
         N'g.TotalAmount,',
         N'ISNULL((SELECT SUM(gd.LineTotal) FROM proj.TBL_GRN_DETAIL gd WHERE gd.GrnId = g.GrnId AND gd.IsActive = 1), 0) AS TotalAmount,' + CHAR(10)
         + N'        ISNULL((SELECT SUM(gd2.LineTotal) FROM proj.TBL_GRN_DETAIL gd2 WHERE gd2.GrnId = g.GrnId AND gd2.IsActive = 1), 0)' + CHAR(10)
         + N'            * ISNULL(g.ExchangeRate, 1) AS TotalAmountBase,' + CHAR(10)
         + N'        ISNULL(g.ExchangeRate, 1)       AS ExchangeRate,'),

        (N'sp_ReportSupplierInvoices',
         N'AS BalanceAmount,',
         N'AS BalanceAmount,' + CHAR(10)
         + N'        si.SubTotal    * ISNULL(si.ExchangeRate, 1)                            AS SubTotalBase,' + CHAR(10)
         + N'        si.TaxAmount   * ISNULL(si.ExchangeRate, 1)                            AS TaxAmountBase,' + CHAR(10)
         + N'        si.TotalAmount * ISNULL(si.ExchangeRate, 1)                            AS TotalAmountBase,' + CHAR(10)
         + N'        ISNULL(paid.PaidBase, 0)                                               AS PaidAmountBase,' + CHAR(10)
         + N'        si.TotalAmount * ISNULL(si.ExchangeRate, 1) - ISNULL(paid.PaidBase, 0) AS BalanceAmountBase,');

    DECLARE @nm SYSNAME, @old NVARCHAR(400), @rep NVARCHAR(MAX);
    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX);
    DECLARE @i INT = 1, @n INT, @pos INT, @scan INT;

    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @old = anchor, @rep = replacement FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50140, 'A report procedure was not found. Nothing changed.', 1;

        IF CHARINDEX(N'TotalAmountBase', @def) > 0 OR CHARINDEX(N'BalanceAmountBase', @def) > 0
            PRINT @nm + ' : already patched, left alone.';
        ELSE
        BEGIN
            SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
            IF @n <> 1 THROW 50141, 'Expected exactly 1 anchor. Nothing changed.', 1;

            SET @new = REPLACE(@def, @old, @rep);

            SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @pos = CHARINDEX(N'CREATE', @new, @scan);
                IF @pos = 0 THROW 50142, 'Could not find the CREATE keyword. Nothing changed.', 1;
                IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
                SET @scan = @pos + 6;
            END
            SET @new = STUFF(@new, @pos, 6, N'ALTER ');

            EXEC sp_executesql @new;
            PRINT @nm + ' : patched.';
        END
        SET @i += 1;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── verification ────────────────────────────────────────────────────────────
SELECT o.name,
       CASE WHEN m.definition LIKE '%TotalAmountBase%' THEN 'OK - base column added' ELSE 'NOT PATCHED' END AS result,
       CASE WHEN o.name = 'sp_ReportGRNUnregs'
              THEN CASE WHEN m.definition LIKE '%SUM(gd.LineTotal)%' THEN 'amount now computed' ELSE 'STILL READS THE NULL COLUMN' END
            ELSE '-' END AS unreg_amount,
       m.uses_quoted_identifier AS qi_on
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_ReportGRNs','sp_ReportGRNUnregs','sp_ReportSupplierInvoices')
ORDER BY o.name;
GO
