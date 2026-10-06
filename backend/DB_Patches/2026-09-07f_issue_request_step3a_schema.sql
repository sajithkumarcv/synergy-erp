-- 2026-09-07: Issue Request — BUILD STEP 3a of 5: link the Issue Note to the request
--
-- Apply to: ERPDB
-- Requires: 2026-09-07b/c/d/e (steps 1 and 2)
-- Design:   backend/Docs/DESIGN-issue-request.md §4, §10 step 3
--
-- Schema only. The procedures that USE these columns are step 3b
-- (2026-09-07g); until that runs, these four columns are inert and the
-- application behaves exactly as it does today.
--
-- ⚠ READ THIS BEFORE APPLYING 3b: `RequiresRequest` defaults to 1 for both issue
-- types, which is decision 3 in the design — every issue note must quote an
-- approved request. It has NO effect until 3b teaches sp_ConfirmStockIssue to
-- check it, but once 3b is applied the store cannot issue anything without an
-- approved ISR. To relax it for a type later, it is a one-row UPDATE, not a patch:
--     UPDATE proj.TBL_ISSUE_TYPE SET RequiresRequest = 0 WHERE IssueTypeCode = 'EXC_COSTING';
--
-- Idempotent — every ALTER is guarded, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ─── 1. Issue Note → request header link ───────────────────────────────────
   Nullable on purpose: it keeps a direct issue structurally possible, and
   sp_ConfirmStockIssue (3b) is what refuses a new note without a request. */
IF COL_LENGTH('proj.TBL_STOCK_ISSUE', 'RequestId') IS NULL
BEGIN
    ALTER TABLE proj.TBL_STOCK_ISSUE ADD RequestId INT NULL;
    PRINT 'Added TBL_STOCK_ISSUE.RequestId';
END
ELSE PRINT 'TBL_STOCK_ISSUE.RequestId already exists — skipped';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_STOCK_ISSUE_REQUEST')
BEGIN
    ALTER TABLE proj.TBL_STOCK_ISSUE WITH CHECK
        ADD CONSTRAINT FK_STOCK_ISSUE_REQUEST FOREIGN KEY (RequestId)
        REFERENCES proj.TBL_STOCK_ISSUE_REQUEST (RequestId);
    PRINT 'Added FK_STOCK_ISSUE_REQUEST';
END
GO

/* ─── 2. Issue Note gets a real issue type ──────────────────────────────────
   The note has only ever had CostingType nvarchar(20) holding the code as text,
   so RequiresRequest had nothing to test against. CostingType is kept in step
   with IssueTypeId until the text column can be retired. */
IF COL_LENGTH('proj.TBL_STOCK_ISSUE', 'IssueTypeId') IS NULL
BEGIN
    ALTER TABLE proj.TBL_STOCK_ISSUE ADD IssueTypeId INT NULL;
    PRINT 'Added TBL_STOCK_ISSUE.IssueTypeId';
END
ELSE PRINT 'TBL_STOCK_ISSUE.IssueTypeId already exists — skipped';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_STOCK_ISSUE_ISSUETYPE')
BEGIN
    ALTER TABLE proj.TBL_STOCK_ISSUE WITH CHECK
        ADD CONSTRAINT FK_STOCK_ISSUE_ISSUETYPE FOREIGN KEY (IssueTypeId)
        REFERENCES proj.TBL_ISSUE_TYPE (IssueTypeId);
    PRINT 'Added FK_STOCK_ISSUE_ISSUETYPE';
END
GO

-- Backfill: CostingType is 1:1 with IssueTypeCode. Dev has zero issue notes, so
-- this is a no-op here, but it ships for any database that does have them.
UPDATE si
SET si.IssueTypeId = it.IssueTypeId
FROM proj.TBL_STOCK_ISSUE si
JOIN proj.TBL_ISSUE_TYPE  it ON it.IssueTypeCode = si.CostingType
WHERE si.IssueTypeId IS NULL;
GO

/* ─── 3. Issue Note line → request line link ────────────────────────────────
   This is what drives IssuedQty back onto the request in 3b. */
IF COL_LENGTH('proj.TBL_STOCK_ISSUE_LINE', 'RequestLineId') IS NULL
BEGIN
    ALTER TABLE proj.TBL_STOCK_ISSUE_LINE ADD RequestLineId INT NULL;
    PRINT 'Added TBL_STOCK_ISSUE_LINE.RequestLineId';
END
ELSE PRINT 'TBL_STOCK_ISSUE_LINE.RequestLineId already exists — skipped';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_STOCK_ISSUE_LINE_REQUESTLINE')
BEGIN
    ALTER TABLE proj.TBL_STOCK_ISSUE_LINE WITH CHECK
        ADD CONSTRAINT FK_STOCK_ISSUE_LINE_REQUESTLINE FOREIGN KEY (RequestLineId)
        REFERENCES proj.TBL_STOCK_ISSUE_REQUEST_LINE (RequestLineId);
    PRINT 'Added FK_STOCK_ISSUE_LINE_REQUESTLINE';
END
GO

CREATE NONCLUSTERED INDEX IX_STOCK_ISSUE_LINE_REQUESTLINE
    ON proj.TBL_STOCK_ISSUE_LINE (RequestLineId) WHERE RequestLineId IS NOT NULL;
GO

/* ─── 4. Does this issue type need a request first? ─────────────────────────
   Decision 3: yes, for everything — but as a column, not hardwired, so it can
   be relaxed per type later as a settings change rather than a patch. */
IF COL_LENGTH('proj.TBL_ISSUE_TYPE', 'RequiresRequest') IS NULL
BEGIN
    ALTER TABLE proj.TBL_ISSUE_TYPE ADD RequiresRequest BIT NOT NULL
        CONSTRAINT DF_ISSUETYPE_REQUIRESREQUEST DEFAULT (1);
    PRINT 'Added TBL_ISSUE_TYPE.RequiresRequest (default 1)';
END
ELSE PRINT 'TBL_ISSUE_TYPE.RequiresRequest already exists — skipped';
GO

/* ─── Verify ────────────────────────────────────────────────────────────── */
SELECT 'TBL_STOCK_ISSUE.RequestId'          AS Column_, CASE WHEN COL_LENGTH('proj.TBL_STOCK_ISSUE','RequestId')          IS NULL THEN 'MISSING' ELSE 'OK' END AS Result
UNION ALL SELECT 'TBL_STOCK_ISSUE.IssueTypeId',         CASE WHEN COL_LENGTH('proj.TBL_STOCK_ISSUE','IssueTypeId')        IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'TBL_STOCK_ISSUE_LINE.RequestLineId',  CASE WHEN COL_LENGTH('proj.TBL_STOCK_ISSUE_LINE','RequestLineId') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'TBL_ISSUE_TYPE.RequiresRequest',      CASE WHEN COL_LENGTH('proj.TBL_ISSUE_TYPE','RequiresRequest')     IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'Issue notes missing IssueTypeId',     CAST((SELECT COUNT(*) FROM proj.TBL_STOCK_ISSUE WHERE IssueTypeId IS NULL) AS NVARCHAR(10)) + ' rows (0 = fully backfilled)';
GO

SELECT IssueTypeId, IssueTypeCode, IssueTypeName, RequiresRequest FROM proj.TBL_ISSUE_TYPE ORDER BY IssueTypeId;
GO
