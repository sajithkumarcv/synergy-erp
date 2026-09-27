-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27l  A tolerance percentage on the PO budget guard.
--
-- WHY. Reported by the client (video, 26 Sep 17:03) doing a bulk approve on My Approvals:
--     1 approved, 1 failed - PO-26-0342: Cannot approve: PO would exceed the budget for this
--     expense category. 2,058,560.00 | Over by: 4,885.48
-- Steel Materials on EC26-300003: budget 22,292,220.00, already committed 20,238,545.48.
-- The overage is 4,885.48 - 0.022% of the budget - and there is no tolerance at all, so the
-- approval is refused outright.
--
-- Note this is NOT the "budget is free but it blocks" case. That committed figure includes
-- PO-26-0209 (3,425,976.96), which is itself still PendingApproval, so the budget genuinely
-- is spoken for - just by a PO nobody has approved yet. Counting submitted POs is deliberate:
-- without it, two POs could each pass the check and together blow the budget. What is missing
-- is any allowance for a rounding-scale overage.
--
-- (The commoner version of the same complaint - Draft POs eating the budget - is fixed
--  separately by the draft guard change; five categories on prod are blocked that way.)
--
-- WHAT THIS DOES. New setting Biz.PoBudget.TolerancePct, DEFAULT '0', so behaviour is
-- unchanged until someone sets it. Both guards compare against budget * (1 + tolerance/100)
-- instead of the bare budget, and the refusal message states the allowance when one is in
-- force, so nobody has to guess why a number was accepted.
--     0     -> exactly today's behaviour
--     0.1   -> absorbs 22,292.22 on a 22.29M budget; the 4,885.48 case passes
-- @OverrideBudget still bypasses the check entirely, as before.
--
-- Set it per company with, for example:
--     UPDATE PROJ.TBL_APP_SETTINGS SET SettingValue = '0.1'
--     WHERE SettingKey = 'Biz.PoBudget.TolerancePct';
--
-- Anchor-checked against the live definitions, all-or-nothing, idempotent.
-- Requires the Draft-PO guard change to have been applied first (both patches edit the same
-- two procedures, and this one anchors on text they share either way).
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- ── Part 1: the setting ─────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_APP_SETTINGS WHERE SettingKey = N'Biz.PoBudget.TolerancePct')
BEGIN
    INSERT INTO PROJ.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES (N'Biz.PoBudget.TolerancePct', N'0',
            N'Percent a PO may exceed its expense category budget by before submit/approve is refused. 0 = no tolerance (default).',
            N'PATCH-2026-09-27', GETDATE());
    PRINT 'setting Biz.PoBudget.TolerancePct created with value 0.';
END
ELSE
    PRINT 'setting Biz.PoBudget.TolerancePct already exists, left alone.';
GO

-- ── Part 2: both guards honour it ───────────────────────────────────────────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, anchor NVARCHAR(400), replacement NVARCHAR(MAX));

    INSERT INTO @work (proc_name, anchor, replacement) VALUES
        (N'sp_ProcessApproval',
         N'IF (@ApCommitted + @ApPoTotalBase) > @ApBudgeted AND @OverrideBudget = 0',
         N'DECLARE @ApTolPct DECIMAL(18,4) = ISNULL(TRY_CAST((SELECT SettingValue FROM PROJ.TBL_APP_SETTINGS' + CHAR(13) + CHAR(10)
         + N'                    WHERE SettingKey = N''Biz.PoBudget.TolerancePct'') AS DECIMAL(18,4)), 0);' + CHAR(13) + CHAR(10)
         + N'                DECLARE @ApAllowed DECIMAL(18,2) = @ApBudgeted * (1 + @ApTolPct / 100.0);' + CHAR(13) + CHAR(10)
         + N'                IF (@ApCommitted + @ApPoTotalBase) > @ApAllowed AND @OverrideBudget = 0'),

        (N'sp_SubmitForApproval',
         N'IF (@SubCommitted + @PoTotalBase) > @SubBudgeted AND @OverrideBudget = 0',
         N'DECLARE @SubTolPct DECIMAL(18,4) = ISNULL(TRY_CAST((SELECT SettingValue FROM PROJ.TBL_APP_SETTINGS' + CHAR(13) + CHAR(10)
         + N'                    WHERE SettingKey = N''Biz.PoBudget.TolerancePct'') AS DECIMAL(18,4)), 0);' + CHAR(13) + CHAR(10)
         + N'                DECLARE @SubAllowed DECIMAL(18,2) = @SubBudgeted * (1 + @SubTolPct / 100.0);' + CHAR(13) + CHAR(10)
         + N'                IF (@SubCommitted + @PoTotalBase) > @SubAllowed AND @OverrideBudget = 0');

    DECLARE @nm SYSNAME, @old NVARCHAR(400), @rep NVARCHAR(MAX);
    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX);
    DECLARE @i INT = 1, @n INT, @pos INT, @scan INT;

    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @old = anchor, @rep = replacement FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50150, 'A guard procedure was not found. Nothing changed.', 1;

        IF CHARINDEX(N'Biz.PoBudget.TolerancePct', @def) > 0
            PRINT @nm + ' : already patched, left alone.';
        ELSE
        BEGIN
            SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
            IF @n = 0
            BEGIN
                SET @rep = REPLACE(@rep, CHAR(13) + CHAR(10), CHAR(10));
                SET @n   = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
            END
            IF @n <> 1 THROW 50151, 'Expected exactly 1 anchor. Nothing changed.', 1;

            SET @new = REPLACE(@def, @old, @rep);

            SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @pos = CHARINDEX(N'CREATE', @new, @scan);
                IF @pos = 0 THROW 50152, 'Could not find the CREATE keyword. Nothing changed.', 1;
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

