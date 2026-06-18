# Spreadsheet Notes

Spreadsheet access is confirmed from this workspace.

## Supplied Spreadsheet

- URL: `https://docs.google.com/spreadsheets/d/1DRs3BhuiAdojDBonns42b8FRPEBLNdjH2z8AUfW5U0o/edit?gid=1214060778#gid=1214060778`
- ID: `1DRs3BhuiAdojDBonns42b8FRPEBLNdjH2z8AUfW5U0o`
- Target gid: `1214060778`
- Workbook title: `Wieners of Drakkenheim`
- Created: `2026-05-25T16:51:50.168Z`
- Last modified when checked: `2026-05-26T03:56:51.553Z`
- Connector status:
  - Drive metadata/fetch: OK
  - Comments API: OK, no comments returned

## Observed Sheets / Tables

The connector text export shows these main table sections:

- Item library: columns include `Item ID`, `Name`, `Type Raw`, `Type Clean`, `Category`, `Rarity`, `Requires Attunement`, `Magic Item`, `Weight`, `Value Raw`, `Value GP`, `Source`, `Text / Description`, and `Search Text`.
- Inventory: columns include `Inventory ID`, `Item`, `Library Item ID`, `Category`, `Qty`, `Holder`, `Shared?`, `Identified?`, `Attunement?`, `Value GP`, `Total Value GP`, `Status`, `Faction Relevance`, `Risk`, `Notes`, and `Date Added`.
- Delerium ledger: columns include `Date`, `Delerium Type`, `Qty In`, `Qty Out`, `Net Qty`, `Holder`, `Reason`, `Faction / Buyer`, `Value Each GP`, `Total Value GP`, and `Notes`.
- Lookup values: inventory statuses, factions, and delerium types.
- Characters: columns include `Character`, `Player`, `Active?`, and `Notes`.

## Current Data Notes

- The item library contains at least 5,836 visible rows in the connector export.
- Inventory rows 500 and 501 currently contain `Cloak of Displacement [5.5e]` and `Test Inventory Item`.
- Spreadsheet comments returned no active threads.
- A local `.xlsx` snapshot was attempted for `data/exports/Wieners of Drakkenheim.xlsx`, but the sandbox blocked the download URL.

## Apps Script

- Script ID: `1yXM9QmYIftBAuMunK-ehpebnXqv4qzGHgsJt_-rznRrjPvRN0ANuJxxt`
- Local clasp config: `.clasp.json`
- Drive connector status: direct Drive fetch returns `403 Forbidden`; use `clasp` or Apps Script API access for source sync.

When access is available, capture:

- Workbook title and tab names.
- Target tab for gid `1214060778`.
- Important headers, formulas, protected ranges, validations, and named ranges.
- Any Apps Script entry points or triggers that read/write this sheet.
