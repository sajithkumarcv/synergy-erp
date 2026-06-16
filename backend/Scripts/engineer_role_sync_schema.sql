SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
SET NOCOUNT ON
GO

-- 1. Add IsEngineerRole flag to TBL_ROLES
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TBL_ROLES' AND COLUMN_NAME='IsEngineerRole')
    ALTER TABLE proj.TBL_ROLES ADD IsEngineerRole BIT NOT NULL DEFAULT 0;
GO

-- 2. Mark ENGINEER and SR.ENGINEER roles as engineer roles
UPDATE proj.TBL_ROLES SET IsEngineerRole = 1 WHERE RoleCode IN ('ENG-L1','ENG-L2');
PRINT CAST(@@ROWCOUNT AS varchar) + ' role(s) marked as IsEngineerRole=1';
GO

-- 3. Add UserId link to TBL_ENGINEER (nullable — manual entries won't have one)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TBL_ENGINEER' AND COLUMN_NAME='UserId')
    ALTER TABLE proj.TBL_ENGINEER ADD UserId INT NULL;
GO

-- 4. Make TeamId nullable — auto-created engineers have no team until admin assigns
ALTER TABLE proj.TBL_ENGINEER ALTER COLUMN TeamId INT NULL;
PRINT 'Schema changes complete.';
GO
