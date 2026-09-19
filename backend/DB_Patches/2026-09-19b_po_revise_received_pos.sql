-- =====================================================================
-- 2026-09-19b  Revise PO for a PO that already has goods received
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
-- Run AFTER 2026-09-19_po_amend_line_recalc_header_total.sql.
--
-- SCENARIO: a supplier raises the price after the GRN is registered and the
-- increase is more than the quick "Amend PO Line" may allow (approved value
-- + Biz.PoAmend.ReapprovalTolerancePct, default 0 = any increase). The route
-- chosen for that: Revise PO  ->  PO becomes Draft  ->  edit the price  ->
-- resubmit for approval (normal PO approval levels, and the PO budget guard
-- inside sp_SubmitForApproval runs again)  ->  approved.
--
-- WHAT STOPPED THAT WORKING FOR A RECEIVED PO
--  1. sp_RevisePO refused a fully Received PO outright.
--  2. sp_SetPOLine let a Draft PO's ordered qty be cut BELOW what was already
--     received (no guard on the update path).
--  3. When the approval engine completes it sets the PO to 'Approved' even if
--     every line was already received, and the PO status only re-derives from
--     its lines when a receipt changes - so the PO would sit on 'Approved'.
--     The PO approval module had no post-approval hook to put it right.
--
-- WHAT THIS SCRIPT DOES
--  a. Setting Biz.PoAmend.ReapprovalTolerancePct = 0 (inserted only if absent).
--  b. sp_RevisePO: a Received PO can now be revised. Everything else unchanged.
--  c. sp_SetPOLine: ordered qty may not go below the qty already received on
--     the line (confirmed or draft GRNs). Surgical ALTER (anchor-checked,
--     idempotent) because the procedure is ~10,700 chars.
--  d. New proj.sp_PostPOApproval, registered as the PO approval module's
--     PostApprovalSP: after approval, a PO that has received qty is put back
--     to Received/Partial by the same roll-up sp_RecalcPoLineStatus already
--     uses. A PO with nothing received and that was never Sent (every normal
--     first approval) is a no-op.
--  e. 'Sent' is restored. sp_RevisePO now records the status the PO had
--     (TBL_PO_REVISION_LOG.PreviousStatus, new nullable column) and, when it
--     was 'Sent' and nothing has been received, sp_PostPOApproval puts it back
--     to 'Sent' instead of leaving it on 'Approved'. PoSentDate is never
--     cleared by Revise, so the ORIGINAL sent date is kept. Received/Partial
--     are NOT stored - they are always re-derived from the lines, so they
--     cannot go stale. NB the supplier has not been sent the revised
--     version; the PO should be re-sent.
--
-- KNOWN SIDE EFFECT (inherent to Revise, already true for Approved/Partial
-- POs): while the PO is Draft it is not counted as a job commitment
-- (VW_JOB_COST_ACTUAL and the PO budget guard exclude Draft POs) and no GRN
-- can be booked against it. Both come back when it is re-approved.
--
-- PRE-FLIGHT on any other database (dev lengths when this was written):
--   LEN(OBJECT_DEFINITION('proj.sp_RevisePO'))  = 2209  (full-body replace below;
--        if it differs, diff it first)
--   LEN(OBJECT_DEFINITION('proj.sp_SetPOLine')) = 10749 (surgical, self-checking)
--   PO approval module PostApprovalSP           = NULL  (only set if NULL)
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── a. setting ───────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Biz.PoAmend.ReapprovalTolerancePct')
    INSERT INTO proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES (N'Biz.PoAmend.ReapprovalTolerancePct', N'0',
            N'Quick "Amend PO Line" may raise an approved PO up to this % above its APPROVED value. Anything higher must use Revise PO and go back through approval. 0 = every increase needs Revise.',
            N'system', GETDATE());
GO

-- ── a2. revision log remembers the status the PO had ─────────────────
IF COL_LENGTH('proj.TBL_PO_REVISION_LOG', 'PreviousStatus') IS NULL
    ALTER TABLE proj.TBL_PO_REVISION_LOG ADD PreviousStatus NVARCHAR(30) NULL;
GO

