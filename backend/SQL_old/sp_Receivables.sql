-- ============================================================
-- Receivables Module – Stored Procedures
-- Schema  : proj
-- Tables assumed (adjust if your names differ):
--   proj.TBL_INVOICE          – Customer invoices
--   proj.TBL_RV_ALLOCATION    – Receipt Voucher allocations  (has IsActive)
--   proj.TBL_RECEIPT_VOUCHER  – Receipt Vouchers
--   proj.TBL_CN_ALLOCATION    – Credit Note allocations
--   proj.TBL_CREDIT_NOTE      – Credit Notes
--   proj.TBL_CUSTOMER         – Customer master
--   proj.TBL_CURRENCY         – Currency master  (has IsBaseCurrency)
-- ============================================================

-- ============================================================
-- 1. sp_GetReceivablesDashboard
--    Returns 4 result sets:
--      RS1 : KPI summary (one row)
--      RS2 : Aging buckets (one row)
--      RS3 : Monthly invoice vs receipt – last 12 months
--      RS4 : Top 10 overdue customers
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetReceivablesDashboard
    @CustomerId   INT      = NULL,
    @CurrencyId   INT      = NULL,
    @DateFrom     DATE     = NULL,
    @DateTo       DATE     = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Base CTE: outstanding invoices ───────────────────────────────────────
    ;WITH InvoiceBase AS (
        SELECT
            i.InvoiceId,
            i.InvoiceNo,
            i.InvoiceDate,
            i.DueDate,
            i.CustomerId,
            i.CurrencyId,
            i.ExchangeRate,
            i.TotalAmount,
            COALESCE(rv_paid.RvPaid, 0) + COALESCE(cn_paid.CnPaid, 0) AS TotalPaid,
            i.TotalAmount
                - COALESCE(rv_paid.RvPaid, 0)
                - COALESCE(cn_paid.CnPaid, 0)
            AS Outstanding,
            (i.TotalAmount
                - COALESCE(rv_paid.RvPaid, 0)
                - COALESCE(cn_paid.CnPaid, 0))
                * i.ExchangeRate
            AS OutstandingBase,
            CASE
                WHEN i.DueDate IS NULL OR i.DueDate >= CAST(GETDATE() AS DATE) THEN 0
                ELSE DATEDIFF(DAY, i.DueDate, GETDATE())
            END AS DaysOverdue
        FROM proj.TBL_INVOICE i
        -- RV allocations
        LEFT JOIN (
            SELECT a.InvoiceId,
                   SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RV_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled')
            GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        -- Credit note allocations
        LEFT JOIN (
            SELECT ca.InvoiceId,
                   SUM(ca.AllocatedAmount) AS CnPaid
            FROM proj.TBL_CN_ALLOCATION ca
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON ca.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled')
            GROUP BY ca.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1
          AND i.Status NOT IN ('Draft', 'Cancelled')
          AND (@CustomerId  IS NULL OR i.CustomerId  = @CustomerId)
          AND (@CurrencyId  IS NULL OR i.CurrencyId  = @CurrencyId)
          AND (@DateFrom    IS NULL OR i.InvoiceDate >= @DateFrom)
          AND (@DateTo      IS NULL OR i.InvoiceDate <= @DateTo)
    ),
    OpenInvoices AS (
        SELECT * FROM InvoiceBase WHERE Outstanding > 0
    )

    -- ── RS1: KPI Summary ─────────────────────────────────────────────────────
    SELECT
        ISNULL(SUM(OutstandingBase),  0) AS TotalReceivablesBase,
        ISNULL(SUM(CASE WHEN DaysOverdue > 0 THEN OutstandingBase ELSE 0 END), 0) AS OverdueAmount,
        COUNT(DISTINCT CustomerId)        AS TotalCustomers,
        COUNT(*)                          AS TotalInvoices
    FROM OpenInvoices;

    -- ── RS2: Aging Buckets ───────────────────────────────────────────────────
    SELECT
        ISNULL(SUM(CASE WHEN DaysOverdue = 0                           THEN OutstandingBase END), 0) AS CurrentAmount,
        ISNULL(SUM(CASE WHEN DaysOverdue BETWEEN  1 AND  30            THEN OutstandingBase END), 0) AS Amount0_30,
        ISNULL(SUM(CASE WHEN DaysOverdue BETWEEN 31 AND  60            THEN OutstandingBase END), 0) AS Amount31_60,
        ISNULL(SUM(CASE WHEN DaysOverdue BETWEEN 61 AND  90            THEN OutstandingBase END), 0) AS Amount61_90,
        ISNULL(SUM(CASE WHEN DaysOverdue > 90                          THEN OutstandingBase END), 0) AS Amount90Plus
    FROM OpenInvoices;

    -- ── RS3: Monthly Invoice vs Receipt – last 12 months ────────────────────
    WITH Months AS (
        SELECT TOP 12
            DATEFROMPARTS(YEAR(DATEADD(MONTH, -n.n, GETDATE())),
                          MONTH(DATEADD(MONTH, -n.n, GETDATE())), 1) AS MonthStart
        FROM (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11)) n(n)
    )
    SELECT
        FORMAT(m.MonthStart, 'MMM yy') AS MonthLabel,
        ISNULL(SUM(inv.TotalAmount * inv.ExchangeRate), 0) AS InvoiceAmount,
        ISNULL(SUM(rv_mo.ReceivedBase), 0)                 AS ReceiptAmount
    FROM Months m
    LEFT JOIN proj.TBL_INVOICE inv
           ON inv.IsActive = 1
          AND inv.Status NOT IN ('Draft','Cancelled')
          AND DATEFROMPARTS(YEAR(inv.InvoiceDate), MONTH(inv.InvoiceDate), 1) = m.MonthStart
          AND (@CustomerId IS NULL OR inv.CustomerId = @CustomerId)
    LEFT JOIN (
        SELECT
            DATEFROMPARTS(YEAR(rv.RvDate), MONTH(rv.RvDate), 1) AS MonthStart,
            SUM(rv.AmountReceived * rv.ExchangeRate)              AS ReceivedBase
        FROM proj.TBL_RECEIPT_VOUCHER rv
        WHERE rv.Status NOT IN ('Draft','Cancelled')
          AND (@CustomerId IS NULL OR rv.CustomerId = @CustomerId)
        GROUP BY DATEFROMPARTS(YEAR(rv.RvDate), MONTH(rv.RvDate), 1)
    ) rv_mo ON rv_mo.MonthStart = m.MonthStart
    GROUP BY m.MonthStart, FORMAT(m.MonthStart, 'MMM yy')
    ORDER BY m.MonthStart;

    -- ── RS4: Top 10 Overdue Customers ────────────────────────────────────────
    SELECT TOP 10
        o.CustomerId,
        c.CustomerName,
        SUM(CASE WHEN o.DaysOverdue > 0 THEN o.OutstandingBase ELSE 0 END) AS OverdueAmountBase,
        SUM(o.OutstandingBase) AS TotalOutstandingBase
    FROM OpenInvoices o
    INNER JOIN proj.TBL_CUSTOMER c ON o.CustomerId = c.CustomerId
    WHERE o.DaysOverdue > 0
    GROUP BY o.CustomerId, c.CustomerName
    ORDER BY OverdueAmountBase DESC;
END;
GO

-- ============================================================
-- 2. sp_GetCustomerReceivables
--    Paginated customer-wise outstanding summary
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetCustomerReceivables
    @SearchText   NVARCHAR(200) = NULL,
    @CustomerId   INT           = NULL,
    @CurrencyId   INT           = NULL,
    @Status       NVARCHAR(50)  = NULL,   -- 'Unpaid' | 'PartiallyPaid' | '' = all
    @DateFrom     DATE          = NULL,
    @DateTo       DATE          = NULL,
    @PageNumber   INT           = 1,
    @PageSize     INT           = 20,
    @SortColumn   NVARCHAR(50)  = 'TotalPendingBase',
    @SortDirection NVARCHAR(4)  = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH InvoiceOutstanding AS (
        SELECT
            i.InvoiceId,
            i.CustomerId,
            i.CurrencyId,
            i.TotalAmount,
            COALESCE(rv_paid.RvPaid, 0) + COALESCE(cn_paid.CnPaid, 0) AS TotalPaid,
            (i.TotalAmount - COALESCE(rv_paid.RvPaid, 0) - COALESCE(cn_paid.CnPaid, 0))
                * i.ExchangeRate AS OutstandingBase
        FROM proj.TBL_INVOICE i
        LEFT JOIN (
            SELECT a.InvoiceId,
                   SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RV_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled')
            GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT ca.InvoiceId, SUM(ca.AllocatedAmount) AS CnPaid
            FROM proj.TBL_CN_ALLOCATION ca
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON ca.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled')
            GROUP BY ca.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1
          AND i.Status NOT IN ('Draft','Cancelled')
          AND (@CurrencyId IS NULL OR i.CurrencyId = @CurrencyId)
          AND (@DateFrom   IS NULL OR i.InvoiceDate >= @DateFrom)
          AND (@DateTo     IS NULL OR i.InvoiceDate <= @DateTo)
    ),
    CustomerSummary AS (
        SELECT
            c.CustomerId,
            c.CustomerName,
            c.CustomerCode,
            COUNT(io.InvoiceId)                                          AS TotalInvoiceCount,
            SUM(CASE WHEN io.TotalPaid = 0 THEN 1 ELSE 0 END)           AS UnpaidCount,
            SUM(CASE WHEN io.TotalPaid > 0
                      AND io.TotalPaid < io.TotalAmount THEN 1 ELSE 0 END) AS PartiallyPaidCount,
            ISNULL(SUM(io.TotalAmount), 0)                               AS TotalInvoiceAmount,
            ISNULL(SUM(io.TotalPaid), 0)                                 AS TotalReceivedAmount,
            ISNULL(SUM(io.OutstandingBase), 0)                           AS TotalPendingBase,
            ISNULL(SUM(CASE WHEN DATEDIFF(DAY,
                        (SELECT MIN(i2.DueDate) FROM proj.TBL_INVOICE i2 WHERE i2.InvoiceId = io.InvoiceId),
                        GETDATE()) > 0 THEN io.OutstandingBase ELSE 0 END), 0) AS OverdueAmountBase
        FROM InvoiceOutstanding io
        INNER JOIN proj.TBL_CUSTOMER c ON io.CustomerId = c.CustomerId
        WHERE io.OutstandingBase > 0
          AND (@CustomerId IS NULL OR io.CustomerId = @CustomerId)
          AND (@SearchText IS NULL OR c.CustomerName LIKE '%' + @SearchText + '%'
                                   OR c.CustomerCode LIKE '%' + @SearchText + '%')
          AND (
              @Status IS NULL OR @Status = ''
              OR (@Status = 'Unpaid'       AND SUM(CASE WHEN io.TotalPaid = 0 THEN 1 ELSE 0 END) > 0)
              OR (@Status = 'PartiallyPaid' AND SUM(CASE WHEN io.TotalPaid > 0
                                                          AND io.TotalPaid < io.TotalAmount THEN 1 ELSE 0 END) > 0)
          )
        GROUP BY c.CustomerId, c.CustomerName, c.CustomerCode
        HAVING ISNULL(SUM(io.OutstandingBase), 0) > 0
    ),
    Filtered AS (
        SELECT *,
               COUNT(*) OVER () AS TotalRows
        FROM CustomerSummary
    )
    SELECT *
    FROM Filtered
    ORDER BY
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn
                WHEN 'CustomerName'       THEN CustomerName
                ELSE NULL
            END
        END ASC,
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn
                WHEN 'TotalPendingBase'   THEN TotalPendingBase
                WHEN 'TotalInvoiceAmount' THEN TotalInvoiceAmount
                WHEN 'TotalInvoiceCount'  THEN CAST(TotalInvoiceCount AS DECIMAL(18,2))
                WHEN 'OverdueAmountBase'  THEN OverdueAmountBase
                ELSE TotalPendingBase
            END
        END ASC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn
                WHEN 'CustomerName'       THEN CustomerName
                ELSE NULL
            END
        END DESC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn
                WHEN 'TotalPendingBase'   THEN TotalPendingBase
                WHEN 'TotalInvoiceAmount' THEN TotalInvoiceAmount
                WHEN 'TotalInvoiceCount'  THEN CAST(TotalInvoiceCount AS DECIMAL(18,2))
                WHEN 'OverdueAmountBase'  THEN OverdueAmountBase
                ELSE TotalPendingBase
            END
        END DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ============================================================
-- 3. sp_GetCustomerInvoiceReceivables
--    Invoice list for a specific customer with outstanding amounts
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetCustomerInvoiceReceivables
    @CustomerId    INT           = NULL,
    @InvoiceNo     NVARCHAR(50)  = NULL,
    @JobId         NVARCHAR(50)  = NULL,
    @CurrencyId    INT           = NULL,
    @Status        NVARCHAR(50)  = NULL,   -- 'Unpaid' | 'PartiallyPaid'
    @DateFrom      DATE          = NULL,
    @DateTo        DATE          = NULL,
    @DueDateFrom   DATE          = NULL,
    @DueDateTo     DATE          = NULL,
    @PageNumber    INT           = 1,
    @PageSize      INT           = 50,
    @SortColumn    NVARCHAR(50)  = 'InvoiceDate',
    @SortDirection NVARCHAR(4)   = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH InvData AS (
        SELECT
            i.InvoiceId,
            i.InvoiceNo,
            i.InvoiceDate,
            i.DueDate,
            i.CustomerId,
            i.CurrencyId,
            cur.ShortName          AS CurrencyShort,
            i.ExchangeRate,
            i.TotalAmount          AS InvoiceAmount,
            i.TotalAmount * i.ExchangeRate AS InvoiceAmountBase,
            COALESCE(rv_paid.RvPaid, 0) + COALESCE(cn_paid.CnPaid, 0) AS ReceivedAmount,
            i.TotalAmount - COALESCE(rv_paid.RvPaid, 0) - COALESCE(cn_paid.CnPaid, 0) AS PendingAmount,
            (i.TotalAmount - COALESCE(rv_paid.RvPaid, 0) - COALESCE(cn_paid.CnPaid, 0))
                * i.ExchangeRate   AS PendingAmountBase,
            CASE
                WHEN COALESCE(rv_paid.RvPaid, 0) + COALESCE(cn_paid.CnPaid, 0) = 0
                     THEN 'Unpaid'
                ELSE 'PartiallyPaid'
            END AS PaymentStatus,
            i.JobId,
            CASE
                WHEN i.DueDate IS NULL OR i.DueDate >= CAST(GETDATE() AS DATE) THEN 0
                ELSE DATEDIFF(DAY, i.DueDate, GETDATE())
            END AS DaysOverdue
        FROM proj.TBL_INVOICE i
        LEFT JOIN proj.TBL_CURRENCY cur ON i.CurrencyId = cur.CurrencyId
        LEFT JOIN (
            SELECT a.InvoiceId,
                   SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RV_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled')
            GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT ca.InvoiceId, SUM(ca.AllocatedAmount) AS CnPaid
            FROM proj.TBL_CN_ALLOCATION ca
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON ca.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled')
            GROUP BY ca.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1
          AND i.Status NOT IN ('Draft','Cancelled')
          AND (@CustomerId  IS NULL OR i.CustomerId  = @CustomerId)
          AND (@InvoiceNo   IS NULL OR i.InvoiceNo LIKE '%' + @InvoiceNo + '%')
          AND (@JobId       IS NULL OR i.JobId     LIKE '%' + @JobId + '%')
          AND (@CurrencyId  IS NULL OR i.CurrencyId = @CurrencyId)
          AND (@DateFrom    IS NULL OR i.InvoiceDate >= @DateFrom)
          AND (@DateTo      IS NULL OR i.InvoiceDate <= @DateTo)
          AND (@DueDateFrom IS NULL OR i.DueDate   >= @DueDateFrom)
          AND (@DueDateTo   IS NULL OR i.DueDate   <= @DueDateTo)
    ),
    Filtered AS (
        SELECT *,
               COUNT(*) OVER () AS TotalRows
        FROM InvData
        WHERE PendingAmount > 0
          AND (
              @Status IS NULL OR @Status = ''
              OR PaymentStatus = @Status
          )
    )
    SELECT *
    FROM Filtered
    ORDER BY
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn
                WHEN 'InvoiceNo'       THEN InvoiceNo
                WHEN 'PaymentStatus'   THEN PaymentStatus
                ELSE NULL
            END
        END ASC,
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn
                WHEN 'InvoiceDate'     THEN CAST(InvoiceDate     AS FLOAT)
                WHEN 'DueDate'         THEN CAST(DueDate         AS FLOAT)
                WHEN 'PendingAmount'   THEN PendingAmount
                WHEN 'PendingAmountBase' THEN PendingAmountBase
                WHEN 'DaysOverdue'     THEN CAST(DaysOverdue     AS FLOAT)
                ELSE CAST(InvoiceDate AS FLOAT)
            END
        END ASC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn
                WHEN 'InvoiceNo'       THEN InvoiceNo
                WHEN 'PaymentStatus'   THEN PaymentStatus
                ELSE NULL
            END
        END DESC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn
                WHEN 'InvoiceDate'     THEN CAST(InvoiceDate     AS FLOAT)
                WHEN 'DueDate'         THEN CAST(DueDate         AS FLOAT)
                WHEN 'PendingAmount'   THEN PendingAmount
                WHEN 'PendingAmountBase' THEN PendingAmountBase
                WHEN 'DaysOverdue'     THEN CAST(DaysOverdue     AS FLOAT)
                ELSE CAST(InvoiceDate AS FLOAT)
            END
        END DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ============================================================
-- 4. sp_GetInvoiceReceiptAllocations
--    All receipt voucher and credit note allocations for one invoice
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetInvoiceReceiptAllocations
    @InvoiceId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Receipt Voucher allocations
    SELECT
        a.AllocationId,
        rv.RvNumber,
        rv.RvDate,
        cur.ShortName   AS RvCurrencyShort,
        rv.ExchangeRate AS RvExchangeRate,
        a.AllocatedAmount,
        a.AllocatedAmount * rv.ExchangeRate AS AllocatedAmountBase,
        'RV'            AS SourceType,
        a.CreatedBy,
        a.CreatedDate
    FROM proj.TBL_RV_ALLOCATION a
    INNER JOIN proj.TBL_RECEIPT_VOUCHER rv  ON a.RvId       = rv.RvId
    LEFT  JOIN proj.TBL_CURRENCY         cur ON rv.CurrencyId = cur.CurrencyId
    WHERE a.InvoiceId = @InvoiceId
      AND a.IsActive  = 1
      AND rv.Status NOT IN ('Cancelled')

    UNION ALL

    -- Credit Note allocations
    SELECT
        ca.AllocationId,
        cn.CnNumber     AS RvNumber,
        cn.CnDate       AS RvDate,
        cur.ShortName   AS RvCurrencyShort,
        cn.ExchangeRate AS RvExchangeRate,
        ca.AllocatedAmount,
        ca.AllocatedAmount * cn.ExchangeRate AS AllocatedAmountBase,
        'CN'            AS SourceType,
        ca.CreatedBy,
        ca.CreatedDate
    FROM proj.TBL_CN_ALLOCATION ca
    INNER JOIN proj.TBL_CREDIT_NOTE cn   ON ca.CnId       = cn.CnId
    LEFT  JOIN proj.TBL_CURRENCY    cur  ON cn.CurrencyId  = cur.CurrencyId
    WHERE ca.InvoiceId = @InvoiceId
      AND cn.Status NOT IN ('Cancelled')

    ORDER BY CreatedDate DESC;
END;
GO

-- ============================================================
-- 5. sp_GetCustomerPaymentHistory
--    Payment summary and history for one customer
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetCustomerPaymentHistory
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH InvoiceTotals AS (
        SELECT
            i.InvoiceId,
            i.TotalAmount * i.ExchangeRate AS InvoiceBase,
            COALESCE(rv_paid.RvPaid, 0) + COALESCE(cn_paid.CnPaid, 0) AS TotalPaid,
            (i.TotalAmount - COALESCE(rv_paid.RvPaid, 0) - COALESCE(cn_paid.CnPaid, 0))
                * i.ExchangeRate AS OutstandingBase,
            CASE
                WHEN i.DueDate IS NULL OR i.DueDate >= CAST(GETDATE() AS DATE) THEN 0
                ELSE DATEDIFF(DAY, i.DueDate, GETDATE())
            END AS DaysOverdue
        FROM proj.TBL_INVOICE i
        LEFT JOIN (
            SELECT a.InvoiceId,
                   SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RV_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled')
            GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT ca.InvoiceId, SUM(ca.AllocatedAmount) AS CnPaid
            FROM proj.TBL_CN_ALLOCATION ca
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON ca.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled')
            GROUP BY ca.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive    = 1
          AND i.Status NOT IN ('Draft','Cancelled')
          AND i.CustomerId  = @CustomerId
    )
    -- RS1: Summary row
    SELECT
        SUM(InvoiceBase)                                          AS InvoicesRaised,
        SUM(TotalPaid *
            (SELECT ExchangeRate FROM proj.TBL_INVOICE WHERE InvoiceId = it.InvoiceId)) AS ReceiptsReceived,
        SUM(OutstandingBase)                                      AS OutstandingBalance,
        SUM(CASE WHEN DaysOverdue > 0 THEN OutstandingBase ELSE 0 END) AS OverdueAmount
    FROM InvoiceTotals it;

    -- RS2: RV receipt history for this customer
    SELECT
        rv.RvNumber,
        rv.RvDate,
        cur.ShortName   AS CurrencyShort,
        rv.ExchangeRate,
        rv.AmountReceived,
        rv.AmountReceived * rv.ExchangeRate AS AmountBase,
        rv.AllocatedAmount,
        rv.AllocatedAmount * rv.ExchangeRate AS AllocatedBase,
        rv.Status,
        rv.PaymentMode,
        rv.CreatedBy,
        rv.CreatedDate
    FROM proj.TBL_RECEIPT_VOUCHER rv
    LEFT JOIN proj.TBL_CURRENCY cur ON rv.CurrencyId = cur.CurrencyId
    WHERE rv.CustomerId = @CustomerId
      AND rv.Status NOT IN ('Cancelled')
    ORDER BY rv.RvDate DESC;
END;
GO

-- ============================================================
-- 6. sp_GetReceivablesAging
--    Per-customer aging analysis
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetReceivablesAging
    @SearchText    NVARCHAR(200) = NULL,
    @CustomerId    INT           = NULL,
    @PageNumber    INT           = 1,
    @PageSize      INT           = 20,
    @SortColumn    NVARCHAR(50)  = 'Total',
    @SortDirection NVARCHAR(4)   = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH InvoiceAge AS (
        SELECT
            i.CustomerId,
            CASE
                WHEN i.DueDate IS NULL OR i.DueDate >= CAST(GETDATE() AS DATE) THEN 'Current'
                WHEN DATEDIFF(DAY, i.DueDate, GETDATE()) BETWEEN  1 AND  30    THEN '0_30'
                WHEN DATEDIFF(DAY, i.DueDate, GETDATE()) BETWEEN 31 AND  60    THEN '31_60'
                WHEN DATEDIFF(DAY, i.DueDate, GETDATE()) BETWEEN 61 AND  90    THEN '61_90'
                ELSE '90Plus'
            END AS AgingBucket,
            (i.TotalAmount - COALESCE(rv_paid.RvPaid, 0) - COALESCE(cn_paid.CnPaid, 0))
                * i.ExchangeRate AS OutstandingBase
        FROM proj.TBL_INVOICE i
        LEFT JOIN (
            SELECT a.InvoiceId,
                   SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RV_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled')
            GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT ca.InvoiceId, SUM(ca.AllocatedAmount) AS CnPaid
            FROM proj.TBL_CN_ALLOCATION ca
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON ca.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled')
            GROUP BY ca.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1
          AND i.Status NOT IN ('Draft','Cancelled')
          AND i.TotalAmount - COALESCE(rv_paid.RvPaid,0) - COALESCE(cn_paid.CnPaid,0) > 0
    ),
    AgingPivot AS (
        SELECT
            c.CustomerId,
            c.CustomerName,
            ISNULL(SUM(CASE WHEN ia.AgingBucket = 'Current' THEN ia.OutstandingBase END), 0) AS [Current],
            ISNULL(SUM(CASE WHEN ia.AgingBucket = '0_30'    THEN ia.OutstandingBase END), 0) AS Days0_30,
            ISNULL(SUM(CASE WHEN ia.AgingBucket = '31_60'   THEN ia.OutstandingBase END), 0) AS Days31_60,
            ISNULL(SUM(CASE WHEN ia.AgingBucket = '61_90'   THEN ia.OutstandingBase END), 0) AS Days61_90,
            ISNULL(SUM(CASE WHEN ia.AgingBucket = '90Plus'  THEN ia.OutstandingBase END), 0) AS Days90Plus,
            ISNULL(SUM(ia.OutstandingBase), 0) AS Total
        FROM InvoiceAge ia
        INNER JOIN proj.TBL_CUSTOMER c ON ia.CustomerId = c.CustomerId
        WHERE (@CustomerId  IS NULL OR ia.CustomerId = @CustomerId)
          AND (@SearchText  IS NULL OR c.CustomerName LIKE '%' + @SearchText + '%')
        GROUP BY c.CustomerId, c.CustomerName
    ),
    WithCount AS (
        SELECT *, COUNT(*) OVER () AS TotalRows
        FROM AgingPivot
    )
    SELECT * FROM WithCount
    ORDER BY
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn WHEN 'CustomerName' THEN CustomerName ELSE NULL END
        END ASC,
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn
                WHEN 'Total'      THEN Total
                WHEN 'Current'    THEN [Current]
                WHEN 'Days0_30'   THEN Days0_30
                WHEN 'Days31_60'  THEN Days31_60
                WHEN 'Days61_90'  THEN Days61_90
                WHEN 'Days90Plus' THEN Days90Plus
                ELSE Total
            END
        END ASC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn WHEN 'CustomerName' THEN CustomerName ELSE NULL END
        END DESC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn
                WHEN 'Total'      THEN Total
                WHEN 'Current'    THEN [Current]
                WHEN 'Days0_30'   THEN Days0_30
                WHEN 'Days31_60'  THEN Days31_60
                WHEN 'Days61_90'  THEN Days61_90
                WHEN 'Days90Plus' THEN Days90Plus
                ELSE Total
            END
        END DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
GO
