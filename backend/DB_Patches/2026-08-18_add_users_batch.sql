/* ============================================================================
   Add 13 users

   Creates the users below through the application's own proc, proj.sp_SetUserNew,
   so its duplicate-name / duplicate-code checks apply exactly as they would from
   the User Management screen. Re-runnable: a user whose UserName already exists
   is skipped, not duplicated.

   PASSWORD = THE USER'S OWN FIRST NAME, lower case (as requested).
   Everyone should change it at first login.

   Hash format matches the app's Sha256Hex():
       Convert.ToHexString(SHA256(Encoding.UTF8.GetBytes(pwd))).ToLower()
   In T-SQL that is HASHBYTES over a **VARCHAR** value, lower-cased.
       !!! CONVERT(NVARCHAR, ...) SILENTLY PRODUCES A DIFFERENT HASH !!!
       NVARCHAR hashes UTF-16 bytes, so the user simply cannot log in.
   Verified against a known row: SHA2_256 of VARCHAR 'admin' reproduces the
   existing hash 8c6976e5...a918 exactly; the NVARCHAR form does not.

   BEFORE RUNNING
   1. Set @@TARGET below to confirm you are in the intended database. This is
      written for SYNERGYINDIA (the restored live copy). Production is
      SYNERPINDIA on SYN-SRV-01 - run it there only when you mean to.
   2. Fill in RoleId for each user (list printed below, or SELECT RoleId,
      RoleName FROM PROJ.TBL_ROLES). A user with no role can log in but sees
      no menus. Rows left NULL are created WITHOUT a role and reported at the end.
   3. Emails are NULL. Set real addresses if these users must receive approval
      or alert mail - the existing rows all share one test address, which is
      deliberately not copied here.

   KNOWN GAP - engineer roles: sp_SetUserNew only creates the TBL_ENGINEER
   record when the role is already attached, which cannot be true for a brand
   new user. So for ENGINEER (8), SR.ENGINEER (9), PROJ.MANAGER (11),
   SR.PROJ.MANAGER (12) or DEPARTMENT HEAD (1010), no engineer record is
   created here. Add those from the UI, or insert into TBL_ENGINEER separately.
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* -- Guard: refuse to run against the wrong database ---------------------- */
DECLARE @ExpectedDb SYSNAME = N'SYNERGYINDIA';   -- change deliberately for prod
IF DB_NAME() <> @ExpectedDb
BEGIN
    RAISERROR('Wrong database: connected to %s but this script expects %s. Nothing was changed.',
              16, 1, @@SERVERNAME, @ExpectedDb);
    RETURN;
END

DECLARE @CreatedBy NVARCHAR(50) = N'SA';

/* -- Roles available (for filling RoleId below) ---------------------------
   1     ADMIN                 4     PROCUREMENT OFFICER   5     FINANCE MANAGER
   8     ENGINEER *            9     SR.ENGINEER *         11    PROJ.MANAGER *
   12    SR.PROJ.MANAGER *     13    FINANCE OFFICER       14    ADMIN CORDINATOR
   1010  DEPARTMENT HEAD *     1011  Procurement Manager   1012  Store
   (* = engineer role, see the gap noted above)
   ------------------------------------------------------------------------ */

DECLARE @Seed TABLE (
    Seq       INT IDENTITY(1,1),
    FullName  NVARCHAR(300),
    UserName  NVARCHAR(200),
    Password  VARCHAR(100),      -- VARCHAR on purpose: see hash note above
    RoleId    INT NULL           -- <<< FILL THESE IN
);

INSERT INTO @Seed (FullName, UserName, Password, RoleId) VALUES
    (N'Saad',            N'saad',            'saad',       NULL),
    (N'Naved',           N'naved',           'naved',      NULL),
    (N'Satya',           N'satya',           'satya',      NULL),
    (N'Neema',           N'neema',           'neema',      NULL),
    (N'Pawan',           N'pawan',           'pawan',      NULL),
    (N'Rushikesh',       N'rushikesh',       'rushikesh',  NULL),
    (N'Praveen',         N'praveen',         'praveen',    NULL),
    (N'Siju Nagrajan',   N'siju.nagrajan',   'siju',       NULL),
    (N'Vaishak',         N'vaishak',         'vaishak',    NULL),
    (N'Banjimin',        N'banjimin',        'banjimin',   NULL),
    (N'Valar',           N'valar',           'valar',      NULL),
    (N'Mohnish',         N'mohnish',         'mohnish',    NULL),
    (N'Harsha',          N'harsha',          'harsha',     NULL);

/* -- Next UserCode in the existing SYN-nnn series -------------------------- */
DECLARE @NextSeq INT =
    ISNULL((SELECT MAX(TRY_CAST(REPLACE(UserCode, 'SYN-', '') AS INT))
            FROM PROJ.TBL_USERS WHERE UserCode LIKE 'SYN-%'), 0) + 1;

