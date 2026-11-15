-- 2026-10-28: BOM line 336 (job EC26-300002) had its item changed after a PR was raised on it.
-- PR-26-0078 line 245 asked for BOT 29 (Rubber Sheet 10 mm x 1200 mm x 10 Mtr), PO-26-0525 ordered and received BOT 29,
-- but the BOM line now holds 155006 (Black Rubber sheet 10mm). The BOM item is put back to the item that was ordered.
-- Changes ONLY ItemId, ModifiedBy and ModifiedDate on BOM line 336. No PR, PO, GRN, price or quantity is touched.
-- Guarded: runs only while the BOM line still holds 155006 and its only PR line is line 245. Safe to run twice.
-- Run per database, one at a time (SYNERPINDIA only; SYNERPUAE has no such line).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

SELECT bd.BomId, bd.JobId, bd.ItemId AS StoredItemId, i.ItemCode AS StoredItem, n.ItemId AS NewItemId, n.ItemCode AS NewItem
FROM proj.TBL_BOM_DETAILS bd
LEFT JOIN proj.TBL_ITEM i ON i.ItemId = bd.ItemId
LEFT JOIN proj.TBL_ITEM n ON n.ItemId = 35231 AND n.ItemCode = 'BOT 29'
WHERE bd.BomId = 336;
GO

UPDATE bd
SET bd.ItemId = 35231, bd.ModifiedBy = 'BOM_ITEM_REPAIR', bd.ModifiedDate = GETDATE()
FROM proj.TBL_BOM_DETAILS bd
WHERE bd.BomId = 336 AND bd.ItemId = 36758
  AND EXISTS (SELECT 1 FROM proj.TBL_ITEM WHERE ItemId = 35231 AND ItemCode = 'BOT 29')
  AND NOT EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_REQUEST_LINE WHERE BomDetailId = 336 AND IsActive = 1 AND PrLineId <> 245);
PRINT CONCAT('BOM lines repaired: ', @@ROWCOUNT);
GO
