/* ============================================================================
   Patch: PR line Close/Cancel now writes to the History tab, and the
   Close-line confirmation dialog explains the consequence (no PO can be
   raised from that line afterward). Also fixes a pre-existing display bug
   where the header-level "Close PR" action (which already logged to
   TBL_PR_REVISION_LOG) always showed as "Revised to Draft" in the History
   tab, when it's actually a Close, not a revision.

   Session: 2026-08-08, WebErp-Synergy / SYNERP.
   Applied to: SYNERP (dev) directly via the synerp MCP connector.
   No C# backend changes — purely stored-proc + frontend, so this patch does
   NOT require a backend rebuild/restart, only the SQL + a frontend deploy.

   Requires code deploy alongside this script:
     - frontend/src/procurement/pr/tabs/PrLinesTab.js
         (Close/Cancel confirm modal warning text now states the PO
         consequence explicitly)
     - frontend/src/procurement/pr/tabs/PrHistoryTab.js
         (new 'LineStatus' entryType gets its own pill + colors; the
         RevisionNo=0 "Close PR" entries no longer show a misleading
         "Rev 0" pill)
   ============================================================================ */

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ── 1. New audit table for PR line status changes ───────────────────────
IF OBJECT_ID('PROJ.TBL_PR_LINE_STATUS_LOG') IS NULL
BEGIN
    CREATE TABLE PROJ.TBL_PR_LINE_STATUS_LOG (
        LogId        INT IDENTITY(1,1) PRIMARY KEY,
        PrId         INT NOT NULL,
        PrLineId     INT NOT NULL,
        LineNum      INT NULL,
        ItemCode     NVARCHAR(50) NULL,
        ItemDesc     NVARCHAR(300) NULL,
        OldStatus    NVARCHAR(20) NOT NULL,
        NewStatus    NVARCHAR(20) NOT NULL,
        ActionBy     NVARCHAR(100) NOT NULL,
        ActionDate   DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_PR_LINE_STATUS_LOG_PR FOREIGN KEY (PrId) REFERENCES PROJ.TBL_PURCHASE_REQUEST(PrId)
    );
END
GO

