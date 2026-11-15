-- 2026-11-13a: full supplier information for the Export CSV button on the Supplier list.
-- New procedure proj.sp_ExportSuppliers (read only). Takes a comma list of SupplierIds (the suppliers on the screen's
-- current filter) and returns one row per supplier with names instead of ids: country, currency, payment terms, category,
-- tax treatment, tax / VAT numbers, default address, primary contact, default bank, approval status.
-- Needs patches 2026-11-02a (GstTreatment) and 2026-11-02b (Approved*) on the database. Nothing existing is changed. Safe to run twice.
-- Run per database, one at a time. Run with sqlcmd -I (or SSMS).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'proj.sp_ExportSuppliers', N'P') IS NULL
    EXEC (N'CREATE PROCEDURE proj.sp_ExportSuppliers AS RETURN 0');
GO

ALTER PROCEDURE proj.sp_ExportSuppliers
    @SupplierIds NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        s.SupplierCode                          AS [Supplier Code],
        s.SupplierName                          AS [Supplier Name],
        s.SupplierShortName                     AS [Short Name],
        s.SupplierRef                           AS [Supplier Ref],
        s.SupplierType                          AS [Type],
        cat.CategoryName                        AS [Category],
        co.CountryName                          AS [Country],
        s.GstTreatment                          AS [Tax Treatment],
        s.TaxNumber                             AS [Tax Number],
        s.VatNumber                             AS [VAT Number],
        s.TradeLicenseNo                        AS [Trade License No],
        CONVERT(VARCHAR(10), s.TradeLicenseExpiry, 23) AS [Trade License Expiry],
        cu.ShortName                            AS [Currency],
        pt.TermName                             AS [Payment Terms],
        s.PaymentMode                           AS [Payment Mode],
        s.CreditDays                            AS [Credit Days],
        s.CreditLimit                           AS [Credit Limit],
        s.LeadTimeDays                          AS [Lead Time Days],
        s.Rating                                AS [Rating],
        s.Phone                                 AS [Phone],
        s.Mobile                                AS [Mobile],
        s.Email                                 AS [Email],
        s.Web                                   AS [Website],
        s.AccountManager                        AS [Account Manager],
        a.AddressType                           AS [Address Type],
        a.AddressLine1                          AS [Address Line 1],
        a.AddressLine2                          AS [Address Line 2],
        a.City                                  AS [City],
        a.State                                 AS [State],
        ac.CountryName                          AS [Address Country],
        a.PostalCode                            AS [Postal Code],
        a.POBox                                 AS [PO Box],
        ct.ContactName                          AS [Contact Name],
        ct.Designation                          AS [Contact Designation],
        ct.Phone                                AS [Contact Phone],
        ct.Mobile                               AS [Contact Mobile],
        ct.Email                                AS [Contact Email],
        b.BankName                              AS [Bank Name],
        b.AccountName                           AS [Bank Account Name],
        b.AccountNumber                         AS [Bank Account Number],
        b.IBAN                                  AS [IBAN],
        b.SwiftCode                             AS [Swift Code],
        b.BranchName                            AS [Bank Branch],
        bcu.ShortName                           AS [Bank Currency],
        CASE WHEN s.IsApprovedVendor = 1 THEN 'Yes' ELSE 'No' END AS [Approved],
        s.ApprovedBy                            AS [Approved By],
        CONVERT(VARCHAR(10), s.ApprovedDate, 23) AS [Approved Date],
        CASE WHEN s.IsOnHold = 1 THEN 'Yes' ELSE 'No' END AS [On Hold],
        CASE WHEN s.IsActive = 1 THEN 'Active' ELSE 'Inactive' END AS [Status],
        s.Remarks                               AS [Remarks]
    FROM proj.TBL_SUPPLIER s
    LEFT JOIN proj.TBL_SUPPLIER_CATEGORY cat ON cat.SupplierCategoryId = s.SupplierCategoryId
    LEFT JOIN proj.TBL_COUNTRY           co  ON co.CountryId           = s.CountryId
    LEFT JOIN proj.TBL_CURRENCY          cu  ON cu.CurrencyId          = s.CurrencyId
    LEFT JOIN proj.TBL_PAYMENT_TERMS     pt  ON pt.PaymentTermsId      = s.PaymentTermsId
    OUTER APPLY (SELECT TOP 1 * FROM proj.TBL_SUPPLIER_ADDRESS x
                 WHERE x.SupplierId = s.SupplierId AND x.IsActive = 1
                 ORDER BY x.IsDefault DESC, x.SupplierAddressId) a
    LEFT JOIN proj.TBL_COUNTRY           ac  ON ac.CountryId = a.CountryId
    OUTER APPLY (SELECT TOP 1 * FROM proj.TBL_SUPPLIER_CONTACT x
                 WHERE x.SupplierId = s.SupplierId AND x.IsActive = 1
                 ORDER BY x.IsPrimary DESC, x.SupplierContactId) ct
    OUTER APPLY (SELECT TOP 1 * FROM proj.TBL_SUPPLIER_BANK x
                 WHERE x.SupplierId = s.SupplierId AND x.IsActive = 1
                 ORDER BY x.IsDefault DESC, x.SupplierBankId) b
    LEFT JOIN proj.TBL_CURRENCY          bcu ON bcu.CurrencyId = b.CurrencyId
    WHERE s.SupplierId IN (SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT) FROM STRING_SPLIT(@SupplierIds, ','))
    ORDER BY s.SupplierName;
END
GO
