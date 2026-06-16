-- ============================================================
-- Payables Module – Stored Procedures
-- Schema  : proj
-- Tables  :
--   proj.TBL_SUPPLIER_INVOICE          – Supplier invoices
--   proj.TBL_PAYMENT_VOUCHER_ALLOCATION – PV allocations (has IsActive)
--   proj.TBL_PAYMENT_VOUCHER           – Payment Vouchers
--   proj.TBL_SUPPLIER                  – Supplier master
--   proj.TBL_CURRENCY                  – Currency master (has IsBaseCurrency)
-- ============================================================

-- ============================================================
-- 1. sp_GetPayablesDashboard
--    Returns 4 result sets:
--      RS1 : KPI summary (one row)
--      RS2 : Aging buckets (one row)
--      RS3 : Monthly invoice vs payment – last 12 months
--      RS4 : Top 10 overdue suppliers
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetPayablesDashboard
    @SupplierId   INT      = NULL,
    @CurrencyId   INT      = NULL,
    @DateFrom     DATE     = NULL,
    @DateTo       DATE     = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Base CTE: outstanding supplier invoices ──────────────────────────────
    ;WITH InvoiceBase AS (
        SELECT
            si.SupplierInvoiceId,
            si.InvoiceDate,
            si.DueDate,
            si.SupplierId,
            si.CurrencyId,
            si.ExchangeRate,
            si.TotalAmount,
            COALESCE(pva.PaidAmount, 0)                             AS TotalPaid,
            si.TotalAmount - COALESCE(pva.PaidAmount, 0)           AS Outstanding,
            (si.TotalAmount - COALESCE(pva.PaidAmount, 0))
                * si.ExchangeRate                                    AS OutstandingBase,
            CASE
                WHEN si.DueDate IS NULL OR si.DueDate >= CAST(GETDATE() AS DATE) THEN 0
                ELSE DATEDIFF(DAY, si.DueDate, GETDATE())
            END AS DaysOverdue
        FROM proj.TBL_SUPPLIER_INVOICE si
        LEFT JOIN (
            SELECT SupplierInvoiceId,
                   SUM(CASE WHEN ISNULL(IsActive, 1) = 1 THEN AllocatedAmount ELSE 0 END) AS PaidAmount
            FROM proj.TBL_PAYMENT_VOUCHER_ALLOCATION
            GROUP BY SupplierInvoiceId
        ) pva ON pva.SupplierInvoiceId = si.SupplierInvoiceId
        WHERE si.IsActive = 1
          AND si.Status NOT IN ('Draft', 'Cancelled')
          AND (@SupplierId IS NULL OR si.SupplierId  = @SupplierId)
          AND (@CurrencyId IS NULL OR si.CurrencyId  = @CurrencyId)
          AND (@DateFrom   IS NULL OR si.InvoiceDate >= @DateFrom)
          AND (@DateTo     IS NULL OR si.InvoiceDate <= @DateTo)
          AND si.TotalAmount - COALESCE(pva.PaidAmount, 0) > 0
    )

    -- RS1: KPI
    SELECT
        ISNULL(SUM(OutstandingBase),  0) AS TotalPayablesBase,
        ISNULL(SUM(CASE WHEN DaysOverdue > 0 THEN OutstandingBase ELSE 0 END), 0) AS OverdueAmount,
        COUNT(DISTINCT SupplierId)       AS TotalSuppliers,
        COUNT(*)                         AS TotalInvoices
    FROM InvoiceBase;

    -- RS2: Aging buckets
    SELECT
        ISNULL(SUM(CASE WHEN DaysOverdue = 0 THEN OutstandingBase ELSE 0 END), 0) AS CurrentAmount,
        ISNULL(SUM(CASE WHEN DaysOverdue BETWEEN  1 AND  30 THEN OutstandingBase ELSE 0 END), 0) AS Amount0_30,
        ISNULL(SUM(CASE WHEN DaysOverdue BETWEEN 31 AND  60 THEN OutstandingBase ELSE 0 END), 0) AS Amount31_60,
        ISNULL(SUM(CASE WHEN DaysOverdue BETWEEN 61 AND  90 THEN OutstandingBase ELSE 0 END), 0) AS Amount61_90,
        ISNULL(SUM(CASE WHEN DaysOverdue > 90               THEN OutstandingBase ELSE 0 END), 0) AS Amount90Plus
    FROM InvoiceBase;

    -- RS3: Monthly invoice vs payment (last 12 months)
    ;WITH Months AS (
        SELECT TOP 12
            DATEFROMPARTS(YEAR(DATEADD(MONTH, -n, GETDATE())),
                          MONTH(DATEADD(MONTH, -n, GETDATE())), 1) AS MonthStart
        FROM (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11)) v(n)
    ),
    MonthlyInvoices AS (
        SELECT
            DATEFROMPARTS(YEAR(si.InvoiceDate), MONTH(si.InvoiceDate), 1) AS MonthStart,
            SUM(si.TotalAmount * si.ExchangeRate) AS InvoiceAmount
        FROM proj.TBL_SUPPLIER_INVOICE si
        WHERE si.IsActive = 1
          AND si.Status NOT IN ('Draft', 'Cancelled')
          AND si.InvoiceDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
          AND (@SupplierId IS NULL OR si.SupplierId = @SupplierId)
          AND (@CurrencyId IS NULL OR si.CurrencyId = @CurrencyId)
        GROUP BY DATEFROMPARTS(YEAR(si.InvoiceDate), MONTH(si.InvoiceDate), 1)
    ),
    MonthlyPayments AS (
        SELECT
            DATEFROMPARTS(YEAR(pv.PvDate), MONTH(pv.PvDate), 1) AS MonthStart,
            SUM(pv.AmountPaid * pv.ExchangeRate) AS PaymentAmount
        FROM proj.TBL_PAYMENT_VOUCHER pv
        WHERE pv.IsActive = 1
          AND pv.Status = 'Posted'
          AND pv.PvDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
          AND (@SupplierId IS NULL OR pv.SupplierId = @SupplierId)
        GROUP BY DATEFROMPARTS(YEAR(pv.PvDate), MONTH(pv.PvDate), 1)
    )
    SELECT
        FORMAT(m.MonthStart, 'MMM yy')               AS MonthLabel,
        ISNULL(i.InvoiceAmount,  0)                  AS InvoiceAmount,
        ISNULL(p.PaymentAmount,  0)                  AS PaymentAmount
    FROM Months m
    LEFT JOIN MonthlyInvoices  i ON i.MonthStart = m.MonthStart
    LEFT JOIN MonthlyPayments  p ON p.MonthStart = m.MonthStart
    ORDER BY m.MonthStart;

    -- RS4: Top 10 overdue suppliers
    SELECT TOP 10
        s.SupplierId,
        s.SupplierName,
        SUM(CASE WHEN ib.DaysOverdue > 0 THEN ib.OutstandingBase ELSE 0 END) AS OverdueAmountBase,
        SUM(ib.OutstandingBase)                                                AS TotalOutstandingBase
    FROM InvoiceBase ib
    JOIN proj.TBL_SUPPLIER s ON s.SupplierId = ib.SupplierId
    WHERE ib.DaysOverdue > 0
    GROUP BY s.SupplierId, s.SupplierName
    ORDER BY OverdueAmountBase DESC;
