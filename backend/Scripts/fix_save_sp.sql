SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO
ALTER PROCEDURE proj.sp_AdminLookupSave
    @TableKey NVARCHAR(50), @Id NVARCHAR(50)=NULL, @Name NVARCHAR(200)=NULL,
    @Code NVARCHAR(50)=NULL, @Description NVARCHAR(500)=NULL, @SortOrder INT=0,
    @IsActive BIT=1, @Extra1 NVARCHAR(200)=NULL, @Extra2 NVARCHAR(200)=NULL,
    @Extra3 NVARCHAR(200)=NULL, @ActionBy NVARCHAR(100)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IntId INT = CASE WHEN @Id IS NULL OR @Id='' OR @Id='0' THEN 0 ELSE ISNULL(TRY_CAST(@Id AS INT),0) END;
    IF @TableKey='paymentTerms' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_PAYMENT_TERMS(TermName,TermCode,TermDays,IsActive,CreatedBy,CreatedDate) VALUES(@Name,@Code,ISNULL(TRY_CAST(@Extra1 AS INT),0),@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_PAYMENT_TERMS SET TermName=@Name,TermCode=@Code,TermDays=ISNULL(TRY_CAST(@Extra1 AS INT),0),IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE PaymentTermsId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='deliveryTerms' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_DELIVERY_TERMS(TermName,TermCode,Description,IsActive,SortOrder,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_DELIVERY_TERMS SET TermName=@Name,TermCode=@Code,Description=@Description,IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE DeliveryTermsId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='customerCategory' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_CUSTOMER_CATEGORY(CategoryName,CategoryCode,Description,IsActive,SortOrder,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_CUSTOMER_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE CustomerCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='supplierCategory' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_SUPPLIER_CATEGORY(CategoryName,Description,IsActive,CreatedBy,CreatedDate) VALUES(@Name,@Description,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_SUPPLIER_CATEGORY SET CategoryName=@Name,Description=@Description,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE SupplierCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='jobStatus' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_STATUS(StatusName,IsClosed,SortOrder,IsActive,CreatedBy,CreatedDate) VALUES(@Name,ISNULL(TRY_CAST(@Extra1 AS BIT),0),@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_STATUS SET StatusName=@Name,IsClosed=ISNULL(TRY_CAST(@Extra1 AS BIT),0),SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobStatusId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='jobStage' BEGIN
        IF @Id IS NULL OR @Id='' INSERT INTO proj.TBL_JOB_STAGE(JobStageId,JobStageName,SortOrder,CreatedBy,CreatedDate) VALUES(@Code,@Name,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_STAGE SET JobStageName=@Name,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobStageId=@Id;
        SELECT ISNULL(@Id,@Code) AS NewId;
    END ELSE IF @TableKey='jobRole' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_ROLE(JobRoleName,IsActive,CreatedBy,CreatedDate) VALUES(@Name,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_ROLE SET JobRoleName=@Name,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobRoleId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='jobCategory' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_CATEGORY(JobCategoryName,SortOrder,IsActive,CreatedBy,CreatedDate) VALUES(@Name,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_CATEGORY SET JobCategoryName=@Name,SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE JobCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='jobBay' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_BAY(BayName,SortOrder,IsActive,CreatedBy,CreatedDate) VALUES(@Name,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_BAY SET BayName=@Name,SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE BayId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='jobQuality' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_QUALITY(QualityLevelName,Description,SortOrder,IsActive,CreatedBy,CreatedDate) VALUES(@Name,@Description,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_QUALITY SET QualityLevelName=@Name,Description=@Description,SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE QualityLevelId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='team' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_TEAM(TeamName,Description,IsActive) VALUES(@Name,@Description,@IsActive);
        ELSE UPDATE proj.TBL_TEAM SET TeamName=@Name,Description=@Description,IsActive=@IsActive WHERE TeamId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='issueType' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ISSUE_TYPE(IssueTypeName,IssueTypeCode,Description,SortOrder,IsActive,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,@SortOrder,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ISSUE_TYPE SET IssueTypeName=@Name,IssueTypeCode=@Code,Description=@Description,SortOrder=@SortOrder,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE IssueTypeId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='jobExpenseCategory' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_JOB_EXPENSE_CATEGORY(CategoryName,CategoryCode,Description,UsedForBudget,UsedForExpense,MhTypeCode,IsActive,SortOrder,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,ISNULL(TRY_CAST(@Extra1 AS BIT),0),ISNULL(TRY_CAST(@Extra2 AS BIT),0),NULLIF(LTRIM(RTRIM(@Extra3)),''),@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_JOB_EXPENSE_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,UsedForBudget=ISNULL(TRY_CAST(@Extra1 AS BIT),0),UsedForExpense=ISNULL(TRY_CAST(@Extra2 AS BIT),0),MhTypeCode=NULLIF(LTRIM(RTRIM(@Extra3)),''),IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE ExpenseCategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='itemType' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_TYPE(TypeName,TypeCode,Description,IsStockable,IsService,IsAsset,IsConsumable,IsActive,SortOrder,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,ISNULL(TRY_CAST(@Extra1 AS BIT),0),ISNULL(TRY_CAST(@Extra2 AS BIT),0),ISNULL(TRY_CAST(@Extra3 AS BIT),0),0,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_TYPE SET TypeName=@Name,TypeCode=@Code,Description=@Description,IsStockable=ISNULL(TRY_CAST(@Extra1 AS BIT),0),IsService=ISNULL(TRY_CAST(@Extra2 AS BIT),0),IsAsset=ISNULL(TRY_CAST(@Extra3 AS BIT),0),IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE ItemTypeId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey IN ('itemCategory','category') BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_CATEGORY(CategoryName,CategoryCode,Description,ParentCategoryId,Level,IsActive,SortOrder,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,NULL,0,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE CategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='subcategory' BEGIN
        DECLARE @ParentId INT = ISNULL(TRY_CAST(@Extra1 AS INT),NULL);
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_CATEGORY(CategoryName,CategoryCode,Description,ParentCategoryId,Level,IsActive,SortOrder,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,@ParentId,1,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_CATEGORY SET CategoryName=@Name,CategoryCode=@Code,Description=@Description,ParentCategoryId=@ParentId,IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE CategoryId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='uom' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_ITEM_UOM(UomCode,UomName,UomType,Description,IsActive,CreatedBy,CreatedDate) VALUES(@Code,@Name,@Extra1,@Description,@IsActive,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_ITEM_UOM SET UomCode=@Code,UomName=@Name,UomType=@Extra1,Description=@Description,IsActive=@IsActive,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE UomId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='poTerms' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_PO_TERMS(TermText,IsActive,SortOrder) VALUES(@Name,@IsActive,@SortOrder);
        ELSE UPDATE proj.TBL_PO_TERMS SET TermText=@Name,IsActive=@IsActive,SortOrder=@SortOrder WHERE TermId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='bomSection' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_BOM_SECTION(SectionName,SectionCode,Description,IsActive,SortOrder,CreatedBy,CreatedDate) VALUES(@Name,@Code,@Description,@IsActive,@SortOrder,@ActionBy,GETDATE());
        ELSE UPDATE proj.TBL_BOM_SECTION SET SectionName=@Name,SectionCode=@Code,Description=@Description,IsActive=@IsActive,SortOrder=@SortOrder,ModifiedBy=@ActionBy,ModifiedDate=GETDATE() WHERE BomSectionId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='documentTypes' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_DOCUMENT_TYPES(DocumentType,ModuleName,IsMandatory) VALUES(@Name,@Description,@IsActive);
        ELSE UPDATE proj.TBL_DOCUMENT_TYPES SET DocumentType=@Name,ModuleName=@Description,IsMandatory=@IsActive WHERE DocumentTypeId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END ELSE IF @TableKey='fieldConfig' BEGIN
        IF @IntId=0 INSERT INTO proj.TBL_FIELD_CONFIG(FormKey,FieldKey,IsRequired,IsActive)
            VALUES(@Code, @Name, ISNULL(TRY_CAST(@Extra1 AS BIT),0), @IsActive);
        ELSE UPDATE proj.TBL_FIELD_CONFIG
            SET FormKey=@Code, FieldKey=@Name,
                IsRequired=ISNULL(TRY_CAST(@Extra1 AS BIT),0), IsActive=@IsActive
            WHERE ConfigId=@IntId;
        SELECT ISNULL(SCOPE_IDENTITY(),@IntId) AS NewId;
    END
END
