-- =====================================================================
-- 2026-10-07  Zoho Books PO interface (outbox table read directly by Zoho)
--
-- APPLY TO: SYNERP (dev) and SYNERPINDIA (prod, applied 2026-10-12). Zoho is for the India company only. Run with SSMS or `sqlcmd -I -i` (QUOTED_IDENTIFIER ON).
--
-- WHAT THIS DOES
--  a. New schema [interface] with
--       interface.ZohoPO          one row per PO LINE, laid out like the Zoho Books
--                                 "Purchase Orders Import" sheet (49 columns) plus
--                                 control columns Zoho writes back to
--       interface.ZohoQueueLog    errors raised while queueing (never blocks approval)
--       interface.GstStateCode    GSTIN 2-digit state code -> Zoho state abbreviation
--  b. interface.usp_QueueZohoPO     snapshot an approved PO into ZohoPO
--     interface.usp_BackfillZohoPO  queue every already-approved PO (run by hand, once)
--     interface.usp_ZohoGetPending  optional: returns Pending rows AND stamps read dates
--  c. proj.sp_PostPOApproval now calls usp_QueueZohoPO first (after every PO approval,
--     including re-approval of a revised PO). Wrapped in TRY/CATCH: a failure is logged
--     to interface.ZohoQueueLog and approval is NEVER blocked.
--  d. Settings (proj.TBL_APP_SETTINGS), inserted only if absent. Interface.Zoho.PoEnabled
--     is 0 = OFF; nothing is queued until it is set to 1.
--  e. Database role interface_zoho for the Zoho login: SELECT on ZohoPO, UPDATE only
--     on the control columns, EXECUTE usp_ZohoGetPending. No access to PROJ tables.
--
-- ROW LIFECYCLE   Status: Pending -> Read -> Processed | Error.   Superseded = a newer
-- revision of the same PO was queued before Zoho took this one.
-- Action: Create (first push of the PO) / Update (any later revision).
-- =====================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF SCHEMA_ID(N'interface') IS NULL EXEC (N'CREATE SCHEMA [interface]');
GO

-- The app logs in as the owner of schema proj. If [interface] has a different owner (dbo), the ownership
-- chain breaks and the app login is denied on interface.* when sp_PostPOApproval calls it (2026-10-12 prod
-- incident: approvals failed with "INSERT permission denied on ZohoQueueLog"). Give it the same owner as proj.
DECLARE @projOwner SYSNAME = (SELECT USER_NAME(principal_id) FROM sys.schemas WHERE name = N'proj');
IF @projOwner IS NOT NULL AND ISNULL((SELECT USER_NAME(principal_id) FROM sys.schemas WHERE name = N'interface'), N'') <> @projOwner
    EXEC (N'ALTER AUTHORIZATION ON SCHEMA::[interface] TO ' + N'[' + @projOwner + N']');
GO

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = N'seq_ZohoPushId' AND schema_id = SCHEMA_ID(N'interface'))
    CREATE SEQUENCE [interface].seq_ZohoPushId AS INT START WITH 1 INCREMENT BY 1;
GO

IF OBJECT_ID(N'[interface].ZohoPO') IS NULL
CREATE TABLE [interface].ZohoPO
(
    ZohoPoRowId          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ZohoPO PRIMARY KEY,
    PushId               INT           NOT NULL,   -- one value per PO revision; all its lines share it
    PoId                 INT           NOT NULL,
    PoLineId             INT           NOT NULL,
    Revision             INT           NOT NULL,
    Action               NVARCHAR(10)  NOT NULL,   -- Create / Update

    -- ---- Zoho import columns (header names in comments) ---------------------
    PurchaseOrderDate    DATE          NULL,       -- Purchase Order Date
    ExpectedDeliveryDate DATE          NULL,       -- Expected Delivery Date
    PurchaseOrderNumber  NVARCHAR(30)  NOT NULL,   -- Purchase Order Number
    ReferenceHash        NVARCHAR(100) NULL,       -- Reference#   (PR number)
    PurchaseOrderStatus  NVARCHAR(20)  NULL,       -- Purchase Order Status
    VendorName           NVARCHAR(200) NULL,       -- Vendor Name
    CurrencyCode         NVARCHAR(10)  NULL,       -- Currency Code
    SourceOfSupply       NVARCHAR(10)  NULL,       -- Source of Supply
    DestinationOfSupply  NVARCHAR(10)  NULL,       -- Destination of Supply
    GstTreatment         NVARCHAR(30)  NULL,       -- GST Treatment
    Gstin                NVARCHAR(30)  NULL,       -- GST Identification Number (GSTIN)
    ExchangeRate         DECIMAL(18,6) NULL,       -- Exchange Rate (only for non-base currency)
    TemplateName         NVARCHAR(100) NULL,       -- Template Name
    ReferenceNo          NVARCHAR(100) NULL,       -- Reference No
    DeliveryInstructions NVARCHAR(500) NULL,       -- Delivery Instructions
    TermsAndConditions   NVARCHAR(MAX) NULL,       -- Terms & Conditions
    ItemType             NVARCHAR(20)  NULL,       -- Item Type
    DiscountType         NVARCHAR(30)  NULL,       -- Discount Type
    DiscountAmount       DECIMAL(18,4) NULL,       -- Discount Amount
    IsDiscountBeforeTax  NVARCHAR(5)   NULL,       -- Is Discount Before Tax
    EntityDiscountPercent DECIMAL(18,4) NULL,      -- Entity Discount Percent
    EntityDiscountAmount DECIMAL(18,4) NULL,       -- Entity Discount Amount
    DiscountAccount      NVARCHAR(100) NULL,       -- Discount Account
    Account              NVARCHAR(100) NULL,       -- Account
    ItemPrice            DECIMAL(18,4) NULL,       -- Item Price
    IsInclusiveTax       NVARCHAR(5)   NULL,       -- Is Inclusive Tax
    ItemName             NVARCHAR(300) NULL,       -- Item Name   (= PO line ItemDesc)
    SKU                  NVARCHAR(100) NULL,       -- SKU
    ItemDesc             NVARCHAR(500) NULL,       -- Item Desc
    Quantity             DECIMAL(18,4) NULL,       -- Quantity
    UsageUnit            NVARCHAR(50)  NULL,       -- Usage unit
    ItemTax              NVARCHAR(50)  NULL,       -- Item Tax
    ItemTaxType          NVARCHAR(30)  NULL,       -- Item Tax Type
    ItemTaxPct           DECIMAL(9,4)  NULL,       -- Item Tax %
    ItemExemptionCode    NVARCHAR(50)  NULL,       -- Item Exemption Code
    ReverseChargeTaxName NVARCHAR(100) NULL,       -- Reverse Charge Tax Name
    ReverseChargeTaxRate DECIMAL(9,4)  NULL,       -- Reverse Charge Tax Rate
    ReverseChargeTaxType NVARCHAR(50)  NULL,       -- Reverse Charge Tax Type
    Attention            NVARCHAR(200) NULL,       -- Attention
    ProjectName          NVARCHAR(400) NULL,       -- Project Name  (JobId - project name)
    Adjustment           DECIMAL(18,4) NULL,       -- Adjustment
    AdjustmentDescription NVARCHAR(200) NULL,      -- Adjustment Description
    PaymentTerms         INT           NULL,       -- Payment Terms  (days)
    PaymentTermsLabel    NVARCHAR(100) NULL,       -- Payment Terms Label
    DeliverToCustomer    NVARCHAR(100) NULL,       -- Deliver To Customer
    BranchName           NVARCHAR(100) NULL,       -- Branch Name
    WarehouseName        NVARCHAR(100) NULL,       -- Warehouse Name
    HsnSac               NVARCHAR(50)  NULL,       -- HSN/SAC
    SupplyType           NVARCHAR(50)  NULL,       -- Supply Type

    -- ---- control columns (Zoho updates the ones marked *) -------------------
    Status               NVARCHAR(15)  NOT NULL CONSTRAINT DF_ZohoPO_Status DEFAULT N'Pending', -- *
    CreatedDate          DATETIME      NOT NULL CONSTRAINT DF_ZohoPO_Created DEFAULT GETDATE(),
    CreatedBy            NVARCHAR(100) NULL,
    FirstReadDate        DATETIME      NULL,    -- *
    LastReadDate         DATETIME      NULL,    -- *
    ReadCount            INT           NOT NULL CONSTRAINT DF_ZohoPO_ReadCount DEFAULT 0,       -- *
    ProcessedDate        DATETIME      NULL,    -- *
    ZohoReference        NVARCHAR(100) NULL,    -- *  Zoho's own PO id
    ErrorMessage         NVARCHAR(1000) NULL,   -- *
    CONSTRAINT CK_ZohoPO_Status CHECK (Status IN (N'Pending', N'Read', N'Processed', N'Error', N'Superseded')),
    CONSTRAINT CK_ZohoPO_Action CHECK (Action IN (N'Create', N'Update'))
);
GO
ALTER TABLE [interface].ZohoPO ALTER COLUMN ProjectName NVARCHAR(400) NULL;   -- no-op when already 400
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ZohoPO_Status' AND object_id = OBJECT_ID(N'[interface].ZohoPO'))
    CREATE INDEX IX_ZohoPO_Status ON [interface].ZohoPO (Status, PushId) INCLUDE (PoId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ZohoPO_Po' AND object_id = OBJECT_ID(N'[interface].ZohoPO'))
    CREATE INDEX IX_ZohoPO_Po ON [interface].ZohoPO (PoId, Revision);
GO

IF OBJECT_ID(N'[interface].ZohoQueueLog') IS NULL
CREATE TABLE [interface].ZohoQueueLog
(
    LogId        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ZohoQueueLog PRIMARY KEY,
    PoId         INT NULL,
    ErrorMessage NVARCHAR(2000) NULL,
    LogDate      DATETIME NOT NULL CONSTRAINT DF_ZohoQueueLog_Date DEFAULT GETDATE()
);
GO

IF OBJECT_ID(N'[interface].GstStateCode') IS NULL
BEGIN
    CREATE TABLE [interface].GstStateCode (Code CHAR(2) NOT NULL PRIMARY KEY, Abbr NVARCHAR(5) NOT NULL, StateName NVARCHAR(60) NOT NULL);
    INSERT INTO [interface].GstStateCode (Code, Abbr, StateName) VALUES
     ('01','JK','Jammu and Kashmir'),('02','HP','Himachal Pradesh'),('03','PB','Punjab'),('04','CH','Chandigarh'),
     ('05','UT','Uttarakhand'),('06','HR','Haryana'),('07','DL','Delhi'),('08','RJ','Rajasthan'),('09','UP','Uttar Pradesh'),
     ('10','BR','Bihar'),('11','SK','Sikkim'),('12','AR','Arunachal Pradesh'),('13','NL','Nagaland'),('14','MN','Manipur'),
     ('15','MZ','Mizoram'),('16','TR','Tripura'),('17','ML','Meghalaya'),('18','AS','Assam'),('19','WB','West Bengal'),
     ('20','JH','Jharkhand'),('21','OR','Odisha'),('22','CT','Chhattisgarh'),('23','MP','Madhya Pradesh'),('24','GJ','Gujarat'),
     ('26','DN','Dadra and Nagar Haveli and Daman and Diu'),('27','MH','Maharashtra'),('29','KA','Karnataka'),('30','GA','Goa'),
     ('31','LD','Lakshadweep'),('32','KL','Kerala'),('33','TN','Tamil Nadu'),('34','PY','Puducherry'),
     ('35','AN','Andaman and Nicobar Islands'),('36','TS','Telangana'),('37','AP','Andhra Pradesh'),('38','LA','Ladakh'),
     ('97','OT','Other Territory');
END
GO

-- our unit of measure -> Zoho "Usage unit". A unit with no row here makes the PO an Error row.
IF OBJECT_ID(N'[interface].ZohoUom') IS NULL
BEGIN
    CREATE TABLE [interface].ZohoUom (UomName NVARCHAR(50) NOT NULL PRIMARY KEY, ZohoUnit NVARCHAR(50) NOT NULL);
    INSERT INTO [interface].ZohoUom (UomName, ZohoUnit) VALUES (N'EA', N'Nos'), (N'Each', N'Nos'), (N'Numbers', N'Nos');
END
GO

-- ---- settings (only if absent) ------------------------------------------
INSERT INTO proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
SELECT v.k, v.v, v.d, N'system', GETDATE()
FROM (VALUES
 (N'Interface.Zoho.PoEnabled',          N'0',                   N'1 = queue every approved PO into interface.ZohoPO for Zoho Books. 0 = off.'),
 (N'Interface.Zoho.PoStatus',           N'Issued',              N'Zoho "Purchase Order Status" sent for an approved PO.'),
 (N'Interface.Zoho.Account',            N'Cost of Goods Sold',  N'Zoho "Account" on every PO line.'),
 (N'Interface.Zoho.DiscountAccount',    N'Purchase Discounts',  N'Zoho "Discount Account".'),
 (N'Interface.Zoho.DestinationOfSupply',N'MH',                  N'Zoho "Destination of Supply" (company state abbreviation).')
) v(k, v, d)
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS s WHERE s.SettingKey = v.k);
GO

-- ---- usp_QueueZohoPO ----------------------------------------------------
CREATE OR ALTER PROCEDURE [interface].usp_QueueZohoPO
    @PoId  INT,
    @By    NVARCHAR(100) = NULL,
    @Force BIT = 0,                      -- 1 = ignore Interface.Zoho.PoEnabled (backfill)
    @Reissue BIT = 0                     -- 1 = queue again although this revision is already queued
                                         --     (used by Amend PO Line, which does not change Revision)
AS
BEGIN
    SET NOCOUNT ON;

    IF @Force = 0 AND ISNULL(TRY_CAST((SELECT SettingValue FROM proj.TBL_APP_SETTINGS
                                       WHERE SettingKey = N'Interface.Zoho.PoEnabled') AS INT), 0) = 0
        RETURN;

    DECLARE @Rev INT;
    SELECT @Rev = Revision FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoId AND IsActive = 1;
    IF @Rev IS NULL RETURN;

    -- this revision is already queued: nothing to do (idempotent; also covers retries)
    IF @Reissue = 0 AND EXISTS (SELECT 1 FROM [interface].ZohoPO WHERE PoId = @PoId AND Revision = @Rev AND Status NOT IN (N'Superseded', N'Error'))
        RETURN;

    DECLARE @Action NVARCHAR(10) = CASE WHEN EXISTS (SELECT 1 FROM [interface].ZohoPO WHERE PoId = @PoId AND (Status = N'Processed' OR FirstReadDate IS NOT NULL))   -- Zoho has seen it
                                        THEN N'Update' ELSE N'Create' END;
    DECLARE @PushId INT = NEXT VALUE FOR [interface].seq_ZohoPushId;

    DECLARE @PoStatus NVARCHAR(20)  = ISNULL((SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Interface.Zoho.PoStatus'), N'Issued');
    DECLARE @Account  NVARCHAR(100) = ISNULL((SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Interface.Zoho.Account'), N'Cost of Goods Sold');
    DECLARE @DiscAcc  NVARCHAR(100) = ISNULL((SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Interface.Zoho.DiscountAccount'), N'Purchase Discounts');
    DECLARE @DestSup  NVARCHAR(10)  = ISNULL((SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Interface.Zoho.DestinationOfSupply'), N'MH');

    -- a newer revision replaces anything Zoho has not yet taken
    UPDATE [interface].ZohoPO SET Status = N'Superseded'
    WHERE PoId = @PoId AND Status IN (N'Pending', N'Read', N'Error');

    -- Reference# = the PR the first line came from
    DECLARE @PrNo NVARCHAR(100) =
        (SELECT TOP 1 pr.PrNumber
         FROM   proj.TBL_PURCHASE_ORDER_LINE l
         JOIN   proj.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = l.PrLineId
         JOIN   proj.TBL_PURCHASE_REQUEST pr       ON pr.PrId = prl.PrId
         WHERE  l.PoId = @PoId AND l.IsActive = 1
         ORDER  BY l.LineNum);

    INSERT INTO [interface].ZohoPO
    (   PushId, PoId, PoLineId, Revision, Action,
        PurchaseOrderDate, ExpectedDeliveryDate, PurchaseOrderNumber, ReferenceHash, PurchaseOrderStatus,
        VendorName, CurrencyCode, SourceOfSupply, DestinationOfSupply, GstTreatment, Gstin, ExchangeRate,
        TermsAndConditions, ItemType, DiscountType, DiscountAmount, IsDiscountBeforeTax, EntityDiscountPercent,
        DiscountAccount, Account, ItemPrice, IsInclusiveTax, ItemName, Quantity, UsageUnit,
        ItemTax, ItemTaxType, ItemTaxPct, PaymentTerms, PaymentTermsLabel, ProjectName, CreatedBy )
    SELECT
        @PushId, po.PoId, l.PoLineId, po.Revision, @Action,
        po.PoDate, ISNULL(po.DeliveryDate, DATEADD(DAY, 7, po.PoDate)), po.PoNumber, @PrNo, @PoStatus,   -- no delivery date on the PO: PO date + 7 days
        po.VendorName, cur.ShortName,
        st.Abbr,
        @DestSup,
        CASE WHEN g.Gstin IS NOT NULL THEN N'business_gst' ELSE N'business_none' END,
        g.Gstin,
        CASE WHEN cur.IsBaseCurrency = 1 THEN NULL ELSE po.ExchangeRate END,
        COALESCE(NULLIF(LTRIM(RTRIM(po.PaymentTermsOther)), N''), pt.TermName),
        N'goods', N'entity_level', 0, N'FALSE', ISNULL(po.Discount, 0),   -- header Discount is a PERCENT
        @DiscAcc, @Account, l.UnitPrice, N'FALSE', l.ItemDesc, l.OrderedQty, zu.ZohoUnit,
        CASE WHEN l.TaxPct > 0 THEN N'GST' + CAST(CAST(l.TaxPct AS FLOAT) AS NVARCHAR(20)) END,
        CASE WHEN l.TaxPct > 0 THEN N'Tax Group' END,
        l.TaxPct, pt.TermDays, pt.TermName,
        po.JobId + CASE WHEN NULLIF(LTRIM(RTRIM(j.ProjectName)), N'') IS NOT NULL THEN N' - ' + LTRIM(RTRIM(j.ProjectName)) ELSE N'' END,
        @By
    FROM   proj.TBL_PURCHASE_ORDER      po
    JOIN   proj.TBL_PURCHASE_ORDER_LINE l   ON l.PoId = po.PoId AND l.IsActive = 1 AND l.LineStatus <> N'Cancelled'
    LEFT   JOIN proj.TBL_CURRENCY       cur ON cur.CurrencyId = po.CurrencyId
    LEFT   JOIN proj.TBL_PAYMENT_TERMS  pt  ON pt.PaymentTermsId = po.PaymentTermsId
    LEFT   JOIN proj.TBL_SUPPLIER       s   ON s.SupplierId = po.SupplierId
    LEFT   JOIN proj.TBL_JOB            j   ON j.JobId = po.JobId
    LEFT   JOIN [interface].ZohoUom     zu  ON zu.UomName = LTRIM(RTRIM(l.UomName))
    OUTER  APPLY (SELECT NULLIF(LTRIM(RTRIM(s.TaxNumber)), N'') AS Gstin) g
    LEFT   JOIN [interface].GstStateCode st ON st.Code = LEFT(g.Gstin, 2)
    WHERE  po.PoId = @PoId AND po.IsActive = 1
    ORDER  BY l.LineNum;

    -- Mandatory-field check (the yellow columns of the Zoho sheet). A PO that fails is
    -- stored as Error - ALL its lines, never a partial PO - and Zoho (which reads
    -- Status = Pending) never sees it. Fix the cause, then EXEC interface.usp_RetryZohoPO.
    DECLARE @Err NVARCHAR(1000) = (
        SELECT STRING_AGG(m, N'; ') FROM (
            SELECT DISTINCT m FROM (
                SELECT CASE WHEN ExpectedDeliveryDate IS NULL THEN N'Expected Delivery Date missing on PO' END AS m FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN ReferenceHash IS NULL THEN N'Reference# missing (no PR linked)' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN VendorName IS NULL THEN N'Vendor Name missing' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN CurrencyCode IS NULL THEN N'Currency Code missing' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN Gstin IS NULL THEN N'Supplier GSTIN missing' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN Gstin IS NOT NULL AND SourceOfSupply IS NULL THEN N'GSTIN state code ' + LEFT(Gstin, 2) + N' not in interface.GstStateCode' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN TermsAndConditions IS NULL THEN N'Terms & Conditions missing' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN PaymentTerms IS NULL THEN N'Payment Terms missing' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN ProjectName IS NULL THEN N'Project Name missing' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN ItemName IS NULL THEN N'Item description missing on a line' END FROM [interface].ZohoPO WHERE PushId = @PushId
                UNION ALL SELECT CASE WHEN UsageUnit IS NULL THEN N'Unit ''' + ISNULL(l.UomName, N'?') + N''' has no Zoho unit (add to interface.ZohoUom)' END
                          FROM [interface].ZohoPO z JOIN proj.TBL_PURCHASE_ORDER_LINE l ON l.PoLineId = z.PoLineId WHERE z.PushId = @PushId
            ) x WHERE m IS NOT NULL
        ) d);

    IF @Err IS NOT NULL
        UPDATE [interface].ZohoPO SET Status = N'Error', ErrorMessage = LEFT(@Err, 1000) WHERE PushId = @PushId;
END
GO

-- ---- usp_RetryZohoPO : re-queue a PO after its data was fixed -----------
CREATE OR ALTER PROCEDURE [interface].usp_RetryZohoPO
    @PoId INT,
    @By   NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC [interface].usp_QueueZohoPO @PoId = @PoId, @By = @By, @Force = 1, @Reissue = 1;
    SELECT PoId, PushId, Action, Status, ErrorMessage, COUNT(*) AS Lines
    FROM   [interface].ZohoPO
    WHERE  PoId = @PoId AND Status NOT IN (N'Superseded')
    GROUP  BY PoId, PushId, Action, Status, ErrorMessage;
END
GO

-- ---- usp_BackfillZohoPO : queue every PO that is already approved -------
CREATE OR ALTER PROCEDURE [interface].usp_BackfillZohoPO
    @By NVARCHAR(100) = N'backfill'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @id INT;
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
        SELECT PoId FROM proj.TBL_PURCHASE_ORDER
        WHERE IsActive = 1 AND Status IN (N'Approved', N'Sent', N'Partial', N'Received', N'Closed')
        ORDER BY PoId;
    OPEN c; FETCH NEXT FROM c INTO @id;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [interface].usp_QueueZohoPO @PoId = @id, @By = @By, @Force = 1;
        FETCH NEXT FROM c INTO @id;
    END
    CLOSE c; DEALLOCATE c;
    SELECT COUNT(DISTINCT PoId) AS PosQueued, COUNT(*) AS LinesQueued FROM [interface].ZohoPO WHERE Status = N'Pending';
END
GO

-- ---- usp_ZohoGetPending : optional read-and-stamp for Zoho --------------
CREATE OR ALTER PROCEDURE [interface].usp_ZohoGetPending
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @now DATETIME = GETDATE();
    DECLARE @t TABLE (ZohoPoRowId BIGINT PRIMARY KEY);

    UPDATE [interface].ZohoPO
    SET    Status        = N'Read',
           FirstReadDate = ISNULL(FirstReadDate, @now),
           LastReadDate  = @now,
           ReadCount     = ReadCount + 1
    OUTPUT inserted.ZohoPoRowId INTO @t
    WHERE  Status IN (N'Pending', N'Read');

    SELECT z.* FROM [interface].ZohoPO z JOIN @t t ON t.ZohoPoRowId = z.ZohoPoRowId
    ORDER BY z.PushId, z.PoLineId;
END
GO

-- ---- role for the Zoho login -------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'interface_zoho') IS NULL CREATE ROLE interface_zoho;
GO
GRANT SELECT ON [interface].ZohoPO TO interface_zoho;
GRANT UPDATE ON [interface].ZohoPO (Status, FirstReadDate, LastReadDate, ReadCount, ProcessedDate, ZohoReference, ErrorMessage) TO interface_zoho;
GRANT EXECUTE ON [interface].usp_ZohoGetPending TO interface_zoho;
GO
-- Login for Zoho (server level; run in master with your own password, then map it):
--   CREATE LOGIN zoho_reader WITH PASSWORD = '<strong password>', CHECK_POLICY = ON;
--   USE SYNERP; CREATE USER zoho_reader FOR LOGIN zoho_reader; ALTER ROLE interface_zoho ADD MEMBER zoho_reader;
GO

-- ---- the hook: sp_PostPOApproval queues the PO first --------------------
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
CREATE OR ALTER PROCEDURE proj.sp_PostPOApproval
    @DocId INT,
    @By    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Zoho interface: snapshot the approved PO. Does nothing at all unless Interface.Zoho.PoEnabled = 1,
    -- and is never allowed to block an approval.
    IF ISNULL(TRY_CAST((SELECT SettingValue FROM proj.TBL_APP_SETTINGS
                        WHERE SettingKey = N'Interface.Zoho.PoEnabled') AS INT), 0) = 1
    BEGIN
        BEGIN TRY
            EXEC [interface].usp_QueueZohoPO @PoId = @DocId, @By = @By;
        END TRY
        BEGIN CATCH
            BEGIN TRY
                IF XACT_STATE() <> -1
                    INSERT INTO [interface].ZohoQueueLog (PoId, ErrorMessage) VALUES (@DocId, LEFT(ERROR_MESSAGE(), 2000));
            END TRY
            BEGIN CATCH
                SET @By = @By;   -- logging failed too: swallow, approval must go through
            END CATCH
        END CATCH
    END

    -- The approval engine has just set the PO to 'Approved'.
    --  * Goods already received (a Revise PO of a received PO): put the header
    --    back to what its lines say - Received / Partial - using the same
    --    roll-up as sp_RecalcPoLineStatus. Derived, never stored, so it cannot
    --    go stale.
    --  * Nothing received: if the PO was 'Sent' when it was revised, restore
    --    'Sent' (the previous status is kept on the revision log). PoSentDate was
    --    never cleared, so the original sent date is unchanged.
    --  * Otherwise (every normal first approval): no-op.
    IF EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_ORDER_LINE
               WHERE PoId = @DocId AND IsActive = 1 AND ISNULL(ReceivedQty, 0) > 0)
    BEGIN
        DECLARE @AnyLine INT = (SELECT TOP 1 PoLineId FROM proj.TBL_PURCHASE_ORDER_LINE
                                WHERE PoId = @DocId AND IsActive = 1 ORDER BY PoLineId);
        IF @AnyLine IS NOT NULL
            EXEC proj.sp_RecalcPoLineStatus @AnyLine, @By;
        RETURN;
    END

    IF ISNULL((SELECT TOP 1 PreviousStatus FROM proj.TBL_PO_REVISION_LOG
               WHERE PoId = @DocId ORDER BY RevisionLogId DESC), '') = 'Sent'
        UPDATE proj.TBL_PURCHASE_ORDER
        SET    Status       = 'Sent',
               ModifiedBy   = ISNULL(@By, ModifiedBy),
               ModifiedDate = GETDATE()
        WHERE  PoId = @DocId AND IsActive = 1 AND Status = 'Approved';   -- only what the engine just set
END
GO

-- ---- verification --------------------------------------------------------
SELECT 'ZohoPO columns'        AS chk, COUNT(*) AS v FROM sys.columns WHERE object_id = OBJECT_ID(N'[interface].ZohoPO')
UNION ALL SELECT 'procs (expect 4)', COUNT(*) FROM sys.procedures WHERE schema_id = SCHEMA_ID(N'interface')
UNION ALL SELECT 'hook present (1)', CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_PostPOApproval')) LIKE N'%usp_QueueZohoPO%' THEN 1 ELSE 0 END
UNION ALL SELECT 'PoEnabled setting', TRY_CAST(SettingValue AS INT) FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Interface.Zoho.PoEnabled'
UNION ALL SELECT 'hook QUOTED_IDENTIFIER (1)', CAST(uses_quoted_identifier AS INT) FROM sys.sql_modules WHERE object_id = OBJECT_ID(N'proj.sp_PostPOApproval');
GO
