-- ═══════════════════════════════════════════════════════════════════
--  PURCHASE ORDER MIGRATION SCRIPT
--  Old system  → PROJ.TBL_PURCHASE_ORDER + PROJ.TBL_PURCHASE_ORDER_META
--
--  BEFORE RUNNING:
--    1. Replace [OLD_DB].[dbo].[YOUR_OLD_PO_TABLE] with your actual
--       old table reference (e.g. OldERP.dbo.PurchaseOrder)
--    2. Check the PoStatusId CASE mapping below matches your old status IDs
--    3. Verify SupplierId values match between old and new TBL_SUPPLIER
--    4. Run in a transaction first — test with SELECT before INSERT
-- ═══════════════════════════════════════════════════════════════════

USE ERPDB;
GO

-- ── STEP 0: View old status IDs to build the mapping ────────────────
-- Run this first against your old DB to see all status values:
-- SELECT DISTINCT PoStatusId FROM [OLD_DB].[dbo].[YOUR_OLD_PO_TABLE] ORDER BY PoStatusId

-- ── STEP 1: Migrate PO Headers ──────────────────────────────────────
BEGIN TRANSACTION;

INSERT INTO PROJ.TBL_PURCHASE_ORDER (
    PoNumber,
    PoDate,
    SupplierId,
    JobId,
    VendorName,
    VendorRef,
    CurrencyId,
    ExchangeRate,
    PaymentTermsId,
    DeliveryDate,
    DeliveryAddr,
    DeliveryTerms,
    TotalAmount,
    Discount,
    TaxAmount,
    PaidAmount,
    InvoiceReceived,
    ApprovedBy,
    ApprovedDate,
    HoldBy,
    HoldDate,
    Revision,
    Notes,
    Status,
    IsActive,
    CreatedBy,
    CreatedDate,
    ModifiedBy,
    ModifiedDate,
    LegacyOrderId      -- keeps old OrderId for traceability
)
SELECT
    -- Generate new PO number or carry old one over
    ISNULL(CAST(old.OrderId AS NVARCHAR(30)), 'MIGRATED-' + CAST(old.OrderId AS NVARCHAR)),

    ISNULL(old.PoDate, GETDATE()),

    -- SupplierId: direct if same IDs, otherwise join on name
    old.SupplierId,
    -- OR if supplier IDs differ, resolve by name:
    -- (SELECT TOP 1 SupplierId FROM PROJ.TBL_SUPPLIER WHERE SupplierName = old.SupplierName),

    -- JobId: old JobRef may be the job number
    NULLIF(LTRIM(RTRIM(old.JobRef)), ''),

    -- VendorName: keep as fallback text
    NULL,   -- will be resolved via SupplierId above

    old.VendorQtnRef,

    -- CurrencyId: map or hardcode default
    ISNULL(old.PocurrencyId, 1),

    ISNULL(old.PoCurrencyRate, 1),

    -- PaymentTermsId: if old PaymentTerms was text, resolve:
    -- (SELECT TOP 1 PaymentTermsId FROM PROJ.TBL_PAYMENT_TERMS WHERE TermName = old.PaymentTerms)
    -- If it was an int FK:
    NULL,   -- TODO: map old.PaymentTermsId

    NULL,   -- DeliveryDate (add from old if available)

    old.DeliveryLocation,

    old.DeliveryTerms,

    old.PoAmount,

    old.Discount,

    old.taxamount,

    old.PaidAmount,

    CASE WHEN old.InvoiceReceived IS NOT NULL AND old.InvoiceReceived <> '' THEN 1 ELSE 0 END,

    CAST(old.PoAuthorisedBy AS NVARCHAR(100)),

    old.PoAuthorisedDate,

    CAST(old.POHoldBy AS NVARCHAR(100)),

    old.POHoldDate,

    ISNULL(TRY_CAST(old.revision AS INT), 0),

    old.PoRemarks,

    -- ── STATUS MAPPING ── adjust IDs to match your old system ──
    CASE old.PoStatusId
        WHEN 1  THEN 'Draft'
        WHEN 2  THEN 'Approved'
        WHEN 3  THEN 'Sent'
        WHEN 4  THEN 'Partial'
        WHEN 5  THEN 'Received'
        WHEN 6  THEN 'Cancelled'
        ELSE         'Draft'
    END,

    1,  -- IsActive

    ISNULL(old.Author, 'MIGRATION'),

    ISNULL(old.PoDate, GETDATE()),

    old.PoLastModifiedBy,

    NULL,   -- ModifiedDate

    old.OrderId
FROM
    [OLD_DB].[dbo].[YOUR_OLD_PO_TABLE] old  -- ← CHANGE THIS
WHERE
    old.OrderId IS NOT NULL;

-- ROLLBACK;   -- ← uncomment to test safely
-- COMMIT;     -- ← uncomment when ready


-- ── STEP 2: Migrate META fields ──────────────────────────────────────
-- Run after STEP 1 commits successfully

INSERT INTO PROJ.TBL_PURCHASE_ORDER_META (
    PoId,
    IsWarranty,
    IsPreInspection,
    IsShipping,
    IsCOO,
    IsDrawing,
    VendorQtnDate,
    PoSentDate,
    PoVerifiedBy,
    PoAmountWords,
    CreatedBy,
    CreatedDate
)
SELECT
    po.PoId,
    CASE WHEN old.IsWarranty = 'Y' OR old.IsWarranty = '1' THEN 1 ELSE 0 END,
    CASE WHEN old.IsPreInspection = 'Y' OR old.IsPreInspection = '1' THEN 1 ELSE 0 END,
    CASE WHEN old.IsShipping = 'Y' OR old.IsShipping = '1' THEN 1 ELSE 0 END,
    CASE WHEN old.IsCoo = 'Y' OR old.IsCoo = '1' THEN 1 ELSE 0 END,
    CASE WHEN old.IsDrawing = 'Y' OR old.IsDrawing = '1' THEN 1 ELSE 0 END,
    TRY_CAST(old.VendorQtnDate AS DATE),
    TRY_CAST(old.PoSentDate AS DATETIME),
    CAST(old.IsVerifiedby AS NVARCHAR(100)),
    old.PoAmountWords,
    'MIGRATION',
    GETDATE()
FROM
    [OLD_DB].[dbo].[YOUR_OLD_PO_TABLE] old   -- ← CHANGE THIS
    INNER JOIN PROJ.TBL_PURCHASE_ORDER po ON po.LegacyOrderId = old.OrderId;


-- ── STEP 3: Verification queries ────────────────────────────────────
-- Run after migration to check counts match:

-- SELECT COUNT(*) AS OldCount FROM [OLD_DB].[dbo].[YOUR_OLD_PO_TABLE];
-- SELECT COUNT(*) AS NewCount FROM PROJ.TBL_PURCHASE_ORDER WHERE LegacyOrderId IS NOT NULL;
-- SELECT COUNT(*) AS MetaCount FROM PROJ.TBL_PURCHASE_ORDER_META;

-- Check any unmapped suppliers (SupplierId is NULL but old had one):
-- SELECT po.LegacyOrderId, po.VendorName
-- FROM PROJ.TBL_PURCHASE_ORDER po
-- WHERE po.LegacyOrderId IS NOT NULL AND po.SupplierId IS NULL;

-- Check status distribution after migration:
-- SELECT Status, COUNT(*) AS Cnt FROM PROJ.TBL_PURCHASE_ORDER GROUP BY Status;
