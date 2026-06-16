SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO

ALTER PROCEDURE proj.sp_SetUserNew
    @UserId       INT            = 0,
    @UserCode     NVARCHAR(20)   = NULL,
    @UserName     NVARCHAR(100),
    @FullName     NVARCHAR(150)  = NULL,
    @Email        NVARCHAR(100)  = NULL,
    @Mobile       NVARCHAR(150)  = NULL,
    @IsActive     BIT            = 1,
    @IsLocked     BIT            = 0,
    @PasswordHash NVARCHAR(255)  = NULL,
    @CreatedBy    NVARCHAR(50),
    @ModifiedBy   NVARCHAR(50)   = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Duplicate checks ──────────────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM proj.TBL_USERS WHERE UserName=@UserName AND UserId<>@UserId)
    BEGIN SELECT -1 AS UserId, N'Username already exists.' AS ErrorMessage; RETURN; END

    IF @UserCode IS NOT NULL AND EXISTS (
        SELECT 1 FROM proj.TBL_USERS WHERE UserCode=@UserCode AND UserId<>@UserId)
    BEGIN SELECT -2 AS UserId, N'User code already exists.' AS ErrorMessage; RETURN; END

    -- ── INSERT new user ───────────────────────────────────────────────────────
    IF @UserId = 0
    BEGIN
        INSERT INTO proj.TBL_USERS
            (UserCode, UserName, PasswordHash, FullName, Email, Mobile,
             IsActive, IsLocked, CreatedBy, CreatedDate)
        VALUES
            (@UserCode, @UserName, ISNULL(@PasswordHash,''), @FullName, @Email, @Mobile,
             @IsActive, @IsLocked, @CreatedBy, GETDATE());

        DECLARE @NewUserId INT = SCOPE_IDENTITY();

        -- Auto-sync TBL_ENGINEER: if the user already has an engineer role assigned,
        -- create the engineer record (e.g. role assigned before user was fully saved)
        IF EXISTS (
            SELECT 1 FROM proj.TBL_USER_ROLES ur
            JOIN   proj.TBL_ROLES r ON r.RoleId=ur.RoleId
            WHERE  ur.UserId=@NewUserId AND r.IsEngineerRole=1
        )
        AND NOT EXISTS (SELECT 1 FROM proj.TBL_ENGINEER WHERE UserId=@NewUserId)
        BEGIN
            INSERT INTO proj.TBL_ENGINEER
                (EngineerName, TeamId, Email, UserId, IsActive, HourlyRate, CreatedBy, CreatedDate)
            VALUES
                (ISNULL(@FullName, @UserName), NULL, @Email, @NewUserId, @IsActive, 0, @CreatedBy, GETDATE());
        END

        SELECT @NewUserId AS UserId, NULL AS ErrorMessage;
    END

    -- ── UPDATE existing user ──────────────────────────────────────────────────
    ELSE
    BEGIN
        UPDATE proj.TBL_USERS SET
            UserCode     = @UserCode,
            UserName     = @UserName,
            FullName     = @FullName,
            Email        = @Email,
            Mobile       = @Mobile,
            IsActive     = @IsActive,
            IsLocked     = @IsLocked,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE UserId = @UserId;

        -- Sync TBL_ENGINEER: update name + email + active status if linked
        UPDATE proj.TBL_ENGINEER SET
            EngineerName = ISNULL(@FullName, @UserName),
            Email        = @Email,
            IsActive     = @IsActive,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE UserId = @UserId;

        SELECT @UserId AS UserId, NULL AS ErrorMessage;
    END
END
GO
PRINT 'sp_SetUserNew updated with TBL_ENGINEER sync.';
