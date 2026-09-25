-- PO / PR / GRN reports: new Job Type filter (comma-separated JobTypeIds), used together with the Job dropdown
-- which the frontend now narrows to the chosen job types. Documents with no job are excluded when a type is chosen.
SET QUOTED_IDENTIFIER ON;
GO
-- sp_ReportPOs
CREATE OR ALTER PROCEDURE proj.sp_ReportPOs
    @DateFrom    DATE         = NULL,
    @DateTo      DATE         = NULL,
    @SupplierId  INT          = NULL,
    @Status      NVARCHAR(50) = NULL,
    @JobId       NVARCHAR(50) = NULL,
    @JobTypeIds NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds
    @CreatedBy   NVARCHAR(100)= NULL,
    @Priority    NVARCHAR(20) = NULL,
    @NoGrnOnly   BIT          = 0,
    @GrnFilter   NVARCHAR(10) = NULL,
    @ApprovedBy  NVARCHAR(100)= NULL,
    @SubmittedBy NVARCHAR(100)= NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        po.PoId,
        po.PoNumber,
        CONVERT(DATE, po.PoDate)                            AS PoDate,
        po.SupplierId,
        po.VendorName,
        po.JobId,
        j.ProjectName                                       AS JobTitle,
        po.Status,
        po.Priority,
        cur.ShortName                                       AS CurrencyShort,
        po.ExchangeRate,
        po.TotalAmount,
        po.TotalAmount * ISNULL(po.ExchangeRate, 1)        AS TotalAmountBase,
        po.TaxAmount,
        po.TaxAmount   * ISNULL(po.ExchangeRate, 1)        AS TaxAmountBase,
        po.Revision,
        po.CreatedBy,
        po.ModifiedBy,
        po.VendorRef,
        CONVERT(DATE, po.DeliveryDate)                     AS DeliveryDate,
        po.CreatedDate,
        appr.SubmittedBy                                    AS SubmittedBy,
        CASE WHEN appr.FinalAction = 'Approved' THEN appr.FinalActionBy END AS ApprovedBy,
        CASE WHEN appr.FinalAction = 'Approved' THEN appr.CompletedDate END AS ApprovedDate,
        (SELECT COUNT(*) FROM proj.TBL_PURCHASE_ORDER_LINE l
         WHERE l.PoId = po.PoId AND l.IsActive = 1)        AS LineCount,
        (SELECT COUNT(*) FROM proj.TBL_GRN_HEADER g
         WHERE g.PoId = po.PoId AND g.IsActive = 1
           AND ISNULL(g.Status,'') <> 'Cancelled')         AS GrnCount,
        ISNULL((
            SELECT SUM(gd.ReceivedQty * gd.UnitPrice)
            FROM proj.TBL_GRN_DETAIL gd
            JOIN proj.TBL_GRN_HEADER gh ON gh.GrnId = gd.GrnId
            WHERE gh.PoId = po.PoId AND gh.IsActive = 1 AND gd.IsActive = 1
              AND ISNULL(gh.Status,'') <> 'Cancelled'
        ), 0)                                               AS ReceivedAmount,
        ISNULL((
            SELECT SUM(gd.ReceivedQty * gd.UnitPrice * ISNULL(gh.ExchangeRate, 1))
            FROM proj.TBL_GRN_DETAIL gd
            JOIN proj.TBL_GRN_HEADER gh ON gh.GrnId = gd.GrnId
            WHERE gh.PoId = po.PoId AND gh.IsActive = 1 AND gd.IsActive = 1
              AND ISNULL(gh.Status,'') <> 'Cancelled'
        ), 0)                                               AS ReceivedAmountBase,
        STUFF((
            SELECT DISTINCT ', ' + pr.PrNumber
            FROM proj.TBL_PURCHASE_ORDER_LINE pol
            JOIN proj.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId
            JOIN proj.TBL_PURCHASE_REQUEST pr        ON pr.PrId = prl.PrId
            WHERE pol.PoId = po.PoId AND pol.IsActive = 1
            FOR XML PATH(''), TYPE).value('.','NVARCHAR(MAX)'), 1, 2, ''
        )                                                   AS LinkedPRs
    FROM proj.TBL_PURCHASE_ORDER po
    LEFT JOIN proj.TBL_CURRENCY cur ON cur.CurrencyId = po.CurrencyId
    LEFT JOIN proj.TBL_JOB j        ON j.JobId = po.JobId
    OUTER APPLY (
        SELECT TOP 1 at.SubmittedBy, at.FinalAction, at.FinalActionBy, at.CompletedDate
        FROM proj.TBL_APPROVAL_TRANSACTION at
        WHERE at.ModuleId = 2 AND at.DocumentId = po.PoId
        ORDER BY at.TransactionId DESC
    ) appr
    WHERE po.IsActive = 1
      AND (@DateFrom   IS NULL OR CONVERT(DATE, po.PoDate) >= @DateFrom)
      AND (@DateTo     IS NULL OR CONVERT(DATE, po.PoDate) <= @DateTo)
      AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
      AND (@Status     IS NULL OR po.Status = @Status)
      AND (@JobId      IS NULL OR po.JobId LIKE '%' + @JobId + '%')
      AND (@JobTypeIds IS NULL OR @JobTypeIds = '' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, ',')))
      AND (@CreatedBy  IS NULL OR po.CreatedBy LIKE '%' + @CreatedBy + '%')
      AND (@Priority   IS NULL OR po.Priority = @Priority)
      AND (@ApprovedBy IS NULL OR (appr.FinalAction = 'Approved' AND appr.FinalActionBy LIKE '%' + @ApprovedBy + '%'))
      AND (@SubmittedBy IS NULL OR appr.SubmittedBy LIKE '%' + @SubmittedBy + '%')
      AND (
           @NoGrnOnly = 0
           OR NOT EXISTS (
               SELECT 1 FROM proj.TBL_GRN_HEADER g
               WHERE g.PoId = po.PoId AND g.IsActive = 1
                 AND ISNULL(g.Status,'') <> 'Cancelled'
           )
      )
      AND (
           @GrnFilter IS NULL OR @GrnFilter IN ('', 'ALL')
           OR (@GrnFilter = 'NONE' AND NOT EXISTS (
                   SELECT 1 FROM proj.TBL_GRN_HEADER g
                   WHERE g.PoId = po.PoId AND g.IsActive = 1
                     AND ISNULL(g.Status,'') <> 'Cancelled'))
           OR (@GrnFilter = 'ONLY' AND EXISTS (
                   SELECT 1 FROM proj.TBL_GRN_HEADER g
                   WHERE g.PoId = po.PoId AND g.IsActive = 1
                     AND ISNULL(g.Status,'') <> 'Cancelled'))
      )
    ORDER BY po.PoDate DESC, po.PoNumber;
