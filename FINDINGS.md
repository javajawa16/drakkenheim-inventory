# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 8. Index.html lines 1–1500 (HTML structure, CSS)

## Sessions

### 2026-06-18 — Sections audited: 1, 2, 3, 4, 5, 6, 7

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

#### RISK · Code.js:1360 · Hardcoded "DM Josh" bypasses the CHARACTERS-sheet check
`validateCharacterChoice_` short-circuits with
`if (/^DM\s+Josh$/i.test(chosen)) return 'DM Josh';` **before** validating
against the CHARACTERS sheet. Because `resolveIdentityForCharacter_` grants
`isDM`/`isTreasurer` to any name matching `/^DM/`, any client can call
`apiSetMyCharacter('DM Josh')` and self-elevate to DM/treasurer, gaining
split-gold and sell-delerium rights — no sheet entry or email mapping needed.
The whole identity model is trust-on-client by design for this group, but this
is a hardcoded backdoor independent of the sheet. Recommend removing the
short-circuit and requiring DM characters to exist (and be Active) in the
sheet like every other character.

#### IDEA · Code.js:1137 · `ensureHeaderRow_` appends missing headers at the end
When a header is missing from an existing sheet, it is appended at
`existing.length + 1` rather than inserted at its canonical position. If a
middle column were ever dropped, subsequent reads keyed by header name still
work, but column order would diverge from the constant and any positional
read would be off. Low risk given current usage; flagging for awareness.

#### ~~BUG · Code.js:2208 · `apiCreateNote` silently downgrades note categories~~ FIXED
`PARTY_NOTES_CATEGORIES` and `NOTE_CATEGORIES` (client) now both define the same
3 active categories: General, Quest, Location. Extra categories (NPC, Loot, Theory,
Rules, Session Recap) removed intentionally; all references cleaned from README/HANDOFF.

#### ~~RISK · Code.js:2238 · Party Notes server endpoints not gated to treasurer~~ N/A
Notes are no longer beta-gated; `requireAllowedUser_()` is the correct and intended gate.

#### ~~IDEA · Code.js:2286 · Party Notes v2 writes lack LockService~~ FIXED
`apiCreateNote`, `apiUpdateNote`, and `apiArchiveNote` now each acquire a
`LockService.getDocumentLock()` with `tryLock(10000)` / `finally releaseLock()`,
matching the v1 handler pattern.

#### IDEA · Code.js:1950 · Two parallel notes systems coexist (likely dead v1 code)
Legacy "Campaign Notes" (`CAMPAIGN_NOTES_FEED` sheet, 5-col `NOTES_HEADERS`,
`apiGetCampaignNotes`/`apiAddCampaignNote`/`apiUpdateCampaignNote`/
`apiDeleteCampaignNote`, gated by `requireCampaignNotesOwner_`) appears fully
superseded by Party Notes v2 (`NOTES` sheet, 11-col `PARTY_NOTES_HEADERS`,
`apiGetNotes`/`apiCreateNote`/…). If the client no longer calls the v1
endpoints, removing them would cut ~220 lines and eliminate the schema
confusion noted in section 1. Verify against Index.html before deleting.

#### RISK · Code.js:2875 · `apiUpdateLedgerNote` has no LockService
Every other write handler in this section (`apiCreateNote`, `apiUpdateNote`,
`apiArchiveNote`, `apiAddInventory`, `apiAddCustomInventory`,
`apiQuickAddInventory`, `apiDepleteResource`, `apiReceiveResource`) acquires
a document lock with `tryLock(10000)` and releases it in `finally`.
`apiUpdateLedgerNote` does a read-then-write (scan all ledger rows for a
matching timestamp, then `setValue` on the found row) with **no lock**. A
concurrent `appendResourceLedger_` or a second note edit can shift/insert
rows between the read and the write, so the note can land on the wrong row.
Low frequency (note edits are rare), but it is the one outlier in an
otherwise consistently-locked section. Wrap the read-modify-write in the
same lock/finally pattern.

#### IDEA · Code.js:2333 · `apiCreateNote` success-return reads `payload` unguarded
The success object dereferences `payload.title`/`payload.note`/
`payload.relatedItemId` directly, unlike the rest of the function which uses
`payload && payload.x`. If `payload` were ever undefined the build above
(line 2313) tolerates it, but the return object would throw a TypeError —
caught by the outer `catch`, so the client just sees a generic error instead
of the validation result. Harmless in practice (client always sends a
payload); flagging for consistency.

#### IDEA · Code.js:3102 · `apiSellDelerium`/`apiSplitGold` return unsanitized ledger entries
`apiReceiveResource` and `apiDepleteResource` build their returned
`ledgerEntries`/`ledgerEntry` through `sanitizeResourceLedgerForClient_`.
`apiSellDelerium` (3102, 3124) and `apiSplitGold` (3210, 3237, 3259) instead
push raw inline objects to the client. Today these inline objects contain
only display fields (no `userEmail`), so nothing leaks, but the inconsistency
means a future field added to the raw shape could bypass the sanitizer.
Relatedly, the `SPLIT_REMAINDER` entry (3259) omits the `Character` field that
the sibling `SPLIT_DEDUCT`/`SPLIT` entries include, so that one ledger row
renders without an attributed character on the client.

#### Note · Code.js:3293 · `apiSendGoldToMember` correctly blocks DM as recipient
Positive baseline: `apiSendGoldToMember` rejects any `/^DM(\s|$)/i` character
as a payee, and all six write handlers in this section (sell item, sell
delerium, split gold, send gold, update, delete) acquire and `finally`-release
a document lock on every path including auth failure. No lock issues found.

#### IDEA · Code.js:3723 · `apiAdjustInventory` validates delerium `size` but never applies it
For a `delerium crystal` quick-edit item, the handler normalizes `payload.size`
and throws if it is not in `DELERIUM_SIZE_VALUES`, but then never writes the
size anywhere — only `Qty` is adjusted on the existing row. The size check is a
no-op guard. Harmless if the client never expects a size change here, but if a
caller passes a new size hoping to re-label the row, it silently won't happen.

#### IDEA · Code.js:3927 · Dead/unused helpers and test functions remain in source
`findInventoryRowById_` (3927) returns only a row number and appears fully
superseded by `getInventoryRowObjectById_`, which every current caller uses.
`testAddInventoryDirect_` (3940) and `testGetInventoryDirect_` (3956) are
editor-run test harnesses left in the production file; `testAddInventoryDirect_`
would attempt a real `apiAddInventory` with `libraryItemId: 'TEST_ITEM'` (which
fails safely since that library item does not exist). Cleanup candidates — verify
`findInventoryRowById_` has no remaining callers, then remove.
