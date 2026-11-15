/* Run this in the SAME query window/session where migrate_job_related.sql
   is still sitting with an OPEN transaction (do not open a new window).
   Picks up from TBL_JOB_FINANCE onward and commits everything.
   Fix: BalanceAmount is a COMPUTED column in SYNERP.TBL_JOB_FINANCE
   (OrderValue*ISNULL(ExchangeRate,1) - (TotalPayments+TotalCredit)) -
   removed from the explicit column/select list; SQL Server computes it
   automatically on insert. */

-- 9. TBL_JOB_FINANCE (1:1 with Job; no identity; BalanceAmount is computed - excluded)
INSERT INTO proj.TBL_JOB_FINANCE
  (JobId, OrderValue, TotalInvoicing, TotalPayments, TotalCredit, JobAdvanceAmount, IsLDApplicable, LDAmount,
   LDPercent, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, ExchangeRate, TotalExpenses)
SELECT
  JobId, OrderValue, TotalInvoicing, TotalPayments, TotalCredit, JobAdvanceAmount, IsLDApplicable, LDAmount,
  LDPercent, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, ExchangeRate, TotalExpenses
FROM SYN_PMS_IND.proj.TBL_JOB_FINANCE;

-- 10. TBL_JOB_META (1:1 with Job; no identity; depends on pre-existing Bay/Quality/Category)
INSERT INTO proj.TBL_JOB_META
  (JobId, TotalUnits, ModifiedDate, ModifiedBy, CreatedBy, CreatedDate, BayId, QualityLevelId, JobCategoryId,
   DeliveredUnit)
SELECT
  JobId, TotalUnits, ModifiedDate, ModifiedBy, CreatedBy, CreatedDate, BayId, QualityLevelId, JobCategoryId,
  DeliveredUnit
FROM SYN_PMS_IND.proj.TBL_JOB_META;

-- 11. TBL_JOB_SETTING (source has 0 rows currently - no-op, included for completeness)
INSERT INTO proj.TBL_JOB_SETTING
  (JobId, IsCostingReq, IsPoLevel1AuthReq, IsPoLevel2AuthReq, IsPoLevel3AuthReq, IsInvoiceLevel1AuthReq,
   IsInvoiceLevel2AuthReq, IsInvoiceLevel3AuthReq, IsPoValueauthRequired, IsPoValueAuthLimit, CreatedBy,
   CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  JobId, IsCostingReq, IsPoLevel1AuthReq, IsPoLevel2AuthReq, IsPoLevel3AuthReq, IsInvoiceLevel1AuthReq,
  IsInvoiceLevel2AuthReq, IsInvoiceLevel3AuthReq, IsPoValueauthRequired, IsPoValueAuthLimit, CreatedBy,
  CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_JOB_SETTING;

-- 12. TBL_JOB_TERMS (1:1 with Job; no identity)
INSERT INTO proj.TBL_JOB_TERMS
  (JobId, JobPaymentTerms, WarrantyTerms, JobDeliveryTerms, ModifiedDate, ModifiedBy, CreatedBy, CreatedDate)
SELECT
  JobId, JobPaymentTerms, WarrantyTerms, JobDeliveryTerms, ModifiedDate, ModifiedBy, CreatedBy, CreatedDate
FROM SYN_PMS_IND.proj.TBL_JOB_TERMS;

COMMIT TRANSACTION;
GO

-- Verify row counts match source after migration
SELECT 'TBL_JOB_EXPENSE_CATEGORY(new rows)' t, COUNT(*) c FROM proj.TBL_JOB_EXPENSE_CATEGORY WHERE ExpenseCategoryId IN (36,37)
UNION ALL SELECT 'TBL_JOB', COUNT(*) FROM proj.TBL_JOB
UNION ALL SELECT 'TBL_JOB_AUDIT', COUNT(*) FROM proj.TBL_JOB_AUDIT
UNION ALL SELECT 'TBL_JOB_BUDGET', COUNT(*) FROM proj.TBL_JOB_BUDGET
UNION ALL SELECT 'TBL_JOB_BUDGET_ITEM', COUNT(*) FROM proj.TBL_JOB_BUDGET_ITEM
UNION ALL SELECT 'TBL_JOB_BUDGET_ITEM_LOG', COUNT(*) FROM proj.TBL_JOB_BUDGET_ITEM_LOG
UNION ALL SELECT 'TBL_JOB_DATES', COUNT(*) FROM proj.TBL_JOB_DATES
UNION ALL SELECT 'TBL_JOB_ENGINEER', COUNT(*) FROM proj.TBL_JOB_ENGINEER
UNION ALL SELECT 'TBL_JOB_EXPENSE', COUNT(*) FROM proj.TBL_JOB_EXPENSE
UNION ALL SELECT 'TBL_JOB_FINANCE', COUNT(*) FROM proj.TBL_JOB_FINANCE
UNION ALL SELECT 'TBL_JOB_META', COUNT(*) FROM proj.TBL_JOB_META
UNION ALL SELECT 'TBL_JOB_SETTING', COUNT(*) FROM proj.TBL_JOB_SETTING
UNION ALL SELECT 'TBL_JOB_TERMS', COUNT(*) FROM proj.TBL_JOB_TERMS;
GO