END
GO

-- sp_ReportPRs
CREATE OR ALTER PROCEDURE proj.sp_ReportPRs
    @DateFrom   DATE          = NULL,
    @DateTo     DATE          = NULL,
    @Status     NVARCHAR(50)  = NULL,
    @Priority   NVARCHAR(20)  = NULL,
    @JobId      NVARCHAR(50)  = NULL,
    @JobTypeIds NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds
    @CreatedBy  NVARCHAR(100) = NULL,
    @NoPOOnly   BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        pr.PrId,
        pr.PrNumber,
        CONVERT(DATE, pr.PrDate)        AS PrDate,
        pr.RequestedBy,
        pr.JobId,
        j.ProjectName                   AS JobTitle,
        pr.Status,
        pr.Priority,
        pr.CreatedBy,
        pr.CreatedDate,
        pr.Notes,
        -- Line count
        (SELECT COUNT(*) FROM proj.TBL_PURCHASE_REQUEST_LINE l
         WHERE l.PrId = pr.PrId AND l.IsActive = 1)   AS LineCount,
        -- PO count (distinct POs raised from this PR)
        (SELECT COUNT(DISTINCT pol.PoId)
         FROM proj.TBL_PURCHASE_REQUEST_LINE prl
         JOIN proj.TBL_PURCHASE_ORDER_LINE pol ON pol.PrLineId = prl.PrLineId
         JOIN proj.TBL_PURCHASE_ORDER po       ON po.PoId = pol.PoId AND po.IsActive = 1
         WHERE prl.PrId = pr.PrId AND prl.IsActive = 1 AND pol.IsActive = 1) AS PoCount,
        -- Linked PO numbers
        STUFF((
            SELECT DISTINCT ', ' + po2.PoNumber
            FROM proj.TBL_PURCHASE_REQUEST_LINE prl2
            JOIN proj.TBL_PURCHASE_ORDER_LINE pol2 ON pol2.PrLineId = prl2.PrLineId
            JOIN proj.TBL_PURCHASE_ORDER po2        ON po2.PoId = pol2.PoId AND po2.IsActive = 1
            WHERE prl2.PrId = pr.PrId AND prl2.IsActive = 1 AND pol2.IsActive = 1
            FOR XML PATH(''), TYPE).value('.','NVARCHAR(MAX)'), 1, 2, ''
        )                                              AS LinkedPOs
    FROM proj.TBL_PURCHASE_REQUEST pr
    LEFT JOIN proj.TBL_JOB j ON j.JobId = pr.JobId
    WHERE pr.IsActive = 1
      AND (@DateFrom  IS NULL OR CONVERT(DATE, pr.PrDate) >= @DateFrom)
      AND (@DateTo    IS NULL OR CONVERT(DATE, pr.PrDate) <= @DateTo)
      AND (@Status    IS NULL OR pr.Status = @Status)
      AND (@Priority  IS NULL OR pr.Priority = @Priority)
      AND (@JobId     IS NULL OR pr.JobId = @JobId)
      AND (@JobTypeIds IS NULL OR @JobTypeIds = '' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, ',')))
      AND (@CreatedBy IS NULL OR pr.CreatedBy LIKE '%' + @CreatedBy + '%')
      AND (
          @NoPOOnly = 0
          OR NOT EXISTS (
              SELECT 1
              FROM proj.TBL_PURCHASE_REQUEST_LINE prl3
              JOIN proj.TBL_PURCHASE_ORDER_LINE pol3 ON pol3.PrLineId = prl3.PrLineId
              JOIN proj.TBL_PURCHASE_ORDER po3        ON po3.PoId = pol3.PoId AND po3.IsActive = 1
              WHERE prl3.PrId = pr.PrId AND prl3.IsActive = 1 AND pol3.IsActive = 1
          )
      )
    ORDER BY pr.PrDate DESC, pr.PrNumber;