-- ── b. sp_RevisePO: allow a Received PO, remember the previous status ─
CREATE OR ALTER PROCEDURE proj.sp_RevisePO
    @PoId         INT,
    @RevisedBy    NVARCHAR(100),
    @Reason       NVARCHAR(500),
    @PasswordHash NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (
        SELECT 1 FROM proj.TBL_USERS
        WHERE UserName = @RevisedBy AND PasswordHash = @PasswordHash AND IsActive = 1
    )
        THROW 50720, 'Incorrect password.', 1;

    IF LTRIM(RTRIM(ISNULL(@Reason, ''))) = ''
        THROW 50721, 'A reason is required to revise the PO.', 1;

    DECLARE @PoStatus NVARCHAR(30);
    SELECT @PoStatus = Status
    FROM proj.TBL_PURCHASE_ORDER
    WHERE PoId = @PoId AND IsActive = 1;

    -- 'Received' is allowed: this is how a price is corrected after the GRN when
    -- the change is too large for a quick amendment. Goods already received are
    -- untouched; sp_PostPOApproval restores Received/Partial once re-approved.
    IF @PoStatus NOT IN ('Approved', 'Sent', 'Partial', 'Received')
    BEGIN
        DECLARE @StatusMsg NVARCHAR(200) = 'Cannot revise: PO must be in Approved, Sent, Partial or Received status. Current status: ' + ISNULL(@PoStatus, 'Unknown') + '.';
        THROW 50723, @StatusMsg, 1;
    END

    DECLARE @NewRevision INT;

    UPDATE proj.TBL_PURCHASE_ORDER
    SET    Status       = 'Draft',
           Revision     = Revision + 1,
           ModifiedBy   = @RevisedBy,
           ModifiedDate = GETDATE()
    WHERE  PoId     = @PoId
      AND  IsActive = 1;

    IF @@ROWCOUNT = 0
        THROW 50724, 'Purchase order not found or is inactive.', 1;

    SELECT @NewRevision = Revision FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoId;

    UPDATE proj.TBL_APPROVAL_TRANSACTION
    SET    CurrentStatus  = 'Cancelled',
           FinalAction    = 'Cancelled',
           FinalActionBy  = @RevisedBy,
           FinalRemarks   = 'Cancelled — PO revised back to Draft. Reason: ' + @Reason,
           CompletedDate  = GETDATE(),
           ModifiedBy     = @RevisedBy,
           ModifiedDate   = GETDATE()
    WHERE  ModuleId      = 2
      AND  DocumentId    = @PoId
      AND  CurrentStatus NOT IN ('Cancelled', 'Rejected');

    INSERT INTO proj.TBL_PO_REVISION_LOG (PoId, RevisionNo, Reason, RevisedBy, RevisedDate, PreviousStatus)
    VALUES (@PoId, @NewRevision, @Reason, @RevisedBy, GETDATE(), @PoStatus);

    SELECT @PoId AS PoId;
END
GO

-- ── c. sp_SetPOLine: qty may not drop below what is already received ─
DECLARE @def    NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('proj.sp_SetPOLine'));
DECLARE @anchor NVARCHAR(200) = N'SELECT @OldOrderedQty = OrderedQty, @OldPrLineId = PrLineId';
DECLARE @guard  NVARCHAR(MAX) = N'-- A PO line can never be ordered for less than has already been received
        -- against it (confirmed or draft GRNs). This matters now that a received PO
        -- can be revised back to Draft for a price correction: without it the
        -- quantity could be cut below what has physically arrived.
        DECLARE @GrnQtyOnLine DECIMAL(18,4) = (
            SELECT ISNULL(SUM(d.ReceivedQty), 0)
            FROM   proj.TBL_GRN_DETAIL d
            JOIN   proj.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1
            WHERE  d.PoLineId = @PoLineId AND d.IsActive = 1 AND h.Status <> ''Cancelled'');
        IF @OrderedQty < @GrnQtyOnLine
        BEGIN
            DECLARE @GrnQtyMsg NVARCHAR(300) = ''Ordered quantity ('' + CAST(@OrderedQty AS NVARCHAR(30))
                + '') cannot be less than the quantity already received on this line ('' + CAST(@GrnQtyOnLine AS NVARCHAR(30)) + '').'';
            THROW 50762, @GrnQtyMsg, 1;
        END

        ';

IF @def IS NULL
    THROW 51000, 'proj.sp_SetPOLine not found.', 1;

IF CHARINDEX(N'@GrnQtyOnLine', @def) > 0
    PRINT 'sp_SetPOLine already guarded - nothing to do.';
