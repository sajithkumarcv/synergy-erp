-- =====================================================================
-- 2026-09-26  PROD BATCH  (everything committed after the 2026-09-20 prod deploy)  --  CHECK ONLY
--
-- CHECK ONLY: changes NOTHING. Shows what the APPLY script would do on this database.
-- Run it against ONE company database at a time (SYNERPINDIA, then SYNERPUAE). No USE - check the
-- database dropdown first.
--
-- WHAT IT DOES (procedures only - no tables, columns or data):
--  NEW  sp_GetBomLineDocs           BOM / PR PR-Qty and PO-Qty click-through
--  NEW  sp_GetJobBudgetBreakdown    Job Overview PO / Issue / Return per cost category
--  EDIT sp_SearchPOs                + @ExpenseCategoryId (Budget Category filter on the PO grid)
--  EDIT sp_ChangeGRNStatus          GRN stock cost = GRN price x PO exchange rate (base currency)
--  EDIT sp_ReportJobs               Job Type filter accepts several types (comma-separated)
--  EDIT sp_ReportPOs/PRs/GRNs       + @JobTypeIds filter
--
-- HOW: each existing procedure is edited from the text that is LIVE on this database (anchor-checked
-- REPLACE), never overwritten with dev's copy, so anything prod has that dev does not is kept. If an
-- anchor is not found the expected number of times, that procedure is reported and NOTHING is applied.
-- Safe to run twice: a procedure that already has its change is skipped.
-- =====================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;

DECLARE @Apply BIT = 0;
DECLARE @Rep TABLE (Seq INT IDENTITY(1,1), Item NVARCHAR(200), Status NVARCHAR(500));
DECLARE @Fail INT = 0;
INSERT @Rep VALUES (N'database', DB_NAME());

-- 1. dependencies
IF OBJECT_ID(N'proj.fn_ToBase') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.fn_ToBase', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.fn_PendingApprovalLevel') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.fn_PendingApprovalLevel', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.VW_JOB') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.VW_JOB', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_JOB') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_JOB', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_JOBTYPE') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_JOBTYPE', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_STOCK_ISSUE') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_STOCK_ISSUE', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_STOCK_ISSUE_LINE') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_STOCK_ISSUE_LINE', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_STOCK_ISSUE_RETURN') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_STOCK_ISSUE_RETURN', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_STOCK_ISSUE_RETURN_LINE') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_STOCK_ISSUE_RETURN_LINE', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_PURCHASE_ORDER') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_PURCHASE_ORDER', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_PURCHASE_ORDER_LINE') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_PURCHASE_ORDER_LINE', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_PURCHASE_REQUEST') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_PURCHASE_REQUEST', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_PURCHASE_REQUEST_LINE') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_PURCHASE_REQUEST_LINE', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_CURRENCY') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_CURRENCY', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_ITEM') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_ITEM', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_JOB_EXPENSE_CATEGORY') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_JOB_EXPENSE_CATEGORY', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_GRN_HEADER') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_GRN_HEADER', N'MISSING'); SET @Fail += 1; END
IF OBJECT_ID(N'proj.TBL_GRN_DETAIL') IS NULL BEGIN INSERT @Rep VALUES (N'needs proj.TBL_GRN_DETAIL', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_JOBTYPE', N'IsCostingRequired') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_JOBTYPE.IsCostingRequired', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_STOCK_ISSUE', N'CostingType') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_STOCK_ISSUE.CostingType', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_ITEM', N'BudgetCategoryId') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_ITEM.BudgetCategoryId', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_PURCHASE_REQUEST_LINE', N'BomDetailId') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_PURCHASE_REQUEST_LINE.BomDetailId', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_PURCHASE_ORDER_LINE', N'PrLineId') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_PURCHASE_ORDER_LINE.PrLineId', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_PURCHASE_ORDER', N'ExpenseCategoryId') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_PURCHASE_ORDER.ExpenseCategoryId', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_PURCHASE_ORDER', N'ExchangeRate') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_PURCHASE_ORDER.ExchangeRate', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_JOB_EXPENSE_CATEGORY', N'IsSubcontractOrder') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_JOB_EXPENSE_CATEGORY.IsSubcontractOrder', N'MISSING'); SET @Fail += 1; END
IF COL_LENGTH(N'proj.TBL_STOCK_ISSUE_RETURN', N'IssueId') IS NULL BEGIN INSERT @Rep VALUES (N'needs column TBL_STOCK_ISSUE_RETURN.IssueId', N'MISSING'); SET @Fail += 1; END

