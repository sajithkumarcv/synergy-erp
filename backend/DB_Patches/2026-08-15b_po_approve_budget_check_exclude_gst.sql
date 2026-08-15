-- =====================================================================
-- 2026-08-15b : Exclude GST/tax from the APPROVE-time PO budget guard
--               inside proj.sp_ProcessApproval
--
-- COMPANION TO: 2026-08-15_po_submit_budget_check_exclude_gst.sql
--               (which fixes the SUBMIT-time guard in sp_SubmitForApproval)
-- BOTH must be applied together — fixing only one leaves the other
-- blocking the document with the GST-inflated figure.
-- =====================================================================
--
-- BUG
--   The 'Approve' branch computed this PO's own value as:
--       @ApPoTotalBase = ISNULL(TotalAmount, 0) * ISNULL(ExchangeRate, 1)
--   TBL_PURCHASE_ORDER.TotalAmount is TAX-INCLUSIVE (sp_SetPOLine builds it
--   as LinesSubtotal - discount + LinesTax + HeaderTaxAmount).
--   Meanwhile the other two sides of the comparison are TAX-EXCLUSIVE:
--       @ApCommitted -> SUM(pol.OrderedQty * pol.UnitPrice)   (no tax)
--       @ApBudgeted  -> TBL_JOB_BUDGET budgeted amount        (no tax)
--   So GST was counted against the budget, falsely blocking approval of
--   POs that are actually within budget.
--
-- FIX
--   Compute @ApPoTotalBase the same way as @ApCommitted and
--   sp_GetPOBudgetCheck: pre-tax line sum (OrderedQty * UnitPrice),
--   converted to base currency via proj.fn_ToBase (which MULTIPLIES by the
--   stored rate — identical semantics to the old '* ExchangeRate').
--
-- VERIFIED on dev SYNERP against real PO-26-0007
--   (Job IH26-500026, ExpenseCategoryId 23 'Radiator', 10 x 150 @ 15% tax):
--       Budgeted 4,000.00 | Committed (other POs) 2,500.00
--       OLD: This PO 1,725.00 (tax-incl.) -> 4,225.00 > 4,000 -> BLOCKED "Over by 225.00"
--       NEW: This PO 1,500.00 (pre-tax)   -> 4,000.00 = 4,000 -> PASSES
--
-- SCOPE / SAFETY
--   * Changes ONLY the budget comparison basis. Does NOT change invoice,
--     tax, or TotalAmount calculations anywhere.
--   * The override path (@OverrideBudget = 1) is untouched.
--   * Backend rebuild NOT required (proc is called via Dapper by name).
--
-- WHY THIS SCRIPT USES REPLACE INSTEAD OF A FULL 'CREATE OR ALTER'
--   sp_ProcessApproval is large; re-typing the whole body risks silently
--   altering unrelated logic. This script surgically swaps ONE known block
--   and ABORTS WITHOUT CHANGING ANYTHING if that exact block is not found
--   (i.e. if prod has drifted from dev). Safe to re-run: the second run
--   finds no anchor and aborts harmlessly.
--
-- RUN AS: a login able to ALTER proj.sp_ProcessApproval.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DECLARE @d   NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('proj.sp_ProcessApproval'));

IF @d IS NULL
    THROW 50000, 'proj.sp_ProcessApproval not found. Nothing changed.', 1;

-- Already patched? (idempotency guard)
IF @d LIKE '%SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @ApExchangeRate))%'
BEGIN
    PRINT 'sp_ProcessApproval already patched (GST excluded from approve-time budget guard). No change made.';
    RETURN;
END

DECLARE @old NVARCHAR(MAX) =
N'DECLARE @ApJobId NVARCHAR(50), @ApCategoryId INT, @ApPoTotalBase DECIMAL(18,2);
            SELECT @ApJobId = JobId, @ApCategoryId = ExpenseCategoryId, @ApPoTotalBase = ISNULL(TotalAmount, 0) * ISNULL(ExchangeRate, 1)
            FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @DocumentId AND IsActive = 1;';

DECLARE @new NVARCHAR(MAX) =
N'DECLARE @ApJobId NVARCHAR(50), @ApCategoryId INT, @ApPoTotalBase DECIMAL(18,2), @ApExchangeRate DECIMAL(18,6);
            SELECT @ApJobId = JobId, @ApCategoryId = ExpenseCategoryId, @ApExchangeRate = ISNULL(ExchangeRate, 1)
            FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @DocumentId AND IsActive = 1;
            -- Pre-tax base value of THIS PO''s own lines (excludes GST/tax) — mirrors
            -- sp_GetPOBudgetCheck / @ApCommitted below. Previously used TotalAmount,
            -- which is tax-inclusive, wrongly counting GST against the budget.
            SELECT @ApPoTotalBase = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @ApExchangeRate)), 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = @DocumentId AND pol.IsActive = 1;';

IF CHARINDEX(@old, @d) = 0
    THROW 50000, 'Anchor block not found in proj.sp_ProcessApproval - prod definition has drifted from dev. ABORTED, nothing changed. Apply the change by hand.', 1;

SET @d = REPLACE(@d, @old, @new);
SET @d = STUFF(@d, 1, LEN('CREATE PROCEDURE'), 'ALTER PROCEDURE');

EXEC sp_executesql @d;
PRINT 'sp_ProcessApproval patched: GST/tax now excluded from the approve-time PO budget guard.';
GO

-- ── Post-check: both MUST be 1, and the fix must be present ──────────
SELECT uses_quoted_identifier,
       uses_ansi_nulls,
       CASE WHEN definition LIKE '%SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @ApExchangeRate))%'
            THEN 'FIX_PRESENT' ELSE 'FIX_MISSING' END AS FixCheck
FROM sys.sql_modules
WHERE object_id = OBJECT_ID('proj.sp_ProcessApproval');
GO
