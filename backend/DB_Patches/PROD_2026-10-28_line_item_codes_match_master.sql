-- 2026-10-28: make the item code stored on PR / PO / GRN lines equal the item master code.
-- Found on the SYNERPINDIA restore (6 lines): the item was renamed in the master after the document was saved, so the
-- line still carries the old code (BOT40 -> M12X50 GI on PR-26-0379, PO-26-0456, GRN-26-0311;
-- SC LC&B -> 1600093 on PR-26-0171, PR-26-0174, PO-26-0151). The line's ItemId is correct; only the copied text is old.
-- Changes ItemCode only. Not the description, quantity, price or status. Each line is matched on its own ItemId.
-- Part 1 is read-only. Part 2 changes only the lines Part 1 lists.
-- The update fires TR_PRLine_RecalcStatus / TR_POLine_RecalcStatus (they recompute line status from quantities that do not change here).
-- Run per database, one at a time. Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

-- ── Part 1: read-only ───────────────────────────────────────────────────────
SELECT 'PR' AS Doc, h.PrNumber AS DocNo, r.PrLineId AS LineId, r.ItemCode AS StoredCode, i.ItemCode AS MasterCode, h.Status
FROM proj.TBL_PURCHASE_REQUEST_LINE r JOIN proj.TBL_PURCHASE_REQUEST h ON h.PrId = r.PrId
JOIN proj.TBL_ITEM i ON i.ItemId = r.ItemId WHERE r.IsActive = 1 AND r.ItemCode <> i.ItemCode
UNION ALL
SELECT 'PO', p.PoNumber, r.PoLineId, r.ItemCode, i.ItemCode, p.Status
FROM proj.TBL_PURCHASE_ORDER_LINE r JOIN proj.TBL_PURCHASE_ORDER p ON p.PoId = r.PoId
JOIN proj.TBL_ITEM i ON i.ItemId = r.ItemId WHERE r.IsActive = 1 AND r.ItemCode <> i.ItemCode
UNION ALL
SELECT 'GRN', h.GrnNumber, g.GrnDetailId, g.ItemCode, i.ItemCode, h.Status
FROM proj.TBL_GRN_DETAIL g JOIN proj.TBL_GRN_HEADER h ON h.GrnId = g.GrnId
JOIN proj.TBL_ITEM i ON i.ItemId = g.ItemId WHERE g.IsActive = 1 AND g.ItemCode <> i.ItemCode
ORDER BY 1, 2;
GO

-- ── Part 2: update (changes data) ───────────────────────────────────────────
BEGIN TRAN;

UPDATE r SET r.ItemCode = i.ItemCode
FROM proj.TBL_PURCHASE_REQUEST_LINE r JOIN proj.TBL_ITEM i ON i.ItemId = r.ItemId
WHERE r.IsActive = 1 AND r.ItemCode <> i.ItemCode;
PRINT CONCAT('PR lines updated: ', @@ROWCOUNT);

UPDATE r SET r.ItemCode = i.ItemCode
FROM proj.TBL_PURCHASE_ORDER_LINE r JOIN proj.TBL_ITEM i ON i.ItemId = r.ItemId
WHERE r.IsActive = 1 AND r.ItemCode <> i.ItemCode;
PRINT CONCAT('PO lines updated: ', @@ROWCOUNT);

UPDATE g SET g.ItemCode = i.ItemCode
FROM proj.TBL_GRN_DETAIL g JOIN proj.TBL_ITEM i ON i.ItemId = g.ItemId
WHERE g.IsActive = 1 AND g.ItemCode <> i.ItemCode;
PRINT CONCAT('GRN lines updated: ', @@ROWCOUNT);

COMMIT;
GO