-- 2. edits to existing procedures
DECLARE @E TABLE (Id INT IDENTITY(1,1), Proc_ SYSNAME, Marker NVARCHAR(200), Anchor NVARCHAR(MAX), Repl NVARCHAR(MAX), Expected INT);
INSERT @E (Proc_, Marker, Anchor, Repl, Expected) VALUES
  (N'proj.sp_ReportJobs', N'STRING_SPLIT(@JobTypeId,', N'@JobTypeId      NVARCHAR(50)  = NULL,', N'@JobTypeId      NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds (single value still works)', 1),
  (N'proj.sp_ReportJobs', N'STRING_SPLIT(@JobTypeId,', N'AND (@JobTypeId   IS NULL OR j.JobTypeId       = @JobTypeId)', N'AND (@JobTypeId   IS NULL OR @JobTypeId = '''' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeId, '','')))', 1),
  (N'proj.sp_ReportPOs', N'@JobTypeIds', N'@JobId       NVARCHAR(50) = NULL,', N'@JobId       NVARCHAR(50) = NULL,{NL}    @JobTypeIds NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds', 1),
  (N'proj.sp_ReportPOs', N'@JobTypeIds', N'AND (@JobId      IS NULL OR po.JobId LIKE ''%'' + @JobId + ''%'')', N'AND (@JobId      IS NULL OR po.JobId LIKE ''%'' + @JobId + ''%''){NL}      AND (@JobTypeIds IS NULL OR @JobTypeIds = '''' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, '','')))', 1),
  (N'proj.sp_ReportPRs', N'@JobTypeIds', N'@JobId      NVARCHAR(50)  = NULL,', N'@JobId      NVARCHAR(50)  = NULL,{NL}    @JobTypeIds NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds', 1),
  (N'proj.sp_ReportPRs', N'@JobTypeIds', N'AND (@JobId     IS NULL OR pr.JobId = @JobId)', N'AND (@JobId     IS NULL OR pr.JobId = @JobId){NL}      AND (@JobTypeIds IS NULL OR @JobTypeIds = '''' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, '','')))', 1),
  (N'proj.sp_ReportGRNs', N'@JobTypeIds', N'@JobId      NVARCHAR(50)  = NULL,', N'@JobId      NVARCHAR(50)  = NULL,{NL}    @JobTypeIds NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds', 1),
  (N'proj.sp_ReportGRNs', N'@JobTypeIds', N'AND (@JobId      IS NULL OR g.JobId = @JobId)', N'AND (@JobId      IS NULL OR g.JobId = @JobId){NL}      AND (@JobTypeIds IS NULL OR @JobTypeIds = '''' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, '','')))', 1),
  (N'proj.sp_ChangeGRNStatus', N'@PoRate', N'DECLARE @LineNum INT, @ItemId INT, @ItemDesc NVARCHAR(300),', N'-- Stock is valued in BASE currency: GRN line prices are in the PO currency, so convert{NL}            -- with the PO''s exchange rate (1 unit of PO currency = @PoRate base units).{NL}            DECLARE @PoRate DECIMAL(18,6) = 1;{NL}            SELECT @PoRate = ISNULL(NULLIF(po.ExchangeRate, 0), 1){NL}            FROM proj.TBL_PURCHASE_ORDER po WHERE po.PoId = @PoId;{NL}            DECLARE @LineNum INT, @ItemId INT, @ItemDesc NVARCHAR(300),', 1),
  (N'proj.sp_ChangeGRNStatus', N'@PoRate', N'SELECT LineNum,ItemId,ItemDesc,(ReceivedQty-ISNULL(RejectedQty,0)),UomId,UnitPrice', N'SELECT LineNum,ItemId,ItemDesc,(ReceivedQty-ISNULL(RejectedQty,0)),UomId,ROUND(UnitPrice * @PoRate, 4)', 1),
  (N'proj.sp_ChangeGRNStatus', N'@PoRate', N'd.UomId,d.UnitPrice,', N'd.UomId,ROUND(d.UnitPrice * @PoRate, 4),', 1),
  (N'proj.sp_SearchPOs', N'@ExpenseCategoryId', N'@IsSubcontractOnly BIT          = NULL,', N'@IsSubcontractOnly BIT          = NULL,{NL}    @ExpenseCategoryId INT          = NULL,', 1),
  (N'proj.sp_SearchPOs', N'@ExpenseCategoryId', N'AND (@DateTo     IS NULL OR CAST(po.CreatedDate AS DATE) <= @DateTo)', N'AND (@DateTo     IS NULL OR CAST(po.CreatedDate AS DATE) <= @DateTo){NL}      AND (@ExpenseCategoryId IS NULL OR po.ExpenseCategoryId = @ExpenseCategoryId)', 2);
