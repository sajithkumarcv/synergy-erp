-- 2026-10-28f: the job number of a document cannot be changed once the document has lines.
-- Why: on the SYNERPINDIA restore, PR-26-0263 and PR-26-0507 sit under a different job than their BOM lines, and PO-26-0105 and
-- PO-26-0217 sit under a different job than their PR lines. The PR screen leaves "Linked Job" editable with lines on, and
-- sp_SetPR / sp_SetPO save whatever job they are given, so the job was moved after the lines were added.
-- Rule: a job change is refused while the document has active (and, for PR / PO, non-cancelled) lines, with a message that says
-- what to do: remove all the lines first, then change the job number. Re-saving with the SAME job is never blocked.
-- Covers: PR, PO, Issue Note, Issue Request, GRN (job or PO), Stock Receipt (job or PO), Stock Transfer (from / to job).
-- sp_SetPR and sp_SetPO already carry the narrower guard from 2026-10-28b / 28d; this patch replaces it with the general one.
-- Existing data is untouched. Idempotent. All or nothing. Each block is located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @tag NVARCHAR(100) = N'-- 2026-10-28f job lock';
    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, old_tag NVARCHAR(100), old_end NVARCHAR(10), marker NVARCHAR(200), block NVARCHAR(MAX));

    INSERT INTO @work (proc_name, old_tag, old_end, marker, block) VALUES
    (N'sp_SetPR', N'-- 2026-10-28 job change guard', N'END', N'UPDATE proj.TBL_PURCHASE_REQUEST SET', N'
        -- 2026-10-28f job lock
        IF ISNULL((SELECT JobId FROM proj.TBL_PURCHASE_REQUEST WHERE PrId = @PrId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
           AND EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_REQUEST_LINE
                       WHERE PrId = @PrId AND IsActive = 1 AND ISNULL(LineStatus, '''') <> ''Cancelled'')
        BEGIN
            RAISERROR(''You cannot change the job number while this PR has lines. Remove all the PR lines first, then change the job number.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SetPO', N'-- 2026-10-28 job change guard', N';', N'UPDATE PROJ.TBL_PURCHASE_ORDER SET', N'
        -- 2026-10-28f job lock
        IF ISNULL((SELECT JobId FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
           AND EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE
                       WHERE PoId = @PoId AND IsActive = 1 AND ISNULL(LineStatus, '''') <> ''Cancelled'')
            THROW 50510, ''You cannot change the job number while this PO has lines. Remove all the PO lines first, then change the job number.'', 1;

        '),
    (N'sp_SetStockIssue', NULL, NULL, N'UPDATE proj.TBL_STOCK_ISSUE', N'
        -- 2026-10-28f job lock
        IF ISNULL((SELECT JobId FROM proj.TBL_STOCK_ISSUE WHERE IssueId = @IssueId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
           AND EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_LINE WHERE IssueId = @IssueId AND IsActive = 1)
            THROW 50513, ''You cannot change the job number while this Issue Note has lines. Remove all the lines first, then change the job number.'', 1;

        '),
    (N'sp_SetIssueRequest', NULL, NULL, N'UPDATE proj.TBL_STOCK_ISSUE_REQUEST', N'
        -- 2026-10-28f job lock
        IF ISNULL((SELECT JobId FROM proj.TBL_STOCK_ISSUE_REQUEST WHERE RequestId = @RequestId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
           AND EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestId = @RequestId AND IsActive = 1)
        BEGIN
            RAISERROR(''You cannot change the job number while this Issue Request has lines. Remove all the lines first, then change the job number.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SetGRN', NULL, NULL, N'UPDATE proj.TBL_GRN_HEADER SET', N'
        -- 2026-10-28f job lock
        IF EXISTS (SELECT 1 FROM proj.TBL_GRN_HEADER WHERE GrnId = @GrnId
                   AND (ISNULL(JobId, '''') <> ISNULL(NULLIF(@JobId, ''''), '''') OR ISNULL(PoId, 0) <> ISNULL(NULLIF(@PoId, 0), 0)))
           AND EXISTS (SELECT 1 FROM proj.TBL_GRN_DETAIL WHERE GrnId = @GrnId AND IsActive = 1)
        BEGIN
            RAISERROR(''You cannot change the job number or the PO while this GRN has lines. Remove all the GRN lines first, then change it.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SetStockReceipt', NULL, NULL, N'UPDATE proj.TBL_STOCK_RECEIPT', N'
        -- 2026-10-28f job lock
        IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_RECEIPT WHERE ReceiptId = @ReceiptId
                   AND (ISNULL(JobId, '''') <> ISNULL(NULLIF(@JobId, ''''), '''') OR ISNULL(PoId, 0) <> ISNULL(NULLIF(@PoId, 0), 0)))
           AND EXISTS (SELECT 1 FROM proj.TBL_STOCK_RECEIPT_LINE WHERE ReceiptId = @ReceiptId AND IsActive = 1)
        BEGIN
            RAISERROR(''You cannot change the job number or the PO while this receipt has lines. Remove all the lines first, then change it.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SetStockTransfer', NULL, NULL, N'UPDATE proj.TBL_STOCK_TRANSFER', N'
        -- 2026-10-28f job lock
        IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_TRANSFER WHERE TransferId = @TransferId
                   AND (ISNULL(FromJobId, '''') <> ISNULL(@FromJobId, '''') OR ISNULL(ToJobId, '''') <> ISNULL(@ToJobId, '''')))
           AND EXISTS (SELECT 1 FROM proj.TBL_STOCK_TRANSFER_LINE WHERE TransferId = @TransferId AND IsActive = 1)
            THROW 50605, ''You cannot change the job numbers while this transfer has lines. Remove all the lines first, then change them.'', 1;

        ');

    DECLARE @i INT = 1, @n INT = (SELECT COUNT(*) FROM @work);
    DECLARE @proc SYSNAME, @old NVARCHAR(100), @oend NVARCHAR(10), @marker NVARCHAR(200), @block NVARCHAR(MAX);
    DECLARE @def NVARCHAR(MAX), @cpos INT, @s INT, @e INT, @e2 INT, @msg NVARCHAR(400);

    WHILE @i <= @n
    BEGIN
        SELECT @proc = proc_name, @old = old_tag, @oend = old_end, @marker = marker, @block = block FROM @work WHERE seq = @i;
        SET @def = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.' + @proc));
        IF @def IS NULL BEGIN SET @msg = CONCAT('PROJ.', @proc, ' not found.'); THROW 50001, @msg, 1; END

        IF CHARINDEX(@tag, @def) > 0
            PRINT CONCAT(@proc, ': already applied.');
        ELSE
        BEGIN
            -- remove the narrower guard from 2026-10-28b / 28d, if present
            IF @old IS NOT NULL AND CHARINDEX(@old, @def) > 0
            BEGIN
                SET @s = CHARINDEX(@old, @def);
                SET @e = CHARINDEX(N'Remove those lines first.', @def, @s);
                IF @e = 0 BEGIN SET @msg = CONCAT(@proc, ': end of the earlier guard not found.'); THROW 50004, @msg, 1; END
                SET @e2 = CHARINDEX(@oend, @def, @e) + LEN(@oend);
                SET @def = STUFF(@def, @s, @e2 - @s, N'');
            END

            IF (LEN(@def) - LEN(REPLACE(@def, @marker, N''))) / LEN(@marker) <> 1
            BEGIN SET @msg = CONCAT(@proc, ': marker not found exactly once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END

            SET @def = REPLACE(@def, @marker, @block + @marker);
            SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
            IF @cpos = 0 BEGIN SET @msg = CONCAT(@proc, ': CREATE PROCEDURE not found.'); THROW 50003, @msg, 1; END
            SET @def = STUFF(@def, @cpos, 6, N'ALTER');
            EXEC (@def);
            PRINT CONCAT(@proc, ': altered.');
        END
        SET @i += 1;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