DECLARE @Results TABLE (UserName NVARCHAR(200), UserCode NVARCHAR(40),
                        UserId INT, RoleId INT NULL, Note NVARCHAR(200));

DECLARE @i INT = 1, @n INT = (SELECT COUNT(*) FROM @Seed);
DECLARE @FullName NVARCHAR(300), @UserName NVARCHAR(200), @Pwd VARCHAR(100), @RoleId INT;
DECLARE @UserCode NVARCHAR(40), @Hash NVARCHAR(510);
DECLARE @SpResult TABLE (UserId INT, ErrorMessage NVARCHAR(400));
DECLARE @NewUserId INT, @ErrMsg NVARCHAR(400);

BEGIN TRAN;

WHILE @i <= @n
BEGIN
    SELECT @FullName = FullName, @UserName = UserName, @Pwd = Password, @RoleId = RoleId
    FROM @Seed WHERE Seq = @i;

    IF EXISTS (SELECT 1 FROM PROJ.TBL_USERS WHERE UserName = @UserName)
    BEGIN
        INSERT INTO @Results
        SELECT @UserName, UserCode, UserId, NULL, N'SKIPPED - username already exists'
        FROM PROJ.TBL_USERS WHERE UserName = @UserName;
        SET @i += 1;
        CONTINUE;
    END

    SET @UserCode = 'SYN-' + RIGHT('000' + CAST(@NextSeq AS VARCHAR(10)), 3);
    SET @Hash = LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', @Pwd), 2));

    DELETE FROM @SpResult;
    INSERT INTO @SpResult (UserId, ErrorMessage)
    EXEC PROJ.sp_SetUserNew
         @UserId       = 0,
         @UserCode     = @UserCode,
         @UserName     = @UserName,
         @FullName     = @FullName,
         @Email        = NULL,
         @Mobile       = NULL,
         @IsActive     = 1,
         @IsLocked     = 0,
         @PasswordHash = @Hash,
         @CreatedBy    = @CreatedBy,
         @ModifiedBy   = NULL;

    SELECT TOP 1 @NewUserId = UserId, @ErrMsg = ErrorMessage FROM @SpResult;

    IF @NewUserId IS NULL OR @NewUserId <= 0
    BEGIN
        INSERT INTO @Results VALUES (@UserName, @UserCode, @NewUserId, NULL,
                                     N'FAILED - ' + ISNULL(@ErrMsg, N'sp_SetUserNew returned no id'));
    END
    ELSE
    BEGIN
        IF @RoleId IS NOT NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLES WHERE RoleId = @RoleId)
            BEGIN
                INSERT INTO @Results VALUES (@UserName, @UserCode, @NewUserId, @RoleId,
                                             N'CREATED - but RoleId does not exist, no role assigned');
            END
            ELSE
            BEGIN
                INSERT INTO PROJ.TBL_USER_ROLES (UserId, RoleId, CreatedBy, CreatedDate)
                VALUES (@NewUserId, @RoleId, @CreatedBy, GETDATE());
                INSERT INTO @Results VALUES (@UserName, @UserCode, @NewUserId, @RoleId, N'CREATED');
            END
        END
        ELSE
            INSERT INTO @Results VALUES (@UserName, @UserCode, @NewUserId, NULL,
                                         N'CREATED - NO ROLE, user will see no menus');

        SET @NextSeq += 1;
    END

    SET @i += 1;
    SET @NewUserId = NULL; SET @ErrMsg = NULL;
END

/* -- Review before committing --------------------------------------------- */
SELECT r.UserName, r.UserCode, r.UserId, r.RoleId, ro.RoleName, r.Note,
       s.Password AS PlainPassword
FROM @Results r
LEFT JOIN @Seed s          ON s.UserName = r.UserName
LEFT JOIN PROJ.TBL_ROLES ro ON ro.RoleId = r.RoleId
ORDER BY r.UserName;

SELECT COUNT(*) AS Created FROM @Results WHERE Note LIKE 'CREATED%';
SELECT COUNT(*) AS Skipped FROM @Results WHERE Note LIKE 'SKIPPED%';
SELECT COUNT(*) AS Failed  FROM @Results WHERE Note LIKE 'FAILED%';

COMMIT TRAN;      -- change to ROLLBACK TRAN for a dry run

/* -- Verify the hashes really match the app's format -----------------------
   Every row must come back Match = 1:

   SELECT u.UserName,
          CASE WHEN u.PasswordHash =
               LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256',
                     CONVERT(VARCHAR(100), LEFT(u.UserName, CHARINDEX('.', u.UserName + '.') - 1))), 2))
               THEN 1 ELSE 0 END AS Match
   FROM PROJ.TBL_USERS u
   WHERE u.UserName IN ('saad','naved','satya','neema','pawan','rushikesh','praveen',
                        'siju.nagrajan','vaishak','banjimin','valar','mohnish','harsha');
   -------------------------------------------------------------------------- */
