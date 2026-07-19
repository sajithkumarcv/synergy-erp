-- ============================================================================
-- Seed proj.TBL_DOCUMENT_STATUS for modules missing from the table:
--   DLV (Delivery), CN (Credit Note), DN (Debit Note),
--   PV (Payment Voucher), RV (Receipt Voucher)
-- Idempotent: each row inserted only if (ModuleName, StatusCode) not present.
-- Badge colours/flags mirror the previously-hardcoded frontend constants.
-- ============================================================================
SET NOCOUNT ON;

DECLARE @seed TABLE (
    ModuleName         nvarchar(20),
    StatusCode         nvarchar(40),
    StatusLabel        nvarchar(60),
    BadgeBg            nvarchar(20),
    BadgeColor         nvarchar(20),
    BadgeDot           nvarchar(20),
    SortOrder          int,
    CanEdit            bit,
    CanDelete          bit,
    CanUploadDocs      bit,
    IsInitial          bit,
    IsTerminal         bit,
    AllowedTransitions nvarchar(200)
);

-- ── Delivery (DLV) ───────────────────────────────────────────────
INSERT INTO @seed VALUES
('DLV','Draft',     'Draft',     '#f1f5f9','#475569','#94a3b8',1,1,1,1,1,0,'Approved,Cancelled'),
('DLV','Approved',  'Approved',  '#dcfce7','#166534','#16a34a',2,1,0,1,0,0,'Dispatched,Draft'),
('DLV','Dispatched','Dispatched','#dbeafe','#1e40af','#3b82f6',3,0,0,1,0,0,'Delivered'),
('DLV','Delivered', 'Delivered', '#ccfbf1','#0f766e','#14b8a6',4,0,0,0,0,1,NULL),
('DLV','Cancelled', 'Cancelled', '#fee2e2','#991b1b','#ef4444',5,0,0,0,0,1,NULL);

-- ── Credit Note (CN) ─────────────────────────────────────────────
INSERT INTO @seed VALUES
('CN','Draft',          'Draft',           '#f1f5f9','#475569','#94a3b8',1,1,1,1,1,0,'PendingApproval,Approved,Cancelled'),
('CN','PendingApproval','Pending Approval','#fef3c7','#92400e','#f59e0b',2,0,0,0,0,0,'Approved,Rejected'),
('CN','Approved',       'Approved',        '#dcfce7','#166534','#16a34a',3,0,0,1,0,0,'Cancelled'),
('CN','Rejected',       'Rejected',        '#fee2e2','#991b1b','#dc2626',4,1,0,0,0,0,NULL),
('CN','Cancelled',      'Cancelled',       '#fce7f3','#9d174d','#db2777',5,0,0,0,0,1,NULL);

-- ── Debit Note (DN) ──────────────────────────────────────────────
INSERT INTO @seed VALUES
('DN','Draft',          'Draft',           '#f1f5f9','#475569','#94a3b8',1,1,1,1,1,0,'PendingApproval,Approved,Cancelled'),
('DN','PendingApproval','Pending Approval','#fef3c7','#92400e','#f59e0b',2,0,0,0,0,0,'Approved,Rejected'),
('DN','Approved',       'Approved',        '#dcfce7','#166534','#16a34a',3,0,0,1,0,0,'Cancelled'),
('DN','Rejected',       'Rejected',        '#fee2e2','#991b1b','#dc2626',4,1,0,0,0,0,NULL),
('DN','Cancelled',      'Cancelled',       '#fce7f3','#9d174d','#db2777',5,0,0,0,0,1,NULL);

-- ── Payment Voucher (PV) ─────────────────────────────────────────
INSERT INTO @seed VALUES
('PV','Draft',          'Draft',           '#f1f5f9','#475569','#94a3b8',1,1,1,1,1,0,'PendingApproval,Approved,Cancelled'),
('PV','PendingApproval','Pending Approval','#fef3c7','#92400e','#f59e0b',2,0,0,0,0,0,'Approved,Rejected'),
('PV','Approved',       'Approved',        '#dcfce7','#166534','#16a34a',3,0,0,1,0,0,'Cancelled'),
('PV','Rejected',       'Rejected',        '#fee2e2','#991b1b','#dc2626',4,1,0,0,0,0,NULL),
('PV','Cancelled',      'Cancelled',       '#fce7f3','#9d174d','#db2777',5,0,0,0,0,1,NULL);

-- ── Receipt Voucher (RV) ─────────────────────────────────────────
INSERT INTO @seed VALUES
('RV','Draft',          'Draft',           '#f1f5f9','#475569','#94a3b8',1,1,1,1,1,0,'PendingApproval,Approved,Cancelled'),
('RV','PendingApproval','Pending Approval','#fef3c7','#92400e','#f59e0b',2,0,0,0,0,0,'Approved,Rejected'),
('RV','Approved',       'Approved',        '#dcfce7','#166534','#16a34a',3,0,0,1,0,0,'Cancelled'),
('RV','Rejected',       'Rejected',        '#fee2e2','#991b1b','#dc2626',4,1,0,0,0,0,NULL),
('RV','Cancelled',      'Cancelled',       '#fce7f3','#9d174d','#db2777',5,0,0,0,0,1,NULL);

-- ── Stock Receipt (RCPT) — inventory GRN / TBL_STOCK_RECEIPT ──────
INSERT INTO @seed VALUES
('RCPT','Draft',    'Draft',     '#fef9c3','#854d0e','#ca8a04',1,1,1,1,1,0,'Confirmed'),
('RCPT','Confirmed','Confirmed', '#dcfce7','#166534','#16a34a',2,0,0,1,0,1,NULL);

-- ── Return To Vendor (RTV) ───────────────────────────────────────
INSERT INTO @seed VALUES
('RTV','Draft',    'Draft',     '#fef9c3','#854d0e','#ca8a04',1,1,1,1,1,0,'Posted,Cancelled'),
('RTV','Posted',   'Posted',    '#d1fae5','#065f46','#10b981',2,0,0,1,0,1,NULL),
('RTV','Cancelled','Cancelled', '#fee2e2','#991b1b','#ef4444',3,0,0,0,0,1,NULL);

INSERT INTO proj.TBL_DOCUMENT_STATUS
    (ModuleName, StatusCode, StatusLabel, BadgeBg, BadgeColor, BadgeDot, SortOrder,
     CanEdit, CanDelete, CanUploadDocs, IsInitial, IsTerminal, AllowedTransitions,
     IsActive, CanPrint, CreatedBy, CreatedDate)
SELECT s.ModuleName, s.StatusCode, s.StatusLabel, s.BadgeBg, s.BadgeColor, s.BadgeDot, s.SortOrder,
       s.CanEdit, s.CanDelete, s.CanUploadDocs, s.IsInitial, s.IsTerminal, s.AllowedTransitions,
       1, 1, 'system', GETDATE()
FROM @seed s
WHERE NOT EXISTS (
    SELECT 1 FROM proj.TBL_DOCUMENT_STATUS d
    WHERE d.ModuleName = s.ModuleName AND d.StatusCode = s.StatusCode
);

PRINT CAST(@@ROWCOUNT AS varchar(10)) + ' document-status rows inserted.';
