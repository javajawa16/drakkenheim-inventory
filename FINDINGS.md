# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 12. Index.html lines 6001–7500 (inventory groups, description sheet, sell batch)

## Sessions

### 2026-06-18 (run 4) — Sections audited: 8, 9, 10, 11

#### BUG · Index.html:4060 · Background sync reload closes an open edit sheet mid-edit (input loss)
`loadInventory(force)` unconditionally calls `closeInventoryPanels(false)` at its
very top (4060). The collaborative-sync poll (`pollSync`, 4332) fires
`loadInventory(true)` every time *another* player makes any inventory write
(`res.inventory.by !== syncClientId`, 4338) — i.e. roughly every 20 s during a
live multi-player session. `closeInventoryPanels(false)` → `setInventoryEditorOpen(false)`
/ `setQuickEditorOpen(false)` (7168/7033) toggles the `#inventorySheet` /
`#quickEditSheet` mobile sheets closed. So if a user is editing an item — typing
a Notes field, changing Qty/Holder in the quick editor — and any other player
writes, the editor sheet is yanked shut and all un-submitted input is silently
discarded. The user is in the `editing` state and an external (remote) transition
forces them out with no warning and no way to recover what they typed.
Suggested fix: in the sync-triggered reload path, skip `closeInventoryPanels`
(and defer the re-render) when an editor sheet is open —
`if (!document.querySelector('#inventorySheet.active, #quickEditSheet.active')) closeInventoryPanels(false);`
— still refresh `inventoryRows` in memory so the data is current once the sheet closes.

#### BUG · Index.html:4561 · Party Notes v2 save/delete/pin failures roll back silently (no feedback)
`saveNoteForm` (4561) closes the form sheet *before* the server round-trip
(`closeNoteForm()` at 4582/4600), then on `withFailureHandler` / `!res.ok`
restores the backup and re-renders the list with **no** status message or alert —
for both the edit branch (4587/4591) and the create branch (4610/4616).
`deleteNoteFromForm` (4541) and `toggleNotePin` (4645) have the same pattern:
optimistic mutation, silent revert on failure. Net effect: a user edits/creates/
archives/pins a note, the form closes as if it succeeded, the change appears, then
(on server failure) the note silently reverts or vanishes with no explanation —
the classic "why did my edit disappear?" silent-error. Note `archiveNote` (4623,
the card-button path) *does* `alert()` on failure, so the inconsistency is internal.
Suggested fix: surface failures via `setMainStatus(...)` or an alert in every
failure/`!ok` branch of `saveNoteForm`, `deleteNoteFromForm`, and `toggleNotePin`,
matching `archiveNote`.

#### IDEA · Index.html:3441 · `confirmCombineInventoryItem` doesn't guard against double-tap
The Combine button (`onclick="confirmCombineInventoryItem()"`) sets
`combineStatus` to "Combining…" but never disables the button or sets an
in-flight flag, and the success handler closes the sheet via
`keepDuplicateInventoryItem()`. A fast double-tap fires `apiCombineInventoryItems`
twice with the same `sourceId`; the second call's server error lands in
`combineStatus` after the sheet has already closed, so the error is invisible.
Low impact (server rejects the second merge), but the closure correctly captures
`choice` via spread (3443), so the primary path is sound. Suggested fix: disable
the button / set a flag on first tap.

#### Note · Index.html:5063,5156 · Delerium receive/sell optimistic write + rollback is correct (positive baseline)
`receiveDelerium` and `sellDelerium` each snapshot `previousRows`/`previousLedger`,
prepend optimistic rows + a `_pending` ledger entry, and on both failure paths
restore the snapshots, strip the pending entry by `_pendingId`, re-run
`refreshDeleriumStateFromInventory_`, re-cache, and re-render. The mixed-state
guards (`hasForSale`/`hasReceiving`, 5068/5161) and the 0-gp inline confirm
(5171) are intact. Counter state machine (idle → for-sale / receiving → mixed-disabled)
exits cleanly via `updateDeleriumButtonStates` (5042). No rollback gaps found.

#### Note · Index.html:8–2037, 2040–3000 · Sections 8–9 (CSS / HTML / state decls) — clean
Section 8 (design tokens, component CSS) and the section-9 remainder (phone DPR
scaling, HTML structure for all sheets, module-level state declarations, cache
helpers) contain no write paths beyond the cache helpers, which correctly guard
`cacheInventoryRows` with `_inFlightWrites > 0` (2926). `_inFlightWrites` is bumped
only by the three heavy write paths (5530/5931/6591); delerium receive/sell and
note writes manage their own cache and rely on the `by === syncClientId` poll
skip, so no stale-cache divergence in practice. Execution traces and the static
markup verified — no findings.

### 2026-06-18 (run 3) — Sections audited: 4, 5, 6, 7

