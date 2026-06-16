SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
SET NOCOUNT ON
GO

-- ============================================================================
-- Migrate PO Headers + Lines from old job 310011 -> new job EC26-300002
-- 402 headers | 1065 matched lines (2 lines skipped: item 138407)
-- Status:  3=Authorised->Approved  5=Registered->Received  7=Cancelled->Cancelled
-- Currency: old 11 (USD) -> new 2
-- ============================================================================

BEGIN TRANSACTION;
BEGIN TRY

    CREATE TABLE #PoMap (OldOrderId INT, NewPoId INT);

    DECLARE @OldOrderId   INT,
            @PoDate       DATE,
            @SupplierId   INT,
            @CurrencyId   INT,
            @ExchRate     DECIMAL(18,6),
            @PayTerms     NVARCHAR(200),
            @DlvTerms     NVARCHAR(200),
            @PoAmt        DECIMAL(18,2),
            @TaxAmt       DECIMAL(18,2),
            @Discount     DECIMAL(18,2),
            @Notes        NVARCHAR(500),
            @VendorRef    NVARCHAR(200),
            @StatusId     INT,
            @Revision     INT,
            @HoldBy       INT,
            @HoldDate     DATETIME,
            @NewStatus    NVARCHAR(30),
            @NewPoNumber  NVARCHAR(50),
            @NewPoId      INT,
            @PayTermsId   INT,
            @DlvTermsId   INT,
            @NewCurrId    INT;

    DECLARE cur CURSOR FAST_FORWARD FOR
        SELECT OrderId, CAST(PoDate AS DATE), SupplierId,
               PocurrencyId, ISNULL(PoCurrencyRate,1),
               LTRIM(RTRIM(ISNULL(PaymentTerms,''))),
               LTRIM(RTRIM(ISNULL(DeliveryTerms,''))),
               ISNULL(PoAmount,0), ISNULL(taxamount,0), ISNULL(Discount,0),
               NULLIF(LTRIM(RTRIM(ISNULL(PoRemarks,''))), ''),
               NULLIF(LTRIM(RTRIM(ISNULL(VendorQtnRef,''))), ''),
               PoStatusId,
               ISNULL(TRY_CAST(revision AS INT), 0),
               POHoldBy, POHoldDate
        FROM ENGSERVICE_FZEERP.DBO.TBL_PURCHASE
        WHERE jobref = '310011'
        ORDER BY PoDate, OrderId;

    OPEN cur;
    FETCH NEXT FROM cur INTO @OldOrderId, @PoDate, @SupplierId,
        @CurrencyId, @ExchRate, @PayTerms, @DlvTerms,
        @PoAmt, @TaxAmt, @Discount, @Notes, @VendorRef,
        @StatusId, @Revision, @HoldBy, @HoldDate;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Map old status to new
        SET @NewStatus = CASE @StatusId
            WHEN 3 THEN 'Approved'
            WHEN 4 THEN 'Approved'
            WHEN 5 THEN 'Received'
            WHEN 7 THEN 'Cancelled'
            ELSE 'Approved'
        END;

        -- Map old currency (11=USD old -> 2=USD new)
        SET @NewCurrId = CASE @CurrencyId WHEN 11 THEN 2 ELSE @CurrencyId END;

        -- Map old free-text payment terms -> new PaymentTermsId
        SET @PayTermsId = CASE LTRIM(RTRIM(@PayTerms))
            WHEN 'Upon Receipt-90 days-Post Dated Cheque'        THEN 45
            WHEN 'Upon Receipt-90 days-Current Dated Cheque'     THEN 46
            WHEN 'Upon Receipt-120 days-Post Dated Cheque'       THEN 47
            WHEN 'Upon Receipt-120 days-Current Dated Cheque'    THEN 48
            WHEN 'Upon Receipt-60 days-Post Dated Cheque'        THEN 43
            WHEN 'Upon Receipt-45 days-Post Dated Cheque'        THEN 42
            WHEN 'Upon Receipt-30 days-Post Dated Cheque'        THEN 40
            WHEN 'Upon Receipt-Post Dated Cheque'                THEN 37
            WHEN 'Upon Completion-120 days-Post Dated Cheque'    THEN 31
            WHEN 'Upon Completion-120 days-Current Dated Cheque' THEN 32
            WHEN 'Upon Completion-90 days-Current Dated Cheque'  THEN 30
            WHEN 'Upon Completion-60 days-Current Dated Cheque'  THEN 28
            WHEN 'Upon Completion-30 days-Current Dated Cheque'  THEN 24
            WHEN 'Upon Dispatch-120 days-Post Dated Cheque'      THEN 36
            WHEN 'Advance with Order-Post Dated Cheque'          THEN 19
            WHEN '90 Days Net'                                   THEN 11
            WHEN '75days PDC'                                    THEN 10
            WHEN '30 Days Net Transfer'                          THEN 4
            WHEN '30 days net'                                   THEN 4
            WHEN '10% Advance and Balance 45 days PDC'          THEN 16  -- As Agreed (closest)
            WHEN 'As Agreed, Terms'                              THEN 16
            ELSE NULL
        END;

        -- Map delivery terms
        SELECT @DlvTermsId = DeliveryTermsId
        FROM proj.TBL_DELIVERY_TERMS
        WHERE TermName = @DlvTerms OR TermCode = @DlvTerms;

        -- Generate PO number
        DECLARE @DocResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @DocResult EXEC proj.sp_GetNextDocNumber 'PO';
        SELECT @NewPoNumber = DocNumber FROM @DocResult;
        DELETE FROM @DocResult;

        INSERT INTO proj.TBL_PURCHASE_ORDER
            (PoNumber, PoDate, SupplierId, JobId, CurrencyId, ExchangeRate,
             PaymentTermsId, DeliveryTerms, TotalAmount, TaxAmount, Discount,
             Status, Notes, VendorRef, Revision,
             HoldBy, HoldDate, LegacyOrderId, SupplierContactId,
             ExpenseCategoryId, IsActive, CreatedBy, CreatedDate)
        VALUES
            (@NewPoNumber, @PoDate, @SupplierId, 'EC26-300002',
             @NewCurrId, @ExchRate,
             @PayTermsId, @DlvTerms, @PoAmt, @TaxAmt, @Discount,
             @NewStatus, @Notes, @VendorRef, @Revision,
             CASE WHEN @HoldBy IS NOT NULL THEN 'MIGRATION' END,
             @HoldDate, @OldOrderId,
             ISNULL((SELECT TOP 1 SupplierContactId FROM proj.TBL_SUPPLIER_CONTACT
                     WHERE SupplierId=@SupplierId AND IsActive=1 ORDER BY IsPrimary DESC, SupplierContactId), 0),
             15,  -- Miscellaneous (default; can be updated per PO later)
             1, 'MIGRATION', GETDATE());

        SET @NewPoId = SCOPE_IDENTITY();
        INSERT INTO #PoMap VALUES (@OldOrderId, @NewPoId);

        FETCH NEXT FROM cur INTO @OldOrderId, @PoDate, @SupplierId,
            @CurrencyId, @ExchRate, @PayTerms, @DlvTerms,
            @PoAmt, @TaxAmt, @Discount, @Notes, @VendorRef,
            @StatusId, @Revision, @HoldBy, @HoldDate;
    END;

    CLOSE cur; DEALLOCATE cur;

    -- ── PO Lines ────────────────────────────────────────────────────────────
    INSERT INTO proj.TBL_PURCHASE_ORDER_LINE
        (PoId, LineNum, ItemId, ItemCode, ItemDesc,
         OrderedQty, ReceivedQty, UomId, UomName,
         UnitPrice, TaxPct, IsActive, CreatedBy, CreatedDate)
    SELECT
        m.NewPoId,
        ROW_NUMBER() OVER (PARTITION BY d.OrderId ORDER BY d.TblId),
        i.ItemId,
        i.ItemCode,
        i.ItemName,
        d.Qty,
        ISNULL(d.ReceivedQty, 0),
        ISNULL(i.BaseUomId, 1),
        u.UomCode,
        ISNULL(d.UnitPrice, 0),
        0,   -- TaxPct not stored at line level in old system
        1,
        'MIGRATION',
        GETDATE()
    FROM ENGSERVICE_FZEERP.DBO.TBL_PURCHASEDETAILS d
    JOIN #PoMap            m ON m.OldOrderId = d.OrderId
    JOIN proj.TBL_ITEM     i ON i.ItemCode   = CAST(d.Itemcode AS NVARCHAR(20))
    JOIN proj.TBL_ITEM_UOM u ON u.UomId      = ISNULL(i.BaseUomId, 1);
    -- 2 lines with item 138407 skipped (not in new system)

    DECLARE @h INT = (SELECT COUNT(*) FROM #PoMap);
    DECLARE @l INT = @@ROWCOUNT;
    PRINT CAST(@h AS VARCHAR) + ' PO headers inserted.';
    PRINT CAST(@l AS VARCHAR) + ' PO lines inserted.';

    -- Summary by status
    SELECT po.Status, COUNT(*) headers, SUM(po.TotalAmount) total_value
    FROM proj.TBL_PURCHASE_ORDER po
    JOIN #PoMap m ON m.NewPoId = po.PoId
    GROUP BY po.Status ORDER BY po.Status;

    DROP TABLE #PoMap;

    COMMIT TRANSACTION;
    PRINT 'PO migration complete.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    IF OBJECT_ID('tempdb..#PoMap') IS NOT NULL DROP TABLE #PoMap;
    PRINT 'ERROR: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO
