/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Scope: BOM, Purchase Request, Purchase Order, GRN transactional tables.

   EXCLUDED (already correctly seeded/matching in SYNERP target - verified
   row-by-row identical, same pattern as other lookup tables):
     TBL_BOM_SECTION (56 rows - lookup per job type),
     TBL_PO_TERMS (6 rows - standard PO terms text),
     TBL_GRN_QC_ITEM (8 rows - QC checklist items)

   Verified before generating:
     - Column structures match exactly between source/target (no diffs)
     - Identity columns confirmed matching on both sides for 19 of 21
       tables; TBL_PURCHASE_ORDER_ANNEXURE_LINE_LINK has a composite PK
       (AnnexureId, PoLineId) - plain insert, no identity
     - TBL_GRN_DETAIL has 3 COMPUTED columns in SYNERP (AcceptedQty,
       LineTotal, LineTotalWithTax) - excluded from explicit insert list
     - Orphan-FK check clean: BomHeader.JobId, BomDetails.ItemId/
       BomSectionId, PO.SupplierContactId/ExpenseCategoryId/SupplierId/
       JobId/PaymentTermsId all resolve against already-migrated/
       pre-existing target tables
     - Most PO/GRN child tables (Annexure*, PO_AMENDMENT_LOG,
       PO_HOLD_LOG, PO_REVISION_LOG, PR_REVISION_LOG, GRN_*) are 0 rows
       in source currently - included as no-ops for completeness
   Order respects FK dependencies (parent before children); internal
   dependencies (e.g. PO_LINE.PrLineId -> PURCHASE_REQUEST_LINE,
   GRN_DETAIL.PrLineId -> PURCHASE_REQUEST_LINE) are satisfied by
   inserting PR/PR_LINE before PO/PO_LINE before GRN.
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 1. TBL_BOM_HEADER (depends on Job)
SET IDENTITY_INSERT proj.TBL_BOM_HEADER ON;
INSERT INTO proj.TBL_BOM_HEADER
  (BomHeaderId, JobId, JobTypeId, BomDate, BomDescription, BomVersion, BomStatus, TotalBomValue,
   BomApprovedBy, BomApprovedDate, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  BomHeaderId, JobId, JobTypeId, BomDate, BomDescription, BomVersion, BomStatus, TotalBomValue,
  BomApprovedBy, BomApprovedDate, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_BOM_HEADER;
SET IDENTITY_INSERT proj.TBL_BOM_HEADER OFF;

-- 2. TBL_BOM_DETAILS (depends on BomHeader, pre-existing BomSection, Item)
SET IDENTITY_INSERT proj.TBL_BOM_DETAILS ON;
INSERT INTO proj.TBL_BOM_DETAILS
  (BomId, BomHeaderId, JobId, BomSectionId, ItemId, ItemDetailId, SortOrder, BomRequestedQty, BomReceivedQty,
   PrCreatedQty, PoCreatedQty, UomId, BomPrice, CurrencyId, ExchangeRate, ItemReqDate, ExpectedDelivery,
   BomStatus, IsCritical, IsSubstituteAllowed, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  BomId, BomHeaderId, JobId, BomSectionId, ItemId, ItemDetailId, SortOrder, BomRequestedQty, BomReceivedQty,
  PrCreatedQty, PoCreatedQty, UomId, BomPrice, CurrencyId, ExchangeRate, ItemReqDate, ExpectedDelivery,
  BomStatus, IsCritical, IsSubstituteAllowed, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_BOM_DETAILS;
SET IDENTITY_INSERT proj.TBL_BOM_DETAILS OFF;

-- 3. TBL_PURCHASE_REQUEST (depends on Job, logically BomId -> TBL_BOM_HEADER inserted above)
SET IDENTITY_INSERT proj.TBL_PURCHASE_REQUEST ON;
INSERT INTO proj.TBL_PURCHASE_REQUEST
  (PrId, PrNumber, PrDate, RequestedBy, JobId, Priority, Status, Notes, IsActive, CreatedBy, CreatedDate,
   ModifiedBy, ModifiedDate, BomId, Revision)
SELECT
  PrId, PrNumber, PrDate, RequestedBy, JobId, Priority, Status, Notes, IsActive, CreatedBy, CreatedDate,
  ModifiedBy, ModifiedDate, BomId, Revision
FROM SYN_PMS_IND.proj.TBL_PURCHASE_REQUEST;
SET IDENTITY_INSERT proj.TBL_PURCHASE_REQUEST OFF;

-- 4. TBL_PURCHASE_REQUEST_LINE (depends on PurchaseRequest, Item, logically BomDetailId -> TBL_BOM_DETAILS above)
SET IDENTITY_INSERT proj.TBL_PURCHASE_REQUEST_LINE ON;
INSERT INTO proj.TBL_PURCHASE_REQUEST_LINE
  (PrLineId, PrId, LineNum, ItemId, ItemCode, ItemDesc, RequiredQty, PoCreatedQty, UomId, UomName,
   RequiredDate, EstUnitPrice, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
   BomDetailId, LineStatus)
SELECT
  PrLineId, PrId, LineNum, ItemId, ItemCode, ItemDesc, RequiredQty, PoCreatedQty, UomId, UomName,
  RequiredDate, EstUnitPrice, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
  BomDetailId, LineStatus
FROM SYN_PMS_IND.proj.TBL_PURCHASE_REQUEST_LINE;
SET IDENTITY_INSERT proj.TBL_PURCHASE_REQUEST_LINE OFF;

-- 5. TBL_PR_REVISION_LOG (source has 0 rows - no-op, included for completeness)
SET IDENTITY_INSERT proj.TBL_PR_REVISION_LOG ON;
INSERT INTO proj.TBL_PR_REVISION_LOG
  (LogId, PrId, RevisionNo, Reason, RevisedBy, RevisedDate)
SELECT
  LogId, PrId, RevisionNo, Reason, RevisedBy, RevisedDate
FROM SYN_PMS_IND.proj.TBL_PR_REVISION_LOG;
SET IDENTITY_INSERT proj.TBL_PR_REVISION_LOG OFF;

-- 6. TBL_PURCHASE_ORDER (depends on Supplier, SupplierContact, ExpenseCategory, Job, PaymentTerms)
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER ON;
INSERT INTO proj.TBL_PURCHASE_ORDER
  (PoId, PoNumber, PoDate, VendorName, VendorRef, CurrencyId, PaymentTermsId, DeliveryDate, DeliveryAddr,
   Status, Notes, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, SupplierId, JobId, ExchangeRate,
   Discount, TaxAmount, TotalAmount, DeliveryTerms, ApprovedBy, ApprovedDate, Revision, PaidAmount,
   InvoiceReceived, HoldBy, HoldDate, LegacyOrderId, Priority, SupplierContactId, ExpenseCategoryId,
   VendorQuoteDate, PoSentDate, HoldReason, StatusBeforeHold, PaymentTermsOther)
SELECT
  PoId, PoNumber, PoDate, VendorName, VendorRef, CurrencyId, PaymentTermsId, DeliveryDate, DeliveryAddr,
  Status, Notes, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, SupplierId, JobId, ExchangeRate,
  Discount, TaxAmount, TotalAmount, DeliveryTerms, ApprovedBy, ApprovedDate, Revision, PaidAmount,
  InvoiceReceived, HoldBy, HoldDate, LegacyOrderId, Priority, SupplierContactId, ExpenseCategoryId,
  VendorQuoteDate, PoSentDate, HoldReason, StatusBeforeHold, PaymentTermsOther
FROM SYN_PMS_IND.proj.TBL_PURCHASE_ORDER;
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER OFF;

-- 7. TBL_PURCHASE_ORDER_LINE (depends on PurchaseOrder, PurchaseRequestLine, Item)
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_LINE ON;
INSERT INTO proj.TBL_PURCHASE_ORDER_LINE
  (PoLineId, PoId, LineNum, PrLineId, ItemId, ItemCode, ItemDesc, OrderedQty, ReceivedQty, UomId, UomName,
   UnitPrice, TaxPct, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, LineStatus)
SELECT
  PoLineId, PoId, LineNum, PrLineId, ItemId, ItemCode, ItemDesc, OrderedQty, ReceivedQty, UomId, UomName,
  UnitPrice, TaxPct, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, LineStatus
FROM SYN_PMS_IND.proj.TBL_PURCHASE_ORDER_LINE;
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_LINE OFF;

-- 8. TBL_PURCHASE_ORDER_META (depends on PurchaseOrder)
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_META ON;
INSERT INTO proj.TBL_PURCHASE_ORDER_META
  (PoMetaId, PoId, IsWarranty, IsPreInspection, IsShipping, IsCOO, IsDrawing, IsMTC, VendorQtnDate,
   CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, IsQtn, IsOthers, IsNote1, IsNote2, IsNote3)
SELECT
  PoMetaId, PoId, IsWarranty, IsPreInspection, IsShipping, IsCOO, IsDrawing, IsMTC, VendorQtnDate,
  CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, IsQtn, IsOthers, IsNote1, IsNote2, IsNote3
FROM SYN_PMS_IND.proj.TBL_PURCHASE_ORDER_META;
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_META OFF;

-- 9. TBL_PURCHASE_ORDER_ANNEXURE (source has 0 rows - no-op)
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_ANNEXURE ON;
INSERT INTO proj.TBL_PURCHASE_ORDER_ANNEXURE
  (AnnexureId, PoId, AnnexureCode, Title, Notes, SortOrder, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  AnnexureId, PoId, AnnexureCode, Title, Notes, SortOrder, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_PURCHASE_ORDER_ANNEXURE;
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_ANNEXURE OFF;

-- 10. TBL_PURCHASE_ORDER_ANNEXURE_DETAIL (source has 0 rows - no-op)
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_ANNEXURE_DETAIL ON;
INSERT INTO proj.TBL_PURCHASE_ORDER_ANNEXURE_DETAIL
  (AnnexureDetailId, AnnexureId, LineNum, Description, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  AnnexureDetailId, AnnexureId, LineNum, Description, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_PURCHASE_ORDER_ANNEXURE_DETAIL;
SET IDENTITY_INSERT proj.TBL_PURCHASE_ORDER_ANNEXURE_DETAIL OFF;

-- 11. TBL_PURCHASE_ORDER_ANNEXURE_LINE_LINK (source has 0 rows - no-op; composite PK, no identity)
INSERT INTO proj.TBL_PURCHASE_ORDER_ANNEXURE_LINE_LINK
  (AnnexureId, PoLineId, CreatedBy, CreatedDate)
SELECT
  AnnexureId, PoLineId, CreatedBy, CreatedDate
FROM SYN_PMS_IND.proj.TBL_PURCHASE_ORDER_ANNEXURE_LINE_LINK;

-- 12. TBL_PO_AMENDMENT_LOG (source has 0 rows - no-op)
SET IDENTITY_INSERT proj.TBL_PO_AMENDMENT_LOG ON;
INSERT INTO proj.TBL_PO_AMENDMENT_LOG
  (AmendmentId, PoLineId, PoId, LineNum, ItemCode, ItemDesc, OldQty, NewQty, OldPrice, NewPrice, Reason,
   AmendedBy, AmendedDate)
SELECT
  AmendmentId, PoLineId, PoId, LineNum, ItemCode, ItemDesc, OldQty, NewQty, OldPrice, NewPrice, Reason,
  AmendedBy, AmendedDate
FROM SYN_PMS_IND.proj.TBL_PO_AMENDMENT_LOG;
SET IDENTITY_INSERT proj.TBL_PO_AMENDMENT_LOG OFF;

-- 13. TBL_PO_HOLD_LOG (source has 0 rows - no-op)
SET IDENTITY_INSERT proj.TBL_PO_HOLD_LOG ON;
INSERT INTO proj.TBL_PO_HOLD_LOG
  (HoldLogId, PoId, Action, Reason, PreviousStatus, ActionBy, ActionDate)
SELECT
  HoldLogId, PoId, Action, Reason, PreviousStatus, ActionBy, ActionDate
FROM SYN_PMS_IND.proj.TBL_PO_HOLD_LOG;
SET IDENTITY_INSERT proj.TBL_PO_HOLD_LOG OFF;

-- 14. TBL_PO_REVISION_LOG (source has 0 rows - no-op)
SET IDENTITY_INSERT proj.TBL_PO_REVISION_LOG ON;
INSERT INTO proj.TBL_PO_REVISION_LOG
  (RevisionLogId, PoId, RevisionNo, Reason, RevisedBy, RevisedDate)
SELECT
  RevisionLogId, PoId, RevisionNo, Reason, RevisedBy, RevisedDate
FROM SYN_PMS_IND.proj.TBL_PO_REVISION_LOG;
SET IDENTITY_INSERT proj.TBL_PO_REVISION_LOG OFF;

-- 15. TBL_GRN_HEADER (source has 0 rows - no-op; depends on PurchaseOrder, Supplier, Job)
SET IDENTITY_INSERT proj.TBL_GRN_HEADER ON;
INSERT INTO proj.TBL_GRN_HEADER
  (GrnId, GrnNumber, PoId, SupplierId, JobId, GrnDate, ReceivedDate, DoNo, ReceivedBy, ReceivedFrom,
   ShipmentBy, DeliveryTerms, DeliveryLocation, ShipmentDetails, InvoiceNo, InvoiceDate, CurrencyId,
   ExchangeRate, TotalAmount, BoeNo, BoeDate, IsRegistered, RegisteredBy, RegisteredDate, Status, Remarks,
   IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, LegacyGrnNo, CancelledBy, CancelledDate, CancelReason)
SELECT
  GrnId, GrnNumber, PoId, SupplierId, JobId, GrnDate, ReceivedDate, DoNo, ReceivedBy, ReceivedFrom,
  ShipmentBy, DeliveryTerms, DeliveryLocation, ShipmentDetails, InvoiceNo, InvoiceDate, CurrencyId,
  ExchangeRate, TotalAmount, BoeNo, BoeDate, IsRegistered, RegisteredBy, RegisteredDate, Status, Remarks,
  IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, LegacyGrnNo, CancelledBy, CancelledDate, CancelReason
FROM SYN_PMS_IND.proj.TBL_GRN_HEADER;
SET IDENTITY_INSERT proj.TBL_GRN_HEADER OFF;

-- 16. TBL_GRN_DETAIL (source has 0 rows - no-op; AcceptedQty/LineTotal/LineTotalWithTax are
--     COMPUTED columns in SYNERP - excluded from explicit list)
SET IDENTITY_INSERT proj.TBL_GRN_DETAIL ON;
INSERT INTO proj.TBL_GRN_DETAIL
  (GrnDetailId, GrnId, LineNum, PoLineId, PrLineId, ItemId, ItemCode, ItemDesc, OrderedQty, ReceivedQty,
   RejectedQty, UomId, UomName, UnitPrice, TaxPct, BatchNo, SerialNo, ExpiryDate, StorageLocation,
   BinLocation, QcStatus, QcRemarks, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
SELECT
  GrnDetailId, GrnId, LineNum, PoLineId, PrLineId, ItemId, ItemCode, ItemDesc, OrderedQty, ReceivedQty,
  RejectedQty, UomId, UomName, UnitPrice, TaxPct, BatchNo, SerialNo, ExpiryDate, StorageLocation,
  BinLocation, QcStatus, QcRemarks, Remarks, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
FROM SYN_PMS_IND.proj.TBL_GRN_DETAIL;
SET IDENTITY_INSERT proj.TBL_GRN_DETAIL OFF;

-- 17. TBL_GRN_QC_LOG (source has 0 rows - no-op; depends on GrnHeader)
SET IDENTITY_INSERT proj.TBL_GRN_QC_LOG ON;
INSERT INTO proj.TBL_GRN_QC_LOG
  (QcLogId, GrnId, CheckedBy, CheckedDate, Remarks, Decision, DecisionNotes, DecisionBy, DecisionDate)
SELECT
  QcLogId, GrnId, CheckedBy, CheckedDate, Remarks, Decision, DecisionNotes, DecisionBy, DecisionDate
FROM SYN_PMS_IND.proj.TBL_GRN_QC_LOG;
SET IDENTITY_INSERT proj.TBL_GRN_QC_LOG OFF;

-- 18. TBL_GRN_QC_LOG_DETAIL (source has 0 rows - no-op; depends on QcLog, pre-existing GrnQcItem)
SET IDENTITY_INSERT proj.TBL_GRN_QC_LOG_DETAIL ON;
INSERT INTO proj.TBL_GRN_QC_LOG_DETAIL
  (QcDetailId, QcLogId, QcItemId, ItemName, IsChecked, Notes)
SELECT
  QcDetailId, QcLogId, QcItemId, ItemName, IsChecked, Notes
FROM SYN_PMS_IND.proj.TBL_GRN_QC_LOG_DETAIL;
SET IDENTITY_INSERT proj.TBL_GRN_QC_LOG_DETAIL OFF;

COMMIT TRANSACTION;
GO

-- Verify row counts match source after migration
SELECT 'TBL_BOM_HEADER' t, COUNT(*) c FROM proj.TBL_BOM_HEADER
UNION ALL SELECT 'TBL_BOM_DETAILS', COUNT(*) FROM proj.TBL_BOM_DETAILS
UNION ALL SELECT 'TBL_PURCHASE_REQUEST', COUNT(*) FROM proj.TBL_PURCHASE_REQUEST
UNION ALL SELECT 'TBL_PURCHASE_REQUEST_LINE', COUNT(*) FROM proj.TBL_PURCHASE_REQUEST_LINE
UNION ALL SELECT 'TBL_PR_REVISION_LOG', COUNT(*) FROM proj.TBL_PR_REVISION_LOG
UNION ALL SELECT 'TBL_PURCHASE_ORDER', COUNT(*) FROM proj.TBL_PURCHASE_ORDER
UNION ALL SELECT 'TBL_PURCHASE_ORDER_LINE', COUNT(*) FROM proj.TBL_PURCHASE_ORDER_LINE
UNION ALL SELECT 'TBL_PURCHASE_ORDER_META', COUNT(*) FROM proj.TBL_PURCHASE_ORDER_META
UNION ALL SELECT 'TBL_PURCHASE_ORDER_ANNEXURE', COUNT(*) FROM proj.TBL_PURCHASE_ORDER_ANNEXURE
UNION ALL SELECT 'TBL_PURCHASE_ORDER_ANNEXURE_DETAIL', COUNT(*) FROM proj.TBL_PURCHASE_ORDER_ANNEXURE_DETAIL
UNION ALL SELECT 'TBL_PURCHASE_ORDER_ANNEXURE_LINE_LINK', COUNT(*) FROM proj.TBL_PURCHASE_ORDER_ANNEXURE_LINE_LINK
UNION ALL SELECT 'TBL_PO_AMENDMENT_LOG', COUNT(*) FROM proj.TBL_PO_AMENDMENT_LOG
UNION ALL SELECT 'TBL_PO_HOLD_LOG', COUNT(*) FROM proj.TBL_PO_HOLD_LOG
UNION ALL SELECT 'TBL_PO_REVISION_LOG', COUNT(*) FROM proj.TBL_PO_REVISION_LOG
UNION ALL SELECT 'TBL_GRN_HEADER', COUNT(*) FROM proj.TBL_GRN_HEADER
UNION ALL SELECT 'TBL_GRN_DETAIL', COUNT(*) FROM proj.TBL_GRN_DETAIL
UNION ALL SELECT 'TBL_GRN_QC_LOG', COUNT(*) FROM proj.TBL_GRN_QC_LOG
UNION ALL SELECT 'TBL_GRN_QC_LOG_DETAIL', COUNT(*) FROM proj.TBL_GRN_QC_LOG_DETAIL;
GO