#### BUG · Code.js:3701 · `apiAdjustInventory` currency/delerium quick-adjust writes NO ledger entry
`apiAdjustInventory` (reached for currency via `apiAdjustCurrency` 3691, and for
delerium-crystal quick-edits directly) rewrites the inventory row's `Qty` but
never calls `appendResourceLedger_`. Every other gold/delerium mutation
(quick-add 2689, deplete 2820, receive 2961/2989, sell 3052/3105, split 3215+,
send 3327) records a `RESOURCE_LEDGER` row. So when a treasurer uses the +/−
stepper to adjust a Gold or Delerium row, the live total (summed from inventory
`Qty`) shifts but the ledger history shows nothing — the ledger silently
diverges from the actual balance, defeating the audit trail. Suggested fix:
when `quickType === 'currency'` or `'delerium crystal'`, append an `ADJUST`
ledger entry with `qty: delta` (and `subtype` = gold/size), mirroring
`apiDepleteResource`.

#### BUG · Code.js:1772 · `classifyQuickEdit_` over-broad currency regex (the flagged pitfall class)
`/\b(gold|gp|platinum|pp|silver|sp|copper|cp)\b/.test(name)` classifies any item
whose name contains one of those words as `editType: 'currency'`. This is the
same over-broad-currency pattern that already broke the inventory display
(fixed in `isGoldItem_`, which rejects platinum/silver/copper FIRST), but the
server-side classifier was never given the same treatment. Consequences:
`apiGetCurrencyQuickEdit` (3669) returns `editType: 'currency'` for a "Gold
Ring", "Silver Holy Symbol", "Copper Key", etc., so the item is offered the
currency +/− quick-edit instead of the normal edit form — and combined with the
ledger gap above, adjusting it mutates qty with no trail. Suggested fix: reject
`\b(platinum|pp|silver|sp|copper|cp)\b` before matching `\b(gold|gp)\b`, the
same precedence `isGoldItem_` uses in Index.html.

#### RISK · Code.js:2301,2340,2371,2393 · v2 notes handlers leak raw `e.message` to client
`apiGetNotes`, `apiCreateNote`, `apiUpdateNote`, and `apiArchiveNote` all
`return { ok: false, error: e.message }` directly, bypassing the
`publicValidationError_` / `publicApiError_` sanitizers that every other handler
in Code.js routes through. Internal errors (sheet schema messages, lock text,
stack-adjacent detail) reach the client verbatim. Low severity (notes are
gated to allowed users) but inconsistent with the established error-reporting
contract. Suggested fix: wrap the catch returns in `publicApiError_(name, e, {…})`.

#### IDEA · Code.js:2709 · `apiQuickAddInventory` optimistic ledger entry drops Notes + Character
The `ledgerEntry` returned to the client for a gold/delerium quick-add
sanitizes only `Timestamp…Item` — it omits `'Notes'` and `'Character'`, unlike
`apiDepleteResource` (2839), `apiReceiveResource` (2964), and every other
handler that returns a ledger entry. The optimistic row the client renders
right after a quick-add of gold/delerium therefore shows no note and no
attributed character until the next full sync. Suggested fix: add
`'Notes': ledgerEntry.notes` and `'Character': ledgerEntry.character`.

#### IDEA · Code.js:3579 · `apiCombineInventoryItems` silently discards a Value GP mismatch
Combine matches on Item + Category + Rarity but not on `Value GP`. The merged
row keeps the *target's* `Value GP` and recomputes `Total Value GP` from it, so
if the source row carried a different per-unit value (e.g. two "Trade Goods"
stacks priced differently) the source's value is lost with no warning. Likely
acceptable for fungible stacks; flagging so a future "combine" UX can confirm or
block mismatched-value merges.

#### Note · Code.js:3068–3373 · Sell / split / send handlers — locks + sanitize all correct (positive baseline)
`apiSellDelerium`, `apiSplitGold`, and `apiSendGoldToMember` each acquire
`getDocumentLock().tryLock(10000)`, release in `finally`, gate treasurer/DM
correctly (`requireTreasurer_`, `/^DM(\s|$)/i` payee block at 3303), and wrap
every returned `ledgerEntries.push` in `sanitizeResourceLedgerForClient_` with
both Notes and Character populated. No issues — recording as the section-6
baseline. (`apiUpdateLedgerNote` Timestamp-keying remains the previously
DEFERRED schema item, not re-counted here.)


### 2026-06-18 (run 2) — Sections audited: 13, 1, 2, 3

#### ~~RISK · Index.html:8137 · `resize` handler still unconditionally closes the description sheet / editor~~ FIXED
Added `_resizeLastHeight` tracker; `setInventoryEditorOpen(false)` and
`closeDescriptionSheet()` now only fire when `Math.abs(newHeight − lastHeight) > 150`.
Virtual-keyboard show/hide (≈ 260–300 px on iOS) still triggers close; minor
dock-bar / rotation jitter (< 100 px) does not. README Known TODO removed.

