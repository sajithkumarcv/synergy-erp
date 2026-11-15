/* Run this in the SAME query window/session where the original script
   is still sitting with an OPEN transaction (do not open a new window).
   This picks up from TBL_CURRENCY onward and commits everything. */

-- 13. TBL_CURRENCY (NOT an identity column in SYNERP - plain insert, no IDENTITY_INSERT)
INSERT INTO proj.TBL_CURRENCY
  (CurrencyId, CurrencyName, ShortName, Symbol, CurrencyFormat, DecimalPlaces, ExchangeRate, IsBaseCurrency,
   IsActive, CreatedDate, ModifiedDate, CreatedBy, ModifiedBy, SortOrder)
SELECT
  CurrencyId, CurrencyName, ShortName, Symbol, CurrencyFormat, DecimalPlaces, ExchangeRate, IsBaseCurrency,
  IsActive, CreatedDate, ModifiedDate, CreatedBy, ModifiedBy, SortOrder
FROM SYN_PMS_IND.proj.TBL_CURRENCY;

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
