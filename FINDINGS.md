# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 5. Code.js lines 2301–2900 (delerium, custom inventory, notes)

## Sessions

### 2026-06-18 — Sections audited: 1, 2, 3, 4

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

#### BUG · Code.js:2208 · `apiCreateNote` silently downgrades 4 of the 8 note categories
`PARTY_NOTES_CATEGORIES = ['General','Quest','NPC','Location']` lists only 4
categories, but the README and client UI define 8 (adds Loot, Theory, Rules,
Session Recap). Line 2293 validates with
`PARTY_NOTES_CATEGORIES.includes(payload.category) ? payload.category : 'General'`,
so a note created as Loot/Theory/Rules/Session Recap is silently stored as
**General**. The user sees their chosen category on the optimistic client card,
then it flips to General on the next sync/refresh — a confusing data-loss bug.
Fix: extend `PARTY_NOTES_CATEGORIES` to the full 8 internal category names.

#### RISK · Code.js:2238 · Party Notes server endpoints not gated to treasurer
`apiGetNotes`, `apiCreateNote` (and the update/archive paths below) call only
`requireAllowedUser_()`. The README states Party Notes is "treasurer-only for
beta, gated in setCommandMode and applyIdentity" — i.e. the gate is purely
client-side. Any allowed user can call these endpoints directly via
`google.script.run`. Combined with the open dev access gate (section 1) and
the DM-Josh backdoor (section 3), notes are effectively world-readable/writable.
If the beta gating is meant to be enforced, add `requireTreasurer_` server-side.

#### IDEA · Code.js:2286 · Party Notes v2 writes lack LockService
`apiCreateNote` (and the v2 update/archive handlers) append/edit the NOTES
sheet with no document lock, unlike the legacy campaign-note handlers
(`apiAddCampaignNote`/`apiUpdateCampaignNote`/`apiDeleteCampaignNote` at
2051–2171, which correctly `tryLock`/release in `finally`). Concurrent edits
to the same note could race (last-write-wins / lost update). Given optimistic
client saves sync in the background, two players editing near-simultaneously is
plausible. Recommend the same lock pattern used by the v1 handlers.

#### IDEA · Code.js:1950 · Two parallel notes systems coexist (likely dead v1 code)
Legacy "Campaign Notes" (`CAMPAIGN_NOTES_FEED` sheet, 5-col `NOTES_HEADERS`,
`apiGetCampaignNotes`/`apiAddCampaignNote`/`apiUpdateCampaignNote`/
`apiDeleteCampaignNote`, gated by `requireCampaignNotesOwner_`) appears fully
superseded by Party Notes v2 (`NOTES` sheet, 11-col `PARTY_NOTES_HEADERS`,
`apiGetNotes`/`apiCreateNote`/…). If the client no longer calls the v1
endpoints, removing them would cut ~220 lines and eliminate the schema
confusion noted in section 1. Verify against Index.html before deleting.
