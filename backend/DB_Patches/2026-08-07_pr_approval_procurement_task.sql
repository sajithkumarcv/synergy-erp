/* ============================================================================
   Patch: PR approved -> auto-create "create PO" task for the Procurement
   user group, auto-closed when a PO is raised against that PR.
   Also switches PR-approval email recipients from the PROCUREMENT OFFICER
   role to the "Procurement" user group, so email + task reach the same
   people.

   Session: 2026-08-07, WebErp-Synergy / SYNERP.
   Applied to: SYNERP (dev) directly via the synerp MCP connector and
   smoke-tested inside a rolled-back transaction against real PR-26-0007
   (3 tasks created for the 3 Procurement-group members, then all 3 closed).
   Manually ran sp_CreateProcurementPOTasks once for PR-26-0009 in dev after
   discovering the dev backend hadn't been rebuilt yet (see notes at bottom).

   Idempotent: every ALTER TABLE / ALTER-or-CREATE PROCEDURE step below is
   guarded, so this script is safe to run more than once.

   Requires code deploy alongside this script (SQL alone is not enough):
     - backend/Controllers/Approval/ApprovalController.cs
         (new CreateProcurementPOTask(prId) call, wired next to the existing
         NotifyProcurementOnPRApproval(prId) call)
     - backend/Models/Mom/MomTask.cs
         (MomId int -> int?; added RefModuleCode/RefDocumentId/RefDocumentNo)
     - frontend/src/common/NotificationBell.js
         (task click navigates to the referenced PR when refModuleCode='PR';
         uses the task's own module icon instead of always the MOM pin)
   Rebuild + restart the API after deploying — ASP.NET Core does not
   hot-reload controller/model changes.
   ============================================================================ */

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ── 1. Schema: TBL_MOM_TASK ─────────────────────────────────────────────
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('proj.TBL_MOM_TASK') AND name = 'MomId' AND is_nullable = 0
)
BEGIN
    ALTER TABLE proj.TBL_MOM_TASK ALTER COLUMN MomId INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('proj.TBL_MOM_TASK') AND name = 'RefModuleCode')
BEGIN
    ALTER TABLE proj.TBL_MOM_TASK ADD RefModuleCode NVARCHAR(10) NULL, RefDocumentId INT NULL, RefDocumentNo NVARCHAR(50) NULL;
END
GO

-- ── 2. sp_GetMOMTaskList — LEFT JOIN (was INNER, silently dropped any
--       null-MomId row) + expose the 3 new Ref columns + optional filters ──
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_GetMOMTaskList
    @MomId          INT           = NULL,
    @JobId          VARCHAR(30)   = NULL,
    @AssignedTo     NVARCHAR(100) = NULL,
    @Status         NVARCHAR(20)  = NULL,
    @RefModuleCode  NVARCHAR(10)  = NULL,
    @RefDocumentId  INT           = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        t.MomTaskId, t.MomId, t.JobId,
        m.Title      AS MomTitle,
        m.MeetingDate,
        t.Description, t.DueDate, t.Priority,
        t.AssignedTo, t.Status, t.Remarks,
        t.RefModuleCode, t.RefDocumentId, t.RefDocumentNo,
        t.CreatedBy, t.CreatedDate, t.ModifiedBy, t.ModifiedDate
    FROM PROJ.TBL_MOM_TASK t
    LEFT JOIN PROJ.TBL_MOM m ON m.MomId = t.MomId
    WHERE t.IsActive = 1
      AND (@MomId         IS NULL OR t.MomId         = @MomId)
      AND (@JobId         IS NULL OR t.JobId         = @JobId)
      AND (@AssignedTo    IS NULL OR t.AssignedTo    = @AssignedTo)
      AND (@Status        IS NULL OR t.Status        = @Status)
      AND (@RefModuleCode IS NULL OR t.RefModuleCode = @RefModuleCode)
      AND (@RefDocumentId IS NULL OR t.RefDocumentId = @RefDocumentId)
    ORDER BY
        CASE t.Priority
            WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4
        END,
        t.DueDate ASC, t.MomTaskId ASC;
