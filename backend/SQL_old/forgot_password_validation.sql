-- ============================================================================
-- Forgot-password: specific validation messages (replaces anti-enumeration
-- generic response — this is an internal ERP, enumeration is accepted).
--
-- The proc now looks the user up by USERNAME only and returns a Status column
-- the API maps to a message, in this exact order:
--   USER_NOT_FOUND  -> "The specified username does not exist."
--   EMAIL_INVALID   -> "Please enter a valid email address."
--                      (format is validated in the API and passed in as
--                       @EmailFormatValid so the ordering holds)
--   EMAIL_MISMATCH  -> "The email address does not match our records."
--   OK              -> token created; user row returned for the email send.
-- Re-runnable (CREATE OR ALTER).
-- ============================================================================

CREATE OR ALTER PROCEDURE proj.sp_CreatePasswordResetToken
    @Email            NVARCHAR(200),
    @UserName         NVARCHAR(100),
    @TokenHash        NVARCHAR(255),
    @ExpiresAt        DATETIME,
    @RequestedIp      NVARCHAR(50) = NULL,
    @EmailFormatValid BIT          = 1
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Username must exist and be active/unlocked
    DECLARE @UserId INT, @UserEmail NVARCHAR(100);
    SELECT @UserId = UserId, @UserEmail = Email
    FROM   proj.TBL_USERS
    WHERE  UserName = @UserName AND IsActive = 1 AND IsLocked = 0;

    IF @UserId IS NULL
    BEGIN
        SELECT 'USER_NOT_FOUND' AS Status;
        RETURN;
    END

    -- 2. Email format (validated by the API, passed in to preserve ordering)
    IF ISNULL(@EmailFormatValid, 0) = 0
    BEGIN
        SELECT 'EMAIL_INVALID' AS Status;
        RETURN;
    END

    -- 3. Email must match that username's email on record
    IF @UserEmail IS NULL OR LOWER(LTRIM(RTRIM(@UserEmail))) <> LOWER(LTRIM(RTRIM(@Email)))
    BEGIN
        SELECT 'EMAIL_MISMATCH' AS Status;
        RETURN;
    END

    -- 4. All valid -> invalidate outstanding tokens, create a new one
    UPDATE proj.TBL_PASSWORD_RESET
    SET    IsUsed = 1, UsedDate = GETDATE()
    WHERE  UserId = @UserId AND IsUsed = 0;

    INSERT INTO proj.TBL_PASSWORD_RESET (UserId, TokenHash, ExpiresAt, RequestedIp, CreatedDate)
    VALUES (@UserId, @TokenHash, @ExpiresAt, @RequestedIp, GETDATE());

    SELECT 'OK' AS Status, u.UserId, u.UserName, u.FullName, u.Email
    FROM   proj.TBL_USERS u
    WHERE  u.UserId = @UserId;
END
GO
