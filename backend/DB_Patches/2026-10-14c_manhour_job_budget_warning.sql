-- 2026-10-14c: warning when approved manhour cost is above the job's budget (job total, or a manhour category)
--
-- Apply to: SYNERP
--
-- Job IH26-500024: approved manhours (2,440) were not checked against the job's budget because the per-category
-- ceiling skips a category that has no budget line, and nothing compared them with the job total. By decision this is
-- a WARNING only (approval is not blocked). The Manhour batch page shows an amber banner for every job in the batch
-- that is over, either:
--   Scope 'Job total'  : approved manhour cost of the job > the job's TOTAL budget (all categories), or
--   Scope 'MH_MECH' / 'MH_ELEC' : approved cost of that manhour type > that category's budget line.
-- Budget = latest APPROVED revision, base currency. Read-only procedure; nothing else changes.
-- Revert: DROP PROCEDURE proj.sp_GetManhourBudgetWarning.   Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetManhourBudgetWarning
    @BatchId INT
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH jobs AS (
        SELECT DISTINCT JobId FROM proj.TBL_MANHOUR WHERE BatchId = @BatchId AND IsActive = 1
    ),
    lines AS (
        SELECT b.JobId, b.CostCategoryId,
               ISNULL(b.AmountInBaseCurrency,
                      proj.fn_ToBase(ISNULL(b.BudgetedAmount, 0), ISNULL(b.ExchangeRate, ISNULL(j.JobExcRate, 1)))) AS Amt
        FROM proj.TBL_JOB_BUDGET b
        JOIN proj.TBL_JOB j ON j.JobId = b.JobId
        WHERE b.JobId IN (SELECT JobId FROM jobs)
          AND b.IsApproved = 1
          AND b.RvNo = (SELECT MAX(b2.RvNo) FROM proj.TBL_JOB_BUDGET b2 WHERE b2.JobId = b.JobId AND b2.IsApproved = 1)
    ),
    bud AS (SELECT JobId, SUM(Amt) AS JobBudget FROM lines GROUP BY JobId),
    catbud AS (SELECT JobId, CostCategoryId, SUM(Amt) AS CatBudget FROM lines GROUP BY JobId, CostCategoryId),
    cost AS (
        SELECT m.JobId,
               ROUND(SUM(m.Hours * ISNULL(m.NHRate, 0) + m.OvertimeHours * ISNULL(m.OTRate, 0)), 2) AS ManhourCost
        FROM proj.TBL_MANHOUR m
        WHERE m.JobId IN (SELECT JobId FROM jobs) AND m.IsActive = 1 AND m.Status = 'Approved'
        GROUP BY m.JobId
    ),
    catcost AS (
        SELECT m.JobId, jec.ExpenseCategoryId, jec.CategoryCode,
               ROUND(SUM(m.Hours * ISNULL(m.NHRate, 0) + m.OvertimeHours * ISNULL(m.OTRate, 0)), 2) AS CatCost
        FROM proj.TBL_MANHOUR m
        JOIN proj.TBL_JOB_EXPENSE_CATEGORY jec ON m.MType = jec.MhTypeCode
        WHERE m.JobId IN (SELECT JobId FROM jobs) AND m.IsActive = 1 AND m.Status = 'Approved'
        GROUP BY m.JobId, jec.ExpenseCategoryId, jec.CategoryCode
    )
    SELECT x.JobId, x.Scope, x.Budget, x.ManhourCost, x.ManhourCost - x.Budget AS OverBy
    FROM (
        SELECT jb.JobId, N'Job total' AS Scope,
               ISNULL(bud.JobBudget, 0) AS Budget, ISNULL(cost.ManhourCost, 0) AS ManhourCost
        FROM jobs jb
        LEFT JOIN bud  ON bud.JobId  = jb.JobId
        LEFT JOIN cost ON cost.JobId = jb.JobId
        WHERE ISNULL(bud.JobBudget, 0) > 0                -- a job with no budget at all is accepted without a warning
          AND ISNULL(cost.ManhourCost, 0) > ISNULL(bud.JobBudget, 0)

        UNION ALL

        SELECT cc.JobId, cc.CategoryCode AS Scope, cb.CatBudget AS Budget, cc.CatCost AS ManhourCost
        FROM catcost cc
        JOIN catbud cb ON cb.JobId = cc.JobId AND cb.CostCategoryId = cc.ExpenseCategoryId
        WHERE cb.CatBudget > 0 AND cc.CatCost > cb.CatBudget
    ) x
    ORDER BY x.JobId, x.Scope;
END;
GO
