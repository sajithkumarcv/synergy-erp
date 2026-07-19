-- ============================================================
-- Add DisplayName to TBL_COMPANY + update both SPs
-- Short/app name shown in header  (e.g. "SYNERGY")
-- Full CompanyName still used on PO / Invoice prints
-- ============================================================

-- 1. Add column (safe — guarded by IF NOT EXISTS)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'proj'
      AND TABLE_NAME   = 'TBL_COMPANY'
      AND COLUMN_NAME  = 'DisplayName'
)
BEGIN
    ALTER TABLE proj.TBL_COMPANY
        ADD DisplayName NVARCHAR(150) NULL;
    PRINT 'Column DisplayName added to proj.TBL_COMPANY';
END
ELSE
BEGIN
    PRINT 'Column DisplayName already exists — skipped';
END
GO

-- 2. Update sp_GetOwnerCompany  — add DisplayName to result set 1
CREATE OR ALTER PROCEDURE proj.sp_GetOwnerCompany
AS
BEGIN
    SET NOCOUNT ON;

    -- Result set 1: Owner company details
    SELECT
        c.CompanyId,
        c.CompanyName,
        c.DisplayName,
        c.CompanyCode,
        c.TRN,
        c.Phone,
        c.Fax,
        c.Email,
        c.Website,
        c.LogoPath,
        c.PrintNote
    FROM proj.TBL_COMPANY c
    WHERE c.IsOwner = 1
      AND c.IsActive = 1;

    -- Result set 2: Active addresses (primary first)
    SELECT
        a.AddressId,
        a.CompanyId,
        a.AddressLine1,
        a.AddressLine2,
        a.City,
        a.State,
        a.Country,
        a.IsPrimary,
        a.SortOrder
    FROM proj.TBL_COMPANY_BRANCH_ADDRESS a
    INNER JOIN proj.TBL_COMPANY c ON c.CompanyId = a.CompanyId
    WHERE c.IsOwner  = 1
      AND c.IsActive = 1
      AND a.IsActive = 1
    ORDER BY a.IsPrimary DESC, a.SortOrder;

    -- Result set 3: Active bank accounts
    SELECT
        b.BankId,
        b.CompanyId,
        b.BankName,
        b.Beneficiary,
        b.AccountNo,
        b.IBAN,
        b.Swift,
        b.Currency,
        b.BranchAddress,
        b.IsPrimary,
        b.SortOrder
    FROM proj.TBL_COMPANY_BRANCH_BANK b
    INNER JOIN proj.TBL_COMPANY c ON c.CompanyId = b.CompanyId
    WHERE c.IsOwner  = 1
      AND c.IsActive = 1
      AND b.IsActive = 1
    ORDER BY b.SortOrder;
END;
GO

-- 3. Update sp_UpdateOwnerCompany  — add @DisplayName parameter
CREATE OR ALTER PROCEDURE proj.sp_UpdateOwnerCompany
    @CompanyName NVARCHAR(200),
    @DisplayName NVARCHAR(150) = NULL,
    @CompanyCode NVARCHAR(50),
    @TRN         NVARCHAR(50),
    @Phone       NVARCHAR(50),
    @Fax         NVARCHAR(50),
    @Email       NVARCHAR(200),
    @Website     NVARCHAR(200),
    @PrintNote   NVARCHAR(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE proj.TBL_COMPANY
    SET CompanyName = @CompanyName,
        DisplayName = @DisplayName,
        CompanyCode = @CompanyCode,
        TRN         = @TRN,
        Phone       = @Phone,
        Fax         = @Fax,
        Email       = @Email,
        Website     = @Website,
        PrintNote   = @PrintNote
    WHERE IsOwner = 1;
END
GO

PRINT 'Migration complete.';
GO
