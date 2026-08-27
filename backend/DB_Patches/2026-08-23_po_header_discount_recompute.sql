/* ============================================================================
   PO Discount % never reaches the total when changed on the header

   BUG (seen on PO-26-0108, prod): the print shows
       Subtotal   25,087.65
       GST         4,515.78
       Discount  - 4,515.78
       TOTAL      29,603.43     <- 25,087.65 + 4,515.78, discount NOT deducted
   The discount line is computed client-side from Discount%, but the stored
   header TotalAmount never had it applied, so the document does not add up.

   CAUSE: two code paths write TBL_PURCHASE_ORDER.TotalAmount and only one
   applies the discount.
     - sp_SetPOLine  recomputes on every line save:
         subtotal - (subtotal * Discount% / 100) + line tax + header TaxAmount
     - sp_SetPO (header save) just does
         TotalAmount = ISNULL(@TotalAmount, TotalAmount)
       so changing Discount% stores the new percentage and leaves the old
       total untouched. It silently "fixes itself" the next time any line is
       saved, which is why this is intermittent and hard to reproduce.

   FIX: after the header UPDATE, sp_SetPO recomputes TotalAmount from the
   lines using the SAME formula as sp_SetPOLine - one formula, both entry
   points. Reads Discount AFTER the update so the new percentage is used.
   Only recomputes when the PO actually has active lines, so creating or
   editing a header-only PO is unaffected.

   DB-ONLY: no API or frontend change, nothing to rebuild or redeploy.

   APPLY TO: SYNERPINDIA and SYNERPUAE.

   PART 2 below is a PREVIEW of existing POs whose stored total is already
   wrong. It changes nothing. Read it before deciding whether to backfill -
   correcting an already-approved PO changes the value it was approved at,
   which is a business decision, not a technical one.

   BEFORE APPLYING, confirm the target matches what this was written from
   (dev SYNERP, 2026-08-23):
     SELECT m.definition FROM sys.sql_modules m
     JOIN sys.objects o ON o.object_id = m.object_id WHERE o.name = 'sp_SetPO';
   ============================================================================ */

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 - the fix
-- ═══════════════════════════════════════════════════════════════════════════
ALTER PROCEDURE proj.sp_SetPO
    @PoId              INT           = 0,
    @PoDate            DATE          = NULL,
    @SupplierId        INT           = NULL,
    @SupplierContactId INT           = NULL,
    @JobId             NVARCHAR(50)  = NULL,
    @VendorName        NVARCHAR(200) = NULL,
    @VendorRef         NVARCHAR(100) = NULL,
    @VendorQuoteDate   DATE          = NULL,
    @CurrencyId        INT           = NULL,
    @ExchangeRate      DECIMAL(18,6) = 1,
    @PaymentTermsId    INT           = NULL,
    @PaymentTermsOther NVARCHAR(200) = NULL,
    @DeliveryDate      DATE          = NULL,
    @DeliveryAddr      NVARCHAR(300) = NULL,
    @DeliveryTerms     NVARCHAR(100) = NULL,
    @Discount          DECIMAL(18,2) = NULL,
    @TaxAmount         DECIMAL(18,2) = NULL,
    @TotalAmount       DECIMAL(18,2) = NULL,
    @PaidAmount        DECIMAL(18,2) = NULL,
    @InvoiceReceived   BIT           = NULL,
    @ApprovedBy        NVARCHAR(100) = NULL,
    @ApprovedDate      DATETIME      = NULL,
    @HoldBy            NVARCHAR(100) = NULL,
    @HoldDate          DATETIME      = NULL,
    @Revision          INT           = NULL,
    @Priority          NVARCHAR(20)  = NULL,
    @Notes             NVARCHAR(500) = NULL,
    @ExpenseCategoryId INT           = NULL,
    @CreatedBy         NVARCHAR(100) = NULL,
    @ModifiedBy        NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @JobId IS NOT NULL EXEC proj.sp_AssertJobOpen @JobId;
    IF @JobId IS NOT NULL EXEC proj.sp_AssertBudgetApproved @JobId, N'PO';

    -- "Other" payment terms must be specified with free text
    IF NULLIF(@PaymentTermsId, 0) IS NOT NULL
       AND EXISTS (SELECT 1 FROM proj.TBL_PAYMENT_TERMS WHERE PaymentTermsId=@PaymentTermsId AND TermCode='OTHER')
       AND NULLIF(LTRIM(RTRIM(@PaymentTermsOther)), '') IS NULL
        THROW 50508, 'Please specify the payment terms.', 1;

    IF @PoId = 0 OR @PoId IS NULL
    BEGIN
        IF NULLIF(@CreatedBy, '')        IS NULL THROW 50500, 'CreatedBy is required.',         1;
        IF NULLIF(@SupplierId, 0)        IS NULL THROW 50501, 'Supplier is required.',          1;
        IF NULLIF(@JobId, '')            IS NULL THROW 50502, 'Job is required.',               1;
        IF NULLIF(@CurrencyId, 0)        IS NULL THROW 50503, 'Currency is required.',          1;
        IF NULLIF(@PaymentTermsId, 0)    IS NULL THROW 50504, 'Payment Terms are required.',    1;
        IF NULLIF(@ExpenseCategoryId, 0) IS NULL THROW 50506, 'Budget Category is required.',   1;

        DECLARE @IsClosed BIT = 0, @StatusName NVARCHAR(50) = '';
        SELECT @IsClosed = js.IsClosed, @StatusName = js.StatusName
        FROM   proj.TBL_JOB j
        JOIN   proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId
        WHERE  j.JobId = @JobId;
        IF @IsClosed = 1
        BEGIN
            DECLARE @ErrMsg NVARCHAR(200) = 'Job ' + @JobId + ' is ' + @StatusName + '. Revise the job to create new transactions.';
            THROW 50505, @ErrMsg, 1;
        END

        DECLARE @NumResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @NumResult EXEC proj.sp_GetNextDocNumber 'PO';
        DECLARE @PoNumber NVARCHAR(50);
        SELECT @PoNumber = DocNumber FROM @NumResult;

        INSERT INTO PROJ.TBL_PURCHASE_ORDER (
            PoNumber, PoDate, SupplierId, SupplierContactId, JobId, VendorName, VendorRef,
            VendorQuoteDate, CurrencyId, ExchangeRate, PaymentTermsId, PaymentTermsOther, DeliveryDate, DeliveryAddr,
            DeliveryTerms, Discount, TaxAmount, TotalAmount, PaidAmount,
            InvoiceReceived, ApprovedBy, ApprovedDate, HoldBy, HoldDate,
            Revision, Priority, Notes, ExpenseCategoryId, CreatedBy, CreatedDate
        ) VALUES (
            @PoNumber, ISNULL(@PoDate, CAST(GETDATE() AS DATE)),
            @SupplierId, NULLIF(@SupplierContactId,0), @JobId,
            @VendorName, @VendorRef, @VendorQuoteDate,
            @CurrencyId, ISNULL(@ExchangeRate,1),
            @PaymentTermsId, NULLIF(LTRIM(RTRIM(@PaymentTermsOther)), ''), @DeliveryDate, @DeliveryAddr,
            @DeliveryTerms, @Discount, @TaxAmount, @TotalAmount, @PaidAmount,
            ISNULL(@InvoiceReceived,0), @ApprovedBy, @ApprovedDate,
            @HoldBy, @HoldDate, ISNULL(@Revision,0), NULLIF(@Priority,''), @Notes,
            NULLIF(@ExpenseCategoryId,0), @CreatedBy, GETDATE()
        );

        DECLARE @NewPoId INT = SCOPE_IDENTITY();
        INSERT INTO PROJ.TBL_PURCHASE_ORDER_META (PoId, CreatedBy, CreatedDate)
        VALUES (@NewPoId, @CreatedBy, GETDATE());

        SELECT CAST(@NewPoId AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        UPDATE PROJ.TBL_PURCHASE_ORDER SET
            PoDate             = ISNULL(@PoDate,            PoDate),
            SupplierId         = NULLIF(@SupplierId,        0),
            SupplierContactId  = NULLIF(@SupplierContactId, 0),
            JobId              = NULLIF(@JobId,             ''),
            VendorName         = @VendorName,
            VendorRef          = @VendorRef,
            VendorQuoteDate    = @VendorQuoteDate,
            CurrencyId         = NULLIF(@CurrencyId,        0),
            ExchangeRate       = ISNULL(@ExchangeRate,      ExchangeRate),
            PaymentTermsId     = NULLIF(@PaymentTermsId,    0),
            PaymentTermsOther  = NULLIF(LTRIM(RTRIM(@PaymentTermsOther)), ''),
            DeliveryDate       = @DeliveryDate,
            DeliveryAddr       = @DeliveryAddr,
            DeliveryTerms      = @DeliveryTerms,
            Discount           = @Discount,
            Priority           = NULLIF(@Priority,          ''),
            TaxAmount          = ISNULL(@TaxAmount,         TaxAmount),
            TotalAmount        = ISNULL(@TotalAmount,       TotalAmount),
            PaidAmount         = ISNULL(@PaidAmount,        PaidAmount),
            InvoiceReceived    = ISNULL(@InvoiceReceived,   InvoiceReceived),
            ApprovedBy         = ISNULL(@ApprovedBy,        ApprovedBy),
            ApprovedDate       = ISNULL(@ApprovedDate,      ApprovedDate),
            HoldBy             = ISNULL(@HoldBy,            HoldBy),
            HoldDate           = ISNULL(@HoldDate,          HoldDate),
            Revision           = ISNULL(@Revision,          Revision),
            Notes              = @Notes,
            ExpenseCategoryId  = NULLIF(@ExpenseCategoryId, 0),
            ModifiedBy         = @ModifiedBy,
            ModifiedDate       = GETDATE()
        WHERE PoId = @PoId AND IsActive = 1;

        -- ── ADDED 2026-08-23 ────────────────────────────────────────────
        -- Recompute the header total from the lines, with the SAME formula
        -- sp_SetPOLine uses, so a Discount% change on the header takes effect
        -- immediately instead of waiting for the next line save.
        -- Runs AFTER the update above, so it reads the NEW Discount%.
        -- Header TaxAmount is read, never written - it is typed by the user
        -- on the PO Overview tab and must not be silently overwritten.
        IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE
                   WHERE PoId = @PoId AND IsActive = 1)
        BEGIN
            DECLARE @LinesSubtotal     DECIMAL(18,4) = (
                SELECT ISNULL(SUM(OrderedQty * UnitPrice), 0)
                FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1);
            DECLARE @LinesTax          DECIMAL(18,4) = (
                SELECT ISNULL(SUM(OrderedQty * UnitPrice * TaxPct / 100.0), 0)
                FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1);
            DECLARE @HeaderDiscountPct DECIMAL(18,4) = (
                SELECT ISNULL(Discount,  0) FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId);
            DECLARE @HeaderTaxAmount   DECIMAL(18,4) = (
                SELECT ISNULL(TaxAmount, 0) FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId);

            UPDATE PROJ.TBL_PURCHASE_ORDER
            SET TotalAmount = @LinesSubtotal
                            - (@LinesSubtotal * @HeaderDiscountPct / 100.0)
                            + @LinesTax
                            + @HeaderTaxAmount
            WHERE PoId = @PoId;
        END
        -- ── end 2026-08-23 ──────────────────────────────────────────────

        SELECT CAST(@PoId AS NVARCHAR(20));
    END
