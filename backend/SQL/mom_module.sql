-- ═══════════════════════════════════════════════════════════════════
-- MOM (Minutes of Meeting) Module
-- Run once against ERPDB. All objects under PROJ schema.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. TABLES
-- ───────────────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'PROJ.TBL_MOM') AND type = 'U')
CREATE TABLE PROJ.TBL_MOM (
    MomId           INT             NOT NULL IDENTITY(1,1)
                        CONSTRAINT PK_TBL_MOM PRIMARY KEY,
    JobId           VARCHAR(30)     NOT NULL,
    MeetingDate     DATE            NOT NULL,
    Title           NVARCHAR(200)   NOT NULL,
    Venue           NVARCHAR(200)   NULL,
    Attendees       NVARCHAR(MAX)   NULL,
    Summary         NVARCHAR(MAX)   NULL,
    Status          NVARCHAR(20)    NOT NULL DEFAULT 'Open',
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedBy       NVARCHAR(100)   NOT NULL,
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedBy      NVARCHAR(100)   NULL,
    ModifiedDate    DATETIME        NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'PROJ.TBL_MOM_TASK') AND type = 'U')
CREATE TABLE PROJ.TBL_MOM_TASK (
    MomTaskId       INT             NOT NULL IDENTITY(1,1)
                        CONSTRAINT PK_TBL_MOM_TASK PRIMARY KEY,
    MomId           INT             NOT NULL
                        CONSTRAINT FK_MOM_TASK_MOM REFERENCES PROJ.TBL_MOM(MomId),
    JobId           VARCHAR(30)     NOT NULL,
    Description     NVARCHAR(MAX)   NOT NULL,
    DueDate         DATE            NULL,
    Priority        NVARCHAR(20)    NOT NULL DEFAULT 'Medium',
    AssignedTo      NVARCHAR(100)   NOT NULL,
    Status          NVARCHAR(20)    NOT NULL DEFAULT 'Open',
    Remarks         NVARCHAR(MAX)   NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedBy       NVARCHAR(100)   NOT NULL,
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedBy      NVARCHAR(100)   NULL,
    ModifiedDate    DATETIME        NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'PROJ.TBL_MOM_TASK_LOG') AND type = 'U')
