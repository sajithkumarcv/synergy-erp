-- ============================================================================
-- Fix sp_AdminLookupList / Save / Delete:
--   • category   → now reads/writes TBL_ITEM_CATEGORY (Level=0, root)
--   • subcategory → now reads/writes TBL_ITEM_CATEGORY (Level=1, child)
--   • uom        → new section for TBL_ITEM_UOM
-- ============================================================================
SET NOCOUNT ON;

-- ── 1. sp_AdminLookupList ─────────────────────────────────────────────────────
ALTER PROCEDURE proj.sp_AdminLookupList
    @TableKey NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    IF @TableKey = 'paymentTerms'
        SELECT PaymentTermsId AS Id, TermName AS Name, TermCode AS Code,
               NULL AS Description, TermDays AS Extra1, NULL AS Extra2, NULL AS Extra3,
               IsActive, NULL AS SortOrder
        FROM proj.TBL_PAYMENT_TERMS ORDER BY TermName;
    ELSE IF @TableKey = 'deliveryTerms'
        SELECT DeliveryTermsId AS Id, TermName AS Name, TermCode AS Code,
               Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_DELIVERY_TERMS ORDER BY SortOrder, TermName;
    ELSE IF @TableKey = 'customerCategory'
        SELECT CustomerCategoryId AS Id, CategoryName AS Name, CategoryCode AS Code,
               Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_CUSTOMER_CATEGORY ORDER BY SortOrder, CategoryName;
    ELSE IF @TableKey = 'supplierCategory'
        SELECT SupplierCategoryId AS Id, CategoryName AS Name, NULL AS Code,
               Description, IsActive, NULL AS SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_SUPPLIER_CATEGORY ORDER BY CategoryName;
    ELSE IF @TableKey = 'jobStatus'
        SELECT JobStatusId AS Id, StatusName AS Name, NULL AS Code,
               NULL AS Description, IsActive, SortOrder, CAST(IsClosed AS INT) AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_JOB_STATUS ORDER BY SortOrder, StatusName;
    ELSE IF @TableKey = 'jobStage'
        SELECT JobStageId AS Id, JobStageName AS Name, NULL AS Code,
               NULL AS Description, 1 AS IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_JOB_STAGE ORDER BY SortOrder, JobStageName;
    ELSE IF @TableKey = 'jobRole'
        SELECT JobRoleId AS Id, JobRoleName AS Name, NULL AS Code,
               NULL AS Description, IsActive, NULL AS SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_JOB_ROLE ORDER BY JobRoleName;
    ELSE IF @TableKey = 'jobCategory'
        SELECT JobCategoryId AS Id, JobCategoryName AS Name, NULL AS Code,
               NULL AS Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_JOB_CATEGORY ORDER BY SortOrder, JobCategoryName;
    ELSE IF @TableKey = 'jobBay'
        SELECT BayId AS Id, BayName AS Name, NULL AS Code,
               NULL AS Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_JOB_BAY ORDER BY SortOrder, BayName;
    ELSE IF @TableKey = 'jobQuality'
        SELECT QualityLevelId AS Id, QualityLevelName AS Name, NULL AS Code,
               Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_JOB_QUALITY ORDER BY SortOrder, QualityLevelName;
    ELSE IF @TableKey = 'team'
        SELECT TeamId AS Id, TeamName AS Name, NULL AS Code,
               Description, IsActive, NULL AS SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_TEAM ORDER BY TeamName;
    ELSE IF @TableKey = 'issueType'
        SELECT IssueTypeId AS Id, IssueTypeName AS Name, IssueTypeCode AS Code,
               Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_ISSUE_TYPE ORDER BY SortOrder, IssueTypeName;
    ELSE IF @TableKey = 'jobExpenseCategory'
        SELECT ExpenseCategoryId AS Id, CategoryName AS Name, CategoryCode AS Code,
               Description, IsActive, SortOrder,
               CAST(UsedForBudget AS NVARCHAR(5)) AS Extra1,
               CAST(UsedForExpense AS NVARCHAR(5)) AS Extra2, NULL AS Extra3
        FROM proj.TBL_JOB_EXPENSE_CATEGORY ORDER BY SortOrder, CategoryName;
    ELSE IF @TableKey = 'itemType'
        SELECT ItemTypeId AS Id, TypeName AS Name, TypeCode AS Code,
               Description, IsActive, SortOrder,
               CAST(IsStockable AS NVARCHAR(5)) AS Extra1,
               CAST(IsService AS NVARCHAR(5)) AS Extra2,
               CAST(IsAsset AS NVARCHAR(5)) AS Extra3
        FROM proj.TBL_ITEM_TYPE ORDER BY SortOrder, TypeName;
    ELSE IF @TableKey = 'itemCategory'
        SELECT CategoryId AS Id, CategoryName AS Name, CategoryCode AS Code,
               Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_ITEM_CATEGORY WHERE ParentCategoryId IS NULL
        ORDER BY SortOrder, CategoryName;
    -- category = alias for itemCategory (root level only)
    ELSE IF @TableKey = 'category'
        SELECT CategoryId AS Id, CategoryName AS Name, CategoryCode AS Code,
               Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_ITEM_CATEGORY WHERE ParentCategoryId IS NULL
        ORDER BY SortOrder, CategoryName;
    -- subcategory = TBL_ITEM_CATEGORY Level 1, parent name in Description, parent ID in Extra1
    ELSE IF @TableKey = 'subcategory'
        SELECT c.CategoryId AS Id, c.CategoryName AS Name, c.CategoryCode AS Code,
               p.CategoryName AS Description, c.IsActive, c.SortOrder,
               CAST(c.ParentCategoryId AS NVARCHAR) AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_ITEM_CATEGORY c
        JOIN proj.TBL_ITEM_CATEGORY p ON p.CategoryId = c.ParentCategoryId
        ORDER BY p.CategoryName, c.CategoryName;
    -- uom
    ELSE IF @TableKey = 'uom'
        SELECT UomId AS Id, UomName AS Name, UomCode AS Code,
               Description, IsActive, NULL AS SortOrder,
               UomType AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_ITEM_UOM ORDER BY UomType, UomName;
    ELSE IF @TableKey = 'poTerms'
        SELECT TermId AS Id, TermText AS Name, NULL AS Code,
               NULL AS Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_PO_TERMS ORDER BY SortOrder;
    ELSE IF @TableKey = 'bomSection'
        SELECT BomSectionId AS Id, SectionName AS Name, SectionCode AS Code,
               Description, IsActive, SortOrder, NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_BOM_SECTION ORDER BY SortOrder, SectionName;
    ELSE IF @TableKey = 'documentTypes'
        SELECT DocumentTypeId AS Id, DocumentType AS Name, NULL AS Code,
               ModuleName AS Description, IsMandatory AS IsActive, NULL AS SortOrder,
               NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_DOCUMENT_TYPES ORDER BY ModuleName, DocumentType;
    ELSE IF @TableKey = 'approvalModule'
        SELECT ModuleId AS Id, ModuleName AS Name, ModuleCode AS Code,
               Description, IsActive, NULL AS SortOrder,
               NULL AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_APPROVAL_MODULE ORDER BY ModuleName;
