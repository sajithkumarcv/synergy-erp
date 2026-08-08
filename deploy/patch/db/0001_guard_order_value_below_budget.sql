/* ─────────────────────────────────────────────────────────────────────────
   0001_guard_order_value_below_budget.sql

   Bug: sp_UpdateJobFinance had no check against the existing budget, so a
   job's order value could be reduced below the budget already allocated
   to it. That state then deadlocks sp_SetJobBudget's own "total <= order
   value" guard: reducing any ONE category can still be blocked because
   OTHER, untouched categories' old amounts alone already exceed the
   already-reduced order value.

   Fix: sp_UpdateJobFinance now blocks reducing the order value below the
   job's current total budget (compared in base currency, using each
   line's own exchange rate for the budget side and the new rate being
   saved for the order-value side — correct for the common case where
   budget lines are entered in base currency but the order value is in
   the job's own currency). Message tells the user to reduce the budget
   first, matching the requested UX.

   Run against every SYNERP-based DB (dev + production).
   ───────────────────────────────────────────────────────────────────────── */
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM proj.TBL_DB_PATCH WHERE PatchNo = 1)
BEGIN
    PRINT 'Patch 1 already applied — skipping.';
    RETURN;
END
GO

ALTER PROCEDURE proj.sp_UpdateJobFinance
    @JobId          NVARCHAR(50),
    @CurrencyId     INT,
    @ExchangeRate   DECIMAL(18,6),
    @OrderValue     DECIMAL(18,2),       -- stored AS-IS in the JOB currency (original)
    @AdvanceAmount  DECIMAL(18,2),       -- stored AS-IS in the JOB currency (original)
    @ModifiedBy     NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- Guard: a valid job currency + rate is mandatory.
    DECLARE @Resolved DECIMAL(18,6);
    EXEC proj.sp_ValidateTxnCurrency @CurrencyId, @ExchangeRate, N'Job', @Resolved OUTPUT;

    -- Guard: order value cannot be reduced below the budget already allocated.
    -- Without this, sp_SetJobBudget's own "total <= order value" check can
    -- deadlock — an edit that REDUCES one category can still be blocked
    -- because other, untouched categories' old amounts alone already exceed
    -- the new (already-reduced) order value. Catching it here, at the point
    -- the order value itself is lowered, means that state can never occur.
    DECLARE @CurrentBudgetBase DECIMAL(18,2) = ISNULL((
        SELECT SUM(ISNULL(AmountInBaseCurrency, proj.fn_ToBase(ISNULL(BudgetedAmount,0), ISNULL(ExchangeRate, @ExchangeRate))))
        FROM proj.TBL_JOB_BUDGET
        WHERE JobId = @JobId AND IsCurrent = 1
    ), 0);

    IF @CurrentBudgetBase > 0
    BEGIN
        DECLARE @NewOrderValueBase DECIMAL(18,2) = proj.fn_ToBase(@OrderValue, @ExchangeRate);
        IF @NewOrderValueBase < @CurrentBudgetBase
        BEGIN
            DECLARE @BaseCode2 NVARCHAR(20) = ISNULL((SELECT ShortName FROM proj.TBL_CURRENCY WHERE IsBaseCurrency = 1), 'base');
            DECLARE @finMsg NVARCHAR(400) =
                'Order value cannot be reduced below the budget already allocated ('
                + CONVERT(NVARCHAR(30), CAST(@CurrentBudgetBase AS DECIMAL(18,2))) + ' ' + @BaseCode2 + ').'
                + ' Reduce the job budget first, then change the order value.';
            RAISERROR(@finMsg, 16, 1);
            RETURN;
        END
    END

    -- Standard ERP: persist amounts in the JOB's own currency. The base-currency
    -- value is derived on read as (amount * ExchangeRate) — never overwrite the
    -- entered figure.
    DECLARE @OldOrderValue    DECIMAL(18,2) = 0;
    DECLARE @OldAdvanceAmount DECIMAL(18,2) = 0;
    DECLARE @OldCurrencyId    INT = 0;
    DECLARE @OldExcRate       DECIMAL(18,6) = 1;
    DECLARE @OldValue NVARCHAR(500), @NewValue NVARCHAR(500);

    SELECT
        @OldCurrencyId    = ISNULL(j.JobCurrencyId, 0),
        @OldExcRate       = ISNULL(j.JobExcRate, 1),
        @OldOrderValue    = ISNULL(f.OrderValue, 0),
        @OldAdvanceAmount = ISNULL(f.JobAdvanceAmount, 0)
    FROM proj.TBL_JOB j
    LEFT JOIN proj.TBL_JOB_FINANCE f ON f.JobId = j.JobId
    WHERE j.JobId = @JobId;

    DECLARE @OldCurrencyCode NVARCHAR(10) = ISNULL(
        (SELECT ShortName FROM proj.TBL_CURRENCY WHERE CurrencyId = @OldCurrencyId),
        CAST(@OldCurrencyId AS NVARCHAR(10)));
    DECLARE @NewCurrencyCode NVARCHAR(10) = ISNULL(
        (SELECT ShortName FROM proj.TBL_CURRENCY WHERE CurrencyId = @CurrencyId),
        CAST(@CurrencyId AS NVARCHAR(10)));

    SET @OldValue = 'Currency: ' + @OldCurrencyCode
        + ' | Rate: '    + CAST(@OldExcRate AS NVARCHAR(20))
        + ' | Order: '   + CAST(@OldOrderValue AS NVARCHAR(50))
        + ' | Advance: ' + CAST(@OldAdvanceAmount AS NVARCHAR(50));
    SET @NewValue = 'Currency: ' + @NewCurrencyCode
        + ' | Rate: '    + CAST(@ExchangeRate AS NVARCHAR(20))
        + ' | Order: '   + CAST(@OrderValue AS NVARCHAR(50))
        + ' | Advance: ' + CAST(@AdvanceAmount AS NVARCHAR(50));

    UPDATE proj.TBL_JOB SET
        JobCurrencyId      = @CurrencyId,
        JobExcRate         = @ExchangeRate,
        JobLastModifiedBy  = @ModifiedBy,
        JobLastUpdatedDate = GETDATE()
    WHERE JobId = @JobId;

    IF EXISTS (SELECT 1 FROM proj.TBL_JOB_FINANCE WHERE JobId = @JobId)
        UPDATE proj.TBL_JOB_FINANCE SET
            OrderValue       = @OrderValue,
            JobAdvanceAmount = @AdvanceAmount,
            ExchangeRate     = @ExchangeRate,
            ModifiedBy       = @ModifiedBy,
            ModifiedDate     = GETDATE()
        WHERE JobId = @JobId;
    ELSE
        INSERT INTO proj.TBL_JOB_FINANCE (JobId, OrderValue, JobAdvanceAmount, ExchangeRate, CreatedBy, CreatedDate)
        VALUES (@JobId, @OrderValue, @AdvanceAmount, @ExchangeRate, @ModifiedBy, GETDATE());

    EXEC proj.sp_AddJobAudit
        @JobId     = @JobId,
        @Action    = N'FINANCE_UPDATED',
        @Section   = N'Finance',
        @OldValue  = @OldValue,
        @NewValue  = @NewValue,
        @CreatedBy = @ModifiedBy;
END
GO

IF NOT EXISTS (SELECT 1 FROM proj.TBL_DB_PATCH WHERE PatchNo = 1)
    INSERT proj.TBL_DB_PATCH (PatchNo, FileName, Description)
    VALUES (1, N'0001_guard_order_value_below_budget.sql',
            N'sp_UpdateJobFinance: block reducing order value below the budget already allocated to the job.');
GO
PRINT 'Patch 1 applied.';
