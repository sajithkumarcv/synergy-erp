SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO

-- sp_SetRole: add @IsEngineerRole param
ALTER PROCEDURE proj.sp_SetRole
    @RoleId          INT            = 0,
    @RoleName        NVARCHAR(100),
    @RoleCode        NVARCHAR(50),
    @Description     NVARCHAR(500)  = NULL,
    @IsActive        BIT            = 1,
    @IsEngineerRole  BIT            = 0,
    @CreatedBy       NVARCHAR(50),
    @ModifiedBy      NVARCHAR(50)   = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM proj.TBL_ROLES WHERE RoleCode=@RoleCode AND RoleId<>@RoleId)
    BEGIN SELECT -1 AS RoleId, N'Role code already exists.' AS ErrorMessage; RETURN; END

    IF EXISTS (SELECT 1 FROM proj.TBL_ROLES WHERE RoleName=@RoleName AND RoleId<>@RoleId)
    BEGIN SELECT -2 AS RoleId, N'Role name already exists.' AS ErrorMessage; RETURN; END

    IF @RoleId = 0
    BEGIN
        INSERT INTO proj.TBL_ROLES
            (RoleName, RoleCode, Description, IsActive, IsEngineerRole, CreatedBy, CreatedDate)
        VALUES
            (@RoleName, @RoleCode, @Description, @IsActive, @IsEngineerRole, @CreatedBy, GETDATE());
        SELECT SCOPE_IDENTITY() AS RoleId, NULL AS ErrorMessage;
    END
    ELSE
    BEGIN
        UPDATE proj.TBL_ROLES SET
            RoleName        = @RoleName,
            RoleCode        = @RoleCode,
            Description     = @Description,
            IsActive        = @IsActive,
            IsEngineerRole  = @IsEngineerRole,
            ModifiedBy      = @ModifiedBy,
            ModifiedDate    = GETDATE()
        WHERE RoleId = @RoleId;
        SELECT @RoleId AS RoleId, NULL AS ErrorMessage;
    END
END
GO

-- sp_SearchRoles: include IsEngineerRole in SELECT
ALTER PROCEDURE proj.sp_SearchRoles
    @SearchText    NVARCHAR(200) = NULL,
    @IsActive      BIT           = NULL,
    @PageNumber    INT           = 1,
    @PageSize      INT           = 20,
    @SortColumn    NVARCHAR(50)  = 'RoleName',
    @SortDirection NVARCHAR(4)   = 'ASC'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    DECLARE @SQL NVARCHAR(MAX), @OrderBy NVARCHAR(200);

    SET @OrderBy = CASE
        WHEN @SortColumn = 'RoleCode'    THEN 'r.RoleCode'
        WHEN @SortColumn = 'CreatedDate' THEN 'r.CreatedDate'
        ELSE 'r.RoleName'
    END + ' ' + CASE WHEN UPPER(@SortDirection) = 'DESC' THEN 'DESC' ELSE 'ASC' END;

    SET @SQL = N'
    SELECT
        r.RoleId, r.RoleName, r.RoleCode, r.Description,
        r.IsActive, r.IsEngineerRole,
        r.CreatedBy, r.CreatedDate, r.ModifiedBy, r.ModifiedDate,
        (SELECT COUNT(*) FROM proj.TBL_USER_ROLES ur WHERE ur.RoleId = r.RoleId) AS UserCount,
        COUNT(*) OVER() AS TotalRows
    FROM proj.TBL_ROLES r
    WHERE (@SearchText IS NULL OR
           r.RoleName LIKE N''''%'''' + @SearchText + N''''%'''' OR
           r.RoleCode LIKE N''''%'''' + @SearchText + N''''%'''' OR
           r.Description LIKE N''''%'''' + @SearchText + N''''%'''')
      AND (@IsActive IS NULL OR r.IsActive = @IsActive)
    ORDER BY ' + @OrderBy + N'
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;';

    EXEC sp_executesql @SQL,
        N'@SearchText NVARCHAR(200), @IsActive BIT, @Offset INT, @PageSize INT',
        @SearchText, @IsActive, @Offset, @PageSize;
END
GO
PRINT 'Role SPs updated with IsEngineerRole.';
