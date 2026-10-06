/* =====================================================================================================
   MERGE enclosure jobs (database SYNERPINDIA)

     Group 1  ->  EC26-300003 :  EC26-300007, 300008, 300010, 300012, 300013, 300014, 300015   (37 Nos)
     Group 2  ->  EC26-300006 :  EC26-300009, 300011, 300016, 300017, 300018, 300019          (31 Nos)

   Choices made by the user (2026-10-05):
     - the 13 source jobs are CANCELLED afterwards, reason "Merged into <target>"
     - order value: EC26-300003 keeps 841,996,600 (it already carries the whole order);
                    EC26-300006 becomes the SUM of its group (681,510,000)
     - BOM lines are moved as separate lines (no consolidation), so every PR / PO link stays valid
     - merged job names show 37 Nos / 31 Nos

   WHAT IT CHANGES (all inside ONE transaction; any check failing or any error rolls EVERYTHING back):
     PROJ.TBL_BOM_DETAILS   source jobs' BOM lines  -> moved under the target's BOM (BomHeaderId, JobId, SortOrder)
     PROJ.TBL_BOM_HEADER    source jobs' BOMs       -> IsActive = 0 (one active BOM per job is enforced)
     PROJ.TBL_PURCHASE_REQUEST / TBL_PURCHASE_ORDER  JobId -> target
     PROJ.TBL_JOB_BUDGET    per target: a NEW approved revision with each cost category = sum of the group's
                            current budgets; the old current rows (targets and sources) become IsCurrent = 0
                            (kept as history)
     PROJ.TBL_JOB_FINANCE   EC26-300006 order value = group sum; source jobs' order value -> 0
     PROJ.TBL_JOB           target names; source jobs -> Cancelled (status 5) with reason
     PROJ.TBL_JOB_AUDIT     one 'JOB_MERGE' row per job (old values recorded)
   Nothing is deleted. Stock, GRNs, receipts, issues, invoices are untouched (the safety check below stops
   the script if any source job turns out to own such a document).

   BEFORE RUNNING IN PRODUCTION:
     1. Take a full backup of SYNERPINDIA (BACKUP DATABASE SYNERPINDIA TO DISK = N'C:\ERP\_backups\...bak' WITH INIT, CHECKSUM).
     2. Run it in SSMS with SYNERPINDIA selected. It ends with COMMIT. Read the result sets it prints.
   ===================================================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;

DECLARE @By NVARCHAR(50) = N'JobMerge-20261005';

IF OBJECT_ID('tempdb..#M')      IS NOT NULL DROP TABLE #M;
IF OBJECT_ID('tempdb..#Before') IS NOT NULL DROP TABLE #Before;
IF OBJECT_ID('tempdb..#Bad')    IS NOT NULL DROP TABLE #Bad;
IF OBJECT_ID('tempdb..#Agg')    IS NOT NULL DROP TABLE #Agg;
IF OBJECT_ID('tempdb..#Rv')     IS NOT NULL DROP TABLE #Rv;
IF OBJECT_ID('tempdb..#OldFin') IS NOT NULL DROP TABLE #OldFin;

-- Ord = position of the source job inside its group (used only to keep moved BOM lines grouped by source job)
CREATE TABLE #M (JobId NVARCHAR(50) NOT NULL PRIMARY KEY, Tgt NVARCHAR(50) NOT NULL, IsSrc BIT NOT NULL, Ord INT NOT NULL);
INSERT #M (JobId, Tgt, IsSrc, Ord) VALUES
 (N'EC26-300003', N'EC26-300003', 0, 0),
 (N'EC26-300007', N'EC26-300003', 1, 1), (N'EC26-300008', N'EC26-300003', 1, 2), (N'EC26-300010', N'EC26-300003', 1, 3),
 (N'EC26-300012', N'EC26-300003', 1, 4), (N'EC26-300013', N'EC26-300003', 1, 5), (N'EC26-300014', N'EC26-300003', 1, 6),
 (N'EC26-300015', N'EC26-300003', 1, 7),
 (N'EC26-300006', N'EC26-300006', 0, 0),
 (N'EC26-300009', N'EC26-300006', 1, 1), (N'EC26-300011', N'EC26-300006', 1, 2), (N'EC26-300016', N'EC26-300006', 1, 3),
 (N'EC26-300017', N'EC26-300006', 1, 4), (N'EC26-300018', N'EC26-300006', 1, 5), (N'EC26-300019', N'EC26-300006', 1, 6);

-- ── SAFETY CHECKS: nothing is changed if any of these fail ───────────────────────────────────────────────
IF (SELECT COUNT(*) FROM PROJ.TBL_JOB j JOIN #M m ON m.JobId = j.JobId) <> 15
    THROW 50001, 'Merge aborted: not all 15 jobs exist in this database. Are you in SYNERPINDIA?', 1;
IF EXISTS (SELECT 1 FROM PROJ.TBL_JOB j JOIN #M m ON m.JobId = j.JobId WHERE j.JobTypeId <> N'EC')
    THROW 50002, 'Merge aborted: one of the jobs is not an Enclosure (EC) job.', 1;
IF EXISTS (SELECT 1 FROM PROJ.TBL_JOB j JOIN #M m ON m.JobId = j.JobId WHERE m.IsSrc = 1 AND j.JobStatusId <> 1)
    THROW 50003, 'Merge aborted: a source job is no longer Active (already merged, cancelled or closed?).', 1;
IF (SELECT COUNT(DISTINCT j.CustomerId) FROM PROJ.TBL_JOB j JOIN #M m ON m.JobId = j.JobId) <> 1
    THROW 50004, 'Merge aborted: the jobs do not all belong to the same customer.', 1;
IF (SELECT COUNT(DISTINCT CONCAT(ISNULL(j.JobCurrencyId,0), N'|', ISNULL(j.JobExcRate,0))) FROM PROJ.TBL_JOB j JOIN #M m ON m.JobId = j.JobId) <> 1
    THROW 50005, 'Merge aborted: the jobs do not all use the same currency / exchange rate.', 1;
IF EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET b JOIN #M m ON m.JobId = b.JobId
           WHERE b.IsCurrent = 1 AND (ISNULL(b.CurrencyId,1) <> 1 OR ISNULL(b.ExchangeRate,1) <> 1))
    THROW 50006, 'Merge aborted: a current budget row is not in base currency (rate 1).', 1;
IF (SELECT COUNT(*) FROM PROJ.TBL_BOM_HEADER h JOIN #M m ON m.JobId = h.JobId WHERE m.IsSrc = 0 AND h.IsActive = 1) <> 2
    THROW 50007, 'Merge aborted: each target job must have exactly one active BOM.', 1;
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET b WHERE b.JobId = N'EC26-300003' AND b.IsCurrent = 1 AND b.IsApproved = 1)
   OR NOT EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET b WHERE b.JobId = N'EC26-300006' AND b.IsCurrent = 1 AND b.IsApproved = 1)
    THROW 50008, 'Merge aborted: a target job has no approved current budget.', 1;
IF EXISTS (SELECT 1 FROM PROJ.TBL_JOB j WHERE j.ParentJobId IN (SELECT JobId FROM #M WHERE IsSrc = 1))
    THROW 50009, 'Merge aborted: another job has one of the source jobs as its parent job.', 1;
IF EXISTS (SELECT 1 FROM PROJ.TBL_STOCK_TRANSFER t WHERE t.FromJobId IN (SELECT JobId FROM #M WHERE IsSrc = 1) OR t.ToJobId IN (SELECT JobId FROM #M WHERE IsSrc = 1))
    THROW 50010, 'Merge aborted: a stock transfer references a source job.', 1;

-- Any table other than the ones this script handles that holds rows for a SOURCE job (stock, GRN, issues, invoices, manhours, expenses...).
CREATE TABLE #Bad (tbl SYSNAME NOT NULL);
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'SELECT N''' + t.name + N''' FROM PROJ.' + QUOTENAME(t.name)
             + N' WHERE JobId IN (SELECT JobId FROM #M WHERE IsSrc = 1) UNION ALL '
FROM sys.tables t
WHERE t.schema_id = SCHEMA_ID(N'PROJ')
  AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = t.object_id AND c.name = N'JobId')
  AND t.name NOT IN (N'TBL_JOB', N'TBL_PURCHASE_REQUEST', N'TBL_PURCHASE_ORDER', N'TBL_BOM_HEADER', N'TBL_BOM_DETAILS',
                     N'TBL_JOB_BUDGET', N'TBL_JOB_AUDIT', N'TBL_JOB_DATES', N'TBL_JOB_ENGINEER', N'TBL_JOB_FINANCE',
                     N'TBL_JOB_META', N'TBL_JOB_TERMS', N'TBL_JOB_SETTING');
IF LEN(@sql) > 0
BEGIN
    SET @sql = LEFT(@sql, LEN(@sql) - 10);
    INSERT #Bad EXEC (@sql);
END
IF EXISTS (SELECT 1 FROM #Bad)
BEGIN
    SELECT DISTINCT tbl AS TableThatHoldsRowsForASourceJob FROM #Bad;
    THROW 50011, 'Merge aborted: a source job owns documents this script does not move (see the table list above).', 1;
END

-- ── SNAPSHOT of what must be conserved ───────────────────────────────────────────────────────────────────
CREATE TABLE #Before (Tgt NVARCHAR(50) PRIMARY KEY, Pr INT, Po INT, BomLines INT, BudgetBase DECIMAL(18,2), OrderValue DECIMAL(18,2));
INSERT #Before (Tgt, Pr, Po, BomLines, BudgetBase, OrderValue)
SELECT t.Tgt,
  (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST x JOIN #M mm ON mm.JobId = x.JobId WHERE mm.Tgt = t.Tgt),
  (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER   x JOIN #M mm ON mm.JobId = x.JobId WHERE mm.Tgt = t.Tgt),
  (SELECT COUNT(*) FROM PROJ.TBL_BOM_DETAILS      x JOIN #M mm ON mm.JobId = x.JobId WHERE mm.Tgt = t.Tgt),
  (SELECT SUM(ISNULL(x.AmountInBaseCurrency, x.BudgetedAmount)) FROM PROJ.TBL_JOB_BUDGET x JOIN #M mm ON mm.JobId = x.JobId WHERE mm.Tgt = t.Tgt AND x.IsCurrent = 1),
  (SELECT SUM(x.OrderValue) FROM PROJ.TBL_JOB_FINANCE x JOIN #M mm ON mm.JobId = x.JobId WHERE mm.Tgt = t.Tgt)
FROM (SELECT DISTINCT Tgt FROM #M) t;

SELECT 'BEFORE' AS stage, * FROM #Before ORDER BY Tgt;

BEGIN TRAN;

-- Old finance values, kept for the audit rows
SELECT f.JobId, f.OrderValue AS OldOrderValue INTO #OldFin FROM PROJ.TBL_JOB_FINANCE f JOIN #M m ON m.JobId = f.JobId;

-- ── 1. BOM: lines move under the target's active BOM; the source BOMs are switched off ──────────────────
UPDATE d
   SET d.BomHeaderId = th.BomHeaderId,
       d.JobId       = m.Tgt,
       d.SortOrder   = ISNULL(d.SortOrder, 0) + m.Ord * 1000
FROM PROJ.TBL_BOM_DETAILS d
JOIN #M m ON m.JobId = d.JobId AND m.IsSrc = 1
JOIN PROJ.TBL_BOM_HEADER th ON th.JobId = m.Tgt AND th.IsActive = 1;

UPDATE h SET h.IsActive = 0, h.ModifiedBy = @By, h.ModifiedDate = GETDATE()
FROM PROJ.TBL_BOM_HEADER h JOIN #M m ON m.JobId = h.JobId AND m.IsSrc = 1
WHERE h.IsActive = 1;

-- ── 2. PRs and POs ───────────────────────────────────────────────────────────────────────────────────────
UPDATE x SET x.JobId = m.Tgt FROM PROJ.TBL_PURCHASE_REQUEST x JOIN #M m ON m.JobId = x.JobId AND m.IsSrc = 1;
UPDATE x SET x.JobId = m.Tgt FROM PROJ.TBL_PURCHASE_ORDER   x JOIN #M m ON m.JobId = x.JobId AND m.IsSrc = 1;

-- ── 3. Budget: a new approved revision on each target = sum of the group's current budgets ──────────────
SELECT m.Tgt, b.CostCategoryId,
       SUM(b.BudgetedAmount)                                AS Amt,
       SUM(ISNULL(b.AmountInBaseCurrency, b.BudgetedAmount)) AS BaseAmt,
       MAX(b.UomId)                                         AS UomId,
       MAX(b.CurrencyId)                                    AS CurrencyId
INTO #Agg
FROM PROJ.TBL_JOB_BUDGET b JOIN #M m ON m.JobId = b.JobId
WHERE b.IsCurrent = 1
GROUP BY m.Tgt, b.CostCategoryId;

SELECT t.Tgt, (SELECT MAX(b.RvNo) FROM PROJ.TBL_JOB_BUDGET b WHERE b.JobId = t.Tgt) + 1 AS NewRv
INTO #Rv FROM (SELECT DISTINCT Tgt FROM #M) t;

UPDATE b SET b.IsCurrent = 0 FROM PROJ.TBL_JOB_BUDGET b JOIN #M m ON m.JobId = b.JobId WHERE b.IsCurrent = 1;

INSERT INTO PROJ.TBL_JOB_BUDGET
    (JobId, CostCategoryId, BudgetedAmount, Notes, CreatedBy, CreatedDate, RvNo, Qty, UnitPrice, UomId,
     IsApproved, ApprovedBy, ApprovedDate, IsCurrent, CurrencyId, ExchangeRate, AmountInBaseCurrency,
     ApprovalReason, RevisionReason, RevisedBy, RevisedDate)
SELECT a.Tgt, a.CostCategoryId, a.Amt,
       CONCAT(N'Merged budget of ', a.Tgt, N' and the jobs merged into it'),
       @By, GETDATE(), r.NewRv, 1, a.Amt, a.UomId,
       1, @By, GETDATE(), 1, a.CurrencyId, 1, a.BaseAmt,
       N'Job merge: budgets of the merged jobs added up',
       CONCAT(N'Jobs merged into ', a.Tgt), @By, GETDATE()
FROM #Agg a JOIN #Rv r ON r.Tgt = a.Tgt;

-- ── 4. Order value: EC26-300006 = group sum; EC26-300003 keeps its value; sources go to 0 (BalanceAmount is a computed column) ──
DECLARE @G2 DECIMAL(18,2) = (SELECT SUM(OrderValue) FROM PROJ.TBL_JOB_FINANCE f JOIN #M m ON m.JobId = f.JobId WHERE m.Tgt = N'EC26-300006');
UPDATE f SET f.OrderValue = 0, f.ModifiedBy = @By, f.ModifiedDate = GETDATE()
FROM PROJ.TBL_JOB_FINANCE f JOIN #M m ON m.JobId = f.JobId WHERE m.IsSrc = 1;
UPDATE PROJ.TBL_JOB_FINANCE SET OrderValue = @G2, ModifiedBy = @By, ModifiedDate = GETDATE()
WHERE JobId = N'EC26-300006';

-- ── 5. Names and the 13 source jobs ──────────────────────────────────────────────────────────────────────
UPDATE PROJ.TBL_JOB SET ProjectName = N'AWS HYD 102 ( ROMP 1 to 12 ) ( 2800 kW - 37 Nos)',
       JobLastUpdatedDate = GETDATE(), JobLastModifiedBy = @By WHERE JobId = N'EC26-300003';
UPDATE PROJ.TBL_JOB SET ProjectName = N'AWS HYD 112 ( ROMP 1 to 10 ) ( 2800 kW - 30 Nos & 1000kW - 1 Nos)',
       JobLastUpdatedDate = GETDATE(), JobLastModifiedBy = @By WHERE JobId = N'EC26-300006';

UPDATE j SET j.JobStatusId = 5, j.CancelledDate = GETDATE(), j.CancelledBy = @By,
             j.CancelledReason = CONCAT(N'Merged into ', m.Tgt),
             j.JobLastUpdatedDate = GETDATE(), j.JobLastModifiedBy = @By
FROM PROJ.TBL_JOB j JOIN #M m ON m.JobId = j.JobId AND m.IsSrc = 1;

-- ── 6. Audit trail ───────────────────────────────────────────────────────────────────────────────────────
INSERT INTO PROJ.TBL_JOB_AUDIT (JobId, Action, Section, OldValue, NewValue, Remarks, CreatedBy, CreatedDate)
SELECT m.JobId, N'JOB_MERGE', N'Job',
       CONCAT(N'OrderValue=', CONVERT(NVARCHAR(40), o.OldOrderValue)),
       CASE WHEN m.IsSrc = 1 THEN CONCAT(N'Merged into ', m.Tgt, N' (cancelled)') ELSE N'Merge target' END,
       CASE WHEN m.IsSrc = 1 THEN N'PRs, POs, BOM lines and budget moved to ' + m.Tgt
            ELSE N'Received the PRs, POs, BOM lines and budget of the merged jobs' END,
       @By, GETDATE()
FROM #M m JOIN #OldFin o ON o.JobId = m.JobId;

-- ── POST-CHECKS: every count must be conserved, else everything is rolled back ──────────────────────────
IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST x JOIN #M m ON m.JobId = x.JobId WHERE m.IsSrc = 1)
   OR EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER x JOIN #M m ON m.JobId = x.JobId WHERE m.IsSrc = 1)
   OR EXISTS (SELECT 1 FROM PROJ.TBL_BOM_DETAILS x JOIN #M m ON m.JobId = x.JobId WHERE m.IsSrc = 1)
    THROW 50020, 'Merge rolled back: a source job still holds PRs / POs / BOM lines.', 1;

IF EXISTS (
    SELECT 1 FROM #Before b
    WHERE b.Pr       <> (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST WHERE JobId = b.Tgt)
       OR b.Po       <> (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER   WHERE JobId = b.Tgt)
       OR b.BomLines <> (SELECT COUNT(*) FROM PROJ.TBL_BOM_DETAILS      WHERE JobId = b.Tgt))
    THROW 50021, 'Merge rolled back: PR / PO / BOM line counts on a target do not equal the group total.', 1;

IF EXISTS (
    SELECT 1 FROM #Before b
    WHERE b.BudgetBase <> (SELECT SUM(ISNULL(AmountInBaseCurrency, BudgetedAmount)) FROM PROJ.TBL_JOB_BUDGET WHERE JobId = b.Tgt AND IsCurrent = 1))
    THROW 50022, 'Merge rolled back: the new current budget on a target does not equal the group total.', 1;

IF (SELECT COUNT(*) FROM PROJ.TBL_BOM_HEADER h JOIN #M m ON m.JobId = h.JobId WHERE h.IsActive = 1) <> 2
    THROW 50023, 'Merge rolled back: expected exactly one active BOM per target and none on the source jobs.', 1;

SELECT 'AFTER' AS stage, t.Tgt,
  (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST WHERE JobId = t.Tgt) AS Pr,
  (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER   WHERE JobId = t.Tgt) AS Po,
  (SELECT COUNT(*) FROM PROJ.TBL_BOM_DETAILS      WHERE JobId = t.Tgt) AS BomLines,
  (SELECT SUM(ISNULL(AmountInBaseCurrency, BudgetedAmount)) FROM PROJ.TBL_JOB_BUDGET WHERE JobId = t.Tgt AND IsCurrent = 1) AS BudgetBase,
  (SELECT OrderValue FROM PROJ.TBL_JOB_FINANCE WHERE JobId = t.Tgt) AS OrderValue,
  (SELECT TotalBomValue FROM PROJ.TBL_BOM_HEADER WHERE JobId = t.Tgt AND IsActive = 1) AS TotalBomValue
FROM (SELECT DISTINCT Tgt FROM #M) t ORDER BY t.Tgt;

SELECT j.JobId, j.JobStatusId, j.CancelledReason FROM PROJ.TBL_JOB j JOIN #M m ON m.JobId = j.JobId ORDER BY m.Tgt, j.JobId;

COMMIT TRAN;
PRINT 'Merge committed.';
