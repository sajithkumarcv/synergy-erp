-- ============================================================
-- Missing Report Stored Procedures
-- Schema: proj
-- ============================================================

-- ── 1. INVENTORY GRN (Stock Receipt) REPORT ─────────────────
CREATE OR ALTER PROCEDURE proj.sp_ReportInventoryGRN
    @DateFrom    DATE          = NULL,
    @DateTo      DATE          = NULL,
    @Status      NVARCHAR(50)  = NULL,
    @ReceiptType NVARCHAR(20)  = NULL,
    @JobId       NVARCHAR(50)  = NULL,
    @CreatedBy   NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        r.ReceiptId,
        r.ReceiptNo,
        r.ReceiptDate,
        r.ReceiptType,
        r.JobId,
        r.SupplierName,
        r.PoNumber,
        r.SupplierRef,
        r.Status,
        r.Notes,
        r.CreatedBy,
        r.CreatedDate,
        COUNT(l.ReceiptLineId)                          AS LineCount,
        ISNULL(SUM(l.Qty * l.UnitCost), 0)             AS TotalCost
    FROM  proj.TBL_STOCK_RECEIPT r
    LEFT JOIN proj.TBL_STOCK_RECEIPT_LINE l
           ON l.ReceiptId = r.ReceiptId AND ISNULL(l.IsActive, 1) = 1
    WHERE r.IsActive = 1
      AND (@DateFrom    IS NULL OR r.ReceiptDate >= @DateFrom)
      AND (@DateTo      IS NULL OR r.ReceiptDate <= @DateTo)
      AND (@Status      IS NULL OR r.Status      =  @Status)
      AND (@ReceiptType IS NULL OR r.ReceiptType =  @ReceiptType)
      AND (@JobId       IS NULL OR r.JobId       =  @JobId)
      AND (@CreatedBy   IS NULL OR r.CreatedBy LIKE N'%' + @CreatedBy + N'%')
    GROUP BY
        r.ReceiptId, r.ReceiptNo, r.ReceiptDate, r.ReceiptType, r.JobId,
        r.SupplierName, r.PoNumber, r.SupplierRef, r.Status, r.Notes,
        r.CreatedBy, r.CreatedDate
    ORDER BY r.ReceiptDate DESC, r.ReceiptId DESC;
END
GO

-- ── 2. STOCK ADJUSTMENT REPORT ───────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_ReportStockAdjustments
    @DateFrom  DATE          = NULL,
    @DateTo    DATE          = NULL,
    @Status    NVARCHAR(50)  = NULL,
    @Reason    NVARCHAR(200) = NULL,
    @CreatedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        a.AdjustmentId,
        a.AdjustmentNo,
        a.AdjustmentDate,
        a.Reason,
        a.Notes,
        a.Status,
        a.PostedBy,
        a.PostedDate,
        a.CreatedBy,
        a.CreatedDate,
        COUNT(l.AdjustmentLineId)                                AS LineCount,
        ISNULL(SUM(ABS(l.AdjustQty) * ISNULL(l.UnitCost, 0)), 0) AS TotalValue
    FROM  proj.TBL_STOCK_ADJUSTMENT a
    LEFT JOIN proj.TBL_STOCK_ADJUSTMENT_LINE l
           ON l.AdjustmentId = a.AdjustmentId AND ISNULL(l.IsActive, 1) = 1
    WHERE a.IsActive = 1
      AND (@DateFrom IS NULL OR a.AdjustmentDate >= @DateFrom)
      AND (@DateTo   IS NULL OR a.AdjustmentDate <= @DateTo)
      AND (@Status   IS NULL OR a.Status  = @Status)
      AND (@Reason   IS NULL OR a.Reason  = @Reason)
      AND (@CreatedBy IS NULL OR a.CreatedBy LIKE N'%' + @CreatedBy + N'%')
    GROUP BY
        a.AdjustmentId, a.AdjustmentNo, a.AdjustmentDate, a.Reason, a.Notes,
        a.Status, a.PostedBy, a.PostedDate, a.CreatedBy, a.CreatedDate
    ORDER BY a.AdjustmentDate DESC, a.AdjustmentId DESC;
END
GO

