/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Scope: TBL_JOB and its transactional/detail tables only.
   EXCLUDED (already curated with lookup/config data in SYNERP target -
   same pattern as TBL_CUSTOMER_CATEGORY/TBL_SUPPLIER_CATEGORY earlier):
     TBL_JOB_BAY (4 rows), TBL_JOB_CATEGORY (3), TBL_JOB_QUALITY (3),
     TBL_JOB_ROLE (6), TBL_JOB_STAGE (5), TBL_JOB_STATUS (5), TBL_JOBTYPE (8)

   Verified before generating:
     - Column structures match exactly between source/target (no diffs)
     - SYNERP target is EMPTY (0 rows) for all 12 tables in scope
     - Identity columns confirmed on both sides where present:
       TBL_JOB(JobNumId - note: PK is JobId, which is NOT identity),
       TBL_JOB_AUDIT(AuditId), TBL_JOB_BUDGET(JobBudgetId),
       TBL_JOB_BUDGET_ITEM(BudgetItemId), TBL_JOB_BUDGET_ITEM_LOG(LogId),
       TBL_JOB_ENGINEER(JobEngineerId), TBL_JOB_EXPENSE(ExpenseId).
       TBL_JOB_DATES/FINANCE/META/SETTING/TERMS have no identity - PK is
       plain JobId (1:1 extension of TBL_JOB) - plain insert.
     - Orphan-FK check found TBL_JOB.BudgetCategoryId references 2
       categories (36 'Electrical accessories', 37 'Blasting and
       painting Accessories') missing from SYNERP.TBL_JOB_EXPENSE_CATEGORY
       (target has 31 rows, source has 33) - backfilled below, same
       pattern as the TBL_PAYMENT_TERMS gap in the customer/supplier script.
     - All other logical FK columns (JobTypeId, JobStageId, CustomerId,
       JobCurrencyId, JobStatusId, PlannedUomId, UomId, ItemId,
       EngineerId, TeamId, BayId, QualityLevelId, JobCategoryId) resolve
       cleanly against already-migrated/pre-existing target tables.
   Order respects FK/logical dependencies (TBL_JOB first, then children).
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 0. Backfill missing TBL_JOB_EXPENSE_CATEGORY rows referenced by TBL_JOB
SET IDENTITY_INSERT proj.TBL_JOB_EXPENSE_CATEGORY ON;
INSERT INTO proj.TBL_JOB_EXPENSE_CATEGORY
  (ExpenseCategoryId, CategoryName, CategoryCode, Description, IsActive, SortOrder, CreatedBy, CreatedDate,
   ModifiedBy, ModifiedDate, UsedForBudget, UsedForExpense, MhTypeCode, IsSubcontractOrder)
SELECT
  c.ExpenseCategoryId, c.CategoryName, c.CategoryCode, c.Description, c.IsActive, c.SortOrder, c.CreatedBy,
  c.CreatedDate, c.ModifiedBy, c.ModifiedDate, c.UsedForBudget, c.UsedForExpense, c.MhTypeCode, c.IsSubcontractOrder
FROM SYN_PMS_IND.proj.TBL_JOB_EXPENSE_CATEGORY c
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_JOB_EXPENSE_CATEGORY x WHERE x.ExpenseCategoryId = c.ExpenseCategoryId);
SET IDENTITY_INSERT proj.TBL_JOB_EXPENSE_CATEGORY OFF;

-- 1. TBL_JOB (parent; JobId is PK/not identity - explicit value; JobNumId is the identity column)
SET IDENTITY_INSERT proj.TBL_JOB ON;
INSERT INTO proj.TBL_JOB
  (JobId, ParentJobId, JobTypeId, JobStageId, CustomerId, JobExcRate, JobCurrencyId, JobDescription, JobDate,
   ProjectName, LpoDate, ContractRef, LpoRef, JobStatusId, EndUserId, JobCreatedBy, JobCreatedDate,
   JobLastUpdatedDate, JobLastModifiedBy, ExternalRef, BomId, PlannedQty, PlannedUomId, ApprovalStatus,
   JobNumId, CompletedDate, CompletedReason, CompletedBy, CancelledDate, CancelledReason, CancelledBy,
   PreFreezeStageId, BudgetCategoryId)
SELECT
  JobId, ParentJobId, JobTypeId, JobStageId, CustomerId, JobExcRate, JobCurrencyId, JobDescription, JobDate,
  ProjectName, LpoDate, ContractRef, LpoRef, JobStatusId, EndUserId, JobCreatedBy, JobCreatedDate,
  JobLastUpdatedDate, JobLastModifiedBy, ExternalRef, BomId, PlannedQty, PlannedUomId, ApprovalStatus,
  JobNumId, CompletedDate, CompletedReason, CompletedBy, CancelledDate, CancelledReason, CancelledBy,
  PreFreezeStageId, BudgetCategoryId
FROM SYN_PMS_IND.proj.TBL_JOB;
SET IDENTITY_INSERT proj.TBL_JOB OFF;

-- 2. TBL_JOB_AUDIT (depends on Job)
SET IDENTITY_INSERT proj.TBL_JOB_AUDIT ON;
INSERT INTO proj.TBL_JOB_AUDIT
  (AuditId, JobId, Action, Section, OldValue, NewValue, Remarks, CreatedBy, CreatedDate)
SELECT
  AuditId, JobId, Action, Section, OldValue, NewValue, Remarks, CreatedBy, CreatedDate
FROM SYN_PMS_IND.proj.TBL_JOB_AUDIT;
SET IDENTITY_INSERT proj.TBL_JOB_AUDIT OFF;

