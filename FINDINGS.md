# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 13. Index.html lines 7501–end (add item flow, custom item, form handling)

## Sessions

### 2026-06-18 — Sections audited: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

#### ~~RISK · Code.js:10 · Dev access gate still open~~ FIXED
`DEV_ALLOW_UNCONFIGURED_ACCESS` flipped to `false`. `requireAllowedUser_` now
uses `PLAYER_CHARACTER_MAP` as the effective allowed-users list with a
`'url-authenticated-user'` placeholder when email is unavailable.

#### ~~IDEA · Code.js:420 · `continueCleanEquipmentLibrary` has no LockService~~ FIXED
`LockService.getDocumentLock()` / `tryLock(5000)` / `finally releaseLock()`
added; concurrent runs now get a clear error instead of corrupting the cursor.

#### ~~IDEA · Code.js:134 · `NOTES_HEADERS` is a 5-column legacy schema~~ FIXED
Renamed to `CAMPAIGN_NOTES_HEADERS` throughout `Code.js` and `Reset.js`.

#### ~~RISK · Code.js:753 · Debug `Logger.log` lines dump character/PII rows~~ FIXED
All five debug `Logger.log` calls removed from `apiGetCharacters` success path.
The only remaining log at line 804 is the `catch` block error message (no PII).

#### ~~IDEA · Code.js:1039 · `categorizeItem_` over-broadly labels any rarity item "Wondrous Item"~~ FIXED
`|| rarity` arm removed; fallback now only triggers on `text.includes('magic item')`.
Items with a rarity but no matching type fall through to `Tool / Gear`.

#### Note · Code.js:655 · `apiSellInventoryBatch` LockService handled correctly
Verified the document lock is acquired with `tryLock(10000)` and released in a
`finally` block guarded by try/catch, including the auth-failure path. Rows are
processed highest-row-first so `deleteRow` shifts only already-processed rows.
No issue — recording as a positive baseline for the section-4 lock comparison.

#### ~~RISK · Code.js:1360 · Hardcoded "DM Josh" bypasses the CHARACTERS-sheet check~~ FIXED
Removed the `if (/^DM\s+Josh$/i.test(chosen)) return 'DM Josh';` short-circuit.
DM characters must now exist and be Active in the CHARACTERS sheet like all others.

#### Note · Code.js:1137 · `ensureHeaderRow_` appends missing headers at the end
Known limitation — by-design for append-only schema evolution. All reads are
header-name keyed so order divergence is harmless in practice. No fix needed.

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

#### ~~IDEA · Code.js:2333 · `apiCreateNote` success-return reads `payload` unguarded~~ FIXED
Return object now uses `String((payload && payload.x) || '')` consistently
throughout, matching the defensive pattern used in the row-builder above.

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

#### ~~IDEA · Index.html:2915 · Debug `console.log`/`console.warn` still in `loadCharacters`~~ FIXED
Three success-path logs removed (API response, not-ok warn, characterOptions dump).
Failure-path `console.error` retained. README Known TODO entry removed.

#### ~~IDEA · Index.html:3000 · Phone detection still ORs `(max-width: 699px)` with `(pointer: coarse)`~~ FIXED
`updatePhoneClass()` now uses `window.matchMedia('(pointer: coarse)')` only.
Width arm removed — it never fired in GAS WebView and incorrectly triggered
phone layout in narrow desktop browsers.

#### Note · Index.html:2924 · `getElementById('identitySheet')` deref is safe here
`loadCharacters`' success handler reads
`document.getElementById('identitySheet').classList` with no null guard, but
`#identitySheet` is a static element in the DOM (line 2677), so it always
resolves. Recording as checked — not the missing-null-check class of bug
called out in the harness pitfalls.

#### ~~RISK · Index.html:3077 · Inventory tap-to-open is wired on BOTH `pointerup` and `touchend`~~ FIXED
Replaced `tapHandled` boolean with `lastTapOpenedAt` timestamp (same pattern as
`suppressInventoryClickUntil`). Both handlers now guard with
`Date.now() - lastTapOpenedAt < 500` — race-condition-proof regardless of
event ordering since time only moves forward. `pointerdown` no longer resets
the guard.