#### Note · Index.html:7787 · `startCustomItem` null-checks `selectedCardName`/`selectedCardMeta` (pitfall fixed)
The harness-flagged crash (setting `.textContent` on absent `selectedCardName`/
`selectedCardMeta`) is no longer present — lines 7804–7807 guard both with
`if (_cardName)` / `if (_cardMeta)` before assignment, and `customizeSelectedItem`
(7839–7842) does the same. `updateAddFlow()` is now reached on every path.
Recording as a verified-fixed baseline.

#### ~~IDEA · Index.html:8010 · Add-failure form restore is skipped when the user is still on the Add tab~~ FIXED
Removed the `if (commandMode !== 'add')` gate from the failure handler — form
fields (`qty`, `holder`, `notes`, `item`, etc.) and `selectedEquipment` snapshot
are now always restored on failure regardless of which tab the user is on.
`addStatus` error message also always renders; `updateAddFlow()` always fires.

#### Note · Index.html:7512 · `debouncedSearchEquipment` and `debouncedRenderInventory` share `searchTimer`
Both debouncers `clearTimeout(searchTimer)` on the same module-level timer
handle. They drive different tabs (Add search vs. Inventory filter) so in
practice only one is ever pending, but a rapid tab switch mid-debounce could let
one cancel the other's pending call. Harmless today; flagging in case a future
change runs both concurrently.

#### Note · Code.js:1–500 · Section 1 re-audit — no new issues
Re-verified the previously-applied fixes: `DEV_ALLOW_UNCONFIGURED_ACCESS: false`
(11), `continueCleanEquipmentLibrary` lock with `tryLock(5000)` and `finally
releaseLock()` (425–583), `CAMPAIGN_NOTES_HEADERS` 5-col schema named correctly
(135). Config blocks, header constants, menu, setup, and the import batcher are
all consistent. No new findings.

#### Note · Code.js:501–1100 · Section 2 re-audit — no new issues
Re-verified `apiSellInventoryBatch` lock (highest-row-first delete, `finally`
release on all paths incl. auth failure, 667–756), `categorizeItem_` fallback now
only fires on `text.includes('magic item')` (1039), and `apiGetCharacters` carries
no PII `Logger.log` calls on the success path (only the catch error at 804).
`detectMagicItem_` still returns `'Yes'` for any non-blank rarity (1052) — this is
a 5e-reasonable heuristic on import data (mundane items have blank rarity), not a
defect. No new findings.

#### ~~IDEA · Code.js:1565 · "Treasurer access required." is masked as "Request failed." for the client~~ FIXED
Added `Treasurer access required` to the `publicValidationError_` pass-through
regex alternation. Non-treasurer users who attempt split/sell-delerium now receive
the literal `'Treasurer access required.'` message instead of the generic
`'Request failed.'`.

#### Note · Code.js:1101–1700 · Section 3 re-audit — otherwise clean
`requireTreasurer_`/`getEmailForCharacter_` trust-on-client hint path (1415–1425)
is the documented identity model (USER_DEPLOYING limitation), not a new bug.
`ensureHeaderRow_` end-append behavior (1129–1140) remains a by-design,
header-name-keyed limitation. Validation helpers (`validateId_`, `validateMoney_`,
`validateQuantity_`) and the client sanitizers are consistent. No other findings.

#### ~~IDEA · Index.html:4283 · Dead `ondblclick` on inventory cards (unreachable on touch)~~ FIXED
`ondblclick="event.stopPropagation(); openInventoryDescriptionById(...)"` removed
from `.inventory-card` in `renderInventory`. Open-description is correctly wired
on `onclick` via `handleInventoryCardClickById`. README Known TODO removed.

#### Note · Index.html:8118 · `escapeJsString` minimal implementation — safe for current callers
`escapeJsString` escapes only `\` and `'`. All five call sites pass `noteId`
values, which are `Utilities.getUuid()` UUIDs (`[0-9a-f-]` only). No injection
risk in practice; noted in case a non-UUID value is ever passed here in future.

#### Note · Index.html:7501–end · Add-item flow XSS surface — all paths clean (positive baseline)
`renderEquipmentResults`, `renderStatBlock_`, `fillAddFormFromEquipment`, and
`addInventoryItem` all use `escapeHtml()` for every `innerHTML` context and
`.textContent` / `.value` for direct DOM assignment. No injection vectors found.

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
The optimistic identity sets `isTreasurer/isDM = /^DM(\s|$)/i.test(character)`
before the server round-trips. This is the client-side face of Code.js:1360
(now fixed — hardcoded bypass removed). Trust-on-client by design; no further
server-side action needed.

#### Note · Index.html:5930 · "Give to…" moves only the representative row (known TODO confirmed)
`giveItemToCharacter` updates the single `item['Inventory ID']`'s holder, even
when `descRemoveQty > 1` or the item is rolled up from several additions — the
other underlying rows keep their old holder. This matches the README's existing
"Give to… moves only the representative row" TODO. Unlike `confirmSellItem`
(5506) which FIFO-drains across all rollup rows, give has no multi-row
distribution. Recording as confirmation, not a new finding.

#### ~~RISK · Index.html:6301 · Ledger-note edit is keyed only on `Timestamp`~~ DEFERRED
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
