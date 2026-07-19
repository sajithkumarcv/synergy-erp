-- ============================================================================
-- Login brute-force protection: temporary account lockout
-- Re-runnable: safe to execute on every client database.
--
-- Objects:
--   proj.TBL_USERS.FailedAttempts / LastFailedAttempt / LockedUntil  new columns
--   proj.TBL_APP_SETTINGS  Login.MaxFailedAttempts, Login.LockoutMinutes
--   proj.sp_ValidateUser   now returns a Status column and counts failures
--
-- Status values returned by sp_ValidateUser:
--   OK           credentials valid; the user row follows on the same result set
--   INVALID      unknown username or wrong password
--   LOCKED       IsLocked=1 or IsActive=0 — a deliberate admin action, never auto-clears
--   LOCKED_TEMP  too many failed attempts; LockedUntil says when it clears
--
-- The temporary lock expires on its own. That is deliberate: reusing the
-- admin-only IsLocked flag here would let anyone who knows a username lock a
-- colleague out of the ERP permanently by guessing five bad passwords.
-- ============================================================================

-- ── 1. Lockout tracking columns ────────────────────────────────────────────
IF COL_LENGTH('proj.TBL_USERS', 'FailedAttempts') IS NULL
    ALTER TABLE proj.TBL_USERS
        ADD FailedAttempts INT NOT NULL
            CONSTRAINT DF_TBL_USERS_FailedAttempts DEFAULT (0);
GO

IF COL_LENGTH('proj.TBL_USERS', 'LastFailedAttempt') IS NULL
    ALTER TABLE proj.TBL_USERS ADD LastFailedAttempt DATETIME NULL;
GO

IF COL_LENGTH('proj.TBL_USERS', 'LockedUntil') IS NULL
    ALTER TABLE proj.TBL_USERS ADD LockedUntil DATETIME NULL;
GO

-- ── 2. Tunables (read by the proc on every call, so changes apply at once) ──
IF NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = 'Login.MaxFailedAttempts')
    INSERT proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES (N'Login.MaxFailedAttempts', N'5',
            N'Failed logins allowed before the account is temporarily locked', N'SYSTEM', GETDATE());
GO

IF NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = 'Login.LockoutMinutes')
    INSERT proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES (N'Login.LockoutMinutes', N'15',
            N'How long a temporary login lock lasts, in minutes', N'SYSTEM', GETDATE());
GO

-- ── 3. Validation + failure counting ───────────────────────────────────────
IF OBJECT_ID(N'proj.sp_ValidateUser') IS NOT NULL DROP PROCEDURE proj.sp_ValidateUser;
GO

CREATE PROCEDURE proj.sp_ValidateUser
    @Username NVARCHAR(100),
    @Password NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxAttempts INT =
        TRY_CONVERT(INT, (SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = 'Login.MaxFailedAttempts'));
    DECLARE @LockMinutes INT =
        TRY_CONVERT(INT, (SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = 'Login.LockoutMinutes'));

    SET @MaxAttempts = ISNULL(NULLIF(@MaxAttempts, 0), 5);
    SET @LockMinutes = ISNULL(NULLIF(@LockMinutes, 0), 15);

    DECLARE @UserId      INT,
            @IsActive    BIT,
            @IsLocked    BIT,
            @LockedUntil DATETIME,
            @LastFailed  DATETIME,
            @Attempts    INT,
            @Match       BIT;

    SELECT @UserId      = UserId,
           @IsActive    = IsActive,
           @IsLocked    = IsLocked,
           @LockedUntil = LockedUntil,
           @LastFailed  = LastFailedAttempt,
           @Attempts    = ISNULL(FailedAttempts, 0),
           @Match       = CASE WHEN PasswordHash = @Password THEN 1 ELSE 0 END
    FROM proj.TBL_USERS
    WHERE UserName = @Username;

    -- Unknown username: there is no row to count failures against.
    IF @UserId IS NULL
    BEGIN
        SELECT 'INVALID' AS Status;
        RETURN;
    END

    -- An admin lock (or deactivation) is deliberate and must not auto-clear.
    IF @IsActive = 0 OR @IsLocked = 1
    BEGIN
        SELECT 'LOCKED' AS Status;
        RETURN;
    END

    -- Temporary lock still running.
    IF @LockedUntil IS NOT NULL AND @LockedUntil > GETDATE()
    BEGIN
        SELECT 'LOCKED_TEMP' AS Status, @LockedUntil AS LockedUntil;
        RETURN;
    END

    -- Either the lock has served its time, or the last failure is older than the
    -- window. Both mean the user starts over with a full set of attempts, so a
    -- stray typo weeks ago never contributes to a lockout today.
    IF (@LockedUntil IS NOT NULL AND @LockedUntil <= GETDATE())
       OR (@LastFailed IS NOT NULL AND DATEDIFF(MINUTE, @LastFailed, GETDATE()) >= @LockMinutes)
        SET @Attempts = 0;

    IF @Match = 1
    BEGIN
        UPDATE proj.TBL_USERS
        SET LastLoginDate     = GETDATE(),
            FailedAttempts    = 0,
            LastFailedAttempt = NULL,
            LockedUntil       = NULL
        WHERE UserId = @UserId;

        SELECT 'OK'       AS Status,
               u.UserId,
               u.UserName AS Username,
               u.FullName,
               u.Email,
               u.Theme,
               ISNULL(r.RoleName, '') AS RoleName
        FROM proj.TBL_USERS u
        LEFT JOIN proj.TBL_USER_ROLES ur ON u.UserId = ur.UserId
        LEFT JOIN proj.TBL_ROLES      r  ON ur.RoleId = r.RoleId
        WHERE u.UserId = @UserId;
        RETURN;
    END

    -- Wrong password.
    SET @Attempts += 1;

    DECLARE @NewLock DATETIME =
        CASE WHEN @Attempts >= @MaxAttempts THEN DATEADD(MINUTE, @LockMinutes, GETDATE()) END;

    UPDATE proj.TBL_USERS
    SET FailedAttempts    = CASE WHEN @NewLock IS NULL THEN @Attempts ELSE 0 END,
        LastFailedAttempt = GETDATE(),
        LockedUntil       = @NewLock
    WHERE UserId = @UserId;

    IF @NewLock IS NOT NULL
        SELECT 'LOCKED_TEMP' AS Status, @NewLock AS LockedUntil;
    ELSE
        SELECT 'INVALID' AS Status, @Attempts AS FailedAttempts;
END
GO
