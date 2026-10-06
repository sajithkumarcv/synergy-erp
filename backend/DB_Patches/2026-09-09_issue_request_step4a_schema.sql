-- 2026-09-09: Issue Request — BUILD STEP 4a of 5: the reservation columns
--
-- Apply to: ERPDB
-- Requires: steps 1-3 (2026-09-07b .. i)
-- Design:   backend/Docs/DESIGN-issue-request.md §4, §9 answers 1/4/6
--
-- Step 4 is the one that actually solves the problem the feature exists for.
-- Until now, approving a request held nothing: two jobs could each raise a
-- request for the same 10 units, both be approved, and both believe the material
-- was theirs. This adds the hold.
--
-- Schema only; the procedures that maintain these columns are 4b.
-- Until 4b runs, QtyReserved stays 0 everywhere and nothing behaves differently.
--
-- ── QtyAvailable is a computed column, deliberately ──────────────────────────
-- Base already computes QtyStoreStock as ([QtyOnHand]-[QtyJobStock]) PERSISTED,
-- so the house pattern for "a quantity derived from other quantities" is a
-- computed column, not a subtraction repeated in every read path. One place to
-- get right instead of a dozen places to forget. Reservations apply to STORE
-- stock only (§9 answer 1) — job stock is committed to its job by definition —
-- so available = on hand, less job stock, less what is reserved.
--
-- ── The expiry period is a setting, not a constant ───────────────────────────
-- NOTE the key is NOT under the 'Biz.' namespace: it is read by procedures only
-- and must not be exposed to the browser. AppSettingsController serves 'Biz.*'
-- to the frontend; everything else stays server-side.
--
-- Idempotent — every step is guarded, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ─── 1. The hold itself ────────────────────────────────────────────────── */
IF COL_LENGTH('proj.TBL_STOCK_BALANCE', 'QtyReserved') IS NULL
BEGIN
    -- 18,4 to match QtyOnHand / QtyJobStock. (QtyStoreStock reports 19,4 only
    -- because that is the result type of subtracting two 18,4 columns.)
    ALTER TABLE proj.TBL_STOCK_BALANCE ADD QtyReserved DECIMAL(18,4) NOT NULL
        CONSTRAINT DF_BALANCE_QTYRESERVED DEFAULT (0);
    PRINT 'Added TBL_STOCK_BALANCE.QtyReserved';
END
ELSE PRINT 'TBL_STOCK_BALANCE.QtyReserved already exists — skipped';
GO

/* ─── 2. What is actually free to promise ───────────────────────────────── */
IF COL_LENGTH('proj.TBL_STOCK_BALANCE', 'QtyAvailable') IS NULL
BEGIN
    ALTER TABLE proj.TBL_STOCK_BALANCE ADD QtyAvailable
        AS ([QtyOnHand] - [QtyJobStock] - [QtyReserved]) PERSISTED;
    PRINT 'Added TBL_STOCK_BALANCE.QtyAvailable (computed, persisted)';
END
ELSE PRINT 'TBL_STOCK_BALANCE.QtyAvailable already exists — skipped';
GO

/* ─── 3. How long a hold survives without activity ──────────────────────────
   §9 answer 4, as revised: the window measures INACTIVITY, not age.
   sp_ConfirmStockIssue re-stamps ReservationExpiryDate on every partial issue,
   because a fixed 14-days-from-approval window would expire exactly the healthy
   partly-issued requests that are waiting on a purchase order. */
IF NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = 'Inventory.IssueRequest.ReservationDays')
BEGIN
    INSERT INTO proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES ('Inventory.IssueRequest.ReservationDays', '14',
            'Issue Request: days of inactivity before a stock reservation is released. The clock restarts on every partial issue, so an actively-issued request stays held indefinitely. 0 disables expiry.',
            'system', GETDATE());
    PRINT 'Added setting Inventory.IssueRequest.ReservationDays = 14';
END
ELSE PRINT 'Setting Inventory.IssueRequest.ReservationDays already exists — skipped';
GO

/* ─── Verify ────────────────────────────────────────────────────────────── */
SELECT 'TBL_STOCK_BALANCE.QtyReserved'  AS Item, CASE WHEN COL_LENGTH('proj.TBL_STOCK_BALANCE','QtyReserved')  IS NULL THEN 'MISSING' ELSE 'OK' END AS Result
UNION ALL SELECT 'TBL_STOCK_BALANCE.QtyAvailable', CASE WHEN COL_LENGTH('proj.TBL_STOCK_BALANCE','QtyAvailable') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'ReservationDays setting',        ISNULL((SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey='Inventory.IssueRequest.ReservationDays'),'MISSING');
GO

SELECT ItemId, QtyOnHand, QtyJobStock, QtyStoreStock, QtyReserved, QtyAvailable
FROM proj.TBL_STOCK_BALANCE ORDER BY ItemId;
GO