END
GO

-- ── 3. sp_SetMOMTask — accepts the 3 new Ref columns (optional; manual
--       MOM-task creation is unaffected, still passes a real MomId) ────────
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_SetMOMTask
    @MomTaskId      INT,
    @MomId          INT           = NULL,
    @JobId          VARCHAR(30),
    @Description    NVARCHAR(MAX),
    @DueDate        DATE          = NULL,
    @Priority       NVARCHAR(20)  = 'Medium',
    @AssignedTo     NVARCHAR(100),
    @Remarks        NVARCHAR(MAX) = NULL,
    @CreatedBy      NVARCHAR(100),
    @ModifiedBy     NVARCHAR(100) = NULL,
    @RefModuleCode  NVARCHAR(10)  = NULL,
    @RefDocumentId  INT           = NULL,
    @RefDocumentNo  NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @MomTaskId = 0
    BEGIN
        BEGIN TRY
            BEGIN TRANSACTION;

            INSERT INTO PROJ.TBL_MOM_TASK
                (MomId, JobId, Description, DueDate, Priority, AssignedTo, Status, Remarks,
                 RefModuleCode, RefDocumentId, RefDocumentNo, IsActive, CreatedBy, CreatedDate)
            VALUES
                (@MomId, @JobId, @Description, @DueDate, @Priority, @AssignedTo, 'Open', @Remarks,
                 @RefModuleCode, @RefDocumentId, @RefDocumentNo, 1, @CreatedBy, GETDATE());

            SET @MomTaskId = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO PROJ.TBL_MOM_TASK_LOG (MomTaskId, Action, ToUser, NewStatus, Remarks, ActionBy, ActionDate)
            VALUES (@MomTaskId, 'Assigned', @AssignedTo, 'Open', 'Task created', @CreatedBy, GETDATE());

            COMMIT;
            SELECT CAST(@MomTaskId AS NVARCHAR(20));
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK;
            THROW;
        END CATCH
    END
    ELSE
    BEGIN
        UPDATE PROJ.TBL_MOM_TASK
        SET Description  = @Description,
            DueDate      = @DueDate,
            Priority     = @Priority,
            AssignedTo   = @AssignedTo,
            Remarks      = @Remarks,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE MomTaskId = @MomTaskId;
        SELECT CAST(@MomTaskId AS NVARCHAR(20));
    END
END
GO

-- ── 4. sp_CreateProcurementPOTasks (new) — one task per active member of
--       the "Procurement" user group; idempotent per-PR; no-ops if the PR
--       has no open lines left ──────────────────────────────────────────
IF OBJECT_ID('PROJ.sp_CreateProcurementPOTasks') IS NULL
    EXEC('CREATE PROCEDURE PROJ.sp_CreateProcurementPOTasks AS BEGIN SET NOCOUNT ON; END');
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_CreateProcurementPOTasks
    @PrId       INT,
    @CreatedBy  NVARCHAR(100) = 'System'
