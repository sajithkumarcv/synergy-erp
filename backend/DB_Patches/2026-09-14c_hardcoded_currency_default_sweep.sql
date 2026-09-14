-- =====================================================================
-- 2026-09-14c  Sweep for hardcoded-currency-fallback bugs, same class as
-- 2026-09-14b's approval-policy fix — prompted by the user asking whether
-- the currency-mismatch issue was solved across ALL modules. It wasn't.
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- BUG: `sp_SetInvoice` defaulted `@CurrencyId` to the LITERAL 2, commented
-- "default AED". On SYNERP, CurrencyId 1 = INR (IsBaseCurrency=1), 2 = AED
-- — the opposite of what the comment assumes. A caller that omits
-- CurrencyId (or the matching C# fallback in InvoiceController.cs, which
-- had the identical `: 2` literal) would silently create an AED invoice
-- for an India company. This is the exact bug class already found and
-- fixed today in the approval-policy threshold check
-- (2026-09-14b_today_activity_and_approval_policy_base_currency.sql) and,
-- separately, in base WebERP the same afternoon.
--
-- FIX: `@CurrencyId` now defaults to NULL; the body resolves NULL or <= 0
-- to whichever currency has IsBaseCurrency = 1 — never a hardcoded id, so
-- this is correct regardless of which currency is base for a given
-- deployment. `InvoiceController.cs` passes null through instead of a
-- literal 2 so the SP does the resolving on both sides consistently.
--
-- Everything else in the proc (job guards, exchange-rate resolution,
-- insert/update) is unchanged.
--
-- Full-body CREATE OR ALTER of one procedure. No table changes.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_SetInvoice
    @InvoiceId      INT             = 0,
    @InvoiceDate    DATE            = NULL,
    @CustomerId     INT,
    @BillingAddress NVARCHAR(1000)  = NULL,
    @CurrencyId     INT             = NULL,      -- NULL = resolve to base currency below
    @ExchangeRate   DECIMAL(18,6)   = NULL,       -- NULL = auto-resolve from currency master
    @DueDate        DATE            = NULL,
    @JobId          VARCHAR(30)     = NULL,
    @LpoNo          NVARCHAR(50)    = NULL,
    @LpoDate        DATE            = NULL,
    @ContactId      INT             = NULL,
    @Notes          NVARCHAR(1000)  = NULL,
    @CreatedBy      NVARCHAR(100)   = NULL,
    @ModifiedBy     NVARCHAR(100)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- Block transactional saves on a closed job (Freezed/Completed/Cancelled).
    IF @JobId IS NOT NULL EXEC proj.sp_AssertJobOpen @JobId;
    -- Block transactional saves on a job whose budget is not yet approved.
    IF @JobId IS NOT NULL EXEC proj.sp_AssertBudgetApproved @JobId, N'INVOICE';

    -- ── Mandatory: every invoice must be linked to a job ──────────────────
    IF NULLIF(@JobId, '') IS NULL
    BEGIN
        RAISERROR('Job is required for an invoice.', 16, 1); RETURN;
        RETURN;
    END
    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_JOB WHERE JobId = @JobId)
    BEGIN
        RAISERROR('The specified Job does not exist.', 16, 1); RETURN;
        RETURN;
    END

    -- Resolve currency: never hardcode which id is "the" base — read it from
    -- IsBaseCurrency, so this holds regardless of which currency is base.
    IF @CurrencyId IS NULL OR @CurrencyId <= 0
        SELECT @CurrencyId = CurrencyId FROM PROJ.TBL_CURRENCY WHERE IsBaseCurrency = 1;

    -- Resolve exchange rate: base currency is always 1;
    -- if caller didn't supply a rate, pull from the master.
    DECLARE @ResolvedRate DECIMAL(18,6);
    SELECT @ResolvedRate =
        CASE WHEN IsBaseCurrency = 1 THEN 1.000000
             ELSE ISNULL(@ExchangeRate, ExchangeRate)
        END
    FROM   PROJ.TBL_CURRENCY
    WHERE  CurrencyId = @CurrencyId;

    IF @ResolvedRate IS NULL
        SET @ResolvedRate = 1.000000;   -- safety fallback

    IF @InvoiceId IS NULL OR @InvoiceId <= 0
    BEGIN
        DECLARE @NumResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @NumResult EXEC PROJ.sp_GetNextDocNumber 'INV';
        DECLARE @InvoiceNo NVARCHAR(30);
        SELECT @InvoiceNo = DocNumber FROM @NumResult;

        INSERT INTO PROJ.TBL_INVOICE
            (InvoiceNo, InvoiceDate, CustomerId, BillingAddress, CurrencyId, ExchangeRate,
             DueDate, JobId, LpoNo, LpoDate, ContactId, Notes, CreatedBy)
        VALUES
            (@InvoiceNo, ISNULL(@InvoiceDate, CAST(GETDATE() AS DATE)),
             @CustomerId, @BillingAddress, @CurrencyId, @ResolvedRate,
             @DueDate, @JobId, @LpoNo, @LpoDate,
             NULLIF(@ContactId,0), @Notes, @CreatedBy);

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS NewId, @InvoiceNo AS InvoiceNo;
    END
    ELSE
    BEGIN
        IF EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE WHERE InvoiceId = @InvoiceId AND Status <> 'Draft') BEGIN RAISERROR('Cannot edit a non-Draft Invoice.', 16, 1); RETURN; END

        UPDATE PROJ.TBL_INVOICE
        SET InvoiceDate    = ISNULL(@InvoiceDate, InvoiceDate),
            CustomerId     = @CustomerId,
            BillingAddress = @BillingAddress,
            CurrencyId     = @CurrencyId,
            ExchangeRate   = @ResolvedRate,
            DueDate        = @DueDate,
            JobId          = @JobId,
            LpoNo          = @LpoNo,
            LpoDate        = @LpoDate,
            ContactId      = NULLIF(@ContactId, 0),
            Notes          = @Notes,
            ModifiedBy     = @ModifiedBy,
            ModifiedDate   = GETDATE()
        WHERE InvoiceId = @InvoiceId AND IsActive = 1;

        SELECT CAST(@InvoiceId AS INT) AS NewId, InvoiceNo
        FROM PROJ.TBL_INVOICE WHERE InvoiceId = @InvoiceId;
    END
END;
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item = 'sp_SetInvoice', Status = CASE
    WHEN EXISTS (SELECT 1 FROM sys.parameters
                 WHERE object_id = OBJECT_ID('proj.sp_SetInvoice') AND name = '@CurrencyId'
                   AND default_value IS NULL AND has_default_value = 1)
    THEN 'OK (CurrencyId defaults to NULL)' ELSE 'MISSING' END;
GO
