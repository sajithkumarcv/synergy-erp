-- Item 34927 (Fiber Laser Machine) was saved with an EMPTY Item Code (2026-07-27) because the form said "Auto if blank" but nothing
-- generates a code. Give it the code 34927 (its own item id: unique, traceable). Run in SYNERPINDIA, then SYNERPUAE.
-- Only changes a row whose code is still empty, so it is safe to run twice.
UPDATE PROJ.TBL_ITEM SET ItemCode = '34927'
WHERE ItemId = 34927 AND ItemCode = ''
  AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ITEM x WHERE x.ItemCode = '34927');

-- Check: no item may be left with an empty code (expect 0 rows)
SELECT ItemId, ItemName FROM PROJ.TBL_ITEM WHERE ItemCode IS NULL OR LTRIM(RTRIM(ItemCode)) = '';
