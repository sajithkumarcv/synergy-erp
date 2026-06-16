SET QUOTED_IDENTIFIER ON
SET ANSI_NULLS ON
GO
ALTER PROCEDURE proj.sp_AdminLookupDelete
    @TableKey NVARCHAR(50), @Id NVARCHAR(50), @ActionBy NVARCHAR(100)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IntId INT = ISNULL(TRY_CAST(@Id AS INT),0);
    IF @TableKey='paymentTerms'        DELETE FROM proj.TBL_PAYMENT_TERMS       WHERE PaymentTermsId=@IntId;
    ELSE IF @TableKey='deliveryTerms'  DELETE FROM proj.TBL_DELIVERY_TERMS      WHERE DeliveryTermsId=@IntId;
    ELSE IF @TableKey='customerCategory' DELETE FROM proj.TBL_CUSTOMER_CATEGORY WHERE CustomerCategoryId=@IntId;
    ELSE IF @TableKey='supplierCategory' DELETE FROM proj.TBL_SUPPLIER_CATEGORY WHERE SupplierCategoryId=@IntId;
    ELSE IF @TableKey='jobStatus'      DELETE FROM proj.TBL_JOB_STATUS          WHERE JobStatusId=@IntId;
    ELSE IF @TableKey='jobStage'       DELETE FROM proj.TBL_JOB_STAGE           WHERE JobStageId=@Id;
    ELSE IF @TableKey='jobRole'        DELETE FROM proj.TBL_JOB_ROLE            WHERE JobRoleId=@IntId;
    ELSE IF @TableKey='jobCategory'    DELETE FROM proj.TBL_JOB_CATEGORY        WHERE JobCategoryId=@IntId;
    ELSE IF @TableKey='jobBay'         DELETE FROM proj.TBL_JOB_BAY             WHERE BayId=@IntId;
    ELSE IF @TableKey='jobQuality'     DELETE FROM proj.TBL_JOB_QUALITY         WHERE QualityLevelId=@IntId;
    ELSE IF @TableKey='team'           DELETE FROM proj.TBL_TEAM                WHERE TeamId=@IntId;
    ELSE IF @TableKey='issueType'      DELETE FROM proj.TBL_ISSUE_TYPE          WHERE IssueTypeId=@IntId;
    ELSE IF @TableKey='jobExpenseCategory' DELETE FROM proj.TBL_JOB_EXPENSE_CATEGORY WHERE ExpenseCategoryId=@IntId;
    ELSE IF @TableKey='itemType'       DELETE FROM proj.TBL_ITEM_TYPE           WHERE ItemTypeId=@IntId;
    ELSE IF @TableKey IN ('itemCategory','category','subcategory')
                                       DELETE FROM proj.TBL_ITEM_CATEGORY        WHERE CategoryId=@IntId;
    ELSE IF @TableKey='uom'            DELETE FROM proj.TBL_ITEM_UOM            WHERE UomId=@IntId;
    ELSE IF @TableKey='poTerms'        DELETE FROM proj.TBL_PO_TERMS            WHERE TermId=@IntId;
    ELSE IF @TableKey='bomSection'     DELETE FROM proj.TBL_BOM_SECTION         WHERE BomSectionId=@IntId;
    ELSE IF @TableKey='documentTypes'  DELETE FROM proj.TBL_DOCUMENT_TYPES      WHERE DocumentTypeId=@IntId;
    ELSE IF @TableKey='fieldConfig'    DELETE FROM proj.TBL_FIELD_CONFIG         WHERE ConfigId=@IntId;
END
