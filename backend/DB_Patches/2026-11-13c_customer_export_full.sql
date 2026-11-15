-- 2026-11-13c: full customer information for the Export CSV button on the Customer list.
-- New procedure proj.sp_ExportCustomers (read only). Takes a comma list of CustomerIds (the customers on the screen's
-- current filter) and returns one row per customer with names instead of ids: category, currency, payment terms,
-- tax / VAT numbers, default address (with country), primary contact, credit control status.
-- Needs 2026-11-13b (customer Country). Country = the customer's own country; Address Country = the default address country. Nothing existing is changed. Safe to run twice. Run per database, one at a time. Run with sqlcmd -I (or SSMS).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'proj.sp_ExportCustomers', N'P') IS NULL
    EXEC (N'CREATE PROCEDURE proj.sp_ExportCustomers AS RETURN 0');
GO

ALTER PROCEDURE proj.sp_ExportCustomers
    @CustomerIds NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        c.CustomerCode                          AS [Customer Code],
        c.CustomerName                          AS [Customer Name],
        c.CustomerShortName                     AS [Short Name],
        c.CustomerRef                           AS [Customer Ref],
        c.CustomerType                          AS [Type],
        cat.CategoryName                        AS [Category],
        cco.CountryName                         AS [Country],
        c.TaxNumber                             AS [Tax Number],
        c.VatNumber                             AS [VAT Number],
        cu.ShortName                            AS [Currency],
        pt.TermName                             AS [Payment Terms],
        c.CreditDays                            AS [Credit Days],
        c.CreditLimit                           AS [Credit Limit],
        c.SalesPerson                           AS [Sales Person],
        c.Phone                                 AS [Phone],
        c.Mobile                                AS [Mobile],
        c.Email                                 AS [Email],
        c.Web                                   AS [Website],
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
        c.CreditFlag                            AS [Credit Flag],
        c.CreditFlagNote                        AS [Credit Flag Note],
        CASE WHEN c.CreditHold = 1 THEN 'Yes' ELSE 'No' END AS [Credit Hold],
        c.CreditHoldNote                        AS [Credit Hold Note],
        CASE WHEN c.AutoHold = 1 THEN 'Yes' ELSE 'No' END AS [Auto Hold],
        CASE WHEN c.IsActive = 1 THEN 'Active' ELSE 'Inactive' END AS [Status],
        c.Remarks                               AS [Remarks]
    FROM proj.TBL_CUSTOMER c
    LEFT JOIN proj.TBL_CUSTOMER_CATEGORY cat ON cat.CustomerCategoryId = c.CustomerCategoryId
    LEFT JOIN proj.TBL_CURRENCY          cu  ON cu.CurrencyId          = c.CurrencyId
    LEFT JOIN proj.TBL_PAYMENT_TERMS     pt  ON pt.PaymentTermsId      = c.PaymentTermsId
    OUTER APPLY (SELECT TOP 1 * FROM proj.TBL_CUSTOMER_ADDRESS x
                 WHERE x.CustomerId = c.CustomerId AND x.IsActive = 1
                 ORDER BY x.IsDefault DESC, x.CustomerAddressId) a
    LEFT JOIN proj.TBL_COUNTRY           ac  ON ac.CountryId = a.CountryId
    LEFT JOIN proj.TBL_COUNTRY           cco ON cco.CountryId = c.CountryId
    OUTER APPLY (SELECT TOP 1 * FROM proj.TBL_CUSTOMER_CONTACT x
                 WHERE x.CustomerId = c.CustomerId AND x.IsActive = 1
                 ORDER BY x.IsPrimary DESC, x.CustomerContactId) ct
    WHERE c.CustomerId IN (SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT) FROM STRING_SPLIT(@CustomerIds, ','))
    ORDER BY c.CustomerName;
END
GO
