-- =====================================================================
-- 2026-09-08  PO: Expected Delivery cannot precede the PO date
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- Adds one guard to proj.sp_SetPO:
--     @DeliveryDate (the "Expected Delivery" field) must be >= @PoDate.
-- Both are optional, so the check only fires when BOTH are supplied.
--
-- WHY IT IS WRITTEN THIS WAY
-- sp_SetPO is ~8,700 characters. Pasting a full re-typed body risks losing
-- something already in it, so this script reads the LIVE definition, verifies
-- its anchor, injects the guard and re-executes it as an ALTER. Everything
-- else in the procedure is preserved byte for byte.
--
-- Idempotent: running it twice is a no-op.
-- Error number 50509 was verified unused in this procedure.
--
-- The procedure guards with THROW, which aborts the batch immediately, so the
-- RAISERROR-without-RETURN trap does not apply here.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DECLARE @def    NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('proj.sp_SetPO'));
DECLARE @anchor NVARCHAR(200) = N'THROW 50508, ''Please specify the payment terms.'', 1;';
DECLARE @guard  NVARCHAR(MAX) = N'

    -- Expected delivery can never precede the PO date. Both fields are
    -- optional, so this only applies when both are supplied.
    IF @PoDate IS NOT NULL AND @DeliveryDate IS NOT NULL AND @DeliveryDate < @PoDate
        THROW 50509, ''Expected delivery date cannot be earlier than the PO date.'', 1;';

IF @def IS NULL
BEGIN
    THROW 51000, 'proj.sp_SetPO not found.', 1;
END

IF CHARINDEX(N'@DeliveryDate < @PoDate', @def) > 0
BEGIN
    PRINT 'Already guarded - nothing to do.';
END
ELSE
BEGIN
    IF CHARINDEX(@anchor, @def) = 0
    BEGIN
        -- The anchor moved: stop rather than guess where to inject.
        THROW 51001, 'Anchor not found in sp_SetPO. Inspect the procedure and patch by hand.', 1;
    END

    SET @def = STUFF(@def,
                     CHARINDEX(@anchor, @def) + LEN(@anchor),
                     0,
                     @guard);

    -- Turn the CREATE into an ALTER, leaving the rest untouched.
    SET @def = STUFF(@def,
                     CHARINDEX(N'CREATE PROCEDURE', @def),
                     LEN(N'CREATE PROCEDURE'),
                     N'ALTER PROCEDURE');

    EXEC sp_executesql @def;
    PRINT 'Guard added to proj.sp_SetPO.';
END
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item   = 'sp_SetPO - delivery date >= PO date',
       Status = CASE WHEN CHARINDEX('@DeliveryDate < @PoDate',
                        ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SetPO')), '')) > 0
                     THEN 'OK' ELSE 'MISSING' END;
GO
