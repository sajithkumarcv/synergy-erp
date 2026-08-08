/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Scope: TBL_COMPANY and its related tables
   (TBL_COMPANY_BRANCH, TBL_COMPANY_BRANCH_ADDRESS, TBL_COMPANY_BRANCH_BANK)

   Verified before generating:
     - Column structures match exactly between source/target (no diffs)
     - SYNERP target is EMPTY (0 rows) for all 4 tables
     - Identity column names match on both sides (IDENTITY_INSERT safe)
     - No FK dependency on external lookup tables - Country/Currency in
       TBL_COMPANY_BRANCH_ADDRESS/TBL_COMPANY_BRANCH_BANK are free-text
       columns, not FK'd to TBL_COUNTRY/TBL_CURRENCY
     - TBL_USERS.CompanyId/BranchId (already migrated) has no enforced
       FK constraint, so nothing broke while TBL_COMPANY was empty -
       those values will now resolve correctly by matching ID once this
       script runs, since IDs are preserved end to end
   Order respects FK dependencies (parent before children).
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 1. TBL_COMPANY (parent)
SET IDENTITY_INSERT proj.TBL_COMPANY ON;
INSERT INTO proj.TBL_COMPANY
  (CompanyId, CompanyName, CompanyCode, CreatedDate, CreatedBy, ModifiedDate, ModifiedBy, IsActive, IsOwner,
   TRN, Phone, Fax, Email, Website, LogoPath, PrintNote, DisplayName, GSTNo, PAN, CIN)
SELECT
  CompanyId, CompanyName, CompanyCode, CreatedDate, CreatedBy, ModifiedDate, ModifiedBy, IsActive, IsOwner,
  TRN, Phone, Fax, Email, Website, LogoPath, PrintNote, DisplayName, GSTNo, PAN, CIN
FROM SYN_PMS_IND.proj.TBL_COMPANY;
SET IDENTITY_INSERT proj.TBL_COMPANY OFF;

-- 2. TBL_COMPANY_BRANCH (depends on Company)
SET IDENTITY_INSERT proj.TBL_COMPANY_BRANCH ON;
INSERT INTO proj.TBL_COMPANY_BRANCH
  (BranchId, CompanyId, BranchName, BranchCode, CreatedDate, CreatedBy, ModifiedBy, ModifiedDate, IsActive)
SELECT
  BranchId, CompanyId, BranchName, BranchCode, CreatedDate, CreatedBy, ModifiedBy, ModifiedDate, IsActive
FROM SYN_PMS_IND.proj.TBL_COMPANY_BRANCH;
SET IDENTITY_INSERT proj.TBL_COMPANY_BRANCH OFF;

-- 3. TBL_COMPANY_BRANCH_ADDRESS (depends on Company)
SET IDENTITY_INSERT proj.TBL_COMPANY_BRANCH_ADDRESS ON;
INSERT INTO proj.TBL_COMPANY_BRANCH_ADDRESS
  (AddressId, CompanyId, AddressLine1, AddressLine2, City, State, Country, IsPrimary, SortOrder, IsActive,
   CreatedDate, CreatedBy)
SELECT
  AddressId, CompanyId, AddressLine1, AddressLine2, City, State, Country, IsPrimary, SortOrder, IsActive,
  CreatedDate, CreatedBy
FROM SYN_PMS_IND.proj.TBL_COMPANY_BRANCH_ADDRESS;
SET IDENTITY_INSERT proj.TBL_COMPANY_BRANCH_ADDRESS OFF;

-- 4. TBL_COMPANY_BRANCH_BANK (depends on Company)
SET IDENTITY_INSERT proj.TBL_COMPANY_BRANCH_BANK ON;
INSERT INTO proj.TBL_COMPANY_BRANCH_BANK
  (BankId, CompanyId, BankName, Beneficiary, AccountNo, IBAN, Swift, Currency, BranchAddress, IsPrimary,
   SortOrder, IsActive, CreatedDate, CreatedBy, BranchName, IFSC, MICR, AccountType, CRN, UpiId)
SELECT
  BankId, CompanyId, BankName, Beneficiary, AccountNo, IBAN, Swift, Currency, BranchAddress, IsPrimary,
  SortOrder, IsActive, CreatedDate, CreatedBy, BranchName, IFSC, MICR, AccountType, CRN, UpiId
FROM SYN_PMS_IND.proj.TBL_COMPANY_BRANCH_BANK;
SET IDENTITY_INSERT proj.TBL_COMPANY_BRANCH_BANK OFF;

COMMIT TRANSACTION;
GO

-- Verify row counts match source after migration
SELECT 'TBL_COMPANY' t, COUNT(*) c FROM proj.TBL_COMPANY
UNION ALL SELECT 'TBL_COMPANY_BRANCH', COUNT(*) FROM proj.TBL_COMPANY_BRANCH
UNION ALL SELECT 'TBL_COMPANY_BRANCH_ADDRESS', COUNT(*) FROM proj.TBL_COMPANY_BRANCH_ADDRESS
UNION ALL SELECT 'TBL_COMPANY_BRANCH_BANK', COUNT(*) FROM proj.TBL_COMPANY_BRANCH_BANK;
GO
