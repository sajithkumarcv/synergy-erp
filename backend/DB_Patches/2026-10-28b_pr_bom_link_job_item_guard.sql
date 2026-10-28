-- 2026-10-28b: a PR line must be linked to a BOM line of the SAME job and the SAME item.
-- Found on the SYNERPINDIA restore:
--   * 11 PR lines are linked to a BOM line of another job: PR-26-0263 (IH26-500005, 10 lines, BOM of EC26-300002) and
--     PR-26-0507 (IH26-500010, 1 line, BOM of BT26-600001). Both PRs have a revision history: sp_SetPR's UPDATE accepts a new
--     JobId whatever lines the PR already holds, so the job was changed after the lines were linked.
--   * 4 PR lines carry a different item from their BOM line (PR-26-0052/53/54/78). The item is not a substitute
--     (IsSubstituteAllowed = 0 on all four).
-- Fix, in two places, existing data untouched:
--   sp_SetPR      refuses a CHANGE of job while an active, non-cancelled line is linked to a BOM line of a different job.
--   sp_SetPRLine  on a NEW link (new line, or BomDetailId / ItemId changed) refuses a BOM line of another job, and refuses an
--                 item different from the BOM item unless the BOM line allows substitutes. Re-saving an already-linked line
--                 with the same link is never blocked, so the 11 + 4 legacy lines stay editable.
-- Idempotent. All or nothing. Each block is located by an ASCII marker that must occur exactly once.
-- sp_SetPRLine must already carry the 2026-10-28 cancelled/closed guard (the new block goes in after it).
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
    (N'sp_SetPRLine', N'-- 2026-10-28 BOM link job/item guard', N'DECLARE @PrStatus NVARCHAR(30);', N'
    -- 2026-10-28 BOM link job/item guard
    IF NULLIF(@BomDetailId, 0) IS NOT NULL
    BEGIN
        DECLARE @LkOldBom INT = NULL, @LkOldItem INT = NULL;
        IF @PrLineId IS NOT NULL AND @PrLineId > 0
            SELECT @LkOldBom = BomDetailId, @LkOldItem = ItemId
            FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId;

        IF @PrLineId IS NULL OR @PrLineId <= 0
           OR ISNULL(@LkOldBom, 0) <> @BomDetailId
           OR ISNULL(@LkOldItem, 0) <> ISNULL(@ItemId, 0)
        BEGIN
            DECLARE @LkBomJob NVARCHAR(50), @LkBomItem INT, @LkSub BIT, @LkPrJob NVARCHAR(50);
            SELECT @LkBomJob = JobId, @LkBomItem = ItemId, @LkSub = IsSubstituteAllowed
            FROM PROJ.TBL_BOM_DETAILS WHERE BomId = @BomDetailId;
            SELECT @LkPrJob = JobId FROM PROJ.TBL_PURCHASE_REQUEST WHERE PrId = @PrId;

            IF @LkBomJob IS NOT NULL AND @LkPrJob IS NOT NULL AND @LkBomJob <> @LkPrJob
            BEGIN
                RAISERROR(''This BOM line belongs to another job and cannot be requested on this PR.'', 16, 1);
                RETURN;
            END
            IF @LkBomItem IS NOT NULL AND NULLIF(@ItemId, 0) IS NOT NULL AND @LkBomItem <> @ItemId AND ISNULL(@LkSub, 0) = 0
            BEGIN
                RAISERROR(''The item does not match the BOM line item, and this BOM line does not allow substitutes.'', 16, 1);
                RETURN;
            END
        END
    END

    '),
    (N'sp_SetPR', N'-- 2026-10-28 job change guard', N'UPDATE proj.TBL_PURCHASE_REQUEST SET', N'
        -- 2026-10-28 job change guard
        IF NULLIF(@JobId, '''') IS NOT NULL
           AND EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_REQUEST WHERE PrId = @PrId AND ISNULL(JobId, '''') <> @JobId)
           AND EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_REQUEST_LINE prl
                       JOIN proj.TBL_BOM_DETAILS b ON b.BomId = prl.BomDetailId
                       WHERE prl.PrId = @PrId AND prl.IsActive = 1 AND ISNULL(prl.LineStatus, '''') <> ''Cancelled''
                         AND b.JobId <> @JobId)
        BEGIN
            RAISERROR(''The job cannot be changed: this PR has lines linked to BOM lines of its current job. Remove those lines first.'', 16, 1);
            RETURN;
        END

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
