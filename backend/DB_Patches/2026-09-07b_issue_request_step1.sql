-- 2026-09-07: Issue Request — BUILD STEP 1 of 5
--             Tables + document series + approval module row + menu.
--
-- Apply to: ERPDB
--
-- Design: backend/Docs/DESIGN-issue-request.md (§3, §5, §10 step 1).
--
-- SCOPE — this script changes NO existing object and NO existing row.
-- It only adds: two tables, one TBL_DOCUMENT_SERIES row, one TBL_APPROVAL_MODULE
-- row, one TBL_MENU row and its actions. Nothing in the application reads any of
-- it yet, so applying this is invisible to users. Deliberately NOT here (later steps):
--   step 3 — TBL_STOCK_ISSUE.RequestId / IssueTypeId, TBL_STOCK_ISSUE_LINE.RequestLineId,
--            TBL_ISSUE_TYPE.RequiresRequest
--   step 4 — TBL_STOCK_BALANCE.QtyReserved / QtyAvailable, the ReservationDays setting
--   step 5 — TBL_BOM_DETAILS.IsrCreatedQty
--
-- TWO DELIBERATE DEPARTURES from the design doc's literal text, both to avoid
-- shipping something that dangles until a later step:
--
--   1. The menu row goes in with IsActive = 0. There is no /inventory-issue-request
--      route until step 2, and an active menu item pointing at a non-existent screen
--      is a dead link for every user. Step 2 flips it to 1.
--   2. TBL_APPROVAL_MODULE.PostApprovalSP is left NULL rather than naming
--      proj.sp_PostIssueRequestApproval, which does not exist yet. Four live modules
--      (BOM, PO, PR, JOB) run with NULL there, so this is normal; step 4 sets it when
--      the proc is created and the reservation it takes actually exists.
--
-- Idempotent — every statement is guarded, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ─── 1. Header ─────────────────────────────────────────────────────────── */
IF OBJECT_ID('proj.TBL_STOCK_ISSUE_REQUEST', 'U') IS NULL
BEGIN
    CREATE TABLE proj.TBL_STOCK_ISSUE_REQUEST (
        RequestId             INT IDENTITY(1,1) NOT NULL,
        RequestNo             NVARCHAR(30)   NOT NULL,
        RequestDate           DATE           NOT NULL CONSTRAINT DF_ISR_DATE      DEFAULT (CONVERT(DATE, GETDATE())),
        JobId                 NVARCHAR(50)   NOT NULL,
        IssueTypeId           INT            NOT NULL,
        RequiredDate          DATE           NULL,
        RequestedBy           NVARCHAR(100)  NOT NULL,
        Department            NVARCHAR(100)  NULL,
        RequestedFor          NVARCHAR(100)  NULL,
        Status                NVARCHAR(20)   NOT NULL CONSTRAINT DF_ISR_STATUS    DEFAULT ('Draft'),
        -- Stamped by sp_PostIssueRequestApproval in step 4; null until then.
        ReservationExpiryDate DATE           NULL,
        Priority              NVARCHAR(20)   NULL,
        Notes                 NVARCHAR(500)  NULL,
        IsActive              BIT            NOT NULL CONSTRAINT DF_ISR_ACTIVE    DEFAULT (1),
        CreatedBy             NVARCHAR(100)  NOT NULL,
        CreatedDate           DATETIME       NOT NULL CONSTRAINT DF_ISR_CREATED   DEFAULT (GETDATE()),
        ModifiedBy            NVARCHAR(100)  NULL,
        ModifiedDate          DATETIME       NULL,
        CONSTRAINT PK_STOCK_ISSUE_REQUEST PRIMARY KEY CLUSTERED (RequestId),
        CONSTRAINT UQ_ISSUE_REQUEST_NO    UNIQUE (RequestNo),
        CONSTRAINT FK_ISR_JOB       FOREIGN KEY (JobId)       REFERENCES proj.TBL_JOB (JobId),
        CONSTRAINT FK_ISR_ISSUETYPE FOREIGN KEY (IssueTypeId) REFERENCES proj.TBL_ISSUE_TYPE (IssueTypeId)
    );

    CREATE INDEX IX_ISR_JOB    ON proj.TBL_STOCK_ISSUE_REQUEST (JobId);
    CREATE INDEX IX_ISR_STATUS ON proj.TBL_STOCK_ISSUE_REQUEST (Status);
    PRINT 'Created proj.TBL_STOCK_ISSUE_REQUEST';
END
ELSE PRINT 'proj.TBL_STOCK_ISSUE_REQUEST already exists — skipped';
GO

/* ─── 2. Lines ──────────────────────────────────────────────────────────── */
IF OBJECT_ID('proj.TBL_STOCK_ISSUE_REQUEST_LINE', 'U') IS NULL
BEGIN
    CREATE TABLE proj.TBL_STOCK_ISSUE_REQUEST_LINE (
        RequestLineId INT IDENTITY(1,1) NOT NULL,
        RequestId     INT            NOT NULL,
        LineNum       INT            NOT NULL,
        ItemId        INT            NOT NULL,
        -- Set when the line was pulled from the BOM, so consumption traces back
        -- to the plan. BomId is the PK of TBL_BOM_DETAILS.
        BomId         INT            NULL,
        RequestedQty  DECIMAL(18,4)  NOT NULL CONSTRAINT DF_ISRL_REQQTY   DEFAULT (0),
        -- Maintained by the issue note (step 3), never typed by a user.
        IssuedQty     DECIMAL(18,4)  NOT NULL CONSTRAINT DF_ISRL_ISSQTY   DEFAULT (0),
        -- Held by this line; released as it issues (step 4).
        ReservedQty   DECIMAL(18,4)  NOT NULL CONSTRAINT DF_ISRL_RESQTY   DEFAULT (0),
        UomId         INT            NULL,
        RequiredDate  DATE           NULL,
        LineStatus    NVARCHAR(20)   NOT NULL CONSTRAINT DF_ISRL_STATUS   DEFAULT ('Pending'),
        Notes         NVARCHAR(200)  NULL,
        IsActive      BIT            NOT NULL CONSTRAINT DF_ISRL_ACTIVE   DEFAULT (1),
        CreatedBy     NVARCHAR(100)  NOT NULL,
        CreatedDate   DATETIME       NOT NULL CONSTRAINT DF_ISRL_CREATED  DEFAULT (GETDATE()),
        ModifiedBy    NVARCHAR(100)  NULL,
        ModifiedDate  DATETIME       NULL,
        CONSTRAINT PK_STOCK_ISSUE_REQUEST_LINE PRIMARY KEY CLUSTERED (RequestLineId),
        CONSTRAINT FK_ISRL_REQUEST FOREIGN KEY (RequestId) REFERENCES proj.TBL_STOCK_ISSUE_REQUEST (RequestId),
        CONSTRAINT FK_ISRL_ITEM    FOREIGN KEY (ItemId)    REFERENCES proj.TBL_ITEM (ItemId),
        CONSTRAINT FK_ISRL_BOM     FOREIGN KEY (BomId)     REFERENCES proj.TBL_BOM_DETAILS (BomId),
        CONSTRAINT FK_ISRL_UOM     FOREIGN KEY (UomId)     REFERENCES proj.TBL_ITEM_UOM (UomId)
    );

    CREATE INDEX IX_ISRL_REQUEST ON proj.TBL_STOCK_ISSUE_REQUEST_LINE (RequestId);
    CREATE INDEX IX_ISRL_ITEM    ON proj.TBL_STOCK_ISSUE_REQUEST_LINE (ItemId);
    PRINT 'Created proj.TBL_STOCK_ISSUE_REQUEST_LINE';
END
ELSE PRINT 'proj.TBL_STOCK_ISSUE_REQUEST_LINE already exists — skipped';
GO

/* ─── 3. Document series — ISR-26-0001 ──────────────────────────────────────
   Mirrors the ISN and IRN rows exactly (YearDigits 2, PadLength 4). Numbers are
   drawn by proj.sp_GetNextDocNumber; the CRUD proc never formats its own.
   SortOrder 25 places it between PR (20) and ISN (30) in the series admin. */
IF NOT EXISTS (SELECT 1 FROM proj.TBL_DOCUMENT_SERIES WHERE DocTypeId = 'ISR')
BEGIN
    INSERT INTO proj.TBL_DOCUMENT_SERIES
      (DocTypeId, DocTypeName, Prefix, Separator, IncludeYear, YearDigits,
       ResetYearly, PadLength, StartingSeries, CurrentSeries, SortOrder, IsActive,
       SourceTable, SourceNumberColumn, CreatedBy, CreatedDate)
    VALUES
      ('ISR', 'Issue Request', 'ISR', '-', 1, 2, 1, 4, 1, 0, 25, 1,
       'TBL_STOCK_ISSUE_REQUEST', 'RequestNo', 'system', GETDATE());
    PRINT 'Inserted TBL_DOCUMENT_SERIES row ISR';
