-- 2026-09-07: Issue Request — BUILD STEP 3b of 5: issuing against a request
--
-- Apply to: ERPDB
-- Requires: 2026-09-07f (step 3a schema)
-- Design:   backend/Docs/DESIGN-issue-request.md §7, §9 answers 2 and 3
--
-- THIS IS THE PATCH THAT CHANGES BEHAVIOUR. Everything before it was additive.
--
-- ⚠ ONCE THIS IS APPLIED, NO ISSUE NOTE CAN BE CONFIRMED WITHOUT AN APPROVED
--   ISSUE REQUEST, because TBL_ISSUE_TYPE.RequiresRequest = 1 for both types
--   (decision 3). The ISR approval policy and its approvers must already be
--   configured, or the store cannot issue anything. To relax it for a type:
--     UPDATE proj.TBL_ISSUE_TYPE SET RequiresRequest = 0 WHERE IssueTypeCode = 'EXC_COSTING';
--
-- One NEW proc:
--   sp_GetRequestLinesForIssue   the "pull from request" picker — open balance only
--
-- Two MODIFIED procs:
--   sp_SetStockIssue        + @RequestId; validates the request is approved and for
--                           the same job, and copies its issue type onto the note
--   sp_SetStockIssueLine    + @RequestLineId, with an early over-issue check
--
-- sp_ConfirmStockIssue is the third and heaviest change and ships in its own file,
-- 2026-09-07h — apply that one immediately after this. Until it is applied, the
-- columns and links here are recorded but nothing is enforced and no quantity is
-- written back to the request.
--
-- sp_CancelStockIssue needs NO change, contrary to §7 of the design: it only ever
-- cancels a DRAFT note, and IssuedQty is written at confirm time, so a cancelled
-- note has never touched the request. A confirmed note is reversed with an Issue
-- Return, not a cancel.
--
-- NOT here: reservations. ReservedQty / QtyReserved / ReservationExpiryDate are
-- step 4, so nothing in this patch reserves or releases stock, and the expiry
-- re-stamp described in §9 answer 4 arrives with them.
--
-- Idempotent — CREATE OR ALTER throughout, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ═══ 1. NEW: the "pull from request" picker ══════════════════════════════
   Open balance only, so a fully-issued line never shows up again. Mirrors
   sp_GetIssueLinesForReturn, which does the same job for IRN. */
CREATE OR ALTER PROCEDURE proj.sp_GetRequestLinesForIssue
    @JobId     NVARCHAR(50) = NULL,
    @RequestId INT          = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        l.RequestLineId,
        l.RequestId,
        r.RequestNo,
        r.RequestDate,
        r.JobId,
        r.IssueTypeId,
        it.IssueTypeCode,
        l.LineNum,
        l.ItemId,
        i.ItemCode,
        i.ItemName,
        l.RequestedQty,
        l.IssuedQty,
        (l.RequestedQty - l.IssuedQty) AS BalanceQty,
        l.UomId,
        u.UomCode AS UomName,
        l.RequiredDate,
        l.LineStatus,
        l.Notes
    FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
    JOIN proj.TBL_STOCK_ISSUE_REQUEST r ON r.RequestId = l.RequestId
    JOIN proj.TBL_ITEM i ON i.ItemId = l.ItemId
    LEFT JOIN proj.TBL_ITEM_UOM   u  ON u.UomId = l.UomId
    LEFT JOIN proj.TBL_ISSUE_TYPE it ON it.IssueTypeId = r.IssueTypeId
    WHERE r.IsActive = 1
      AND l.IsActive = 1
      -- Only an approved request can be issued against; PartiallyIssued is the
      -- same document mid-flight, so it stays in the picker.
      AND r.Status IN ('Approved', 'PartiallyIssued')
      AND (l.RequestedQty - l.IssuedQty) > 0
      AND (@RequestId IS NULL OR r.RequestId = @RequestId)
      AND (@JobId     IS NULL OR r.JobId     = @JobId)
    ORDER BY r.RequestDate, r.RequestNo, l.LineNum;
END;
GO

/* ═══ 2. MODIFIED: sp_SetStockIssue — accept and validate @RequestId ═══════
   Everything outside the request handling is the original proc verbatim. */
