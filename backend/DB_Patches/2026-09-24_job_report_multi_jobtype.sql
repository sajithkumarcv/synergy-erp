-- Job Report: Job Type filter accepts several types (comma-separated), like the Jobs page.
-- @JobTypeId widened NVARCHAR(50) -> NVARCHAR(500); a single id behaves exactly as before.
SET QUOTED_IDENTIFIER ON;
GO
CREATE OR ALTER PROCEDURE proj.sp_ReportJobs
    @DateFrom       DATE          = NULL,
    @DateTo         DATE          = NULL,
    @CustomerId     INT           = NULL,
    @JobTypeId      NVARCHAR(500) = NULL,   -- comma-separated JobTypeIds (single value still works)
    @JobStageId     NVARCHAR(10)  = NULL,
    @JobStatusId    INT           = NULL,
    @ApprovalStatus NVARCHAR(50)  = NULL,
    @CreatedBy      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        j.JobNumId,
        j.JobId,
        j.ProjectName,
        j.JobDate,
        j.JobTypeName,
        j.JobStageName,
        j.CustomerId,
        j.CustomerName,
        j.JobStatusName,
        j.ApprovalStatus,
        j.CurrencySymbol,
        j.JobExcRate                                                            AS ExchangeRate,
        j.OrderValue,
        j.OrderValue      * ISNULL(j.JobExcRate, 1)                            AS OrderValueBase,
        j.TotalActual,
        j.TotalExpenses,
        j.TotalInvoicing,
        j.TotalInvoicing  * ISNULL(j.JobExcRate, 1)                            AS TotalInvoicingBase,
        ROUND(j.TotalPayments / NULLIF(j.JobExcRate, 0), 2)                    AS TotalPayments,
        j.TotalPayments                                                         AS TotalPaymentsBase,
        ROUND(j.TotalCredit   / NULLIF(j.JobExcRate, 0), 2)                    AS TotalCredit,
        j.TotalCredit                                                           AS TotalCreditBase,
        j.TotalBomValue,
        j.LpoRef,
        j.ContractRef,
        j.ExternalRef,
        j.ParentJobId,
        j.JobCreatedBy,
        j.JobCreatedDate,
        j.IsClosedStatus,
        j.JobPlannedStartDate,
        j.JobExpectedCompleteDate,
        j.JobActualCompleteDate,
        j.JobExpectedDeliveryDate
    FROM proj.VW_JOB j
    WHERE
        (@DateFrom        IS NULL OR CAST(j.JobDate AS DATE) >= @DateFrom)
        AND (@DateTo      IS NULL OR CAST(j.JobDate AS DATE) <= @DateTo)
        AND (@CustomerId  IS NULL OR j.CustomerId      = @CustomerId)
        AND (@JobTypeId   IS NULL OR @JobTypeId = '' OR j.JobTypeId IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeId, ',')))
        AND (@JobStageId  IS NULL OR j.JobStageId      = @JobStageId)
        AND (@JobStatusId IS NULL OR j.JobStatusId     = @JobStatusId)
        AND (@ApprovalStatus IS NULL OR j.ApprovalStatus = @ApprovalStatus)
        AND (@CreatedBy   IS NULL OR j.JobCreatedBy    = @CreatedBy)
    ORDER BY j.JobDate DESC, j.JobId ASC;
END
GO
