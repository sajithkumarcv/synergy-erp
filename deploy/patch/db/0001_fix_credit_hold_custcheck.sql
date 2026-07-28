/* ─────────────────────────────────────────────────────────────────────────
   0001_fix_credit_hold_custcheck.sql
   Fixes proj.sp_AutoCreditHoldCheck: the CustCheck CTE was referenced across
   three separate statements (two UPDATEs + a SELECT), but a CTE is only
   visible to the single statement immediately following its WITH clause.
   Every statement after the first failed with "Invalid object name
   'CustCheck'" (seen in CreditHoldSchedulerService's background job log).
   Fix: materialize CustCheck into a #temp table, which persists for the
   rest of the procedure.

   Run against ALL company DBs: ESI_PMS_IND, SYN_PMS_IND, SYN_PMS_UAE
   (also affects the original SYNERGY_INDIA source DB, since the bug is in
   the procedure body itself, not specific to any one database).

   ALTER PROCEDURE must be the only statement in its batch, so it is its own
   GO block below — separate from the patch-ledger guard. Re-running an
   ALTER PROCEDURE with an identical body is always safe (redefines it
   identically, no side effects), so only the ledger insert needs the
   idempotency check.
   ───────────────────────────────────────────────────────────────────────── */

ALTER PROCEDURE [PROJ].[sp_AutoCreditHoldCheck]
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Alloc AS (
        SELECT a.InvoiceId,
               SUM(CASE WHEN a.IsActive=1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
        FROM proj.TBL_RECEIPT_VOUCHER_ALLOCATION a
        JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
        WHERE rv.Status = 'Approved' AND rv.IsActive = 1 GROUP BY a.InvoiceId
    ),
    CnAlloc AS (
        SELECT a.InvoiceId,
               SUM(CASE WHEN a.IsActive=1 THEN a.AllocatedAmount ELSE 0 END) AS CnPaid
        FROM proj.TBL_CREDIT_NOTE_ALLOCATION a
        JOIN proj.TBL_CREDIT_NOTE cn ON a.CnId = cn.CnId
        WHERE cn.Status = 'Approved' AND cn.IsActive = 1 GROUP BY a.InvoiceId
    ),
    InvCalc AS (
        SELECT
            i.CustomerId,
            i.TotalAmount * ISNULL(i.ExchangeRate, 1)
                - ISNULL(al.RvPaid,0) - ISNULL(cn.CnPaid,0)  AS PendingAmtBase,
            CASE
                WHEN i.DueDate IS NOT NULL THEN i.DueDate
                WHEN c.CreditDays > 0      THEN DATEADD(DAY, ISNULL(c.CreditDays,0), CAST(i.InvoiceDate AS DATE))
                ELSE NULL
            END AS EffectiveDueDate
        FROM proj.TBL_INVOICE i
        JOIN proj.TBL_CUSTOMER c ON c.CustomerId = i.CustomerId
        LEFT JOIN Alloc   al ON al.InvoiceId = i.InvoiceId
        LEFT JOIN CnAlloc cn ON cn.InvoiceId = i.InvoiceId
        WHERE i.IsActive = 1 AND i.Status NOT IN ('Draft','Cancelled')
    ),
    CustBalance AS (
        SELECT
            CustomerId,
            ISNULL(SUM(PendingAmtBase), 0)  AS OutstandingBalance,
            ISNULL(MAX(CASE
                WHEN EffectiveDueDate IS NOT NULL
                 AND EffectiveDueDate < CAST(GETDATE() AS DATE)
                 AND PendingAmtBase > 0
                THEN DATEDIFF(DAY, EffectiveDueDate, GETDATE())
                ELSE 0 END), 0)              AS MaxOverdueDays
        FROM InvCalc
        GROUP BY CustomerId
    )
    SELECT
        c.CustomerId,
        c.CreditHold,
        c.AutoHold,
        ISNULL(c.CreditLimit, 0)        AS CreditLimit,
        ISNULL(c.CreditDays,  0)        AS CreditDays,
        ISNULL(b.OutstandingBalance, 0) AS OutstandingBalance,
        ISNULL(b.MaxOverdueDays, 0)     AS MaxOverdueDays,
        CAST(CASE
            WHEN ISNULL(c.CreditLimit,0) > 0
             AND ISNULL(b.OutstandingBalance,0) > c.CreditLimit   THEN 1
            WHEN ISNULL(c.CreditDays,0) > 0
             AND ISNULL(b.MaxOverdueDays,0) > c.CreditDays        THEN 1
            ELSE 0 END AS BIT) AS ShouldHold
    INTO #CustCheck
    FROM proj.TBL_CUSTOMER c
    LEFT JOIN CustBalance b ON b.CustomerId = c.CustomerId
    WHERE c.IsActive = 1;

    UPDATE c SET
        CreditHold     = 1,
        AutoHold       = 1,
        CreditHoldBy   = 'SYSTEM',
        CreditHoldDate = GETDATE(),
        CreditHoldNote = CASE
            WHEN cc.CreditLimit > 0 AND cc.OutstandingBalance > cc.CreditLimit
                THEN 'Auto: Outstanding ' + FORMAT(cc.OutstandingBalance,'N2') +
                     ' exceeds credit limit ' + FORMAT(cc.CreditLimit,'N2')
            ELSE 'Auto: Invoice overdue by ' + CAST(cc.MaxOverdueDays AS NVARCHAR) + ' days'
        END,
        ModifiedBy   = 'SYSTEM',
        ModifiedDate = GETDATE()
    FROM proj.TBL_CUSTOMER c
    JOIN #CustCheck cc ON cc.CustomerId = c.CustomerId
    WHERE cc.ShouldHold = 1 AND c.CreditHold = 0;

    UPDATE c SET
        CreditHold     = 0,
        AutoHold       = 0,
        CreditHoldBy   = NULL,
        CreditHoldDate = NULL,
        CreditHoldNote = NULL,
        ModifiedBy     = 'SYSTEM',
        ModifiedDate   = GETDATE()
    FROM proj.TBL_CUSTOMER c
    JOIN #CustCheck cc ON cc.CustomerId = c.CustomerId
    WHERE cc.ShouldHold = 0 AND c.CreditHold = 1 AND c.AutoHold = 1;

    SELECT
        SUM(CASE WHEN cc.ShouldHold=1 AND c.CreditHold=0  THEN 1 ELSE 0 END) AS NewHolds,
        SUM(CASE WHEN cc.ShouldHold=0 AND c.CreditHold=1
                  AND c.AutoHold=1                         THEN 1 ELSE 0 END) AS Released
    FROM proj.TBL_CUSTOMER c
    JOIN #CustCheck cc ON cc.CustomerId = c.CustomerId
    WHERE c.IsActive = 1;

    DROP TABLE #CustCheck;
END
GO

/* ─── Patch ledger — record this patch, once, in proj.TBL_DB_PATCH ─────── */
IF NOT EXISTS (SELECT 1 FROM proj.TBL_DB_PATCH WHERE PatchNo = 1)
BEGIN
    INSERT proj.TBL_DB_PATCH (PatchNo, FileName, Description)
    VALUES (1, N'0001_fix_credit_hold_custcheck.sql',
            N'Fix proj.sp_AutoCreditHoldCheck: CustCheck CTE was out of scope across statements; replaced with a #temp table.');
    PRINT 'Patch 1 recorded.';
END
ELSE
    PRINT 'Patch 1 already recorded — procedure re-applied (safe), ledger unchanged.';
GO
