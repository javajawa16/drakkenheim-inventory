# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 3. Code.js lines 1101–1700 (inventory write — add, edit, delete)

## Sessions

### 2026-06-18 — Sections audited: 1, 2 (in progress)

#### RISK · Code.js:10 · Dev access gate still open
`CONFIG.DEV_ALLOW_UNCONFIGURED_ACCESS: true` means `requireAllowedUser_()`
grants access to everyone whenever `ALLOWED_USERS` is empty (the current
state). This is the documented pre-production TODO, but until `ALLOWED_USERS`
is populated and this is flipped to `false`, every `api*` endpoint is open to
any visitor with the web-app URL. Highest-priority hardening item.

#### IDEA · Code.js:420 · `continueCleanEquipmentLibrary` has no LockService
The batch importer tracks its cursor in DocumentProperties
(`CLEAN_LIB_NEXT_READ_ROW`/`_WRITE_ROW`/`_COPIED_COUNT`). It is admin-menu
only, so contention is unlikely, but two concurrent runs would interleave
writes and corrupt the cursor. A document lock around the batch would make it
safe to re-run without checking whether a previous run is still going.

#### IDEA · Code.js:134 · `NOTES_HEADERS` is a 5-column legacy schema
`NOTES_HEADERS` (Note ID · Created At · Updated At · Updated By · Body) backs
the legacy `CAMPAIGN_NOTES_FEED` sheet, which differs from the 11-column
Party Notes schema in the README. This is not a bug by itself (the two are
separate sheets — see the section-4 note on the parallel notes systems), but
the naming invites confusion. Consider renaming to `CAMPAIGN_NOTES_HEADERS`.

#### RISK · Code.js:753 · Debug `Logger.log` lines dump character/PII rows
`apiGetCharacters` still has the debug logging called out in the README TODO,
now relocated to ~753–769 (plus 801, 804). Lines 768–769 `JSON.stringify`
entire header and first-data rows, which include the player **Email** column —
PII written to Stackdriver logs on every characters fetch. Remove these
before production (README TODO references the old ~657–682 location).

#### IDEA · Code.js:1039 · `categorizeItem_` over-broadly labels any rarity item "Wondrous Item"
After the type checks fall through, `if (text.includes('magic item') || rarity)
return 'Wondrous Item';` means *any* item that has a rarity value but didn't
match an earlier type (e.g. a flavored consumable or tool with a rarity) is
classified Wondrous Item. Low impact since weapons/armor/potions match earlier,
but worth tightening if misgrouped items show up in the wrong inventory group.

#### Note · Code.js:655 · `apiSellInventoryBatch` LockService handled correctly
Verified the document lock is acquired with `tryLock(10000)` and released in a
`finally` block guarded by try/catch, including the auth-failure path. Rows are
processed highest-row-first so `deleteRow` shifts only already-processed rows.
No issue — recording as a positive baseline for the section-4 lock comparison.