AS
BEGIN
    SET NOCOUNT ON;

    -- Idempotency: a PR approval hook could fire more than once (retry, double
    -- click, etc.) — never stack duplicate open tasks for the same PR.
    IF EXISTS (
        SELECT 1 FROM PROJ.TBL_MOM_TASK
        WHERE RefModuleCode = 'PR' AND RefDocumentId = @PrId
          AND Status IN ('Open','InProgress','Reassigned') AND IsActive = 1)
    BEGIN
        SELECT 'ALREADY_OPEN' AS Result;
        RETURN;
    END

    DECLARE @PrNumber NVARCHAR(50), @JobId NVARCHAR(50), @Priority NVARCHAR(20);
    DECLARE @OpenLines INT, @OpenValue DECIMAL(18,4);

    SELECT
        @PrNumber  = pr.PrNumber,
        @JobId     = pr.JobId,
        @Priority  = pr.Priority,
        @OpenLines = COUNT(CASE WHEN prl.RequiredQty - ISNULL(prl.PoCreatedQty,0) > 0
                                 AND prl.LineStatus NOT IN ('Closed','Cancelled') THEN 1 END),
        @OpenValue = SUM(CASE WHEN prl.RequiredQty - ISNULL(prl.PoCreatedQty,0) > 0
                               AND prl.LineStatus NOT IN ('Closed','Cancelled')
                               THEN (prl.RequiredQty - ISNULL(prl.PoCreatedQty,0)) * ISNULL(prl.EstUnitPrice,0) ELSE 0 END)
    FROM PROJ.TBL_PURCHASE_REQUEST pr
    JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrId = pr.PrId AND prl.IsActive = 1
    WHERE pr.PrId = @PrId AND pr.IsActive = 1
    GROUP BY pr.PrNumber, pr.JobId, pr.Priority;

    -- Nothing left to order (fully consumed by an earlier PO already) — no task needed.
    IF @PrNumber IS NULL OR ISNULL(@OpenLines, 0) = 0
    BEGIN
        SELECT 'NOTHING_OPEN' AS Result;
        RETURN;
    END

    DECLARE @TaskPriority NVARCHAR(20) = CASE @Priority WHEN 'Urgent' THEN 'Critical' WHEN 'High' THEN 'High' ELSE 'Medium' END;
    DECLARE @Description NVARCHAR(MAX) = N'Create PO for approved PR ' + @PrNumber
        + N' — ' + CAST(@OpenLines AS NVARCHAR(10)) + N' open line' + CASE WHEN @OpenLines = 1 THEN N'' ELSE N's' END
        + N', value ' + CAST(ROUND(ISNULL(@OpenValue,0), 0) AS NVARCHAR(30));

    DECLARE @Assignees TABLE (UserName NVARCHAR(100));
    INSERT INTO @Assignees (UserName)
    SELECT DISTINCT u.UserName
    FROM PROJ.TBL_USER_GROUP g
    JOIN PROJ.TBL_USER_GROUP_DETAIL d ON d.GroupId = g.GroupId AND d.IsActive = 1
    JOIN PROJ.TBL_USERS u ON u.UserId = d.UserId AND u.IsActive = 1
    WHERE g.GroupName = 'Procurement' AND g.IsActive = 1;

    DECLARE @Inserted TABLE (MomTaskId INT, AssignedTo NVARCHAR(100));

    INSERT INTO PROJ.TBL_MOM_TASK
        (MomId, JobId, Description, DueDate, Priority, AssignedTo, Status, Remarks,
         RefModuleCode, RefDocumentId, RefDocumentNo, IsActive, CreatedBy, CreatedDate)
    OUTPUT inserted.MomTaskId, inserted.AssignedTo INTO @Inserted (MomTaskId, AssignedTo)
    SELECT
        NULL, @JobId, @Description, NULL, @TaskPriority, a.UserName, 'Open', NULL,
        'PR', @PrId, @PrNumber, 1, @CreatedBy, GETDATE()
    FROM @Assignees a;

    INSERT INTO PROJ.TBL_MOM_TASK_LOG (MomTaskId, Action, ToUser, NewStatus, Remarks, ActionBy, ActionDate)
    SELECT MomTaskId, 'Assigned', AssignedTo, 'Open', 'Auto-created on PR approval', @CreatedBy, GETDATE()
    FROM @Inserted;

    SELECT 'CREATED' AS Result, COUNT(*) AS TaskCount FROM @Inserted;
END
GO

-- ── 5. sp_CloseProcurementPOTasks (new) — flips any open task for a PR to
--       Closed the moment a PO line is raised against it. This is a system
--       transition, so it bypasses sp_SetMOMTaskStatus's human-action guard
--       on purpose and logs Action='AutoClosed' ─────────────────────────
IF OBJECT_ID('PROJ.sp_CloseProcurementPOTasks') IS NULL
    EXEC('CREATE PROCEDURE PROJ.sp_CloseProcurementPOTasks AS BEGIN SET NOCOUNT ON; END');
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_CloseProcurementPOTasks
    @PrId      INT,
    @ClosedBy  NVARCHAR(100) = 'System'
AS
BEGIN
    SET NOCOUNT ON;
    IF @PrId IS NULL RETURN;

    DECLARE @Closed TABLE (MomTaskId INT, OldStatus NVARCHAR(20));

    UPDATE PROJ.TBL_MOM_TASK
    SET Status       = 'Closed',
        ModifiedBy   = @ClosedBy,
        ModifiedDate = GETDATE()
    OUTPUT inserted.MomTaskId, deleted.Status INTO @Closed (MomTaskId, OldStatus)
    WHERE RefModuleCode = 'PR' AND RefDocumentId = @PrId
      AND Status IN ('Open','InProgress','Reassigned') AND IsActive = 1;

    INSERT INTO PROJ.TBL_MOM_TASK_LOG (MomTaskId, Action, OldStatus, NewStatus, Remarks, ActionBy, ActionDate)
    SELECT MomTaskId, 'AutoClosed', OldStatus, 'Closed', 'PO created from this PR', @ClosedBy, GETDATE()
    FROM @Closed;
END
GO

-- ── 6. sp_SetPOLine — call sp_CloseProcurementPOTasks right after each of
--       the two existing sp_RecalcPrStatus calls (insert path + update
--       path), so the task auto-closes the moment ANY PO line (even
--       partial) is raised against that PR, from any caller ───────────────
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_SetPOLine
    @PoLineId    INT           = 0,
    @PoId        INT,
    @PrLineId    INT           = NULL,
    @ItemId      INT           = NULL,
    @ItemCode    NVARCHAR(50)  = NULL,
    @ItemDesc    NVARCHAR(300) = NULL,
    @OrderedQty  DECIMAL(18,4) = 1,
    @UomId       INT           = NULL,
    @UomName     NVARCHAR(50)  = NULL,
    @UnitPrice   DECIMAL(18,4) = 0,
    @TaxPct      DECIMAL(5,2)  = 0,
    @Remarks     NVARCHAR(300) = NULL,
    @CreatedBy   NVARCHAR(100) = NULL,
    @ModifiedBy  NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ParentJobId NVARCHAR(50) = (SELECT JobId FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoId);
    IF @ParentJobId IS NOT NULL EXEC proj.sp_AssertJobOpen @ParentJobId;
    IF @ParentJobId IS NOT NULL EXEC proj.sp_AssertBudgetApproved @ParentJobId, N'PO';

    IF NULLIF(@PoId, 0) IS NULL
    BEGIN RAISERROR('PoId is required.', 16, 1); RETURN; END
    IF ISNULL(@OrderedQty, 0) <= 0
    BEGIN RAISERROR('Ordered quantity must be greater than zero.', 16, 1); RETURN; END
    IF ISNULL(@UnitPrice, 0) < 0
    BEGIN RAISERROR('Unit price cannot be negative.', 16, 1); RETURN; END

    DECLARE @PoStatus NVARCHAR(30);
    SELECT @PoStatus = Status FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId AND IsActive = 1;
    IF @PoStatus IS NULL BEGIN RAISERROR('Purchase Order not found or is inactive.', 16, 1); RETURN; END
    IF @PoStatus <> 'Draft'
    BEGIN
        DECLARE @PsMsg NVARCHAR(200) = 'PO lines can only be added or edited when the PO is in Draft status. Current status: ' + @PoStatus;
        RAISERROR(@PsMsg, 16, 1); RETURN;
    END

    IF @PoLineId IS NULL OR @PoLineId <= 0
    BEGIN
        IF NULLIF(@CreatedBy, '') IS NULL
        BEGIN RAISERROR('CreatedBy is required.', 16, 1); RETURN; END
        IF NULLIF(@ItemCode, '') IS NULL
        BEGIN RAISERROR('Item Code is required.', 16, 1); RETURN; END
        IF NULLIF(@UomId, 0) IS NULL
        BEGIN RAISERROR('Unit of Measure is required.', 16, 1); RETURN; END
    END

    IF @PrLineId IS NOT NULL AND @PrLineId > 0
    BEGIN
        DECLARE @PrRequiredQty  DECIMAL(18,4) = 0;
        DECLARE @PrPoCreatedQty DECIMAL(18,4) = 0;
        DECLARE @OldPoQty       DECIMAL(18,4) = 0;

        SELECT @PrRequiredQty  = ISNULL(RequiredQty,  0),
               @PrPoCreatedQty = ISNULL(PoCreatedQty, 0)
        FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId;

        IF @PoLineId IS NOT NULL AND @PoLineId > 0
            SELECT @OldPoQty = ISNULL(OrderedQty, 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE
            WHERE PoLineId = @PoLineId AND PrLineId = @PrLineId;

        DECLARE @PrBalance DECIMAL(18,4) = @PrRequiredQty - (@PrPoCreatedQty - @OldPoQty);
        DECLARE @ErrMsg    NVARCHAR(300);
        IF @OrderedQty > @PrBalance
        BEGIN
            SET @ErrMsg = 'PO quantity (' + CAST(@OrderedQty AS NVARCHAR(30))
                        + ') exceeds PR balance (' + CAST(@PrBalance AS NVARCHAR(30)) + ').';
            RAISERROR(@ErrMsg, 16, 1); RETURN;
        END
    END

    DECLARE @LineJobId      NVARCHAR(50);
    DECLARE @LineCategoryId INT;
    SELECT @LineJobId = JobId, @LineCategoryId = ExpenseCategoryId
    FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId AND IsActive = 1;

    DECLARE @LineJobCosting BIT = 1, @IsBudgetHeaderLinked BIT = 0;
    IF @LineJobId IS NOT NULL
        SELECT @LineJobCosting      = ISNULL(jt.IsCostingRequired, 1),
               @IsBudgetHeaderLinked = ISNULL(jt.IsBudgetHeaderLinked, 0)
        FROM PROJ.TBL_JOB j JOIN PROJ.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
        WHERE j.JobId = @LineJobId;

    IF @LineJobId IS NOT NULL AND @LineCategoryId IS NOT NULL AND @LineJobCosting = 1
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM PROJ.TBL_JOB_BUDGET
            WHERE JobId = @LineJobId AND CostCategoryId = @LineCategoryId AND IsCurrent = 1)
        BEGIN
            DECLARE @NoBudgetMsg NVARCHAR(400) = 'No approved budget line exists for the selected expense category on this job. Please create a budget line before adding PO lines.';
            RAISERROR(@NoBudgetMsg, 16, 1); RETURN;
        END
    END

    IF @PoLineId IS NULL OR @PoLineId <= 0
    BEGIN
        DECLARE @LineNum INT;
        SELECT @LineNum = ISNULL(MAX(LineNum), 0) + 1
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1;

        INSERT INTO PROJ.TBL_PURCHASE_ORDER_LINE
            (PoId, LineNum, PrLineId, ItemId, ItemCode, ItemDesc,
             OrderedQty, UomId, UomName, UnitPrice, TaxPct, Remarks, CreatedBy)
        VALUES
            (@PoId, @LineNum, NULLIF(@PrLineId, 0), NULLIF(@ItemId, 0),
             @ItemCode, @ItemDesc, @OrderedQty, @UomId, @UomName,
             ISNULL(@UnitPrice, 0), ISNULL(@TaxPct, 0), @Remarks, @CreatedBy);

        IF @PrLineId IS NOT NULL AND @PrLineId > 0
        BEGIN
            DECLARE @BomDetailId_I INT;
            SELECT @BomDetailId_I = BomDetailId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId;

            UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
            SET PoCreatedQty = ISNULL(PoCreatedQty, 0) + @OrderedQty
            WHERE PrLineId = @PrLineId;

            EXEC PROJ.sp_RecalcPrStatus @PrLineId, @CreatedBy;

            -- The PR now has a PO line against it — the procurement team's
            -- "create PO" task for this PR is done, whether or not the PR is
            -- fully consumed yet (a partial PO still counts as acted-on).
            DECLARE @ClosePrId_I INT = (SELECT PrId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId);
            IF @ClosePrId_I IS NOT NULL
                EXEC PROJ.sp_CloseProcurementPOTasks @PrId = @ClosePrId_I, @ClosedBy = @CreatedBy;

            IF @BomDetailId_I IS NOT NULL
                UPDATE PROJ.TBL_BOM_DETAILS
                SET PoCreatedQty = ISNULL(PoCreatedQty, 0) + @OrderedQty,
                    BomStatus    = CASE
                        WHEN BomReceivedQty >= BomRequestedQty                                 THEN 'FullyReceived'
                        WHEN BomReceivedQty  > 0                                               THEN 'PartialReceived'
                        WHEN (ISNULL(PoCreatedQty,0) + @OrderedQty) >= BomRequestedQty        THEN 'PORaised'
                        WHEN (ISNULL(PoCreatedQty,0) + @OrderedQty)  > 0                      THEN 'POPartial'
                        WHEN PrCreatedQty >= BomRequestedQty                                   THEN 'PRRaised'
                        WHEN PrCreatedQty  > 0                                                 THEN 'PRPartial'
                        ELSE 'Pending'
                    END
                WHERE BomId = @BomDetailId_I;
        END

        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        DECLARE @OldOrderedQty DECIMAL(18,4) = 0;
        DECLARE @OldPrLineId   INT           = NULL;

        SELECT @OldOrderedQty = OrderedQty, @OldPrLineId = PrLineId
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @PoLineId;

        UPDATE PROJ.TBL_PURCHASE_ORDER_LINE
        SET OrderedQty   = @OrderedQty,
            UomId        = NULLIF(@UomId, 0),
            UomName      = @UomName,
            UnitPrice    = ISNULL(@UnitPrice, 0),
            TaxPct       = ISNULL(@TaxPct, 0),
            Remarks      = @Remarks,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE PoLineId = @PoLineId;

        IF @OldPrLineId IS NOT NULL AND @OldPrLineId > 0
        BEGIN
            DECLARE @BomDetailId_U INT;
            SELECT @BomDetailId_U = BomDetailId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @OldPrLineId;

            UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
            SET PoCreatedQty = ISNULL(PoCreatedQty, 0) - @OldOrderedQty + @OrderedQty
            WHERE PrLineId = @OldPrLineId;

            EXEC PROJ.sp_RecalcPrStatus @OldPrLineId, @ModifiedBy;

            DECLARE @ClosePrId_U INT = (SELECT PrId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @OldPrLineId);
            IF @ClosePrId_U IS NOT NULL
                EXEC PROJ.sp_CloseProcurementPOTasks @PrId = @ClosePrId_U, @ClosedBy = @ModifiedBy;

            IF @BomDetailId_U IS NOT NULL
                UPDATE PROJ.TBL_BOM_DETAILS
                SET PoCreatedQty = ISNULL(PoCreatedQty, 0) - @OldOrderedQty + @OrderedQty,
                    BomStatus    = CASE
                        WHEN BomReceivedQty >= BomRequestedQty                                                   THEN 'FullyReceived'
                        WHEN BomReceivedQty  > 0                                                                 THEN 'PartialReceived'
                        WHEN (ISNULL(PoCreatedQty,0) - @OldOrderedQty + @OrderedQty) >= BomRequestedQty         THEN 'PORaised'
                        WHEN (ISNULL(PoCreatedQty,0) - @OldOrderedQty + @OrderedQty)  > 0                       THEN 'POPartial'
                        WHEN PrCreatedQty >= BomRequestedQty                                                     THEN 'PRRaised'
                        WHEN PrCreatedQty  > 0                                                                   THEN 'PRPartial'
                        ELSE 'Pending'
                    END
                WHERE BomId = @BomDetailId_U;
        END

        SELECT CAST(@PoLineId AS NVARCHAR(20));
    END

    -- Recompute header TotalAmount from the actual lines every time a line
    -- is saved: line subtotal, less header Discount%, plus each line's own
    -- TaxPct-based tax, plus the header's manually-entered TaxAmount. The
    -- header TaxAmount is READ here but never written — it's a value the
    -- user types directly on the PO Overview tab and must never be
    -- silently overwritten (a previous version of this recompute wrongly
    -- replaced it with the line-based tax total on every save).
    DECLARE @LinesSubtotal DECIMAL(18,4) = (
        SELECT ISNULL(SUM(OrderedQty * UnitPrice), 0)
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1
    );
    DECLARE @LinesTax DECIMAL(18,4) = (
        SELECT ISNULL(SUM(OrderedQty * UnitPrice * TaxPct / 100.0), 0)
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1
    );
    DECLARE @HeaderDiscountPct DECIMAL(18,4) = (
        SELECT ISNULL(Discount, 0) FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId
    );
    DECLARE @HeaderTaxAmount DECIMAL(18,4) = (
        SELECT ISNULL(TaxAmount, 0) FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId
    );

    UPDATE PROJ.TBL_PURCHASE_ORDER
    SET TotalAmount = @LinesSubtotal - (@LinesSubtotal * @HeaderDiscountPct / 100.0) + @LinesTax + @HeaderTaxAmount
    WHERE PoId = @PoId;
