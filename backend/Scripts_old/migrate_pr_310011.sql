SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
SET NOCOUNT ON
GO

-- ============================================================================
-- Migrate PR Headers + Lines from old job 310011 -> new job EC26-300002
-- 363 headers in Draft, 1044 matched lines (item 138407 skipped - not in new DB)
-- ============================================================================

BEGIN TRANSACTION;
BEGIN TRY

    -- Mapping: old PrId -> new PrId
    CREATE TABLE #PrMap (OldPrId INT, NewPrId INT);

    DECLARE @OldPrId   INT,
            @OldDate   DATE,
            @OldNotes  NVARCHAR(500),
            @NewPrNum  NVARCHAR(50),
            @NewPrId   INT;

    DECLARE cur CURSOR FAST_FORWARD FOR
        SELECT PrId,
               CAST(PrDate AS DATE),
               NULLIF(LTRIM(RTRIM(ISNULL(PrNotes,''))), '')
        FROM ENGSERVICE_FZEERP.DBO.TBL_PRHEADER
        WHERE prjobid = '310011'
        ORDER BY PrDate, PrId;

    OPEN cur;
    FETCH NEXT FROM cur INTO @OldPrId, @OldDate, @OldNotes;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Generate next PR number from document series
        DECLARE @DocResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @DocResult EXEC proj.sp_GetNextDocNumber 'PR';
        SELECT @NewPrNum = DocNumber FROM @DocResult;
        DELETE FROM @DocResult;

        INSERT INTO proj.TBL_PURCHASE_REQUEST
            (PrNumber, PrDate, RequestedBy, JobId, Priority,
             Status, Notes, IsActive, CreatedBy, CreatedDate)
        VALUES
            (@NewPrNum, @OldDate, 'MIGRATION', 'EC26-300002', 'Normal',
             'Draft', @OldNotes, 1, 'MIGRATION', GETDATE());

        SET @NewPrId = SCOPE_IDENTITY();
        INSERT INTO #PrMap VALUES (@OldPrId, @NewPrId);

        FETCH NEXT FROM cur INTO @OldPrId, @OldDate, @OldNotes;
    END;

    CLOSE cur; DEALLOCATE cur;

    -- ── PR Lines ──────────────────────────────────────────────────────────
    INSERT INTO proj.TBL_PURCHASE_REQUEST_LINE
        (PrId, LineNum, ItemId, ItemCode, ItemDesc,
         RequiredQty, PoCreatedQty, UomId, UomName,
         RequiredDate, EstUnitPrice, IsActive, CreatedBy, CreatedDate)
    SELECT
        m.NewPrId,
        ROW_NUMBER() OVER (PARTITION BY d.PrId ORDER BY d.TblId),
        i.ItemId,
        i.ItemCode,
        i.ItemName,
        d.PrItemQty,
        ISNULL(d.PrPoCreatedQty, 0),
        ISNULL(i.BaseUomId, 1),
        u.UomCode,
        CAST(d.PrItemReqDate AS DATE),
        0,
        1,
        'MIGRATION',
        GETDATE()
    FROM ENGSERVICE_FZEERP.DBO.TBL_PRDETAILS d
    JOIN #PrMap              m ON m.OldPrId  = d.PrId
    JOIN proj.TBL_ITEM       i ON i.ItemCode = CAST(d.PrItemId AS NVARCHAR)
    JOIN proj.TBL_ITEM_UOM   u ON u.UomId    = ISNULL(i.BaseUomId, 1);

    DECLARE @h INT = (SELECT COUNT(*) FROM #PrMap);
    DECLARE @l INT = @@ROWCOUNT;
    PRINT CAST(@h AS VARCHAR) + ' PR headers inserted.';
    PRINT CAST(@l AS VARCHAR) + ' PR lines inserted.';

    -- Summary
    SELECT pr.PrNumber, pr.PrDate, COUNT(pl.PrLineId) AS lines
    FROM proj.TBL_PURCHASE_REQUEST pr
    JOIN #PrMap m ON m.NewPrId = pr.PrId
    LEFT JOIN proj.TBL_PURCHASE_REQUEST_LINE pl ON pl.PrId = pr.PrId
    GROUP BY pr.PrNumber, pr.PrDate
    ORDER BY pr.PrDate, pr.PrNumber;

    DROP TABLE #PrMap;

    COMMIT TRANSACTION;
    PRINT 'Migration complete.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    IF OBJECT_ID('tempdb..#PrMap') IS NOT NULL DROP TABLE #PrMap;
    PRINT 'ERROR: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO
