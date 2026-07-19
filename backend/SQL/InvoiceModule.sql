-- ═══════════════════════════════════════════════════════════════════
-- INVOICE MODULE  —  DDL  +  Seed  +  Stored Procedures
-- Run once against ERPDB.  All objects under PROJ schema.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1.  TABLES
-- ───────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects
               WHERE object_id = OBJECT_ID(N'PROJ.TBL_INVOICE') AND type = 'U')
CREATE TABLE PROJ.TBL_INVOICE (
    InvoiceId       INT             NOT NULL IDENTITY(1,1)
                        CONSTRAINT PK_TBL_INVOICE PRIMARY KEY,
    InvoiceNo       NVARCHAR(30)    NOT NULL,
    InvoiceDate     DATE            NOT NULL,
    CustomerId      INT             NOT NULL
                        CONSTRAINT FK_INVOICE_CUSTOMER
                        REFERENCES PROJ.TBL_CUSTOMER(CustomerId),
    BillingAddress  NVARCHAR(1000)  NULL,
    CurrencyId      INT             NOT NULL DEFAULT 1
                        CONSTRAINT FK_INVOICE_CURRENCY
                        REFERENCES PROJ.TBL_CURRENCY(CurrencyId),
    DueDate         DATE            NULL,
    JobId           VARCHAR(30)     NULL,
    LpoNo           NVARCHAR(50)    NULL,
    LpoDate         DATE            NULL,
    ContactId       INT             NULL,
    SubTotal        DECIMAL(18,2)   NOT NULL DEFAULT 0,
    TaxAmount       DECIMAL(18,2)   NOT NULL DEFAULT 0,
    TotalAmount     DECIMAL(18,2)   NOT NULL DEFAULT 0,
    Notes           NVARCHAR(1000)  NULL,
    Status          NVARCHAR(20)    NOT NULL DEFAULT 'Draft',
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedBy       NVARCHAR(100)   NOT NULL,
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedBy      NVARCHAR(100)   NULL,
    ModifiedDate    DATETIME        NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects
               WHERE object_id = OBJECT_ID(N'PROJ.TBL_INVOICE_LINE') AND type = 'U')
CREATE TABLE PROJ.TBL_INVOICE_LINE (
    InvoiceLineId   INT             NOT NULL IDENTITY(1,1)
                        CONSTRAINT PK_TBL_INVOICE_LINE PRIMARY KEY,
    InvoiceId       INT             NOT NULL
                        CONSTRAINT FK_INVOICE_LINE_INVOICE
                        REFERENCES PROJ.TBL_INVOICE(InvoiceId),
    LineNum         INT             NOT NULL,
    Description     NVARCHAR(500)   NOT NULL,
    UomName         NVARCHAR(30)    NULL,
    UnitPrice       DECIMAL(18,4)   NOT NULL DEFAULT 0,
    Qty             DECIMAL(18,4)   NOT NULL DEFAULT 1,
    Amount          DECIMAL(18,2)   NOT NULL DEFAULT 0,   -- UnitPrice * Qty
    VatPercent      DECIMAL(5,2)    NOT NULL DEFAULT 0,
    TaxAmount       DECIMAL(18,2)   NOT NULL DEFAULT 0,   -- Amount * VatPercent / 100
    Notes           NVARCHAR(500)   NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedBy       NVARCHAR(100)   NOT NULL,
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedBy      NVARCHAR(100)   NULL,
    ModifiedDate    DATETIME        NULL
);
GO

-- ───────────────────────────────────────────────────────────────────
-- 2.  DOCUMENT SERIES  seed
-- ───────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_DOCUMENT_SERIES WHERE DocTypeId = 'INV')
    INSERT INTO PROJ.TBL_DOCUMENT_SERIES
        (DocTypeId, DocTypeName, Prefix, Separator, IncludeYear, YearDigits,
         ResetYearly, PadLength, StartingSeries, CurrentSeries, SortOrder, IsActive, CreatedBy)
    VALUES ('INV', 'Invoice', 'INV', '-', 1, 2, 1, 4, 1, 0, 10, 1, 'system');
