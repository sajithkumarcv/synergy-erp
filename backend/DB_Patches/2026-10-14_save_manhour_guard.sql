-- 2026-10-14: sp_SaveManhour refuses to re-save an approved / pending batch
--
-- Apply to: SYNERP
--
-- Pressing Update on an approved manhour batch called sp_SaveManhour, which deletes all lines of the batch and
-- re-inserts them as Draft: status went back to Draft, the rates stamped at approval were lost, and the approval
-- record still said Approved (MH-261014-001). The job cost counts only Approved lines, so the hours silently dropped out.
-- Now a re-save of a batch whose lines are Approved / Pending..., or whose approval transaction is Approved / Pending,
-- is refused with a message (the API already turns BatchId = -1 into a 400 with that text).
-- Draft, sent-back and rejected batches can still be edited. Restore script:
-- D:\Projects\_synergy_backups\_REVERT_2026-10-14_save_manhour_guard.sql
-- Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_SaveManhour
    @BatchId          INT           = NULL,
    @DocumentDate     DATE,
    @Remarks          NVARCHAR(500) = NULL,
    @UploadedFileName NVARCHAR(255) = NULL,
    @SavedBy          NVARCHAR(50),
    @Lines            NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IsNew      BIT = CASE WHEN @BatchId IS NULL OR @BatchId = 0 THEN 1 ELSE 0 END;
        DECLARE @DocNo      NVARCHAR(30);
        DECLARE @NewBatchId INT;

        -- ── Parse lines into temp table ───────────────────────────────────────
        SELECT
            j.JobId, j.EmployeeId, j.Hours, j.OvertimeHours,
            ISNULL(NULLIF(j.Site, ''),  'N') AS Site,
            ISNULL(NULLIF(j.MType,''),  'M') AS MType,
            j.Remarks                        AS LineRemarks
        INTO #Lines
        FROM OPENJSON(@Lines)
        WITH (
            JobId         NVARCHAR(50)  '$.jobId',
            EmployeeId    INT           '$.employeeId',
            Hours         DECIMAL(6,2)  '$.hours',
            OvertimeHours DECIMAL(6,2)  '$.overtimeHours',
            Site          NVARCHAR(100) '$.site',
            MType         NVARCHAR(50)  '$.mType',
            Remarks       NVARCHAR(500) '$.remarks'
        ) j;

        -- ── Job status check: block closed jobs ───────────────────────────────
        DECLARE @ClosedJobs NVARCHAR(MAX);
        SELECT @ClosedJobs = STRING_AGG(x.Entry, ', ')
        FROM (
            SELECT DISTINCT l.JobId + ' (' + js.StatusName + ')' AS Entry
            FROM #Lines l
            JOIN proj.TBL_JOB        jb ON jb.JobId      = l.JobId
            JOIN proj.TBL_JOB_STATUS js ON js.JobStatusId = jb.JobStatusId
            WHERE js.IsClosed = 1
        ) x;

        IF @ClosedJobs IS NOT NULL
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT -1 AS BatchId,
                   CAST(NULL AS NVARCHAR(30))  AS DocumentNo,
                   CAST(NULL AS NVARCHAR(20))  AS Status,
                   'Cannot upload manhour for closed job(s): ' + @ClosedJobs AS ErrorMessage;
            RETURN;
        END;

        -- ── Budget-approved check ─────────────────────────────────────────────
        DECLARE @UnapprovedJobs NVARCHAR(MAX);
        SELECT @UnapprovedJobs = STRING_AGG(x.Entry, ', ')
        FROM (
            SELECT DISTINCT l.JobId + ' (' + proj.fn_GetJobBudgetState(l.JobId) + ')' AS Entry
            FROM #Lines l
            WHERE proj.fn_GetJobBudgetState(l.JobId) <> N'APPROVED'
        ) x;

        IF @UnapprovedJobs IS NOT NULL
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT -1 AS BatchId,
                   CAST(NULL AS NVARCHAR(30)) AS DocumentNo,
                   CAST(NULL AS NVARCHAR(20)) AS Status,
                   'Cannot upload manhour — these job(s) have no approved budget: ' + @UnapprovedJobs AS ErrorMessage;
            RETURN;
        END;

        -- ── Cross-batch duplicate check: same job + employee + date in another active batch ──
        DECLARE @Duplicates NVARCHAR(MAX);
        SELECT @Duplicates = STRING_AGG(x.Entry, ', ')
        FROM (
            SELECT DISTINCT
                l.JobId + '/' + e.EmpCode
                + ' (already in ' + existing.DocumentNo + ')' AS Entry
            FROM #Lines l
            JOIN proj.TBL_EMPLOYEE e ON e.EmployeeId = l.EmployeeId
            JOIN proj.TBL_MANHOUR existing
                ON  existing.JobId       = l.JobId
                AND existing.EmployeeId  = l.EmployeeId
                AND existing.DocumentDate= @DocumentDate
                AND existing.IsActive    = 1
                AND existing.Status     NOT IN ('Cancelled')
                AND (@IsNew = 1 OR existing.BatchId <> @BatchId)
        ) x;

        IF @Duplicates IS NOT NULL
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT -1 AS BatchId,
                   CAST(NULL AS NVARCHAR(30)) AS DocumentNo,
                   CAST(NULL AS NVARCHAR(20)) AS Status,
                   'Duplicate entries — these job/employee combinations already exist for '
                   + CAST(@DocumentDate AS NVARCHAR(20)) + ': ' + @Duplicates AS ErrorMessage;
            RETURN;
        END;

        -- ── Assign BatchId / DocNo ────────────────────────────────────────────
        IF @IsNew = 1
        BEGIN
            SET @NewBatchId = NEXT VALUE FOR proj.SEQ_MANHOUR_BATCH;
            -- Document number from the MH document series (date-based: MH-yyMMdd-NNN)
            DECLARE @GenNo TABLE (DocumentNo NVARCHAR(30));
            INSERT INTO @GenNo EXEC proj.sp_GenerateMHNo;
            SELECT @DocNo = DocumentNo FROM @GenNo;
        END
        ELSE
        BEGIN
            -- 2026-10-14: an approved batch (or one waiting for approval) must not be re-saved. Re-saving deletes every
            -- line and re-inserts them as Draft, which wipes the stamped rates and leaves the approval record Approved
            -- while the lines read Draft (MH-261014-001). Corrections after approval go through Manhour Admin.
            IF EXISTS (SELECT 1 FROM proj.TBL_MANHOUR WHERE BatchId = @BatchId AND IsActive = 1
                         AND (Status = 'Approved' OR Status LIKE 'Pending%'))
               OR EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_TRANSACTION atx
                          JOIN proj.TBL_APPROVAL_MODULE am ON am.ModuleId = atx.ModuleId
                          WHERE am.ModuleCode = 'MH' AND atx.DocumentId = @BatchId
                            AND atx.CurrentStatus IN ('Approved', 'Pending'))
            BEGIN
                ROLLBACK TRANSACTION;
                SELECT -1 AS BatchId,
                       CAST(NULL AS NVARCHAR(30)) AS DocumentNo,
                       CAST(NULL AS NVARCHAR(20)) AS Status,
                       'This manhour batch is approved or waiting for approval and cannot be changed. Use Manhour Admin to correct a line.' AS ErrorMessage;
                RETURN;
            END;

            SET @NewBatchId = @BatchId;
            SELECT TOP 1 @DocNo = DocumentNo
            FROM proj.TBL_MANHOUR
            WHERE BatchId = @BatchId AND IsActive = 1;
            DELETE FROM proj.TBL_MANHOUR WHERE BatchId = @BatchId;
        END

        -- ── Insert lines ──────────────────────────────────────────────────────
        INSERT INTO proj.TBL_MANHOUR
            (BatchId, DocumentNo, DocumentDate, JobId, EmployeeId,
             Hours, OvertimeHours, Site, MType, Remarks, Status,
             UploadedFileName, IsActive, CreatedBy, CreatedDate)
        SELECT
            @NewBatchId, @DocNo, @DocumentDate,
            l.JobId, l.EmployeeId, l.Hours, l.OvertimeHours,
            l.Site, l.MType,
            COALESCE(l.LineRemarks, @Remarks),
            'Draft', @UploadedFileName, 1, @SavedBy, GETDATE()
        FROM #Lines l;

        -- ── Patch batch-level remarks / audit on re-save ──────────────────────
        UPDATE proj.TBL_MANHOUR
        SET Remarks      = COALESCE(Remarks, @Remarks),
            ModifiedBy   = CASE WHEN @IsNew = 0 THEN @SavedBy  ELSE NULL END,
            ModifiedDate = CASE WHEN @IsNew = 0 THEN GETDATE() ELSE NULL END
        WHERE BatchId = @NewBatchId;

        COMMIT TRANSACTION;
        SELECT @NewBatchId AS BatchId, @DocNo AS DocumentNo,
               'Draft'    AS Status,  CAST(NULL AS NVARCHAR(MAX)) AS ErrorMessage;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
