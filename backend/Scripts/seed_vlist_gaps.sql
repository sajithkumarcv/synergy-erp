-- ============================================================================
-- Seed proj.TBL_VLIST groups that were previously hardcoded in the frontend.
-- Idempotent: each row inserted only if (TypeName, ListName, ItemValue) absent.
-- ============================================================================
SET NOCOUNT ON;

DECLARE @seed TABLE (
    TypeName        nvarchar(50),
    ListName        nvarchar(50),
    ItemValue       nvarchar(100),
    ItemDescription nvarchar(200),
    SortOrder       tinyint
);

-- ── Alert frequency ──────────────────────────────────────────────
INSERT INTO @seed VALUES
('Alert','Frequency','Daily',        'Daily',          1),
('Alert','Frequency','Weekly',       'Weekly',         2),
('Alert','Frequency','Monthly',      'Monthly',        3),
('Alert','Frequency','MultipleDaily','Multiple Daily', 4);

-- ── GRN receipt type ─────────────────────────────────────────────
INSERT INTO @seed VALUES
('Inventory','ReceiptType','JOB',  'Job Purchase',   1),
('Inventory','ReceiptType','STORE','Store Purchase', 2);

-- ── Issue costing type ───────────────────────────────────────────
INSERT INTO @seed VALUES
('Inventory','CostingType','INC_COSTING','Including Costing', 1),
('Inventory','CostingType','EXC_COSTING','Excluding Costing', 2);

-- ── Approval approver type ───────────────────────────────────────
INSERT INTO @seed VALUES
('Approval','ApproverType','ANY', 'Anyone (no specific approver)', 1),
('Approval','ApproverType','ROLE','Role',                          2),
('Approval','ApproverType','USER','Specific User',                 3);

-- ── Customer credit flag ─────────────────────────────────────────
INSERT INTO @seed VALUES
('Customer','CreditFlag','GREEN', 'Good Standing', 1),
('Customer','CreditFlag','YELLOW','Warning',       2),
('Customer','CreditFlag','RED',   'Overdue',       3),
('Customer','CreditFlag','BLACK', 'Credit Hold',   4);

-- ── Invoice VAT rate (ItemValue = numeric %, ItemDescription = label) ──
INSERT INTO @seed VALUES
('Invoice','VATRate','0', '0%',  1),
('Invoice','VATRate','5', '5%',  2),
('Invoice','VATRate','10','10%', 3),
('Invoice','VATRate','15','15%', 4);

INSERT INTO proj.TBL_VLIST
    (TypeName, ListName, ItemValue, ItemDescription, IsActive, SortOrder, CreatedBy, CreatedDate)
SELECT s.TypeName, s.ListName, s.ItemValue, s.ItemDescription, 1, s.SortOrder, 'system', GETDATE()
FROM @seed s
WHERE NOT EXISTS (
    SELECT 1 FROM proj.TBL_VLIST v
    WHERE v.TypeName = s.TypeName AND v.ListName = s.ListName AND v.ItemValue = s.ItemValue
);

PRINT CAST(@@ROWCOUNT AS varchar(10)) + ' vlist rows inserted.';