-- ── 2. sp_ChangePrLineStatus — logs every Close/Cancel to the new table ──
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_ChangePrLineStatus
    @PrLineId  INT,
    @NewStatus NVARCHAR(20),
    @ChangedBy NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    IF @NewStatus NOT IN ('Closed','Cancelled')
    BEGIN RAISERROR('Only Closed or Cancelled are allowed via manual PR line status change.', 16, 1); RETURN; END

    DECLARE @PrId          INT;
    DECLARE @CurrentStatus NVARCHAR(20);
    DECLARE @PoCreatedQty  DECIMAL(18,4);
    DECLARE @RequiredQty   DECIMAL(18,4);
    DECLARE @PrStatus      NVARCHAR(30);
    DECLARE @BomDetailId   INT;
    DECLARE @LineNum       INT;
    DECLARE @ItemCode      NVARCHAR(50);
    DECLARE @ItemDesc      NVARCHAR(300);

    SELECT @PrId          = prl.PrId,
           @CurrentStatus = prl.LineStatus,
           @PoCreatedQty  = ISNULL(prl.PoCreatedQty, 0),
           @RequiredQty   = ISNULL(prl.RequiredQty, 0),
           @PrStatus      = pr.Status,
           @BomDetailId   = prl.BomDetailId,
           @LineNum       = prl.LineNum,
           @ItemCode      = prl.ItemCode,
           @ItemDesc      = prl.ItemDesc
    FROM   PROJ.TBL_PURCHASE_REQUEST_LINE prl
    JOIN   PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
    WHERE  prl.PrLineId = @PrLineId AND prl.IsActive = 1;

    IF @PrId IS NULL
    BEGIN RAISERROR('PR line not found.', 16, 1); RETURN; END

    IF @CurrentStatus IN ('Closed','Cancelled')
    BEGIN
        DECLARE @AlreadyMsg NVARCHAR(100) = 'Line is already ' + @CurrentStatus + '.';
        RAISERROR(@AlreadyMsg, 16, 1);
        RETURN;
    END

    IF @NewStatus = 'Cancelled' AND @PoCreatedQty > 0
    BEGIN RAISERROR('Cannot cancel a line that already has Purchase Orders raised against it.', 16, 1); RETURN; END

    IF @PrStatus = 'Draft'
    BEGIN RAISERROR('Cannot change line status while PR is in Draft. Submit for approval first.', 16, 1); RETURN; END

    -- Update the PR line status
    UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
    SET    LineStatus    = @NewStatus,
           ModifiedBy    = @ChangedBy,
           ModifiedDate  = GETDATE()
    WHERE  PrLineId = @PrLineId;

    -- Audit trail entry — shown on the PR's History tab (sp_GetPRHistory).
    -- Closing/cancelling a line is otherwise invisible there since it's a
    -- line-level action, not a header-level approval/revision event.
    INSERT INTO PROJ.TBL_PR_LINE_STATUS_LOG
        (PrId, PrLineId, LineNum, ItemCode, ItemDesc, OldStatus, NewStatus, ActionBy, ActionDate)
    VALUES
        (@PrId, @PrLineId, @LineNum, @ItemCode, @ItemDesc, @CurrentStatus, @NewStatus, @ChangedBy, GETDATE());

    -- Release the un-ordered PR qty back to the BOM.
    -- Cancel: PoCreatedQty is 0 (guarded) → releases full RequiredQty.
    -- Close : releases RequiredQty - PoCreatedQty (keeps the qty already ordered).
    DECLARE @PrReleaseQty DECIMAL(18,4) = @RequiredQty - @PoCreatedQty;
    IF @PrReleaseQty < 0 SET @PrReleaseQty = 0;

    IF @BomDetailId IS NOT NULL AND @BomDetailId > 0
        UPDATE bom
        SET bom.PrCreatedQty = v.NewPr,
            bom.BomStatus     = CASE
                WHEN bom.BomReceivedQty >= bom.BomRequestedQty         THEN 'FullyReceived'
                WHEN bom.BomReceivedQty  > 0                           THEN 'PartialReceived'
                WHEN ISNULL(bom.PoCreatedQty,0) >= bom.BomRequestedQty THEN 'PORaised'
                WHEN ISNULL(bom.PoCreatedQty,0)  > 0                   THEN 'POPartial'
                WHEN v.NewPr >= bom.BomRequestedQty                    THEN 'PRRaised'
                WHEN v.NewPr  > 0                                      THEN 'PRPartial'
                ELSE 'Pending'
            END,
            bom.ModifiedBy   = @ChangedBy,
            bom.ModifiedDate = GETDATE()
        FROM PROJ.TBL_BOM_DETAILS bom
        CROSS APPLY (VALUES (
            CASE WHEN ISNULL(bom.PrCreatedQty,0) - @PrReleaseQty < 0 THEN CAST(0 AS DECIMAL(18,4))
                 ELSE ISNULL(bom.PrCreatedQty,0) - @PrReleaseQty END
        )) v(NewPr)
        WHERE bom.BomId = @BomDetailId;

    -- Recalculate PR header status.
    -- Guard: only become 'Ordered' if at least one line is actually Ordered
    -- (prevents an all-Cancelled PR from flipping to Ordered).
    UPDATE PROJ.TBL_PURCHASE_REQUEST
    SET    Status = CASE
               WHEN NOT EXISTS (
                   SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE
                   WHERE PrId=@PrId AND IsActive=1
                     AND LineStatus NOT IN ('Ordered','Closed','Cancelled')
               ) AND EXISTS (
                   SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE
                   WHERE PrId=@PrId AND IsActive=1 AND LineStatus = 'Ordered'
               ) THEN 'Ordered'
               WHEN EXISTS (
                   SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE
                   WHERE PrId=@PrId AND IsActive=1 AND PoCreatedQty > 0
               ) THEN 'Partial'
               ELSE Status
           END,
           ModifiedBy   = @ChangedBy,
           ModifiedDate = GETDATE()
    WHERE  PrId   = @PrId
      AND  Status NOT IN ('Draft','Cancelled','Closed','Rejected');

    SELECT CAST(@PrLineId AS NVARCHAR(20));
