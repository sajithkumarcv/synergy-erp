-- Stock cost at GRN posting is now BASE currency.
-- Before: GRN line UnitPrice (PO currency, e.g. USD 100) went straight into TBL_STOCK_BALANCE.AvgUnitCost,
--         TBL_STOCK_LEDGER and the auto-created TBL_STOCK_RECEIPT_LINE, so issues were costed at 100 'base'.
-- After:  cost = UnitPrice * PO exchange rate (same rate the job-cost view uses for PO commitments).
-- Existing stock received against foreign-currency POs is NOT corrected by this patch.
SET QUOTED_IDENTIFIER ON;
GO
CREATE OR ALTER PROCEDURE proj.sp_ChangeGRNStatus
    @GrnId     INT,
    @NewStatus NVARCHAR(30),
    @ChangedBy NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY

        DECLARE @CurrentStatus NVARCHAR(30), @GrnNumber NVARCHAR(50),
                @GrnDate DATE, @ReceivedDate DATE, @JobId NVARCHAR(50),
                @PoId INT, @SupplierId INT;

        SELECT @CurrentStatus = g.Status, @GrnNumber = g.GrnNumber,
               @GrnDate = g.GrnDate, @ReceivedDate = g.ReceivedDate,
               @JobId = g.JobId, @PoId = g.PoId, @SupplierId = g.SupplierId
        FROM   proj.TBL_GRN_HEADER g
        WHERE  g.GrnId = @GrnId AND g.IsActive = 1;

        IF @CurrentStatus IS NULL
        BEGIN
            ROLLBACK;
            RAISERROR('GRN not found.', 16, 1);
            RETURN;
        END

        DECLARE @IsInHouseJob BIT = 0;
        IF NULLIF(@JobId,'') IS NOT NULL
            SELECT @IsInHouseJob = ISNULL(jt.IsBudgetHeaderLinked, 0)
            FROM proj.TBL_JOB j
            JOIN proj.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
            WHERE j.JobId = @JobId;

        DECLARE @IsJobStock BIT = CASE
            WHEN NULLIF(@JobId,'') IS NOT NULL AND @IsInHouseJob = 0 THEN 1
            ELSE 0 END;

        IF @CurrentStatus = N'Draft' AND @NewStatus = N'Received'
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM proj.TBL_GRN_DETAIL WHERE GrnId=@GrnId AND IsActive=1)
            BEGIN ROLLBACK; RAISERROR('Cannot receive a GRN with no lines.', 16, 1); RETURN; END

            UPDATE pol
            SET    pol.ReceivedQty  = ISNULL(pol.ReceivedQty,0) + (d.ReceivedQty - ISNULL(d.RejectedQty,0)),
                   pol.ModifiedBy   = @ChangedBy, pol.ModifiedDate = GETDATE()
            FROM   proj.TBL_PURCHASE_ORDER_LINE pol
            JOIN   proj.TBL_GRN_DETAIL d ON d.PoLineId = pol.PoLineId
            WHERE  d.GrnId=@GrnId AND d.IsActive=1 AND d.PoLineId IS NOT NULL;

            UPDATE pol
            SET    pol.LineStatus = CASE
                       WHEN pol.ReceivedQty >= pol.OrderedQty THEN 'Received'
                       WHEN pol.ReceivedQty  > 0              THEN 'Partial'
                       ELSE 'Open' END,
                   pol.ModifiedBy = @ChangedBy, pol.ModifiedDate = GETDATE()
            FROM   proj.TBL_PURCHASE_ORDER_LINE pol
            JOIN   proj.TBL_GRN_DETAIL d ON d.PoLineId = pol.PoLineId
            WHERE  d.GrnId=@GrnId AND d.IsActive=1 AND d.PoLineId IS NOT NULL
              AND  pol.LineStatus NOT IN ('Closed','Cancelled');

            IF NULLIF(@PoId,0) IS NOT NULL
            BEGIN
                UPDATE po
                SET    po.Status = CASE
                           WHEN NOT EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_ORDER_LINE
                               WHERE PoId=@PoId AND IsActive=1
                                 AND LineStatus NOT IN ('Received','Closed','Cancelled')) THEN 'Received'
                           WHEN EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_ORDER_LINE
                               WHERE PoId=@PoId AND IsActive=1 AND ReceivedQty > 0) THEN 'Partial'
                           ELSE po.Status END,
                       po.ModifiedBy=@ChangedBy, po.ModifiedDate=GETDATE()
                FROM   proj.TBL_PURCHASE_ORDER po
                WHERE  po.PoId=@PoId AND po.Status NOT IN ('Cancelled','Closed');
            END

            UPDATE bom
            SET    bom.BomReceivedQty = ISNULL(bom.BomReceivedQty,0) + (d.ReceivedQty - ISNULL(d.RejectedQty,0)),
                   bom.BomStatus = CASE
                       WHEN (ISNULL(bom.BomReceivedQty,0)+(d.ReceivedQty-ISNULL(d.RejectedQty,0))) >= bom.BomRequestedQty THEN 'FullyReceived'
                       WHEN (ISNULL(bom.BomReceivedQty,0)+(d.ReceivedQty-ISNULL(d.RejectedQty,0)))  > 0 THEN 'PartialReceived'
                       ELSE bom.BomStatus END,
                   bom.ModifiedBy=@ChangedBy, bom.ModifiedDate=GETDATE()
            FROM   proj.TBL_BOM_DETAILS bom
            JOIN   proj.TBL_PURCHASE_REQUEST_LINE prl ON prl.BomDetailId=bom.BomId
            JOIN   proj.TBL_GRN_DETAIL d ON d.PrLineId=prl.PrLineId
            WHERE  d.GrnId=@GrnId AND d.IsActive=1 AND d.PrLineId IS NOT NULL;

            -- Stock is valued in BASE currency: GRN line prices are in the PO currency, so convert
            -- with the PO's exchange rate (1 unit of PO currency = @PoRate base units).
            DECLARE @PoRate DECIMAL(18,6) = 1;
            SELECT @PoRate = ISNULL(NULLIF(po.ExchangeRate, 0), 1)
            FROM proj.TBL_PURCHASE_ORDER po WHERE po.PoId = @PoId;
            DECLARE @LineNum INT, @ItemId INT, @ItemDesc NVARCHAR(300),
                    @AcceptedQty DECIMAL(18,4), @UomId INT, @UnitPrice DECIMAL(18,4),
                    @BaseUomId INT, @ConvFactor DECIMAL(18,6),
                    @StockQty DECIMAL(18,4), @StockUnitCost DECIMAL(18,4),
                    @ConvErrMsg NVARCHAR(400);

            DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
                SELECT LineNum,ItemId,ItemDesc,(ReceivedQty-ISNULL(RejectedQty,0)),UomId,ROUND(UnitPrice * @PoRate, 4)
                FROM proj.TBL_GRN_DETAIL
                WHERE GrnId=@GrnId AND IsActive=1 AND ItemId IS NOT NULL
                  AND (ReceivedQty-ISNULL(RejectedQty,0)) > 0;

            OPEN cur;
            FETCH NEXT FROM cur INTO @LineNum,@ItemId,@ItemDesc,@AcceptedQty,@UomId,@UnitPrice;
            WHILE @@FETCH_STATUS=0
            BEGIN
                SELECT @BaseUomId = BaseUomId FROM proj.TBL_ITEM WHERE ItemId = @ItemId;
                SET @ConvFactor = NULL;
                IF @UomId IS NOT NULL AND @BaseUomId IS NOT NULL AND @UomId <> @BaseUomId
                BEGIN
                    SELECT @ConvFactor = ConversionFactor
                    FROM proj.TBL_ITEM_UOM_CONVERSION
                    WHERE ItemId=@ItemId AND FromUomId=@UomId AND ToUomId=@BaseUomId AND IsActive=1;
                    IF @ConvFactor IS NULL OR @ConvFactor = 0
                    BEGIN
                        SET @ConvErrMsg = 'No UOM conversion defined for "' +
                            ISNULL(@ItemDesc, CAST(@ItemId AS NVARCHAR(20))) +
                            '". Set it up in Item master > UOM Conversions tab.';
                        RAISERROR(@ConvErrMsg, 16, 1);
                    END
                    SET @StockQty      = @AcceptedQty * @ConvFactor;
                    SET @StockUnitCost = @UnitPrice   / @ConvFactor;
                END
                ELSE
                BEGIN
                    SET @StockQty      = @AcceptedQty;
                    SET @StockUnitCost = @UnitPrice;
                END

                IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_BALANCE WHERE ItemId=@ItemId)
                BEGIN
                    DECLARE @CurrQty DECIMAL(18,4), @CurrAvgCost DECIMAL(18,4), @NewAvgCost DECIMAL(18,4);
                    SELECT @CurrQty=ISNULL(QtyOnHand,0), @CurrAvgCost=ISNULL(AvgUnitCost,0)
                    FROM proj.TBL_STOCK_BALANCE WHERE ItemId=@ItemId;
                    SET @NewAvgCost = CASE WHEN (@CurrQty+@StockQty)=0 THEN @StockUnitCost
                                          ELSE (@CurrQty*@CurrAvgCost+@StockQty*@StockUnitCost)/(@CurrQty+@StockQty) END;
                    UPDATE proj.TBL_STOCK_BALANCE
                    SET QtyOnHand    = ISNULL(QtyOnHand,0) + @StockQty,
                        QtyJobStock  = ISNULL(QtyJobStock,0) + CASE WHEN @IsJobStock=1 THEN @StockQty ELSE 0 END,
                        AvgUnitCost  = @NewAvgCost,
                        LastReceiptDate = GETDATE(), UpdatedDate = GETDATE()
                    WHERE ItemId=@ItemId;
                END
                ELSE
                    INSERT INTO proj.TBL_STOCK_BALANCE(ItemId,QtyOnHand,QtyJobStock,AvgUnitCost,LastReceiptDate,UpdatedDate)
                    VALUES(@ItemId,@StockQty,CASE WHEN @IsJobStock=1 THEN @StockQty ELSE 0 END,@StockUnitCost,GETDATE(),GETDATE());

                INSERT INTO proj.TBL_STOCK_LEDGER(ItemId,TransDate,TransType,RefId,RefNo,QtyIn,QtyOut,UnitCost,IsJobStock,JobId,CreatedBy)
                VALUES(@ItemId,GETDATE(),'GRN',@GrnId,@GrnNumber,@StockQty,0,@StockUnitCost,@IsJobStock,NULLIF(@JobId,''),@ChangedBy);

                FETCH NEXT FROM cur INTO @LineNum,@ItemId,@ItemDesc,@AcceptedQty,@UomId,@UnitPrice;
            END
            CLOSE cur; DEALLOCATE cur;

            DECLARE @ReceiptNo NVARCHAR(50), @PoNumber NVARCHAR(50),
                    @SupplierName NVARCHAR(200), @ReceiptId INT;
            DECLARE @srResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
            INSERT INTO @srResult EXEC proj.sp_GetNextDocNumber 'SR';
            SELECT @ReceiptNo=DocNumber FROM @srResult;
            SELECT @PoNumber=PoNumber FROM proj.TBL_PURCHASE_ORDER WHERE PoId=@PoId;
            SELECT @SupplierName=SupplierName FROM proj.TBL_SUPPLIER WHERE SupplierId=@SupplierId;

            INSERT INTO proj.TBL_STOCK_RECEIPT(ReceiptNo,ReceiptDate,ReceiptType,JobId,PoId,PoNumber,SupplierName,Notes,Status,GrnId,IsActive,CreatedBy)
            VALUES(@ReceiptNo,ISNULL(@ReceivedDate,@GrnDate),'GRN',NULLIF(@JobId,''),@PoId,@PoNumber,@SupplierName,'Auto-created from GRN '+@GrnNumber,'Posted',@GrnId,1,@ChangedBy);
            SET @ReceiptId=SCOPE_IDENTITY();

            INSERT INTO proj.TBL_STOCK_RECEIPT_LINE(ReceiptId,LineNum,ItemId,ItemDesc,Qty,UomId,UnitCost,IsJobStock,JobId,IsActive,CreatedBy)
            SELECT @ReceiptId,d.LineNum,d.ItemId,d.ItemDesc,(d.ReceivedQty-ISNULL(d.RejectedQty,0)),d.UomId,ROUND(d.UnitPrice * @PoRate, 4),
                   @IsJobStock,NULLIF(@JobId,''),1,@ChangedBy
            FROM proj.TBL_GRN_DETAIL d
            WHERE d.GrnId=@GrnId AND d.IsActive=1 AND d.ItemId IS NOT NULL
              AND (d.ReceivedQty-ISNULL(d.RejectedQty,0))>0;
        END

        ELSE IF @CurrentStatus=N'Received' AND @NewStatus=N'Cancelled'
        BEGIN
            UPDATE pol
            SET    pol.ReceivedQty = CASE
                       WHEN ISNULL(pol.ReceivedQty,0)-(d.ReceivedQty-ISNULL(d.RejectedQty,0))<0 THEN 0
                       ELSE ISNULL(pol.ReceivedQty,0)-(d.ReceivedQty-ISNULL(d.RejectedQty,0)) END,
                   pol.ModifiedBy=@ChangedBy, pol.ModifiedDate=GETDATE()
            FROM proj.TBL_PURCHASE_ORDER_LINE pol
            JOIN proj.TBL_GRN_DETAIL d ON d.PoLineId=pol.PoLineId
            WHERE d.GrnId=@GrnId AND d.IsActive=1 AND d.PoLineId IS NOT NULL;

            UPDATE pol
            SET    pol.LineStatus = CASE
                       WHEN pol.ReceivedQty >= pol.OrderedQty THEN 'Received'
                       WHEN pol.ReceivedQty  > 0              THEN 'Partial'
                       ELSE 'Open' END,
                   pol.ModifiedBy=@ChangedBy, pol.ModifiedDate=GETDATE()
            FROM   proj.TBL_PURCHASE_ORDER_LINE pol
            JOIN   proj.TBL_GRN_DETAIL d ON d.PoLineId=pol.PoLineId
            WHERE  d.GrnId=@GrnId AND d.IsActive=1 AND d.PoLineId IS NOT NULL
              AND  pol.LineStatus NOT IN ('Closed','Cancelled');

            IF NULLIF(@PoId,0) IS NOT NULL
            BEGIN
                UPDATE po
                SET    po.Status = CASE
                           WHEN EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_ORDER_LINE
                               WHERE PoId=@PoId AND IsActive=1 AND ReceivedQty>0) THEN 'Partial'
                           ELSE 'Approved' END,
                       po.ModifiedBy=@ChangedBy, po.ModifiedDate=GETDATE()
                FROM proj.TBL_PURCHASE_ORDER po
                WHERE po.PoId=@PoId AND po.Status NOT IN ('Cancelled','Closed','Draft');
            END

            UPDATE bom
            SET    bom.BomReceivedQty = v.NewQty,
                   bom.BomStatus = CASE
                       WHEN v.NewQty >= bom.BomRequestedQty         THEN 'FullyReceived'
                       WHEN v.NewQty  > 0                           THEN 'PartialReceived'
                       WHEN bom.PoCreatedQty >= bom.BomRequestedQty THEN 'PORaised'
                       WHEN bom.PoCreatedQty  > 0                   THEN 'POPartial'
                       WHEN bom.PrCreatedQty >= bom.BomRequestedQty THEN 'PRRaised'
                       WHEN bom.PrCreatedQty  > 0                   THEN 'PRPartial'
                       ELSE 'Pending' END,
                   bom.ModifiedBy=@ChangedBy, bom.ModifiedDate=GETDATE()
            FROM   proj.TBL_BOM_DETAILS bom
            JOIN   proj.TBL_PURCHASE_REQUEST_LINE prl ON prl.BomDetailId=bom.BomId
            JOIN   proj.TBL_GRN_DETAIL d ON d.PrLineId=prl.PrLineId
            CROSS APPLY (VALUES (
                CASE WHEN ISNULL(bom.BomReceivedQty,0)-(d.ReceivedQty-ISNULL(d.RejectedQty,0))<0
                     THEN CAST(0 AS DECIMAL(18,4))
                     ELSE ISNULL(bom.BomReceivedQty,0)-(d.ReceivedQty-ISNULL(d.RejectedQty,0)) END
            )) v(NewQty)
            WHERE  d.GrnId=@GrnId AND d.IsActive=1 AND d.PrLineId IS NOT NULL;

            DECLARE @RItemId INT, @RQtyIn DECIMAL(18,4), @RUnitCost DECIMAL(18,4),
                    @RIsJobStock BIT, @RJobId NVARCHAR(50);
            DECLARE cur2 CURSOR LOCAL FAST_FORWARD FOR
                SELECT ItemId,QtyIn,UnitCost,IsJobStock,JobId FROM proj.TBL_STOCK_LEDGER
                WHERE TransType='GRN' AND RefId=@GrnId AND QtyIn>0;
            OPEN cur2;
            FETCH NEXT FROM cur2 INTO @RItemId,@RQtyIn,@RUnitCost,@RIsJobStock,@RJobId;
            WHILE @@FETCH_STATUS=0
            BEGIN
                UPDATE proj.TBL_STOCK_BALANCE
                SET QtyOnHand=CASE WHEN ISNULL(QtyOnHand,0)-@RQtyIn<0 THEN 0 ELSE ISNULL(QtyOnHand,0)-@RQtyIn END,
                    QtyJobStock=CASE WHEN @RIsJobStock=1 THEN CASE WHEN ISNULL(QtyJobStock,0)-@RQtyIn<0 THEN 0 ELSE ISNULL(QtyJobStock,0)-@RQtyIn END ELSE QtyJobStock END,
                    UpdatedDate=GETDATE()
                WHERE ItemId=@RItemId;

                INSERT INTO proj.TBL_STOCK_LEDGER(ItemId,TransDate,TransType,RefId,RefNo,QtyIn,QtyOut,UnitCost,IsJobStock,JobId,CreatedBy)
                VALUES(@RItemId,GETDATE(),'GRN-REV',@GrnId,@GrnNumber,0,@RQtyIn,@RUnitCost,@RIsJobStock,@RJobId,@ChangedBy);

                FETCH NEXT FROM cur2 INTO @RItemId,@RQtyIn,@RUnitCost,@RIsJobStock,@RJobId;
            END
            CLOSE cur2; DEALLOCATE cur2;

            UPDATE proj.TBL_STOCK_RECEIPT
            SET IsActive=0, Status='Cancelled', ModifiedBy=@ChangedBy, ModifiedDate=GETDATE()
            WHERE GrnId=@GrnId AND IsActive=1;

            UPDATE rl SET rl.IsActive=0, rl.ModifiedBy=@ChangedBy, rl.ModifiedDate=GETDATE()
            FROM proj.TBL_STOCK_RECEIPT_LINE rl
            JOIN proj.TBL_STOCK_RECEIPT r ON r.ReceiptId=rl.ReceiptId
            WHERE r.GrnId=@GrnId;
        END

        UPDATE proj.TBL_GRN_HEADER
        SET Status=@NewStatus, ModifiedBy=@ChangedBy, ModifiedDate=GETDATE()
        WHERE GrnId=@GrnId AND IsActive=1;

        COMMIT;
        SELECT CAST(@GrnId AS NVARCHAR(20));
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        IF CURSOR_STATUS('local','cur')  >= 0 BEGIN CLOSE cur;  DEALLOCATE cur;  END
        IF CURSOR_STATUS('local','cur2') >= 0 BEGIN CLOSE cur2; DEALLOCATE cur2; END
        DECLARE @Msg NVARCHAR(2048) = ERROR_MESSAGE();
        RAISERROR(@Msg, 16, 1); RETURN;
    END CATCH
END
GO
