# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 9. Index.html lines 1501–3000 (CSS continued, early JS)

## Sessions

### 2026-06-18 — Sections audited: 1, 2, 3, 4, 5, 6, 7, 8

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

#### ~~IDEA · Code.js:1039 · `categorizeItem_` over-broadly labels any rarity item "Wondrous Item"~~ FIXED
`|| rarity` arm removed; fallback now only triggers on `text.includes('magic item')`.
Items with a rarity but no matching type fall through to `Tool / Gear`.

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

#### ~~IDEA · Code.js:1950 · Two parallel notes systems coexist (likely dead v1 code)~~ VERIFIED LIVE
Audit assumption was wrong. Index.html actively calls all five v1 endpoints
(`apiGetCampaignNotesAccess`, `apiGetCampaignNotes`, `apiAddCampaignNote`,
`apiUpdateCampaignNote`, `apiDeleteCampaignNote`) and has a full composer UI
at lines 2501–2513. Both systems serve different UI tabs; neither is removable.

#### ~~RISK · Code.js:2875 · `apiUpdateLedgerNote` has no LockService~~ FIXED
Added `LockService.getDocumentLock()` / `tryLock(10000)` / `finally releaseLock()`
matching the pattern used by every other write handler in the section.

#### IDEA · Code.js:2333 · `apiCreateNote` success-return reads `payload` unguarded
The success object dereferences `payload.title`/`payload.note`/
`payload.relatedItemId` directly, unlike the rest of the function which uses
`payload && payload.x`. If `payload` were ever undefined the build above
(line 2313) tolerates it, but the return object would throw a TypeError —
caught by the outer `catch`, so the client just sees a generic error instead
of the validation result. Harmless in practice (client always sends a
payload); flagging for consistency.

#### ~~IDEA · Code.js:3102 · `apiSellDelerium`/`apiSplitGold` return unsanitized ledger entries~~ FIXED
All five inline `ledgerEntries.push()` calls now wrapped with
`sanitizeResourceLedgerForClient_`. `SPLIT_REMAINDER` also had its missing
`Character` field added so that ledger row renders with an attributed character.

#### Note · Code.js:3293 · `apiSendGoldToMember` correctly blocks DM as recipient
Positive baseline: `apiSendGoldToMember` rejects any `/^DM(\s|$)/i` character
as a payee, and all six write handlers in this section (sell item, sell
delerium, split gold, send gold, update, delete) acquire and `finally`-release
a document lock on every path including auth failure. No lock issues found.

#### ~~IDEA · Code.js:3723 · `apiAdjustInventory` validates delerium `size` but never applies it~~ FIXED
When a valid `size` is provided, `rowObj['Item']` is now relabeled to
`Delerium <Size>` and `Size: <size>` is appended to the note, matching the
pattern used by `apiEditInventory`.

#### IDEA · Code.js:3927 · Dead/unused helpers and test functions remain in source
`findInventoryRowById_` (3927) returns only a row number and appears fully
superseded by `getInventoryRowObjectById_`, which every current caller uses.
`testAddInventoryDirect_` (3940) and `testGetInventoryDirect_` (3956) are
editor-run test harnesses left in the production file; `testAddInventoryDirect_`
would attempt a real `apiAddInventory` with `libraryItemId: 'TEST_ITEM'` (which
fails safely since that library item does not exist). Cleanup candidates — verify
`findInventoryRowById_` has no remaining callers, then remove.

#### ~~BUG · Index.html:1461 · `var(--card-bg)` used with no fallback — `--card-bg` is never defined~~ FIXED
Added `--card-bg: #212f4b` (same as `--panel-strong`) to the `:root` token block.
All three usages (`#diceTab`, `.notes-cat-select`, `.note-card`) now resolve.

#### ~~RISK · Index.html:1358 · Pervasive `calc(var(--phone-*) * N)` contradicts the project's own CSS note~~ FALSE POSITIVE
The `--phone-*` variables are set by JS (Index.html:3020–3030) to **concrete px
strings** (e.g. `"95px"`), not to further `var()` references. So
`calc(var(--phone-card-min-height) * 1.25)` resolves to `calc(95px * 1.25)` at
runtime — standard numeric CSS math that works fine in GAS WebView. The README
warning applies to CSS-only variable chains where the property itself contains a
`var()` reference; JS-set concrete values are safe.

#### ~~IDEA · Code.js:3927 · Dead/unused helpers and test functions remain in source~~ PARTIALLY FIXED
`findInventoryRowById_` is NOT dead — it is the implementation called by
`getInventoryRowObjectById_` at line 1752. Audit misread the dependency
direction. `testAddInventoryDirect_` and `testGetInventoryDirect_` were
confirmed dead and removed.