END;
GO

/* ═══════════════════════════════════════════════════════════════════════════
   PART 2 - PREVIEW ONLY. Changes nothing.

   Lists POs whose stored TotalAmount disagrees with the recomputed value,
   i.e. the ones already wrong today. Run it, look at the Status column, then
   decide. PO-26-0108 should appear here.
   ═══════════════════════════════════════════════════════════════════════════ */
SELECT
    po.PoNumber,
    po.Status,
    po.Discount                            AS DiscountPct,
    t.LinesSubtotal,
    t.LinesTax,
    ISNULL(po.TaxAmount, 0)                AS HeaderTaxAmount,
    po.TotalAmount                         AS StoredTotal,
    CAST(t.LinesSubtotal
       - (t.LinesSubtotal * ISNULL(po.Discount,0) / 100.0)
       + t.LinesTax
       + ISNULL(po.TaxAmount,0) AS DECIMAL(18,2)) AS CorrectTotal,
    CAST(po.TotalAmount - (t.LinesSubtotal
       - (t.LinesSubtotal * ISNULL(po.Discount,0) / 100.0)
       + t.LinesTax
       + ISNULL(po.TaxAmount,0)) AS DECIMAL(18,2)) AS Difference
FROM PROJ.TBL_PURCHASE_ORDER po
CROSS APPLY (
    SELECT ISNULL(SUM(OrderedQty * UnitPrice), 0)                        AS LinesSubtotal,
           ISNULL(SUM(OrderedQty * UnitPrice * TaxPct / 100.0), 0)       AS LinesTax
    FROM PROJ.TBL_PURCHASE_ORDER_LINE
    WHERE PoId = po.PoId AND IsActive = 1
) t
WHERE po.IsActive = 1
  AND po.TotalAmount IS NOT NULL
  AND ABS(po.TotalAmount - (t.LinesSubtotal
        - (t.LinesSubtotal * ISNULL(po.Discount,0) / 100.0)
        + t.LinesTax + ISNULL(po.TaxAmount,0))) > 0.01