END
GO

-- ── 2. sp_AdminLookupSave ─────────────────────────────────────────────────────
ALTER PROCEDURE proj.sp_AdminLookupSave
    @TableKey    NVARCHAR(50),
    @Id          NVARCHAR(50)  = NULL,
    @Name        NVARCHAR(200) = NULL,
    @Code        NVARCHAR(50)  = NULL,
    @Description NVARCHAR(500) = NULL,
    @SortOrder   INT           = 0,
    @IsActive    BIT           = 1,
    @Extra1      NVARCHAR(200) = NULL,
    @Extra2      NVARCHAR(200) = NULL,
    @Extra3      NVARCHAR(200) = NULL,
    @ActionBy    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IntId INT = CASE WHEN @Id IS NULL OR @Id='' OR @Id='0' THEN 0 ELSE ISNULL(TRY_CAST(@Id AS INT),0) END;

    IF @TableKey = 'paymentTerms'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_PAYMENT_TERMS(TermName,TermCode,TermDays,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,ISNULL(TRY_CAST(@Extra1 AS INT),0),@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_PAYMENT_TERMS SET TermName=@Name,TermCode=@Code,TermDays=ISNULL(TRY_CAST(@Extra1 AS INT),0),
            IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE PaymentTermsId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'deliveryTerms'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_DELIVERY_TERMS(TermName,TermCode,Description,IsActive,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_DELIVERY_TERMS SET TermName=@Name,TermCode=@Code,Description=@Description,
            IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE DeliveryTermsId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'customerCategory'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_CUSTOMER_CATEGORY(CategoryName,CategoryCode,Description,IsActive,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_CUSTOMER_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,
            IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE CustomerCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'supplierCategory'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_SUPPLIER_CATEGORY(CategoryName,Description,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,@Description,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_SUPPLIER_CATEGORY SET CategoryName=@Name,Description=@Description,
            IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE SupplierCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'jobStatus'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_STATUS(StatusName,IsClosed,SortOrder,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,ISNULL(TRY_CAST(@Extra1 AS BIT),0),@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_STATUS SET StatusName=@Name,IsClosed=ISNULL(TRY_CAST(@Extra1 AS BIT),0),
            SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobStatusId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'jobStage'
    BEGIN
        IF @Id IS NULL OR @Id=''
            INSERT INTO proj.TBL_JOB_STAGE(JobStageId,JobStageName,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Code,@Name,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_STAGE SET JobStageName=@Name,SortOrder=@SortOrder,
            ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobStageId=@Id;
        SELECT ISNULL(@Id,@Code) AS NewId;
    END
    ELSE IF @TableKey = 'jobRole'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_ROLE(JobRoleName,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_ROLE SET JobRoleName=@Name,IsActive=@IsActive,
            ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobRoleId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'jobCategory'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_CATEGORY(JobCategoryName,SortOrder,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_CATEGORY SET JobCategoryName=@Name,SortOrder=@SortOrder,
            IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'jobBay'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_BAY(BayName,SortOrder,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_BAY SET BayName=@Name,SortOrder=@SortOrder,
            IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE BayId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'jobQuality'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_QUALITY(QualityLevelName,Description,SortOrder,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,@Description,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_QUALITY SET QualityLevelName=@Name,Description=@Description,
            SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE QualityLevelId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'team'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_TEAM(TeamName,Description,IsActive) VALUES(@Name,@Description,@IsActive);
        ELSE UPDATE proj.TBL_TEAM SET TeamName=@Name,Description=@Description,IsActive=@IsActive WHERE TeamId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'issueType'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ISSUE_TYPE(IssueTypeName,IssueTypeCode,Description,SortOrder,IsActive,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ISSUE_TYPE SET IssueTypeName=@Name,IssueTypeCode=@Code,Description=@Description,
            SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE IssueTypeId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'jobExpenseCategory'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_EXPENSE_CATEGORY(CategoryName,CategoryCode,Description,
                UsedForBudget,UsedForExpense,IsActive,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,ISNULL(TRY_CAST(@Extra1 AS BIT),0),
                ISNULL(TRY_CAST(@Extra2 AS BIT),0),@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_EXPENSE_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,
            UsedForBudget=ISNULL(TRY_CAST(@Extra1 AS BIT),0),UsedForExpense=ISNULL(TRY_CAST(@Extra2 AS BIT),0),
            IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE ExpenseCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'itemType'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_TYPE(TypeName,TypeCode,Description,IsStockable,IsService,IsAsset,IsConsumable,IsActive,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,ISNULL(TRY_CAST(@Extra1 AS BIT),0),ISNULL(TRY_CAST(@Extra2 AS BIT),0),
                ISNULL(TRY_CAST(@Extra3 AS BIT),0),0,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_TYPE SET TypeName=@Name,TypeCode=@Code,Description=@Description,
            IsStockable=ISNULL(TRY_CAST(@Extra1 AS BIT),0),IsService=ISNULL(TRY_CAST(@Extra2 AS BIT),0),
            IsAsset=ISNULL(TRY_CAST(@Extra3 AS BIT),0),IsActive=@IsActive,SortOrder=@SortOrder,
            ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE ItemTypeId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    -- itemCategory and category both write to TBL_ITEM_CATEGORY root (Level=0)
    ELSE IF @TableKey IN ('itemCategory', 'category')
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_CATEGORY
                (CategoryName,CategoryCode,Description,ParentCategoryId,Level,IsActive,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,NULL,0,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,
            IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE CategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    -- subcategory writes to TBL_ITEM_CATEGORY Level=1, ParentCategoryId from Extra1
    ELSE IF @TableKey = 'subcategory'
    BEGIN
        DECLARE @ParentId INT = ISNULL(TRY_CAST(@Extra1 AS INT), NULL);
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_CATEGORY
                (CategoryName,CategoryCode,Description,ParentCategoryId,Level,IsActive,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,@ParentId,1,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,
            ParentCategoryId=@ParentId,IsActive=@IsActive,SortOrder=@SortOrder,
            ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE CategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    -- uom
    ELSE IF @TableKey = 'uom'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_UOM(UomCode,UomName,UomType,Description,IsActive,CreatedBy,CreatedDate)
            VALUES(@Code,@Name,@Extra1,@Description,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_UOM SET UomCode=@Code,UomName=@Name,UomType=@Extra1,Description=@Description,
            IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE UomId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'poTerms'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_PO_TERMS(TermText,IsActive,SortOrder) VALUES(@Name,@IsActive,@SortOrder);
        ELSE UPDATE proj.TBL_PO_TERMS SET TermText=@Name,IsActive=@IsActive,SortOrder=@SortOrder WHERE TermId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'bomSection'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_BOM_SECTION(SectionName,SectionCode,Description,IsActive,SortOrder,CreatedBy,CreatedDate)
            VALUES(@Name,@Code,@Description,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_BOM_SECTION SET SectionName=@Name,SectionCode=@Code,Description=@Description,
            IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE BomSectionId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    ELSE IF @TableKey = 'documentTypes'
    BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_DOCUMENT_TYPES(DocumentType,ModuleName,IsMandatory) VALUES(@Name,@Description,@IsActive);
        ELSE UPDATE proj.TBL_DOCUMENT_TYPES SET DocumentType=@Name,ModuleName=@Description,IsMandatory=@IsActive WHERE DocumentTypeId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
    -- approvalModule is view-only — no save
END
GO

-- ── 3. sp_AdminLookupDelete ───────────────────────────────────────────────────
ALTER PROCEDURE proj.sp_AdminLookupDelete
    @TableKey NVARCHAR(50),
    @Id       NVARCHAR(50),
    @ActionBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IntId INT = ISNULL(TRY_CAST(@Id AS INT),0);

    IF @TableKey = 'paymentTerms'
        DELETE FROM proj.TBL_PAYMENT_TERMS WHERE PaymentTermsId=@IntId;
    ELSE IF @TableKey = 'deliveryTerms'
        DELETE FROM proj.TBL_DELIVERY_TERMS WHERE DeliveryTermsId=@IntId;
    ELSE IF @TableKey = 'customerCategory'
        DELETE FROM proj.TBL_CUSTOMER_CATEGORY WHERE CustomerCategoryId=@IntId;
    ELSE IF @TableKey = 'supplierCategory'
        DELETE FROM proj.TBL_SUPPLIER_CATEGORY WHERE SupplierCategoryId=@IntId;
    ELSE IF @TableKey = 'jobStatus'
        DELETE FROM proj.TBL_JOB_STATUS WHERE JobStatusId=@IntId;
    ELSE IF @TableKey = 'jobStage'
        DELETE FROM proj.TBL_JOB_STAGE WHERE JobStageId=@Id;
    ELSE IF @TableKey = 'jobRole'
        DELETE FROM proj.TBL_JOB_ROLE WHERE JobRoleId=@IntId;
    ELSE IF @TableKey = 'jobCategory'
        DELETE FROM proj.TBL_JOB_CATEGORY WHERE JobCategoryId=@IntId;
    ELSE IF @TableKey = 'jobBay'
        DELETE FROM proj.TBL_JOB_BAY WHERE BayId=@IntId;
    ELSE IF @TableKey = 'jobQuality'
        DELETE FROM proj.TBL_JOB_QUALITY WHERE QualityLevelId=@IntId;
    ELSE IF @TableKey = 'team'
        DELETE FROM proj.TBL_TEAM WHERE TeamId=@IntId;
    ELSE IF @TableKey = 'issueType'
        DELETE FROM proj.TBL_ISSUE_TYPE WHERE IssueTypeId=@IntId;
    ELSE IF @TableKey = 'jobExpenseCategory'
        DELETE FROM proj.TBL_JOB_EXPENSE_CATEGORY WHERE ExpenseCategoryId=@IntId;
    ELSE IF @TableKey = 'itemType'
        DELETE FROM proj.TBL_ITEM_TYPE WHERE ItemTypeId=@IntId;
    ELSE IF @TableKey IN ('itemCategory','category','subcategory')
        DELETE FROM proj.TBL_ITEM_CATEGORY WHERE CategoryId=@IntId;
    ELSE IF @TableKey = 'uom'
        DELETE FROM proj.TBL_ITEM_UOM WHERE UomId=@IntId;
    ELSE IF @TableKey = 'poTerms'
        DELETE FROM proj.TBL_PO_TERMS WHERE TermId=@IntId;
    ELSE IF @TableKey = 'bomSection'
        DELETE FROM proj.TBL_BOM_SECTION WHERE BomSectionId=@IntId;
    ELSE IF @TableKey = 'documentTypes'
        DELETE FROM proj.TBL_DOCUMENT_TYPES WHERE DocumentTypeId=@IntId;
END
GO

PRINT 'All 3 Admin Lookup SPs updated successfully.';
