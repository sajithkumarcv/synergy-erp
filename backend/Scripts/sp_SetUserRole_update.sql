SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO

ALTER PROCEDURE proj.sp_SetUserRole
    @UserId  INT,
    @RoleId  INT,
    @Action  NVARCHAR(10)   -- 'ASSIGN' or 'REMOVE'
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'ASSIGN'
    BEGIN
        -- Insert into TBL_USER_ROLES if not already assigned
        IF NOT EXISTS (SELECT 1 FROM proj.TBL_USER_ROLES WHERE UserId=@UserId AND RoleId=@RoleId)
            INSERT INTO proj.TBL_USER_ROLES (UserId, RoleId) VALUES (@UserId, @RoleId);

        -- ── Auto-sync TBL_ENGINEER ────────────────────────────────────
        -- If the assigned role is an engineer role, ensure the user has an engineer record.
        IF EXISTS (SELECT 1 FROM proj.TBL_ROLES WHERE RoleId=@RoleId AND IsEngineerRole=1)
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM proj.TBL_ENGINEER WHERE UserId=@UserId)
            BEGIN
                -- New engineer record: pull FullName + Email from TBL_USERS
                INSERT INTO proj.TBL_ENGINEER (EngineerName, TeamId, Email, UserId, IsActive, HourlyRate, CreatedBy, CreatedDate)
                SELECT FullName, NULL, Email, UserId, 1, 0, UserName, GETDATE()
                FROM proj.TBL_USERS WHERE UserId=@UserId;
            END
            ELSE
            BEGIN
                -- Re-activate if previously deactivated
                UPDATE proj.TBL_ENGINEER SET IsActive=1 WHERE UserId=@UserId AND IsActive=0;
            END
        END

        SELECT 1 AS Success, NULL AS ErrorMessage;
    END

    ELSE IF @Action = 'REMOVE'
    BEGIN
        DELETE FROM proj.TBL_USER_ROLES WHERE UserId=@UserId AND RoleId=@RoleId;

        -- ── Auto-sync TBL_ENGINEER ────────────────────────────────────
        -- If the user has no remaining engineer roles, deactivate their engineer record.
        IF EXISTS (SELECT 1 FROM proj.TBL_ROLES WHERE RoleId=@RoleId AND IsEngineerRole=1)
        BEGIN
            DECLARE @HasOtherEngineerRole BIT = 0;
            IF EXISTS (
                SELECT 1 FROM proj.TBL_USER_ROLES ur
                JOIN proj.TBL_ROLES r ON r.RoleId=ur.RoleId
                WHERE ur.UserId=@UserId AND r.IsEngineerRole=1
            )
                SET @HasOtherEngineerRole = 1;

            IF @HasOtherEngineerRole = 0
                UPDATE proj.TBL_ENGINEER SET IsActive=0 WHERE UserId=@UserId;
        END

        SELECT 1 AS Success, NULL AS ErrorMessage;
    END

    ELSE
        SELECT 0 AS Success, N'Invalid action.' AS ErrorMessage;
END
GO
