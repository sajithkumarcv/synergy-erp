/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Scope: remaining TBL_ITEM_* detail tables not covered by the first
   migration script (which handled TBL_ITEM, TBL_ITEM_CATEGORY,
   TBL_ITEM_TYPE, TBL_ITEM_UOM already - confirmed matching row counts).

   Source row counts: TBL_ITEM_DETAIL=0, TBL_ITEM_PRICE=0,
   TBL_ITEM_SPECIFICATION=1, TBL_ITEM_SUPPLIER=0, TBL_ITEM_UOM_CONVERSION=0.
   Only TBL_ITEM_SPECIFICATION has real data right now; the other 4 are
   no-ops but included for completeness (harmless, inserts 0 rows).

   Verified before generating:
     - Column structures match exactly between source/target (no diffs)
     - SYNERP target is EMPTY (0 rows) for all 5 tables
     - Identity columns confirmed matching on both sides
     - No computed columns in any of these 5 tables
     - FK dependencies: TBL_ITEM_PRICE/TBL_ITEM_SUPPLIER depend on
       TBL_ITEM_DETAIL (in this script) + TBL_CURRENCY (already migrated);
       TBL_ITEM_DETAIL depends on TBL_ITEM (migrated) + TBL_COUNTRY
       (pre-existing); TBL_ITEM_SPECIFICATION/TBL_ITEM_UOM_CONVERSION
       depend on TBL_ITEM/TBL_ITEM_UOM (both already migrated)
   Order respects FK dependencies (parent before children).
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 1. TBL_ITEM_DETAIL (depends on TBL_ITEM + pre-existing TBL_COUNTRY)
SET IDENTITY_INSERT proj.TBL_ITEM_DETAIL ON;
INSERT INTO proj.TBL_ITEM_DETAIL
  (ItemDetailId, ItemId, SKUCode, CountryOfOriginId, StandardCost, Brand, Model, Colour, Size, Grade,
   SupplierPartNo, ManufacturerPartNo, ListPrice, Weight, WeightUom, LeadTimeDays, ShelfLifeDays,
   MinStockLevel, MaxStockLevel, ReorderLevel, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  ItemDetailId, ItemId, SKUCode, CountryOfOriginId, StandardCost, Brand, Model, Colour, Size, Grade,
  SupplierPartNo, ManufacturerPartNo, ListPrice, Weight, WeightUom, LeadTimeDays, ShelfLifeDays,
  MinStockLevel, MaxStockLevel, ReorderLevel, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_DETAIL;
SET IDENTITY_INSERT proj.TBL_ITEM_DETAIL OFF;

-- 2. TBL_ITEM_PRICE (depends on TBL_ITEM_DETAIL + TBL_CURRENCY)
SET IDENTITY_INSERT proj.TBL_ITEM_PRICE ON;
INSERT INTO proj.TBL_ITEM_PRICE
  (PriceId, ItemDetailId, PriceType, UnitPrice, CurrencyId, MinQty, MaxQty, EffectiveFrom, EffectiveTo,
   DiscountPct, DiscountAmount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  PriceId, ItemDetailId, PriceType, UnitPrice, CurrencyId, MinQty, MaxQty, EffectiveFrom, EffectiveTo,
  DiscountPct, DiscountAmount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_PRICE;
SET IDENTITY_INSERT proj.TBL_ITEM_PRICE OFF;

-- 3. TBL_ITEM_SUPPLIER (depends on TBL_ITEM_DETAIL + TBL_CURRENCY + pre-existing TBL_SUPPLIER)
SET IDENTITY_INSERT proj.TBL_ITEM_SUPPLIER ON;
INSERT INTO proj.TBL_ITEM_SUPPLIER
  (ItemSupplierId, ItemDetailId, SupplierId, UnitCost, CurrencyId, MinOrderQty, LeadTimeDays, SupplierPartNo,
   SupplierItemName, IsPreferred, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  ItemSupplierId, ItemDetailId, SupplierId, UnitCost, CurrencyId, MinOrderQty, LeadTimeDays, SupplierPartNo,
  SupplierItemName, IsPreferred, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_SUPPLIER;
SET IDENTITY_INSERT proj.TBL_ITEM_SUPPLIER OFF;

-- 4. TBL_ITEM_SPECIFICATION (depends on TBL_ITEM only) - has the 1 real row
SET IDENTITY_INSERT proj.TBL_ITEM_SPECIFICATION ON;
INSERT INTO proj.TBL_ITEM_SPECIFICATION
  (SpecId, ItemId, SpecName, SpecValue, SpecUnit, SortOrder, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  SpecId, ItemId, SpecName, SpecValue, SpecUnit, SortOrder, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_SPECIFICATION;
SET IDENTITY_INSERT proj.TBL_ITEM_SPECIFICATION OFF;

-- 5. TBL_ITEM_UOM_CONVERSION (depends on TBL_ITEM + TBL_ITEM_UOM)
SET IDENTITY_INSERT proj.TBL_ITEM_UOM_CONVERSION ON;
INSERT INTO proj.TBL_ITEM_UOM_CONVERSION
  (ConversionId, ItemId, FromUomId, ToUomId, ConversionFactor, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  ConversionId, ItemId, FromUomId, ToUomId, ConversionFactor, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_UOM_CONVERSION;
SET IDENTITY_INSERT proj.TBL_ITEM_UOM_CONVERSION OFF;

COMMIT TRANSACTION;
GO

-- Verify row counts match source after migration
SELECT 'TBL_ITEM_DETAIL' t, COUNT(*) c FROM proj.TBL_ITEM_DETAIL
UNION ALL SELECT 'TBL_ITEM_PRICE', COUNT(*) FROM proj.TBL_ITEM_PRICE
UNION ALL SELECT 'TBL_ITEM_SUPPLIER', COUNT(*) FROM proj.TBL_ITEM_SUPPLIER
UNION ALL SELECT 'TBL_ITEM_SPECIFICATION', COUNT(*) FROM proj.TBL_ITEM_SPECIFICATION
UNION ALL SELECT 'TBL_ITEM_UOM_CONVERSION', COUNT(*) FROM proj.TBL_ITEM_UOM_CONVERSION;
GO