END
GO

-- ── 3. sp_GetPRHistory — adds the LineStatus branch + fixes the
--       "Close PR" header action's mislabeled "Revised to Draft" badge ──
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE proj.sp_GetPRHistory
    @PrId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Revision log entries — sp_ClosePR also writes here (RevisionNo=0,
    -- Reason prefixed 'CLOSE: ') since it shares the same log table as a
    -- real revision-to-draft; distinguish the two so the badge is accurate
    -- instead of always saying "Revised to Draft".
    SELECT
        'Revision'              AS EntryType,
        r.LogId                 AS EntryId,
        r.RevisionNo            AS RevisionNo,
        NULL                    AS LevelNo,
        CASE WHEN r.Reason LIKE 'CLOSE:%' THEN 'PR Closed' ELSE 'Revised to Draft' END AS Action,
        r.RevisedBy             AS ActionBy,
        r.RevisedBy             AS ActionByName,
        CAST(r.RevisedDate AS DATETIME) AS ActionDate,
        CASE WHEN r.Reason LIKE 'CLOSE:%' THEN LTRIM(SUBSTRING(r.Reason, 7, 500)) ELSE r.Reason END AS Remarks,
        CAST(0 AS BIT)          AS IsDelegated
    FROM proj.TBL_PR_REVISION_LOG r
    WHERE r.PrId = @PrId

    UNION ALL

    -- Approval log entries
    SELECT
        'Approval'                          AS EntryType,
        al.LogId                            AS EntryId,
        NULL                                AS RevisionNo,
        al.LevelNo                          AS LevelNo,
        al.Action                           AS Action,
        CAST(al.ActionBy AS NVARCHAR(100))  AS ActionBy,
        al.ActionByName                     AS ActionByName,
        al.ActionDate                       AS ActionDate,
        al.Remarks                          AS Remarks,
        al.IsDelegated                      AS IsDelegated
    FROM proj.TBL_APPROVAL_LOG al
    JOIN proj.TBL_APPROVAL_TRANSACTION at2
        ON at2.TransactionId = al.TransactionId
    WHERE at2.ModuleId   = 1
      AND at2.DocumentId = @PrId

    UNION ALL

    -- Line status changes (Close / Cancel on an individual PR line) — a
    -- line-level action that would otherwise be invisible on this
    -- header-level timeline.
    SELECT
        'LineStatus'                                            AS EntryType,
        ls.LogId                                                AS EntryId,
        NULL                                                    AS RevisionNo,
        NULL                                                    AS LevelNo,
        CASE ls.NewStatus
            WHEN 'Closed'    THEN 'Line Closed'
            WHEN 'Cancelled' THEN 'Line Cancelled'
            ELSE 'Line ' + ls.NewStatus
        END                                                      AS Action,
        ls.ActionBy                                              AS ActionBy,
        ls.ActionBy                                              AS ActionByName,
        ls.ActionDate                                            AS ActionDate,
        N'Line ' + CAST(ls.LineNum AS NVARCHAR(10)) + N' — ' +
            ISNULL(ls.ItemCode, N'') +
            CASE WHEN ls.ItemDesc IS NOT NULL THEN N' (' + ls.ItemDesc + N')' ELSE N'' END
                                                                  AS Remarks,
        CAST(0 AS BIT)                                           AS IsDelegated
    FROM proj.TBL_PR_LINE_STATUS_LOG ls
    WHERE ls.PrId = @PrId

    ORDER BY ActionDate DESC;
END
GO