END
GO

-- ── 7. sp_GetPRApprovalNotify — recipients: "Procurement" user group
--       instead of the PROCUREMENT OFFICER role (user's explicit direction:
--       "usergroup: Procurement... need to notify all in the group") ──────
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE proj.sp_GetPRApprovalNotify
    @PrId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Result 1: PR summary for the email body
    SELECT
        pr.PrId, pr.PrNumber, pr.JobId, j.ProjectName, pr.RequestedBy, pr.Priority,
        COUNT(CASE WHEN prl.RequiredQty - ISNULL(prl.PoCreatedQty,0) > 0
                   AND prl.LineStatus NOT IN ('Closed','Cancelled') THEN 1 END) AS OpenLines,
        SUM(CASE WHEN prl.RequiredQty - ISNULL(prl.PoCreatedQty,0) > 0
                 AND prl.LineStatus NOT IN ('Closed','Cancelled')
                 THEN (prl.RequiredQty - ISNULL(prl.PoCreatedQty,0)) * ISNULL(prl.EstUnitPrice,0) ELSE 0 END) AS OpenValue
    FROM proj.TBL_PURCHASE_REQUEST pr
    JOIN proj.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrId = pr.PrId AND prl.IsActive = 1
    LEFT JOIN proj.TBL_JOB j ON j.JobId = pr.JobId
    WHERE pr.PrId = @PrId AND pr.IsActive = 1
    GROUP BY pr.PrId, pr.PrNumber, pr.JobId, j.ProjectName, pr.RequestedBy, pr.Priority;

    -- Result 2: procurement recipients — the "Procurement" user group (same
    -- audience the auto-created "create PO" task is assigned to; previously
    -- this queried the PROCUREMENT OFFICER role, which could disagree with
    -- who the task actually notifies).
    SELECT DISTINCT u.Email, u.FullName
    FROM proj.TBL_USER_GROUP g
    JOIN proj.TBL_USER_GROUP_DETAIL d ON d.GroupId = g.GroupId AND d.IsActive = 1
    JOIN proj.TBL_USERS u ON u.UserId = d.UserId
    WHERE g.GroupName = 'Procurement' AND g.IsActive = 1
      AND u.IsActive = 1
      AND NULLIF(LTRIM(RTRIM(u.Email)), '') IS NOT NULL;
END
GO

-- ── Post-check ───────────────────────────────────────────────────────────
SELECT o.name, m.uses_quoted_identifier, m.uses_ansi_nulls
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_GetMOMTaskList','sp_SetMOMTask','sp_CreateProcurementPOTasks',
                 'sp_CloseProcurementPOTasks','sp_SetPOLine','sp_GetPRApprovalNotify');
GO
