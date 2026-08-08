/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Run this while connected with a login that has access to both DBs
   on server SP-SCS-SAJITH\SQLEXPRESS01. Target DB context = SYNERP.
   Verified before generating:
     - Column structures match between source/target for all 15 tables
       (only TBL_CURRENCY has shorter varchar limits in SYNERP; existing
       data fits within them - no truncation risk)
     - SYNERP target tables are currently EMPTY (0 rows) for all 15
     - No orphan FK risk against pre-existing SYNERP lookup tables
       (TBL_TEAM, TBL_JOB_EXPENSE_CATEGORY, TBL_USER_GROUP)
   Order respects FK dependencies (parents before children).
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 1. TBL_ROLES (parent)
SET IDENTITY_INSERT proj.TBL_ROLES ON;
INSERT INTO proj.TBL_ROLES
  (RoleId, RoleName, RoleCode, IsActive, CreatedDate, Description, CreatedBy, ModifiedBy, ModifiedDate, IsEngineerRole)
SELECT
  RoleId, RoleName, RoleCode, IsActive, CreatedDate, Description, CreatedBy, ModifiedBy, ModifiedDate, IsEngineerRole
FROM SYN_PMS_IND.proj.TBL_ROLES;
SET IDENTITY_INSERT proj.TBL_ROLES OFF;

-- 2. TBL_ROLE_SECRET (depends on Roles; no identity column)
INSERT INTO proj.TBL_ROLE_SECRET
  (RoleId, SecretKey, SecretValueHash, ModifiedBy, ModifiedDate)
SELECT
  RoleId, SecretKey, SecretValueHash, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ROLE_SECRET;

-- 3. TBL_USERS (parent)
SET IDENTITY_INSERT proj.TBL_USERS ON;
INSERT INTO proj.TBL_USERS
  (UserId, UserCode, UserName, PasswordHash, FullName, Email, Mobile, IsActive, IsLocked,
   LastLoginDate, LastPasswordChange, CompanyId, BranchId, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
   Theme, FailedAttempts, LastFailedAttempt, LockedUntil)
SELECT
  UserId, UserCode, UserName, PasswordHash, FullName, Email, Mobile, IsActive, IsLocked,
  LastLoginDate, LastPasswordChange, CompanyId, BranchId, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
  Theme, FailedAttempts, LastFailedAttempt, LockedUntil
FROM SYN_PMS_IND.proj.TBL_USERS;
SET IDENTITY_INSERT proj.TBL_USERS OFF;

-- 4. TBL_USER_SECRET (depends on Users)
SET IDENTITY_INSERT proj.TBL_USER_SECRET ON;
INSERT INTO proj.TBL_USER_SECRET
  (UserSecretId, UserId, SecretKey, SecretValueHash, ModifiedBy, ModifiedDate)
SELECT
  UserSecretId, UserId, SecretKey, SecretValueHash, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_USER_SECRET;
SET IDENTITY_INSERT proj.TBL_USER_SECRET OFF;

-- 5. TBL_USER_ROLES (depends on Users + Roles)
SET IDENTITY_INSERT proj.TBL_USER_ROLES ON;
INSERT INTO proj.TBL_USER_ROLES
  (UserRoleId, UserId, RoleId, CreatedBy, CreatedDate)
SELECT
  UserRoleId, UserId, RoleId, CreatedBy, CreatedDate
FROM SYN_PMS_IND.proj.TBL_USER_ROLES;
SET IDENTITY_INSERT proj.TBL_USER_ROLES OFF;

-- 6. TBL_USER_GROUP_DETAIL (depends on Users + pre-existing TBL_USER_GROUP)
SET IDENTITY_INSERT proj.TBL_USER_GROUP_DETAIL ON;
INSERT INTO proj.TBL_USER_GROUP_DETAIL
  (DetailId, GroupId, UserId, IsActive, AddedBy, AddedDate)
SELECT
  DetailId, GroupId, UserId, IsActive, AddedBy, AddedDate
FROM SYN_PMS_IND.proj.TBL_USER_GROUP_DETAIL;
SET IDENTITY_INSERT proj.TBL_USER_GROUP_DETAIL OFF;

