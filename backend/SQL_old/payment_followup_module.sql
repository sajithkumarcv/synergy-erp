-- ═══════════════════════════════════════════════════════════════════
-- Payment Follow-up (Collections) Module
-- Run once against ERPDB. All objects under PROJ schema.
--
-- Purpose: lets the accounts team work a shared daily worklist of
-- customers to chase for payment, log each call/contact with the
-- promise amount + promised date, and set the next follow-up date.
-- A customer resurfaces on the worklist when its promise date or
-- next-follow-up date arrives (SAP "Promise-to-Pay / Resubmission").
--
-- Outstanding balances reuse the SAME logic as the Receivables module
-- (TBL_INVOICE less RV / CN allocations) — no figures are duplicated.
--
-- Tables joined (already exist — see SQL\sp_Receivables.sql):
--   proj.TBL_INVOICE, proj.TBL_RECEIPT_VOUCHER_ALLOCATION, proj.TBL_RECEIPT_VOUCHER,
--   proj.TBL_CREDIT_NOTE_ALLOCATION, proj.TBL_CREDIT_NOTE, proj.TBL_CUSTOMER
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. TABLE
-- ───────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'PROJ.TBL_PAYMENT_FOLLOWUP') AND type = 'U')
CREATE TABLE PROJ.TBL_PAYMENT_FOLLOWUP (
    FollowupId          INT             NOT NULL IDENTITY(1,1)
                            CONSTRAINT PK_TBL_PAYMENT_FOLLOWUP PRIMARY KEY,
    CustomerId          INT             NOT NULL
                            CONSTRAINT FK_PAYMENT_FOLLOWUP_CUSTOMER REFERENCES PROJ.TBL_CUSTOMER(CustomerId),
    ContactDate         DATE            NOT NULL,
    ContactPerson       NVARCHAR(150)   NULL,           -- who was spoken to at the customer
    ContactMode         NVARCHAR(20)    NULL,           -- Phone / Email / Visit / WhatsApp
    Outcome             NVARCHAR(30)    NOT NULL,        -- Promised / PartialPayment / NoResponse / Disputed / Refused / CallbackRequested / LeftMessage
    Notes               NVARCHAR(MAX)   NULL,
    PromiseAmount       DECIMAL(18,2)   NULL,           -- amount the customer promised (base currency)
    PromiseDate         DATE            NULL,           -- date they promised to pay by
    NextFollowupDate    DATE            NULL,           -- when to contact again (drives the worklist)
    PromiseStatus       NVARCHAR(20)    NOT NULL DEFAULT 'None',  -- None / Open / Kept / Broken
    OutstandingSnapshot DECIMAL(18,2)   NULL,           -- base outstanding captured at time of contact (audit)
    IsActive            BIT             NOT NULL DEFAULT 1,
    CreatedBy           NVARCHAR(100)   NOT NULL,
    CreatedDate         DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedBy          NVARCHAR(100)   NULL,
    ModifiedDate        DATETIME        NULL
);
GO

-- Helps the worklist's "latest follow-up per customer" lookup.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PAYMENT_FOLLOWUP_Customer' AND object_id = OBJECT_ID(N'PROJ.TBL_PAYMENT_FOLLOWUP'))
CREATE INDEX IX_PAYMENT_FOLLOWUP_Customer
    ON PROJ.TBL_PAYMENT_FOLLOWUP (CustomerId, IsActive, ContactDate DESC, FollowupId DESC);
GO

-- ───────────────────────────────────────────────────────────────────
-- 2. STORED PROCEDURES
-- ───────────────────────────────────────────────────────────────────

