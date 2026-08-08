/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Scope: TBL_CUSTOMER, TBL_SUPPLIER + their contact/address tables only
   (TBL_CUSTOMER_CATEGORY, TBL_SUPPLIER_CATEGORY, TBL_SUPPLIER_BANK
   excluded per scope; category tables already correctly seeded in target).

   Verified before generating:
     - Column structures match exactly between source/target for all
       6 tables + TBL_PAYMENT_TERMS (no diffs at all)
     - SYNERP target is EMPTY (0 rows) for all 6 tables
     - Identity column names match on both sides for all 6 tables +
       TBL_PAYMENT_TERMS (IDENTITY_INSERT will work as expected)
     - Orphan-FK check against pre-existing SYNERP lookup tables
       (TBL_CUSTOMER_CATEGORY, TBL_SUPPLIER_CATEGORY, TBL_CURRENCY,
       TBL_COUNTRY, TBL_PAYMENT_TERMS) found ONE issue:
       TBL_SUPPLIER row 'Greenheck India Private limited' (SupplierId 11)
       references PaymentTermsId 51 ('30 days from the date of invoice'),
       which doesn't exist in SYNERP.TBL_PAYMENT_TERMS (max ID there is 50).
       Per your choice, this script inserts that missing term first.
   Order respects FK dependencies (parents before children).
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 0. Backfill missing TBL_PAYMENT_TERMS row(s) referenced by the migrated suppliers
--    (only inserts rows that don't already exist in target - safe against 1-50 already present)
SET IDENTITY_INSERT proj.TBL_PAYMENT_TERMS ON;
INSERT INTO proj.TBL_PAYMENT_TERMS
  (PaymentTermsId, TermCode, TermName, TermDays, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  p.PaymentTermsId, p.TermCode, p.TermName, p.TermDays, p.IsActive, p.CreatedBy, p.CreatedDate, p.ModifiedBy, p.ModifiedDate
FROM SYN_PMS_IND.proj.TBL_PAYMENT_TERMS p
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_PAYMENT_TERMS x WHERE x.PaymentTermsId = p.PaymentTermsId);
SET IDENTITY_INSERT proj.TBL_PAYMENT_TERMS OFF;

-- 1. TBL_CUSTOMER (parent)
SET IDENTITY_INSERT proj.TBL_CUSTOMER ON;
INSERT INTO proj.TBL_CUSTOMER
  (CustomerId, CustomerCode, CustomerName, CustomerRef, CustomerShortName, CustomerType, CustomerCategoryId,
   Phone, Mobile, Email, Web, CurrencyId, CreditLimit, CreditDays, PaymentTermsId, VatNumber, TaxNumber,
   SalesPerson, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
   CreditHold, CreditHoldBy, CreditHoldDate, CreditHoldNote, CreditFlag, CreditFlagNote, CreditFlagBy,
   CreditFlagDate, AutoHold)
SELECT
  CustomerId, CustomerCode, CustomerName, CustomerRef, CustomerShortName, CustomerType, CustomerCategoryId,
  Phone, Mobile, Email, Web, CurrencyId, CreditLimit, CreditDays, PaymentTermsId, VatNumber, TaxNumber,
  SalesPerson, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
  CreditHold, CreditHoldBy, CreditHoldDate, CreditHoldNote, CreditFlag, CreditFlagNote, CreditFlagBy,
  CreditFlagDate, AutoHold
FROM SYN_PMS_IND.proj.TBL_CUSTOMER;
SET IDENTITY_INSERT proj.TBL_CUSTOMER OFF;

-- 2. TBL_SUPPLIER (parent)
SET IDENTITY_INSERT proj.TBL_SUPPLIER ON;
INSERT INTO proj.TBL_SUPPLIER
  (SupplierId, SupplierCode, SupplierName, SupplierRef, SupplierShortName, SupplierType, SupplierCategoryId,
   Phone, Mobile, Email, Web, CurrencyId, CreditLimit, CreditDays, PaymentTermsId, VatNumber, TaxNumber,
   AccountManager, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
   IsApprovedVendor, IsOnHold, LeadTimeDays, PaymentMode, TradeLicenseNo, TradeLicenseExpiry, CountryId, Rating)
SELECT
  SupplierId, SupplierCode, SupplierName, SupplierRef, SupplierShortName, SupplierType, SupplierCategoryId,
  Phone, Mobile, Email, Web, CurrencyId, CreditLimit, CreditDays, PaymentTermsId, VatNumber, TaxNumber,
  AccountManager, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
  IsApprovedVendor, IsOnHold, LeadTimeDays, PaymentMode, TradeLicenseNo, TradeLicenseExpiry, CountryId, Rating
FROM SYN_PMS_IND.proj.TBL_SUPPLIER;
SET IDENTITY_INSERT proj.TBL_SUPPLIER OFF;

-- 3. TBL_CUSTOMER_ADDRESS (depends on Customer + pre-existing TBL_COUNTRY)
SET IDENTITY_INSERT proj.TBL_CUSTOMER_ADDRESS ON;
INSERT INTO proj.TBL_CUSTOMER_ADDRESS
  (CustomerAddressId, CustomerId, AddressType, AddressLine1, AddressLine2, City, State, CountryId,
   PostalCode, POBox, IsDefault, CreatedDate, CreatedBy, ModifiedBy, ModifiedDate, IsActive)
SELECT
  CustomerAddressId, CustomerId, AddressType, AddressLine1, AddressLine2, City, State, CountryId,
  PostalCode, POBox, IsDefault, CreatedDate, CreatedBy, ModifiedBy, ModifiedDate, IsActive
FROM SYN_PMS_IND.proj.TBL_CUSTOMER_ADDRESS;
SET IDENTITY_INSERT proj.TBL_CUSTOMER_ADDRESS OFF;

-- 4. TBL_CUSTOMER_CONTACT (depends on Customer)
SET IDENTITY_INSERT proj.TBL_CUSTOMER_CONTACT ON;
INSERT INTO proj.TBL_CUSTOMER_CONTACT
  (CustomerContactId, CustomerId, ContactTitle, ContactName, Designation, Phone, Mobile, Email,
   IsPrimary, CreatedDate, CreatedBy, ModifiedDate, ModifiedBy, IsActive)
SELECT
  CustomerContactId, CustomerId, ContactTitle, ContactName, Designation, Phone, Mobile, Email,
  IsPrimary, CreatedDate, CreatedBy, ModifiedDate, ModifiedBy, IsActive
FROM SYN_PMS_IND.proj.TBL_CUSTOMER_CONTACT;
SET IDENTITY_INSERT proj.TBL_CUSTOMER_CONTACT OFF;

-- 5. TBL_SUPPLIER_ADDRESS (depends on Supplier + pre-existing TBL_COUNTRY)
SET IDENTITY_INSERT proj.TBL_SUPPLIER_ADDRESS ON;
INSERT INTO proj.TBL_SUPPLIER_ADDRESS
  (SupplierAddressId, SupplierId, AddressType, AddressLine1, AddressLine2, City, State, CountryId,
   PostalCode, POBox, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  SupplierAddressId, SupplierId, AddressType, AddressLine1, AddressLine2, City, State, CountryId,
  PostalCode, POBox, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_SUPPLIER_ADDRESS;
SET IDENTITY_INSERT proj.TBL_SUPPLIER_ADDRESS OFF;

-- 6. TBL_SUPPLIER_CONTACT (depends on Supplier)
SET IDENTITY_INSERT proj.TBL_SUPPLIER_CONTACT ON;
INSERT INTO proj.TBL_SUPPLIER_CONTACT
  (SupplierContactId, SupplierId, ContactTitle, ContactName, Designation, Phone, Mobile, Email,
   IsPrimary, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  SupplierContactId, SupplierId, ContactTitle, ContactName, Designation, Phone, Mobile, Email,
  IsPrimary, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_SUPPLIER_CONTACT;
SET IDENTITY_INSERT proj.TBL_SUPPLIER_CONTACT OFF;

COMMIT TRANSACTION;
GO

-- Verify row counts match source after migration
SELECT 'TBL_PAYMENT_TERMS(new rows)' t, COUNT(*) c FROM proj.TBL_PAYMENT_TERMS WHERE PaymentTermsId = 51
UNION ALL SELECT 'TBL_CUSTOMER', COUNT(*) FROM proj.TBL_CUSTOMER
UNION ALL SELECT 'TBL_SUPPLIER', COUNT(*) FROM proj.TBL_SUPPLIER
UNION ALL SELECT 'TBL_CUSTOMER_ADDRESS', COUNT(*) FROM proj.TBL_CUSTOMER_ADDRESS
UNION ALL SELECT 'TBL_CUSTOMER_CONTACT', COUNT(*) FROM proj.TBL_CUSTOMER_CONTACT
UNION ALL SELECT 'TBL_SUPPLIER_ADDRESS', COUNT(*) FROM proj.TBL_SUPPLIER_ADDRESS
UNION ALL SELECT 'TBL_SUPPLIER_CONTACT', COUNT(*) FROM proj.TBL_SUPPLIER_CONTACT;
GO