END
GO

-- ============================================================
-- 2. sp_GetSupplierPayables
--    Paginated list of suppliers with outstanding payables.
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetSupplierPayables
    @SearchText   NVARCHAR(200) = NULL,
    @SupplierId   INT           = NULL,
    @CurrencyId   INT           = NULL,
    @Status       NVARCHAR(50)  = NULL,   -- 'Unpaid' | 'PartiallyPaid'
    @DateFrom     DATE          = NULL,
    @DateTo       DATE          = NULL,
    @PageNumber   INT           = 1,
    @PageSize     INT           = 20,
    @SortColumn   NVARCHAR(100) = N'TotalPendingBase',
    @SortDirection NVARCHAR(4)  = N'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH InvoiceCalc AS (
        SELECT
            si.SupplierInvoiceId,
            si.SupplierId,
            si.CurrencyId,
            cur.ShortName                                                AS CurrencyShort,
            si.TotalAmount,
            si.TotalAmount * si.ExchangeRate                             AS TotalAmountBase,
            COALESCE(pva.PaidAmount, 0)                                  AS PaidAmount,
            COALESCE(pva.PaidAmount, 0) * si.ExchangeRate               AS PaidAmountBase,
            (si.TotalAmount - COALESCE(pva.PaidAmount, 0))              AS PendingAmount,
            (si.TotalAmount - COALESCE(pva.PaidAmount, 0))
                * si.ExchangeRate                                         AS PendingAmountBase,
            CASE
                WHEN COALESCE(pva.PaidAmount, 0) = 0 THEN 'Unpaid'
                ELSE 'PartiallyPaid'
            END AS PaymentStatus,
            CASE
                WHEN si.DueDate < CAST(GETDATE() AS DATE)
                     AND si.DueDate IS NOT NULL
                THEN (si.TotalAmount - COALESCE(pva.PaidAmount, 0)) * si.ExchangeRate
                ELSE 0
            END AS OverdueAmountBase
        FROM proj.TBL_SUPPLIER_INVOICE si
        LEFT JOIN proj.TBL_CURRENCY cur ON cur.CurrencyId = si.CurrencyId
        LEFT JOIN (
            SELECT SupplierInvoiceId,
                   SUM(CASE WHEN ISNULL(IsActive, 1) = 1 THEN AllocatedAmount ELSE 0 END) AS PaidAmount
            FROM proj.TBL_PAYMENT_VOUCHER_ALLOCATION
            GROUP BY SupplierInvoiceId
        ) pva ON pva.SupplierInvoiceId = si.SupplierInvoiceId
        WHERE si.IsActive = 1
          AND si.Status NOT IN ('Draft', 'Cancelled')
          AND (@DateFrom   IS NULL OR si.InvoiceDate >= @DateFrom)
          AND (@DateTo     IS NULL OR si.InvoiceDate <= @DateTo)
          AND (@CurrencyId IS NULL OR si.CurrencyId  =  @CurrencyId)
          AND si.TotalAmount - COALESCE(pva.PaidAmount, 0) > 0
    ),
    SupplierSummary AS (
        SELECT
            s.SupplierId,
            s.SupplierName,
            s.SupplierCode,
            COUNT(*)                                              AS TotalInvoiceCount,
            SUM(CASE WHEN ic.PaymentStatus = 'Unpaid'        THEN 1 ELSE 0 END) AS UnpaidCount,
            SUM(CASE WHEN ic.PaymentStatus = 'PartiallyPaid' THEN 1 ELSE 0 END) AS PartiallyPaidCount,
            SUM(ic.TotalAmount)                                   AS TotalInvoiceAmount,
            SUM(ic.PaidAmount)                                    AS TotalPaidAmount,
            SUM(ic.TotalAmountBase)                               AS TotalInvoiceAmountBase,
            SUM(ic.PaidAmountBase)                                AS TotalPaidAmountBase,
            SUM(ic.PendingAmountBase)                             AS TotalPendingBase,
            SUM(ic.OverdueAmountBase)                             AS OverdueAmountBase,
            -- Single currency or 'Multi'
            CASE WHEN COUNT(DISTINCT ic.CurrencyId) = 1
                 THEN MAX(ic.CurrencyShort) ELSE 'Multi' END      AS InvoiceCurrencyShort
        FROM InvoiceCalc ic
        JOIN proj.TBL_SUPPLIER s ON s.SupplierId = ic.SupplierId
        WHERE (@SupplierId  IS NULL OR s.SupplierId   = @SupplierId)
          AND (@SearchText  IS NULL OR s.SupplierName LIKE N'%' + @SearchText + N'%'
                                    OR s.SupplierCode LIKE N'%' + @SearchText + N'%')
          AND (@Status      IS NULL OR ic.PaymentStatus = @Status)
        GROUP BY s.SupplierId, s.SupplierName, s.SupplierCode
    ),
    Ranked AS (
        SELECT *, COUNT(*) OVER () AS TotalRows,
               ROW_NUMBER() OVER (
                   ORDER BY
                       -- One CASE per column, each typed natively — avoids cross-type CAST issues
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='SupplierName'           THEN SupplierName           END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='SupplierName'           THEN SupplierName           END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='InvoiceCurrencyShort'   THEN InvoiceCurrencyShort   END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='InvoiceCurrencyShort'   THEN InvoiceCurrencyShort   END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='TotalInvoiceCount'      THEN TotalInvoiceCount      END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='TotalInvoiceCount'      THEN TotalInvoiceCount      END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='TotalInvoiceAmountBase' THEN TotalInvoiceAmountBase END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='TotalInvoiceAmountBase' THEN TotalInvoiceAmountBase END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='TotalPaidAmountBase'    THEN TotalPaidAmountBase    END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='TotalPaidAmountBase'    THEN TotalPaidAmountBase    END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='TotalPendingBase'       THEN TotalPendingBase       END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='TotalPendingBase'       THEN TotalPendingBase       END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='OverdueAmountBase'      THEN OverdueAmountBase      END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='OverdueAmountBase'      THEN OverdueAmountBase      END DESC,
                       TotalPendingBase DESC   -- tie-breaker
               ) AS RowNum
        FROM SupplierSummary
    )
    SELECT
        SupplierId, SupplierName, SupplierCode,
        TotalInvoiceCount, UnpaidCount, PartiallyPaidCount,
        TotalInvoiceAmount, TotalPaidAmount, InvoiceCurrencyShort,
        TotalInvoiceAmountBase, TotalPaidAmountBase,
        TotalPendingBase, OverdueAmountBase,
        TotalRows
    FROM Ranked
    WHERE RowNum BETWEEN (@PageNumber - 1) * @PageSize + 1
                     AND  @PageNumber      * @PageSize
    ORDER BY RowNum;
