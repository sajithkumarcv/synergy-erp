# Zoho Books PO interface (SYNERPINDIA only)

SQL only - no API, no frontend. Patches (run in order):
`backend/DB_Patches/2026-10-07_zoho_po_interface.sql`, then `2026-10-07b_zoho_po_interface_amend_hook.sql`
(commit bc22bab). Applied to dev SYNERP and to prod SYNERPINDIA on 2026-10-12. Zoho is the India company only.

## How it works
- On every PO approval `proj.sp_PostPOApproval` calls `interface.usp_QueueZohoPO`, which snapshots the PO into
  `interface.ZohoPO`: one row per PO line, Zoho's 49 import columns (names without spaces, e.g. `Reference#` =
  `ReferenceHash`) plus control columns.
- Revise PO re-approves, so it queues a new set (`Action = Update`). Amend PO Line / Amend Qty do not change
  Revision, so they call the queue with `@Reissue = 1` (also `Update`).
- Zoho reads `Status = 'Pending'` rows (all rows of a `PushId` are one PO) and writes back only: `Status`,
  `FirstReadDate`, `LastReadDate`, `ReadCount`, `ProcessedDate`, `ZohoReference`, `ErrorMessage`.
  Login `zoho_reader` (role `interface_zoho`) - SELECT on ZohoPO, column-level UPDATE on those columns only.
  Tested 2026-10-12: PO tables denied, `ItemPrice` update denied.
- Switch: `Interface.Zoho.PoEnabled` (TBL_APP_SETTINGS), 0 = off. New approvals are NOT queued until it is 1.
  The check is in the hooks themselves (`sp_PostPOApproval`, `sp_AmendPOLine`, `sp_AmendPOLineQty`), so with the
  switch off an approval/amend touches nothing in the interface schema. Hook errors (and a failure to log them)
  are swallowed - the approval/amend always goes through.

## Incident 2026-10-12 - approvals failed on prod
`proj` is owned by user PROJ (the app login), `interface` was created owned by dbo -> broken ownership chain ->
the app login got "INSERT permission denied on ZohoQueueLog" and the CATCH block itself threw, failing 6 approvals.
Fix: `ALTER AUTHORIZATION ON SCHEMA::interface TO PROJ` (now in patch 1; run on prod by hand 2026-10-12) plus the
switch-in-the-hook and nested-CATCH hardening. Lesson: test hooks as the APP user (`EXECUTE AS USER='PROJ'`), not sa.

## Mandatory (yellow) columns - checked at queue time
A PO that fails any check is stored as `Status = 'Error'` (all lines, never partial) with a plain `ErrorMessage`;
Zoho never sees it. Fix the cause, then `EXEC interface.usp_RetryZohoPO @PoId = <id>`.
Checks: delivery date, Reference# (PR), vendor, currency, supplier GSTIN, GSTIN state code in
`interface.GstStateCode`, terms, payment terms, project name, item description, unit mapped in `interface.ZohoUom`.

## Field rules
- Item Name = PO line `ItemDesc`. Project Name = `JobId - ProjectName`.
- Source of Supply = state from the first two digits of the supplier GSTIN (`TaxNumber`).
  Destination of Supply = setting `Interface.Zoho.DestinationOfSupply` (MH).
- GST Treatment = `business_gst` with a GSTIN, else `business_none`. Item Tax = `GST` + TaxPct (blank at 0).
- Expected Delivery Date = PO delivery date, or PO date + 7 days when the PO has none.
- Header Discount is a PERCENT in our system -> Zoho `Entity Discount Percent`, Discount Amount 0.
- Fixed values live in settings: Status `Issued`, Account `Cost of Goods Sold`, Discount Account `Purchase Discounts`.

## State on prod, 2026-10-12
367 approved POs backfilled: 13 Pending, rest Error. Open items:
1. **Units**: `interface.ZohoUom` has only EA/Each/Numbers -> `Nos`. Need Zoho's exact names for NOS, MTR, KG, SET,
   LTR, LOT, BOX, ROLL, BAG, DAY, Sq.Feet, HR, MTH, SQM, PCS, Pieces, Metre; then INSERT and re-queue all Error POs.
2. **GSTIN**: about 227 POs have a supplier with no TaxNumber/VatNumber (empty in the master). Either fill them in,
   or Zoho allows blank for unregistered vendors (then relax the rule + need a supplier state).
3. **IGST**: inter-state POs (Source <> Destination) probably need `IGST18`, not `GST18`. Not yet asked/built.
4. **PoEnabled** still 0. Turn on last, after Zoho confirms it can read the Pending rows.
5. Zoho must be able to reach the SQL Server (mixed mode is on); firewall to Zoho IPs only.
6. Terms & Conditions and Payment Terms Label wording to be adjusted to Zoho's setup (one expression each in
   `usp_QueueZohoPO`).
7. Not built: pushing a Cancel when a sent PO is cancelled/held.
