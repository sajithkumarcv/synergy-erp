-- 2026-10-28h: once an employee is created, only the NAME and ACTIVE can be changed.
-- sp_SaveEmployee refuses a change of employee code, type (COMPANY <-> OUTSOURCED) or supplier.
-- A new employee (EmployeeId 0) is unaffected. Existing data untouched. Idempotent. All or nothing.
-- The block is located by an ASCII marker that must occur exactly once in the live procedure.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @tag    NVARCHAR(100) = N'-- 2026-10-28h employee lock';
    DECLARE @proc   SYSNAME       = N'sp_SaveEmployee';
    DECLARE @marker NVARCHAR(200) = N'UPDATE proj.TBL_EMPLOYEE';
    DECLARE @block  NVARCHAR(MAX) = N'
        -- 2026-10-28h employee lock
        IF EXISTS (SELECT 1 FROM proj.TBL_EMPLOYEE WHERE EmployeeId = @EmployeeId
                   AND (EmpCode <> @EmpCode OR EmpType <> @EmpType OR ISNULL(SupplierId, 0) <> ISNULL(@SupplierId, 0)))
        BEGIN SELECT -1 AS EmployeeId, ''Only the employee name and Active can be changed. The employee code, type and supplier cannot be changed once the employee is created.'' AS Message; RETURN; END

        ';
    DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.' + @proc));
    DECLARE @cpos INT, @msg NVARCHAR(400);

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

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
