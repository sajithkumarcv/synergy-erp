SET QUOTED_IDENTIFIER ON;
GO
CREATE OR ALTER PROCEDURE PROJ.sp_SearchPOs
    @SearchText       NVARCHAR(100) = NULL,
    @Status           NVARCHAR(200) = NULL,
    @SupplierId       INT           = NULL,
    @JobId            NVARCHAR(50)  = NULL,
    @JobTypeIds       NVARCHAR(500) = NULL,
    @Priority         NVARCHAR(20)  = NULL,
    @PrNumber         NVARCHAR(30)  = NULL,
    @CreatedBy        NVARCHAR(100) = NULL,
    @DateFrom         DATE          = NULL,
    @DateTo           DATE          = NULL,
    @IsSubcontractOnly BIT          = NULL,
    @ExpenseCategoryId INT          = NULL,
    @PageNumber       INT           = 1,
    @PageSize         INT           = 20,
    @SortColumn       NVARCHAR(50)  = N'PoDate',
    @SortDirection    NVARCHAR(4)   = N'DESC'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    DECLARE @Total  INT;

    SELECT @Total = COUNT(DISTINCT po.PoId)
    FROM PROJ.TBL_PURCHASE_ORDER po
    LEFT JOIN PROJ.TBL_SUPPLIER s  ON s.SupplierId = po.SupplierId
    LEFT JOIN PROJ.TBL_JOB_EXPENSE_CATEGORY ec ON ec.ExpenseCategoryId = po.ExpenseCategoryId
    WHERE po.IsActive = 1
      AND (@SearchText IS NULL OR po.PoNumber    LIKE N'%'+@SearchText+N'%'
                               OR po.VendorRef   LIKE N'%'+@SearchText+N'%'
                               OR po.JobId       LIKE N'%'+@SearchText+N'%'
                               OR s.SupplierName LIKE N'%'+@SearchText+N'%'
                               OR s.SupplierCode LIKE N'%'+@SearchText+N'%')
      AND (@Status     IS NULL OR po.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Status, ','))
           OR (po.Status LIKE 'Pending%' AND EXISTS (SELECT 1 FROM proj.fn_PendingApprovalLevel('PO', po.PoId) pl WHERE EXISTS (SELECT 1 FROM STRING_SPLIT(@Status, ',') sv WHERE LTRIM(RTRIM(sv.value)) IN (N'PendingApproval', N'PendingL' + CAST(pl.LevelNo AS NVARCHAR(3)))))))
      AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
      AND (@JobId      IS NULL OR po.JobId      = @JobId)
      AND (@JobTypeIds IS NULL OR @JobTypeIds = '' OR EXISTS (
            SELECT 1 FROM PROJ.TBL_JOB j2
            WHERE j2.JobId = po.JobId
              AND j2.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, ','))))
      AND (@Priority   IS NULL OR po.Priority   = @Priority)
      AND (@CreatedBy  IS NULL OR po.CreatedBy LIKE N'%'+@CreatedBy+N'%')
      AND (@DateFrom   IS NULL OR CAST(po.CreatedDate AS DATE) >= @DateFrom)
      AND (@DateTo     IS NULL OR CAST(po.CreatedDate AS DATE) <= @DateTo)
      AND (@ExpenseCategoryId IS NULL OR po.ExpenseCategoryId = @ExpenseCategoryId)
      AND (@IsSubcontractOnly IS NULL OR (@IsSubcontractOnly = 1 AND ISNULL(ec.IsSubcontractOrder, 0) = 1))
      AND (@PrNumber IS NULL OR EXISTS (
            SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
            JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId AND prl.IsActive = 1
            JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
            WHERE pol.PoId = po.PoId AND pol.IsActive = 1 AND pr.PrNumber = @PrNumber));

    SELECT
        po.PoId, po.PoNumber, po.PoDate, po.Revision, po.Status, po.Priority,
        po.SupplierId,
        ISNULL(s.SupplierName, po.VendorName) AS VendorName,
        s.SupplierCode,
        po.VendorRef, po.JobId, j.ProjectName AS JobTitle,
        po.CurrencyId, c.CurrencyName, c.ShortName AS CurrencyShort,
        po.ExchangeRate, po.DeliveryDate, po.DeliveryTerms,
        po.TotalAmount,
        ROUND(po_paid.PaidBase / NULLIF(ISNULL(po.ExchangeRate, 1), 0), 2) AS PaidAmount,
        po.TotalAmount - ROUND(po_paid.PaidBase / NULLIF(ISNULL(po.ExchangeRate, 1), 0), 2) AS BalanceAmount,
        po.InvoiceReceived, po.HoldBy,
        po.ExpenseCategoryId,
        ec.CategoryCode  AS ExpenseCategoryCode,
        ec.CategoryName  AS ExpenseCategoryName,
        ISNULL(ec.IsSubcontractOrder, 0) AS IsSubcontractOrder,
        
        po.CreatedBy, po.CreatedDate,
        (SELECT STRING_AGG(x.PrNumber, ', ') WITHIN GROUP (ORDER BY x.PrNumber)
         FROM (SELECT DISTINCT pr2.PrNumber
               FROM PROJ.TBL_PURCHASE_ORDER_LINE   pol2
               JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl2 ON prl2.PrLineId = pol2.PrLineId AND prl2.IsActive = 1
               JOIN PROJ.TBL_PURCHASE_REQUEST      pr2  ON pr2.PrId      = prl2.PrId
               WHERE pol2.PoId = po.PoId AND pol2.IsActive = 1) x) AS LinkedPRs,
        (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER_LINE l WHERE l.PoId = po.PoId AND l.IsActive = 1) AS LineCount,
        @Total AS TotalRows
    FROM PROJ.TBL_PURCHASE_ORDER po
    LEFT JOIN PROJ.TBL_SUPPLIER  s  ON s.SupplierId  = po.SupplierId
    LEFT JOIN PROJ.TBL_JOB       j  ON j.JobId       = po.JobId
    LEFT JOIN PROJ.TBL_CURRENCY  c  ON c.CurrencyId  = po.CurrencyId
    LEFT JOIN PROJ.TBL_JOB_EXPENSE_CATEGORY ec ON ec.ExpenseCategoryId = po.ExpenseCategoryId
    OUTER APPLY (
        SELECT
            ISNULL((
                SELECT SUM(pva.AllocatedAmount)
                FROM proj.TBL_PAYMENT_VOUCHER_ALLOCATION pva
                JOIN proj.TBL_PAYMENT_VOUCHER pv ON pv.PvId = pva.PvId
                WHERE pva.PoId = po.PoId AND pva.IsActive = 1
                  AND pv.Status = 'Approved' AND pv.IsActive = 1
            ), 0)
          + ISNULL((
                SELECT SUM(sil.LineTotal / si_t.AllSum * pva.AllocatedAmount)
                FROM proj.TBL_SUPPLIER_INVOICE_LINE       sil
                JOIN proj.TBL_PURCHASE_ORDER_LINE         pol ON pol.PoLineId = sil.PoLineId AND pol.PoId = po.PoId
                JOIN proj.TBL_PAYMENT_VOUCHER_ALLOCATION  pva ON pva.SupplierInvoiceId = sil.SupplierInvoiceId
                                                              AND pva.IsActive = 1 AND pva.PoId IS NULL
                JOIN proj.TBL_PAYMENT_VOUCHER             pv  ON pv.PvId = pva.PvId AND pv.Status = 'Approved' AND pv.IsActive = 1
                JOIN (SELECT SupplierInvoiceId, SUM(ISNULL(LineTotal,0)) AS AllSum
                      FROM proj.TBL_SUPPLIER_INVOICE_LINE WHERE IsActive = 1 GROUP BY SupplierInvoiceId) si_t
                    ON si_t.SupplierInvoiceId = sil.SupplierInvoiceId
                WHERE sil.IsActive = 1 AND si_t.AllSum > 0
            ), 0) AS PaidBase
    ) po_paid
    WHERE po.IsActive = 1
      AND (@SearchText IS NULL OR po.PoNumber    LIKE N'%'+@SearchText+N'%'
                               OR po.VendorRef   LIKE N'%'+@SearchText+N'%'
                               OR po.JobId       LIKE N'%'+@SearchText+N'%'
                               OR s.SupplierName LIKE N'%'+@SearchText+N'%'
                               OR s.SupplierCode LIKE N'%'+@SearchText+N'%')
      AND (@Status     IS NULL OR po.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Status, ','))
           OR (po.Status LIKE 'Pending%' AND EXISTS (SELECT 1 FROM proj.fn_PendingApprovalLevel('PO', po.PoId) pl WHERE EXISTS (SELECT 1 FROM STRING_SPLIT(@Status, ',') sv WHERE LTRIM(RTRIM(sv.value)) IN (N'PendingApproval', N'PendingL' + CAST(pl.LevelNo AS NVARCHAR(3)))))))
      AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
      AND (@JobId      IS NULL OR po.JobId      = @JobId)
      AND (@JobTypeIds IS NULL OR @JobTypeIds = '' OR EXISTS (
            SELECT 1 FROM PROJ.TBL_JOB j2
            WHERE j2.JobId = po.JobId
              AND j2.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, ','))))
      AND (@Priority   IS NULL OR po.Priority   = @Priority)
      AND (@CreatedBy  IS NULL OR po.CreatedBy LIKE N'%'+@CreatedBy+N'%')
      AND (@DateFrom   IS NULL OR CAST(po.CreatedDate AS DATE) >= @DateFrom)
      AND (@DateTo     IS NULL OR CAST(po.CreatedDate AS DATE) <= @DateTo)
      AND (@ExpenseCategoryId IS NULL OR po.ExpenseCategoryId = @ExpenseCategoryId)
      AND (@IsSubcontractOnly IS NULL OR (@IsSubcontractOnly = 1 AND ISNULL(ec.IsSubcontractOrder, 0) = 1))
      AND (@PrNumber IS NULL OR EXISTS (
            SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
            JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId AND prl.IsActive = 1
            JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
            WHERE pol.PoId = po.PoId AND pol.IsActive = 1 AND pr.PrNumber = @PrNumber))
    ORDER BY
        CASE WHEN @SortColumn=N'PoNumber'   AND @SortDirection=N'ASC'  THEN po.PoNumber   END ASC,
        CASE WHEN @SortColumn=N'PoNumber'   AND @SortDirection=N'DESC' THEN po.PoNumber   END DESC,
        CASE WHEN @SortColumn=N'VendorName' AND @SortDirection=N'ASC'  THEN po.VendorName END ASC,
        CASE WHEN @SortColumn=N'VendorName' AND @SortDirection=N'DESC' THEN po.VendorName END DESC,
        CASE WHEN @SortColumn=N'Status'     AND @SortDirection=N'ASC'  THEN po.Status     END ASC,
        CASE WHEN @SortColumn=N'Status'     AND @SortDirection=N'DESC' THEN po.Status     END DESC,
        CASE WHEN @SortColumn=N'PoDate'     AND @SortDirection=N'ASC'  THEN po.PoDate     END ASC,
        CASE WHEN @SortColumn=N'PoDate'     AND @SortDirection=N'DESC' THEN po.PoDate     END DESC,
        po.PoId DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO
