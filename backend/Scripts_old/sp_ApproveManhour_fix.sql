SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO

ALTER PROCEDURE proj.sp_ApproveManhour
    @BatchId    INT,
    @ApprovedBy NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        -- ── Step 1: Resolve rates (3-level fallback) ──────────────────────────
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

        -- ── Step 2: Zero-rate check ───────────────────────────────────────────
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

        -- ── Step 3: Budget ceiling check ─────────────────────────────────────
        -- Joins through TBL_JOB_EXPENSE_CATEGORY.MhTypeCode instead of
        -- hardcoded category codes — adding a new manhour type only requires
        -- setting MhTypeCode on the relevant expense category row.
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
                -- ── Data-driven join: MType matches MhTypeCode on expense category ──
                JOIN proj.TBL_JOB_EXPENSE_CATEGORY jec
                    ON m.MType = jec.MhTypeCode
                LEFT JOIN proj.TBL_JOB_BUDGET jb
                    ON  jb.JobId         = m.JobId
                    AND jb.CostCategoryId = jec.ExpenseCategoryId
                    AND jb.IsCurrent     = 1
                    AND jb.IsApproved    = 1
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

        COMMIT TRANSACTION;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
PRINT 'sp_ApproveManhour updated — hardcoding removed.';
