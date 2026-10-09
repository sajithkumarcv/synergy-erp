/* ═══ FIFO cost per stock pool ════════════════════════════════════════════════
   sp_GetFifoCost used to line up EVERY receipt of an item (store and job stock)
   against EVERY issue, so a store issue could be priced from a job-stock layer
   it can never draw on (item 5257: 4 units charged at 5000 instead of 10).

   An Include-in-Costing issue comes from STORE stock only, so the lookup now
   works inside one pool: receipts and issues with the same IsJobStock flag.
   @IsJobStock defaults to 0 (store), which is the only way it is called today,
   so the controller and screens need no change.

   Everything else is the original proc: oldest receipt first, first layer not yet
   used up, fall back to the stock balance's average cost when there is no layer.
══════════════════════════════════════════════════════════════════════════════ */
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE proj.sp_GetFifoCost
    @ItemId     INT,
    @IsJobStock BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Total qty issued out of THIS pool for this item
    DECLARE @TotalOut DECIMAL(18,4) = ISNULL(
        (SELECT SUM(QtyOut) FROM proj.TBL_STOCK_LEDGER
         WHERE ItemId = @ItemId AND QtyOut > 0 AND IsJobStock = @IsJobStock), 0);

    -- Walk this pool's receipts oldest-first; first batch whose cumulative in exceeds total out = FIFO layer
    DECLARE @RunningIn DECIMAL(18,4) = 0;
    DECLARE @FifoCost  DECIMAL(18,4) = NULL;
    DECLARE @QtyIn     DECIMAL(18,4);
    DECLARE @UnitCost  DECIMAL(18,4);

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT QtyIn, UnitCost
        FROM   proj.TBL_STOCK_LEDGER
        WHERE  ItemId = @ItemId AND QtyIn > 0 AND IsJobStock = @IsJobStock
        ORDER  BY TransDate ASC, LedgerId ASC;

    OPEN cur;
    FETCH NEXT FROM cur INTO @QtyIn, @UnitCost;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @RunningIn = @RunningIn + @QtyIn;
        SET @FifoCost  = @UnitCost;
        IF @RunningIn > @TotalOut BREAK;
        FETCH NEXT FROM cur INTO @QtyIn, @UnitCost;
    END
    CLOSE cur; DEALLOCATE cur;

    -- Fallback: use average cost from stock balance if no ledger entries
    IF @FifoCost IS NULL
        SELECT @FifoCost = ISNULL(AvgUnitCost, 0)
        FROM   proj.TBL_STOCK_BALANCE
        WHERE  ItemId = @ItemId;

    SELECT ISNULL(@FifoCost, 0) AS FifoCost;
END;
GO