#### ~~IDEA · Index.html:3638 · Dead `ondblclick` on campaign-note cards (unreachable on touch)~~ FIXED
`ondblclick` attribute removed from `.notes-note-card` in `renderCampaignNotes`.
Edit remains reachable via the Edit swipe-action button.

#### Note · Index.html:3723 · v1 campaign-note swipe-delete fires with no confirmation
`bindCampaignNoteGestures` calls `deleteCampaignNote(row.dataset.noteId)` the
instant a left-swipe passes `NOTE_ACTION_ACTIVATE` (380px), with no inline
confirm step. This matches the existing README TODO ("Swipe-delete has no undo
— consider inline confirmation"). Not a new finding; recording that the v1
notes list shares the same no-undo gesture as inventory.

#### ~~IDEA · Index.html:3036 · `isMobileLayout()` repeats the `window.innerWidth < 700` signal~~ FIXED
`isMobileLayout()` now returns `document.documentElement.classList.contains('is-phone')`
only, consistent with `updatePhoneClass` and the single `(pointer:coarse)` signal.

#### ~~BUG · Index.html:5460 · `openGiveItemSheet` double-escapes the item name into `textContent`~~ FIXED
Removed `escapeHtml()` wrapper — `textContent` assignment handles escaping
natively. Items with `'`, `&`, `<` etc. now display correctly in the Give-To title.

#### ~~IDEA · Index.html:4747 · Debug `console.log`/`console.warn` in the identity flow~~ FIXED
Removed three success-path logs from `loadFallbackCharacterIdentity`,
`showIdentitySheet`, and `confirmIdentity`. Failure-path handler retained.

#### Note · Index.html:4811 · `confirmIdentity` client-side DM self-grant — cross-ref Code.js:1360
The optimistic identity built on character selection sets
`isTreasurer/isDM = /^DM(\s|$)/i.test(character)`, so picking the "DM Josh"
card grants treasurer/DM locally before the server round-trips. This is the
client-side face of the already-recorded RISK at Code.js:1360 (hardcoded
"DM Josh" bypasses the CHARACTERS-sheet check). Consistent with the group's
trust-on-client model; recording the linkage, no new action beyond the
server-side fix already proposed.

#### Note · Index.html:5930 · "Give to…" moves only the representative row (known TODO confirmed)
`giveItemToCharacter` updates the single `item['Inventory ID']`'s holder, even
when `descRemoveQty > 1` or the item is rolled up from several additions — the
other underlying rows keep their old holder. This matches the README's existing
"Give to… moves only the representative row" TODO. Unlike `confirmSellItem`
(5506) which FIFO-drains across all rollup rows, give has no multi-row
distribution. Recording as confirmation, not a new finding.

#### RISK · Index.html:6301 · Ledger-note edit is keyed only on `Timestamp` — DEFERRED
Requires adding a stable `Entry ID` column to `RESOURCE_LEDGER_HEADERS` (schema
change), generating IDs in every `appendResourceLedger_` call, and threading the
ID through the client ledger cache and `apiUpdateLedgerNote`. Low urgency —
same-millisecond collisions only affect batch ops (split-gold, sell-delerium).
Deferred until a ledger schema revision is planned.

#### ~~IDEA · Index.html:6434 · `isAccessoryItem_` requires BOTH a wondrous/accessory category AND a name keyword~~ FIXED
`isAccessoryItem_` now returns true when the name matches the accessory word
list OR the category includes `wondrous`/`accessor`. Custom "Ring of X" items
with a free-form category now land in Accessories rather than Bonus Junk.

#### ~~IDEA · Index.html:6397 · Minor dead code in section 12~~ FIXED
Unused `const category` removed from `isDashboardResourceRow_`.
Dead `amountInput.dataset.lastPaidAmount` write removed from `payResource`.

#### Note · Index.html:6315 · Gold/currency classification correctly excludes non-gold (positive baseline)
`isGoldItem_` first rejects `\b(platinum|pp|silver|sp|copper|cp)\b` and only then
matches `\b(gold|gp)\b`, and `isDashboardResourceRow_` only pulls gold + delerium
out of the inventory groups — so "silver holy symbol" et al. stay visible and
land in Treasure/Bonus Junk rather than being miscounted as gold or filtered out.
This is the corrected behavior for the over-broad-currency-regex pitfall; no
issue in this section.