GO

-- ───────────────────────────────────────────────────────────────────
-- 3.  DOCUMENT STATUS  seed
-- ───────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_DOCUMENT_STATUS WHERE ModuleName = 'INV')
BEGIN
    INSERT INTO PROJ.TBL_DOCUMENT_STATUS
        (ModuleName, StatusCode, StatusLabel, BadgeBg, BadgeColor, BadgeDot,
         SortOrder, CanEdit, CanDelete, IsInitial, IsTerminal, AllowedTransitions, IsActive, CreatedBy)
    VALUES
    ('INV','Draft',    'Draft',    '#fef9c3','#854d0e','#ca8a04', 1, 1,1,1,0,'Confirmed,Cancelled',1,'system'),
    ('INV','Confirmed','Confirmed','#dcfce7','#166534','#16a34a', 2, 0,0,0,1, NULL,                1,'system'),
    ('INV','Cancelled','Cancelled','#fee2e2','#991b1b','#dc2626', 3, 0,0,0,1, NULL,                1,'system');
END
GO

-- ═══════════════════════════════════════════════════════════════════
-- STORED PROCEDURES
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- sp_SearchInvoices
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_SearchInvoices
    @SearchText    NVARCHAR(100) = NULL,
    @CustomerId    INT           = NULL,
    @JobId         VARCHAR(30)   = NULL,
    @Status        NVARCHAR(20)  = NULL,
    @DateFrom      DATE          = NULL,
    @DateTo        DATE          = NULL,
    @PageNumber    INT           = 1,
    @PageSize      INT           = 20,
    @SortColumn    NVARCHAR(50)  = 'InvoiceDate',
    @SortDirection NVARCHAR(4)   = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    WITH cte AS (
        SELECT
            i.InvoiceId, i.InvoiceNo, i.InvoiceDate,
            i.CustomerId, c.CustomerName,
            i.CurrencyId, cu.ShortName AS CurrencyShort, cu.Symbol AS CurrencySymbol,
            i.DueDate, i.JobId, i.LpoNo,
            i.SubTotal, i.TaxAmount, i.TotalAmount,
            i.Status, i.CreatedBy, i.CreatedDate, i.ModifiedBy, i.ModifiedDate,
            (SELECT COUNT(*) FROM PROJ.TBL_INVOICE_LINE l
             WHERE l.InvoiceId = i.InvoiceId AND l.IsActive = 1) AS LineCount,
            COUNT(*) OVER () AS TotalRows
        FROM PROJ.TBL_INVOICE   i
        INNER JOIN PROJ.TBL_CUSTOMER c  ON c.CustomerId  = i.CustomerId
        INNER JOIN PROJ.TBL_CURRENCY cu ON cu.CurrencyId = i.CurrencyId
        WHERE i.IsActive = 1
          AND (@CustomerId IS NULL OR i.CustomerId  = @CustomerId)
          AND (@JobId      IS NULL OR i.JobId       = @JobId)
          AND (@Status     IS NULL OR i.Status      = @Status)
          AND (@DateFrom   IS NULL OR i.InvoiceDate >= @DateFrom)
          AND (@DateTo     IS NULL OR i.InvoiceDate <= @DateTo)
          AND (@SearchText IS NULL
               OR i.InvoiceNo    LIKE N'%' + @SearchText + N'%'
               OR c.CustomerName LIKE N'%' + @SearchText + N'%'
               OR i.LpoNo        LIKE N'%' + @SearchText + N'%')
    )
    SELECT * FROM cte
    ORDER BY
        CASE WHEN @SortColumn='InvoiceNo'    AND @SortDirection='ASC'  THEN InvoiceNo    END ASC,
        CASE WHEN @SortColumn='InvoiceNo'    AND @SortDirection='DESC' THEN InvoiceNo    END DESC,
        CASE WHEN @SortColumn='InvoiceDate'  AND @SortDirection='ASC'  THEN InvoiceDate  END ASC,
        CASE WHEN @SortColumn='CustomerName' AND @SortDirection='ASC'  THEN CustomerName END ASC,
        CASE WHEN @SortColumn='CustomerName' AND @SortDirection='DESC' THEN CustomerName END DESC,
        CASE WHEN @SortColumn='TotalAmount'  AND @SortDirection='ASC'  THEN TotalAmount  END ASC,
        CASE WHEN @SortColumn='TotalAmount'  AND @SortDirection='DESC' THEN TotalAmount  END DESC,
        CASE WHEN @SortColumn='Status'       AND @SortDirection='ASC'  THEN Status       END ASC,
        CASE WHEN @SortColumn='Status'       AND @SortDirection='DESC' THEN Status       END DESC,
        InvoiceDate DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_GetInvoice   (multi-result: 1=header, 2=lines)
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_GetInvoice
    @InvoiceId  INT          = NULL,
    @InvoiceNo  NVARCHAR(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id INT = @InvoiceId;
    IF @Id IS NULL OR @Id = 0
        SELECT @Id = InvoiceId FROM PROJ.TBL_INVOICE
        WHERE InvoiceNo = @InvoiceNo AND IsActive = 1;

    -- Result 1 : Header
    SELECT
        i.InvoiceId, i.InvoiceNo, i.InvoiceDate,
        i.CustomerId, c.CustomerName, c.VatNumber AS CustomerVatNo,
        i.BillingAddress,
        i.CurrencyId, cu.ShortName AS CurrencyShort, cu.Symbol AS CurrencySymbol,
        cu.ExchangeRate,
        i.DueDate, i.JobId, j.ProjectName AS JobTitle,
        i.LpoNo, i.LpoDate,
        i.ContactId,
        cc.ContactName, cc.Designation AS ContactDesignation,
        cc.Phone AS ContactPhone, cc.Email AS ContactEmail,
        i.SubTotal, i.TaxAmount, i.TotalAmount,
        i.Notes, i.Status,
        i.CreatedBy, i.CreatedDate, i.ModifiedBy, i.ModifiedDate
    FROM PROJ.TBL_INVOICE i
    INNER JOIN PROJ.TBL_CUSTOMER  c  ON c.CustomerId  = i.CustomerId
    INNER JOIN PROJ.TBL_CURRENCY  cu ON cu.CurrencyId = i.CurrencyId
    LEFT  JOIN PROJ.VW_JOB        j  ON j.JobId       = i.JobId
    LEFT  JOIN PROJ.TBL_CUSTOMER_CONTACT cc
               ON cc.CustomerContactId = i.ContactId
    WHERE i.InvoiceId = @Id AND i.IsActive = 1;

    -- Result 2 : Lines
    SELECT
        l.InvoiceLineId, l.InvoiceId, l.LineNum,
        l.Description, l.UomName,
        l.UnitPrice, l.Qty, l.Amount,
        l.VatPercent, l.TaxAmount,
        l.Notes,
        l.CreatedBy, l.CreatedDate, l.ModifiedBy, l.ModifiedDate
    FROM PROJ.TBL_INVOICE_LINE l
    WHERE l.InvoiceId = @Id AND l.IsActive = 1
    ORDER BY l.LineNum;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_SetInvoice   (upsert header)
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_SetInvoice
    @InvoiceId      INT             = 0,
    @InvoiceDate    DATE            = NULL,
    @CustomerId     INT,
    @BillingAddress NVARCHAR(1000)  = NULL,
    @CurrencyId     INT             = 1,
    @DueDate        DATE            = NULL,
    @JobId          VARCHAR(30)     = NULL,
    @LpoNo          NVARCHAR(50)    = NULL,
    @LpoDate        DATE            = NULL,
    @ContactId      INT             = NULL,
    @Notes          NVARCHAR(1000)  = NULL,
    @CreatedBy      NVARCHAR(100)   = NULL,
    @ModifiedBy     NVARCHAR(100)   = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @InvoiceId IS NULL OR @InvoiceId <= 0
    BEGIN
        -- Generate document number
        DECLARE @NumResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @NumResult EXEC PROJ.sp_GetNextDocNumber 'INV';
        DECLARE @InvoiceNo NVARCHAR(30);
        SELECT @InvoiceNo = DocNumber FROM @NumResult;

        INSERT INTO PROJ.TBL_INVOICE
            (InvoiceNo, InvoiceDate, CustomerId, BillingAddress, CurrencyId,
             DueDate, JobId, LpoNo, LpoDate, ContactId, Notes, CreatedBy)
        VALUES
            (@InvoiceNo, ISNULL(@InvoiceDate, CAST(GETDATE() AS DATE)),
             @CustomerId, @BillingAddress, @CurrencyId,
             @DueDate, NULLIF(@JobId,''), @LpoNo, @LpoDate,
             NULLIF(@ContactId,0), @Notes, @CreatedBy);

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS NewId, @InvoiceNo AS InvoiceNo;
    END
    ELSE
    BEGIN
        IF EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE
                   WHERE InvoiceId = @InvoiceId AND Status <> 'Draft')
            RAISERROR('Cannot edit a non-Draft Invoice.', 16, 1);

        UPDATE PROJ.TBL_INVOICE
        SET InvoiceDate    = ISNULL(@InvoiceDate, InvoiceDate),
            CustomerId     = @CustomerId,
            BillingAddress = @BillingAddress,
            CurrencyId     = @CurrencyId,
            DueDate        = @DueDate,
            JobId          = NULLIF(@JobId,''),
            LpoNo          = @LpoNo,
            LpoDate        = @LpoDate,
            ContactId      = NULLIF(@ContactId, 0),
            Notes          = @Notes,
            ModifiedBy     = @ModifiedBy,
            ModifiedDate   = GETDATE()
        WHERE InvoiceId = @InvoiceId AND IsActive = 1;

        SELECT CAST(@InvoiceId AS INT) AS NewId, InvoiceNo
        FROM PROJ.TBL_INVOICE WHERE InvoiceId = @InvoiceId;
    END
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_SetInvoiceLine   (upsert line + refresh header totals)
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_SetInvoiceLine
    @InvoiceLineId  INT             = 0,
    @InvoiceId      INT,
    @LineNum        INT             = 0,
    @Description    NVARCHAR(500),
    @UomName        NVARCHAR(30)    = NULL,
    @UnitPrice      DECIMAL(18,4)   = 0,
    @Qty            DECIMAL(18,4)   = 1,
    @VatPercent     DECIMAL(5,2)    = 0,
    @Notes          NVARCHAR(500)   = NULL,
    @CreatedBy      NVARCHAR(100)   = NULL,
    @ModifiedBy     NVARCHAR(100)   = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE
               WHERE InvoiceId = @InvoiceId AND Status <> 'Draft')
        RAISERROR('Cannot edit lines of a non-Draft Invoice.', 16, 1);

    DECLARE @Amount    DECIMAL(18,2) = CAST(@UnitPrice * @Qty AS DECIMAL(18,2));
    DECLARE @TaxAmount DECIMAL(18,2) = CAST(@Amount * @VatPercent / 100 AS DECIMAL(18,2));

    IF @InvoiceLineId = 0 OR @InvoiceLineId IS NULL
    BEGIN
        IF @LineNum = 0
            SELECT @LineNum = ISNULL(MAX(LineNum), 0) + 1
            FROM PROJ.TBL_INVOICE_LINE
            WHERE InvoiceId = @InvoiceId AND IsActive = 1;

        INSERT INTO PROJ.TBL_INVOICE_LINE
            (InvoiceId, LineNum, Description, UomName,
             UnitPrice, Qty, Amount, VatPercent, TaxAmount, Notes, CreatedBy)
        VALUES
            (@InvoiceId, @LineNum, @Description, NULLIF(@UomName,''),
             @UnitPrice, @Qty, @Amount, @VatPercent, @TaxAmount, @Notes, @CreatedBy);

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS InvoiceLineId;
    END
    ELSE
    BEGIN
        UPDATE PROJ.TBL_INVOICE_LINE
        SET Description  = @Description,
            UomName      = NULLIF(@UomName,''),
            UnitPrice    = @UnitPrice,
            Qty          = @Qty,
            Amount       = @Amount,
            VatPercent   = @VatPercent,
            TaxAmount    = @TaxAmount,
            Notes        = @Notes,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE InvoiceLineId = @InvoiceLineId AND IsActive = 1;

        SELECT @InvoiceLineId AS InvoiceLineId;
    END

    -- Refresh header totals
    DECLARE @Sub DECIMAL(18,2) =
        (SELECT ISNULL(SUM(Amount),    0) FROM PROJ.TBL_INVOICE_LINE
         WHERE InvoiceId = @InvoiceId AND IsActive = 1);
    DECLARE @Tax DECIMAL(18,2) =
        (SELECT ISNULL(SUM(TaxAmount), 0) FROM PROJ.TBL_INVOICE_LINE
         WHERE InvoiceId = @InvoiceId AND IsActive = 1);

    UPDATE PROJ.TBL_INVOICE
    SET SubTotal     = @Sub,
        TaxAmount    = @Tax,
        TotalAmount  = @Sub + @Tax,
        ModifiedBy   = @ModifiedBy,
        ModifiedDate = GETDATE()
    WHERE InvoiceId = @InvoiceId;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_DeleteInvoiceLine   (soft delete + refresh header totals)
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_DeleteInvoiceLine
    @InvoiceLineId  INT,
    @ModifiedBy     NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @InvoiceId INT;
    SELECT @InvoiceId = InvoiceId FROM PROJ.TBL_INVOICE_LINE
    WHERE InvoiceLineId = @InvoiceLineId AND IsActive = 1;

    IF @InvoiceId IS NULL
        RAISERROR('Invoice line not found.', 16, 1);

    IF EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE
               WHERE InvoiceId = @InvoiceId AND Status <> 'Draft')
        RAISERROR('Cannot delete lines of a non-Draft Invoice.', 16, 1);

    UPDATE PROJ.TBL_INVOICE_LINE
    SET IsActive = 0, ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
    WHERE InvoiceLineId = @InvoiceLineId;

    -- Refresh header totals
    DECLARE @Sub DECIMAL(18,2) =
        (SELECT ISNULL(SUM(Amount),    0) FROM PROJ.TBL_INVOICE_LINE
         WHERE InvoiceId = @InvoiceId AND IsActive = 1);
    DECLARE @Tax DECIMAL(18,2) =
        (SELECT ISNULL(SUM(TaxAmount), 0) FROM PROJ.TBL_INVOICE_LINE
         WHERE InvoiceId = @InvoiceId AND IsActive = 1);

    UPDATE PROJ.TBL_INVOICE
    SET SubTotal     = @Sub,
        TaxAmount    = @Tax,
        TotalAmount  = @Sub + @Tax,
        ModifiedBy   = @ModifiedBy,
        ModifiedDate = GETDATE()
    WHERE InvoiceId = @InvoiceId;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_DeleteInvoice   (soft delete header + all lines)
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_DeleteInvoice
    @InvoiceId  INT,
    @ModifiedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE
                   WHERE InvoiceId = @InvoiceId AND IsActive = 1)
    BEGIN SELECT 'NotExists' AS Result; RETURN; END

    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE
                   WHERE InvoiceId = @InvoiceId AND Status = 'Draft')
    BEGIN SELECT 'CannotDelete' AS Result; RETURN; END

    UPDATE PROJ.TBL_INVOICE_LINE
    SET IsActive = 0, ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
    WHERE InvoiceId = @InvoiceId AND IsActive = 1;

    UPDATE PROJ.TBL_INVOICE
    SET IsActive = 0, ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
    WHERE InvoiceId = @InvoiceId;

    SELECT 'Deleted' AS Result;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_ConfirmInvoice
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_ConfirmInvoice
    @InvoiceId  INT,
    @ModifiedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE
                   WHERE InvoiceId = @InvoiceId AND Status = 'Draft' AND IsActive = 1)
        RAISERROR('Invoice not found or is not in Draft status.', 16, 1);

    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE_LINE
                   WHERE InvoiceId = @InvoiceId AND IsActive = 1)
        RAISERROR('Cannot confirm an Invoice with no lines.', 16, 1);

    UPDATE PROJ.TBL_INVOICE
    SET Status       = 'Confirmed',
        ModifiedBy   = @ModifiedBy,
        ModifiedDate = GETDATE()
    WHERE InvoiceId = @InvoiceId;

    SELECT InvoiceNo, Status
    FROM PROJ.TBL_INVOICE WHERE InvoiceId = @InvoiceId;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_CancelInvoice
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_CancelInvoice
    @InvoiceId  INT,
    @ModifiedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_INVOICE
                   WHERE InvoiceId = @InvoiceId AND Status = 'Draft' AND IsActive = 1)
        RAISERROR('Only Draft invoices can be cancelled.', 16, 1);

    UPDATE PROJ.TBL_INVOICE
    SET Status       = 'Cancelled',
        ModifiedBy   = @ModifiedBy,
        ModifiedDate = GETDATE()
    WHERE InvoiceId = @InvoiceId;

    SELECT InvoiceNo, Status
    FROM PROJ.TBL_INVOICE WHERE InvoiceId = @InvoiceId;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_GetCustomerForInvoice