-- ── 3. SUPPLIER INVOICE REPORT ───────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_ReportSupplierInvoices
    @DateFrom   DATE          = NULL,
    @DateTo     DATE          = NULL,
    @SupplierId INT           = NULL,
    @Status     NVARCHAR(50)  = NULL,
    @CreatedBy  NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        si.SupplierInvoiceId,
        si.InvoiceNo,
        si.SupplierInvRef,
        si.InvoiceDate,
        si.SupplierId,
        s.SupplierName,
        cur.ShortName                              AS CurrencyShort,
        si.ExchangeRate,
        si.DueDate,
        si.SubTotal,
        si.TaxAmount,
        si.TotalAmount,
        ISNULL(pva.PaidAmount, 0)                 AS PaidAmount,
        si.TotalAmount - ISNULL(pva.PaidAmount, 0) AS BalanceAmount,
        si.Status,
        si.Notes,
        si.CreatedBy,
        si.CreatedDate
    FROM proj.TBL_SUPPLIER_INVOICE si
    JOIN  proj.TBL_SUPPLIER s   ON s.SupplierId   = si.SupplierId
    LEFT JOIN proj.TBL_CURRENCY cur ON cur.CurrencyId = si.CurrencyId
    LEFT JOIN (
        SELECT SupplierInvoiceId, SUM(AllocatedAmount) AS PaidAmount
        FROM   proj.TBL_PAYMENT_VOUCHER_ALLOCATION
        WHERE  ISNULL(IsActive, 1) = 1
        GROUP BY SupplierInvoiceId
    ) pva ON pva.SupplierInvoiceId = si.SupplierInvoiceId
    WHERE si.IsActive = 1
      AND (@DateFrom   IS NULL OR si.InvoiceDate >= @DateFrom)
      AND (@DateTo     IS NULL OR si.InvoiceDate <= @DateTo)
      AND (@SupplierId IS NULL OR si.SupplierId  =  @SupplierId)
      AND (@Status     IS NULL OR si.Status      =  @Status)
      AND (@CreatedBy  IS NULL OR si.CreatedBy LIKE N'%' + @CreatedBy + N'%')
    ORDER BY si.InvoiceDate DESC, si.SupplierInvoiceId DESC;
END
GO

-- ── 4. PAYMENT VOUCHER REPORT ────────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_ReportPaymentVouchers
    @DateFrom    DATE          = NULL,
    @DateTo      DATE          = NULL,
    @SupplierId  INT           = NULL,
    @Status      NVARCHAR(50)  = NULL,
    @CreatedBy   NVARCHAR(100) = NULL,
    @PaymentMode NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        pv.PvId,
        pv.PvNumber,
        pv.PvDate,
        pv.SupplierId,
        s.SupplierName,
        cur.ShortName                                       AS CurrencyShort,
        pv.ExchangeRate,
        pv.AmountPaid,
        ISNULL(pv.AllocatedAmount, 0)                      AS AllocatedAmount,
        pv.AmountPaid - ISNULL(pv.AllocatedAmount, 0)     AS UnallocatedAmount,
        pv.PaymentMode,
        pv.ReferenceNo,
        pv.ReferenceDate,
        pv.BankName,
        pv.Status,
        pv.CreatedBy,
        pv.CreatedDate
    FROM proj.TBL_PAYMENT_VOUCHER pv
    JOIN  proj.TBL_SUPPLIER s   ON s.SupplierId   = pv.SupplierId
    LEFT JOIN proj.TBL_CURRENCY cur ON cur.CurrencyId = pv.CurrencyId
    WHERE pv.IsActive = 1
      AND (@DateFrom    IS NULL OR pv.PvDate      >= @DateFrom)
      AND (@DateTo      IS NULL OR pv.PvDate      <= @DateTo)
      AND (@SupplierId  IS NULL OR pv.SupplierId  =  @SupplierId)
      AND (@Status      IS NULL OR pv.Status      =  @Status)
      AND (@CreatedBy   IS NULL OR pv.CreatedBy LIKE N'%' + @CreatedBy + N'%')
      AND (@PaymentMode IS NULL OR pv.PaymentMode =  @PaymentMode)
    ORDER BY pv.PvDate DESC, pv.PvId DESC;
END
GO

-- ── 5. MANHOUR REPORT ────────────────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_ReportManhours
    @DateFrom  DATE          = NULL,
    @DateTo    DATE          = NULL,
    @JobId     NVARCHAR(50)  = NULL,
    @Status    NVARCHAR(50)  = NULL,
    @CreatedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        m.BatchId,
        m.DocumentNo,
        m.DocumentDate,
        m.Status,
        m.UploadedFileName,
        m.CreatedBy,
        m.CreatedDate,
        COUNT(DISTINCT m.JobId)      AS JobCount,
        COUNT(DISTINCT m.EmployeeId) AS EmployeeCount,
        SUM(ISNULL(m.Hours, 0))          AS TotalHours,
        SUM(ISNULL(m.OvertimeHours, 0))  AS TotalOTHours
    FROM proj.TBL_MANHOUR m
    WHERE m.IsActive = 1
      AND (@DateFrom IS NULL OR m.DocumentDate >= @DateFrom)
      AND (@DateTo   IS NULL OR m.DocumentDate <= @DateTo)
      AND (@JobId    IS NULL OR m.JobId        =  @JobId)
      AND (@Status   IS NULL OR m.Status       =  @Status)
      AND (@CreatedBy IS NULL OR m.CreatedBy LIKE N'%' + @CreatedBy + N'%')
    GROUP BY
        m.BatchId, m.DocumentNo, m.DocumentDate, m.Status,
        m.UploadedFileName, m.CreatedBy, m.CreatedDate
    ORDER BY m.DocumentDate DESC, m.BatchId DESC;
END
GO