DECLARE @W TABLE (Proc_ SYSNAME PRIMARY KEY, Def NVARCHAR(MAX), Skip BIT);
DECLARE @proc SYSNAME, @marker NVARCHAR(200), @def NVARCHAR(MAX), @nl NVARCHAR(2), @id INT, @anchor NVARCHAR(MAX),
        @repl NVARCHAR(MAX), @exp INT, @found INT, @bad INT;
DECLARE pc CURSOR LOCAL FAST_FORWARD FOR SELECT Proc_, MIN(Marker) FROM @E GROUP BY Proc_ ORDER BY Proc_;
OPEN pc; FETCH NEXT FROM pc INTO @proc, @marker;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @def = OBJECT_DEFINITION(OBJECT_ID(@proc));
    IF @def IS NULL
    BEGIN INSERT @Rep VALUES (@proc, N'NOT FOUND on this database'); SET @Fail += 1; END
    ELSE IF CHARINDEX(@marker, @def) > 0
    BEGIN INSERT @Rep VALUES (@proc, N'already patched - will be skipped'); INSERT @W VALUES (@proc, NULL, 1); END
    ELSE
    BEGIN
        SET @nl = CASE WHEN CHARINDEX(CHAR(13), @def) > 0 THEN CHAR(13) + CHAR(10) ELSE CHAR(10) END;
        SET @bad = 0;
        DECLARE ac CURSOR LOCAL FAST_FORWARD FOR SELECT Id, Anchor, Repl, Expected FROM @E WHERE Proc_ = @proc ORDER BY Id;
        OPEN ac; FETCH NEXT FROM ac INTO @id, @anchor, @repl, @exp;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @found = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @anchor, N''))) / DATALENGTH(@anchor);
            IF @found <> @exp
            BEGIN
                SET @bad += 1;
                INSERT @Rep VALUES (@proc, N'ANCHOR MISMATCH in edit ' + CAST(@id AS NVARCHAR(5)) + N': found ' + CAST(@found AS NVARCHAR(5)) + N' time(s), expected ' + CAST(@exp AS NVARCHAR(5)));
            END
            ELSE SET @def = REPLACE(@def, @anchor, REPLACE(@repl, N'{NL}', @nl));
            FETCH NEXT FROM ac INTO @id, @anchor, @repl, @exp;
        END
        CLOSE ac; DEALLOCATE ac;
        IF @bad > 0 SET @Fail += 1;
        ELSE BEGIN INSERT @Rep VALUES (@proc, N'ready to patch'); INSERT @W VALUES (@proc, @def, 0); END
    END
    FETCH NEXT FROM pc INTO @proc, @marker;
END
CLOSE pc; DEALLOCATE pc;

-- 3. new procedures
DECLARE @N TABLE (Name SYSNAME PRIMARY KEY, Body NVARCHAR(MAX));
INSERT @N (Name, Body) VALUES
  (N'proj.sp_GetBomLineDocs', N'-- BOM line -> the PRs / POs raised against it (drives the PR Qty / PO Qty click-through on the BOM page).
-- @Kind = ''PR'' : one row per active PR line linked to the BOM line
-- @Kind = ''PO'' : one row per active PO line whose PR line is linked to the BOM line
CREATE OR ALTER PROCEDURE PROJ.sp_GetBomLineDocs
    @BomDetailId INT = NULL,
    @Kind        NVARCHAR(2),
    @PrLineId    INT = NULL      -- PO kind only: POs raised against this one PR line (PR page)
AS
BEGIN
    SET NOCOUNT ON;

    IF @Kind = N''PR''
        SELECT pr.PrId       AS DocId,
               pr.PrNumber   AS DocNumber,
               pr.Status     AS DocStatus,
               prl.LineNum   AS LineNum,
               prl.RequiredQty AS Qty,
               prl.UomName   AS UomName,
               CAST(NULL AS DECIMAL(18,4)) AS UnitPrice,
               CAST(NULL AS NVARCHAR(10))  AS CurrencyCode,
               pr.PrDate     AS DocDate
        FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
        JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
        WHERE prl.BomDetailId = @BomDetailId AND prl.IsActive = 1 AND pr.IsActive = 1
        ORDER BY pr.PrDate, pr.PrId, prl.LineNum;
    ELSE
        SELECT po.PoId       AS DocId,
               po.PoNumber   AS DocNumber,
               po.Status     AS DocStatus,
               pol.LineNum   AS LineNum,
               pol.OrderedQty AS Qty,
               pol.UomName   AS UomName,
               pol.UnitPrice AS UnitPrice,
               cur.ShortName AS CurrencyCode,
               po.PoDate     AS DocDate
        FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
        JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
        JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId
        LEFT JOIN PROJ.TBL_CURRENCY cur ON cur.CurrencyId = po.CurrencyId
        WHERE pol.IsActive = 1 AND po.IsActive = 1
          AND ((@PrLineId IS NOT NULL AND pol.PrLineId = @PrLineId)
            OR (@PrLineId IS NULL     AND prl.BomDetailId = @BomDetailId))
        ORDER BY po.PoDate, po.PoId, pol.LineNum;
END'),
  (N'proj.sp_GetJobBudgetBreakdown', N'-- Job Overview > Budget vs Actual: PO / Issue / Return per cost category.
--   PO     = committed PO value (same rules as VW_JOB_COST_ACTUAL: not Draft/Cancelled, costed job types only)
--   Issue  = confirmed stock issue notes, INCLUDE-in-costing only (EXC_COSTING stock is already costed via its PO),
--            qty * UnitCost, category taken from the item''s BudgetCategoryId
--   Return = confirmed/approved returns against those same INC_COSTING issue notes, ReturnQty * UnitCost
-- Items with no BudgetCategoryId come back with CostCategoryId = NULL (shown as "Unallocated").
-- VW_JOB_COST_ACTUAL is deliberately NOT changed: sp_GetJobOverview already adds issues and subtracts
-- returns at job level, so putting them in the view would double count there.
CREATE OR ALTER PROCEDURE PROJ.sp_GetJobBudgetBreakdown
    @JobId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    WITH Parts AS (
        SELECT po.ExpenseCategoryId AS CostCategoryId,
               proj.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate) AS PoAmount,
               CAST(0 AS DECIMAL(18,2)) AS IssueAmount,
               CAST(0 AS DECIMAL(18,2)) AS ReturnAmount
        FROM PROJ.TBL_PURCHASE_ORDER po
        JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1
        JOIN PROJ.TBL_JOB j ON j.JobId = po.JobId
        JOIN PROJ.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
        WHERE po.JobId = @JobId AND po.IsActive = 1
          AND po.Status NOT IN (''Draft'',''Cancelled'') AND po.ExpenseCategoryId IS NOT NULL
          AND ISNULL(jt.IsCostingRequired, 1) = 1

        UNION ALL
        SELECT itm.BudgetCategoryId, 0, il.Qty * il.UnitCost, 0
        FROM PROJ.TBL_STOCK_ISSUE i
        JOIN PROJ.TBL_STOCK_ISSUE_LINE il ON il.IssueId = i.IssueId AND il.IsActive = 1
        LEFT JOIN PROJ.TBL_ITEM itm ON itm.ItemId = il.ItemId
        WHERE i.JobId = @JobId AND i.IsActive = 1
          AND i.Status = ''Confirmed'' AND i.CostingType = ''INC_COSTING''

        UNION ALL
        SELECT itm.BudgetCategoryId, 0, 0, rl.ReturnQty * rl.UnitCost
        FROM PROJ.TBL_STOCK_ISSUE_RETURN r
        JOIN PROJ.TBL_STOCK_ISSUE_RETURN_LINE rl ON rl.ReturnId = r.ReturnId
        JOIN PROJ.TBL_STOCK_ISSUE ri ON ri.IssueId = r.IssueId
        LEFT JOIN PROJ.TBL_ITEM itm ON itm.ItemId = rl.ItemId
        WHERE ri.JobId = @JobId AND r.IsActive = 1
          AND r.Status IN (''Confirmed'',''Approved'') AND ri.CostingType = ''INC_COSTING''
    )
    SELECT CostCategoryId,
           SUM(PoAmount)     AS PoAmount,
           SUM(IssueAmount)  AS IssueAmount,
           SUM(ReturnAmount) AS ReturnAmount
    FROM Parts
    GROUP BY CostCategoryId;
END');
INSERT @Rep VALUES (N'proj.sp_GetBomLineDocs', CASE WHEN OBJECT_ID(N'proj.sp_GetBomLineDocs') IS NULL THEN N'new - will be created' ELSE N'exists - will be replaced' END);
INSERT @Rep VALUES (N'proj.sp_GetJobBudgetBreakdown', CASE WHEN OBJECT_ID(N'proj.sp_GetJobBudgetBreakdown') IS NULL THEN N'new - will be created' ELSE N'exists - will be replaced' END);

-- 4. decide
IF @Fail > 0 INSERT @Rep VALUES (N'RESULT', N'STOP - do not apply; send this grid to Claude');
ELSE INSERT @Rep VALUES (N'RESULT', N'SAFE TO APPLY (nothing was changed by this check)');

SELECT Seq, Item, Status FROM @Rep ORDER BY Seq;
