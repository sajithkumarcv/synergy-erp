SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO

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
           r.RoleName    LIKE N''%'' + @SearchText + N''%'' OR
           r.RoleCode    LIKE N''%'' + @SearchText + N''%'' OR
           r.Description LIKE N''%'' + @SearchText + N''%'')
      AND (@IsActive IS NULL OR r.IsActive = @IsActive)
    ORDER BY ' + @OrderBy + N'
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;';

    EXEC sp_executesql @SQL,
        N'@SearchText NVARCHAR(200), @IsActive BIT, @Offset INT, @PageSize INT',
        @SearchText, @IsActive, @Offset, @PageSize;
END
GO
PRINT 'sp_SearchRoles fixed.';