END
GO

-- ============================================================
-- 3. sp_GetSupplierInvoicePayables
--    Invoice-level outstanding detail for a single supplier.
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetSupplierInvoicePayables
    @SupplierId   INT           = NULL,
    @InvoiceNo    NVARCHAR(100) = NULL,
    @CurrencyId   INT           = NULL,
    @Status       NVARCHAR(50)  = NULL,   -- 'Unpaid' | 'PartiallyPaid'
    @DateFrom     DATE          = NULL,
    @DateTo       DATE          = NULL,
    @DueDateFrom  DATE          = NULL,
    @DueDateTo    DATE          = NULL,
    @PageNumber   INT           = 1,
    @PageSize     INT           = 50,
    @SortColumn   NVARCHAR(100) = N'InvoiceDate',
    @SortDirection NVARCHAR(4)  = N'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH InvoiceCalc AS (
        SELECT
            si.SupplierInvoiceId,
            si.InvoiceNo,
            si.SupplierInvRef,
            si.InvoiceDate,
            si.DueDate,
            si.SupplierId,
            si.CurrencyId,
            cur.ShortName                                               AS CurrencyShort,
            si.ExchangeRate,
            si.TotalAmount                                              AS InvoiceAmount,
            si.TotalAmount * si.ExchangeRate                            AS InvoiceAmountBase,
            COALESCE(pva.PaidAmount, 0)                                 AS PaidAmount,
            si.TotalAmount - COALESCE(pva.PaidAmount, 0)               AS PendingAmount,
            (si.TotalAmount - COALESCE(pva.PaidAmount, 0))
                * si.ExchangeRate                                        AS PendingAmountBase,
            CASE
                WHEN COALESCE(pva.PaidAmount, 0) = 0 THEN 'Unpaid'
                ELSE 'PartiallyPaid'
            END AS PaymentStatus,
            CASE
                WHEN si.DueDate IS NULL OR si.DueDate >= CAST(GETDATE() AS DATE) THEN 0
                ELSE DATEDIFF(DAY, si.DueDate, GETDATE())
            END AS DaysOverdue
        FROM proj.TBL_SUPPLIER_INVOICE si
        LEFT JOIN proj.TBL_CURRENCY cur ON cur.CurrencyId = si.CurrencyId
        LEFT JOIN (
            SELECT SupplierInvoiceId,
                   SUM(CASE WHEN ISNULL(IsActive, 1) = 1 THEN AllocatedAmount ELSE 0 END) AS PaidAmount
            FROM proj.TBL_PAYMENT_VOUCHER_ALLOCATION
            GROUP BY SupplierInvoiceId
        ) pva ON pva.SupplierInvoiceId = si.SupplierInvoiceId
        WHERE si.IsActive = 1
          AND si.Status NOT IN ('Draft', 'Cancelled')
          AND (@SupplierId  IS NULL OR si.SupplierId  = @SupplierId)
          AND (@CurrencyId  IS NULL OR si.CurrencyId  = @CurrencyId)
          AND (@InvoiceNo   IS NULL OR si.InvoiceNo LIKE N'%' + @InvoiceNo + N'%')
          AND (@DateFrom    IS NULL OR si.InvoiceDate >= @DateFrom)
          AND (@DateTo      IS NULL OR si.InvoiceDate <= @DateTo)
          AND (@DueDateFrom IS NULL OR si.DueDate    >= @DueDateFrom)
          AND (@DueDateTo   IS NULL OR si.DueDate    <= @DueDateTo)
          AND si.TotalAmount - COALESCE(pva.PaidAmount, 0) > 0
    ),
    Filtered AS (
        SELECT *
        FROM InvoiceCalc
        WHERE (@Status IS NULL
               OR (@Status = 'Unpaid'        AND PaymentStatus = 'Unpaid')
               OR (@Status = 'PartiallyPaid' AND PaymentStatus = 'PartiallyPaid'))
    ),
    Ranked AS (
        SELECT *, COUNT(*) OVER () AS TotalRows,
               ROW_NUMBER() OVER (
                   ORDER BY
                       -- One CASE per column, each typed natively — DATE columns cannot share a FLOAT CASE
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='InvoiceDate'       THEN InvoiceDate       END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='InvoiceDate'       THEN InvoiceDate       END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='DueDate'           THEN DueDate           END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='DueDate'           THEN DueDate           END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='InvoiceNo'         THEN InvoiceNo         END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='InvoiceNo'         THEN InvoiceNo         END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='CurrencyShort'     THEN CurrencyShort     END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='CurrencyShort'     THEN CurrencyShort     END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='PaymentStatus'     THEN PaymentStatus     END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='PaymentStatus'     THEN PaymentStatus     END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='PendingAmount'     THEN PendingAmount     END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='PendingAmount'     THEN PendingAmount     END DESC,
                       CASE WHEN @SortDirection='ASC'  AND @SortColumn='PendingAmountBase' THEN PendingAmountBase END ASC,
                       CASE WHEN @SortDirection='DESC' AND @SortColumn='PendingAmountBase' THEN PendingAmountBase END DESC,
                       InvoiceDate DESC   -- tie-breaker
               ) AS RowNum
        FROM Filtered
    )
    SELECT
        SupplierInvoiceId, InvoiceNo, SupplierInvRef,
        InvoiceDate, DueDate,
        CurrencyShort, ExchangeRate,
        InvoiceAmount, InvoiceAmountBase,
        PaidAmount, PendingAmount, PendingAmountBase,
        PaymentStatus, DaysOverdue,
        TotalRows
    FROM Ranked
    WHERE RowNum BETWEEN (@PageNumber - 1) * @PageSize + 1
                     AND  @PageNumber      * @PageSize
    ORDER BY RowNum;