CREATE OR ALTER PROCEDURE proj.sp_SetStockIssue
    @IssueId     INT           = 0,
    @IssueDate   DATE          = NULL,
    @JobId       NVARCHAR(50)  = NULL,
    @CostingType NVARCHAR(20)  = 'INC_COSTING',
    @IssuedTo    NVARCHAR(100) = NULL,
    @Notes       NVARCHAR(500) = NULL,
    @RequestId   INT           = NULL,   -- NEW: the approved ISR this note satisfies
    @CreatedBy   NVARCHAR(100) = NULL,
    @ModifiedBy  NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Job lifecycle / budget guards
    IF @JobId IS NOT NULL EXEC proj.sp_AssertJobOpen        @JobId;
    IF @JobId IS NOT NULL EXEC proj.sp_AssertBudgetApproved @JobId, N'ISSUE';

    -- ── Request validation (NEW) ──────────────────────────────────────────
    -- The request is the authority for the issue type: material approved as
    -- INC_COSTING must not be issued out of the job cost, so the note takes its
    -- type from the request rather than letting the storekeeper pick.
    DECLARE @ReqIssueTypeId INT = NULL, @ReqCostingType NVARCHAR(20) = NULL;

    IF @RequestId IS NOT NULL
    BEGIN
        DECLARE @ReqStatus NVARCHAR(20), @ReqJobId NVARCHAR(50);
        SELECT @ReqStatus       = r.Status,
               @ReqJobId        = r.JobId,
               @ReqIssueTypeId  = r.IssueTypeId,
               @ReqCostingType  = it.IssueTypeCode
        FROM proj.TBL_STOCK_ISSUE_REQUEST r
        LEFT JOIN proj.TBL_ISSUE_TYPE it ON it.IssueTypeId = r.IssueTypeId
        WHERE r.RequestId = @RequestId AND r.IsActive = 1;

        IF @ReqStatus IS NULL
        BEGIN RAISERROR('Issue Request not found.', 16, 1); RETURN; END

        IF @ReqStatus NOT IN ('Approved', 'PartiallyIssued')
        BEGIN
            DECLARE @StatusMsg NVARCHAR(300) =
                'Issue Request is ' + @ReqStatus + '. Only an approved request can be issued against.';
            RAISERROR(@StatusMsg, 16, 1); RETURN;
        END

        IF @JobId IS NOT NULL AND @ReqJobId <> @JobId
        BEGIN
            DECLARE @JobMsg NVARCHAR(300) =
                'This request belongs to job ' + @ReqJobId + ', not ' + @JobId + '.';
            RAISERROR(@JobMsg, 16, 1); RETURN;
        END

        -- The note inherits the request's job and issue type.
        SET @JobId       = ISNULL(@JobId, @ReqJobId);
        SET @CostingType = ISNULL(@ReqCostingType, @CostingType);
    END

    IF @IssueId IS NULL OR @IssueId <= 0
    BEGIN
        -- ── INSERT ─────────────────────────────────────────────────────────
        IF NULLIF(@CreatedBy, '') IS NULL THROW 50500, 'CreatedBy is required.',                  1;
        IF NULLIF(@JobId, '')     IS NULL THROW 50501, 'Job is required for a Stock Issue Note.', 1;
        IF NULLIF(@IssuedTo, '')  IS NULL THROW 50502, 'Issued To is required.',                  1;

        DECLARE @IsClosed BIT = 0, @StatusName NVARCHAR(50) = '';
        SELECT @IsClosed = js.IsClosed, @StatusName = js.StatusName
        FROM   proj.TBL_JOB j
        JOIN   proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId
        WHERE  j.JobId = @JobId;

        IF @IsClosed = 1
        BEGIN
            DECLARE @ErrMsg NVARCHAR(200) = 'Job ' + @JobId + ' is ' + @StatusName +
                                            '. Revise the job to create new transactions.';
            THROW 50503, @ErrMsg, 1;
        END

        DECLARE @NumResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @NumResult EXEC proj.sp_GetNextDocNumber 'ISN';
        DECLARE @IssueNo NVARCHAR(50);
        SELECT @IssueNo = DocNumber FROM @NumResult;

        INSERT INTO proj.TBL_STOCK_ISSUE
            (IssueNo, IssueDate, JobId, CostingType, IssueTypeId, RequestId, IssuedTo, Notes, CreatedBy)
        VALUES
            (@IssueNo, ISNULL(@IssueDate, CAST(GETDATE() AS DATE)),
             @JobId, @CostingType,
             ISNULL(@ReqIssueTypeId, (SELECT TOP 1 IssueTypeId FROM proj.TBL_ISSUE_TYPE WHERE IssueTypeCode = @CostingType)),
             @RequestId, @IssuedTo, @Notes, @CreatedBy);

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS NewId, @IssueNo AS IssueNo;
    END
    ELSE
    BEGIN
        -- ── UPDATE ─────────────────────────────────────────────────────────
        IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE WHERE IssueId = @IssueId AND Status = 'Confirmed')
            THROW 50510, 'Cannot edit a confirmed Issue Note.', 1;

        IF NULLIF(@JobId, '')    IS NULL THROW 50511, 'Job is required for a Stock Issue Note.', 1;
        IF NULLIF(@IssuedTo, '') IS NULL THROW 50512, 'Issued To is required.',                  1;

        -- Changing the request once lines are pulled from it would orphan them.
        IF EXISTS (
            SELECT 1 FROM proj.TBL_STOCK_ISSUE si
            WHERE si.IssueId = @IssueId
              AND ISNULL(si.RequestId, -1) <> ISNULL(@RequestId, -1)
              AND EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_LINE l
                          WHERE l.IssueId = @IssueId AND l.RequestLineId IS NOT NULL AND l.IsActive = 1))
        BEGIN RAISERROR('Remove the lines pulled from the current request before changing it.', 16, 1); RETURN; END

        UPDATE proj.TBL_STOCK_ISSUE
        SET IssueDate    = ISNULL(@IssueDate, IssueDate),
            JobId        = @JobId,
            CostingType  = @CostingType,
            IssueTypeId  = ISNULL(@ReqIssueTypeId, IssueTypeId),
            RequestId    = @RequestId,
            IssuedTo     = @IssuedTo,
            Notes        = @Notes,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE IssueId = @IssueId AND IsActive = 1;

        SELECT CAST(@IssueId AS INT) AS NewId, IssueNo
        FROM proj.TBL_STOCK_ISSUE WHERE IssueId = @IssueId;
    END