END
ELSE PRINT 'TBL_DOCUMENT_SERIES row ISR already exists — skipped';
GO

/* ─── 4. Approval module ────────────────────────────────────────────────────
   The engine is metadata driven, so this one row is the whole wiring. Approval
   levels are then configured in the existing Approvals admin screen.
   IsAmountBased = 0: a request is authorised on who is asking and for which job,
   not on money. CancelledStatus 'Draft' is the house norm across all 14 modules.
   ModifiedByColumn / ModifiedDateColumn are nullable but must be set — leaving
   them out inserts cleanly and then silently never records who approved.
   PostApprovalSP stays NULL until step 4 creates sp_PostIssueRequestApproval.

   CreatedBy is nvarchar(50) NOT NULL with NO default — the design doc's INSERT
   omitted it and failed here with "Cannot insert the value NULL into column
   'CreatedBy'". Same trap the doc calls out for TBL_DOCUMENT_SERIES; it applies
   to this table too. */
IF NOT EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'ISR')
BEGIN
    INSERT INTO proj.TBL_APPROVAL_MODULE
      (ModuleCode, ModuleName, IsAmountBased, DocumentTable, DocumentIdColumn,
       StatusColumn, ApprovedStatus, RejectedStatus, CancelledStatus,
       ModifiedByColumn, ModifiedDateColumn, PostApprovalSP, IsActive,
       CreatedBy, CreatedDate)
    VALUES
      ('ISR', 'Issue Request', 0, 'TBL_STOCK_ISSUE_REQUEST', 'RequestId',
       'Status', 'Approved', 'Rejected', 'Draft',
       'ModifiedBy', 'ModifiedDate', NULL, 1,
       'system', GETDATE());
    PRINT 'Inserted TBL_APPROVAL_MODULE row ISR';
END
ELSE PRINT 'TBL_APPROVAL_MODULE row ISR already exists — skipped';
GO

/* ─── 5. Menu + actions ─────────────────────────────────────────────────────
   Under Inventory (MenuId 14), beside Issue Notes (18) and Issue Returns (35).
   INACTIVE until step 2 ships the screen — see the header note.
   Action codes copy the Issue Returns set, which is the fuller of the two
   (VIEW / ADD / EDIT / DELETE / CONFIRM / PRINT). */
IF NOT EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuUrl = '/inventory-issue-request')
BEGIN
    DECLARE @MenuId INT;

    INSERT INTO proj.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (14, 'Issue Requests', '/inventory-issue-request', NULL, 4, 0);

    SET @MenuId = SCOPE_IDENTITY();

    INSERT INTO proj.TBL_MENU_ACTIONS (MenuId, ActionName, ActionCode, IsActive)
    VALUES (@MenuId, 'View',    'VIEW',    1),
           (@MenuId, 'Add',     'ADD',     1),
           (@MenuId, 'Edit',    'EDIT',    1),
           (@MenuId, 'Delete',  'DELETE',  1),
           (@MenuId, 'Confirm', 'CONFIRM', 1),
           (@MenuId, 'Print',   'PRINT',   1);

    PRINT CONCAT('Inserted TBL_MENU row ', @MenuId, ' (inactive) + 6 actions');
END
ELSE PRINT 'TBL_MENU row /inventory-issue-request already exists — skipped';
GO

/* ─── Verify ────────────────────────────────────────────────────────────── */
SELECT 'TBL_STOCK_ISSUE_REQUEST'      AS Object,
       CASE WHEN OBJECT_ID('proj.TBL_STOCK_ISSUE_REQUEST','U')      IS NULL THEN 'MISSING' ELSE 'OK' END AS Result
UNION ALL SELECT 'TBL_STOCK_ISSUE_REQUEST_LINE',
       CASE WHEN OBJECT_ID('proj.TBL_STOCK_ISSUE_REQUEST_LINE','U') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'DOCUMENT_SERIES ISR',
       CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_DOCUMENT_SERIES WHERE DocTypeId='ISR')  THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'APPROVAL_MODULE ISR',
       CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode='ISR') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'MENU (inactive) + actions',
       CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_MENU m JOIN proj.TBL_MENU_ACTIONS a ON a.MenuId=m.MenuId
                         WHERE m.MenuUrl='/inventory-issue-request')                    THEN 'OK' ELSE 'MISSING' END;
GO