CREATE TABLE PROJ.TBL_MOM_TASK_LOG (
    MomTaskLogId    INT             NOT NULL IDENTITY(1,1)
                        CONSTRAINT PK_TBL_MOM_TASK_LOG PRIMARY KEY,
    MomTaskId       INT             NOT NULL
                        CONSTRAINT FK_MOM_TASK_LOG_TASK REFERENCES PROJ.TBL_MOM_TASK(MomTaskId),
    Action          NVARCHAR(50)    NOT NULL,
    FromUser        NVARCHAR(100)   NULL,
    ToUser          NVARCHAR(100)   NULL,
    OldStatus       NVARCHAR(20)    NULL,
    NewStatus       NVARCHAR(20)    NULL,
    Remarks         NVARCHAR(MAX)   NULL,
    ActionBy        NVARCHAR(100)   NOT NULL,
    ActionDate      DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- ───────────────────────────────────────────────────────────────────
-- 2. STORED PROCEDURES
-- ───────────────────────────────────────────────────────────────────

-- sp_GetMOMList — MOMs for a job with open/total task counts
CREATE OR ALTER PROCEDURE PROJ.sp_GetMOMList
    @JobId VARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        m.MomId,
        m.JobId,
        m.MeetingDate,
        m.Title,
        m.Venue,
        m.Attendees,
        m.Summary,
        m.Status,
        m.CreatedBy,
        m.CreatedDate,
        m.ModifiedBy,
        m.ModifiedDate,
        COUNT(t.MomTaskId)                                                    AS TotalTasks,
        SUM(CASE WHEN t.Status IN ('Open','InProgress') THEN 1 ELSE 0 END)   AS OpenTasks
    FROM PROJ.TBL_MOM m
    LEFT JOIN PROJ.TBL_MOM_TASK t ON t.MomId = m.MomId AND t.IsActive = 1
    WHERE m.JobId = @JobId AND m.IsActive = 1
    GROUP BY
        m.MomId, m.JobId, m.MeetingDate, m.Title, m.Venue,
        m.Attendees, m.Summary, m.Status,
        m.CreatedBy, m.CreatedDate, m.ModifiedBy, m.ModifiedDate
    ORDER BY m.MeetingDate DESC, m.MomId DESC;
END
GO

-- sp_GetMOM — single MOM header + tasks (two result sets)
CREATE OR ALTER PROCEDURE PROJ.sp_GetMOM
    @MomId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        m.MomId, m.JobId, m.MeetingDate, m.Title,
        m.Venue, m.Attendees, m.Summary, m.Status,
        m.CreatedBy, m.CreatedDate, m.ModifiedBy, m.ModifiedDate
    FROM PROJ.TBL_MOM m
    WHERE m.MomId = @MomId AND m.IsActive = 1;

    SELECT
        t.MomTaskId, t.MomId, t.JobId,
        t.Description, t.DueDate, t.Priority,
        t.AssignedTo, t.Status, t.Remarks,
        t.CreatedBy, t.CreatedDate
    FROM PROJ.TBL_MOM_TASK t
    WHERE t.MomId = @MomId AND t.IsActive = 1
    ORDER BY t.MomTaskId;
END
GO

-- sp_SetMOM — insert (MomId = 0) or update; returns MomId
CREATE OR ALTER PROCEDURE PROJ.sp_SetMOM
    @MomId          INT,
    @JobId          VARCHAR(30),
    @MeetingDate    DATE,
    @Title          NVARCHAR(200),
    @Venue          NVARCHAR(200)   = NULL,
    @Attendees      NVARCHAR(MAX)   = NULL,
    @Summary        NVARCHAR(MAX)   = NULL,
    @CreatedBy      NVARCHAR(100),
    @ModifiedBy     NVARCHAR(100)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @MomId = 0
    BEGIN
        INSERT INTO PROJ.TBL_MOM (JobId, MeetingDate, Title, Venue, Attendees, Summary, Status, IsActive, CreatedBy, CreatedDate)
        VALUES (@JobId, @MeetingDate, @Title, @Venue, @Attendees, @Summary, 'Open', 1, @CreatedBy, GETDATE());
        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        UPDATE PROJ.TBL_MOM
        SET MeetingDate  = @MeetingDate,
            Title        = @Title,
            Venue        = @Venue,
            Attendees    = @Attendees,
            Summary      = @Summary,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE MomId = @MomId;
        SELECT CAST(@MomId AS NVARCHAR(20));
    END
END
GO

-- sp_CloseMOM — set Status = 'Closed'
CREATE OR ALTER PROCEDURE PROJ.sp_CloseMOM
    @MomId      INT,
    @ModifiedBy NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE PROJ.TBL_MOM
    SET Status       = 'Closed',
        ModifiedBy   = @ModifiedBy,
        ModifiedDate = GETDATE()
    WHERE MomId = @MomId;
    SELECT CAST(@MomId AS NVARCHAR(20));
END
GO

-- sp_SetMOMTask — insert (MomTaskId = 0) or update; returns MomTaskId
CREATE OR ALTER PROCEDURE PROJ.sp_SetMOMTask
    @MomTaskId      INT,
    @MomId          INT,
    @JobId          VARCHAR(30),
    @Description    NVARCHAR(MAX),
    @DueDate        DATE            = NULL,
    @Priority       NVARCHAR(20)    = 'Medium',
    @AssignedTo     NVARCHAR(100),
    @Remarks        NVARCHAR(MAX)   = NULL,
    @CreatedBy      NVARCHAR(100),
    @ModifiedBy     NVARCHAR(100)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @MomTaskId = 0
    BEGIN
        INSERT INTO PROJ.TBL_MOM_TASK
            (MomId, JobId, Description, DueDate, Priority, AssignedTo, Status, Remarks, IsActive, CreatedBy, CreatedDate)
        VALUES
            (@MomId, @JobId, @Description, @DueDate, @Priority, @AssignedTo, 'Open', @Remarks, 1, @CreatedBy, GETDATE());

        SET @MomTaskId = CAST(SCOPE_IDENTITY() AS INT);

        INSERT INTO PROJ.TBL_MOM_TASK_LOG (MomTaskId, Action, ToUser, NewStatus, Remarks, ActionBy, ActionDate)
        VALUES (@MomTaskId, 'Assigned', @AssignedTo, 'Open', 'Task created', @CreatedBy, GETDATE());

        SELECT CAST(@MomTaskId AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        UPDATE PROJ.TBL_MOM_TASK
        SET Description  = @Description,
            DueDate      = @DueDate,
            Priority     = @Priority,
            AssignedTo   = @AssignedTo,
            Remarks      = @Remarks,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE MomTaskId = @MomTaskId;
        SELECT CAST(@MomTaskId AS NVARCHAR(20));
    END
END
GO

-- sp_SetMOMTaskStatus — change status and log it
CREATE OR ALTER PROCEDURE PROJ.sp_SetMOMTaskStatus
    @MomTaskId  INT,
    @NewStatus  NVARCHAR(20),
    @Remarks    NVARCHAR(MAX)   = NULL,
    @ActionBy   NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @OldStatus NVARCHAR(20);
    SELECT @OldStatus = Status FROM PROJ.TBL_MOM_TASK WHERE MomTaskId = @MomTaskId;

    UPDATE PROJ.TBL_MOM_TASK
    SET Status       = @NewStatus,
        ModifiedBy   = @ActionBy,
        ModifiedDate = GETDATE()
    WHERE MomTaskId = @MomTaskId;

    INSERT INTO PROJ.TBL_MOM_TASK_LOG (MomTaskId, Action, OldStatus, NewStatus, Remarks, ActionBy, ActionDate)
    VALUES (@MomTaskId, 'StatusChange', @OldStatus, @NewStatus, @Remarks, @ActionBy, GETDATE());

    SELECT CAST(@MomTaskId AS NVARCHAR(20));
END
GO

-- sp_ReassignMOMTask — reassign to another user and log it
CREATE OR ALTER PROCEDURE PROJ.sp_ReassignMOMTask
    @MomTaskId  INT,
    @ToUser     NVARCHAR(100),
    @Remarks    NVARCHAR(MAX)   = NULL,
    @ActionBy   NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @FromUser NVARCHAR(100), @OldStatus NVARCHAR(20);
    SELECT @FromUser = AssignedTo, @OldStatus = Status
    FROM PROJ.TBL_MOM_TASK WHERE MomTaskId = @MomTaskId;

    UPDATE PROJ.TBL_MOM_TASK
    SET AssignedTo   = @ToUser,
        Status       = 'Reassigned',
        ModifiedBy   = @ActionBy,
        ModifiedDate = GETDATE()
    WHERE MomTaskId = @MomTaskId;

    INSERT INTO PROJ.TBL_MOM_TASK_LOG (MomTaskId, Action, FromUser, ToUser, OldStatus, NewStatus, Remarks, ActionBy, ActionDate)
    VALUES (@MomTaskId, 'Reassigned', @FromUser, @ToUser, @OldStatus, 'Reassigned', @Remarks, @ActionBy, GETDATE());

    SELECT CAST(@MomTaskId AS NVARCHAR(20));
END
GO

-- sp_GetMOMTaskList — tasks by MOM, job, or engineer
CREATE OR ALTER PROCEDURE PROJ.sp_GetMOMTaskList
    @MomId      INT             = NULL,
    @JobId      VARCHAR(30)     = NULL,
    @AssignedTo NVARCHAR(100)   = NULL,
    @Status     NVARCHAR(20)    = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        t.MomTaskId,
        t.MomId,
        t.JobId,
        m.Title       AS MomTitle,
        m.MeetingDate,
        t.Description,
        t.DueDate,
        t.Priority,
        t.AssignedTo,
        t.Status,
        t.Remarks,
        t.CreatedBy,
        t.CreatedDate,
        t.ModifiedBy,
        t.ModifiedDate
    FROM PROJ.TBL_MOM_TASK t
    JOIN PROJ.TBL_MOM m ON m.MomId = t.MomId
    WHERE t.IsActive = 1
      AND (@MomId      IS NULL OR t.MomId      = @MomId)
      AND (@JobId      IS NULL OR t.JobId      = @JobId)
      AND (@AssignedTo IS NULL OR t.AssignedTo = @AssignedTo)
      AND (@Status     IS NULL OR t.Status     = @Status)
    ORDER BY
        CASE t.Priority
            WHEN 'Critical' THEN 1
            WHEN 'High'     THEN 2
            WHEN 'Medium'   THEN 3
            ELSE 4
        END,
        t.DueDate ASC,
        t.MomTaskId ASC;
END
GO

-- sp_GetMOMTaskLog — full audit trail for a task
CREATE OR ALTER PROCEDURE PROJ.sp_GetMOMTaskLog
    @MomTaskId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        l.MomTaskLogId,
        l.MomTaskId,
        l.Action,
        l.FromUser,
        l.ToUser,
        l.OldStatus,
        l.NewStatus,
        l.Remarks,
        l.ActionBy,
        l.ActionDate
    FROM PROJ.TBL_MOM_TASK_LOG l
    WHERE l.MomTaskId = @MomTaskId
    ORDER BY l.ActionDate DESC;
END
GO
