-- ============================================================
-- Company Address & Bank Account CRUD stored procedures
-- ============================================================

-- sp_SetCompanyAddress  (insert / update)
CREATE OR ALTER PROCEDURE proj.sp_SetCompanyAddress
    @AddressId    INT           = NULL,
    @CompanyId    INT,
    @AddressLine1 NVARCHAR(200) = NULL,
    @AddressLine2 NVARCHAR(200) = NULL,
    @City         NVARCHAR(100) = NULL,
    @State        NVARCHAR(100) = NULL,
    @Country      NVARCHAR(100) = NULL,
    @IsPrimary    BIT           = 0,
    @SortOrder    INT           = 0,
    @CreatedBy    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- If setting as primary, clear existing primary first
    IF @IsPrimary = 1
        UPDATE proj.TBL_COMPANY_BRANCH_ADDRESS
           SET IsPrimary = 0
         WHERE CompanyId = @CompanyId AND IsActive = 1;

    IF @AddressId IS NULL OR @AddressId = 0
    BEGIN
        INSERT INTO proj.TBL_COMPANY_BRANCH_ADDRESS
            (CompanyId, AddressLine1, AddressLine2, City, State, Country,
             IsPrimary, SortOrder, IsActive, CreatedDate, CreatedBy)
        VALUES
            (@CompanyId, @AddressLine1, @AddressLine2, @City, @State, @Country,
             @IsPrimary, @SortOrder, 1, GETDATE(), @CreatedBy);
        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR);
    END
    ELSE
    BEGIN
        UPDATE proj.TBL_COMPANY_BRANCH_ADDRESS
           SET AddressLine1 = @AddressLine1,
               AddressLine2 = @AddressLine2,
               City         = @City,
               State        = @State,
               Country      = @Country,
               IsPrimary    = @IsPrimary,
               SortOrder    = @SortOrder
         WHERE AddressId = @AddressId;
        SELECT CAST(@AddressId AS NVARCHAR);
    END
END
GO

-- sp_DeleteCompanyAddress  (soft delete)
CREATE OR ALTER PROCEDURE proj.sp_DeleteCompanyAddress
    @AddressId INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE proj.TBL_COMPANY_BRANCH_ADDRESS
       SET IsActive = 0
     WHERE AddressId = @AddressId;
END
GO

-- sp_SetCompanyBank  (insert / update)
CREATE OR ALTER PROCEDURE proj.sp_SetCompanyBank
    @BankId        INT           = NULL,
    @CompanyId     INT,
    @BankName      NVARCHAR(200),
    @Beneficiary   NVARCHAR(200) = NULL,
    @AccountNo     NVARCHAR(100) = NULL,
    @IBAN          NVARCHAR(100) = NULL,
    @Swift         NVARCHAR(50)  = NULL,
    @Currency      NVARCHAR(10)  = NULL,
    @BranchAddress NVARCHAR(500) = NULL,
    @IsPrimary     BIT           = 0,
    @SortOrder     INT           = 0,
    @CreatedBy     NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- If setting as primary, clear existing primary first
    IF @IsPrimary = 1
        UPDATE proj.TBL_COMPANY_BRANCH_BANK
           SET IsPrimary = 0
         WHERE CompanyId = @CompanyId AND IsActive = 1;

    IF @BankId IS NULL OR @BankId = 0
    BEGIN
        INSERT INTO proj.TBL_COMPANY_BRANCH_BANK
            (CompanyId, BankName, Beneficiary, AccountNo, IBAN, Swift, Currency,
             BranchAddress, IsPrimary, SortOrder, IsActive, CreatedDate, CreatedBy)
        VALUES
            (@CompanyId, @BankName, @Beneficiary, @AccountNo, @IBAN, @Swift, @Currency,
             @BranchAddress, @IsPrimary, @SortOrder, 1, GETDATE(), @CreatedBy);
        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR);
    END
    ELSE
    BEGIN
        UPDATE proj.TBL_COMPANY_BRANCH_BANK
           SET BankName      = @BankName,
               Beneficiary   = @Beneficiary,
               AccountNo     = @AccountNo,
               IBAN          = @IBAN,
               Swift         = @Swift,
               Currency      = @Currency,
               BranchAddress = @BranchAddress,
               IsPrimary     = @IsPrimary,
               SortOrder     = @SortOrder
         WHERE BankId = @BankId;
        SELECT CAST(@BankId AS NVARCHAR);
    END
END
GO

-- sp_DeleteCompanyBank  (soft delete)
CREATE OR ALTER PROCEDURE proj.sp_DeleteCompanyBank
    @BankId INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE proj.TBL_COMPANY_BRANCH_BANK
       SET IsActive = 0
     WHERE BankId = @BankId;
END
GO

PRINT 'Company address & bank procedures created.';
GO
