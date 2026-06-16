SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO

-- List: include UserId + UserName (from TBL_USERS) so admin can see linked user
ALTER PROCEDURE proj.sp_AdminEngineerList AS
BEGIN
    SET NOCOUNT ON;
    SELECT e.EngineerId, e.EngineerName, e.TeamId,
           ISNULL(t.TeamName,'') AS TeamName,
           e.Email, e.HourlyRate, e.IsActive,
           e.UserId,
           ISNULL(u.FullName, u.UserName) AS LinkedUser
    FROM proj.TBL_ENGINEER e
    LEFT JOIN proj.TBL_TEAM   t ON t.TeamId  = e.TeamId
    LEFT JOIN proj.TBL_USERS  u ON u.UserId  = e.UserId
    ORDER BY e.EngineerName;
END
GO

-- Save: accept UserId so manually-created engineers can also be linked
ALTER PROCEDURE proj.sp_AdminEngineerSave
    @EngineerId   INT           = 0,
    @EngineerName NVARCHAR(200),
    @TeamId       INT           = NULL,
    @Email        NVARCHAR(200) = NULL,
    @HourlyRate   DECIMAL(18,2) = 0,
    @IsActive     BIT           = 1,
    @UserId       INT           = NULL,
    @ActionBy     NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @EngineerId = 0
        INSERT INTO proj.TBL_ENGINEER
            (EngineerName, TeamId, Email, HourlyRate, IsActive, UserId, CreatedBy, CreatedDate)
        VALUES
            (@EngineerName, @TeamId, @Email, @HourlyRate, @IsActive, @UserId, @ActionBy, GETDATE());
    ELSE
        UPDATE proj.TBL_ENGINEER
        SET EngineerName = @EngineerName,
            TeamId       = @TeamId,
            Email        = @Email,
            HourlyRate   = @HourlyRate,
            IsActive     = @IsActive,
            UserId       = @UserId,
            ModifiedBy   = @ActionBy,
            ModifiedDate = GETDATE()
        WHERE EngineerId = @EngineerId;

    SELECT ISNULL(SCOPE_IDENTITY(), @EngineerId) AS NewId;
END
GO
PRINT 'Engineer SPs updated.';
