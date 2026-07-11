-- ============================================================================
-- Single sign-in session enforcement + login history
-- Re-runnable: safe to execute on every client database.
--
-- Objects:
--   proj.TBL_LOGIN_HISTORY        one row per login session
--   proj.sp_CreateLoginSession    called by Auth/login (blocks 2nd PC unless forced)
--   proj.sp_EndLoginSession       called by Auth/logout
--   proj.sp_ValidateLoginSession  called by SessionValidationMiddleware on every request
--   proj.sp_GetLoginHistory       admin report
--
-- NOTE: deploying this invalidates all existing JWTs (they carry no session
-- record), so every user re-logs-in once after the API is updated.
-- ============================================================================

-- ── 1. Login history table ─────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'proj.TBL_LOGIN_HISTORY') AND type = 'U')
BEGIN
    CREATE TABLE proj.TBL_LOGIN_HISTORY (
        Id           INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_TBL_LOGIN_HISTORY PRIMARY KEY,
        UserId       INT                NOT NULL,
        SessionId    UNIQUEIDENTIFIER   NOT NULL,
        LoginTime    DATETIME           NOT NULL CONSTRAINT DF_LOGIN_HISTORY_LoginTime DEFAULT (GETDATE()),
        LogoutTime   DATETIME           NULL,
        ExpiresAt    DATETIME           NOT NULL,
        IpAddress    NVARCHAR(64)       NULL,
        UserAgent    NVARCHAR(512)      NULL,
        -- Active -> LoggedOut | Expired | ForcedOut | IdleTimeout
        Status       NVARCHAR(20)       NOT NULL CONSTRAINT DF_LOGIN_HISTORY_Status DEFAULT ('Active'),
        LastActivity DATETIME           NOT NULL CONSTRAINT DF_LOGIN_HISTORY_LastActivity DEFAULT (GETDATE())
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_LOGIN_HISTORY_SessionId' AND object_id = OBJECT_ID(N'proj.TBL_LOGIN_HISTORY'))
    CREATE UNIQUE INDEX UX_LOGIN_HISTORY_SessionId ON proj.TBL_LOGIN_HISTORY (SessionId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LOGIN_HISTORY_User_Status' AND object_id = OBJECT_ID(N'proj.TBL_LOGIN_HISTORY'))
    CREATE INDEX IX_LOGIN_HISTORY_User_Status ON proj.TBL_LOGIN_HISTORY (UserId, Status);
GO

-- ── 2. Create session (single-PC enforcement) ──────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_CreateLoginSession
    @UserId             INT,
    @SessionId          UNIQUEIDENTIFIER,
    @IpAddress          NVARCHAR(64)  = NULL,
    @UserAgent          NVARCHAR(512) = NULL,
    @ExpiryMinutes      INT           = 480,
    @Force              BIT           = 0,
    @IdleTimeoutMinutes INT           = 60      -- 0 = idle timeout disabled
AS
BEGIN
    SET NOCOUNT ON;

    -- Close stale sessions first so a dead session never blocks a login.
    UPDATE proj.TBL_LOGIN_HISTORY
    SET    Status = 'Expired', LogoutTime = ExpiresAt
    WHERE  Status = 'Active' AND ExpiresAt < GETDATE();

    IF @IdleTimeoutMinutes > 0
        UPDATE proj.TBL_LOGIN_HISTORY
        SET    Status = 'IdleTimeout',
               LogoutTime = DATEADD(MINUTE, @IdleTimeoutMinutes, LastActivity)
        WHERE  Status = 'Active'
          AND  LastActivity < DATEADD(MINUTE, -@IdleTimeoutMinutes, GETDATE());

    BEGIN TRANSACTION;

    -- Lock the user's active session row(s) so two simultaneous logins
    -- can't both slip past the check.
    DECLARE @ActiveSince DATETIME, @ActiveIp NVARCHAR(64);
    SELECT TOP (1) @ActiveSince = LoginTime, @ActiveIp = IpAddress
    FROM   proj.TBL_LOGIN_HISTORY WITH (UPDLOCK, HOLDLOCK)
    WHERE  UserId = @UserId AND Status = 'Active'
    ORDER  BY LoginTime DESC;

    IF @ActiveSince IS NOT NULL AND @Force = 0
    BEGIN
        COMMIT TRANSACTION;
        SELECT CAST(1 AS BIT) AS Blocked, @ActiveSince AS ActiveSince, @ActiveIp AS ActiveIp;
        RETURN;
    END

    IF @ActiveSince IS NOT NULL AND @Force = 1
        UPDATE proj.TBL_LOGIN_HISTORY
        SET    Status = 'ForcedOut', LogoutTime = GETDATE()
        WHERE  UserId = @UserId AND Status = 'Active';

    INSERT INTO proj.TBL_LOGIN_HISTORY
        (UserId, SessionId, LoginTime, ExpiresAt, IpAddress, UserAgent, Status, LastActivity)
    VALUES
        (@UserId, @SessionId, GETDATE(), DATEADD(MINUTE, @ExpiryMinutes, GETDATE()),
         @IpAddress, @UserAgent, 'Active', GETDATE());

    COMMIT TRANSACTION;

    SELECT CAST(0 AS BIT) AS Blocked, CAST(NULL AS DATETIME) AS ActiveSince, CAST(NULL AS NVARCHAR(64)) AS ActiveIp;
END
GO

-- ── 3. End session (logout / forced) ───────────────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_EndLoginSession
    @SessionId UNIQUEIDENTIFIER,
    @Status    NVARCHAR(20) = 'LoggedOut'
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE proj.TBL_LOGIN_HISTORY
    SET    Status = @Status, LogoutTime = GETDATE()
    WHERE  SessionId = @SessionId AND Status = 'Active';
END
GO

-- ── 4. Validate session (called on every authenticated request) ────────────
CREATE OR ALTER PROCEDURE proj.sp_ValidateLoginSession
    @SessionId          UNIQUEIDENTIFIER,
    @Touch              BIT = 1,   -- 0 = heartbeat ping with no real user activity
    @IdleTimeoutMinutes INT = 60   -- 0 = idle timeout disabled
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Status NVARCHAR(20), @ExpiresAt DATETIME, @LastActivity DATETIME;

    SELECT @Status = Status, @ExpiresAt = ExpiresAt, @LastActivity = LastActivity
    FROM   proj.TBL_LOGIN_HISTORY
    WHERE  SessionId = @SessionId;

    IF @Status IS NULL
    BEGIN
        SELECT CAST(0 AS BIT) AS IsValid, N'NotFound' AS Reason;
        RETURN;
    END

    -- Expire / idle-close if due
    IF @Status = 'Active' AND @ExpiresAt < GETDATE()
    BEGIN
        UPDATE proj.TBL_LOGIN_HISTORY
        SET    Status = 'Expired', LogoutTime = ExpiresAt
        WHERE  SessionId = @SessionId AND Status = 'Active';
        SET @Status = 'Expired';
    END
    ELSE IF @Status = 'Active' AND @IdleTimeoutMinutes > 0
         AND @LastActivity < DATEADD(MINUTE, -@IdleTimeoutMinutes, GETDATE())
    BEGIN
        UPDATE proj.TBL_LOGIN_HISTORY
        SET    Status = 'IdleTimeout',
               LogoutTime = DATEADD(MINUTE, @IdleTimeoutMinutes, LastActivity)
        WHERE  SessionId = @SessionId AND Status = 'Active';
        SET @Status = 'IdleTimeout';
    END

    IF @Status = 'Active'
    BEGIN
        IF @Touch = 1
            UPDATE proj.TBL_LOGIN_HISTORY
            SET    LastActivity = GETDATE()
            WHERE  SessionId = @SessionId;

        SELECT CAST(1 AS BIT) AS IsValid, N'Active' AS Reason;
    END
    ELSE
        SELECT CAST(0 AS BIT) AS IsValid, @Status AS Reason;
END
GO

-- ── 5. Login history report (admin) ────────────────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_GetLoginHistory
    @UserId INT = NULL,
    @Top    INT = 200
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@Top)
           h.Id, h.UserId, u.UserName, u.FullName,
           h.LoginTime, h.LogoutTime, h.ExpiresAt,
           h.IpAddress, h.UserAgent, h.Status, h.LastActivity
    FROM   proj.TBL_LOGIN_HISTORY h
    JOIN   proj.TBL_USERS u ON u.UserId = h.UserId
    WHERE  (@UserId IS NULL OR h.UserId = @UserId)
    ORDER  BY h.LoginTime DESC;
END
GO