END
GO

-- ============================================================
-- 4. sp_GetPayablesAging
--    Aging grid per supplier (paginated, sortable).
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetPayablesAging
    @SearchText   NVARCHAR(200) = NULL,
    @SupplierId   INT           = NULL,
    @PageNumber   INT           = 1,
    @PageSize     INT           = 20,
    @SortColumn   NVARCHAR(100) = N'Total',
    @SortDirection NVARCHAR(4)  = N'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH InvoiceCalc AS (
        SELECT
            si.SupplierId,
            (si.TotalAmount - COALESCE(pva.PaidAmount, 0)) * si.ExchangeRate AS OutstandingBase,
            CASE
                WHEN si.DueDate IS NULL OR si.DueDate >= CAST(GETDATE() AS DATE) THEN 0
                ELSE DATEDIFF(DAY, si.DueDate, GETDATE())
            END AS DaysOverdue
        FROM proj.TBL_SUPPLIER_INVOICE si
        LEFT JOIN (
            SELECT SupplierInvoiceId,
                   SUM(CASE WHEN ISNULL(IsActive, 1) = 1 THEN AllocatedAmount ELSE 0 END) AS PaidAmount
            FROM proj.TBL_PAYMENT_VOUCHER_ALLOCATION
            GROUP BY SupplierInvoiceId
        ) pva ON pva.SupplierInvoiceId = si.SupplierInvoiceId
        WHERE si.IsActive = 1
          AND si.Status NOT IN ('Draft', 'Cancelled')
          AND si.TotalAmount - COALESCE(pva.PaidAmount, 0) > 0
    ),
    AgingCalc AS (
        SELECT
            s.SupplierId,
            s.SupplierName,
            SUM(CASE WHEN ic.DaysOverdue = 0                        THEN ic.OutstandingBase ELSE 0 END) AS [Current],
            SUM(CASE WHEN ic.DaysOverdue BETWEEN  1 AND  30         THEN ic.OutstandingBase ELSE 0 END) AS Days0_30,
            SUM(CASE WHEN ic.DaysOverdue BETWEEN 31 AND  60         THEN ic.OutstandingBase ELSE 0 END) AS Days31_60,
            SUM(CASE WHEN ic.DaysOverdue BETWEEN 61 AND  90         THEN ic.OutstandingBase ELSE 0 END) AS Days61_90,
            SUM(CASE WHEN ic.DaysOverdue > 90                       THEN ic.OutstandingBase ELSE 0 END) AS Days90Plus,
            SUM(ic.OutstandingBase)                                                                      AS Total
        FROM InvoiceCalc ic
        JOIN proj.TBL_SUPPLIER s ON s.SupplierId = ic.SupplierId
        WHERE (@SupplierId IS NULL OR s.SupplierId  = @SupplierId)
          AND (@SearchText IS NULL OR s.SupplierName LIKE N'%' + @SearchText + N'%')
        GROUP BY s.SupplierId, s.SupplierName
    ),
    Ranked AS (
        SELECT *, COUNT(*) OVER () AS TotalRows,
               ROW_NUMBER() OVER (
                   ORDER BY
                       CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'SupplierName' THEN SupplierName END ASC,
                       CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'SupplierName' THEN SupplierName END DESC,
                       CASE WHEN @SortDirection = 'ASC' THEN
                           CASE @SortColumn
                               WHEN 'Current'    THEN [Current]
                               WHEN 'Days0_30'   THEN Days0_30
                               WHEN 'Days31_60'  THEN Days31_60
                               WHEN 'Days61_90'  THEN Days61_90
                               WHEN 'Days90Plus' THEN Days90Plus
                               ELSE Total
                           END
                       END ASC,
                       CASE WHEN @SortDirection = 'DESC' THEN
                           CASE @SortColumn
                               WHEN 'Current'    THEN [Current]
                               WHEN 'Days0_30'   THEN Days0_30
                               WHEN 'Days31_60'  THEN Days31_60
                               WHEN 'Days61_90'  THEN Days61_90
                               WHEN 'Days90Plus' THEN Days90Plus
                               ELSE Total
                           END
                       END DESC,
                       Total DESC   -- tie-breaker
               ) AS RowNum
        FROM AgingCalc
    )
    SELECT
        SupplierId, SupplierName,
        [Current], Days0_30, Days31_60, Days61_90, Days90Plus, Total,
        TotalRows
    FROM Ranked
    WHERE RowNum BETWEEN (@PageNumber - 1) * @PageSize + 1
                     AND  @PageNumber      * @PageSize
    ORDER BY RowNum;
