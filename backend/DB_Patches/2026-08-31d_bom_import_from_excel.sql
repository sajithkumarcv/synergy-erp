/* ============================================================================
   Import BOM lines from Excel  -  proj.sp_ImportBomDetail  (new)

   Mirrors sp_ImportJobBudgetItem / sp_ImportEmployees: one row per call, always
   returns a single (Success, Message) row instead of throwing, so the caller can
   report per-row outcomes and carry on with the rest of the sheet.

   Sheet columns -> parameters:
       Section    -> @Section    (section CODE or NAME, within the BOM's job type)
       ItemCode   -> @ItemCode
       Qty        -> @Qty        (required, > 0)
       UOM        -> @Uom        (code or name; blank = the item's base UOM)
       UnitPrice  -> @UnitPrice  (optional; 0 leaves an existing line's price alone)
       ReqDate    -> @ReqDate    (optional)
       Critical   -> @IsCritical (optional)
       Remarks    -> @Remarks    (optional)

   MERGE RULE: a row whose (BomHeaderId, BomSectionId, ItemId) already exists as
   an active line ADDS its qty to that line - the same "Merged into existing item"
   behaviour the budget import has - rather than creating a duplicate. UnitPrice
   overwrites only when greater than zero, and BomStatus is recomputed because a
   higher requested qty can demote a line a PR/PO had already fully covered.
   An inactive (deleted) line is NOT matched - the row inserts a fresh line.

   Guards, in order: BOM must exist and be active; BOM must not be Approved (same
   rule sp_SetBomDetail enforces); the job must be open (sp_AssertJobOpen);
   item/section/UOM must resolve; qty must be positive.

   TotalBomValue is NOT touched here - TR_BOM_RecalcTotalValue
   (2026-08-31c_bom_total_value_trigger.sql) recalculates it on the insert/update.

   Idempotent: DROP + CREATE.
   ============================================================================ */

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('proj.sp_ImportBomDetail', 'P') IS NOT NULL
    DROP PROCEDURE proj.sp_ImportBomDetail;
GO