ORDER BY po.PoId DESC;

/* ═══════════════════════════════════════════════════════════════════════════
   PART 3 - BACKFILL. Commented out on purpose. Read Part 2 first.

   Correcting a Draft or PendingApproval PO is uncontroversial. Correcting an
   APPROVED PO changes the value it was approved at - decide that deliberately,
   and widen the status list below only if you mean to.

   UPDATE po
   SET    po.TotalAmount = CAST(t.LinesSubtotal
                              - (t.LinesSubtotal * ISNULL(po.Discount,0) / 100.0)
                              + t.LinesTax
                              + ISNULL(po.TaxAmount,0) AS DECIMAL(18,2)),
          po.ModifiedBy   = 'SA-discount-fix',
          po.ModifiedDate = GETDATE()
   FROM   PROJ.TBL_PURCHASE_ORDER po
   CROSS APPLY (
       SELECT ISNULL(SUM(OrderedQty * UnitPrice), 0)                  AS LinesSubtotal,
              ISNULL(SUM(OrderedQty * UnitPrice * TaxPct / 100.0), 0) AS LinesTax
       FROM PROJ.TBL_PURCHASE_ORDER_LINE
       WHERE PoId = po.PoId AND IsActive = 1
   ) t
   WHERE  po.IsActive = 1
     AND  po.Status IN ('Draft', 'PendingApproval')
     AND  ABS(po.TotalAmount - (t.LinesSubtotal
            - (t.LinesSubtotal * ISNULL(po.Discount,0) / 100.0)
            + t.LinesTax + ISNULL(po.TaxAmount,0))) > 0.01;
   ═══════════════════════════════════════════════════════════════════════════ */