END
GO

-- ============================================================
-- 5. sp_GetInvoicePvAllocations
--    PV allocations for a specific supplier invoice.
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetInvoicePvAllocations
    @SupplierInvoiceId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        pva.AllocationId,
        pv.PvNumber,
        pv.PvDate,
        cur.ShortName            AS PvCurrencyShort,
        pv.ExchangeRate          AS PvExchangeRate,
        pva.AllocatedAmount,
        pva.AllocatedAmount * pv.ExchangeRate AS AllocatedAmountBase,
        pv.PaymentMode,
        pva.CreatedBy,
        pva.CreatedDate
    FROM proj.TBL_PAYMENT_VOUCHER_ALLOCATION pva
    JOIN proj.TBL_PAYMENT_VOUCHER pv ON pv.PvId = pva.PvId
    LEFT JOIN proj.TBL_CURRENCY cur ON cur.CurrencyId = pv.CurrencyId
    WHERE pva.SupplierInvoiceId = @SupplierInvoiceId
      AND ISNULL(pva.IsActive, 1) = 1
      AND pv.Status != 'Cancelled'
    ORDER BY pv.PvDate DESC, pva.AllocationId DESC;
END
GO

-- ============================================================
-- 6. sp_GetSupplierPaymentHistory
--    Payment summary + PV list for a supplier.
--    Returns 2 result sets:
--      RS1 : Summary (one row)
--      RS2 : Payment Voucher history
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetSupplierPaymentHistory
    @SupplierId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: Summary
    SELECT
        ISNULL(SUM(si.TotalAmount * si.ExchangeRate), 0)                      AS InvoicesRaised,
        ISNULL(SUM(COALESCE(pva.PaidAmount, 0) * si.ExchangeRate), 0)         AS PaymentsMade,
        ISNULL(SUM((si.TotalAmount - COALESCE(pva.PaidAmount, 0))
               * si.ExchangeRate), 0)                                          AS OutstandingBalance,
        ISNULL(SUM(
            CASE WHEN si.DueDate < CAST(GETDATE() AS DATE) AND si.DueDate IS NOT NULL
                 THEN (si.TotalAmount - COALESCE(pva.PaidAmount, 0)) * si.ExchangeRate
                 ELSE 0 END), 0)                                               AS OverdueAmount
    FROM proj.TBL_SUPPLIER_INVOICE si
    LEFT JOIN (
        SELECT SupplierInvoiceId,
               SUM(CASE WHEN ISNULL(IsActive, 1) = 1 THEN AllocatedAmount ELSE 0 END) AS PaidAmount
        FROM proj.TBL_PAYMENT_VOUCHER_ALLOCATION
        GROUP BY SupplierInvoiceId
    ) pva ON pva.SupplierInvoiceId = si.SupplierInvoiceId
    WHERE si.IsActive = 1
      AND si.Status NOT IN ('Draft', 'Cancelled')
      AND si.SupplierId = @SupplierId;

    -- RS2: PV history
    SELECT
        pv.PvNumber,
        pv.PvDate,
        cur.ShortName        AS CurrencyShort,
        pv.ExchangeRate,
        pv.AmountPaid,
        pv.AmountPaid * pv.ExchangeRate AS AmountBase,
        ISNULL(pv.AllocatedAmount, 0)   AS AllocatedAmount,
        ISNULL(pv.AllocatedAmount, 0) * pv.ExchangeRate AS AllocatedBase,
        pv.Status,
        pv.PaymentMode,
        pv.CreatedBy,
        pv.CreatedDate
    FROM proj.TBL_PAYMENT_VOUCHER pv
    LEFT JOIN proj.TBL_CURRENCY cur ON cur.CurrencyId = pv.CurrencyId
    WHERE pv.IsActive = 1
      AND pv.SupplierId = @SupplierId
    ORDER BY pv.PvDate DESC, pv.PvId DESC;
END
GO