END;
GO

/* ═══ 3. MODIFIED: sp_SetStockIssueLine — carry the request line ═══════════
   The over-issue check here is for early feedback only; sp_ConfirmStockIssue
   is what actually enforces it, because that is the point of no return. */
CREATE OR ALTER PROCEDURE proj.sp_SetStockIssueLine
    @IssueLineId   INT           = 0,
    @IssueId       INT,
    @LineNum       INT           = 0,
    @ItemId        INT,
    @ItemDesc      NVARCHAR(300) = NULL,
    @Qty           DECIMAL(18,4) = 0,
    @UomId         INT           = NULL,
    @UnitCost      DECIMAL(18,4) = 0,
    @Notes         NVARCHAR(200) = NULL,
    @RequestLineId INT           = NULL,   -- NEW: the ISR line this satisfies
    @CreatedBy     NVARCHAR(100) = NULL,
    @ModifiedBy    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- Parent-issue lookup so we can fire the same guards as the header SP.
    DECLARE @ParentJobId NVARCHAR(50) = (SELECT JobId FROM proj.TBL_STOCK_ISSUE WHERE IssueId = @IssueId);
    IF @ParentJobId IS NOT NULL EXEC proj.sp_AssertJobOpen @ParentJobId;
    IF @ParentJobId IS NOT NULL EXEC proj.sp_AssertBudgetApproved @ParentJobId, N'ISSUE';

    -- ── Parent status guard ───────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE WHERE IssueId = @IssueId AND Status = 'Confirmed') BEGIN RAISERROR('Cannot edit lines of a confirmed Issue Note.', 16, 1); RETURN; END

    -- ── Mandatory field validation ────────────────────────────────────────
    IF NULLIF(@IssueId, 0) IS NULL BEGIN RAISERROR('IssueId is required.',                           16, 1); RETURN; END
    IF NULLIF(@ItemId,  0) IS NULL BEGIN RAISERROR('Item is required.',                               16, 1); RETURN; END
    IF ISNULL(@Qty, 0)    <= 0     BEGIN RAISERROR('Issue quantity must be greater than zero.',       16, 1); RETURN; END

    -- ── Request line validation (NEW) ─────────────────────────────────────
    IF @RequestLineId IS NOT NULL
    BEGIN
        DECLARE @RlRequestId INT, @RlItemId INT, @RlUomId INT,
                @RlBalance DECIMAL(18,4), @NoteRequestId INT;

        SELECT @RlRequestId = l.RequestId,
               @RlItemId    = l.ItemId,
               @RlUomId     = l.UomId,
               @RlBalance   = l.RequestedQty - l.IssuedQty
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
        WHERE l.RequestLineId = @RequestLineId AND l.IsActive = 1;

        IF @RlRequestId IS NULL
        BEGIN RAISERROR('Request line not found.', 16, 1); RETURN; END

        SELECT @NoteRequestId = RequestId FROM proj.TBL_STOCK_ISSUE WHERE IssueId = @IssueId;

        IF ISNULL(@NoteRequestId, -1) <> @RlRequestId
        BEGIN RAISERROR('That request line belongs to a different Issue Request than this note.', 16, 1); RETURN; END

        IF @RlItemId <> @ItemId
        BEGIN RAISERROR('The item does not match the request line.', 16, 1); RETURN; END

        -- Mixing units would corrupt IssuedQty, which is kept in the request
        -- line's own unit. The picker copies the UOM across, so this should only
        -- ever fire if someone edits it by hand.
        IF ISNULL(@UomId, 0) <> ISNULL(@RlUomId, 0)
        BEGIN RAISERROR('The UOM must match the request line it is issued against.', 16, 1); RETURN; END

        -- How much of this request line is already spoken for on OTHER notes that
        -- have not been confirmed yet.
        --
        -- Only DRAFT notes count. A confirmed note's quantity is already inside
        -- rl.IssuedQty (sp_ConfirmStockIssue writes it back), so counting it here
        -- as well would subtract it twice: after issuing 4 of 10, the next note
        -- was told only 2 remained instead of 6.
        DECLARE @OnOtherDrafts DECIMAL(18,4) =
            ISNULL((SELECT SUM(l2.Qty)
                    FROM proj.TBL_STOCK_ISSUE_LINE l2
                    JOIN proj.TBL_STOCK_ISSUE si2 ON si2.IssueId = l2.IssueId
                    WHERE l2.RequestLineId = @RequestLineId
                      AND l2.IsActive = 1
                      AND si2.IsActive = 1
                      AND si2.Status = 'Draft'
                      AND l2.IssueLineId <> ISNULL(@IssueLineId, 0)), 0);

        IF (@Qty + @OnOtherDrafts) > @RlBalance
        BEGIN
            DECLARE @OverMsg NVARCHAR(400) =
                'Cannot issue ' + CAST(@Qty AS NVARCHAR(30)) + ' - only ' +
                CAST(@RlBalance - @OnOtherDrafts AS NVARCHAR(30)) +
                ' remains on that request line. Edit the request or raise a new one.';
            RAISERROR(@OverMsg, 16, 1); RETURN;
        END
    END

    IF @IssueLineId IS NULL OR @IssueLineId = 0
    BEGIN
        IF NULLIF(@CreatedBy, '') IS NULL BEGIN RAISERROR('CreatedBy is required.', 16, 1); RETURN; END

        IF @LineNum = 0
            SELECT @LineNum = ISNULL(MAX(LineNum),0)+1
            FROM proj.TBL_STOCK_ISSUE_LINE WHERE IssueId=@IssueId AND IsActive=1;

        INSERT INTO proj.TBL_STOCK_ISSUE_LINE
            (IssueId, LineNum, ItemId, ItemDesc, Qty, UomId, UnitCost, Notes, RequestLineId, CreatedBy)
        VALUES
            (@IssueId, @LineNum, @ItemId, @ItemDesc, @Qty, NULLIF(@UomId,0), @UnitCost, @Notes, @RequestLineId, @CreatedBy);

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS IssueLineId;
    END
    ELSE
    BEGIN
        UPDATE proj.TBL_STOCK_ISSUE_LINE
        SET ItemId        = @ItemId,
            ItemDesc      = @ItemDesc,
            Qty           = @Qty,
            UomId         = NULLIF(@UomId,0),
            UnitCost      = @UnitCost,
            Notes         = @Notes,
            RequestLineId = @RequestLineId,
            ModifiedBy    = @ModifiedBy,
            ModifiedDate  = GETDATE()
        WHERE IssueLineId = @IssueLineId AND IsActive = 1;

        SELECT @IssueLineId AS IssueLineId;
    END
END;
GO
