-- PROD_2026-11-15: approve every EXISTING active supplier at go-live of supplier approval (user, 2026-11-15:
--   "existing suppliers we need to approve; new ones onwards need approval").
--   Needs 2026-11-02a and 2026-11-02b. Run right after them, on SYNERPINDIA and on SYNERPUAE.
--   The checklist (country, bank, tax treatment, contact, address) is NOT applied to these existing suppliers;
--   they are marked ApprovedBy = 'GO_LIVE_20261115' with a remark so they can be told apart.
--   Suppliers created after this script must be approved on the supplier screen (sp_ApproveSupplier).
--   Run-once: if any supplier already carries ApprovedBy = 'GO_LIVE_20261115', nothing is changed (a later re-run can
--   never approve a supplier added after go-live). A bank change still withdraws approval as usual.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF COL_LENGTH('proj.TBL_SUPPLIER', 'ApprovedBy') IS NULL
    THROW 50001, 'Run 2026-11-02a and 2026-11-02b first (TBL_SUPPLIER.ApprovedBy missing). Nothing changed.', 1;

IF EXISTS (SELECT 1 FROM proj.TBL_SUPPLIER WHERE ApprovedBy = N'GO_LIVE_20261115')
BEGIN
    SELECT 'ALREADY DONE - nothing changed' AS result,
           (SELECT COUNT(*) FROM proj.TBL_SUPPLIER WHERE ApprovedBy = N'GO_LIVE_20261115') AS approved_at_go_live;
    RETURN;
END

BEGIN TRAN;
    SELECT 'before' AS step, COUNT(*) AS active_suppliers, SUM(CASE WHEN IsApprovedVendor = 1 THEN 1 ELSE 0 END) AS approved
    FROM proj.TBL_SUPPLIER WHERE IsActive = 1;

    UPDATE proj.TBL_SUPPLIER
    SET    IsApprovedVendor = 1,
           ApprovedBy       = N'GO_LIVE_20261115',
           ApprovedDate     = GETDATE(),
           ApprovalRemarks  = N'Existing supplier approved at go-live of supplier approval (2026-11-15). Checklist not applied.'
    WHERE  IsActive = 1 AND ISNULL(IsApprovedVendor, 0) = 0;

    DECLARE @n INT = @@ROWCOUNT;

    SELECT 'after' AS step, COUNT(*) AS active_suppliers, SUM(CASE WHEN IsApprovedVendor = 1 THEN 1 ELSE 0 END) AS approved,
           @n AS approved_now
    FROM proj.TBL_SUPPLIER WHERE IsActive = 1;
COMMIT;

SELECT CONCAT('DONE - ', @n, ' existing supplier(s) approved') AS result;