-- Multi-result: 1=customer header, 2=addresses, 3=contacts
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_GetCustomerForInvoice
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Customer header
    SELECT c.CustomerId, c.CustomerName, c.VatNumber, c.CurrencyId,
           cu.ShortName AS CurrencyShort, cu.Symbol AS CurrencySymbol,
           c.CreditDays, c.Phone, c.Email
    FROM PROJ.TBL_CUSTOMER c
    INNER JOIN PROJ.TBL_CURRENCY cu ON cu.CurrencyId = c.CurrencyId
    WHERE c.CustomerId = @CustomerId AND c.IsActive = 1;

    -- 2. Addresses
    SELECT
        a.CustomerAddressId, a.AddressType, a.IsDefault,
        RTRIM(
            ISNULL(a.AddressLine1 + CHAR(10),'') +
            ISNULL(a.AddressLine2 + CHAR(10),'') +
            ISNULL(a.City        + CHAR(10),'') +
            ISNULL(a.State + CASE WHEN a.PostalCode IS NOT NULL THEN ' ' + a.PostalCode ELSE '' END + CHAR(10),'') +
            ISNULL((SELECT cn.CountryName FROM PROJ.TBL_COUNTRY cn WHERE cn.CountryId = a.CountryId),'')
        ) AS FullAddress
    FROM PROJ.TBL_CUSTOMER_ADDRESS a
    WHERE a.CustomerId = @CustomerId AND a.IsActive = 1
    ORDER BY a.IsDefault DESC, a.CustomerAddressId;

    -- 3. Contacts
    SELECT CustomerContactId, ContactName, Designation, Phone, Mobile, Email, IsPrimary
    FROM PROJ.TBL_CUSTOMER_CONTACT
    WHERE CustomerId = @CustomerId AND IsActive = 1
    ORDER BY IsPrimary DESC, ContactName;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- sp_GetCurrencies  (for dropdown)
-- ───────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_GetCurrencies
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CurrencyId, CurrencyName, ShortName, Symbol, ExchangeRate, IsBaseCurrency
    FROM PROJ.TBL_CURRENCY
    WHERE IsActive = 1
    ORDER BY SortOrder, CurrencyName;
END;
GO
