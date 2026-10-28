-- 2026-10-28e: a Rejected PO gives its quantity back to the PR (and BOM), the way a Rejected PR already does.
-- Found on the SYNERPINDIA restore: PO-26-0145, 0172 and 0203 are Rejected but still count as ordered on 6 PR lines
-- (PR-26-0076 x2, PR-26-0164, PR-26-0147 x3), so those lines cannot be ordered again.
-- Cause: sp_RecalcPrPoCreatedQty releases the un-received balance only for Cancelled or Closed POs, and rejecting a PO
-- (sp_ProcessApproval) changes the status without calling it. PR rejection already releases through TR_PR_ReleaseBomOnReject.
-- Fix: (1) Rejected joins Cancelled/Closed in the rule; (2) a trigger on the PO status recalculates the PO's PR lines when it
-- moves into Rejected, and again if it moves out (reopened); (3) the lines held today by Rejected POs are recalculated.
-- Nothing is deleted or cancelled. A Rejected PO keeps its own lines and status.
-- Part 1 is idempotent and fails if the rule text is not found exactly twice. Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- ── Part 1: the rule ────────────────────────────────────────────────────────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.sp_RecalcPrPoCreatedQty'));
    DECLARE @old NVARCHAR(100) = N'po.Status IN (''Cancelled'',''Closed'')';
    DECLARE @new NVARCHAR(100) = N'po.Status IN (''Cancelled'',''Closed'',''Rejected'')';
    DECLARE @cpos INT;

    IF @def IS NULL THROW 50001, 'PROJ.sp_RecalcPrPoCreatedQty not found.', 1;

    IF CHARINDEX(@new, @def) > 0
        PRINT 'sp_RecalcPrPoCreatedQty: already applied.';
    ELSE
    BEGIN
        IF (LEN(@def) - LEN(REPLACE(@def, @old, N''))) / LEN(@old) <> 2
            THROW 50002, 'Rule text not found exactly twice in sp_RecalcPrPoCreatedQty - live definition differs from the one this patch was written from.', 1;

        SET @def = REPLACE(@def, @old, @new);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 THROW 50003, 'CREATE PROCEDURE not found.', 1;
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_RecalcPrPoCreatedQty: altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO

-- ── Part 2: the trigger ─────────────────────────────────────────────────────
CREATE OR ALTER TRIGGER PROJ.TR_PO_ReleasePrOnReject
ON PROJ.TBL_PURCHASE_ORDER
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Status) RETURN;

    -- PO lines whose PO has just moved into, or out of, Rejected
    DECLARE @Lines TABLE (PrLineId INT PRIMARY KEY);
    INSERT @Lines (PrLineId)
    SELECT DISTINCT pol.PrLineId
    FROM inserted i
    JOIN deleted d ON d.PoId = i.PoId
    JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = i.PoId AND pol.IsActive = 1 AND pol.PrLineId IS NOT NULL
    WHERE (i.Status = 'Rejected' AND ISNULL(d.Status, '') <> 'Rejected')
       OR (d.Status = 'Rejected' AND ISNULL(i.Status, '') <> 'Rejected');

    DECLARE @id INT;
    WHILE EXISTS (SELECT 1 FROM @Lines)
    BEGIN
        SELECT TOP 1 @id = PrLineId FROM @Lines ORDER BY PrLineId;
        DELETE FROM @Lines WHERE PrLineId = @id;
        EXEC PROJ.sp_RecalcPrPoCreatedQty @id, 'SYSTEM';
        EXEC PROJ.sp_RecalcPrStatus       @id, 'SYSTEM';
    END
END
GO

-- ── Part 3: repair what Rejected POs hold today ─────────────────────────────
DECLARE @Held TABLE (PrLineId INT PRIMARY KEY);
INSERT @Held (PrLineId)
SELECT DISTINCT pol.PrLineId
FROM PROJ.TBL_PURCHASE_ORDER po
JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1 AND pol.PrLineId IS NOT NULL
WHERE po.Status = 'Rejected';

DECLARE @n INT = (SELECT COUNT(*) FROM @Held), @id INT;
WHILE EXISTS (SELECT 1 FROM @Held)
BEGIN
    SELECT TOP 1 @id = PrLineId FROM @Held ORDER BY PrLineId;
    DELETE FROM @Held WHERE PrLineId = @id;
    EXEC PROJ.sp_RecalcPrPoCreatedQty @id, 'REJECTED_PO_REPAIR';
    EXEC PROJ.sp_RecalcPrStatus       @id, 'REJECTED_PO_REPAIR';
END
PRINT CONCAT('PR lines recalculated: ', @n);
GO
