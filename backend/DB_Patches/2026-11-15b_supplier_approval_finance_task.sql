-- 2026-11-15b: finance task "Approve supplier X".
--
-- Before: a new supplier, or a supplier whose approval was withdrawn by a bank change, only showed as "not approved"
-- on the supplier list. Nobody was told.
--
-- Now: a trigger on proj.TBL_SUPPLIER creates one open task (proj.TBL_MOM_TASK, the same table the PR -> procurement
-- tasks use) for every active user holding the role FIN_MGR or FIN_OFFCR (matched by RoleCode):
--   * when a supplier is inserted unapproved and active,
--   * when an approved supplier becomes unapproved (bank change, Withdraw approval),
--   * when an inactive supplier is made active again while unapproved.
-- The tasks close by themselves ("AutoClosed" in the task log) when the supplier is approved or made inactive.
-- It sits on the table, so it covers every path (screen, procedures, scripts, imports). No procedure is changed.
-- Existing unapproved suppliers get no task (only a change creates one). Never creates a duplicate while one is open.
-- Task: RefModuleCode 'SUP', RefDocumentId = SupplierId, RefDocumentNo = SupplierCode, JobId '' (column is NOT NULL).
-- Needs 2026-11-02b (supplier approval). Frontend: common/NotificationBell.js (icon + opens the supplier).
-- Apply to: SYNERP, then each company DB. Idempotent (CREATE OR ALTER). Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

CREATE OR ALTER TRIGGER proj.TR_SUPPLIER_FinanceApprovalTask
ON proj.TBL_SUPPLIER
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- 0. The supplier code is filled in just after the insert (and names can be edited): keep open task text current.
    IF UPDATE(SupplierCode) OR UPDATE(SupplierName)
        UPDATE t
        SET Description   = N'Approve supplier ' + CASE WHEN ISNULL(i.SupplierCode, '') = '' THEN N'' ELSE i.SupplierCode + N' - ' END + i.SupplierName,
            RefDocumentNo = i.SupplierCode
        FROM proj.TBL_MOM_TASK t
        JOIN inserted i ON i.SupplierId = t.RefDocumentId
        WHERE t.RefModuleCode = 'SUP' AND t.IsActive = 1 AND t.Status IN ('Open', 'InProgress', 'Reassigned');

    -- 1. Close open tasks of suppliers that are now approved or inactive.
    DECLARE @Closed TABLE (MomTaskId INT, OldStatus NVARCHAR(20));

    UPDATE t
    SET Status = 'Closed', ModifiedBy = ISNULL(i.ModifiedBy, 'System'), ModifiedDate = GETDATE()
    OUTPUT inserted.MomTaskId, deleted.Status INTO @Closed (MomTaskId, OldStatus)
    FROM proj.TBL_MOM_TASK t
    JOIN inserted i ON i.SupplierId = t.RefDocumentId
    WHERE t.RefModuleCode = 'SUP' AND t.IsActive = 1
      AND t.Status IN ('Open', 'InProgress', 'Reassigned')
      AND (i.IsApprovedVendor = 1 OR i.IsActive = 0);

    INSERT INTO proj.TBL_MOM_TASK_LOG (MomTaskId, Action, OldStatus, NewStatus, Remarks, ActionBy, ActionDate)
    SELECT MomTaskId, 'AutoClosed', OldStatus, 'Closed', 'Supplier approved or made inactive', 'System', GETDATE()
    FROM @Closed;

    -- 2. Create tasks for suppliers that now need approval (new, approval withdrawn, or re-activated).
    DECLARE @Need TABLE (SupplierId INT PRIMARY KEY, SupplierCode NVARCHAR(50), SupplierName NVARCHAR(200), CreatedBy NVARCHAR(100));

    INSERT INTO @Need (SupplierId, SupplierCode, SupplierName, CreatedBy)
    SELECT i.SupplierId, i.SupplierCode, i.SupplierName, ISNULL(NULLIF(ISNULL(i.ModifiedBy, i.CreatedBy), ''), 'System')
    FROM inserted i
    LEFT JOIN deleted d ON d.SupplierId = i.SupplierId
    WHERE i.IsActive = 1 AND ISNULL(i.IsApprovedVendor, 0) = 0
      AND (d.SupplierId IS NULL OR ISNULL(d.IsApprovedVendor, 0) = 1 OR d.IsActive = 0)
      AND NOT EXISTS (SELECT 1 FROM proj.TBL_MOM_TASK t
                      WHERE t.RefModuleCode = 'SUP' AND t.RefDocumentId = i.SupplierId AND t.IsActive = 1
                        AND t.Status IN ('Open', 'InProgress', 'Reassigned'));

    IF NOT EXISTS (SELECT 1 FROM @Need) RETURN;

    DECLARE @Assignees TABLE (UserName NVARCHAR(100) PRIMARY KEY);
    INSERT INTO @Assignees (UserName)
    SELECT DISTINCT u.UserName
    FROM proj.TBL_ROLES r
    JOIN proj.TBL_USER_ROLES ur ON ur.RoleId = r.RoleId
    JOIN proj.TBL_USERS u ON u.UserId = ur.UserId AND u.IsActive = 1
    WHERE r.RoleCode IN ('FIN_MGR', 'FIN_OFFCR') AND r.IsActive = 1;

    DECLARE @Inserted TABLE (MomTaskId INT, AssignedTo NVARCHAR(100));

    INSERT INTO proj.TBL_MOM_TASK
        (MomId, JobId, Description, DueDate, Priority, AssignedTo, Status, Remarks,
         RefModuleCode, RefDocumentId, RefDocumentNo, IsActive, CreatedBy, CreatedDate)
    OUTPUT inserted.MomTaskId, inserted.AssignedTo INTO @Inserted (MomTaskId, AssignedTo)
    SELECT NULL, '',
           N'Approve supplier ' + CASE WHEN ISNULL(n.SupplierCode, '') = '' THEN N'' ELSE n.SupplierCode + N' - ' END + n.SupplierName,
           NULL, 'Medium', a.UserName, 'Open', NULL,
           'SUP', n.SupplierId, n.SupplierCode, 1, n.CreatedBy, GETDATE()
    FROM @Need n CROSS JOIN @Assignees a;

    INSERT INTO proj.TBL_MOM_TASK_LOG (MomTaskId, Action, ToUser, NewStatus, Remarks, ActionBy, ActionDate)
    SELECT MomTaskId, 'Assigned', AssignedTo, 'Open', 'Auto-created: supplier needs finance approval', 'System', GETDATE()
    FROM @Inserted;
END
GO
