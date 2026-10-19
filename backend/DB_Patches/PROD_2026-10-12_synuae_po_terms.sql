/* SYNERPUAE - replace the PO terms & conditions.
   Run on SYNERPUAE ONLY. Deletes every existing row in PROJ.TBL_PO_TERMS and inserts the 7 terms below.
   Nothing else references this table. */
SET XACT_ABORT ON;
BEGIN TRAN;

DELETE FROM PROJ.TBL_PO_TERMS;

INSERT INTO PROJ.TBL_PO_TERMS (TermText, SortOrder, IsActive) VALUES
(N'The PO number must be clearly mentioned on all invoices, delivery notes, and related correspondence.', 1, 1),
(N'The prices stated in the PO shall remain firm unless otherwise agreed in writing through a revision to the same PO.', 2, 1),
(N'The PO value is exclusive of VAT. VAT shall be charged in accordance with applicable UAE VAT laws, and the supplier shall provide a valid tax invoice wherever required.', 3, 1),
(N'The supplier shall submit a valid tax invoice, delivery note, and other relevant supporting documents along with the supply or service, as applicable.', 4, 1),
(N'All materials and services supplied must comply with the specifications, quantities, and quality standards stated in the PO. Synergy Infratech Power Systems FZE reserves the right to amend/cancel the PO if any discrepancies or non-compliance are identified.', 5, 1),
(N'For customs clearance-related matters, please contact Mr. Faizan Ramzan: +971 55 908 1384.', 6, 1),
(N'For delivery-related matters, please contact Mr. Saad : +971 50 187 7650.', 7, 1);

SELECT TermId, SortOrder, IsActive, TermText FROM PROJ.TBL_PO_TERMS ORDER BY SortOrder;

-- Expect 7 rows above. Then run COMMIT; if anything looks wrong run ROLLBACK; instead.
-- COMMIT;
-- ROLLBACK;