-- 3. TBL_JOB_BUDGET (depends on Job, pre-existing TBL_ITEM_UOM)
SET IDENTITY_INSERT proj.TBL_JOB_BUDGET ON;
INSERT INTO proj.TBL_JOB_BUDGET
  (JobBudgetId, JobId, CostCategoryId, BudgetedAmount, Notes, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
   RvNo, Qty, UnitPrice, UomId, IsApproved, ApprovedBy, ApprovedDate, IsCurrent, CurrencyId, ExchangeRate,
   AmountInBaseCurrency, ApprovalReason, RevisionReason, RevisedBy, RevisedDate)
SELECT
  JobBudgetId, JobId, CostCategoryId, BudgetedAmount, Notes, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
  RvNo, Qty, UnitPrice, UomId, IsApproved, ApprovedBy, ApprovedDate, IsCurrent, CurrencyId, ExchangeRate,
  AmountInBaseCurrency, ApprovalReason, RevisionReason, RevisedBy, RevisedDate
FROM SYN_PMS_IND.proj.TBL_JOB_BUDGET;
SET IDENTITY_INSERT proj.TBL_JOB_BUDGET OFF;

-- 4. TBL_JOB_BUDGET_ITEM (depends on Job, pre-existing TBL_ITEM)
SET IDENTITY_INSERT proj.TBL_JOB_BUDGET_ITEM ON;
INSERT INTO proj.TBL_JOB_BUDGET_ITEM
  (BudgetItemId, JobId, RvNo, CostCategoryId, ItemId, Qty, UomId, UnitPrice, Notes, IsActive, CreatedBy,
   CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  BudgetItemId, JobId, RvNo, CostCategoryId, ItemId, Qty, UomId, UnitPrice, Notes, IsActive, CreatedBy,
  CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_JOB_BUDGET_ITEM;
SET IDENTITY_INSERT proj.TBL_JOB_BUDGET_ITEM OFF;

-- 5. TBL_JOB_BUDGET_ITEM_LOG (depends on BudgetItem)
SET IDENTITY_INSERT proj.TBL_JOB_BUDGET_ITEM_LOG ON;
INSERT INTO proj.TBL_JOB_BUDGET_ITEM_LOG
  (LogId, BudgetItemId, JobId, RvNo, CostCategoryId, ItemId, Action, OldQty, NewQty, OldUnitPrice, NewUnitPrice,
   ChangedBy, ChangedDate, Reason)
SELECT
  LogId, BudgetItemId, JobId, RvNo, CostCategoryId, ItemId, Action, OldQty, NewQty, OldUnitPrice, NewUnitPrice,
  ChangedBy, ChangedDate, Reason
FROM SYN_PMS_IND.proj.TBL_JOB_BUDGET_ITEM_LOG;
SET IDENTITY_INSERT proj.TBL_JOB_BUDGET_ITEM_LOG OFF;

-- 6. TBL_JOB_DATES (1:1 with Job; no identity)
INSERT INTO proj.TBL_JOB_DATES
  (JobId, JobActualCompleteDate, JobExpectedCompleteDate, JobActualDeliveryDate, JobExpectedDeliveryDate,
   JobCompletedMarkedBy, ModifiedDate, ModifiedBy, CreatedBy, CreatedDate, JobPlannedStartDate)
SELECT
  JobId, JobActualCompleteDate, JobExpectedCompleteDate, JobActualDeliveryDate, JobExpectedDeliveryDate,
  JobCompletedMarkedBy, ModifiedDate, ModifiedBy, CreatedBy, CreatedDate, JobPlannedStartDate
FROM SYN_PMS_IND.proj.TBL_JOB_DATES;

-- 7. TBL_JOB_ENGINEER (depends on Job, pre-existing TBL_ENGINEER + TBL_TEAM)
SET IDENTITY_INSERT proj.TBL_JOB_ENGINEER ON;
INSERT INTO proj.TBL_JOB_ENGINEER
  (JobEngineerId, JobId, EngineerId, TeamId, Role, AssignedDate, Completed, AssignedBy, CreatedDate,
   ModifiedBy, ModifiedDate)
SELECT
  JobEngineerId, JobId, EngineerId, TeamId, Role, AssignedDate, Completed, AssignedBy, CreatedDate,
  ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_JOB_ENGINEER;
SET IDENTITY_INSERT proj.TBL_JOB_ENGINEER OFF;

-- 8. TBL_JOB_EXPENSE (source has 0 rows currently - no-op, included for completeness)
SET IDENTITY_INSERT proj.TBL_JOB_EXPENSE ON;
INSERT INTO proj.TBL_JOB_EXPENSE
  (ExpenseId, JobId, ExpenseCategoryId, ExpenseDescription, ExpenseAmount, ExpenseDate, CurrencyId,
   ExchangeRate, AmountInBaseCurrency, ReferenceNo, Remarks, IsApproved, ApprovedBy, ApprovedDate,
   CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, IsDeleted)
SELECT
  ExpenseId, JobId, ExpenseCategoryId, ExpenseDescription, ExpenseAmount, ExpenseDate, CurrencyId,
  ExchangeRate, AmountInBaseCurrency, ReferenceNo, Remarks, IsApproved, ApprovedBy, ApprovedDate,
  CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, IsDeleted
FROM SYN_PMS_IND.proj.TBL_JOB_EXPENSE;
SET IDENTITY_INSERT proj.TBL_JOB_EXPENSE OFF;

-- 9. TBL_JOB_FINANCE (1:1 with Job; no identity; BalanceAmount is a COMPUTED
--    column in SYNERP - OrderValue*ISNULL(ExchangeRate,1)-(TotalPayments+TotalCredit) -
--    excluded from the explicit list; SQL Server computes it automatically)
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