-- ── Part 3: say so in the refusal message when a tolerance is in force ─────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @d NVARCHAR(MAX), @w NVARCHAR(MAX), @a NVARCHAR(400), @r NVARCHAR(MAX);
    DECLARE @k INT, @q INT, @sc INT;

    -- approve side
    SET @d = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_ProcessApproval'));
    SET @a = N'+ '' | Over by: '' + FORMAT(@ApCommitted+@ApPoTotalBase-@ApBudgeted,''N2'')';
    SET @r = N'+ '' | Over by: '' + FORMAT(@ApCommitted+@ApPoTotalBase-@ApAllowed,''N2'')'
           + N' + CASE WHEN @ApTolPct > 0 THEN '' | Tolerance: '' + FORMAT(@ApTolPct,''N2'') + ''%'' ELSE '''' END';
    SET @k = (DATALENGTH(@d) - DATALENGTH(REPLACE(@d, @a, N''))) / DATALENGTH(@a);
    IF @k = 1 AND CHARINDEX(N'@ApAllowed,''N2''', @d) = 0
    BEGIN
        SET @w = REPLACE(@d, @a, @r);
        SET @sc = 1;
        WHILE 1 = 1
        BEGIN
            SET @q = CHARINDEX(N'CREATE', @w, @sc);
            IF @q = 0 THROW 50153, 'Could not find CREATE. Nothing changed.', 1;
            IF SUBSTRING(@w, @q + 6, 40) LIKE N'%PROC%' BREAK;
            SET @sc = @q + 6;
        END
        SET @w = STUFF(@w, @q, 6, N'ALTER ');
        EXEC sp_executesql @w;
        PRINT 'sp_ProcessApproval : message updated.';
    END
    ELSE PRINT 'sp_ProcessApproval : message already updated or anchor not found, left alone.';

    -- submit side
    SET @d = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_SubmitForApproval'));
    SET @a = N'+ '' | Over by: '' + FORMAT(@SubCommitted+@PoTotalBase-@SubBudgeted,''N2'')';
    SET @r = N'+ '' | Over by: '' + FORMAT(@SubCommitted+@PoTotalBase-@SubAllowed,''N2'')'
           + N' + CASE WHEN @SubTolPct > 0 THEN '' | Tolerance: '' + FORMAT(@SubTolPct,''N2'') + ''%'' ELSE '''' END';
    SET @k = (DATALENGTH(@d) - DATALENGTH(REPLACE(@d, @a, N''))) / DATALENGTH(@a);
    IF @k = 1 AND CHARINDEX(N'@SubAllowed,''N2''', @d) = 0
    BEGIN
        SET @w = REPLACE(@d, @a, @r);
        SET @sc = 1;
        WHILE 1 = 1
        BEGIN
            SET @q = CHARINDEX(N'CREATE', @w, @sc);
            IF @q = 0 THROW 50154, 'Could not find CREATE. Nothing changed.', 1;
            IF SUBSTRING(@w, @q + 6, 40) LIKE N'%PROC%' BREAK;
            SET @sc = @q + 6;
        END
        SET @w = STUFF(@w, @q, 6, N'ALTER ');
        EXEC sp_executesql @w;
        PRINT 'sp_SubmitForApproval : message updated.';
    END
    ELSE PRINT 'sp_SubmitForApproval : message already updated or anchor not found, left alone.';

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED on the message update - nothing changed in this part:';
    THROW;
END CATCH
GO

-- ── verification ────────────────────────────────────────────────────────────
SELECT SettingKey, SettingValue FROM PROJ.TBL_APP_SETTINGS WHERE SettingKey = N'Biz.PoBudget.TolerancePct';

SELECT o.name,
       CASE WHEN m.definition LIKE '%Biz.PoBudget.TolerancePct%' THEN 'OK - tolerance honoured' ELSE 'NOT PATCHED' END AS result,
       CASE WHEN m.definition LIKE '%Tolerance: %' THEN 'message updated' ELSE 'message unchanged' END AS msg,
       m.uses_quoted_identifier AS qi_on
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_ProcessApproval','sp_SubmitForApproval')
ORDER BY o.name;
GO
