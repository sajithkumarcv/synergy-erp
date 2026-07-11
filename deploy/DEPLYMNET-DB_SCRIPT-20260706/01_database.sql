-- =====================================================================
-- 01_database.sql — ERP base installation, level 1
-- Creates: database, SQL login + user, schema [proj], permissions.
--
-- HOW TO RUN (SSMS):
--   1. Connect as a sysadmin (sa or Windows admin).
--   2. Menu: Query > SQLCMD Mode  (must be ON for :setvar to work).
--   3. Edit the three :setvar values below for the client.
--   4. Execute. Then run 02, 03, 04, 05 in order (those don't need SQLCMD mode,
--      but you must select the new database in the toolbar dropdown first!).
-- =====================================================================

:setvar DBName      "CLIENT_ERP"
:setvar AppLogin    "proj"
:setvar AppPassword "CHANGE_ME_StrongPassword!"

USE [master];
GO

-- 1. Database
IF DB_ID(N'$(DBName)') IS NULL
BEGIN
    CREATE DATABASE [$(DBName)];
END
GO

ALTER DATABASE [$(DBName)] SET RECOVERY FULL;
GO

-- 2. SQL login (server level)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(AppLogin)')
BEGIN
    CREATE LOGIN [$(AppLogin)] WITH PASSWORD = N'$(AppPassword)',
        DEFAULT_DATABASE = [$(DBName)],
        CHECK_EXPIRATION = OFF, CHECK_POLICY = ON;
END
GO

USE [$(DBName)];
GO

-- 3. Database user + schema
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(AppLogin)')
BEGIN
    CREATE USER [$(AppLogin)] FOR LOGIN [$(AppLogin)];
END
GO

IF SCHEMA_ID(N'proj') IS NULL
    EXEC (N'CREATE SCHEMA [proj] AUTHORIZATION [dbo]');
GO

-- 4. Permissions for the application user:
--    full data access + execute on the proj schema (app uses stored procedures only)
ALTER ROLE db_datareader ADD MEMBER [$(AppLogin)];
ALTER ROLE db_datawriter ADD MEMBER [$(AppLogin)];
GRANT EXECUTE ON SCHEMA::[proj] TO [$(AppLogin)];
GRANT VIEW DEFINITION ON SCHEMA::[proj] TO [$(AppLogin)];
GO

PRINT 'Level 1 complete: database $(DBName), login $(AppLogin), schema proj.';
PRINT 'NEXT: switch the query window to database [$(DBName)] and run 02_tables.sql';
GO