-- ====================================================================
-- sp_GetFollowupWorklist
--   Company-wide daily worklist of customers to chase.
--   Joins per-customer outstanding (same calc as Receivables) with the
--   latest active follow-up, and derives a FollowupState for sorting.
--   @ShowAll = 0 → only customers needing action today
--              (promise due/broken, follow-up due, or overdue & never contacted)
--   @ShowAll = 1 → every customer with an outstanding balance
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_GetFollowupWorklist
    @SearchText     NVARCHAR(200) = NULL,
    @State          NVARCHAR(30)  = NULL,   -- optional filter on derived state
    @ShowAll        BIT           = 0,
    @PageNumber     INT           = 1,
    @PageSize       INT           = 20,
    @SortColumn     NVARCHAR(50)  = 'Priority',
    @SortDirection  NVARCHAR(4)   = 'ASC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today DATE = CAST(GETDATE() AS DATE);

    ;WITH InvoiceOutstanding AS (
        SELECT
            i.CustomerId,
            (i.TotalAmount - COALESCE(rv_paid.RvPaid, 0) - COALESCE(cn_paid.CnPaid, 0))
                * i.ExchangeRate AS OutstandingBase,
            CASE
                WHEN i.DueDate IS NULL OR i.DueDate >= @Today THEN 0
                ELSE DATEDIFF(DAY, i.DueDate, GETDATE())
            END AS DaysOverdue
        FROM proj.TBL_INVOICE i
        LEFT JOIN (
            SELECT a.InvoiceId,
                   SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RECEIPT_VOUCHER_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled')
            GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT a.InvoiceId, SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS CnPaid
            FROM proj.TBL_CREDIT_NOTE_ALLOCATION a
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON a.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled')
            GROUP BY a.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1
          AND i.Status NOT IN ('Draft','Cancelled')
          AND (i.TotalAmount - COALESCE(rv_paid.RvPaid,0) - COALESCE(cn_paid.CnPaid,0)) > 0
    ),
    CustomerOutstanding AS (
        SELECT
            io.CustomerId,
            SUM(io.OutstandingBase)                                              AS TotalPendingBase,
            SUM(CASE WHEN io.DaysOverdue > 0 THEN io.OutstandingBase ELSE 0 END) AS OverdueAmountBase,
            MAX(io.DaysOverdue)                                                   AS MaxDaysOverdue
        FROM InvoiceOutstanding io
        GROUP BY io.CustomerId
        HAVING SUM(io.OutstandingBase) > 0
    ),
    LatestFollowup AS (
        SELECT *
        FROM (
            SELECT
                f.FollowupId, f.CustomerId, f.ContactDate, f.Outcome, f.Notes,
                f.PromiseAmount, f.PromiseDate, f.NextFollowupDate, f.PromiseStatus,
                f.CreatedBy,
                ROW_NUMBER() OVER (PARTITION BY f.CustomerId
                                   ORDER BY f.ContactDate DESC, f.FollowupId DESC) AS rn
            FROM PROJ.TBL_PAYMENT_FOLLOWUP f
            WHERE f.IsActive = 1
        ) x
        WHERE x.rn = 1
    ),
    FollowupCounts AS (
        SELECT CustomerId, COUNT(*) AS FollowupCount
        FROM PROJ.TBL_PAYMENT_FOLLOWUP
        WHERE IsActive = 1
        GROUP BY CustomerId
    ),
    Worklist AS (
        SELECT
            co.CustomerId,
            c.CustomerName,
            c.CustomerCode,
            c.Phone,
            c.Mobile,
            c.Email,
            c.SalesPerson,
            co.TotalPendingBase,
            co.OverdueAmountBase,
            co.MaxDaysOverdue,
            ISNULL(fc.FollowupCount, 0)     AS FollowupCount,
            lf.FollowupId                   AS LastFollowupId,
            lf.ContactDate                  AS LastContactDate,
            lf.Outcome                      AS LastOutcome,
            lf.Notes                        AS LastNotes,
            lf.CreatedBy                    AS LastContactBy,
            lf.PromiseAmount,
            lf.PromiseDate,
            lf.NextFollowupDate,
            lf.PromiseStatus,
            -- Derived state used both for filtering and default sort priority
            CASE
                WHEN lf.PromiseStatus = 'Open' AND lf.PromiseDate IS NOT NULL
                     AND lf.PromiseDate <  @Today                                   THEN 'PromiseBroken'
                WHEN lf.PromiseStatus = 'Open' AND lf.PromiseDate IS NOT NULL
                     AND lf.PromiseDate =  @Today                                   THEN 'PromiseDue'
                WHEN lf.NextFollowupDate IS NOT NULL AND lf.NextFollowupDate <= @Today THEN 'FollowupDue'
                WHEN lf.FollowupId IS NULL AND co.MaxDaysOverdue > 0                 THEN 'NeverContacted'
                WHEN lf.NextFollowupDate IS NOT NULL AND lf.NextFollowupDate > @Today THEN 'Scheduled'
                ELSE 'NoActionDue'
            END AS FollowupState
        FROM CustomerOutstanding co
        INNER JOIN proj.TBL_CUSTOMER c ON co.CustomerId = c.CustomerId
        LEFT  JOIN LatestFollowup  lf  ON co.CustomerId = lf.CustomerId
        LEFT  JOIN FollowupCounts  fc  ON co.CustomerId = fc.CustomerId
        WHERE (@SearchText IS NULL
               OR c.CustomerName LIKE '%' + @SearchText + '%'
               OR c.CustomerCode LIKE '%' + @SearchText + '%')
    ),
    Prioritised AS (
        SELECT *,
            CASE FollowupState
                WHEN 'PromiseBroken'   THEN 1
                WHEN 'PromiseDue'      THEN 2
                WHEN 'NeverContacted'  THEN 3
                WHEN 'FollowupDue'     THEN 4
                WHEN 'Scheduled'       THEN 5
                ELSE 6
            END AS Priority
        FROM Worklist
    ),
    Filtered AS (
        SELECT *, COUNT(*) OVER () AS TotalRows
        FROM Prioritised
        WHERE (@State IS NULL OR @State = '' OR FollowupState = @State)
          AND (@ShowAll = 1 OR Priority <= 4)   -- default view = action-due states only
    )
    SELECT *
    FROM Filtered
    ORDER BY
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn
                WHEN 'CustomerName' THEN CustomerName
                ELSE NULL
            END
        END ASC,
        CASE WHEN @SortDirection = 'ASC' THEN
            CASE @SortColumn
                WHEN 'Priority'          THEN CAST(Priority          AS DECIMAL(18,2))
                WHEN 'TotalPendingBase'  THEN TotalPendingBase
                WHEN 'OverdueAmountBase' THEN OverdueAmountBase
                WHEN 'MaxDaysOverdue'    THEN CAST(MaxDaysOverdue     AS DECIMAL(18,2))
                WHEN 'PromiseDate'       THEN CAST(CAST(PromiseDate      AS DATETIME) AS FLOAT)
                WHEN 'NextFollowupDate'  THEN CAST(CAST(NextFollowupDate AS DATETIME) AS FLOAT)
                ELSE CAST(Priority AS DECIMAL(18,2))
            END
        END ASC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn
                WHEN 'CustomerName' THEN CustomerName
                ELSE NULL
            END
        END DESC,
        CASE WHEN @SortDirection = 'DESC' THEN
            CASE @SortColumn
                WHEN 'Priority'          THEN CAST(Priority          AS DECIMAL(18,2))
                WHEN 'TotalPendingBase'  THEN TotalPendingBase
                WHEN 'OverdueAmountBase' THEN OverdueAmountBase
                WHEN 'MaxDaysOverdue'    THEN CAST(MaxDaysOverdue     AS DECIMAL(18,2))
                WHEN 'PromiseDate'       THEN CAST(CAST(PromiseDate      AS DATETIME) AS FLOAT)
                WHEN 'NextFollowupDate'  THEN CAST(CAST(NextFollowupDate AS DATETIME) AS FLOAT)
                ELSE CAST(Priority AS DECIMAL(18,2))
            END
        END DESC,
        OverdueAmountBase DESC,   -- stable tie-breaker
        CustomerId ASC
    OFFSET (@PageNumber - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ====================================================================
-- sp_GetFollowupWorklistSummary
--   KPI counts for the worklist header cards (whole company).
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_GetFollowupWorklistSummary
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);

    ;WITH InvoiceOutstanding AS (
        SELECT
            i.CustomerId,
            (i.TotalAmount - COALESCE(rv_paid.RvPaid, 0) - COALESCE(cn_paid.CnPaid, 0))
                * i.ExchangeRate AS OutstandingBase,
            CASE WHEN i.DueDate IS NULL OR i.DueDate >= @Today THEN 0
                 ELSE DATEDIFF(DAY, i.DueDate, GETDATE()) END AS DaysOverdue
        FROM proj.TBL_INVOICE i
        LEFT JOIN (
            SELECT a.InvoiceId, SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RECEIPT_VOUCHER_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled') GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT a.InvoiceId, SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS CnPaid
            FROM proj.TBL_CREDIT_NOTE_ALLOCATION a
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON a.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled') GROUP BY a.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1 AND i.Status NOT IN ('Draft','Cancelled')
          AND (i.TotalAmount - COALESCE(rv_paid.RvPaid,0) - COALESCE(cn_paid.CnPaid,0)) > 0
    ),
    CustomerOutstanding AS (
        SELECT CustomerId,
               SUM(OutstandingBase) AS TotalPendingBase,
               SUM(CASE WHEN DaysOverdue > 0 THEN OutstandingBase ELSE 0 END) AS OverdueAmountBase,
               MAX(DaysOverdue) AS MaxDaysOverdue
        FROM InvoiceOutstanding
        GROUP BY CustomerId
        HAVING SUM(OutstandingBase) > 0
    ),
    LatestFollowup AS (
        SELECT * FROM (
            SELECT f.CustomerId, f.FollowupId, f.PromiseDate, f.NextFollowupDate, f.PromiseStatus,
                   ROW_NUMBER() OVER (PARTITION BY f.CustomerId ORDER BY f.ContactDate DESC, f.FollowupId DESC) rn
            FROM PROJ.TBL_PAYMENT_FOLLOWUP f WHERE f.IsActive = 1
        ) x WHERE rn = 1
    ),
    States AS (
        SELECT
            co.OverdueAmountBase,
            co.MaxDaysOverdue,
            CASE
                WHEN lf.PromiseStatus = 'Open' AND lf.PromiseDate < @Today                  THEN 'PromiseBroken'
                WHEN lf.PromiseStatus = 'Open' AND lf.PromiseDate = @Today                  THEN 'PromiseDue'
                WHEN lf.NextFollowupDate IS NOT NULL AND lf.NextFollowupDate <= @Today       THEN 'FollowupDue'
                WHEN lf.FollowupId IS NULL AND co.MaxDaysOverdue > 0                         THEN 'NeverContacted'
                ELSE 'NoActionDue'
            END AS FollowupState
        FROM CustomerOutstanding co
        LEFT JOIN LatestFollowup lf ON co.CustomerId = lf.CustomerId
    )
    SELECT
        SUM(CASE WHEN FollowupState IN ('PromiseBroken','PromiseDue','FollowupDue','NeverContacted') THEN 1 ELSE 0 END) AS ActionDueCount,
        SUM(CASE WHEN FollowupState = 'PromiseBroken'  THEN 1 ELSE 0 END) AS BrokenPromiseCount,
        SUM(CASE WHEN FollowupState = 'PromiseDue'     THEN 1 ELSE 0 END) AS PromiseDueCount,
        SUM(CASE WHEN FollowupState = 'NeverContacted' THEN 1 ELSE 0 END) AS NeverContactedCount,
        ISNULL(SUM(OverdueAmountBase), 0) AS TotalOverdueBase
    FROM States;
END;
GO

-- ====================================================================
-- sp_SavePaymentFollowup
--   Insert (FollowupId = 0) or update a contact log entry.
--   Setting Outcome = 'Promised' with a PromiseDate opens a promise.
--   Returns the FollowupId.
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_SavePaymentFollowup
    @FollowupId         INT,
    @CustomerId         INT,
    @ContactDate        DATE,
    @ContactPerson      NVARCHAR(150)   = NULL,
    @ContactMode        NVARCHAR(20)    = NULL,
    @Outcome            NVARCHAR(30),
    @Notes              NVARCHAR(MAX)   = NULL,
    @PromiseAmount      DECIMAL(18,2)   = NULL,
    @PromiseDate        DATE            = NULL,
    @NextFollowupDate   DATE            = NULL,
    @OutstandingSnapshot DECIMAL(18,2)  = NULL,
    @CreatedBy          NVARCHAR(100),
    @ModifiedBy         NVARCHAR(100)   = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- A promise is "Open" only when an outcome of Promised/PartialPayment carries a future-dated promise.
    DECLARE @PromiseStatus NVARCHAR(20) =
        CASE WHEN @Outcome IN ('Promised','PartialPayment') AND @PromiseDate IS NOT NULL
             THEN 'Open' ELSE 'None' END;

    IF @FollowupId = 0
    BEGIN
        INSERT INTO PROJ.TBL_PAYMENT_FOLLOWUP
            (CustomerId, ContactDate, ContactPerson, ContactMode, Outcome, Notes,
             PromiseAmount, PromiseDate, NextFollowupDate, PromiseStatus,
             OutstandingSnapshot, IsActive, CreatedBy, CreatedDate)
        VALUES
            (@CustomerId, @ContactDate, @ContactPerson, @ContactMode, @Outcome, @Notes,
             @PromiseAmount, @PromiseDate, @NextFollowupDate, @PromiseStatus,
             @OutstandingSnapshot, 1, @CreatedBy, GETDATE());

        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        UPDATE PROJ.TBL_PAYMENT_FOLLOWUP
        SET ContactDate         = @ContactDate,
            ContactPerson       = @ContactPerson,
            ContactMode         = @ContactMode,
            Outcome             = @Outcome,
            Notes               = @Notes,
            PromiseAmount       = @PromiseAmount,
            PromiseDate         = @PromiseDate,
            NextFollowupDate    = @NextFollowupDate,
            -- Preserve a manually-resolved Kept/Broken; otherwise recompute Open/None.
            PromiseStatus       = CASE WHEN PromiseStatus IN ('Kept','Broken') THEN PromiseStatus
                                       ELSE @PromiseStatus END,
            ModifiedBy          = @ModifiedBy,
            ModifiedDate        = GETDATE()
        WHERE FollowupId = @FollowupId;

        SELECT CAST(@FollowupId AS NVARCHAR(20));
    END
END;
GO

-- ====================================================================
-- sp_SetFollowupPromiseStatus
--   Manually mark a promise Kept or Broken (e.g. after reconciling a
--   receipt). Returns the FollowupId.
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_SetFollowupPromiseStatus
    @FollowupId INT,
    @Status     NVARCHAR(20),   -- Kept / Broken / Open
    @ModifiedBy NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE PROJ.TBL_PAYMENT_FOLLOWUP
    SET PromiseStatus = @Status,
        ModifiedBy    = @ModifiedBy,
        ModifiedDate  = GETDATE()
    WHERE FollowupId = @FollowupId;
    SELECT CAST(@FollowupId AS NVARCHAR(20));
END;
GO

-- ====================================================================
-- sp_DeletePaymentFollowup
--   Soft-delete a contact log entry.
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_DeletePaymentFollowup
    @FollowupId INT,
    @ModifiedBy NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_PAYMENT_FOLLOWUP WHERE FollowupId = @FollowupId AND IsActive = 1)
    BEGIN
        SELECT 'NotExists'; RETURN;
    END
    UPDATE PROJ.TBL_PAYMENT_FOLLOWUP
    SET IsActive = 0, ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
    WHERE FollowupId = @FollowupId;
    SELECT 'Deleted';
END;
GO

-- ====================================================================
-- sp_GetCustomerFollowupHistory
--   RS1: customer outstanding summary (same calc as Receivables)
--   RS2: full follow-up timeline for the customer
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_GetCustomerFollowupHistory
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);

    ;WITH InvoiceOutstanding AS (
        SELECT
            (i.TotalAmount - COALESCE(rv_paid.RvPaid,0) - COALESCE(cn_paid.CnPaid,0)) * i.ExchangeRate AS OutstandingBase,
            CASE WHEN i.DueDate IS NULL OR i.DueDate >= @Today THEN 0
                 ELSE DATEDIFF(DAY, i.DueDate, GETDATE()) END AS DaysOverdue
        FROM proj.TBL_INVOICE i
        LEFT JOIN (
            SELECT a.InvoiceId, SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RECEIPT_VOUCHER_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled') GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT a.InvoiceId, SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS CnPaid
            FROM proj.TBL_CREDIT_NOTE_ALLOCATION a
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON a.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled') GROUP BY a.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1 AND i.Status NOT IN ('Draft','Cancelled')
          AND i.CustomerId = @CustomerId
          AND (i.TotalAmount - COALESCE(rv_paid.RvPaid,0) - COALESCE(cn_paid.CnPaid,0)) > 0
    )
    -- RS1: summary + customer contact info
    SELECT
        c.CustomerId,
        c.CustomerName,
        c.CustomerCode,
        c.Phone,
        c.Mobile,
        c.Email,
        c.SalesPerson,
        c.CreditDays,
        ISNULL((SELECT SUM(OutstandingBase) FROM InvoiceOutstanding), 0)                                   AS TotalPendingBase,
        ISNULL((SELECT SUM(CASE WHEN DaysOverdue > 0 THEN OutstandingBase ELSE 0 END) FROM InvoiceOutstanding), 0) AS OverdueAmountBase,
        ISNULL((SELECT MAX(DaysOverdue) FROM InvoiceOutstanding), 0)                                       AS MaxDaysOverdue
    FROM proj.TBL_CUSTOMER c
    WHERE c.CustomerId = @CustomerId;

    -- RS2: follow-up timeline (most recent first)
    SELECT
        f.FollowupId,
        f.CustomerId,
        f.ContactDate,
        f.ContactPerson,
        f.ContactMode,
        f.Outcome,
        f.Notes,
        f.PromiseAmount,
        f.PromiseDate,
        f.NextFollowupDate,
        f.PromiseStatus,
        f.OutstandingSnapshot,
        f.CreatedBy,
        f.CreatedDate,
        f.ModifiedBy,
        f.ModifiedDate
    FROM PROJ.TBL_PAYMENT_FOLLOWUP f
    WHERE f.CustomerId = @CustomerId AND f.IsActive = 1
    ORDER BY f.ContactDate DESC, f.FollowupId DESC;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- 3. ALERT VIEW  (feeds the existing Email-Alert framework)
--    Name MUST start with vw_Alert so it is whitelisted by the
--    EmailAlertProcessorService and listed by sp_GetAvailableAlertViews.
--    Create an alert config pointing at this view (accounts user group +
--    a template + Daily schedule) via the Email Alerts admin screen.
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER VIEW PROJ.vw_AlertPaymentFollowupDue
AS
    WITH InvoiceOutstanding AS (
        SELECT
            i.CustomerId,
            (i.TotalAmount - COALESCE(rv_paid.RvPaid,0) - COALESCE(cn_paid.CnPaid,0)) * i.ExchangeRate AS OutstandingBase,
            CASE WHEN i.DueDate IS NULL OR i.DueDate >= CAST(GETDATE() AS DATE) THEN 0
                 ELSE DATEDIFF(DAY, i.DueDate, GETDATE()) END AS DaysOverdue
        FROM proj.TBL_INVOICE i
        LEFT JOIN (
            SELECT a.InvoiceId, SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS RvPaid
            FROM proj.TBL_RECEIPT_VOUCHER_ALLOCATION a
            INNER JOIN proj.TBL_RECEIPT_VOUCHER rv ON a.RvId = rv.RvId
            WHERE rv.Status NOT IN ('Cancelled') GROUP BY a.InvoiceId
        ) rv_paid ON i.InvoiceId = rv_paid.InvoiceId
        LEFT JOIN (
            SELECT a.InvoiceId, SUM(CASE WHEN a.IsActive = 1 THEN a.AllocatedAmount ELSE 0 END) AS CnPaid
            FROM proj.TBL_CREDIT_NOTE_ALLOCATION a
            INNER JOIN proj.TBL_CREDIT_NOTE cn ON a.CnId = cn.CnId
            WHERE cn.Status NOT IN ('Cancelled') GROUP BY a.InvoiceId
        ) cn_paid ON i.InvoiceId = cn_paid.InvoiceId
        WHERE i.IsActive = 1 AND i.Status NOT IN ('Draft','Cancelled')
          AND (i.TotalAmount - COALESCE(rv_paid.RvPaid,0) - COALESCE(cn_paid.CnPaid,0)) > 0
    ),
    CustomerOutstanding AS (
        SELECT CustomerId,
               SUM(OutstandingBase) AS TotalPendingBase,
               SUM(CASE WHEN DaysOverdue > 0 THEN OutstandingBase ELSE 0 END) AS OverdueAmountBase,
               MAX(DaysOverdue) AS MaxDaysOverdue
        FROM InvoiceOutstanding GROUP BY CustomerId HAVING SUM(OutstandingBase) > 0
    ),
    LatestFollowup AS (
        SELECT * FROM (
            SELECT f.CustomerId, f.Outcome, f.PromiseAmount, f.PromiseDate,
                   f.NextFollowupDate, f.PromiseStatus,
                   ROW_NUMBER() OVER (PARTITION BY f.CustomerId ORDER BY f.ContactDate DESC, f.FollowupId DESC) rn
            FROM PROJ.TBL_PAYMENT_FOLLOWUP f WHERE f.IsActive = 1
        ) x WHERE rn = 1
    )
    SELECT
        c.CustomerName,
        c.CustomerCode,
        c.Phone,
        c.Mobile,
        co.TotalPendingBase   AS Outstanding,
        co.OverdueAmountBase  AS Overdue,
        co.MaxDaysOverdue     AS DaysOverdue,
        lf.PromiseAmount,
        lf.PromiseDate,
        lf.NextFollowupDate,
        lf.Outcome            AS LastOutcome,
        CASE
            WHEN lf.PromiseStatus = 'Open' AND lf.PromiseDate < CAST(GETDATE() AS DATE) THEN 'Promise overdue'
            WHEN lf.PromiseStatus = 'Open' AND lf.PromiseDate = CAST(GETDATE() AS DATE) THEN 'Promise due today'
            WHEN lf.NextFollowupDate = CAST(GETDATE() AS DATE)                           THEN 'Follow-up due today'
            ELSE 'Action required'
        END AS Reason
    FROM CustomerOutstanding co
    INNER JOIN proj.TBL_CUSTOMER c ON co.CustomerId = c.CustomerId
    LEFT  JOIN LatestFollowup  lf ON co.CustomerId = lf.CustomerId
    WHERE
        (lf.PromiseStatus = 'Open' AND lf.PromiseDate <= CAST(GETDATE() AS DATE))
        OR (lf.NextFollowupDate IS NOT NULL AND lf.NextFollowupDate <= CAST(GETDATE() AS DATE));
GO

-- ───────────────────────────────────────────────────────────────────
-- 4. MENU  — add "Payment Follow-up" beside Receivables
-- ───────────────────────────────────────────────────────────────────
INSERT INTO proj.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
SELECT
    recv.ParentMenuId,
    N'Payment Follow-up',
    N'/payment-followup',
    recv.MenuIcon,
    recv.MenuOrder + 1,
    1
FROM proj.TBL_MENU recv
WHERE recv.MenuUrl = N'/receivables'
  AND NOT EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuUrl = N'/payment-followup');

-- Shift siblings down so the new item slots in cleanly after Receivables.
UPDATE proj.TBL_MENU
SET    MenuOrder = MenuOrder + 1
WHERE  ParentMenuId = (SELECT ParentMenuId FROM proj.TBL_MENU WHERE MenuUrl = N'/receivables')
  AND  MenuUrl NOT IN (N'/payment-followup', N'/receivables')
  AND  MenuOrder >= (SELECT MenuOrder FROM proj.TBL_MENU WHERE MenuUrl = N'/receivables') + 1;
GO
