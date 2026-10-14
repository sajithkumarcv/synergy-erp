-- 2026-10-14b: manhour approval and Manhour Admin line edit budget against the right things
--
-- Apply to: SYNERP
--
-- 1. sp_ApproveManhour: the budget ceiling check joined the budget on IsCurrent = 1 AND IsApproved = 1. A revision
--    awaiting approval is IsCurrent but not approved and the previous revision is no longer current, so the join found
--    no row and the check silently did nothing. It now budgets against the latest APPROVED revision (same rule as the
--    PO checks).
-- 2. sp_AdminUpdateManhourLine: editing an APPROVED line now re-applies the rate (job rate, then job-type rate, then
--    default) and re-runs the zero-rate and budget-ceiling checks for that job and category inside one transaction.
--    Before, the rate stayed the old job's rate and the job could be pushed over budget with no check. Blocking
--    messages reach the screen (the controller returns the SQL message). Draft / pending lines are unchanged.
-- Restore script: D:\Projects\_synergy_backups\_REVERT_2026-10-14b_manhour_budget_checks.sql
-- Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_ApproveManhour
    @BatchId        INT,
    @ApprovedBy     NVARCHAR(100),
    @OverrideBudget BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        -- ── Step 1: Resolve rates (3-level fallback) ─────────────────────────
        UPDATE m SET
            m.NHRate       = ISNULL(r1.NHRate, ISNULL(r2.NHRate, ISNULL(r3.NHRate, 0))),
            m.OTRate       = ISNULL(r1.OTRate, ISNULL(r2.OTRate, ISNULL(r3.OTRate, 0))),
            m.Status       = 'Approved',
            m.ModifiedBy   = @ApprovedBy,
            m.ModifiedDate = GETDATE()
        FROM proj.TBL_MANHOUR m
        JOIN proj.TBL_JOB j ON j.JobId = m.JobId
        OUTER APPLY (
            SELECT TOP 1 NHRate, OTRate FROM proj.TBL_MANHOUR_RATE
            WHERE IsActive = 1 AND JobId = m.JobId
              AND m.DocumentDate BETWEEN EffectiveFrom AND EffectiveTo
        ) r1
        OUTER APPLY (
            SELECT TOP 1 NHRate, OTRate FROM proj.TBL_MANHOUR_RATE
            WHERE IsActive = 1 AND JobTypeId = j.JobTypeId AND JobId IS NULL
              AND m.DocumentDate BETWEEN EffectiveFrom AND EffectiveTo
        ) r2
        OUTER APPLY (
            SELECT TOP 1 NHRate, OTRate FROM proj.TBL_MANHOUR_RATE
            WHERE IsActive = 1 AND JobTypeId IS NULL AND JobId IS NULL
              AND m.DocumentDate BETWEEN EffectiveFrom AND EffectiveTo
        ) r3
        WHERE m.BatchId = @BatchId AND m.IsActive = 1;

        -- ── Step 2: Zero-rate check (ALWAYS a hard block — override never bypasses) ──
        DECLARE @ZeroRateJobs NVARCHAR(MAX);
        SELECT @ZeroRateJobs = STRING_AGG(JobId, ', ')
        FROM (
            SELECT DISTINCT m.JobId
            FROM proj.TBL_MANHOUR m
            WHERE m.BatchId = @BatchId AND m.IsActive = 1
              AND m.Hours > 0 AND m.NHRate = 0
        ) zr;

        IF @ZeroRateJobs IS NOT NULL
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR(N'Approval blocked - no manhour rate found for job(s): %s. Configure a rate in Manhour Rates before approving.', 16, 1, @ZeroRateJobs);
            RETURN;
        END;

        -- ── Step 3: Budget ceiling check (bypassed when @OverrideBudget = 1) ──
        IF @OverrideBudget = 0
        BEGIN
            DECLARE @OverBudget NVARCHAR(MAX);
            SELECT @OverBudget = STRING_AGG(Entry, ' | ')
            FROM (
                SELECT
                    x.JobId + ' [' + x.CategoryCode
                    + ': cost '    + FORMAT(x.TotalCostBase, 'N2')
                    + ' / budget ' + FORMAT(x.BudgetBase,    'N2')
                    + ', over by ' + FORMAT(x.TotalCostBase - x.BudgetBase, 'N2') + ']' AS Entry
                FROM (
                    SELECT
                        m.JobId,
                        jec.CategoryCode,
                        ROUND(SUM(m.Hours * m.NHRate + m.OvertimeHours * m.OTRate), 2) AS TotalCostBase,
                        ISNULL(MAX(jb.AmountInBaseCurrency), 0)                        AS BudgetBase
                    FROM proj.TBL_MANHOUR m
                    JOIN proj.TBL_JOB_EXPENSE_CATEGORY jec
                        ON m.MType = jec.MhTypeCode
                    LEFT JOIN proj.TBL_JOB_BUDGET jb
                        ON  jb.JobId         = m.JobId
                        AND jb.CostCategoryId = jec.ExpenseCategoryId
                        -- 2026-10-14: latest APPROVED revision (a revision awaiting approval is IsCurrent but not approved,
                        -- which made this join find nothing and skip the check entirely)
                        AND jb.IsApproved    = 1
                        AND jb.RvNo = (SELECT MAX(b2.RvNo) FROM proj.TBL_JOB_BUDGET b2 WHERE b2.JobId = m.JobId AND b2.IsApproved = 1)
                    WHERE m.JobId IN (
                        SELECT DISTINCT JobId FROM proj.TBL_MANHOUR
                        WHERE BatchId = @BatchId AND IsActive = 1
                    )
                    AND m.IsActive = 1
                    AND m.Status   = 'Approved'
                    GROUP BY m.JobId, jec.CategoryCode
                    HAVING MAX(jb.AmountInBaseCurrency) > 0
                       AND ROUND(SUM(m.Hours * m.NHRate + m.OvertimeHours * m.OTRate), 2)
                           > MAX(jb.AmountInBaseCurrency)
                ) x
            ) msg;

            IF @OverBudget IS NOT NULL
            BEGIN
                ROLLBACK TRANSACTION;
                RAISERROR(N'Manhour approval blocked - cost exceeds budget (base currency): %s', 16, 1, @OverBudget);
                RETURN;
            END;
        END;

        COMMIT TRANSACTION;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE proj.sp_AdminUpdateManhourLine
    @ManhourId    INT,
    @JobId        NVARCHAR(50),
    @EmployeeId   INT,
    @Hours        DECIMAL(6,2),
    @OvertimeHours DECIMAL(6,2),
    @Site         NVARCHAR(100) = NULL,
    @MType        NVARCHAR(50)  = NULL,
    @Remarks      NVARCHAR(500) = NULL,
    @ModifiedBy   NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_MANHOUR WHERE ManhourId = @ManhourId AND IsActive = 1)
    BEGIN
        RAISERROR('Line not found.', 16, 1);
        RETURN;
    END

    -- Basic value checks
    IF @Hours <= 0
    BEGIN RAISERROR('Hours must be greater than 0.', 16, 1); RETURN; END
    IF @Hours > 24
    BEGIN RAISERROR('Hours cannot exceed 24.', 16, 1); RETURN; END
    IF @OvertimeHours < 0
    BEGIN RAISERROR('OT hours cannot be negative.', 16, 1); RETURN; END
    IF @Hours + @OvertimeHours > 24
    BEGIN RAISERROR('Total hours (NH + OT) cannot exceed 24.', 16, 1); RETURN; END

    -- 2026-10-14: an APPROVED line already counts in job cost. Editing its job, type or hours must therefore
    -- re-apply the rate and re-check the budget, exactly as approval does; otherwise a line keeps the old job's
    -- rate and the job can be pushed over budget without any check. Draft / pending lines have no rates yet.
    DECLARE @WasApproved BIT = CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_MANHOUR WHERE ManhourId = @ManhourId AND Status = 'Approved') THEN 1 ELSE 0 END;
    DECLARE @CatMType NVARCHAR(50) = NULLIF(@MType, '');
    DECLARE @Msg NVARCHAR(MAX), @OverBudget NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE proj.TBL_MANHOUR
        SET    JobId         = @JobId,
               EmployeeId    = @EmployeeId,
               Hours         = @Hours,
               OvertimeHours = @OvertimeHours,
               Site          = NULLIF(@Site, ''),
               MType         = NULLIF(@MType,''),
               Remarks       = NULLIF(@Remarks,''),
               ModifiedBy    = @ModifiedBy,
               ModifiedDate  = GETDATE()
        WHERE  ManhourId = @ManhourId;

        IF @WasApproved = 1
        BEGIN
            UPDATE m SET
                m.NHRate = ISNULL(r1.NHRate, ISNULL(r2.NHRate, ISNULL(r3.NHRate, 0))),
                m.OTRate = ISNULL(r1.OTRate, ISNULL(r2.OTRate, ISNULL(r3.OTRate, 0)))
            FROM proj.TBL_MANHOUR m
            JOIN proj.TBL_JOB j ON j.JobId = m.JobId
            OUTER APPLY (
                SELECT TOP 1 NHRate, OTRate FROM proj.TBL_MANHOUR_RATE
                WHERE IsActive = 1 AND JobId = m.JobId
                  AND m.DocumentDate BETWEEN EffectiveFrom AND EffectiveTo
            ) r1
            OUTER APPLY (
                SELECT TOP 1 NHRate, OTRate FROM proj.TBL_MANHOUR_RATE
                WHERE IsActive = 1 AND JobTypeId = j.JobTypeId AND JobId IS NULL
                  AND m.DocumentDate BETWEEN EffectiveFrom AND EffectiveTo
            ) r2
            OUTER APPLY (
                SELECT TOP 1 NHRate, OTRate FROM proj.TBL_MANHOUR_RATE
                WHERE IsActive = 1 AND JobTypeId IS NULL AND JobId IS NULL
                  AND m.DocumentDate BETWEEN EffectiveFrom AND EffectiveTo
            ) r3
            WHERE m.ManhourId = @ManhourId;

            IF EXISTS (SELECT 1 FROM proj.TBL_MANHOUR WHERE ManhourId = @ManhourId AND Hours > 0 AND ISNULL(NHRate, 0) = 0)
            BEGIN
                SET @Msg = N'Edit blocked - no manhour rate found for job ' + @JobId + N'. Configure a rate in Manhour Rates first.';
                ROLLBACK TRANSACTION;
                RAISERROR(N'%s', 16, 1, @Msg);
                RETURN;
            END;

            SELECT @OverBudget = STRING_AGG(e.Entry, ' | ')
            FROM (
                SELECT x.JobId + ' [' + x.CategoryCode
                       + ': cost '    + FORMAT(x.TotalCostBase, 'N2')
                       + ' / budget ' + FORMAT(x.BudgetBase,    'N2')
                       + ', over by ' + FORMAT(x.TotalCostBase - x.BudgetBase, 'N2') + ']' AS Entry
                FROM (
                    SELECT m.JobId, jec.CategoryCode,
                           ROUND(SUM(m.Hours * m.NHRate + m.OvertimeHours * m.OTRate), 2) AS TotalCostBase,
                           ISNULL(MAX(jb.AmountInBaseCurrency), 0)                        AS BudgetBase
                    FROM proj.TBL_MANHOUR m
                    JOIN proj.TBL_JOB_EXPENSE_CATEGORY jec ON m.MType = jec.MhTypeCode
                    LEFT JOIN proj.TBL_JOB_BUDGET jb
                        ON  jb.JobId = m.JobId AND jb.CostCategoryId = jec.ExpenseCategoryId
                        AND jb.IsApproved = 1
                        AND jb.RvNo = (SELECT MAX(b2.RvNo) FROM proj.TBL_JOB_BUDGET b2 WHERE b2.JobId = m.JobId AND b2.IsApproved = 1)
                    WHERE m.JobId = @JobId AND m.MType = @CatMType AND m.IsActive = 1 AND m.Status = 'Approved'
                    GROUP BY m.JobId, jec.CategoryCode
                    HAVING MAX(jb.AmountInBaseCurrency) > 0
                       AND ROUND(SUM(m.Hours * m.NHRate + m.OvertimeHours * m.OTRate), 2) > MAX(jb.AmountInBaseCurrency)
                ) x
            ) e;

            IF @OverBudget IS NOT NULL
            BEGIN
                ROLLBACK TRANSACTION;
                RAISERROR(N'Edit blocked - cost would exceed the budget (base currency): %s', 16, 1, @OverBudget);
                RETURN;
            END;
        END;

        COMMIT TRANSACTION;
        SELECT 1 AS Result;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