END
GO

-- sp_ReportGRNs
CREATE OR ALTER PROCEDURE proj.sp_ReportGRNs
    @DateFrom   DATE          = NULL,
    @DateTo     DATE          = NULL,
    @SupplierId INT           = NULL,
    @JobId      NVARCHAR(50)  = NULL,
    @JobTypeIds NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds
    @Status     NVARCHAR(50)  = NULL,
    @CreatedBy  NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        g.GrnId,
        g.GrnNumber,
        CONVERT(DATE, g.GrnDate)        AS GrnDate,
        g.SupplierId,
        g.ReceivedFrom                  AS VendorName,
        g.JobId,
        j.ProjectName                   AS JobTitle,
        g.Status,
        g.DoNo,
        g.InvoiceNo,
        g.TotalAmount,
        cur.ShortName                   AS CurrencyShort,
        g.ReceivedBy,
        g.CreatedBy,
        g.CreatedDate,
        po.PoNumber,
        (SELECT COUNT(*) FROM proj.TBL_GRN_DETAIL d
         WHERE d.GrnId = g.GrnId AND d.IsActive = 1)  AS LineCount
    FROM proj.TBL_GRN_HEADER g
    LEFT JOIN proj.TBL_PURCHASE_ORDER po ON po.PoId = g.PoId AND po.IsActive = 1
    LEFT JOIN proj.TBL_CURRENCY cur      ON cur.CurrencyId = g.CurrencyId
    LEFT JOIN proj.TBL_JOB j             ON j.JobId = g.JobId
    WHERE g.IsActive = 1
      AND (@DateFrom   IS NULL OR CONVERT(DATE, g.GrnDate) >= @DateFrom)
      AND (@DateTo     IS NULL OR CONVERT(DATE, g.GrnDate) <= @DateTo)
      AND (@SupplierId IS NULL OR g.SupplierId = @SupplierId)
      AND (@JobId      IS NULL OR g.JobId = @JobId)
      AND (@JobTypeIds IS NULL OR @JobTypeIds = '' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, ',')))
      AND (@Status     IS NULL OR g.Status = @Status)
      AND (@CreatedBy  IS NULL OR g.CreatedBy LIKE '%' + @CreatedBy + '%')
    ORDER BY g.GrnDate DESC, g.GrnNumber;
END
GO