-- ── 4. sp_RevisePR — reopen manually-Closed lines on revise ─────────────
-- Follow-up bug found same day: revising an Approved PR back to Draft (then
-- resubmitting) never touched TBL_PURCHASE_REQUEST_LINE.LineStatus, so a
-- line the user had manually Closed stayed stuck Closed forever even after
-- the whole PR went through another approval cycle. Now recomputes any
-- Closed line to Ordered/Partial/Open based on actual PoCreatedQty vs
-- RequiredQty (same 3-way logic sp_ChangePrLineStatus/sp_SetPOLine already
-- use), and logs the reset to TBL_PR_LINE_STATUS_LOG (from step 1 above)
-- so it shows on the History tab too. Cancelled lines are deliberately left
-- alone — Cancel is a more final action than Close and wasn't reported as
-- getting stuck.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_RevisePR
    @PrId      INT,
    @RevisedBy NVARCHAR(100),
    @Reason    NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;

    IF LTRIM(RTRIM(ISNULL(@Reason, ''))) = ''
    BEGIN RAISERROR('A reason is required to revise the PR.', 16, 1); RETURN; END

    DECLARE @CurrentStatus NVARCHAR(30);
    SELECT @CurrentStatus = Status
    FROM PROJ.TBL_PURCHASE_REQUEST
    WHERE PrId = @PrId AND IsActive = 1;

    IF @CurrentStatus IS NULL
    BEGIN RAISERROR('Purchase Request not found or is inactive.', 16, 1); RETURN; END

    IF @CurrentStatus NOT IN ('Approved', 'Partial')
    BEGIN
        DECLARE @StatusMsg NVARCHAR(200) = 'Cannot revise: PR must be Approved or Partial. Current status: '
            + ISNULL(@CurrentStatus, 'Unknown') + '.';
        RAISERROR(@StatusMsg, 16, 1);
        RETURN;
    END

    UPDATE PROJ.TBL_PURCHASE_REQUEST
    SET    Status       = 'Draft',
           Revision     = Revision + 1,
           ModifiedBy   = @RevisedBy,
           ModifiedDate = GETDATE()
    WHERE  PrId = @PrId AND IsActive = 1;

    DECLARE @Reopened TABLE (PrLineId INT, LineNum INT, ItemCode NVARCHAR(50), ItemDesc NVARCHAR(300), NewStatus NVARCHAR(20));

    UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
    SET    LineStatus   = CASE
               WHEN ISNULL(PoCreatedQty,0) >= RequiredQty THEN 'Ordered'
               WHEN ISNULL(PoCreatedQty,0) > 0             THEN 'Partial'
               ELSE 'Open'
           END,
           ModifiedBy   = @RevisedBy,
           ModifiedDate = GETDATE()
    OUTPUT inserted.PrLineId, inserted.LineNum, inserted.ItemCode, inserted.ItemDesc, inserted.LineStatus
        INTO @Reopened (PrLineId, LineNum, ItemCode, ItemDesc, NewStatus)
    WHERE  PrId = @PrId AND IsActive = 1 AND LineStatus = 'Closed';

    INSERT INTO PROJ.TBL_PR_LINE_STATUS_LOG (PrId, PrLineId, LineNum, ItemCode, ItemDesc, OldStatus, NewStatus, ActionBy, ActionDate)
    SELECT @PrId, PrLineId, LineNum, ItemCode, ItemDesc, 'Closed', NewStatus, @RevisedBy, GETDATE()
    FROM @Reopened;

    UPDATE PROJ.TBL_APPROVAL_TRANSACTION
    SET    CurrentStatus  = 'Cancelled',
           FinalAction    = 'Cancelled',
           FinalActionBy  = @RevisedBy,
           FinalRemarks   = 'Cancelled — PR revised back to Draft. Reason: ' + @Reason,
           CompletedDate  = GETDATE(),
           ModifiedBy     = @RevisedBy,
           ModifiedDate   = GETDATE()
    WHERE  ModuleId      = 1
      AND  DocumentId    = @PrId
      AND  CurrentStatus NOT IN ('Cancelled', 'Rejected');

    DECLARE @NewRevision INT;
    SELECT @NewRevision = Revision FROM PROJ.TBL_PURCHASE_REQUEST WHERE PrId = @PrId;

    INSERT INTO PROJ.TBL_PR_REVISION_LOG (PrId, RevisionNo, Reason, RevisedBy, RevisedDate)
    VALUES (@PrId, @NewRevision, @Reason, @RevisedBy, GETDATE());

    SELECT @PrId AS PrId;
END
GO

-- ── Post-check ───────────────────────────────────────────────────────────
SELECT o.name, m.uses_quoted_identifier, m.uses_ansi_nulls
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_ChangePrLineStatus','sp_GetPRHistory','sp_RevisePR');
GO