CREATE PROCEDURE proj.sp_ImportBomDetail
    @BomHeaderId INT,
    @Section     NVARCHAR(200) = NULL,
    @ItemCode    NVARCHAR(50),
    @Qty         DECIMAL(18,4),
    @Uom         NVARCHAR(50)  = NULL,
    @UnitPrice   DECIMAL(18,4) = 0,
    @ReqDate     DATE          = NULL,
    @IsCritical  BIT           = 0,
    @Remarks     NVARCHAR(500) = NULL,
    @By          NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        ---------------------------------------------------------------- header
        DECLARE @JobId NVARCHAR(50), @JobTypeId NVARCHAR(50), @BomStatus NVARCHAR(20);
        SELECT @JobId     = h.JobId,
               @BomStatus = h.BomStatus,
               @JobTypeId = ISNULL(j.JobTypeId, h.JobTypeId)
        FROM   proj.TBL_BOM_HEADER h
        LEFT JOIN proj.TBL_JOB j ON j.JobId = h.JobId
        WHERE  h.BomHeaderId = @BomHeaderId AND h.IsActive = 1;

        IF @JobId IS NULL
        BEGIN SELECT 0 AS Success, 'BOM not found.' AS Message; RETURN; END

        IF @BomStatus = 'Approved'
        BEGIN SELECT 0 AS Success, 'Cannot import into an Approved BOM. Revise it first.' AS Message; RETURN; END

        -- Throws 50002/50003 on a closed/freezed job; converted to a row result below.
        EXEC proj.sp_AssertJobOpen @JobId;

        ------------------------------------------------------------------ item
        DECLARE @ItemId INT, @BaseUom INT;
        SELECT TOP 1 @ItemId = ItemId, @BaseUom = BaseUomId
        FROM   proj.TBL_ITEM
        WHERE  ItemCode = @ItemCode AND ISNULL(IsActive, 1) = 1;

        IF @ItemId IS NULL
        BEGIN SELECT 0 AS Success, CONCAT('Item not found or inactive: ', @ItemCode) AS Message; RETURN; END

        IF ISNULL(@Qty, 0) <= 0
        BEGIN SELECT 0 AS Success, 'Qty must be greater than zero.' AS Message; RETURN; END

        --------------------------------------------------------------- section
        -- Sections are per job type, so the same code exists once per type and
        -- must be resolved against THIS BOM's type - never globally.
        IF NULLIF(LTRIM(RTRIM(ISNULL(@Section, ''))), '') IS NULL
        BEGIN SELECT 0 AS Success, 'Section is required.' AS Message; RETURN; END

        DECLARE @SectionId INT;
        SELECT TOP 1 @SectionId = BomSectionId
        FROM   proj.TBL_BOM_SECTION
        WHERE  JobTypeId = @JobTypeId
          AND  ISNULL(IsActive, 1) = 1
          AND  (SectionCode = @Section OR SectionName = @Section);

        IF @SectionId IS NULL
        BEGIN
            SELECT 0 AS Success,
                   CONCAT('Unknown Section "', @Section, '" for job type ', @JobTypeId, '.') AS Message;
            RETURN;
        END

        ------------------------------------------------------------------- uom
        DECLARE @UomId INT;
        IF NULLIF(LTRIM(RTRIM(ISNULL(@Uom, ''))), '') IS NULL
            SET @UomId = @BaseUom;
        ELSE
            SELECT TOP 1 @UomId = UomId
            FROM   proj.TBL_ITEM_UOM
            WHERE  ISNULL(IsActive, 1) = 1 AND (UomCode = @Uom OR UomName = @Uom);

        IF @UomId IS NULL
        BEGIN SELECT 0 AS Success, CONCAT('Unknown UOM "', ISNULL(@Uom, '(blank)'), '".') AS Message; RETURN; END

        ------------------------------------------------------------- insert/merge
        DECLARE @JobCurrencyId INT = (SELECT JobCurrencyId FROM proj.TBL_JOB WHERE JobId = @JobId);

        DECLARE @ExistingId INT;
        SELECT TOP 1 @ExistingId = BomId
        FROM   proj.TBL_BOM_DETAILS
        WHERE  BomHeaderId  = @BomHeaderId
          AND  BomSectionId = @SectionId
          AND  ItemId       = @ItemId
          AND  IsActive     = 1;

        IF @ExistingId IS NOT NULL
        BEGIN
            DECLARE @NewQty DECIMAL(18,4) =
                (SELECT BomRequestedQty + @Qty FROM proj.TBL_BOM_DETAILS WHERE BomId = @ExistingId);

            UPDATE proj.TBL_BOM_DETAILS
            SET    BomRequestedQty = @NewQty,
                   BomPrice        = CASE WHEN ISNULL(@UnitPrice, 0) > 0 THEN @UnitPrice ELSE BomPrice END,
                   UomId           = @UomId,
                   ItemReqDate     = ISNULL(@ReqDate, ItemReqDate),
                   IsCritical      = CASE WHEN @IsCritical = 1 THEN 1 ELSE IsCritical END,
                   Remarks         = ISNULL(NULLIF(@Remarks, ''), Remarks),
                   -- Raising the requested qty can demote a line a PR/PO already
                   -- fully covered (PRRaised -> PRPartial). Same CASE sp_SetBomDetail
                   -- uses. TR_BOM_RecalcStatus does NOT cover this: it only fires on
                   -- PR/PO/received qty changes, never on BomRequestedQty.
                   BomStatus       = CASE
                       WHEN ISNULL(BomReceivedQty,0) >= @NewQty THEN 'FullyReceived'
                       WHEN ISNULL(BomReceivedQty,0)  > 0       THEN 'PartialReceived'
                       WHEN ISNULL(PoCreatedQty,0)   >= @NewQty THEN 'PORaised'
                       WHEN ISNULL(PoCreatedQty,0)    > 0       THEN 'POPartial'
                       WHEN ISNULL(PrCreatedQty,0)   >= @NewQty THEN 'PRRaised'
                       WHEN ISNULL(PrCreatedQty,0)    > 0       THEN 'PRPartial'
                       ELSE 'Pending' END,
                   ModifiedBy      = @By,
                   ModifiedDate    = GETDATE()
            WHERE  BomId = @ExistingId;

            SELECT 1 AS Success,
                   CONCAT('Merged into existing line (qty now ', CAST(@NewQty AS NVARCHAR(30)), ')') AS Message;
            RETURN;
        END

        DECLARE @SortOrder INT =
            (SELECT ISNULL(MAX(SortOrder), 0) + 10
             FROM   proj.TBL_BOM_DETAILS
             WHERE  BomHeaderId = @BomHeaderId AND BomSectionId = @SectionId);

        INSERT INTO proj.TBL_BOM_DETAILS
            (BomHeaderId, JobId, BomSectionId, ItemId, SortOrder,
             BomRequestedQty, BomReceivedQty, PrCreatedQty, PoCreatedQty,
             UomId, BomPrice, CurrencyId, ExchangeRate,
             ItemReqDate, BomStatus, IsCritical, IsSubstituteAllowed, Remarks,
             IsActive, CreatedBy, CreatedDate)
        VALUES
            (@BomHeaderId, @JobId, @SectionId, @ItemId, @SortOrder,
             @Qty, 0, 0, 0,
             @UomId, ISNULL(@UnitPrice, 0), @JobCurrencyId, 1,
             @ReqDate, 'Pending', ISNULL(@IsCritical, 0), 0, NULLIF(@Remarks, ''),
             1, ISNULL(@By, 'SYSTEM'), GETDATE());

        SELECT 1 AS Success, 'Imported' AS Message;
    END TRY
    BEGIN CATCH
        -- Business THROWs (sp_AssertJobOpen) and genuine errors both come back
        -- as a row, so one bad line never aborts the whole sheet.
        SELECT 0 AS Success, ERROR_MESSAGE() AS Message;
    END CATCH
END
GO

/* Verify */
SELECT CASE WHEN OBJECT_ID('proj.sp_ImportBomDetail', 'P') IS NOT NULL
            THEN 'OK - sp_ImportBomDetail created' ELSE 'NOT CREATED' END AS Result;
GO
