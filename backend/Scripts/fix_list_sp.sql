SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO
ALTER PROCEDURE proj.sp_AdminLookupList
    @TableKey NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    IF @TableKey='paymentTerms'
        SELECT PaymentTermsId AS Id,TermName AS Name,TermCode AS Code,NULL AS Description,TermDays AS Extra1,NULL AS Extra2,NULL AS Extra3,IsActive,NULL AS SortOrder FROM proj.TBL_PAYMENT_TERMS ORDER BY TermName;
    ELSE IF @TableKey='deliveryTerms'
        SELECT DeliveryTermsId AS Id,TermName AS Name,TermCode AS Code,Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_DELIVERY_TERMS ORDER BY SortOrder,TermName;
    ELSE IF @TableKey='customerCategory'
        SELECT CustomerCategoryId AS Id,CategoryName AS Name,CategoryCode AS Code,Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_CUSTOMER_CATEGORY ORDER BY SortOrder,CategoryName;
    ELSE IF @TableKey='supplierCategory'
        SELECT SupplierCategoryId AS Id,CategoryName AS Name,NULL AS Code,Description,IsActive,NULL AS SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_SUPPLIER_CATEGORY ORDER BY CategoryName;
    ELSE IF @TableKey='jobStatus'
        SELECT JobStatusId AS Id,StatusName AS Name,NULL AS Code,NULL AS Description,IsActive,SortOrder,CAST(IsClosed AS INT) AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_JOB_STATUS ORDER BY SortOrder,StatusName;
    ELSE IF @TableKey='jobStage'
        SELECT JobStageId AS Id,JobStageName AS Name,NULL AS Code,NULL AS Description,1 AS IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_JOB_STAGE ORDER BY SortOrder,JobStageName;
    ELSE IF @TableKey='jobRole'
        SELECT JobRoleId AS Id,JobRoleName AS Name,NULL AS Code,NULL AS Description,IsActive,NULL AS SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_JOB_ROLE ORDER BY JobRoleName;
    ELSE IF @TableKey='jobCategory'
        SELECT JobCategoryId AS Id,JobCategoryName AS Name,NULL AS Code,NULL AS Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_JOB_CATEGORY ORDER BY SortOrder,JobCategoryName;
    ELSE IF @TableKey='jobBay'
        SELECT BayId AS Id,BayName AS Name,NULL AS Code,NULL AS Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_JOB_BAY ORDER BY SortOrder,BayName;
    ELSE IF @TableKey='jobQuality'
        SELECT QualityLevelId AS Id,QualityLevelName AS Name,NULL AS Code,Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_JOB_QUALITY ORDER BY SortOrder,QualityLevelName;
    ELSE IF @TableKey='team'
        SELECT TeamId AS Id,TeamName AS Name,NULL AS Code,Description,IsActive,NULL AS SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_TEAM ORDER BY TeamName;
    ELSE IF @TableKey='issueType'
        SELECT IssueTypeId AS Id,IssueTypeName AS Name,IssueTypeCode AS Code,Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_ISSUE_TYPE ORDER BY SortOrder,IssueTypeName;
    ELSE IF @TableKey='jobExpenseCategory'
        SELECT ExpenseCategoryId AS Id,CategoryName AS Name,CategoryCode AS Code,Description,IsActive,SortOrder,CAST(UsedForBudget AS NVARCHAR(5)) AS Extra1,CAST(UsedForExpense AS NVARCHAR(5)) AS Extra2,MhTypeCode AS Extra3 FROM proj.TBL_JOB_EXPENSE_CATEGORY ORDER BY SortOrder,CategoryName;
    ELSE IF @TableKey='itemType'
        SELECT ItemTypeId AS Id,TypeName AS Name,TypeCode AS Code,Description,IsActive,SortOrder,CAST(IsStockable AS NVARCHAR(5)) AS Extra1,CAST(IsService AS NVARCHAR(5)) AS Extra2,CAST(IsAsset AS NVARCHAR(5)) AS Extra3 FROM proj.TBL_ITEM_TYPE ORDER BY SortOrder,TypeName;
    ELSE IF @TableKey IN ('itemCategory','category')
        SELECT CategoryId AS Id,CategoryName AS Name,CategoryCode AS Code,Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_ITEM_CATEGORY WHERE ParentCategoryId IS NULL ORDER BY SortOrder,CategoryName;
    ELSE IF @TableKey='subcategory'
        SELECT c.CategoryId AS Id,c.CategoryName AS Name,c.CategoryCode AS Code,p.CategoryName AS Description,c.IsActive,c.SortOrder,CAST(c.ParentCategoryId AS NVARCHAR) AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_ITEM_CATEGORY c JOIN proj.TBL_ITEM_CATEGORY p ON p.CategoryId=c.ParentCategoryId ORDER BY p.CategoryName,c.CategoryName;
    ELSE IF @TableKey='uom'
        SELECT UomId AS Id,UomName AS Name,UomCode AS Code,Description,IsActive,NULL AS SortOrder,UomType AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_ITEM_UOM ORDER BY UomType,UomName;
    ELSE IF @TableKey='poTerms'
        SELECT TermId AS Id,TermText AS Name,NULL AS Code,NULL AS Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_PO_TERMS ORDER BY SortOrder;
    ELSE IF @TableKey='bomSection'
        SELECT BomSectionId AS Id,SectionName AS Name,SectionCode AS Code,Description,IsActive,SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_BOM_SECTION ORDER BY SortOrder,SectionName;
    ELSE IF @TableKey='documentTypes'
        SELECT DocumentTypeId AS Id,DocumentType AS Name,NULL AS Code,ModuleName AS Description,IsMandatory AS IsActive,NULL AS SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_DOCUMENT_TYPES ORDER BY ModuleName,DocumentType;
    ELSE IF @TableKey='approvalModule'
        SELECT ModuleId AS Id,ModuleName AS Name,ModuleCode AS Code,Description,IsActive,NULL AS SortOrder,NULL AS Extra1,NULL AS Extra2,NULL AS Extra3 FROM proj.TBL_APPROVAL_MODULE ORDER BY ModuleName;
    ELSE IF @TableKey='fieldConfig'
        SELECT ConfigId AS Id, FieldKey AS Name, FormKey AS Code,
               NULL AS Description, IsActive, NULL AS SortOrder,
               CAST(IsRequired AS NVARCHAR(5)) AS Extra1, NULL AS Extra2, NULL AS Extra3
        FROM proj.TBL_FIELD_CONFIG
        ORDER BY FormKey, FieldKey;
END
