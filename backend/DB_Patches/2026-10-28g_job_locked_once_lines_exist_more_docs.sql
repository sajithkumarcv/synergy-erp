-- 2026-10-28g: the job number cannot be changed once the document has lines - the five documents 2026-10-28f did not cover.
-- Delivery, Invoice, Free Issue GRN, Service Receipt (job or PO) and Subcontract Order. Same rule and same wording as 28f:
-- a job change is refused while the document has active lines; saving again with the SAME job is never blocked.
-- Subcontract Order: its components are replaced on every save, so the check reads the components already stored; to change the
-- job, save the order with no components first, then change the job.
-- Existing data untouched. Idempotent. All or nothing. Each block is located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @tag NVARCHAR(100) = N'-- 2026-10-28g job lock';
    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, marker NVARCHAR(200), block NVARCHAR(MAX));

    INSERT INTO @work (proc_name, marker, block) VALUES
    (N'sp_SetDelivery', N'UPDATE proj.TBL_DELIVERY SET', N'
        -- 2026-10-28g job lock
        IF ISNULL((SELECT JobId FROM proj.TBL_DELIVERY WHERE DeliveryId = @DeliveryId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
           AND EXISTS (SELECT 1 FROM proj.TBL_DELIVERY_LINE WHERE DeliveryId = @DeliveryId AND IsActive = 1)
        BEGIN
            RAISERROR(''You cannot change the job number while this Delivery has lines. Remove all the lines first, then change the job number.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SetInvoice', N'UPDATE PROJ.TBL_INVOICE', N'
        -- 2026-10-28g job lock
        IF ISNULL((SELECT JobId FROM PROJ.TBL_INVOICE WHERE InvoiceId = @InvoiceId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
           AND EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE_LINE WHERE InvoiceId = @InvoiceId AND IsActive = 1)
        BEGIN
            RAISERROR(''You cannot change the job number while this Invoice has lines. Remove all the lines first, then change the job number.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SetFreeIssueGrn', N'UPDATE proj.TBL_FREE_ISSUE_GRN_HEADER SET', N'
        -- 2026-10-28g job lock
        IF ISNULL((SELECT JobId FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId = @FreeIssueGrnId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
           AND EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_DETAIL WHERE FreeIssueGrnId = @FreeIssueGrnId AND IsActive = 1)
        BEGIN
            RAISERROR(''You cannot change the job number while this Free Issue GRN has lines. Remove all the lines first, then change the job number.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SetServiceReceipt', N'UPDATE proj.TBL_SRV_HEADER SET', N'
        -- 2026-10-28g job lock
        IF EXISTS (SELECT 1 FROM proj.TBL_SRV_HEADER WHERE SrvId = @SrvId
                   AND (ISNULL(JobId, '''') <> ISNULL(NULLIF(@JobId, ''''), '''') OR ISNULL(PoId, 0) <> ISNULL(NULLIF(@PoId, 0), 0)))
           AND EXISTS (SELECT 1 FROM proj.TBL_SRV_LINE WHERE SrvId = @SrvId AND IsActive = 1)
        BEGIN
            RAISERROR(''You cannot change the job number or the PO while this Service Receipt has lines. Remove all the lines first, then change it.'', 16, 1);
            RETURN;
        END

        '),
    (N'sp_SaveSubcontractOrder', N'UPDATE proj.TBL_SUBCONTRACT_ORDER SET', N'
            -- 2026-10-28g job lock
            IF ISNULL((SELECT JobId FROM proj.TBL_SUBCONTRACT_ORDER WHERE SubcontractId = @SubcontractId), '''') <> ISNULL(NULLIF(@JobId, ''''), '''')
               AND EXISTS (SELECT 1 FROM proj.TBL_SUBCONTRACT_COMPONENT WHERE SubcontractId = @SubcontractId AND IsActive = 1)
                RAISERROR(''You cannot change the job number while this Subcontract Order has components. Remove all the components first, then change the job number.'', 16, 1);

            ');

    DECLARE @i INT = 1, @n INT = (SELECT COUNT(*) FROM @work);
    DECLARE @proc SYSNAME, @marker NVARCHAR(200), @block NVARCHAR(MAX), @def NVARCHAR(MAX), @cpos INT, @msg NVARCHAR(400);

    WHILE @i <= @n
    BEGIN
        SELECT @proc = proc_name, @marker = marker, @block = block FROM @work WHERE seq = @i;
        SET @def = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.' + @proc));
        IF @def IS NULL BEGIN SET @msg = CONCAT('PROJ.', @proc, ' not found.'); THROW 50001, @msg, 1; END

        IF CHARINDEX(@tag, @def) > 0
            PRINT CONCAT(@proc, ': already applied.');
        ELSE
        BEGIN
            IF (LEN(@def) - LEN(REPLACE(@def, @marker, N''))) / LEN(@marker) <> 1
            BEGIN SET @msg = CONCAT(@proc, ': marker not found exactly once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END

            SET @def = REPLACE(@def, @marker, @block + @marker);
            SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
            IF @cpos = 0 BEGIN SET @msg = CONCAT(@proc, ': CREATE PROCEDURE not found.'); THROW 50003, @msg, 1; END
            SET @def = STUFF(@def, @cpos, 6, N'ALTER');
            EXEC (@def);
            PRINT CONCAT(@proc, ': altered.');
        END
        SET @i += 1;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
