-- =====================================================================
-- 2026-09-19d  Approval amounts had no currency code
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- PROBLEM: TBL_APPROVAL_TRANSACTION.DocumentAmount is the DOCUMENT's own
-- currency (a 100 AED PO is stored as 100, not 2,500), and My Approvals,
-- Approvals Admin, the dashboard list and the notification bell showed it as a
-- bare number. On 2026-09-14 the wrong "AED" prefix was removed for exactly that
-- reason; this puts the CORRECT code back.
--
-- WHY NOT JUST READ THE STORED CurrencyId: 33 of the 41 approval transactions on
-- dev have CurrencyId NULL (the column is only filled when the caller passes it).
-- So the currency is derived from the document itself.
--
-- WHAT THIS SCRIPT DOES (read side only - nothing stored changes)
--  1. proj.fn_ApprovalDocCurrency(@ModuleId, @DocumentId) -> currency short name
--     ('INR', 'AED', ...) of the document: PO, INV, PV, RV, CN, DN from their own
--     CurrencyId; JOB from JobCurrencyId; falls back to the transaction's stored
--     CurrencyId. NULL for modules with no currency of their own (PR, BOM,
--     stock adjustment, issue return, ...): those amounts stay unlabelled rather
--     than carrying a guessed code.
--  2. Adds a CurrencyCode column to the result of sp_GetMyApprovals,
--     sp_GetAllApprovals, sp_GetApprovalStatus, sp_GetApprovalHistory and
--     sp_GetDashboard (its pending-approvals list), right after DocumentAmount.
--
-- HOW: surgical, anchor-checked ALTERs from each procedure's LIVE definition; if an
-- anchor is not found the expected number of times the script STOPS. Idempotent
-- (a proc that already calls fn_ApprovalDocCurrency is skipped).
-- Pre-flight lengths on dev before this script: sp_GetMyApprovals 11024,
-- sp_GetAllApprovals 5577, sp_GetApprovalStatus 5959, sp_GetApprovalHistory 2132,
-- sp_GetDashboard 6675 (after 2026-09-14d).
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER FUNCTION proj.fn_ApprovalDocCurrency (@ModuleId INT, @DocumentId INT)
RETURNS NVARCHAR(10)
AS
BEGIN
    DECLARE @code NVARCHAR(20) = (SELECT ModuleCode FROM proj.TBL_APPROVAL_MODULE WHERE ModuleId = @ModuleId);
    DECLARE @cid  INT = CASE @code
        WHEN 'PO'  THEN (SELECT CurrencyId    FROM proj.TBL_PURCHASE_ORDER WHERE PoId       = @DocumentId)
        WHEN 'INV' THEN (SELECT CurrencyId    FROM proj.TBL_INVOICE        WHERE InvoiceId  = @DocumentId)
        WHEN 'PV'  THEN (SELECT CurrencyId    FROM proj.TBL_PAYMENT_VOUCHER WHERE PvId      = @DocumentId)
        WHEN 'RV'  THEN (SELECT CurrencyId    FROM proj.TBL_RECEIPT_VOUCHER WHERE RvId      = @DocumentId)
        WHEN 'CN'  THEN (SELECT CurrencyId    FROM proj.TBL_CREDIT_NOTE    WHERE CnId       = @DocumentId)
        WHEN 'DN'  THEN (SELECT CurrencyId    FROM proj.TBL_DEBIT_NOTE     WHERE DnId       = @DocumentId)
        WHEN 'JOB' THEN (SELECT JobCurrencyId FROM proj.TBL_JOB            WHERE JobNumId   = @DocumentId)
    END;
    IF @cid IS NULL
        SET @cid = (SELECT TOP 1 CurrencyId FROM proj.TBL_APPROVAL_TRANSACTION
                    WHERE ModuleId = @ModuleId AND DocumentId = @DocumentId);
    RETURN (SELECT ShortName FROM proj.TBL_CURRENCY WHERE CurrencyId = @cid);
END
GO

DECLARE @cur NVARCHAR(200) = N'proj.fn_ApprovalDocCurrency(t.ModuleId, t.DocumentId) AS CurrencyCode';
DECLARE @P TABLE (id INT IDENTITY(1,1), proc_ SYSNAME, anchor NVARCHAR(400), repl NVARCHAR(MAX), expected INT);
INSERT @P (proc_, anchor, repl, expected) VALUES
 (N'proj.sp_GetMyApprovals',     N't.DocumentNo, t.DocumentAmount,', N't.DocumentNo, t.DocumentAmount, ' + @cur + N',', 1),
 (N'proj.sp_GetMyApprovals',     N'p.DocumentNo, p.DocumentAmount,', N'p.DocumentNo, p.DocumentAmount, p.CurrencyCode,', 1),
 (N'proj.sp_GetAllApprovals',    N't.DocumentAmount,',               N't.DocumentAmount, ' + @cur + N',', 1),
 (N'proj.sp_GetApprovalStatus',  N't.DocumentAmount,',               N't.DocumentAmount, ' + @cur + N',', 1),
 (N'proj.sp_GetApprovalHistory', N't.DocumentAmount,',               N't.DocumentAmount, ' + @cur + N',', 1),
 (N'proj.sp_GetDashboard',       N't.DocumentAmount, t.SubmittedDate,', N't.DocumentAmount, ' + @cur + N', t.SubmittedDate,', 1);

DECLARE @proc SYSNAME, @def NVARCHAR(MAX), @anchor NVARCHAR(400), @repl NVARCHAR(MAX), @expected INT, @found INT, @createPos INT;
DECLARE pc CURSOR LOCAL FAST_FORWARD FOR SELECT DISTINCT proc_ FROM @P;
OPEN pc; FETCH NEXT FROM pc INTO @proc;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @def = OBJECT_DEFINITION(OBJECT_ID(@proc));
    IF @def IS NULL
    BEGIN
        DECLARE @m1 NVARCHAR(200) = @proc + N' not found.';
        THROW 51000, @m1, 1;
    END

    IF CHARINDEX(N'fn_ApprovalDocCurrency', @def) > 0
        PRINT @proc + ' already patched - nothing to do.';
    ELSE
    BEGIN
        DECLARE ac CURSOR LOCAL FAST_FORWARD FOR SELECT anchor, repl, expected FROM @P WHERE proc_ = @proc ORDER BY id;
        OPEN ac; FETCH NEXT FROM ac INTO @anchor, @repl, @expected;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @found = (LEN(@def) - LEN(REPLACE(@def, @anchor, N''))) / LEN(@anchor);
            IF @found <> @expected
            BEGIN
                DECLARE @m2 NVARCHAR(400) = @proc + N': expected ' + CAST(@expected AS NVARCHAR(5)) + N' x [' + @anchor
                                          + N'] but found ' + CAST(@found AS NVARCHAR(5)) + N'. Inspect the procedure and patch by hand.';
                THROW 51001, @m2, 1;
            END
            SET @def = REPLACE(@def, @anchor, @repl);
            FETCH NEXT FROM ac INTO @anchor, @repl, @expected;
        END
        CLOSE ac; DEALLOCATE ac;

        SET @createPos = PATINDEX(N'%CREATE[ ]%PROCEDURE%', @def);
        IF @createPos = 0
        BEGIN
            DECLARE @m3 NVARCHAR(200) = N'CREATE PROCEDURE header not found in ' + @proc;
            THROW 51002, @m3, 1;
        END
        SET @def = STUFF(@def, @createPos, LEN(N'CREATE'), N'ALTER');
        EXEC sp_executesql @def;
        PRINT @proc + ' patched.';
    END
    FETCH NEXT FROM pc INTO @proc;
END
CLOSE pc; DEALLOCATE pc;
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item = 'fn_ApprovalDocCurrency', Status = CASE WHEN OBJECT_ID('proj.fn_ApprovalDocCurrency') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_GetMyApprovals',     CASE WHEN CHARINDEX('fn_ApprovalDocCurrency', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetMyApprovals')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_GetAllApprovals',    CASE WHEN CHARINDEX('fn_ApprovalDocCurrency', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetAllApprovals')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_GetApprovalStatus',  CASE WHEN CHARINDEX('fn_ApprovalDocCurrency', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetApprovalStatus')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_GetApprovalHistory', CASE WHEN CHARINDEX('fn_ApprovalDocCurrency', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetApprovalHistory')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_GetDashboard',       CASE WHEN CHARINDEX('fn_ApprovalDocCurrency', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetDashboard')), '')) > 0 THEN 'OK' ELSE 'MISSING' END;
GO
