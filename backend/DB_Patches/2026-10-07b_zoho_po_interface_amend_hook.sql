-- =====================================================================
-- 2026-10-07b  Zoho PO interface: re-queue a PO when an approved PO line is amended
--
-- APPLY TO: SYNERP (dev) and SYNERPINDIA (prod, applied 2026-10-12). Zoho is for the India company only. Run AFTER 2026-10-07_zoho_po_interface.sql.
-- Run with SSMS or `sqlcmd -I -i` (QUOTED_IDENTIFIER ON).
--
-- WHY: "Amend PO Line" (qty/price) and "Amend PO Line Qty" change an approved PO
-- WITHOUT going through approval and WITHOUT changing Revision, so
-- sp_PostPOApproval never fires and Zoho kept the old values.
--
-- WHAT THIS DOES: surgical, anchor-checked, idempotent edit of
--   proj.sp_AmendPOLine and proj.sp_AmendPOLineQty - just before their final
--   SELECT @PoLineId (i.e. after the amendment has committed) they now call
--   interface.usp_QueueZohoPO @Reissue = 1. Wrapped in TRY/CATCH: a failure is
--   written to interface.ZohoQueueLog and the amendment is NEVER blocked.
--   Zoho receives a new row set with Action = Update; unread older rows for the
--   PO become Superseded.
-- =====================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @anchor NVARCHAR(100) = N'SELECT @PoLineId AS PoLineId;';
DECLARE @block  NVARCHAR(MAX) = N'-- Zoho interface: send the amended PO to Zoho again (never blocks the amendment)
    BEGIN TRY
        DECLARE @ZhPoId INT = (SELECT PoId FROM proj.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @PoLineId);
        EXEC [interface].usp_QueueZohoPO @PoId = @ZhPoId, @By = @ModifiedBy, @Reissue = 1;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> -1
            INSERT INTO [interface].ZohoQueueLog (PoId, ErrorMessage) VALUES (@ZhPoId, LEFT(ERROR_MESSAGE(), 2000));
    END CATCH

    ';
DECLARE @name SYSNAME, @def NVARCHAR(MAX), @n INT, @sql NVARCHAR(MAX);

DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT N'sp_AmendPOLine' UNION ALL SELECT N'sp_AmendPOLineQty';
OPEN c; FETCH NEXT FROM c INTO @name;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.' + @name));
    SET @n   = (LEN(@def) - LEN(REPLACE(@def, @anchor, N''))) / LEN(@anchor);

    IF @def LIKE N'%usp_QueueZohoPO%'
        PRINT @name + N': already patched - skipped';
    ELSE IF @n <> 1
        PRINT @name + N': ANCHOR NOT FOUND EXACTLY ONCE (' + CAST(@n AS NVARCHAR(10)) + N') - NOT patched';
    ELSE
    BEGIN
        SET @sql = REPLACE(@def, @anchor, @block + @anchor);
        SET @sql = STUFF(@sql, CHARINDEX(N'CREATE', @sql), LEN(N'CREATE'), N'ALTER');   -- first CREATE -> ALTER
        EXEC (@sql);
        PRINT @name + N': patched';
    END
    FETCH NEXT FROM c INTO @name;
END
CLOSE c; DEALLOCATE c;
GO

SELECT o.name AS proc_name,
       CASE WHEN m.definition LIKE N'%usp_QueueZohoPO%' THEN 1 ELSE 0 END AS has_hook,
       m.uses_quoted_identifier AS quoted_identifier
FROM   sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE  o.name IN (N'sp_AmendPOLine', N'sp_AmendPOLineQty');
GO