-- 7. TBL_ROLE_MENU (depends on Roles + pre-existing TBL_MENU)
SET IDENTITY_INSERT proj.TBL_ROLE_MENU ON;
INSERT INTO proj.TBL_ROLE_MENU
  (RoleMenuId, RoleId, MenuId, CanView)
SELECT
  RoleMenuId, RoleId, MenuId, CanView
FROM SYN_PMS_IND.proj.TBL_ROLE_MENU;
SET IDENTITY_INSERT proj.TBL_ROLE_MENU OFF;

-- 8. TBL_ENGINEER (depends on pre-existing TBL_TEAM + Users)
SET IDENTITY_INSERT proj.TBL_ENGINEER ON;
INSERT INTO proj.TBL_ENGINEER
  (EngineerId, EngineerName, TeamId, Email, IsActive, CreatedDate, CreatedBy, ModifiedDate, ModifiedBy, HourlyRate, UserId)
SELECT
  EngineerId, EngineerName, TeamId, Email, IsActive, CreatedDate, CreatedBy, ModifiedDate, ModifiedBy, HourlyRate, UserId
FROM SYN_PMS_IND.proj.TBL_ENGINEER;
SET IDENTITY_INSERT proj.TBL_ENGINEER OFF;

-- 9. TBL_ITEM_CATEGORY (self-referencing FK - fine within one statement)
SET IDENTITY_INSERT proj.TBL_ITEM_CATEGORY ON;
INSERT INTO proj.TBL_ITEM_CATEGORY
  (CategoryId, ParentCategoryId, Level, CategoryCode, CategoryName, Description, SortOrder, IsActive,
   CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  CategoryId, ParentCategoryId, Level, CategoryCode, CategoryName, Description, SortOrder, IsActive,
  CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_CATEGORY;
SET IDENTITY_INSERT proj.TBL_ITEM_CATEGORY OFF;

-- 10. TBL_ITEM_TYPE
SET IDENTITY_INSERT proj.TBL_ITEM_TYPE ON;
INSERT INTO proj.TBL_ITEM_TYPE
  (ItemTypeId, TypeCode, TypeName, IsStockable, IsService, IsAsset, IsConsumable, Description, SortOrder,
   IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  ItemTypeId, TypeCode, TypeName, IsStockable, IsService, IsAsset, IsConsumable, Description, SortOrder,
  IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_TYPE;
SET IDENTITY_INSERT proj.TBL_ITEM_TYPE OFF;

-- 11. TBL_ITEM_UOM
SET IDENTITY_INSERT proj.TBL_ITEM_UOM ON;
INSERT INTO proj.TBL_ITEM_UOM
  (UomId, UomCode, UomName, UomType, Description, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  UomId, UomCode, UomName, UomType, Description, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_ITEM_UOM;
SET IDENTITY_INSERT proj.TBL_ITEM_UOM OFF;

-- 12. TBL_ITEM (depends on Category/Type/UOM + pre-existing TBL_JOB_EXPENSE_CATEGORY)
SET IDENTITY_INSERT proj.TBL_ITEM ON;
INSERT INTO proj.TBL_ITEM
  (ItemId, ItemCode, ItemName, ItemNameAr, ShortDescription, LongDescription, CategoryId, ItemTypeId,
   BaseUomId, PurchaseUomId, SalesUomId, Barcode, HSCode, IsStockable, IsSaleable, IsPurchasable, IsActive,
   CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, BudgetCategoryId)
SELECT
  ItemId, ItemCode, ItemName, ItemNameAr, ShortDescription, LongDescription, CategoryId, ItemTypeId,
  BaseUomId, PurchaseUomId, SalesUomId, Barcode, HSCode, IsStockable, IsSaleable, IsPurchasable, IsActive,
  CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, BudgetCategoryId
FROM SYN_PMS_IND.proj.TBL_ITEM;
SET IDENTITY_INSERT proj.TBL_ITEM OFF;

-- 13. TBL_CURRENCY (independent; NOTE Symbol/CreatedBy/ModifiedBy are shorter in SYNERP - verified data fits)
SET IDENTITY_INSERT proj.TBL_CURRENCY ON;
INSERT INTO proj.TBL_CURRENCY
  (CurrencyId, CurrencyName, ShortName, Symbol, CurrencyFormat, DecimalPlaces, ExchangeRate, IsBaseCurrency,
   IsActive, CreatedDate, ModifiedDate, CreatedBy, ModifiedBy, SortOrder)
SELECT
  CurrencyId, CurrencyName, ShortName, Symbol, CurrencyFormat, DecimalPlaces, ExchangeRate, IsBaseCurrency,
  IsActive, CreatedDate, ModifiedDate, CreatedBy, ModifiedBy, SortOrder
FROM SYN_PMS_IND.proj.TBL_CURRENCY;
SET IDENTITY_INSERT proj.TBL_CURRENCY OFF;

-- 14. TBL_VLIST (independent)
SET IDENTITY_INSERT proj.TBL_VLIST ON;
INSERT INTO proj.TBL_VLIST
  (VListID, TypeName, ListName, ItemValue, ItemDescription, IsActive, CreatedDate, CreatedBy, ModifiedDate,
   ModifiedBy, SortOrder)
SELECT
  VListID, TypeName, ListName, ItemValue, ItemDescription, IsActive, CreatedDate, CreatedBy, ModifiedDate,
  ModifiedBy, SortOrder
FROM SYN_PMS_IND.proj.TBL_VLIST;
SET IDENTITY_INSERT proj.TBL_VLIST OFF;

-- 15. TBL_APP_LOG (independent, load last)
SET IDENTITY_INSERT proj.TBL_APP_LOG ON;
INSERT INTO proj.TBL_APP_LOG
  (LogId, LogLevel, Controller, Action, Message, StackTrace, InnerException, RequestPath, UserId, IpAddress, LogDate)
SELECT
  LogId, LogLevel, Controller, Action, Message, StackTrace, InnerException, RequestPath, UserId, IpAddress, LogDate
FROM SYN_PMS_IND.proj.TBL_APP_LOG;
SET IDENTITY_INSERT proj.TBL_APP_LOG OFF;

COMMIT TRANSACTION;
GO

-- Verify row counts match source after migration
SELECT 'TBL_ROLES' t, COUNT(*) c FROM proj.TBL_ROLES
UNION ALL SELECT 'TBL_ROLE_SECRET', COUNT(*) FROM proj.TBL_ROLE_SECRET
UNION ALL SELECT 'TBL_USERS', COUNT(*) FROM proj.TBL_USERS
UNION ALL SELECT 'TBL_USER_SECRET', COUNT(*) FROM proj.TBL_USER_SECRET
UNION ALL SELECT 'TBL_USER_ROLES', COUNT(*) FROM proj.TBL_USER_ROLES
UNION ALL SELECT 'TBL_USER_GROUP_DETAIL', COUNT(*) FROM proj.TBL_USER_GROUP_DETAIL
UNION ALL SELECT 'TBL_ROLE_MENU', COUNT(*) FROM proj.TBL_ROLE_MENU
UNION ALL SELECT 'TBL_ENGINEER', COUNT(*) FROM proj.TBL_ENGINEER
UNION ALL SELECT 'TBL_ITEM_CATEGORY', COUNT(*) FROM proj.TBL_ITEM_CATEGORY
UNION ALL SELECT 'TBL_ITEM_TYPE', COUNT(*) FROM proj.TBL_ITEM_TYPE
UNION ALL SELECT 'TBL_ITEM_UOM', COUNT(*) FROM proj.TBL_ITEM_UOM
UNION ALL SELECT 'TBL_ITEM', COUNT(*) FROM proj.TBL_ITEM
UNION ALL SELECT 'TBL_CURRENCY', COUNT(*) FROM proj.TBL_CURRENCY
UNION ALL SELECT 'TBL_VLIST', COUNT(*) FROM proj.TBL_VLIST
UNION ALL SELECT 'TBL_APP_LOG', COUNT(*) FROM proj.TBL_APP_LOG;
GO
