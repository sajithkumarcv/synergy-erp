-- ============================================================================
-- Budget line commitment guard — stop committed items being swapped or deleted
-- Re-runnable: safe to execute on every client database.
--
-- Objects:
--   proj.fn_JobItemCommitted    new inline TVF: PR / PO / GRN qty for a job+item
--   proj.sp_SetJobBudgetItem    blocks changing the ITEM on a committed line
--   proj.sp_DeleteJobBudgetItem blocks deleting a committed line
--
-- THE BUG
-- -------
-- A budget line whose item already had an approved PO could be edited to point
-- at a DIFFERENT item, and the revision would approve cleanly. The PO was left
-- orphaned: it still referenced the old item, which the budget no longer held.
--
-- The only commitment check lived in sp_SetJobBudgetItem and had two holes:
--   1. It ran only when the quantity DECREASED (`IF @Qty < @OldQtyCheck`).
--      Swapping the item while keeping the quantity skipped it entirely.
--   2. Even when it ran, it summed PR/PO/GRN for @ItemId — the NEW item — so a
--      swap always measured zero commitments and passed.
-- sp_DeleteJobBudgetItem had no commitment check at all.
--
-- THE RULE
-- --------
-- Once a budget line's item has any live PR / PO / GRN against the job, that
-- line's item may not be changed and the line may not be deleted. Quantity may
-- still be raised, and may be lowered no further than the committed floor (the
-- pre-existing rule, unchanged). To change the item, cancel the PR/PO first —
-- 'Rejected' and 'Cancelled' documents are excluded from the count, so doing so
-- releases the line by itself. Otherwise, add the new item as its own line.
--
-- The swap/delete guard is deliberately NOT gated on JobType.IsCostingRequired:
-- an approved PO is real whether or not the job tracks cost. Jobs that never
-- raise PR/PO simply have nothing to count, so the guard never fires for them.
-- ============================================================================

-- ── 0. Quantity → display string, without trailing zeros (13.0000 -> '13') ─
IF OBJECT_ID(N'proj.fn_TrimQty') IS NOT NULL DROP FUNCTION proj.fn_TrimQty;
GO

CREATE FUNCTION proj.fn_TrimQty (@Qty DECIMAL(18,4))
RETURNS NVARCHAR(30)
AS
BEGIN
    -- '13.0000' reads as noise in a one-line error; '13' and '13.5' both work.
    RETURN CASE
        WHEN @Qty IS NULL THEN '0'
        WHEN @Qty = ROUND(@Qty, 0) THEN CAST(CAST(@Qty AS BIGINT) AS NVARCHAR(30))
        ELSE CAST(CAST(@Qty AS DECIMAL(18,2)) AS NVARCHAR(30))
    END;
END;
GO

-- ── 1. Committed quantity for a job + item ─────────────────────────────────
-- Filters mirror the original inline queries in sp_SetJobBudgetItem exactly,
-- so the existing "cannot reduce below committed qty" rule is unchanged.
IF OBJECT_ID(N'proj.fn_JobItemCommitted') IS NOT NULL DROP FUNCTION proj.fn_JobItemCommitted;
GO

CREATE FUNCTION proj.fn_JobItemCommitted (@JobId NVARCHAR(50), @ItemId INT)
RETURNS TABLE
AS
RETURN
(
    SELECT
        PrQty = ISNULL((SELECT SUM(prl.RequiredQty)
                        FROM proj.TBL_PURCHASE_REQUEST_LINE prl
                        JOIN proj.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
                        WHERE pr.JobId = @JobId
                          AND prl.ItemId = @ItemId
                          AND prl.IsActive = 1
                          AND pr.Status NOT IN ('Rejected', 'Cancelled')), 0),
        PoQty = ISNULL((SELECT SUM(pol.OrderedQty)
                        FROM proj.TBL_PURCHASE_ORDER_LINE pol
                        JOIN proj.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
                        WHERE po.JobId = @JobId
                          AND pol.ItemId = @ItemId
                          AND pol.IsActive = 1
                          AND po.Status NOT IN ('Rejected', 'Cancelled')), 0),
        GrnQty = ISNULL((SELECT SUM(d.ReceivedQty)
                         FROM proj.TBL_GRN_DETAIL d
                         JOIN proj.TBL_GRN_HEADER g ON g.GrnId = d.GrnId
                         WHERE g.JobId = @JobId
                           AND d.ItemId = @ItemId
                           AND d.IsActive = 1
                           AND g.Status <> 'Cancelled'), 0)
);
GO

-- ── 2. Budget line add / edit ──────────────────────────────────────────────
IF OBJECT_ID(N'proj.sp_SetJobBudgetItem') IS NOT NULL DROP PROCEDURE proj.sp_SetJobBudgetItem;
GO

CREATE PROCEDURE proj.sp_SetJobBudgetItem
    @BudgetItemId   INT           = 0,
    @JobId          NVARCHAR(50),
    @RvNo           INT           = 0,
    @CostCategoryId INT,
    @ItemId         INT,
    @Qty            DECIMAL(18,4) = 0,
    @UomId          INT           = NULL,
    @UnitPrice      DECIMAL(18,4) = 0,
    @Notes          NVARCHAR(300) = NULL,
    @CreatedBy      NVARCHAR(100),
    @ModifiedBy     NVARCHAR(100) = NULL,
    @Reason         NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM proj.TBL_JOB WHERE JobId=@JobId AND ApprovalStatus='Approved')
            THROW 50702, 'The job must be approved before its budget can be edited.', 1;
        IF EXISTS (SELECT 1 FROM proj.TBL_JOB_BUDGET WHERE JobId=@JobId AND RvNo=@RvNo AND IsApproved=1)
            THROW 50700, 'This budget revision is approved and locked. Revise it to edit.', 1;
        IF ISNULL(@Qty,0) <= 0 THROW 50701, 'Qty must be greater than zero.', 1;

        IF @BudgetItemId > 0
        BEGIN
            DECLARE @OldItemId   INT,
                    @OldQtyCheck DECIMAL(18,4);

            SELECT @OldItemId   = ItemId,
                   @OldQtyCheck = Qty
            FROM proj.TBL_JOB_BUDGET_ITEM
            WHERE BudgetItemId = @BudgetItemId;

            -- Swapping the item on a committed line would orphan the PR/PO/GRN:
            -- they keep pointing at the old item, which the budget no longer holds.
            IF @OldItemId IS NOT NULL AND @OldItemId <> @ItemId
            BEGIN
                DECLARE @sPr DECIMAL(18,4), @sPo DECIMAL(18,4), @sGrn DECIMAL(18,4);
                SELECT @sPr = PrQty, @sPo = PoQty, @sGrn = GrnQty
                FROM proj.fn_JobItemCommitted(@JobId, @OldItemId);

                IF (@sPr + @sPo + @sGrn) > 0
                BEGIN
                    DECLARE @OldCode NVARCHAR(100) =
                        ISNULL((SELECT ItemCode FROM proj.TBL_ITEM WHERE ItemId = @OldItemId),
                               CAST(@OldItemId AS NVARCHAR(20)));
                    -- Only name the documents that actually exist, and drop trailing
                    -- decimals — this renders inline under the budget row.
                    DECLARE @SwapMsg NVARCHAR(500) =
                        'Item ' + @OldCode + ' is committed ('
                        + STUFF(
                            CASE WHEN @sPr  > 0 THEN ', PR '  + proj.fn_TrimQty(@sPr)  ELSE '' END
                          + CASE WHEN @sPo  > 0 THEN ', PO '  + proj.fn_TrimQty(@sPo)  ELSE '' END
                          + CASE WHEN @sGrn > 0 THEN ', GRN ' + proj.fn_TrimQty(@sGrn) ELSE '' END, 1, 2, '')
                        + '). Cancel those, or add the new item as a separate line.';
                    THROW 50704, @SwapMsg, 1;
                END
            END

            -- Pre-existing rule, unchanged: costing-required jobs may not have a
            -- budget qty reduced below what is already committed.
            DECLARE @IsCostingRequired BIT;
            SELECT @IsCostingRequired = jt.IsCostingRequired
            FROM proj.TBL_JOB j
            JOIN proj.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
            WHERE j.JobId = @JobId;

            IF @IsCostingRequired = 1 AND @Qty < @OldQtyCheck
            BEGIN
                DECLARE @PrQty  DECIMAL(18,4),
                        @PoQty  DECIMAL(18,4),
                        @GrnQty DECIMAL(18,4),
                        @Floor  DECIMAL(18,4);

                SELECT @PrQty = PrQty, @PoQty = PoQty, @GrnQty = GrnQty
                FROM proj.fn_JobItemCommitted(@JobId, @ItemId);

                SELECT @Floor = MAX(v) FROM (VALUES (@PrQty), (@PoQty), (@GrnQty)) AS t(v);

                IF @Qty < @Floor
                BEGIN
                    DECLARE @ErrMsg NVARCHAR(500) =
                        'Qty cannot go below the committed ' + proj.fn_TrimQty(@Floor) + ' ('
                        + STUFF(
                            CASE WHEN @PrQty  > 0 THEN ', PR '  + proj.fn_TrimQty(@PrQty)  ELSE '' END
                          + CASE WHEN @PoQty  > 0 THEN ', PO '  + proj.fn_TrimQty(@PoQty)  ELSE '' END
                          + CASE WHEN @GrnQty > 0 THEN ', GRN ' + proj.fn_TrimQty(@GrnQty) ELSE '' END, 1, 2, '')
                        + ').';
                    THROW 50703, @ErrMsg, 1;
                END
            END
        END

        IF @UomId IS NULL SET @UomId = (SELECT BaseUomId FROM proj.TBL_ITEM WHERE ItemId=@ItemId);

        DECLARE @newId INT = @BudgetItemId, @oldQty DECIMAL(18,4), @oldPrice DECIMAL(18,4), @act NVARCHAR(20);
        DECLARE @who NVARCHAR(100) = ISNULL(@ModifiedBy, @CreatedBy);

        IF @BudgetItemId IS NULL OR @BudgetItemId <= 0
        BEGIN
            DECLARE @existId INT = (SELECT TOP 1 BudgetItemId FROM proj.TBL_JOB_BUDGET_ITEM
                WHERE JobId=@JobId AND RvNo=@RvNo AND CostCategoryId=@CostCategoryId AND ItemId=@ItemId AND IsActive=1);
            IF @existId IS NOT NULL
            BEGIN
                SELECT @oldQty = Qty, @oldPrice = UnitPrice FROM proj.TBL_JOB_BUDGET_ITEM WHERE BudgetItemId=@existId;
                UPDATE proj.TBL_JOB_BUDGET_ITEM
                SET Qty = Qty + @Qty,
                    UnitPrice = CASE WHEN ISNULL(@UnitPrice,0) > 0 THEN @UnitPrice ELSE UnitPrice END,
                    UomId = @UomId, ModifiedBy = @CreatedBy, ModifiedDate = GETDATE()
                WHERE BudgetItemId = @existId;
                SET @newId = @existId;
                INSERT INTO proj.TBL_JOB_BUDGET_ITEM_LOG (BudgetItemId,JobId,RvNo,CostCategoryId,ItemId,Action,OldQty,NewQty,OldUnitPrice,NewUnitPrice,ChangedBy,Reason)
                VALUES (@existId,@JobId,@RvNo,@CostCategoryId,@ItemId,'INCREASE',@oldQty,@oldQty+@Qty,@oldPrice,
                        CASE WHEN ISNULL(@UnitPrice,0)>0 THEN @UnitPrice ELSE @oldPrice END,@who,@Reason);
            END
            ELSE
            BEGIN
                INSERT INTO proj.TBL_JOB_BUDGET_ITEM (JobId, RvNo, CostCategoryId, ItemId, Qty, UomId, UnitPrice, Notes, CreatedBy)
                VALUES (@JobId, @RvNo, @CostCategoryId, @ItemId, @Qty, @UomId, @UnitPrice, @Notes, @CreatedBy);
                SET @newId = CAST(SCOPE_IDENTITY() AS INT);
                INSERT INTO proj.TBL_JOB_BUDGET_ITEM_LOG (BudgetItemId,JobId,RvNo,CostCategoryId,ItemId,Action,OldQty,NewQty,OldUnitPrice,NewUnitPrice,ChangedBy,Reason)
                VALUES (@newId,@JobId,@RvNo,@CostCategoryId,@ItemId,'ADD',NULL,@Qty,NULL,@UnitPrice,@who,@Reason);
            END
        END
        ELSE
        BEGIN
            SELECT @oldQty = Qty, @oldPrice = UnitPrice FROM proj.TBL_JOB_BUDGET_ITEM WHERE BudgetItemId=@BudgetItemId;
            UPDATE proj.TBL_JOB_BUDGET_ITEM
            SET ItemId=@ItemId, Qty=@Qty, UomId=@UomId, UnitPrice=@UnitPrice, Notes=@Notes, ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
            WHERE BudgetItemId=@BudgetItemId;
            SET @act = CASE WHEN @Qty > @oldQty THEN 'INCREASE' WHEN @Qty < @oldQty THEN 'DECREASE' ELSE 'UPDATE' END;
            INSERT INTO proj.TBL_JOB_BUDGET_ITEM_LOG (BudgetItemId,JobId,RvNo,CostCategoryId,ItemId,Action,OldQty,NewQty,OldUnitPrice,NewUnitPrice,ChangedBy,Reason)
            VALUES (@BudgetItemId,@JobId,@RvNo,@CostCategoryId,@ItemId,@act,@oldQty,@Qty,@oldPrice,@UnitPrice,@who,@Reason);
        END

        COMMIT;
        SELECT @newId AS BudgetItemId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END;
