-- Fill the REMAINING TBL_ITEM.BudgetCategoryId by item name / item category (2026-09-26).
-- Plain UPDATEs, run top to bottom in the target database (SYNERPINDIA, then SYNERPUAE). No USE - check the database dropdown.
-- Every statement changes ONLY rows where BudgetCategoryId IS NULL, so nothing already linked is touched and the order decides
-- (the first matching rule wins). Rules copy how the items that are ALREADY linked were categorised.
-- RUN AFTER PROD_2026-09-25_item_budgetcategory_simple.sql (the ItemCode list). Do not run this one first on a database.

-- 1. Hinges / door closers -> Enclosure Accessories
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'ENCLOSURE')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND (i.ItemName LIKE '%hinge%' OR LTRIM(RTRIM(c.CategoryName)) = 'Hinges');

-- 2. Dampers, drift eliminators -> Bought Outs
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'BOUGHT_OUT')
FROM PROJ.TBL_ITEM i
WHERE i.BudgetCategoryId IS NULL AND (i.ItemName LIKE '%damper%' OR i.ItemName LIKE '%drift eliminator%');

-- 3. Exhaust / ventilation fans -> Fan
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'FAN')
FROM PROJ.TBL_ITEM i
WHERE i.BudgetCategoryId IS NULL AND i.ItemName LIKE '%exhaust ventilation fan%';

-- 4. Transport -> Transportation & Logistics
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'TRANSPORT')
FROM PROJ.TBL_ITEM i
WHERE i.BudgetCategoryId IS NULL AND i.ItemName LIKE '%transportation%';

-- 5. Sub contract work -> Sub Contract
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'SUBCON')
FROM PROJ.TBL_ITEM i
WHERE i.BudgetCategoryId IS NULL AND (i.ItemName LIKE '%sub contract%' OR i.ItemName LIKE '%subcontract%');

-- 6. Heat shrink -> Electrical Materials
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'ELEC_MAT')
FROM PROJ.TBL_ITEM i
WHERE i.BudgetCategoryId IS NULL AND i.ItemName LIKE '%heat shrink%';

-- 7. Pipe fittings (pipes, elbows, tees, unions, reducers, flanges, NPT / BSPT, nipples) -> Pipes & Fittings
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'PIPES')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND (
      i.ItemName LIKE '%erw pipe%' OR i.ItemName LIKE '%bspt%' OR i.ItemName LIKE '%npt%'
   OR i.ItemName LIKE '%barrel nipple%' OR i.ItemName LIKE 'hex socket%' OR i.ItemName LIKE 'hex adapter%'
   OR LTRIM(RTRIM(c.CategoryName)) IN ('MS Elbow Weldable', 'MS Pipe', 'MS SORF Flange', 'MS Threaded Flange', 'MS TEE', 'MS Union', 'MS Reducer'));

-- 8. Steel (plate, sheet, channel, angle, hollow section, flat bar) -> Steel Materials
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'STEEL')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND LTRIM(RTRIM(c.CategoryName)) IN
      ('Mild Steel', 'MS Plate', 'MS Channel', 'MS Equal Angle', 'MS Square hollow section', 'SS Plate', 'GI Sheet');

-- 9. Paints and their thinners / hardeners -> Blasting & Paint
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'BLAST_PAINT')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND (
      LTRIM(RTRIM(c.CategoryName)) = 'Sigma'
   OR i.ItemName LIKE '%thinner%' OR i.ItemName LIKE '%hardner%' OR i.ItemName LIKE '%hardener%'
   OR i.ItemName LIKE '%polyurathane%' OR i.ItemName LIKE '%epoxy%');

-- 10. Rock wool / glass wool -> Insulation Materials
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'INSULATION')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND (
      i.ItemName LIKE '%rockwool%' OR i.ItemName LIKE '%rock wool%' OR i.ItemName LIKE '%glass wool%'
   OR c.CategoryName LIKE 'Rock wool%');

-- 11. Bellows / fabric, rubber foam, bitumen and gypsum sheets, gaskets -> Bought Outs
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'BOUGHT_OUT')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND (
      i.ItemName LIKE '%gasket%'
   OR c.CategoryName LIKE 'Expansion%Bellow%' OR c.CategoryName LIKE 'Rubber%Foam%Sheet%');

-- 12. Consumables, welding and grinding consumables, fasteners, washers -> Consumables
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'CONSUMABLE')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND (
      LTRIM(RTRIM(c.CategoryName)) IN ('General Consumables', 'Welding Consumables', 'Grinding Wheel & Bur', 'Grade 8.8 GI', 'Grade SS 316')
   OR c.CategoryName LIKE 'Allen%Bolts%' OR c.CategoryName LIKE 'Anchor%Bolt%'
   OR i.ItemName LIKE '%washer%'
   OR i.ItemTypeId IN (SELECT ItemTypeId FROM PROJ.TBL_ITEM_TYPE WHERE TypeName = 'Consumable'));

-- 13. Instruments (level, flow, leak detectors, valves, gauges, control panels) -> Instrumentation
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'INSTRU')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND (LTRIM(RTRIM(c.CategoryName)) = 'Instrumentation' OR c.CategoryName LIKE 'Gauges%');

-- 14. Electrical accessories (switches, cable, conduit, UL listed fittings, transformers) -> Electrical Materials
UPDATE i SET i.BudgetCategoryId = (SELECT ExpenseCategoryId FROM PROJ.TBL_JOB_EXPENSE_CATEGORY WHERE CategoryCode = 'ELEC_MAT')
FROM PROJ.TBL_ITEM i LEFT JOIN PROJ.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
WHERE i.BudgetCategoryId IS NULL AND LTRIM(RTRIM(c.CategoryName)) = 'Electrical accessories';

-- Check: how many are still without a category, and which (machines and anything unusual - decide these by hand)
SELECT COUNT(*) AS StillWithoutCategory FROM PROJ.TBL_ITEM WHERE BudgetCategoryId IS NULL;
SELECT ItemId, ItemCode, ItemName FROM PROJ.TBL_ITEM WHERE BudgetCategoryId IS NULL ORDER BY ItemName;
