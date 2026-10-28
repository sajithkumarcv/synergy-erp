-- 2026-10-28d: a PO line must come from a PR of the PO's own job, and a PO's job cannot be moved away from its PR lines.
-- Found on the SYNERPINDIA restore: PO-26-0105 (job IH26-500009) holds a line from PR-26-0111 (IH26-500002), and the Approved
-- PO-26-0217 (EC26-300002) holds a line from PR-26-0277 (IH26-500002). sp_SetPO's UPDATE changes JobId with no look at the lines,
-- and sp_SetPOLine never compares the PR line's job to the PO's job, so the spend sits on a different job from the request.
-- Fix:
--   sp_SetPO      refuses a CHANGE of job while an active line comes from a PR of a different job.
--   sp_SetPOLine  on a NEW link (new line, or PrLineId changed) refuses a PR line of another job. Re-saving an existing
--                 line with the same PR link is never blocked, so the 2 legacy lines stay editable.
-- Existing data untouched.
-- Idempotent. All or nothing. Each block is located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, tag NVARCHAR(100), marker NVARCHAR(200), block NVARCHAR(MAX));

    INSERT INTO @work (proc_name, tag, marker, block) VALUES
    (N'sp_SetPOLine', N'-- 2026-10-28 PR job guard', N'DECLARE @LineJobId      NVARCHAR(50);', N'
    -- 2026-10-28 PR job guard
    IF @PrLineId IS NOT NULL AND @PrLineId > 0
       AND (@PoLineId IS NULL OR @PoLineId <= 0
            OR NOT EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @PoLineId AND PrLineId = @PrLineId))
    BEGIN
        IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
                   JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
                   WHERE prl.PrLineId = @PrLineId AND pr.JobId <> @ParentJobId)
        BEGIN
            RAISERROR(''This PR line belongs to a PR of another job and cannot be ordered on this PO.'', 16, 1);
            RETURN;
        END
    END

    '),
    (N'sp_SetPO', N'-- 2026-10-28 job change guard', N'UPDATE PROJ.TBL_PURCHASE_ORDER SET', N'
        -- 2026-10-28 job change guard
        IF NULLIF(@JobId, '''') IS NOT NULL
           AND EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId AND ISNULL(JobId, '''') <> @JobId)
           AND EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                       JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId
                       JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
                       WHERE pol.PoId = @PoId AND pol.IsActive = 1 AND pr.JobId <> @JobId)
            THROW 50510, ''The job cannot be changed: this PO has lines that come from PRs of its current job. Remove those lines first.'', 1;

        ');

    DECLARE @i INT = 1, @n INT = (SELECT COUNT(*) FROM @work);
    DECLARE @proc SYSNAME, @tag NVARCHAR(100), @marker NVARCHAR(200), @block NVARCHAR(MAX), @def NVARCHAR(MAX), @cpos INT, @msg NVARCHAR(400);

    WHILE @i <= @n
    BEGIN
        SELECT @proc = proc_name, @tag = tag, @marker = marker, @block = block FROM @work WHERE seq = @i;
        SET @def = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.' + @proc));
        IF @def IS NULL BEGIN SET @msg = CONCAT('PROJ.', @proc, ' not found.'); THROW 50001, @msg, 1; END

        IF CHARINDEX(@tag, @def) > 0
            PRINT CONCAT(@proc, ': already applied.');
        ELSE
        BEGIN
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