GO

-- ── 3. Budget line delete ──────────────────────────────────────────────────
IF OBJECT_ID(N'proj.sp_DeleteJobBudgetItem') IS NOT NULL DROP PROCEDURE proj.sp_DeleteJobBudgetItem;
GO

CREATE PROCEDURE proj.sp_DeleteJobBudgetItem
    @BudgetItemId INT,
    @ModifiedBy   NVARCHAR(100) = NULL,
    @Reason       NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @JobId NVARCHAR(50), @RvNo INT, @Cat INT, @Item INT, @oldQty DECIMAL(18,4), @oldPrice DECIMAL(18,4);
        SELECT @JobId=JobId, @RvNo=RvNo, @Cat=CostCategoryId, @Item=ItemId, @oldQty=Qty, @oldPrice=UnitPrice
        FROM proj.TBL_JOB_BUDGET_ITEM WHERE BudgetItemId=@BudgetItemId;

        IF @JobId IS NULL THROW 50710, 'Budget item not found.', 1;
        IF EXISTS (SELECT 1 FROM proj.TBL_JOB_BUDGET WHERE JobId=@JobId AND RvNo=@RvNo AND IsApproved=1)
            THROW 50711, 'This budget revision is approved and locked.', 1;

        -- Deleting a committed line orphans its PR/PO/GRN just as a swap would.
        DECLARE @dPr DECIMAL(18,4), @dPo DECIMAL(18,4), @dGrn DECIMAL(18,4);
        SELECT @dPr = PrQty, @dPo = PoQty, @dGrn = GrnQty
        FROM proj.fn_JobItemCommitted(@JobId, @Item);

        IF (@dPr + @dPo + @dGrn) > 0
        BEGIN
            DECLARE @DelCode NVARCHAR(100) =
                ISNULL((SELECT ItemCode FROM proj.TBL_ITEM WHERE ItemId = @Item), CAST(@Item AS NVARCHAR(20)));
            DECLARE @DelMsg NVARCHAR(500) =
                'Item ' + @DelCode + ' is committed ('
                + STUFF(
                    CASE WHEN @dPr  > 0 THEN ', PR '  + proj.fn_TrimQty(@dPr)  ELSE '' END
                  + CASE WHEN @dPo  > 0 THEN ', PO '  + proj.fn_TrimQty(@dPo)  ELSE '' END
                  + CASE WHEN @dGrn > 0 THEN ', GRN ' + proj.fn_TrimQty(@dGrn) ELSE '' END, 1, 2, '')
                + '). Cancel those first.';
            THROW 50712, @DelMsg, 1;
        END

        UPDATE proj.TBL_JOB_BUDGET_ITEM SET IsActive=0, ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
        WHERE BudgetItemId=@BudgetItemId;

        INSERT INTO proj.TBL_JOB_BUDGET_ITEM_LOG (BudgetItemId,JobId,RvNo,CostCategoryId,ItemId,Action,OldQty,NewQty,OldUnitPrice,NewUnitPrice,ChangedBy,Reason)
        VALUES (@BudgetItemId,@JobId,@RvNo,@Cat,@Item,'DELETE',@oldQty,0,@oldPrice,NULL,@ModifiedBy,@Reason);

        COMMIT;
        SELECT 'Deleted' AS Status;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END;
GO