ELSE
BEGIN
    IF CHARINDEX(@anchor, @def) = 0
        THROW 51001, 'Anchor not found in sp_SetPOLine. Inspect the procedure and patch by hand.', 1;

    -- insert the guard immediately BEFORE the anchor statement
    SET @def = STUFF(@def, CHARINDEX(@anchor, @def), 0, @guard);

    -- CREATE -> ALTER, everything else untouched
    DECLARE @createPos INT = PATINDEX(N'%CREATE[ ]%PROCEDURE%', @def);
    IF @createPos = 0
        THROW 51002, 'CREATE PROCEDURE header not found in sp_SetPOLine.', 1;
    SET @def = STUFF(@def, @createPos, LEN(N'CREATE'), N'ALTER');

    EXEC sp_executesql @def;
    PRINT 'Received-qty guard added to proj.sp_SetPOLine.';
END
GO

-- ── d. post-approval hook: restore Received/Partial ──────────────────
CREATE OR ALTER PROCEDURE proj.sp_PostPOApproval
    @DocId INT,
    @By    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- The approval engine has just set the PO to 'Approved'.
    --  * Goods already received (a Revise PO of a received PO): put the header
    --    back to what its lines say - Received / Partial - using the same
    --    roll-up as sp_RecalcPoLineStatus. Derived, never stored, so it cannot
    --    go stale.
    --  * Nothing received: if the PO was 'Sent' when it was revised, restore
    --    'Sent' (the previous status is kept on the revision log). PoSentDate was
    --    never cleared, so the original sent date is unchanged.
    --  * Otherwise (every normal first approval): no-op.
    IF EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_ORDER_LINE
               WHERE PoId = @DocId AND IsActive = 1 AND ISNULL(ReceivedQty, 0) > 0)
    BEGIN
        DECLARE @AnyLine INT = (SELECT TOP 1 PoLineId FROM proj.TBL_PURCHASE_ORDER_LINE
                                WHERE PoId = @DocId AND IsActive = 1 ORDER BY PoLineId);
        IF @AnyLine IS NOT NULL
            EXEC proj.sp_RecalcPoLineStatus @AnyLine, @By;
        RETURN;
    END

    IF ISNULL((SELECT TOP 1 PreviousStatus FROM proj.TBL_PO_REVISION_LOG
               WHERE PoId = @DocId ORDER BY RevisionLogId DESC), '') = 'Sent'
        UPDATE proj.TBL_PURCHASE_ORDER
        SET    Status       = 'Sent',
               ModifiedBy   = ISNULL(@By, ModifiedBy),
               ModifiedDate = GETDATE()
        WHERE  PoId = @DocId AND IsActive = 1 AND Status = 'Approved';   -- only what the engine just set
END
GO

UPDATE proj.TBL_APPROVAL_MODULE
SET    PostApprovalSP = N'proj.sp_PostPOApproval'
WHERE  ModuleCode = 'PO' AND PostApprovalSP IS NULL;
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item = 'setting Biz.PoAmend.ReapprovalTolerancePct',
       Status = CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Biz.PoAmend.ReapprovalTolerancePct') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'sp_RevisePO allows Received',
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_RevisePO')) LIKE '%Sent'', ''Partial'', ''Received''%'
             AND OBJECT_DEFINITION(OBJECT_ID('proj.sp_RevisePO')) NOT LIKE '%fully received%' THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'sp_SetPOLine received-qty guard',
       CASE WHEN CHARINDEX('@GrnQtyOnLine', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SetPOLine')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'TBL_PO_REVISION_LOG.PreviousStatus',
       CASE WHEN COL_LENGTH('proj.TBL_PO_REVISION_LOG', 'PreviousStatus') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'sp_RevisePO records PreviousStatus / hook restores Sent',
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_RevisePO')) LIKE '%PreviousStatus%'
             AND OBJECT_DEFINITION(OBJECT_ID('proj.sp_PostPOApproval')) LIKE '%PreviousStatus%' THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'PO approval module hook = sp_PostPOApproval',
       CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'PO' AND PostApprovalSP = N'proj.sp_PostPOApproval') THEN 'OK'
            ELSE 'CHECK - module already has a different hook: ' + ISNULL((SELECT PostApprovalSP FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'PO'), '(none)') END;
GO
