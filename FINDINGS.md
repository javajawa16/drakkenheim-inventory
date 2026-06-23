# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 5. Code.js lines 2301–2900 (delerium, custom inventory, notes)

## Sessions

### 2026-06-23 (run 56, consolidated) — Sections audited: 4

> **Consolidation note.** Section 4 ("sell, combine, gold ops", Code.js
> 1701–2300 + the gold/sell/combine/Party-Notes endpoints it feeds) was
> independently audited across **six** parallel branches that each forked their
> own copy of FINDINGS.md, so none of them saw the others' work:
> `audit/findings-section-4` (2026-06-22), `audit/findings-section-4-run56`,
> `claude/trusting-galileo-n73txz`, `-yp7n4x`, `-mik3fq`, `-pvfqw0`
> (all 2026-06-23). This entry merges all **fourteen distinct findings**
> (4 BUG · 6 RISK · 4 IDEA) into a single run. Each finding is tagged with its
> source branch(es); where branches reached different conclusions on the same
> code, or independently re-found the same issue, it is called out inline.
> Duplicates collapsed: `Code.js:1890` (found by section-4 + n73txz),
> the note `updatedAt` mis-sort (mik3fq 4279 + n73txz 4274), and the member-send
> gold flicker (yp7n4x 5829 + pvfqw0 5856).

#### BUG · Code.js:1890 · Auto-combine on add silently discards the user-entered Notes and Faction Relevance
_Source: audit/findings-section-4._
**Stories: Add library item / Add custom item (happy path, server auto-merge
step).** When `apiAddInventory` (2387) / `apiAddCustomInventory` (2497) find an
existing row matching Item/Category/Rarity/Holder/Value GP, they call
`mergeIntoExistingRow_` (1890), which does
`Object.assign({}, existing, { Qty, 'Total Value GP' })` — it keeps **every**
field of the existing row and writes back only the new quantity and total. The
just-submitted row's `Notes` and `Faction Relevance` are dropped on the floor. A
user who searches an item the party already holds, types a note like "from the
goblin cave," sets a holder, and taps Add gets the qty bumped but their note
**silently vanishes** — no warning, and the optimistic client row is reconciled
to the merged server row by Inventory ID so the note disappears on the next
render. The contrast is stark: the *explicit* `apiCombineInventoryItems`
deliberately concatenates notes (`${targetNotes}\n\n${sourceNotes}` at 3601) and
preserves faction (3590-3594); the *implicit* auto-combine does neither. Fix:
merge Notes/Faction the same way `apiCombineInventoryItems` does, or skip the
auto-merge when the incoming row carries a non-empty Notes/Faction that differs
from the existing row.

#### BUG · Index.html:5160 · "Undo Last Pay" on the Gold tab leaves the reversed entry visible in the ledger
_Source: audit/findings-section-4-run56._
Story "Undo last pay", final step. On the Gold tab the treasurer taps
`↩ Undo Last Pay` → `undoGoldPay()` (5160) calls `undoResourcePay('gold')` then
only `renderGoldSheetButtons()`. `undoResourcePay` (6483) removes the reversed
entry from `inventoryResourceLedger` and the rows from `inventoryRows`, then calls
**`renderInventory()`** — which repaints the hidden inventory list, not the gold
sheet. The Gold tab ledger list is produced by `renderGoldSheetBody()` →
`renderResourceLedger('gold',60)`, which is never called on the success path (only
the failure `rollback()` calls it). Result: after a successful undo the
now-deleted PAY / SEND_DEDUCT entry stays on screen in the Gold tab ledger until
some other action re-renders the body or the app reloads. Server and client state
are both already corrected — this is purely a missing re-render. Fix: add
`renderGoldSheetBody()` to `undoGoldPay()` (and to `undoResourcePay`'s success
handlers for parity). _(Branch `trusting-galileo` independently confirmed the
data layer is correct: the ledger IS reversed on both server and client — see its
Note at Code.js:3445 — which corroborates that this is render-only.)_

#### RISK · Code.js:3104 · apiSplitGold commits many rows with no atomicity or rollback
_Source: claude/trusting-galileo-yp7n4x._ ⚠️ **Branches disagree on this code:**
`audit/findings-section-4` examined the same endpoint and recorded a Note calling
the gold receive/split/pay path "clean" (correct lock discipline + optimistic
restore) — but it assessed *lock/auth/optimism*, not *multi-write atomicity*,
which is the actual gap below.
Split Evenly story, "confirm → apiSplitGold" step. The handler writes,
sequentially under one document lock, a pool-deduct inventory row + ledger entry,
then one credit row + ledger entry **per active member**, then an optional
remainder row + ledger entry — up to ~2(N+1) sheet writes (≈14 appends for a
6-player party). LockService gives mutual exclusion, not transactionality: if
execution dies partway (GAS 6-min/quota cutoff, transient SpreadsheetApp
failure), the pool is already debited `-amount` while some/all members are
un-credited — gold is silently destroyed or stranded. The client failure handler
in `splitGold` (Index.html:5927) only restores its own optimistic ledger entry,
so the next `loadInventory` surfaces the corrupted balance as fact. Compounded by
`appendResourceLedger_` (1962) swallowing its own write errors. Same
multi-write/no-rollback class also affects `apiSendGoldToMember` (3242, two rows)
and the delerium branch of `apiReceiveResource` (2879, N rows). Suggest building
the full 2D values array and writing it in a single batched append so a failure is
all-or-nothing, and surfacing `appendResourceLedger_` failures to the caller.

#### RISK · Code.js:3242 · Member-send by a non-treasurer has no client Undo path (and no server treasurer gate)
_Source: audit/findings-section-4._
**Stories: Pay gold (route to character) + Undo last pay.** `apiSendGoldToMember`
(3242) gates only on `requireAllowedUser_()` — any party member can move gold from
the party pool to another member's holder. But the client only records the undo
handle and renders the Undo button **inside `if (isTreasurer)`**
(`confirmPayWithReason` onSuccess, Index.html:5892-5899). So a non-treasurer who
pays a member (the pay-reason sheet lists every member to everyone) commits a pool
deduct + member credit with **no client-side reversal**: `lastResourceUndo['gold']`
is never set, the Undo button never appears, and there is no other in-app reverse
path. The only way back is a manual sheet edit. Either gate `apiSendGoldToMember`
to treasurer (if members shouldn't move pool gold) or render/store the undo handle
for all users, not just the treasurer.

#### RISK · Index.html:4862 · "Gold received" field silently dropped when tapping "Received" on the delerium sheet
_Source: audit/findings-section-4-run56._
Stories "Receive crystals" / "Sell crystals". For a treasurer
`renderDeleriumSheetActions()` renders a shared `deleriumSheetGold` ("Gold
received (gp)") input next to both the **Received** and **Sell** buttons.
`receiveDelerium()` (4862) reads only `deleriumSheetNote` — it never reads
`deleriumSheetGold`, and `apiReceiveResource`'s delerium branch (Code.js
2923–2952) has no goldAmount parameter at all. So a treasurer who types a gold
amount and then taps **Received** (intentionally, or by hitting the wrong of two
adjacent buttons) loses that value silently: no gold row, no gold ledger entry, no
warning, and the field isn't cleared. Only `sellDelerium()` consumes the field.
Fix: hide/disable the gold input unless the pending action is a sell, or surface a
warning when Received is tapped with a non-empty gold field.

#### IDEA · Index.html:4259 · Second note cannot be saved while the first create is still in flight
_Source: audit/findings-section-4._
**Story: Create note (friction).** `notesSaving` is a module-global set true at
the top of `saveNoteForm` and reset to `false` **only** inside the create/edit
async handlers. The create branch closes the form immediately but leaves
`notesSaving === true` for the whole round-trip. If the user taps **+** to start a
*different* note and hits Save before the first create's handler fires,
`if (notesSaving) return;` makes Save a **silent no-op** — no status text, no
disabled button. On a slow GAS round-trip this reads as a dead Save button. Fix:
scope the guard to the in-flight operation (or give the create path its own
optimistic-and-release model like pin/archive), and/or surface feedback when a
save is suppressed.

#### IDEA · Index.html:5829 · Member-send Pay flickers the live gold total down by the sent amount
_Source: claude/trusting-galileo-yp7n4x._
Pay gold story (route → character). A member-send moves gold from the pool to a
party member, so total party gold is unchanged. But `confirmPayWithReason`
optimistically inserts only the `-amount` pool-deduct inventory row (~5855) — it
does not insert the offsetting `+amount` credit row for the recipient (that only
arrives via `primeInventoryCacheAfterAdd(res.item)` on success). For the in-flight
window the header "Gold = XXX gp" therefore drops by the full sent amount and then
snaps back up when the server confirms, which reads as money briefly vanishing.
(Purchase pays correctly drop the total, since those really do reduce party gold.)
Suggest also inserting an optimistic credit row for the member-send branch so the
net optimistic delta is zero.

#### IDEA · Index.html:6414 · Dashboard inline Pay has no optimistic balance update (inconsistent with Gold tab)
_Source: audit/findings-section-4-run56._
Story "Pay gold". The Gold-tab pay (`confirmPayWithReason`, 5829) and Got-Paid
(`receivedGold`, 5165) both insert an optimistic inventory row + pending ledger
entry so the balance and ledger move instantly. The dashboard resource-breakout
inline Pay (`payResource`, 6414) does neither — it only flips the button to
"Recording…" and waits for the round-trip before `primeInventoryCacheAfterAdd`. On
a slow GAS call the gold/delerium total sits stale for the whole round-trip, which
reads as "did my tap register?" friction and is inconsistent with the adjacent
Gold/Delerium sheets. Suggest mirroring the optimistic pattern (insert a
negative-qty row keyed by a temp id, remove on resolve).

#### BUG · Index.html:4279 · Edited note's optimistic `updatedAt` (ISO) mis-sorts vs server (space) format
_Source: trusting-galileo-mik3fq (independently re-found by n73txz at 4274)._
Edit-note story, "Save → optimistic reorder" step. The optimistic edit sets
`updatedAt: now` where `now = new Date().toISOString()` → `2026-06-23T14:32:01.123Z`
(a 'T' at index 10). Server-confirmed notes carry `Utilities.formatDate(...,
'yyyy-MM-dd HH:mm:ss')` → `2026-06-23 14:32:01` (a space at index 10).
`renderNotesList` sorts with `(b.updatedAt||'').localeCompare(a.updatedAt||'')`;
for two same-date notes the tiebreak is index-10, where `'T'` (84) > `' '` (32). So
a just-edited note sorts *above every same-day server-format note regardless of
actual time-of-day*. Worse, the edit success handler (4284) **never overwrites the
local `updatedAt` with the server value** (unlike create, which swaps in
`res.note`), so the mis-sort persists until the next full `loadNotes`. Fix: store
the optimistic `updatedAt` in the same `yyyy-MM-dd HH:mm:ss` space format the
server uses (or have `apiUpdateNote` echo the new `Updated At` and swap it in on
success).

#### BUG · Index.html:4317 · Create-note failure while navigated away from Notes tab silently drops the note content
_Source: trusting-galileo-mik3fq._ ⚠️ **This is a tradeoff introduced by the
earlier "failed note-create pops the form over an unrelated tab" fix (run 50).**
On a failed `apiCreateNote`, `restoreNoteForm_()` removes the optimistic temp row,
then bails with `if (commandMode !== 'notes') return false;` — so if the user
switched to another tab during the round-trip, the form is **not** re-opened and
`savedContent` is discarded; only a `setMainStatus` toast is shown. The optimistic
card is already gone, so the user's typed title/body/tags are lost with no
recovery path. This trades the run-50 bug (sheet popping over the wrong tab) for a
content-loss path, and contradicts the README guarantee "Failed create re-opens
the form pre-filled (no content loss)" (the guarantee now only holds while still
on the Notes tab). Fix: when `commandMode !== 'notes'`, stash `savedContent` in a
module var (e.g. `pendingFailedNote`) and re-hydrate the form next time the Notes
tab opens, or surface a "tap to recover" action in the toast.

#### RISK · Index.html:4276 · Pin and Edit on the same note use disjoint in-flight guards → conflicting `apiUpdateNote` writes
_Source: trusting-galileo-mik3fq._ Pin/Archive gate on the `_notesActionInFlight`
Set (per-noteId); Create/Edit gate on the `notesSaving` boolean +
`_inFlightNoteWrites`. With no shared per-note guard, a user can tap **Pin**
(optimistic flip + in-flight `apiUpdateNote {Pinned}`) and, before it settles,
open the edit form (whose Pinned checkbox still reflects the *pre-pin* state) and
Save — issuing a second `apiUpdateNote` with the full patch including the stale
`Pinned`. The two writes race (last-write-wins) and both mutate `notesData[idx]`,
so the final pinned state can disagree with the server until a reload. Low
frequency (same-note pin+edit within one round-trip) but a genuine lost-update.
Fix: add the noteId to `_notesActionInFlight` for edit saves too, or block opening
the edit form while `_notesActionInFlight.has(noteId)`.

#### RISK · Index.html:4594 · Gold sheet amount/note persist across close→reopen
_Source: trusting-galileo-pvfqw0._ `goldSheetAmount` (HTML 2681) and
`goldSheetNote` are **static** inputs outside `goldSheetBody`, so
`renderGoldSheetBody()` never rebuilds/clears them. `openGoldSheet` (4594) clears
neither, and `closeGoldSheet` clears only `goldSheetStatus`. Every successful
submit clears the fields and every failure restores them — but the
dismiss-without-submit path (user types an amount, then taps Done/backdrop) leaves
the value sitting in the field. On the next `openGoldSheet` the stale amount is
pre-filled, and a hurried tap on **Got Paid / Pay / Split Evenly** (all read
`goldSheetAmount` fresh) fires a real transaction for the leftover amount. Affects
Receive gold, Pay gold, Split gold. Fix: clear both inputs (and reset
`amountInput.readOnly`) in `openGoldSheet`, or in `closeGoldSheet`.

#### RISK · Index.html:7214 · Optimistic sell/remove persists unconfirmed state to cache
_Source: trusting-galileo-pvfqw0._ `_confirmDescActionSell_` (7214) and
`_confirmDescActionRemove_` (7283) call `cacheInventoryRows(...)` immediately after
the optimistic mutation but **before** `gasCall` runs — so `_inFlightWrites` is
still 0 and the guard at `cacheInventoryRows` (`if (_inFlightWrites>0) return`)
does not fire. The post-sell (reduced) inventory is written to localStorage before
the server confirms. The add flow deliberately avoids exactly this (explicit
comment at 8449: "Don't cache here — `_inFlightWrites` is still 0…"). If the iOS
GAS webview is backgrounded/killed mid-round-trip, the cache holds a sell/remove
that may have failed. Self-corrects on the next full `loadInventory`, so severity
is low, but it is inconsistent with the add path. Fix: drop the pre-call cache
writes at 7214/7283 (the onSuccess/onFail handlers already re-cache once
`_inFlightWrites` has cycled), or move them after `gasCall`.

#### IDEA · Index.html:4382 · Inconsistent failure-feedback channel across note actions
_Source: trusting-galileo-mik3fq._ `archiveNote` reports failure via blocking
`alert()`, while `saveNoteForm`/`toggleNotePin`/`deleteNoteFromForm` use the
non-blocking `setMainStatus` toast. Same family of optimistic note writes, three
different feedback surfaces — inconsistent, and the `alert()` is jarring on mobile.
(Overlaps the run-50 IDEA at 4261 about off-screen `#mainStatus` feedback on the
notes tab.) Suggest routing all note-write failures through one channel — ideally
a dedicated notes-tab status line — for a uniform, non-blocking experience.


### 2026-06-20 (run 55) — Sections audited: 3

Section 3 = Code.js lines 1101–1700 (inventory write — add, edit, delete). The
physical 1101–1700 range is the helper/validation/identity layer that every
inventory write consumes: spreadsheet/sheet helpers (`getOrCreateSheet_`,
`ensureSheetSize_`, `ensureHeaderRow_`), row mappers (`equipmentRowToClientItem_`,
`inventoryRowToObject_`), ID/hash helpers (`makeInventoryId_`,
`makeStableItemId_`), identity (`resolveIdentityForCharacter_` 1274,
`getUserProfileForKey_` 1299, `saveUserProfile_` 1323, `validateCharacterChoice_`
1368, `getCharacterForEmail_`/`getEmailForCharacter_` 1393/1441,
`requireTreasurer_` 1426, `requireAllowedUser_` 1486, `requireAdminUser_` 1518),
public-error mappers (`publicApiError_` 1536, `publicValidationError_` 1548) and
the validators (`validateId_` 1561, `validateText_` 1571, `validateQuantity_`
1581, `validateMoney_` 1599, `normalizeOptionalMoney_` 1611), plus the
client-sanitizers (`sanitizeInventoryForClient_` 1654) and ledger helpers
(`getResourceLedgerForClient_` 1686). Traced out to the write endpoints that
consume them — `apiAddInventory` (2221), `apiAddCustomInventory` (2337),
`apiQuickAddInventory` (2444), `apiUpdateInventory` (3220), `apiDeleteInventory`
(3311), `apiCombineInventoryItems` (3422), `apiAdjustInventory` (3597) and the
merge/find helpers `findMatchingInventoryRow_` (1754), `mergeIntoExistingRow_`
(1784), `getInventoryRowObjectById_` (1736), `writeInventoryRow_` (1749),
`deleteResourceLedgerRowsForInventory_` (1883) — and the client callers in
Index.html: add flow `addInventoryItem` (8085–8219), optimistic/cache helpers
(`cacheInventoryRows` 2920, `primeInventoryCacheAfterAdd` 2931,
`findDuplicateInventoryCandidate` 3337, `showCombineChoice`/`confirmCombineInventoryItem`
3346–3401), edit `saveInventoryEdits` (7372), swipe/stepper delete
`deleteSelectedInventory` (7464–7560), `loadInventory` (3588) and `pollSync` (3868).

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every write path):

- **Add library item / Add custom item / Quick-add** — happy path is optimistic:
  a temp `_opt_<ts>` row is prepended, form cleared, `_inFlightWrites++`, server
  call. Server validates (`validateId_`/`validateQuantity_`/`validateMoney_`),
  resolves the library item, and either appends or auto-merges via
  `findMatchingInventoryRow_` (matches on Item/Category/Rarity/Holder/Value GP).
  Success removes the temp row and reconciles by **Inventory ID** through
  `primeInventoryCacheAfterAdd` (updates the pre-existing row if present, else
  prepends) — verified this does not double-count on auto-combine and works even
  when the client never had the merged server row. Failure (`res.ok===false` or
  `withFailureHandler`) removes the temp row, restores every form field from
  `payloadSnapshot` + re-selects `selectedSnapshot` (incl. scroll-mode + size),
  decrements the flag, and re-opens the add flow — clean retry, no data loss.
  Navigate-away during the round-trip: see IDEA below (combine sheet can surface
  over an unrelated tab). No stuck in-flight flag (google.script.run always fires
  exactly one handler; inc/dec balanced).

- **Combine duplicate** — after a successful add, `findDuplicateInventoryCandidate`
  (rollup key = Item|Category|Rarity, holder/value excluded) finds a sibling row;
  the combine sheet only opens when holder OR value differs (the equal-on-both
  case was already auto-merged server-side, so the gate is consistent).
  `apiCombineInventoryItems` re-validates both IDs, requires matching
  Item/Category/Rarity, sums qty, deletes source (descending-row-safe via
  `adjustedTargetRow`), and merges holder→'Multiple'/faction/notes. Client
  reconciles by ID (filter source, map target) so it survives an intervening
  foreign reload. Double-tap on Confirm guarded by nulling `pendingCombineChoice`.
  Failure restores `pendingCombineChoice` and leaves the sheet open for retry.

- **Edit inventory item** — non-optimistic: button disabled, "Saving…",
  `apiUpdateInventory` patches only provided fields (qty floored at 1 by
  `validateQuantity_`), then `updateInventoryRowLocally` + cache + render + close.
  Failure re-enables the button and keeps the form open. Navigate-away is safe
  (close acts on a now-hidden sheet). Clean.

- **Delete inventory item** — optimistic with `previousRows` rollback. qty>1
  full-delete is gated behind an inline "Confirm delete all" tap; the stepper
  path uses `apiAdjustInventory(delta:-1)`. Both restore `previousRows` on any
  failure and `bustInventoryCache()` on success (forces a clean server refetch).
  See RISK on the unguarded confirm button.

- **Cross-cutting: collaborative sync interference / tab-switch / iOS** — verified
  `cacheInventoryRows` no-ops while `_inFlightWrites>0`, `loadInventory`'s handler
  bails on `_inFlightWrites>0`, and `pollSync` defers a foreign reload via
  `pendingForeignReload`. One real gap found — see BUG below.

#### BUG · Index.html:3643 · Foreign inventory change silently dropped when a local write starts mid-reload
Collaborative-sync-interference story. `pollSync` only sets
`pendingForeignReload` when it detects a foreign write **while** `_inFlightWrites>0`
(line 3873). In the race where the poll fires with `_inFlightWrites===0`, it takes
the else branch: it commits `syncState.inventory = res.inventory` (3876) and
dispatches `loadInventory(true)`. If the user then starts a write (e.g. taps Add)
during that `apiGetInventory` round-trip, the load's success handler hits
`if (_inFlightWrites > 0) { markInventoryReady(); return; }` (3643) and **bails
without applying the foreign rows** — but `syncState.inventory.ts` was already
advanced. When the local write completes it bumps the sync ts to its own
(by===me) value, so the next poll sees `res.ts === syncState.ts`-mismatch resolve
to the local writer and never re-triggers a reload. Net effect: the other
player's concurrent change is lost from this client until some *future* unrelated
write bumps sync again. Self-heals eventually but can show a stale party
inventory for an arbitrarily long time during active play.
Fix: when `loadInventory`'s handler bails on `_inFlightWrites>0`, set
`pendingForeignReload = true` (and don't pre-commit `syncState` until the load
actually applies), so the deferred reload fires once the write settles. The same
pattern applies to `loadNotes`/`pendingForeignNoteReload`.

#### RISK · Index.html:7479 · Double-tap on inline "Confirm delete all" shows a spurious "Delete failed."
Delete-inventory story, qty>1 path. The inline `Confirm delete all` button
created at 7487 is never disabled and is only torn down on the next
`renderInventory()`. A fast double-tap re-enters `deleteSelectedInventory`: the
first tap has already optimistically filtered the row out of `inventoryRows`, so
on the second tap `existingRow` is undefined, the qty>1 confirm gate is skipped,
and a second `apiDeleteInventory(inventoryId)` is dispatched. The server returns
`Inventory item not found.` (row already gone), the handler restores
`previousRows` and surfaces `Delete failed.` even though the delete succeeded.
Narrow window (the confirm button is removed on the first render) but reachable.
Fix: disable/remove the confirm button on first tap, or guard
`deleteSelectedInventory` with a per-id in-flight set like the notes
`_notesActionInFlight`.

#### Note · Code.js:1754 · Add/auto-combine execution-trace is sound — no double-count
`apiAddInventory`/`apiAddCustomInventory` auto-combine via
`findMatchingInventoryRow_` (full Item/Category/Rarity/Holder/Value GP match) and
return the merged existing row by its real Inventory ID. Client-side
`primeInventoryCacheAfterAdd` reconciles strictly by Inventory ID, so the
optimistic temp row is removed and the merged qty lands on exactly one row
whether or not the client previously held the original — traced both branches,
no duplicate display and no qty double-count. `validateQuantity_`/`validateMoney_`
guards on every quantity/value boundary; locks released in `finally` on all
paths.

#### Note · Code.js:3311 · Swipe-delete of a quick-added currency/delerium row leaves its ledger entry (matches documented limitation)
`apiDeleteInventory` only reverses RESOURCE_LEDGER rows when
`payload.reverseLedgerEntry` is set (used by `apiUndoMemberSend` and the
member-send delete). Normal swipe-delete of a delerium/currency row removes the
inventory row but not its RECEIVE/ADD ledger entry. Because gold/delerium totals
are inventory-derived (Index.html:5485, `isGoldItem_` sum of Qty), the headline
total stays correct — only the ledger *history* keeps a phantom entry. Same class
as the documented "Undo Last Pay does not reverse RESOURCE_LEDGER" TODO; recorded
for completeness, not a new behavioral total-desync.

#### IDEA · Index.html:8168 · Combine-suggestion sheet can pop over an unrelated tab after navigate-away
Add-then-combine story, navigate-away case. If the user taps Add and switches to
the Gold/Notes tab before the round-trip returns, the success handler still runs
`findDuplicateInventoryCandidate` → `showCombineChoice`, which adds `.active` to
`#combineSheet` unconditionally — a combine modal about an inventory item appears
over whatever tab the user is now on. Recoverable (tap "keep"), but jarring and
inconsistent with the otherwise tab-aware handlers (the failure branch already
guards `renderInventory` with `commandMode === 'inventory'`). Suggest gating the
`showCombineChoice` call on `commandMode === 'inventory'`/`'add'`, or queuing it
until the user returns to inventory.

### 2026-06-20 (run 54) — Sections audited: 2

Section 2 = Code.js lines 501–1100 (auth, character, inventory read). In-range
content: tail of `continueCleanEquipmentLibrary`, then the WEB APP API block —
`apiSearchEquipment` (587), `apiGetEquipmentIndex` (624), `apiGetEquipmentItem`
(647), `apiSellInventoryBatch` (663, the one user-facing write path physically
in range), `apiGetCharacters` (754), `apiGetInventorySummary` (805),
`apiGetMyCharacter` (822), `apiSetMyCharacter` (851), `apiForgetMyCharacter`
(860), `apiGetItemDetails` (870), `apiGetCategories` (874), `apiGetQuickAddItems`
(883), `apiLogUse` (901), `createEquipmentCsvDownload` (925) and the
classification/salvage helpers (957–1096). Read out to identity helpers
(`resolveIdentityForCharacter_` 1274, `resolveIdentityForEmail_` 1268,
`getUserProfileForKey_` 1299, `saveUserProfile_` 1323, `getCharacterForEmail_`
1393, `requireAllowedUser_` 1486, `requireTreasurer_` 1426), `apiGetInventory`
(1978), `bumpSync_` (2016), and client-side `applyIdentity`/`loadMyIdentity`/
`loadFallbackCharacterIdentity`/`showIdentitySheet`/`confirmIdentity`
(Index.html 4307–4440), `loadCharacters` (2908), `loadInventory` (3588),
equipment index/search (7600–7700), and the description-sheet Remove/Sell
callers of `apiSellInventoryBatch` (6630–6696).

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on the in-range write path):

- **Identity / first open (cross-cutting, every story)** — boot fires
  `loadCharacters()` + `loadMyIdentity()` in parallel; `apiGetMyCharacter`
  resolves via temp-key profile → email → client hint; first-timers get
  `character:null` → `showIdentitySheet()`. Happy path and the slow-characters
  case self-heal (`loadCharacters` re-calls `showIdentitySheet` when the sheet
  is active). See BUG below for the failure/empty case.
- **Set character (`confirmIdentity` → `apiSetMyCharacter`)** — double-tap
  guarded by `identityChoiceSaving`; optimistic `applyIdentity` + localStorage
  write; success re-applies canonical identity. Navigate-away safe (closure
  captures `character`, app already usable). Failure path is self-healing on
  reload via localStorage hint but shows a scary error — see IDEA.
- **Inventory read (`loadInventory` → `apiGetInventory`)** — in-memory →
  localStorage → server; `_inFlightWrites > 0` guard in the success handler
  drops poll-forced fetches mid-write; signature compare avoids scroll-reset
  re-render. Clean.
- **Add library item: search** — client loads full index once via
  `apiGetEquipmentIndex` and filters client-side; `apiSearchEquipment` is not
  on the live path. Index load has cached-fallback on failure. Clean.
- **Sell item / Remove item (description sheet → `apiSellInventoryBatch`)** —
  optimistic drain with `previousRows` snapshot, `_inFlightWrites` bump, rollback
  on both `!ok` and failure handlers, `loadInventory(true)` on success. Clean
  client-side; server-side partial-failure exposure noted as RISK below.

#### BUG · Index.html:2915 · First-open identity sheet stuck on "Loading characters…" when apiGetCharacters fails or returns empty

Story: **Identity / first open** (cross-cutting — blocks every other story for a
new user). Boot runs `loadCharacters()` (2908) and `loadMyIdentity()` (2942) in
parallel. For a first-time user with no cached identity, `apiGetMyCharacter`
returns `character:null` and `loadFallbackCharacterIdentity` calls
`showIdentitySheet()` (4357). If `characterOptions` is still empty at that moment,
the sheet body renders the placeholder `"Loading characters…"` (4377).

Recovery depends entirely on `loadCharacters`' **success** handler re-calling
`showIdentitySheet()` (2914). But:
1. On `apiGetCharacters` **failure** the handler only `console.error`s (2915–2916)
   — it never updates the sheet. The user is stranded on "Loading characters…"
   with no cards, no error, and no retry. They cannot pick a character, so they
   cannot enter the app at all (only a manual page reload escapes, and only if
   the retry succeeds).
2. On a **successful-but-empty** response (`rows: []` — CHARACTERS sheet missing,
   all inactive, or header mismatch) `showIdentitySheet` re-runs but
   `chars.length === 0` so it re-renders the same "Loading characters…"
   placeholder permanently — a success that looks identical to a hang.

Fix: give `showIdentitySheet` a terminal empty/error state with a Retry button
when `chars.length === 0`, and have `loadCharacters`' failure handler re-render
the identity sheet (if active) into that error state instead of only logging.

#### RISK · Code.js:703 · apiSellInventoryBatch partial failure mutates the sheet but reports total failure → silent data loss on next sync

Stories: **Sell item / Remove item** (description sheet) and **Sell Items batch**.
The write loop (703–714) deletes/updates resolved rows one at a time, then appends
the gold row (733) and ledger entry (734) and finally audits/bumps sync. There is
no transaction and no rollback: if any step after the first row mutation throws
(e.g. `sheet.appendRow` for the gold credit, or a `deleteRow` hitting a protected/
frozen row mid-loop), the `catch` returns `{ok:false}`. The client treats that as
a clean failure and restores its optimistic `inventoryRows` to `previousRows`
(Index.html 6672/6684), so the UI shows the items still present — but the server
has already removed some of them. The discrepancy stays invisible until the next
`loadInventory`/poll, at which point rows vanish with no explanation, and in the
gold-append-throws case no gold was ever credited for the rows that were deleted.

Note this compounds with the documented `appendResourceLedger_` error-swallowing
TODO: the ledger won't throw, but the gold-row `appendRow` and the per-row
`deleteRow` calls can. Suggested mitigation: compute all deletions/updates, append
the gold row first (so a credit failure aborts before any inventory is destroyed),
or return a partial-success payload listing which `inventoryId`s were actually
processed so the client can reconcile instead of blanket-rolling-back.

#### IDEA · Index.html:4435 · confirmIdentity failure shows an alarming error for an operation that actually persisted locally

Story: **Set character**. On `apiSetMyCharacter` failure (4435–4438) the optimistic
identity has already been applied and `drakkenheim_character` written to
localStorage, so the user is correctly logged in and will resolve via the client
hint on every future load — the only thing lost is the server-side User Profiles
row (Last Seen tracking). Yet `setMainStatus` flashes
`"Could not remember character: …"`, implying the choice didn't take. Friction:
the message contradicts the working state. Suggest downgrading to a silent retry
or a softer "Saved on this device; couldn't sync to the server" note, since
identity is functionally intact.

#### Note · Code.js:1486 · Auth gate + identity-resolution chain traced clean

`requireAllowedUser_` correctly handles the `USER_DEPLOYING` empty-email case
(returns `url-authenticated-user` placeholder only when the app is configured,
denies otherwise) and `requireTreasurer_`/`getEmailForCharacter_` reverse-lookup
fallback is consistent with the documented identity model. `apiSellInventoryBatch`
releases the document lock on all paths via `finally` (including the pre-lock
auth-throw, guarded by an inner try/catch) and processes rows highest-rowNumber-
first so deletions don't invalidate not-yet-processed row numbers. Traced for the
Identity, Inventory-read, Add-library-search, and Sell/Remove stories.

### 2026-06-20 (run 53) — Sections audited: 1

Section 1 = Code.js lines 1–500 (config, helpers, validation). Composition: `CONFIG`
+ schema constants (`EQUIPMENT_HEADERS`, `INVENTORY_HEADERS`, `RESOURCE_LEDGER_HEADERS`,
`DELERIUM_HEADERS`, `CHARACTERS_HEADERS`, `USER_PROFILE_HEADERS`), the three lists that
feed write/validation paths (`APPROVED_INVENTORY_CATEGORIES` 29, `DELERIUM_SIZE_VALUES`
42, `QUICK_ADD_ITEMS` 52), the spreadsheet menu (`onOpen`, `addEmailColumnToCharacters`,
`runHealthCheck`), the web-app entry (`doGet` 238, `include_` 253), tab/setup utilities
(`setupInventoryTabs` 261, `resetAppDataSheets` 286, `setupLookupsSheet_` 330,
`setupLogSheet_` 367), and the batched clean-library import (`resetCleanEquipmentLibrary`
391, `continueCleanEquipmentLibrary` 417). No user-facing `api*` write path lives strictly
in 1–500; the section is consumed by stories via `doGet` (every story's app-load step) and
via the three constant lists. Read out to `apiGetQuickAddItems` (883), `apiGetCategories`
(874), client `loadQuickAddItems`/`QUICK_ADD_ITEMS` (Index.html 2835/2900), client
`DELERIUM_SIZES` (Index.html 2786) and the delerium counter handlers (4546–4859) to close
the constant-consumer traces.

Stories traced (happy → failure-at-step → navigate-away → friction, plus execution-trace +
state-machine on the in-range admin write path):

- **App load (cross-cutting, every story)** — `doGet` → `createTemplateFromFile('Index')
  .evaluate()`. Happy: template renders, `ALLOWALL` set so it embeds. Failure: eval throws
  → catch returns a static "temporarily unavailable — please reload" page; user can retry by
  reload, no stuck server state (read-only entry). See RISK below re: the fallback page.
- **Add custom item / quick-add** (Custom Item / quick-add tiles) — `QUICK_ADD_ITEMS`
  (Code.js 52) → `apiGetQuickAddItems` (883) → client `loadQuickAddItems` (2900). Server and
  client object shapes match field-for-field (`quickKey/name/category/rarity/valueGp/terms`);
  client ships an identical hardcoded fallback list (2835) and only overwrites it on
  `ok && items.length`, so a failed/slow `apiGetQuickAddItems` leaves the quick-add tiles
  fully functional — clean failure path. All quick-add categories ('Potion','Other',
  'Tool / Gear','Scroll') are members of `APPROVED_INVENTORY_CATEGORIES`.
- **Add library item** (categories) — `apiGetCategories` (874) returns
  `APPROVED_INVENTORY_CATEGORIES.slice()`; the add/edit validators downstream check membership.
  In-range list is internally consistent with the quick-add categories.
- **Receive / Sell crystals** (delerium size handling) — `DELERIUM_SIZE_VALUES` (42,
  lowercase) is the authoritative size list: emitted lowercase to the client via
  `sizeOptions` (3579) and validated lowercase at 2476/2603/2821/2926/3632/3748. Client
  `DELERIUM_SIZES` (Index.html 2786) is lowercase and identical; counter buttons emit
  `data-size` lowercase (4578/4610) and `apiAdjustDelerium`-bound payloads carry lowercase
  sizes. No title-case mismatch — the LOOKUPS sheet's title-case "Delerium Types" (335) is a
  separate spreadsheet-dropdown list and does not gate the API.

Secondary scan (uncovered write paths in-range): only `continueCleanEquipmentLibrary` (admin,
not a catalog story). Execution-trace/state-machine: `requireAdminUser_` runs before
`LockService.getDocumentLock().tryLock` (no lock leak on auth failure); lock released in a
`finally` (577); progress checkpointed to DocumentProperties every chunk
(`CLEAN_LIB_NEXT_READ_ROW/WRITE_ROW/COPIED_COUNT`) with `SpreadsheetApp.flush()`, so a 4.25-min
timeout-abort resumes cleanly on the next run — clean resumable-batch trace.

#### RISK · Code.js:247 · doGet error fallback omits setXFrameOptionsMode(ALLOWALL)
The happy path sets `.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)` (244),
which is only meaningful if the web app is loaded inside an iframe (e.g. embedded in a
campaign page / Google Site / the Wallpaper). The `catch` fallback (247–249) builds its
`HtmlOutput` with only `.setTitle(...)` — no `setXFrameOptionsMode`. In an embedded
deployment, GAS's default X-Frame-Options would block the fallback frame, so on a template-eval
failure the user sees a blank/blocked frame instead of the intended "temporarily unavailable —
please reload" message — exactly the moment graceful degradation is supposed to fire. Affects
the app-load failure step of every story when embedded. Fix: chain
`.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)` onto the fallback output too.
(If the app is only ever opened as a top-level `/exec` navigation, impact is nil — but then the
ALLOWALL on the success path is also unnecessary, so the two paths should at least agree.)

#### Note · Code.js:42 · Section 1 constants/entry traced clean; one latent drift risk
Traced: App load (doGet) cross-cutting; Add custom item/quick-add (failure resilience via
hardcoded client fallback); Add library item (categories); Delerium receive/sell (size constant
end-to-end). All four constant→consumer paths are internally consistent and case-correct.
Latent (not a current bug): `DELERIUM_SIZE_VALUES` (Code.js:42) and `DELERIUM_SIZES`
(Index.html:2786) are duplicated by hand, as are the two `QUICK_ADD_ITEMS` lists — the client
quick-add list self-heals from the server, but the delerium lists do not (client never refetches
sizes), so adding a size to one list and not the other would silently make new-size crystals fail
server-side `includes()` validation with no client-visible reason. Worth a shared source if the
size taxonomy ever changes.

### 2026-06-20 (run 52) — Sections audited: 13

Section 13 = Index.html lines 7501–end (add item flow, custom item, form handling).
Composition: swipe delete/remove tail (`deleteSelectedInventory` 7501–7560), equipment
index load/cache (`loadEquipmentIndex` 7567, `searchEquipment` 7662, `getQuickAddMatches`
7702, `renderEquipmentResults` 7713), stat block render (`renderStatBlock_` 7733),
select/fill (`selectEquipmentResult` 7753 → `fillAddFormFromEquipment` 7773), scroll/custom
helpers (`setScrollMode_` 7860, `handleScrollSpellInput` 7867, `startCustomItem` 7932,
`customizeSelectedItem` 7960), step visibility (`updateAddFlow` 7998), async description
load (`loadSelectedDescription` 8023), the central add write path (`addInventoryItem` 8069)
and form reset (`clearAddForm` 8222), plus the global resize/visibilitychange/boot tail.
Read out to `primeInventoryCacheAfterAdd` (2931), `cacheInventoryRows` (2920),
`findDuplicateInventoryCandidate`/`showCombineChoice`/`confirmCombineInventoryItem`
(3337–3401) to close the add→confirm→combine trace.

Stories traced (happy → failure-at-step → navigate-away → friction, plus execution-trace +
state-machine on every in-range write path):

- **Add library item** (search → select → fill qty/holder/notes → Add → optimistic row →
  server confirm → combine suggestion) — `selectEquipmentResult` →
  `loadSelectedDescription` → `addInventoryItem` → `apiAddInventory` → `primeInventoryCacheAfterAdd`
  → `findDuplicateInventoryCandidate`/`showCombineChoice`. Optimistic row + cache, snapshot
  restore on both not-ok and failure, `_inFlightWrites` balanced (one ++ / exactly one -- per
  outcome). **One BUG (holder wipe) and one RISK (failed-add clobber) below.**
- **Add custom item** (Custom Item → fill → Add) — `startCustomItem` / `customizeSelectedItem`
  → `addInventoryItem` → `apiAddCustomInventory`. Same write path; clean apart from the shared
  clobber RISK.
- **Combine duplicate** (duplicate detected → combine sheet → Confirm) —
  `showCombineChoice` → `confirmCombineInventoryItem` → `apiCombineInventoryItems`. Execution-
  trace + state-machine clean: `pendingCombineChoice` nulled before the call (double-tap
  guarded — second tap hits the `if (!pendingCombineChoice) return`), restored on both error
  branches, sheet stays open so retry works without reload. Note below.
- **Delete / remove-one inventory item** (swipe → Delete/Remove) — tail of
  `deleteSelectedInventory` (in range 7501–7560), already traced in full in run 51 (s12).
  Re-confirmed: `previousRows` restored on both failure branches, `detailButton.disabled`
  re-enabled on every outcome, `_inFlightWrites` balanced. Clean.

#### BUG · Index.html:8045 · Async description load silently wipes user-selected holder
Story: **Add library item**, at the select-then-fill step. `selectEquipmentResult` (7768)
fires `loadSelectedDescription(true)` for any non-quick, non-scroll library item. On first
selection of a given item (not yet in `itemCache`), this is an async `apiGetEquipmentItem`
round-trip. Its success handler (8053–8055) sets `selectedEquipment = res.item` and calls
`fillAddFormFromEquipment(selectedEquipment, true)`, which at line 7810 unconditionally does
`document.getElementById('holder').value = ''`. If the user picks a holder from the dropdown
during the ~hundreds-of-ms round-trip, their selection is silently reset to blank — the item
is then added to the party pool instead of the intended character. qty and notes survive
(fillAddForm doesn't touch them); only holder is clobbered. The cached path (8030–8037) runs
synchronously inside `selectEquipmentResult` so it is safe — the bug only fires on the first
selection of each library item. Fix: in `fillAddFormFromEquipment`, only blank `#holder` on
the initial fill (e.g. guard with the `includeDescription` flag or skip when the field
already holds a value), or capture/restore the current holder around the description refresh.

#### RISK · Index.html:8142 · Failed add overwrites an in-progress new selection
Story: **Add library/custom item**, failure-at-step + double-action race. `addInventoryItem`
calls `clearAddForm()` synchronously (8127), setting `selectedEquipment = null`, then fires
the async add. Because the form is cleared and focus moves to the search box, the user can
immediately select a *different* item while the first add is in flight. If the first add then
returns `{ok:false}` (8142–8157) or throws (8181–8197), the handler restores
`selectedEquipment = selectedSnapshot` and rewrites every form field from `payloadSnapshot`,
discarding whatever the user just selected/typed. The "no content loss" restore is correct
when the form is still idle, but here it overwrites live in-progress input. Suggest guarding
the restore on `selectedEquipment === null` (form untouched since the add) before clobbering,
or surfacing the failed item via the status line without forcing it back into the form.

#### RISK · Index.html:8122 · Optimistic `_opt_` row can be cached and resurface after a kill
Story: **Add item**, iOS background/navigate-away. The optimistic row is written to
localStorage (`cacheInventoryRows`, 8122–8123) while `_inFlightWrites` is still 0 (it is not
incremented until 8133), so the synthetic `_opt_<ts>` row lands in the persistent cache. On
success it is promptly replaced (`primeInventoryCacheAfterAdd` re-caches without it), so the
window is small — but if the GAS webview is suspended/killed before the server responds and a
later `loadInventory` falls back to cache (e.g. network failure on resume), a phantom
`_opt_…` row appears whose Inventory ID is not real (its swipe/edit/delete actions would hit
the server with a bogus id). Low likelihood; consider stripping `_opt_`-prefixed rows when
reading the cache on boot.

#### Note · Index.html:8133 · Add/combine in-flight bookkeeping and double-tap guards clean
`addInventoryItem` increments `_inFlightWrites` exactly once and decrements once in each of
the success and failure handlers (8136 / 8176), so the poll-deferral counter never leaks.
Double-tap Add is implicitly guarded — `clearAddForm` blanks `#item` synchronously, so a
second tap hits the `if (!rawName)` early return. `confirmCombineInventoryItem` nulls
`pendingCombineChoice` before the call and restores it on error, giving a clean
idle/in-flight/error/retry state machine. Traced: Add library item, Add custom item, Combine
duplicate, Delete/remove inventory item.

### 2026-06-20 (run 51) — Sections audited: 12

Section 12 = Index.html lines 6001–7500 (inventory groups, description sheet, sell
batch). Composition: ledger note-edit tail (`updateLedgerNoteFromBottom` 6001),
resource classifiers (`isGoldItem_` 6041, `getDeleriumBreakout` 6070,
`buildInventoryGroups` 6104, `getInventoryGroupKey` 6133), rollup
(`rollupInventoryRows` 6212, `renderInventoryGroup` 6188), dashboard pay/undo
(`payResource` 6257, `undoResourcePay` 6326), description sheet
(`openInventoryDescription` 6518, `getDescRemoveTotalQty_` 6592, desc-action sub-sheet
`openDescActionSheet` 6705 → `_confirmDescActionAdd_` 6810 / `_confirmDescActionSell_`
6890 / `_confirmDescActionRemove_` 6965, `descActionGiveTo` 6799), quick-edit
(`openQuickEditPanel` 7076 → `confirmQuickEdit` 7205), full editor save
(`saveInventoryEdits` 7372), and delete (`deleteSelectedInventory` 7464). Read out to
`confirmPayWithReason` (5668, undo arming) and `apiSellInventoryBatch`/`apiAdjustInventory`
callers to close traces.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every in-range write path):

- **View item details** (tap card → description sheet → stat block + description loads)
  — `openInventoryPrimaryAction` → `openInventoryDescription` → `apiGetEquipmentItem`.
  Stale-fetch guard via `capturedId` is correct; navigate-away/close mid-fetch is
  handled (handler bails when `selectedInventory` changed). **One RISK: success handler
  caches `null` on `{ok:false}` — see below.**
- **Sell item** (description sheet → Sell for Gold → stepper → confirm) —
  `openDescActionSheet('sell')` → `_confirmDescActionSell_`. Execution-trace clean: FIFO
  drain across rollup rows, optimistic decrement, `previousRows` restored on both
  failure branches, `_inFlightWrites`/`descActionInFlight` balanced, `loadInventory(true)`
  reconciles gold + ledger on success. No stuck state; double-tap guarded by
  `descActionInFlight` + closed sheet.
- **Remove item** (description sheet → Remove → stepper → confirm) —
  `_confirmDescActionRemove_`. Clean: same FIFO/rollback pattern, goldAmount 0, no
  optimistic ledger so ledger needs no restore. Balanced counters.
- **Give item to character** (description sheet → Give to… → pick → confirm) —
  `descActionGiveTo` → `giveItemToCharacter` (5609, traced in run 50). Representative-row
  limitation already a documented Known TODO; no new defect in this section's wiring.
- **Quick-adjust currency/delerium** (tap gold/delerium card → quick-edit sheet →
  add/remove/set → Confirm) — `openQuickEditPanel` → `confirmQuickEdit`. Execution-trace
  clean: `quickEditInFlight` set synchronously guards double-tap, `_inFlightWrites`
  balanced on both handlers, server `res.item` merged via `updateInventoryRowFromServer`,
  failure leaves sheet open with retryable error. Verification read
  (`apiGetCurrencyQuickEdit`) guarded by `selectedQuickEdit.itemId` identity check —
  survives navigate-away. Minor: a quick `set 0` leaves an in-memory 0-qty row until next
  sync (busts cache but no `loadInventory`); not user-reachable for currency in practice.
- **Edit inventory item** (swipe → Edit → Save) — `saveInventoryEdits`
  → `apiUpdateInventory`. Clean: buttons re-enabled on both handlers, optimistic
  `updateInventoryRowLocally` only applied on success, `_inFlightWrites` balanced.
- **Delete inventory item** (swipe → Delete, confirm if qty>1) — `deleteSelectedInventory`.
  Clean: extra-confirm gate for multi-qty rows, `previousRows` restored on both failure
  branches, `_inFlightWrites` balanced, decrement-vs-delete branch correct.
- **Undo last pay** (Undo after pay → reverse) — `confirmPayWithReason` arms
  `lastResourceUndo['gold']`, `undoGoldPay` → `undoResourcePay('gold')`. **BROKEN on the
  member-send branch — `_inFlightWrites` double-decrement, see BUG below.**

#### BUG · Index.html:6364 · `undoResourcePay` double-decrements `_inFlightWrites` on member-send undo failure
Story: **Undo last pay**, failure-at-step (member-send / "Pay → character" path). When a
gold pay was a member send, `lastResourceUndo['gold'].creditItem` is set (armed at
Index.html:5731), so `undoResourcePay` takes the `creditId` branch and calls
`apiUndoMemberSend`. Its success handler runs:
```
.withSuccessHandler(res => {
  resourcePayInFlight[resource] = false;
  _inFlightWrites--;                         // (1) unconditional decrement
  if (!res || !res.ok) { rollback(); return; }   // rollback() decrements AGAIN
  ...
})
```
`rollback()` (6345) also does `_inFlightWrites--`. So when the server returns `{ok:false}`
(not a transport error — `withFailureHandler` handles those correctly with a single
decrement), `_inFlightWrites` is decremented **twice** for one increment. Net effect:
`_inFlightWrites` drifts to −1 (and further negative on repeats). Because the sync poll
and several write paths defer `loadInventory(true)`/`loadNotes(true)` only while
`_inFlightWrites > 0`, a negative counter permanently defeats that guard: a subsequent
genuine in-flight write no longer blocks a poll-triggered reload, so a concurrent
collaborator write can trigger `loadInventory(true)` mid-write and clobber the optimistic
rows (the "Collaborative sync interference" cross-cutting story). The purchase-path branch
at 6373 is written correctly (it calls `rollback()` and `return`s *before* its manual
decrement), confirming the member-send branch's ordering is the defect. Fix: move the
`_inFlightWrites--` / `resourcePayInFlight = false` below the `res.ok` check, mirroring the
purchase branch — let `rollback()` own the cleanup on the failure path.

#### RISK · Index.html:6568 · Description fetch caches `null` on `{ok:false}`, blanking the description for the session
Story: **View item details**, failure-at-step. In `openInventoryDescription`:
```
const item = (res && res.ok && res.item) ? res.item : null;
itemCache[libraryItemId] = item;   // caches null even when res.ok === false
```
The `withFailureHandler` deliberately does *not* cache (`// Don't cache null — let the next
open retry the fetch`), but the success handler unconditionally writes `itemCache[id]`,
including `null` when the server returns `{ok:false}`. Once cached, every later open of any
item sharing that Library Item ID short-circuits on `itemCache[id] !== undefined` and shows
"No description available." with no retry for the rest of the session. For genuinely
missing/unimported items this caching is desirable (avoids refetch storms), but a transient
`{ok:false}` (e.g. a momentary sheet read failure) is treated identically and permanently
blanks a real description. Consider caching only on `res.ok` (or distinguishing "not found"
from "error" in the server response) so transient failures stay retryable.

#### Note · Index.html:6104 · Inventory grouping / rollup classifiers traced clean
`buildInventoryGroups`/`getInventoryGroupKey`/`rollupInventoryRows`/`getDescRemoveTotalQty_`
are pure read-side helpers (no writes, no async). Rollup math (qty sum, Holder→"Multiple",
adder de-dup) and the multi-holder FIFO target selection used by sell/remove are internally
consistent across `_confirmDescActionSell_`, `_confirmDescActionRemove_`, and the
`getDescRemoveTotalQty_` max. No state-machine or data-loss defect found in the grouping
layer. (`confirmDescRemove` at 6621 appears orphaned — Remove routes through
`openDescActionSheet('remove')`; not reported per dead-code exclusion.)

### 2026-06-20 (run 50) — Sections audited: 11

Section 11 = Index.html lines 4501–6000 (gold/delerium UI, sync). Composition:
delerium sheet render + counters (`renderDeleriumSheetBody` 4544, `adjustDeleriumSell`
4624, `adjustDeleriumReceive` 4671, `updateDeleriumButtonStates` 4691), delerium
write paths (`receiveDelerium` 4712, `sellDelerium` 4812), gold sheet render
(`renderGoldSheetBody` 4945, `renderGoldSheetButtons` 4985), gold write paths
(`receivedGold` 5021, `openPayReasonSheet` 5101, `confirmPayWithReason` 5668,
`splitGold` 5766, `undoGoldPay` 5016), give (`giveItemToCharacter` 5609), single-item
sell (`confirmSellItem` 5189), batch sell (`openSellBatchSheet` 5267 →
`confirmSellBatch` 5553), copy-inventory (`copyPartyPoolInventory` 5459), and the
ledger note-edit machine (`selectLedgerRowForEdit` 5952, `cancelLedgerEdit` 5983,
`updateLedgerNoteFromBottom` 6000). Read out to `pollSync`/`loadInventory` deferral
(`_inFlightWrites > 0` guard at 2921 / 3643) and `isGoldItem_`/`getDeleriumBreakout`
(6041/6070) to close traces.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every in-range write path):

- **Pay gold** (Gold tab → Pay → reason → confirm) — `openPayReasonSheet` →
  `confirmPayWithReason`. **BROKEN: TDZ ReferenceError, see BUG below.** Flow never
  completes; a phantom pending ledger entry is leaked on every attempt.
- **Receive gold** (Got Paid) — `receivedGold`. Execution-trace clean: optimistic
  ledger + gold row prepended, `removePending` balanced on both handlers,
  `_inFlightWrites` inc/dec balanced, inputs saved/restored on failure. Amount input
  cleared before the async call doubles as a synchronous double-tap guard. No stuck
  state.
- **Split gold evenly** (treasurer) — `splitGold`. Clean: pending entry keyed by
  `_pendingId`, removed on both handlers; inputs restored on failure; `renderInventory`
  only on success.
- **Undo last pay** — `undoGoldPay` → `undoResourcePay('gold')`. Confirmed the known
  ledger-asymmetry TODO still holds (removes inventory rows, does not reverse
  RESOURCE_LEDGER); not re-reported.
- **Receive crystals / Sell crystals** — `adjustDeleriumReceive`/`adjustDeleriumSell`
  → `receiveDelerium`/`sellDelerium`. Execution-trace clean: mixed-mode guard
  (`updateDeleriumButtonStates` disables both buttons when for-sale and receiving
  coexist) plus belt-and-suspenders `hasForSale`/`hasReceiving` early returns; optimistic
  rows keyed by `'_opt(_rec)_'+size+Date.now()`; full snapshot revert on failure; 0 gp
  sell inline-confirm re-enters `sellDelerium(true)` with no `_inFlightWrites` leak on
  the confirm-prompt early return. No stuck state.
- **Give item to character** — `giveItemToCharacter`. Index-based revert
  (`inventoryRows[idx]`) is safe because `_inFlightWrites++` is set before the call and
  `loadInventory(true)`'s foreign-reload path defers render while `_inFlightWrites > 0`
  (3643), so the array is not reindexed mid-flight. Clean.
- **Sell item (description sheet)** — `confirmSellItem`. `descActionInFlight` guards
  double-tap; FIFO drain across rollup rows; `previousRows` snapshot reverts on
  failure; `_inFlightWrites` balanced. Clean.
- **Sell Items batch** (treasurer) — `openSellBatchSheet` → `confirmSellBatch`.
  Generation-counter auto-close (5592) — the stale README TODO is now obsolete.
  Friction IDEA below (non-optimistic, inconsistent with single-item sell).
- **Edit ledger note** (gold + delerium) — `selectLedgerRowForEdit` → bottom edit bar
  → `updateLedgerNoteFromBottom`. Reconciles by `entryId` else `Timestamp`; buttons
  disabled during flight and re-enabled on both handlers; `cancelLedgerEdit` clears
  `readOnly` + target. Clean (Timestamp-fallback ambiguity for ID-less entries is the
  known DEFERRED limitation, not re-reported).

#### BUG · Index.html:5695 · `confirmPayWithReason` throws TDZ ReferenceError — Pay gold flow completely broken
Story: **Pay gold**, step "tap Purchase / character to confirm". `confirmPayWithReason`
references `isPartyScope` at line 5695 (building the optimistic gold deduct row:
`'Holder': isPartyScope ? '' : goldSheetScope`) but `isPartyScope` is declared as a
block-scoped `const` at line 5751 — *after* the use. Per ES6 temporal-dead-zone rules
the read at 5695 throws `ReferenceError: Cannot access 'isPartyScope' before
initialization`, synchronously, every time. Because `openPayReasonSheet` already closed
the reason sheet (5669) and the pending ledger entry was already prepended at 5690
*before* the throw, the user sees: reason sheet closes, amount stays in the input,
nothing else happens — and a phantom `_pending` ledger entry is leaked into
`inventoryResourceLedger` that never resolves (`removePending` at 5705 is never reached),
surfacing as a stuck "(saving…)" row the next time the gold body renders.
`_inFlightWrites` is *not* leaked (the `++` at 5752 is past the throw), so the foreign
reload still works — meaning the phantom can be cleared by a later `loadInventory(true)`,
but the pay itself never reaches the server. Breaks both sub-routes (Purchase via
`apiDepleteResource` and send-to-character via `apiSendGoldToMember`).
Fix: move `const isPartyScope = goldSheetScope === 'party';` to the top of
`confirmPayWithReason` (before line 5690), mirroring `receivedGold` (5031).

#### IDEA · Index.html:5553 · Batch sell is non-optimistic — inconsistent with single-item sell
Story: **Sell Items batch**. `confirmSellBatch` makes no optimistic mutation; it shows
"Selling…", waits for the server, then calls `loadInventory(true)`. Sold rows stay
visible until the round-trip completes (plus the 1.5 s auto-close), whereas the adjacent
single-item `confirmSellItem` (5189) drains rows optimistically and reverts on failure,
so the inventory updates instantly. The two sell flows feel inconsistent. Consider an
optimistic FIFO drain in `confirmSellBatch` with a `previousRows` snapshot revert, the
same pattern already proven in `confirmSellItem` — the rollup→row distribution is
already computed in `items`.

#### Note · Index.html:5766 · Gold/delerium/give/sell/ledger-edit write paths trace clean
Traced **Receive gold**, **Split gold**, **Receive/Sell crystals**, **Give item**,
**Sell item**, **Edit ledger note** end-to-end (happy + failure-at-step + navigate-away).
All use balanced `_inFlightWrites`, `_pendingId`-keyed pending removal, full-snapshot or
ID-keyed revert, and input save/restore on failure. The `_inFlightWrites > 0` deferral
(2921 cache-skip, 3643 foreign-reload-skip) correctly protects index-based reverts and
optimistic rows from being clobbered by the 20 s poll mid-write. Only `confirmPayWithReason`
is broken (BUG above).

### 2026-06-20 (run 49) — Sections audited: 10

Section 10 = Index.html lines 3001–4500 (inventory render, search). Composition:
DPR font scaling + phone detection (3001–3027), the swipe-to-delete gesture engine
(3029–3185), navigation/command-search wiring (`setCommandMode` 3188, command-search
handlers 3263–3322), the combine flow (`confirmCombineInventoryItem` 3369), the dice
calculator (client-only, 3420–3506), inventory load/render (`loadInventory` 3588,
`renderInventory` 3714, `renderInventoryRowCard` 3766, `renderInventoryDashboard`
3830), the collaborative sync poll (`pollSync` 3868), the full Party Notes v2 CRUD
set (3908–4272), and identity resolution (`applyIdentity` 4307, `confirmIdentity`
4410). Read out into `handleInventoryDeleteActionById`/`deleteSelectedInventory`
(7449/7464), `openInventoryPrimaryActionById` (6447), and `#mainStatus` placement
(2082) to close each trace.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every in-range write path / component):

- **Add library item → combine suggestion** — `findDuplicateInventoryCandidate`
  (3337) → `showCombineChoice` (3346) → `confirmCombineInventoryItem` (3369).
  Execution-trace clean: `_inFlightWrites` inc/dec balanced on both handlers,
  double-tap guarded by nulling `pendingCombineChoice`, failure restores the
  choice and re-enables the sheet. State machine (idle/in-flight/success/error)
  has no stuck state. Note below.
- **Delete inventory item (swipe)** — gesture engine (3037–3185) → tap vs.
  swipe-open axis lock → Delete button → `handleInventoryDeleteActionById` (7449)
  → `deleteSelectedInventory(..,{decrementOnly:true})`. Confirmed the dual
  pointerup/touchend tap handlers are mutually guarded by `lastTapOpenedAt`
  (no double-open). Confirmed swiped-open card survives `renderInventory()`
  re-render via inline `offsetStyle` transform keyed on `swipedInventoryId`.
- **Combine duplicate / View item details (tap card)** — `openInventoryPrimaryActionById`
  reached from both pointerup (3081) and touchend (3153) tap branches.
- **Quick-adjust currency/delerium** — dashboard stat buttons (`openGoldSheet`/
  `openDeleriumSheet`, 3851/3854) entered from `renderInventoryDashboard`. IDEA below
  (scoped totals vs party-pool sheet).
- **Create / Edit / Pin / Archive / Delete note** — full trace through
  `saveNoteForm` (4119), `toggleNotePin` (4245), `archiveNote` (4216),
  `deleteNoteFromForm` (4091). Optimistic + rollback verified; `_notesActionInFlight`
  Set blocks double-tap on pin/archive/delete; rollbacks locate the note by ID at
  handler time (no stale index). RISK + IDEA below.
- **Collaborative sync interference / Tab switch during in-flight / iOS
  background-foreground** (cross-cutting) — `pollSync` (3868) deferral logic
  exhaustively walked for inventory and notes: in-flight foreign change sets
  `pendingForeignReload`/`pendingForeignNoteReload` without advancing `syncState`,
  so the deferred reload is correctly re-detected and consumed on a later poll even
  when interleaved with the local writer's own timestamp bump. No lost foreign
  reload, no stuck flag. Confirmed clean.
- **First-open identity** — `confirmIdentity` (4410) optimistic-apply +
  `apiSetMyCharacter`; `loadMyIdentity` double-apply (cached then server) is
  idempotent (`startSyncPoll` and `loadNotes` both self-guard). Confirmed clean.
- **Dice calculator** — client-only, no server calls, no inventory/notes state;
  confirmed not a write path (re-confirmed from run 48).

#### RISK · Index.html:4174 · Failed note create pops the form sheet over an unrelated tab
Story: **Create note**, navigate-away step. `saveNoteForm`'s create branch closes
the form, inserts an optimistic card, then fires `apiCreateNote`. If the user
switches to the Inventory or Add tab while the create round-trips and the call then
fails, `restoreNoteForm_` (4174) calls `openNoteForm('add', …)` unconditionally —
which only adds `.active` to `#noteFormSheet` and never checks `commandMode`. The
New Note form sheet therefore springs open on top of whatever tab the user is now
viewing (inventory/add), with `syncModalOpenState()` dimming that tab. The user gets
an unexpected modal for a note they thought they'd left behind. Suggest: in
`restoreNoteForm_`, if `commandMode !== 'notes'` keep the optimistic card out and
instead surface a dismissible retry affordance (or switch to the notes tab first via
`setCommandMode('notes')` before re-opening), rather than forcing the sheet open
cross-tab. The edit branch (4136) does not have this problem — it only reverts data
and calls `setMainStatus`.

#### IDEA · Index.html:4261 · Notes action failures land in #mainStatus, off-screen on the notes tab
Story: **Pin note / Edit note** failure feedback. Failure feedback for notes actions
is inconsistent: `toggleNotePin` (4261/4269) and the edit branch of `saveNoteForm`
(4151/4160) route errors to `setMainStatus`, but `#mainStatus` lives at the very top
of `<main>` (line 2082), above the notes list — after any scroll on the notes tab it
is off-screen, so a pin/edit failure looks silent even though the optimistic state
correctly reverts (the pin visibly flips back, but with no explanation). Meanwhile
`archiveNote` uses a blocking `alert()` (4232/4240) and `deleteNoteFromForm` uses
`setMainStatus`. Suggest unifying notes-tab failures onto a single visible surface
near the list (a transient toast or a status line inside `#notesSection`), so the
three sibling actions give comparable, in-view feedback.

#### IDEA · Index.html:3851 · Dashboard Gold/Delerium totals are scope-filtered but the cards open party-pool sheets
Story: **Quick-adjust currency/delerium**, entry step. `renderInventoryDashboard`
(3830) computes `totals.gold`/`totals.delerium` from the already scope-filtered
`rows` it is handed by `renderInventory`. In a character scope, gold/delerium rows
(which normally have an empty Holder and live in the party pool) are filtered out, so
the dashboard shows "0 Gold / 0 Delerium" — yet tapping either card opens
`openGoldSheet`/`openDeleriumSheet`, which always display the real party-pool total.
The number the user taps does not match the number they land on. Party scope is
consistent; only character scope mismatches. Suggest either computing the dashboard
currency totals from the unscoped `inventoryRows` (party pool is shared, not
per-character) or labelling the cards as party totals so the tap target reads
consistently.

#### Note · Index.html:3369 · Combine flow and sync-poll deferral traced clean
Combine (`confirmCombineInventoryItem`) and the collaborative sync poll (`pollSync`)
were the two highest-risk write/concurrency paths in this section and both trace
cleanly. Combine: balanced `_inFlightWrites`, double-tap guarded, failure restores
`pendingCombineChoice` and re-enables the sheet, success rewrites `inventoryRows` by
ID (no stale index) and re-caches. Sync poll: deferral of foreign reloads during
local in-flight writes does not advance `syncState`, guaranteeing the deferred reload
is re-detected and consumed later even when interleaved with the local writer's own
timestamp bump (verified the foreign-then-mine ordering ends in a `loadInventory(true)`
with `pendingForeignReload` cleared). Stories named under run-49 header above.

### 2026-06-20 (run 48) — Sections audited: 9

Section 9 = Index.html lines 1501–3000. Composition: phone/dice/notes CSS
(1501–2055), the entire `<body>` markup for every mobile-sheet and the two app
sections (2058–2740), and the first ~260 lines of client JS — state declarations
and the localStorage cache + character-selector helpers (2742–3000). The only
server calls in range are `loadQuickAddItems` (2900) and `loadCharacters` (2908);
the cache helpers (`cacheInventoryRows` 2920, `primeInventoryCacheAfterAdd` 2931)
and `populateCharacterSelectors` (2888) underpin nearly every write story, so each
write story was traced through them and out into its handler.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every in-range component):

- **Add library item / Add custom item** — markup (`addDetailsCard`,
  `selectedItemCard`, holder `<select>` 2296), optimistic path through
  `primeInventoryCacheAfterAdd` → `cacheInventoryRows`, holder dropdown via
  `populateCharacterSelectors`.
- **Edit inventory item** — `inventorySheet` markup (2354), `sheetEditHolder`
  populated by `populateCharacterSelectors` (value-preserving rebuild).
- **Give item to character** — `giveItemSheet` markup (2635) → `giveItemToCharacter`
  (5609). Confirmed clean optimistic revert on both failure handlers.
- **Receive crystals / Sell crystals** — `deleriumSheet` markup (2587) →
  `receiveDelerium` (4756). One RISK below (optimistic `_pending` persistence).
- **Quick-adjust currency/delerium** — `quickEditSheet` markup (2452).
- **View details → Sell / Give / Remove** — `descriptionSheet` (2424) +
  `descActionSheet` (2661) markup, stepper-driven actions.
- **Create/Edit note, Pin, Archive** — `noteFormSheet` markup (2505); state vars
  `_inFlightNoteWrites`, `_notesActionInFlight` (2779–2782).
- **First-open identity** (prerequisite to every story) — `identitySheet` markup
  (2676), `showIdentitySheet` (4371), `loadCharacters` (2908). One RISK below.
- **Dice calculator** — fully in range (markup 2686–2733, CSS 1818–1927); client-only,
  no server calls, no inventory state — confirmed not a write path.

#### RISK · Index.html:2915 · loadCharacters failure permanently bricks the first-open identity picker
`loadCharacters()` is called exactly once at boot (8340) and its failure handler
(2915–2917) only does `console.error` — no retry, no user-visible error. The
identity picker (`showIdentitySheet`, 4371) renders its character cards from
`characterOptions`; when that array is empty it shows the placeholder
`<div class="status centered">Loading characters…</div>` (4377). `loadCharacters`
success re-calls `showIdentitySheet` if the sheet is active (2914), which is the
only thing that ever replaces that placeholder with tappable cards. So on a true
first open (no cached identity, and `apiGetMyCharacter` doesn't resolve a name →
`loadFallbackCharacterIdentity` calls `showIdentitySheet`, 4357/4366), if the single
`apiGetCharacters` call fails (transient GAS/network error), the picker is stuck on
"Loading characters…" forever — no cards, no error, no retry button. The user
cannot select a character and is blocked from the entire app; the only escape is a
manual page reload. Breaks the identity prerequisite at its first step. Suggested
fix: give `loadCharacters`'s failure handler a user-visible error + retry affordance
(e.g. render a "Couldn't load characters — Tap to retry" button into
`identitySheetBody` when the sheet is active), or auto-retry with backoff.

#### RISK · Index.html:2921 · cacheInventoryRows in-flight guard is order-dependent; receiveDelerium persists an optimistic `_pending` ledger entry
The guard `if (_inFlightWrites > 0) return;` (2921) is designed to keep optimistic,
unconfirmed state out of the localStorage cache so a mid-flight reload paints the
last *confirmed* state. Its effectiveness depends entirely on call ordering, and
the write paths are inconsistent: `giveItemToCharacter` (5622→5623) and
`sellDelerium`/others increment `_inFlightWrites` *before* calling
`cacheInventoryRows`, so the guard correctly suppresses the optimistic write —
whereas `receiveDelerium` calls `cacheInventoryRows(inventoryRows,
inventoryResourceLedger)` at 4756 *before* `_inFlightWrites++` at 4759. That
persists the optimistic rows **and** the synthetic `_pending` "Saving…" ledger
entry (built at 4744) to localStorage. Navigate-away/return trace: if the user
reloads during the receive round-trip, the cache paints the `_pending` "Saving…"
entry, but no handler survives the reload to clear it — it lingers as a phantom
(potentially duplicating the real entry) until the startup `loadInventory` fetch
returns and overwrites `inventoryResourceLedger` (3646–3648). Because
`lastInventoryLoadAt` is 0 at boot the revalidate always fires, so the window is
short (~1–2s), keeping this low-severity — but it is a real inconsistency and a
footgun: the guard reads as "optimistic state is never cached," which isn't true
for this path. Suggested fix: move `receiveDelerium`'s pre-flight
`cacheInventoryRows` to after `_inFlightWrites++` (matching every other write
path), or have the guard also strip `_pending` entries before persisting.

#### Note · Index.html:5641 · Give / receive optimistic reverts confirmed clean
`giveItemToCharacter` (5609) and `receiveDelerium` (4760) both fully restore prior
state on the `!res.ok` and failure branches (holder reverts at 5646/5659;
`previousRows`/`previousLedger` restore at 4766/4789), clear the `saving` row
class, re-cache, and re-render — no stuck in-flight flag (`_inFlightWrites--` runs
on every branch) and no orphaned optimistic row. Tab-switch-during-in-flight is
safe: handlers operate on in-memory arrays by `Inventory ID`/`_pendingId`, not on
DOM/index, so a tab switch before the handler fires still resolves state correctly.
Traced: Give item to character, Receive crystals, Sell crystals.


### 2026-06-20 (run 47) — Sections audited: 8

Section 8 = Index.html lines 1–1500, which is entirely the `<head>` design-token +
CSS block (no `<body>` markup falls in range; HTML structure starts later). There
are no write paths or `google.script.run` calls in range, so the audit focused on
CSS rules that drive *behavioral state* — section/sheet visibility
(`.section.active`, `.mobile-sheet.active`), the scroll-lock
(`body.app-modal-open`), the disabled-button loading spinner (504–510), and the
swipe-action reveal CSS — tracing each into the JS that toggles it.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every CSS-driven UI state):

- **All mobile-sheet flows** (quick-adjust currency/delerium, edit/combine item,
  description sheet → give/sell/remove, pay → pay-reason, sell batch, note form,
  identity picker). The shared mechanism is `body.app-modal-open { overflow:
  hidden }` (line 110) plus `.mobile-sheet.active { display: block }`. Traced the
  scroll-lock state machine across all open/close paths (greps at 3216–8319).
- **Receive/sell crystals** — delerium button enable/disable + class-swap logic
  (`updateDeleriumButtonStates`, 4691) against the spinner CSS.
- **Sell Items batch** (treasurer) — `sellBatchConfirmBtn` initial/idle state vs
  the disabled-spinner CSS. One bug below.

#### RISK · Index.html:5546 · Sell-batch confirm shows an infinite spinner while idle
The Sell Items batch confirm button is declared `<button id="sellBatchConfirmBtn"
class="success" … disabled>Select items to sell</button>` (5546–5547) and
`updateSellBatchCount` (5436) only ever toggles `btn.disabled` / `btn.textContent`
— it never changes the class. The CSS at 504–510 attaches an infinite `btn-spin`
loading spinner to **every** disabled `.success` (and `.primary`) button via
`button.success:disabled::after`. Net effect: the moment a treasurer opens the
sell-batch sheet (Sell Items batch story, step a — happy path), the confirm button
sits disabled in its validation state ("Select items to sell" / "Set quantities to
sell") with a spinner whirring next to the label, falsely signalling that work is
in progress before the user has tapped anything. The spinner only stops once they
add a unit (button enabled) — i.e. feedback is inverted: it spins when idle and is
solid when actionable. Contrast the delerium buttons (`updateDeleriumButtonStates`,
4700–4708), which correctly swap to `class="secondary"` while validation-disabled
precisely so the spinner CSS does not apply. Fix: either swap `sellBatchConfirmBtn`
to `secondary` while `totalUnits === 0` (mirroring the delerium pattern), or gate
the spinner pseudo-element on an explicit `.is-loading` class set only during the
in-flight write rather than on `:disabled`.

#### Note · Index.html:110 · Scroll-lock state machine is clean across stacked sheets
`syncModalOpenState()` (3324) sets `app-modal-open` by recomputing
`Boolean(document.querySelector('.mobile-sheet.active'))` on every sheet
open/close (3360, 3366, 3430, 4083, 4088, 4332, 4453, 4532, 4539, 4940, 5130,
5135, 5160, 5165, 5181, 5186, 5278, 5386, 6701, 6725, 6730, 7169–7175, 7320–7325,
8319). Because it recomputes from "is *any* sheet still active," stacked sheets
behave correctly: pay-reason (`z-index: 80`, line 231) over the pay flow, and
give/sell sheets over the description sheet, all keep the body scroll locked until
the *last* sheet closes — closing the top sheet does not prematurely unlock scroll.
The only two direct `classList.add/remove('app-modal-open')` calls (identity open
4395, identity confirm 4423; description open 6589) are harmless: the adds are
idempotent, and the one direct remove runs at identity-confirm time when no other
sheet can be stacked. No stuck `overflow: hidden` state found on any navigate-away
or tab-switch path. Confirms the delerium button class-swap (4700–4708) as the
correct guard against the disabled-spinner trap flagged above.

#### Note · Index.html:1151 · Notes swipe edit/delete action CSS is unreferenced (not a leak)
`.notes-edit-action` / `.notes-delete-action` (1151–1183, `opacity: 0` reveal-on-
swipe styling) appear only in CSS — no HTML template or JS ever creates or reveals
these elements (grep across the file returns CSS-only). README's Party Notes spec
lists Pin/Archive buttons + tap-to-edit, no swipe-to-edit/delete on note cards, so
this is unused styling, not a hidden tappable element bleeding through. No
behavioral bug; flagged only to confirm it was checked (dead style, not reported
per audit rules).

### 2026-06-20 (run 46) — Sections audited: 7

Section 7 = Code.js lines 3501–end. In-range write paths: the tail of
`apiCombineInventoryItems` (audit + bumpSync), `apiGetCurrencyQuickEdit` (3545,
read), `apiAdjustCurrency` (3587, thin wrapper), `apiAdjustInventory` (3597) and
`apiSetItemQuantity` (3717) — the two quick-adjust writers — plus utilities
`normalizeForClient_` (3828), `ensureInventoryHeaders_` (3843),
`fillMissingInventoryRarity_` (3860), `findInventoryRowById_` (3920). The
section's nominal sync/audit helpers (`bumpSync_` 2016, `apiGetSyncState` 2026,
`auditWrite_` 1826, `appendResourceLedger_` 1856, `classifyQuickEdit_` 1794) live
earlier in the file and were read for the traces below.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every write path):

- **Quick-adjust currency/delerium** (tap gold/delerium card → quick-edit sheet
  → add/remove/set → amount → Confirm). Client `openInventoryPrimaryAction`
  (Index 6455) / `selectInventoryItem` (6471) gate on `getQuickEditType`;
  `openQuickEditPanel` (7076) opens optimistically from the local row then fires
  `apiGetCurrencyQuickEdit` to verify; `confirmQuickEdit` (7205) → `apiSetItemQuantity`
  (set) or `apiAdjustInventory` (add/remove). The in-flight guard
  (`quickEditInFlight`), `_inFlightWrites` bracketing on both handlers, double-tap
  early-return, status-element capture, and the verify success-handler item-mismatch
  guard (7120) are all correct — these were fixed in runs 22–45 and remain clean.
  Navigate-away during the verify round-trip is harmless (guard + hidden sheet).
  Three new findings below: a dropped ledger entry on the swipe tail, a size-change
  conflation in both writers, and a client/server classifier divergence for potions.
- **Delete / swipe-remove inventory item** (`apiAdjustInventory` decrement tail at
  Index 7556) — re-traced for the ledger-entry handling; see BUG below.
- **Combine duplicate** (`apiCombineInventoryItems` tail 3501–3543) — re-confirmed
  clean: audit written, `bumpSync_` fired, lock released in `finally` on all paths.

#### BUG · Index.html:7541 · Swipe-remove-one of a gold/delerium card silently drops the server's ADJUST ledger entry
Story: *Quick-adjust currency/delerium* + *Delete inventory item* (swipe). Since the
run-22 fix, `apiAdjustInventory` writes a RESOURCE_LEDGER `ADJUST` row and returns a
sanitized `ledgerEntry` whenever the adjusted row is `currency` or `delerium crystal`
(Code.js:3648–3665, 3684–3695). The swipe-decrement path
(`runner.apiAdjustInventory({ delta: -1, … })`, Index.html:7556) reaches the success
handler at 7530–7544, which calls `updateInventoryRowFromServer(res.item)` and
`bustInventoryCache()` but **never consumes `res.ledgerEntry`** and never updates
`inventoryResourceLedger`. So swiping one off a gold or delerium card decrements the
on-card total optimistically, the server records the ledger line, but the Gold/Delerium
tab's ledger list does not show it until the next full `loadInventory` reload — the
ledger view and the sheet are transiently inconsistent (and a 1-gold/1-crystal change
is left unexplained in the visible history). Fix: in the 7530 success handler, mirror
`confirmQuickEdit`'s `finishSuccess` (7241–7243) — `if (res.ledgerEntry) inventoryResourceLedger = [res.ledgerEntry, ...(inventoryResourceLedger||[])].slice(0,60)` and re-cache. (No data loss; the entry is persisted server-side.)

#### RISK · Code.js:3636 · Delerium quick-adjust size change merges two crystal sizes onto one row
Story: *Quick-adjust currency/delerium*, delerium branch. When the quick sheet's size
dropdown differs from the row's current size, `apiAdjustInventory` (3636–3639) and
`apiSetItemQuantity` (3746–3751) rename the row to `Delerium <NewSize>` **while keeping
`oldQty + delta` (or the set `qty`) as the quantity**. The row's pre-existing units were
of the old size, so e.g. a row of 5 Delerium Chips + "add 2" with the dropdown switched
to "shard" becomes "Delerium Shard ×7" — the 5 chips are silently reclassified as shards,
and the ADJUST ledger entry's `subtype` is the new size (3655/3767), so the audit trail
records only the delta, not the 5-unit reclassification. The size dropdown defaults to the
current size, so this only fires on a deliberate change, but the editor presents
"change size" and "add/remove N" as one Confirm with no warning. Consider: when the chosen
size differs from current and `oldQty > 0`, either split into a new row of the new size
(qty = delta) or block the combined operation and require an explicit move.

#### IDEA · Index.html:7049 · Client never routes health potions to quick-edit despite full server support
Story: *Quick-adjust currency/delerium*. Server `classifyQuickEdit_` (Code.js:1805) returns
`'health potion'` for `health potion`/`potion of healing` rows, `apiGetCurrencyQuickEdit`
surfaces that `editType`, and `openQuickEditPanel` even has a `'Quick Potion'` heading branch
(Index.html:7102). But the client gate `getQuickEditType` (7049) has **no health-potion
branch**, so `openInventoryPrimaryAction`/`selectInventoryItem` (6463/6479) send a
healing-potion tap to the full description sheet instead of a quick +/- adjuster. The two
classifiers are otherwise kept in lockstep (they share the platinum/gold/delerium regexes
verbatim) — the potion case is the lone divergence. If quick-adjusting potion counts is
desired (the server plumbing implies it was), add the `health potion` branch to
`getQuickEditType`; otherwise the server branch + 'Quick Potion' heading are vestigial.

#### Note · Code.js:3597 · Quick-adjust write path is otherwise sound
Traced *Quick-adjust currency/delerium* end-to-end against `apiAdjustInventory` /
`apiSetItemQuantity`: lock acquired with `tryLock(10000)` and released in `finally` on
success/validation-failure/auth-failure; `requireAllowedUser_` gates before the lock;
`validateId_`/`validateQuantity_`/`validateText_` run before any write; `Total Value GP`
recomputed from the new qty; ledger written only for currency/delerium and only when qty
actually changes (`apiSetItemQuantity` 3759); both return the sanitized row + ledger entry
which `confirmQuickEdit.finishSuccess` correctly applies. Client-side `_inFlightWrites`
bracketing defers the 20s sync poll across the round-trip; the double-tap guard and the
verify-handler item-mismatch guard hold. Utilities `ensureInventoryHeaders_`,
`fillMissingInventoryRarity_`, `findInventoryRowById_`, `normalizeForClient_` reviewed — no
behavioral issues.

### 2026-06-20 (run 45) — Sections audited: 6

Section 6 = Code.js lines 2901–3500 (batch sell, give, remove). The range holds
the tail of `apiSellInventoryItem` (2858), `apiSellDelerium` (2913),
`apiSplitGold` (2998), `apiSendGoldToMember` (3136), `apiUpdateInventory` (3220),
`apiDeleteInventory` (3311), `apiUndoMemberSend` (3384) and
`apiCombineInventoryItems` (3422), plus the adjacent quick-edit writers
`apiAdjustInventory` (3597) / `apiSetItemQuantity` (3717). Client handlers traced
in full: `confirmCombineInventoryItem` (Index 3369), `giveItemToCharacter` (5609),
`confirmPayWithReason` (5668), `splitGold` (5766), `undoResourcePay` (6326),
`saveInventoryEdits` (7372) and `deleteSelectedInventory` (7464), plus
`sellDelerium` (4812).

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every write path):

- **Pay gold → route to Purchase or character** (`apiSendGoldToMember` /
  `apiDepleteResource`) via `confirmPayWithReason` — found the TDZ BUG below;
  the entire pay flow throws synchronously before any server call.
- **Split gold evenly** (`apiSplitGold`) via `splitGold` — clean. Optimistic
  pending ledger entry added, removed on both success and failure, inputs saved
  to `savedAmount`/`savedNote` and restored on `!ok` and on failure. Server
  float math (`perMember` floor + rounded remainder) nets to zero. Double-tap is
  not explicitly guarded but the second call just produces another valid split;
  no state corruption. `_inFlightWrites` brackets the round-trip.
- **Undo last pay** (`apiUndoMemberSend` member path / `apiDeleteInventory`
  reverseLedgerEntry purchase path) via `undoResourcePay` — clean. Optimistic
  row+ledger removal snapshotted to `previousRows`/`previousLedger`,
  `rollback()` restores both and re-shows the Undo button on failure;
  `resourcePayInFlight` guards double-tap; server deletes rows in descending
  row order and reverses both ledger entries. README TODO about undo not
  reversing the ledger appears stale for this path.
- **Edit inventory item → Save** (`apiUpdateInventory`) via `saveInventoryEdits`
  — clean. Buttons disabled during flight and re-enabled on both handlers;
  local row updated only on success; failure leaves the form intact for retry.
- **Delete / swipe-remove inventory item** (`apiDeleteInventory` /
  `apiAdjustInventory` decrement) via `deleteSelectedInventory` — clean.
  `previousRows` snapshot restored on `!ok` and failure; qty>1 confirm gate;
  decrement vs full-delete branch correct; `_inFlightWrites` bracketed.
- **Combine duplicate** (`apiCombineInventoryItems`) via
  `confirmCombineInventoryItem` — clean. `pendingCombineChoice` nulled before
  the call (double-tap returns early), restored on failure with the combine
  sheet left open for retry; success filters source row + merges target.
- **Give item to character** (`apiUpdateInventory` holder) via
  `giveItemToCharacter` — clean. `item`/`idx`/`oldHolder` captured before
  `closeInventoryPanels(false)` nulls the selection; optimistic holder change
  reverted on both `!ok` and failure; `saving` pulse class removed on settle.
  (Rollup-row limitation is a documented README TODO, not re-reported.)
- **Sell crystals** (`apiSellDelerium`) via `sellDelerium` — clean.
  `previousRows`/`previousLedger` snapshots, optimistic negative rows removed
  on every outcome, `refreshDeleriumStateFromInventory_` recomputes counters so
  a double-tap computes 0 qty and bails; 0 gp inline confirm path intact.

#### BUG · Index.html:5695 · `confirmPayWithReason` references `const isPartyScope` before its declaration (TDZ) — Pay gold flow is dead

Story: **Pay gold** (Gold tab → Pay → amount + note → route to Purchase or
character → confirm). `confirmPayWithReason(reason)` (Index 5668) builds the
optimistic pool-deduct inventory row at lines 5693–5697:

```js
inventoryRows = [{
  'Inventory ID': optGoldPayId, ...
  'Qty': String(-amount), 'Holder': isPartyScope ? '' : goldSheetScope,  // line 5695
  ...
}, ...inventoryRows];
```

but `isPartyScope` is declared with `const` only at line 5751
(`const isPartyScope = goldSheetScope === 'party';`), 56 lines later. The single
`const` binding in this function block is in the temporal dead zone at line
5695, so reading it throws `ReferenceError: Cannot access 'isPartyScope' before
initialization`. The GAS webview runs raw ES6 (IFRAME sandbox, no transpile), so
the browser enforces TDZ.

Effect: tapping **Purchase** or any **character** in the pay-reason sheet
(`onclick="confirmPayWithReason(...)"`, Index 5116/5121) throws synchronously
**before** the optimistic UI update and before either `apiSendGoldToMember` or
`apiDepleteResource` is invoked. No ledger entry, no row, no server call, and no
visible error — the sheet just sits open (the error is swallowed to the
console). The entire Pay-gold story is unreachable. Failure-at-step,
navigate-away and double-tap analysis are all moot because step 1 never fires.

Note the sibling `receiveGold` flow declares `const isPartyScope` at line 5031
*before* its first use (5046/5095) and works correctly — the fix is to move the
`isPartyScope` declaration in `confirmPayWithReason` up to just after the
`amount`/`note` reads (before line 5693), mirroring `receiveGold`.

#### Note · Code.js:2858 · `apiSellInventoryItem` is an orphaned write path

`apiSellInventoryItem` (single-item sell: appends a Gold row then deletes the
source row) is not referenced anywhere in Index.html — the **Sell item** and
**Remove item** description-sheet stories both route through
`apiSellInventoryBatch` (Code.js 663, FIFO drain, audited in section 4). Traced
for completeness: the function appends the gold row before deleting
`found.rowNumber`, so the delete row number is unaffected by the append, and the
lock is released on all paths. Behaviorally sound but dead from the client; not
re-reportable as a bug, flagged only so a future reader doesn't assume the
description-sheet Sell button hits it.

### 2026-06-20 (run 44) — Sections audited: 5

Section 5 = Code.js lines 2301–2900 (delerium, custom inventory, notes). The
range holds `apiAddCustomInventory` (2290), `apiQuickAddInventory` (2389),
`apiDepleteResource` (2530), `apiUpdateLedgerNote` (2662), `apiReceiveResource`
(2718, gold + delerium branches), `apiSellInventoryItem` (2803) and
`apiSellDelerium` (2858). Client handlers traced in full: `receiveDelerium`
(Index 4692), `sellDelerium` (4792), `addInventoryItem` unified add/quick/custom
(7684), `confirmQuickEdit` quick-edit sheet (6820), `payResource` dashboard pay
(6210), `updateLedgerNoteFromBottom` (5959), plus the sync poll (3848) and
`loadInventory` (3568) for the cross-cutting traces.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every write path):

- **Add custom item** — `addInventoryItem` (isCustomAdd) → optimistic row +
  `clearAddForm` → `apiAddCustomInventory`. Happy: opt row removed, real row
  primed (dedup by ID), duplicate-combine suggestion offered. Failure (both
  `!ok` and failure handler): opt row pulled, full form restored from
  `payloadSnapshot`/`selectedSnapshot`, retry works. Clean.
- **Add custom/library/quick item — scroll + delerium-size restore** —
  verified the failure path re-runs `fillAddFormFromEquipment(selectedSnapshot)`
  which re-activates `quickAddSizeField` for delerium and re-derives the size,
  then line 7769/7806 overrides with `capturedSize`; scroll mode restored at
  7770/7807. No content loss on retry. Clean.
- **Quick-adjust currency/delerium** — `openQuickEditPanel` (6691) →
  `confirmQuickEdit` (6820) → `apiAdjustInventory`/`apiSetItemQuantity` (outside
  range). Found the cross-item stale-handler BUG below.
- **Quick-add from library (currency/delerium)** — `apiQuickAddInventory`:
  ledger entry written before inventory row; returns `item` + `ledgerEntry`.
  Client prepends ledger, primes row. See ordering RISK below.
- **Receive crystals** — `receiveDelerium` → optimistic +qty rows + pending
  ledger → counters reset via `refreshDeleriumStateFromInventory_` (blocks
  double-tap: 2nd tap computes 0 items → returns) → `apiReceiveResource`
  (delerium branch). Success removes opt rows + pending, primes server rows,
  prepends `ledgerEntries`. Both failure handlers restore `previousRows`/
  `previousLedger` and the saved note. Navigate-away (close sheet mid-flight):
  handlers mutate global state + hidden DOM only; on return counters re-derive
  from inventory. Clean.
- **Sell crystals** — `sellDelerium` → optimistic −qty rows + pending ledger →
  `apiSellDelerium` (treasurer-gated). 0 gp inline confirm (4807) re-invokes
  `sellDelerium(true)`; confirm prompt lives in `deleriumSheetActions`, which the
  sync poll does not re-render, so it survives a background reload. Rollback
  symmetric on both error branches. Double-tap blocked (counters reset to
  reduced stock). Clean.
- **Receive gold** — `apiReceiveResource` gold branch: appends row then ledger,
  returns single-element `ledgerEntries` + `addedItems`. Traced previously
  (run 43); re-confirmed server side here.
- **Pay gold (dashboard breakout)** — `payResource` (6210) → `apiDepleteResource`.
  Non-optimistic; double-tap guarded by `resourcePayInFlight`. Found the
  `_inFlightWrites` omission RISK below.
- **Edit ledger note (gold/delerium)** — `updateLedgerNoteFromBottom` (5959) →
  `apiUpdateLedgerNote` (2662). Match by Inventory ID (entryId) preferred,
  Timestamp fallback (known deferred limitation for same-second multi-size
  delerium sells). On success the in-memory entry's `Notes` is patched by the
  same ID/timestamp key. Navigate-away: `closeGoldSheet`/`closeDeleriumSheet`
  call `cancelLedgerEdit`; handler re-runs it harmlessly. Clean.
- **Sell item (description sheet, single)** — `apiSellInventoryItem` (2803):
  validates ID, appends gold row + ledger ADD when goldAmount>0, deletes source
  row. Clean read-before-delete via `getInventoryRowObjectById_`.

#### ~~BUG · Index.html:6844 · Stale quick-edit success handler closes/corrupts a reopened panel for a different item~~ FIXED
Story: **Quick-adjust currency/delerium**, at the Confirm step. `confirmQuickEdit`'s
`finishSuccess` unconditionally calls `updateInventoryRowFromServer(res.item)`,
writes its status message into `getQuickStatusElement()`, and calls
`closeQuickEditPanel()` — with no check that the panel still belongs to the item
that was submitted. This is reachable because `closeQuickEditPanel` (6797) clears
`quickEditInFlight = false`, which re-opens the `if (quickEditInFlight) return;`
gate in `openQuickEditPanel` (6692). Sequence: tap Gold card → Confirm (write in
flight, `quickEditInFlight=true`) → tap backdrop/Done to close (`quickEditInFlight`
→ false, `selectedQuickEdit=null`) → tap Delerium card → panel B opens for the new
item → the first write's `finishSuccess` fires and (a) applies the gold update to
item A's row [fine], (b) writes a green "Saved" into panel B's status element, and
(c) force-closes panel B via `closeQuickEditPanel()`, discarding the user's
in-progress edit on item B. Panel B's own `apiGetCurrencyQuickEdit` handler then
no-ops because `selectedQuickEdit` is now null. Contrast: `openQuickEditPanel`'s
verify handler (6735) DOES guard with `selectedQuickEdit.itemId !== row['Inventory ID']`.
Fix: add the same identity guard to `finishSuccess`/`fail` (capture the submitted
`itemId` in a closure and bail if `selectedQuickEdit?.itemId` no longer matches),
or stop clearing `quickEditInFlight` inside `closeQuickEditPanel` so a panel cannot
be reopened while a confirm is still in flight.

#### ~~RISK · Index.html:6210 · `payResource` is the only write path that omits the `_inFlightWrites` guard~~ FIXED
Story: **Pay gold** (dashboard `renderResourceBreakout` Pay button, 5821; also the
delerium dashboard pay). Every other write path in the app brackets its
`google.script.run` call with `_inFlightWrites++ … _inFlightWrites--`
(receiveDelerium 4739, sellDelerium 4851, confirmQuickEdit 6842, addInventoryItem
7748, updateLedgerNoteFromBottom 5973, etc.). `payResource` (6210) never touches
the counter. That counter is the documented in-flight protection: the sync poll
defers a foreign reload only when `_inFlightWrites > 0` (3853) and `loadInventory`
discards a fetch result mid-write only when `_inFlightWrites > 0` (3623). With
`payResource` in flight the counter is 0, so a teammate's inventory write arriving
during the pay round-trip triggers an immediate `loadInventory(true)` instead of
being deferred. It currently converges (the path is non-optimistic and
`primeInventoryCacheAfterAdd` dedups by Inventory ID), so no corruption is
observed today — but it defeats a stated invariant and would silently lose state
the moment this path gains an optimistic row or runs alongside another foreign
write. Fix: bump/decrement `_inFlightWrites` symmetrically in `payResource`'s
success and failure handlers, matching every sibling write.

#### ~~RISK · Code.js:2470 · Ledger-before-row append order can strand a phantom ledger entry~~ FIXED
`apiQuickAddInventory` (appendResourceLedger_ 2470 → sheet.appendRow 2473) and
`apiDepleteResource` (appendResourceLedger_ 2604 → sheet.appendRow 2605) write the
RESOURCE_LEDGER entry *before* the inventory row. Because `appendResourceLedger_`
swallows its own errors (noted TODO) and the gold/delerium balances are computed
from inventory rows — not the ledger — an `appendRow` failure leaves a committed
ADD/PAY ledger entry with no matching inventory row. After the next reload the
ledger shows the transaction but the balance does not reflect it (balance ends up
*higher* than the ledger implies for a PAY). `apiReceiveResource` does the safe
order (row first, then ledger). Fix: append the inventory row first in
`apiQuickAddInventory` and `apiDepleteResource`, or make `appendResourceLedger_`
surface failures so the whole op can be rolled back/reported.

#### Note · Code.js:2718 · Delerium/custom/quick-add/ledger-note write paths trace clean
Stories **Add custom item**, **Receive crystals**, **Sell crystals**, **Receive
gold**, **Edit ledger note (gold & delerium)**, and **Sell item (single)** were
traced end-to-end (happy/failure/navigate-away) with no rollback, stuck-state, or
double-tap defects beyond the items above. Optimistic delerium receive/sell roll
back symmetrically on both `!res.ok` and `withFailureHandler`, counters self-reset
to block double submission, and the 0 gp inline-confirm prompt survives background
sync because it renders into the actions area the poll never repaints.

### 2026-06-19 (run 43+) — UX improvements applied

- **Fix 1** (suppress identical-dupe combine prompt): after a successful add, `showCombineChoice` is now skipped when `res.item` and the matching candidate have the same Holder and Value GP. Same-value quick-adds (e.g. five Potions of Healing) no longer interrupt the flow.
- **Fix 2** (Scrolls inventory group): `getInventoryGroupKey` routes items whose category contains "scroll" or whose name matches `/\bscroll\b/` to a new **Scrolls** group rendered between Accessories and Potions. Holy Water, Alchemist's Fire, Antitoxin, and Acid Flask are routed to Potions. `buildSellBatchGroups` and the party-pool copy function match.
- **Fix 3** (optimistic gold balance): `receivedGold` and `confirmPayWithReason` now prepend a temporary Gold inventory row (positive/negative Qty) so `getGoldBreakout` and the "Gold = XXX gp" header update immediately — same as delerium. The row is removed on success (replaced by the real row) or failure (rollback).
- **Fix 5** (server auto-combine on add): `findMatchingInventoryRow_` and `mergeIntoExistingRow_` added to `Code.js` after `writeInventoryRow_`. Both `apiAddInventory` and `apiAddCustomInventory` now check for an exact Item/Category/Rarity/Holder/Value GP match before appending; if found, Qty is incremented in-place and the merged row returned as `res.item` with `combined: true`. Client `primeInventoryCacheAfterAdd` already handles this by matching on `Inventory ID`.

### 2026-06-19 (run 43) — Sections audited: 4

Section 4 = Code.js lines 1701–2300 (sell, combine, gold ops). The named range
holds the ledger/audit backbone (`appendResourceLedger_` 1816,
`deleteResourceLedgerRowsForInventory_` 1843, `auditWrite_` 1786), the
inventory read (`apiGetInventory` 1938), sync (`bumpSync_` 1976,
`apiGetSyncState` 1986), the notes write APIs (`apiCreateNote`/`apiUpdateNote`/
`apiArchiveNote` 2087–2179), and `apiAddInventory` 2181. The actual sell/
combine/gold-ops endpoints the section is themed around live just outside it and
were read in full: `apiSellInventoryBatch` (663), `apiQuickAddInventory` (2389),
`apiDepleteResource` (2530), `apiUpdateLedgerNote` (2662), `apiReceiveResource`
(2718), `apiSellInventoryItem` (2803), `apiSellDelerium` (2858), `apiSplitGold`
(2943), `apiSendGoldToMember` (3081), `apiCombineInventoryItems` (3329),
`apiDeleteInventory` (3256, undo path).

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every write path):

- **Receive gold** — `receivedGold` (Index 5000) → optimistic pending ledger
  entry + field-clear → `apiReceiveResource` → success removes pending, primes
  gold row, prepends `res.ledgerEntries`. Failure (both `!ok` and
  `withFailureHandler`) removes pending, restores amount/note, shows error.
  Field-clear-before-async guards double-tap (2nd tap reads amount='' → returns).
- **Pay gold (Purchase / member)** — `openPayReasonSheet` (5071) →
  `confirmPayWithReason` (5637) routes to `apiDepleteResource` (Purchase) or
  `apiSendGoldToMember` (member). Optimistic pending entry + undo state set
  (treasurer only). Both handlers balance `_inFlightWrites`.
- **Split gold evenly** — `splitGold` (5724) → `apiSplitGold` (treasurer-gated
  client + server via `requireTreasurer_`). Full snapshot/rollback; pool deduct
  + per-member credit + remainder all conserved server-side.
- **Edit ledger note** — `selectLedgerRowForEdit` (5910) →
  `updateLedgerNoteFromBottom` (5958) → `apiUpdateLedgerNote`. Gold reuses the
  amount/note inputs (amount made readOnly); delerium uses its own note input.
- **Undo last pay** — `undoGoldPay` (4995) → `undoResourcePay` (6278) →
  `apiDeleteInventory({reverseLedgerEntry:true})` (which DOES reverse the ledger
  via `deleteResourceLedgerRowsForInventory_` — README TODO about non-reversal
  is stale). Member-send undo chains a 2nd delete for the credit row.
- **Sell item (description sheet)** — `confirmSellItem` (5159, `descActionInFlight`
  guard) → FIFO drain across rollup rows → optimistic row removal →
  `apiSellInventoryBatch` → success primes gold row + `loadInventory(true)`.
- **Sell items batch (treasurer)** — `confirmSellBatch` (5540) →
  `apiSellInventoryBatch`; 1.5s auto-close guarded by `sellBatchGeneration`.
- **Sell crystals / Receive crystals** — `sellDelerium` (4791, 0gp inline
  confirm) / `receiveDelerium` (4720) → `apiSellDelerium` / `apiReceiveResource`.
  Full snapshot rollback; `refreshDeleriumStateFromInventory_` after optimistic
  rows resets counters, which guards double-tap.
- **Combine duplicate** — `confirmCombineInventoryItem` (3349) →
  `apiCombineInventoryItems`. Non-optimistic ("Combining…"); failure restores
  `pendingCombineChoice` for retry.

#### ~~BUG · Index.html:6297 · Failed Undo Last Pay is silent and leaves gold sheet inconsistent~~ FIXED
Story: **Undo last pay**, failure-at-step. `undoResourcePay` optimistically
removes the deduct inventory row + ledger entry, clears `lastResourceUndo`, and
calls `apiDeleteInventory`. If the server delete fails, `rollback()` (6297)
restores `inventoryRows`, `inventoryResourceLedger`, and `lastResourceUndo`, then
calls only `renderInventory()` — it never re-renders the open gold sheet
(`renderGoldSheetBody` / `renderGoldSheetButtons`) and shows no status message.
Result: the user is looking at the gold modal, which still displays the payment
as undone (ledger entry gone, Undo button gone) even though the server kept the
payment and the in-memory data was actually restored. The discrepancy persists
until something else re-renders the sheet (scope toggle, reopen) or a reload. Fix:
in `rollback()`, also call `renderGoldSheetBody()` + `renderGoldSheetButtons()`
and surface an error via `goldSheetStatus` so the failed undo is visible.

#### ~~RISK · Index.html:6318 · Member-send undo is two non-atomic deletes — partial failure creates gold~~ FIXED
Story: **Undo last pay** (member-send variant). `undoResourcePay` for a
member-send deletes the pool/personal deduct row first, then — on success —
chains a second `apiDeleteInventory` for the recipient credit row (6318). If the
first delete succeeds but the second fails, the deduct is gone while the credit
remains: net party gold increases by the sent amount (money created from
nothing). The code recovers by `loadInventory(true)`, which faithfully reloads
the corrupted server state rather than fixing it — the accounting error is now
real and silent. There is no transaction wrapping the two row deletes. Consider a
single server endpoint that reverses both rows under one lock (and one ledger
reversal), so undo is atomic.

#### ~~RISK · Index.html:4967 · Gold sheet enters note-edit mode for any resource, not just gold~~ FIXED
`renderGoldSheetButtons` (4964) gates note-edit UI on `if (ledgerEditTarget)`
with no `ledgerEditTarget.resource === 'gold'` check — unlike its delerium
counterpart `renderDeleriumSheetActions` (4457), which correctly checks
`resource === 'delerium'`. `openGoldSheet` (4424) also does not reset
`ledgerEditTarget`. So a `ledgerEditTarget` left dangling from a delerium note
edit would push the gold sheet into "Editing note … gp / Update Note" mode for a
delerium entry; tapping Update Note then writes with `resource:'delerium'` and
the (stale) `deleriumSheetNote` value. Today both `closeGoldSheet` and
`closeDeleriumSheet` cancel the edit on their explicit Done buttons, so the
dangling state is hard to reach (no backdrop-close on these sheets) — hence RISK
not BUG — but the asymmetric guard is a latent defect. Fix: add the
`resource === 'gold'` check in `renderGoldSheetButtons`, and clear
`ledgerEditTarget` in `openGoldSheet`/`openDeleriumSheet`.

#### ~~IDEA · Index.html:5233 · Sell-for-gold forces a full reload that the other gold ops avoid~~ FIXED
Story: **Sell item** / **Sell items batch**, efficiency. `apiSellInventoryBatch`
(Code.js 746) returns only `{message, goldItem}` — it appends a RESOURCE_LEDGER
entry server-side but does not return it. So `confirmSellItem` (5223) and
`confirmSellBatch` (5560) must call `loadInventory(true)` (a full
inventory + 60-row ledger re-read) just to surface the new gold ledger row. By
contrast `apiReceiveResource`, `apiDepleteResource`, `apiSplitGold`, and
`apiSellDelerium` all return `ledgerEntries`/`ledgerEntry` and prepend them
optimistically with no reload. Returning the ledger entry from
`apiSellInventoryBatch` would let the sell paths skip the extra round-trip and
match the snappier feel of the other gold flows.

#### ~~RISK · Index.html:5020 · Optimistic ledger prepend + slice(0,60) silently drops the 60th entry on rollback~~ FIXED
Cross-cutting (Receive gold 5020, Pay 5659, Split 5746, Sell crystals 4840).
Each optimistic handler does `ledger = [pending, ...ledger].slice(0, 60)`. When
the in-memory ledger is already at the 60-entry cap, prepending the pending entry
and slicing drops the oldest real entry. On the failure path the rollback only
filters out the pending entry (`removePending`) — it does not restore the dropped
60th entry, so it vanishes from the in-memory buffer until the next
`loadInventory`. Impact is low (it is the 60th-oldest visible entry and a reload
restores it), but the rollbacks that snapshot `previousLedger` (sellDelerium,
receiveDelerium) are correct and the ones that use `removePending`
(receivedGold, confirmPayWithReason, splitGold) are not. For consistency, snapshot
`previousLedger` in those three too.

#### Note · Index.html:5000 · Clean rollback + double-submit traces on the resource write paths
Confirms full traces of **Receive gold**, **Pay gold**, **Split gold**, **Sell
item**, **Sell items batch**, **Receive/Sell crystals**, **Give item**, and
**Combine duplicate**. `receivedGold`, `splitGold`, `sellDelerium`,
`receiveDelerium`, `giveItemToCharacter`, and `confirmSellItem` all snapshot
prior state and roll back fully on BOTH `!res.ok` and `withFailureHandler`;
`_inFlightWrites` is incremented once and decremented on every terminal path
(deferring the 20s sync poll until writes settle); double-tap is guarded either
by `descActionInFlight` (sell item), `sellBatchConfirmBtn.disabled` (batch),
synchronous field-clear (receive/pay/split), or `refreshDeleriumStateFromInventory_`
resetting counters (delerium). Server endpoints release the document lock in
`finally` on all paths including auth failure. `apiSplitGold` conserves gold
exactly (pool deduct = per-member credits + remainder).

### 2026-06-19 (run 42) — Sections audited: 3

Section 3 = Code.js lines 1101–1700 (inventory write — add, edit, delete). The
named range holds the spreadsheet/row helpers (`writeInventoryRow_` 1749,
`getInventoryRowObjectById_` 1736), the validators every write path funnels
through (`validateId_` 1561, `validateText_` 1571, `validateQuantity_` 1581,
`validateMoney_` 1599, `normalizeOptionalMoney_` 1611), the sanitizers
(`sanitizeInventoryForClient_` 1654), audit/ledger writers (`auditWrite_` 1786,
`appendResourceLedger_` 1816, `deleteResourceLedgerRowsForInventory_` 1843),
`classifyQuickEdit_`/`getQuickAddDefinition_`, and the access gates
(`requireAllowedUser_` 1486, `requireTreasurer_` 1426). The actual write
endpoints these back live just outside the range and were traced in full:
`apiAddInventory` (2181), `apiAddCustomInventory` (2290), `apiUpdateInventory`
(3165), `apiDeleteInventory` (3256), `apiCombineInventoryItems` (3329).

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every write path reached):

- **Add library item / Add custom item** — `addInventoryItem` (Index 7664) →
  optimistic row (`_opt_<ts>`) prepended + cached → `apiAddInventory` /
  `apiAddCustomInventory` / `apiQuickAddInventory` → success removes optimistic
  row, `primeInventoryCacheAfterAdd` (2911) merges the real row, then
  `findDuplicateInventoryCandidate` → `showCombineChoice`. Failure (both
  `!ok` and `withFailureHandler`) removes the optimistic row, re-caches, and
  restores every form field + `selectedEquipment` + quick-add size + scroll
  mode from `payloadSnapshot`/`selectedSnapshot`. Double-submit is guarded
  implicitly: the submit handler runs `clearAddForm()` synchronously, so a
  second tap hits `if (!rawName) return`. `_inFlightWrites++` defers the poll's
  foreign reload. Clean rollback. See IDEA below (combine-after-add friction).
- **Edit inventory item** — `selectInventoryItem` (6427) /
  `syncInventoryEditorFieldsFromRow` (6890) → `saveInventoryEdits` (6976) →
  `apiUpdateInventory` (3165, partial-update via `field === undefined ?
  existing : field`). Pessimistic: local row only updated after server ok.
  See BUG (rollup desync) and RISK (mobile button id) below.
- **Delete inventory item** — `deleteSelectedInventory` (7064): swipe path
  decrements one via `apiAdjustInventory`; full-delete via `apiDeleteInventory`
  (3256). Optimistic remove with `previousRows` snapshot + full revert on
  `!ok`/failure; qty>1 edit-form delete has an inline confirm gate. Mobile
  double-tap is masked because `closeInventoryPanels(false)` closes the sheet
  synchronously.
- **Combine duplicate** — `showCombineChoice` (3326) / `confirmCombineInventoryItem`
  (3349) → `apiCombineInventoryItems` (3329). Double-tap guarded
  (`pendingCombineChoice = null` at entry); failure restores `choice` and keeps
  the sheet open for retry; client rollup key (Item|Category|Rarity, 6156)
  exactly matches the server's combine constraint (3360-3366), so a suggested
  combine never gets rejected for a key mismatch.

#### ~~BUG · Index.html:6427 · Edit/edit-delete only mutate the representative row of a multi-row rollup~~ FIXED
Story: **Edit inventory item** (and edit-form **Delete**). Cards are rendered
from `rollupInventoryRows` (6164), which visually merges every raw row sharing
`Item|Category|Rarity` into one card with the summed Qty. Combining duplicates
is *optional* (the user can tap "Keep separate"), so a card routinely fronts
several underlying `PARTY_INVENTORY` rows. Tapping/​swiping resolves the card to
a single representative row — `getInventoryIndexById(representativeId)` (6380) →
`inventoryRows[index]` — and loads only that row's `Inventory ID` into
`editInventoryId`. `saveInventoryEdits` → `apiUpdateInventory` (3165) then writes
**only the representative row**. So if a user sees "5× Potion" (rep row qty 3 +
a second row qty 2) and edits Qty to 2, the server sets the rep row to 2 and
leaves the other row at 2 — the rolled-up card now shows 4, not 2. Holder/Value/
Name edits likewise apply to one underlying row, silently desyncing the group
(e.g. the card shows two different per-unit values after a Value edit). The
edit-form Delete path is worse: the qty>1 confirm gate reads `currentQty` from
the representative row only (7070), so it warns "Removes all 3×" yet deletes
just the rep row, leaving the other 2 behind. Note this is the same class of
limitation the README already documents for "Give to…", and the description
sheet deliberately avoids it by using `apiSellInventoryBatch` FIFO across all
rollup rows. Suggested fix: when the selected card has `_rollupCount > 1`,
either (a) route qty/delete through a batch endpoint that drains all rollup rows
(like sell/remove), or (b) disable in-place qty editing on rolled-up cards and
surface "open description to adjust quantity," or (c) at minimum auto-combine
the group server-side before applying the edit.

#### ~~RISK · Index.html:6978 · In-flight button disable targets the hidden desktop button on mobile~~ FIXED
Story: **Edit inventory item** / **Delete**. `saveInventoryEdits` does
`document.getElementById('saveInventoryButton')` and
`deleteSelectedInventory` does `document.getElementById('deleteInventoryButton')`
— but those IDs exist only on the **desktop** editor buttons (2193, 2197). The
**mobile sheet** Save/Delete buttons (2404, 2407) carry no IDs. On a phone
(the primary platform), `getElementById` returns the hidden desktop button, so
`button.disabled = true` flips an off-screen element and the visible mobile
button is never disabled. For Save this leaves the mobile double-tap unguarded
→ two `apiUpdateInventory` calls fire with identical payloads. The duplicate
write is idempotent (same field values), so today the impact is limited to a
redundant round-trip and no visible "saving" disabled state on the real button;
but the guard is silently dead on mobile and would mask a real race if the
update payload ever became non-idempotent. Delete is incidentally protected
because `closeInventoryPanels(false)` closes the sheet synchronously before a
second tap can land. Fix: give the mobile buttons the same IDs (or pass the
clicked button via the onclick handler) so the disable applies where the user
actually taps.

#### ~~IDEA · Index.html:7763 · Combine prompt fires after every duplicate add even though the list already shows them merged~~ FIXED (server auto-combine + identical-dupe suppression)
Story: **Add library item / Combine duplicate**. After a successful add the
list immediately rolls the new row into the existing one (one card, summed
Qty) via `rollupInventoryRows`. The very next line still pops the combine
mobile-sheet (`findDuplicateInventoryCandidate` → `showCombineChoice`). To the
user the item already *looks* combined, yet a sheet asks them to combine — and
for repeated quick-adds (e.g. stocking five Potions of Healing one tap at a
time) the prompt reappears on every add, interrupting the flow. The combine is
only a storage-row merge with no user-visible difference once rolled up.
Suggestion: suppress the prompt for quick-add/identical-value duplicates (or
silently auto-combine same-name+same-value rows server-side at add time), and
reserve the explicit prompt for cases where merging is lossy (differing Value
GP / Holder), where the warning message actually adds value.

#### Note · Code.js:2181 · Write-path baseline is solid — locks, rollback, and poll deferral all clean
Traced add / custom-add / edit / delete / combine end-to-end. Every endpoint
acquires `LockService.getDocumentLock()` with `tryLock(10000)` *inside* the try
and releases in `finally` (wrapped so a never-acquired release is ignored), so
the lock is freed on auth-failure, validation-throw, busy-return, and success
paths alike. Client rollbacks are complete on add (optimistic row removed +
form restored), delete (`previousRows` snapshot reverted), and combine (`choice`
restored, sheet kept open). `_inFlightWrites` correctly brackets every write so
the 20 s poll's foreign reload is deferred, and `primeInventoryCacheAfterAdd`'s
`exists` check (2916) means a poll-driven reload that already inserted the real
row won't double-insert. `apiUpdateInventory`'s `field === undefined ? existing`
pattern makes partial updates (e.g. holder-only change at 5634) safe.


### 2026-06-19 (run 41) — Sections audited: 2

Section 2 = Code.js lines 501–1100 (auth, character, inventory read). The named
range holds the equipment readers (`apiSearchEquipment` 587, `apiGetEquipmentIndex`
624, `apiGetEquipmentItem` 647), `apiSellInventoryBatch` (663 — a *write* path
that lives here and backs three client flows), the character/identity APIs
(`apiGetCharacters` 754, `apiGetMyCharacter` 822, `apiSetMyCharacter` 851,
`apiForgetMyCharacter` 860), and the quick-add/category readers. I traced each
through its supporting helpers (`requireAllowedUser_` 1486, `requireTreasurer_`
1426, `resolveIdentityForCharacter_` 1274, `validateCharacterChoice_` 1368,
`getEmailForCharacter_` 1441, `apiGetInventory` 1938) and its client callers.

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine on every write path reached):

- **Identity / first open** — `loadMyIdentity` (4326) → `apiGetMyCharacter`
  (822) → `applyIdentity` (4287); selection via `confirmIdentity` (4390) →
  `apiSetMyCharacter` (851) → `validateCharacterChoice_` (1368). Double-tap
  guarded by `identityChoiceSaving`; optimistic apply survives a failed save
  (localStorage already written, hint re-resolves next load). See RISK below
  (hint path skips the active-character check that the save path enforces).
- **Sell item / Remove item (description sheet)** — `confirmSellItem` (5159)
  and `confirmDescRemove` (6563) → `apiSellInventoryBatch` (663). Both guard
  re-entry with `descActionInFlight`, snapshot `previousRows`, update
  optimistically, and revert on `!ok`/failure. `_inFlightWrites` defers the
  20 s poll's foreign reload (`pollSync` 3848 → `pendingForeignReload`), and
  `loadInventory` bails at 3623 when a newer write is in flight — optimistic
  state survives navigate-away. Clean.
- **Sell Items batch (treasurer)** — `confirmSellBatch` (5522) →
  `apiSellInventoryBatch` (663). Sheet-local status + disabled button instead
  of optimistic row removal; 1.5 s auto-close uses `sellBatchGeneration`. See
  RISK below (server endpoint is not treasurer-gated).
- **View item details / description sheet load** — `apiGetEquipmentItem` (647)
  with `capturedId` guard (6508/6514) so a stale fetch for a since-closed item
  is ignored; failure leaves cache un-poisoned (null not cached). Clean.
- **Add library item: search** — backed by `apiGetEquipmentIndex` (624) loaded
  once and filtered in-memory (`loadEquipmentIndex` 7162); `apiSearchEquipment`
  (587) has no client caller. Cache-paint + background-refresh degrades to
  "showing cached library" on failure; no stuck spinner.
- **Give item to character / holder dropdowns** — `apiGetCharacters` (754)
  feeds `populateCharacterSelectors`; `giveItemToCharacter` (5578) traced
  (optimistic holder swap + revert) — server write is in section 6, deferred.

#### RISK · Code.js:838 · `apiGetMyCharacter` trusts the client hint without the active-character check
When the temp-key profile and email both fail to resolve, the handler falls
back to `resolveIdentityForCharacter_(clientCharacterHint)` (839). That helper
(1274) does no validation — it `safeText_`'s the name, reverse-looks-up an
email, and derives `isDM`/`isTreasurer` purely from the string. The *write*
path `apiSetMyCharacter` → `validateCharacterChoice_` (1368) explicitly rejects
names that aren't present-and-active in CHARACTERS, but the read path does not.
Consequence: a player whose character is later deactivated (or renamed) keeps a
fully-working identity from their stale `localStorage` hint indefinitely —
contradicting the stated "inactive characters excluded" invariant. Story:
*Identity / returning visit*. Severity low (the hint originated from a once-valid
confirm, and treasurer **writes** still re-gate via `requireTreasurer_`), but the
identity the UI shows/uses is not revalidated against the roster. Suggested fix:
have `apiGetMyCharacter` run the hint through the same active-character check
(`validateCharacterChoice_`-style) before accepting it, returning `character:null`
when the hinted character is no longer active.

#### Note · Code.js:663 · `apiSellInventoryBatch` treasurer gate is intentionally UI-only (by design)
The endpoint calls `requireAllowedUser_()` (667) but not `requireTreasurer_`.
The "Sell Items" batch button is only rendered for `isTreasurer` (renderInventory
3839). The per-item Sell/Remove paths intentionally share this endpoint and are
open to all players — individual characters can sell their own items. The batch
flow is treasurer-only in the UI, which is the appropriate enforcement boundary
for a trusted-player campaign tool. No server-side gate needed.

#### Note · Code.js:663 · `apiSellInventoryBatch` FIFO row-shift + lock handling is correct (positive baseline)
Stories *Sell item*, *Remove item*, *Sell Items batch* traced through this
endpoint. Two things done right and worth recording so a future refactor
doesn't regress them: (1) all rows are resolved to `{rowNumber,…}` *before* any
mutation, then processed `sort((a,b) => b.rowNumber - a.rowNumber)` descending,
so a `deleteRow` only shifts already-processed higher rows — partial-sell qty
writes and deletes stay aligned. (2) `tryLock(10000)` failure returns *without*
entering the `finally` release (lock was never held), and the `finally`'s
`releaseLock` is wrapped in `try/catch`, so no path double-releases or leaks the
document lock — including the auth-failure throw from `requireAllowedUser_`.

#### Note · Code.js:822 / Index.html:4390 · Identity state machine survives failure + navigate-away (clean trace)
Story *Identity / first open + selection* traced end-to-end. `confirmIdentity`
(4390) blocks double-tap via `identityChoiceSaving`, writes `localStorage` and
applies the optimistic identity before the round-trip, and on `apiSetMyCharacter`
failure surfaces an error while *keeping* the working local identity (no lockout,
no reload needed). `applyIdentity` returning `false` for a null-character server
response leaves any already-applied cached identity intact and only shows the
picker when `!myCharacterName`. No stuck in-flight flag, no lost selection.

### 2026-06-19 (run 40) — Sections audited: 1

Section 1 = Code.js lines 1–500 (config, helpers, validation). This range is
almost entirely declarative config + admin/editor-only utilities + the web-app
entry point; only a small slice executes inside catalog user stories. Read
in-range (`CONFIG`, the `*_HEADERS` schemas, `APPROVED_INVENTORY_CATEGORIES`,
`DELERIUM_SIZE_VALUES`, `QUICK_ADD_ITEMS`, `onOpen`/setup/health-check/clean-library
admin functions, `doGet`/`include_`) plus the cross-referenced surfaces that carry
section-1 config into stories: `apiGetCategories`/`apiGetQuickAddItems` (880/889),
`apiSellInventoryBatch` (669), the core validators `safeText_`/`validateText_`/
`validateQuantity_`/`validateMoney_` (1244/1606/1616/1634), and the client mirrors
(`QUICK_ADD_ITEMS` 2856, `DELERIUM_SIZES` 2794, the delerium `<select>` options).

Stories traced (happy → failure-at-step → navigate-away → friction, plus
execution-trace + state-machine where a write path is reached):

- **All stories — page load** via `doGet` (247) + `include_` (255). Single entry
  for every story. See RISK below (no error isolation).
- **Add library item (quick-add variant)** — `apiGetQuickAddItems` (889) surfaces
  the server `QUICK_ADD_ITEMS` (53) to the client buttons; client keeps a hardcoded
  mirror (2856) overwritten at boot (2924). Verified server↔client parity (name /
  category / rarity / valueGp all reconcile; server strips `editType` but it is
  re-resolved server-side from `quickKey` via `getQuickAddItem_` 1814, so the client
  never needs it). No divergence.
- **Add custom item / Edit inventory item** — `apiGetCategories` (880) returns
  `APPROVED_INVENTORY_CATEGORIES` (30) for the category dropdown; `{ok, rows}`
  contract matches the client reader. Clean.
- **Delerium receive/sell** — server `DELERIUM_SIZE_VALUES` (43, lowercase) is the
  validation gate (2662/2789/3776). Confirmed the client `DELERIUM_SIZES` (2794) and
  every `<select>` option (2320/6313) are lowercase and identical; the capitalized
  `LOOKUPS` "Delerium Types" rows (358) are spreadsheet-only and never compared
  against the gate. No case-mismatch bug.
- **Sell item / Remove item / Sell item batch** — these reach the in-range header
  schema `INVENTORY_HEADERS` (86) via the gold-row writer in `apiSellInventoryBatch`
  (732–738); confirmed the gRow keys all 18 headers exactly. (The endpoint body lives
  at 669–758, section-2 territory; not re-audited here.)

#### ~~RISK · Code.js:247 · `doGet` has no error isolation — any template/include failure takes the whole app down for every story~~ FIXED
Cross-cutting: **page load** for every catalog story. `doGet` builds the page with
`HtmlService.createTemplateFromFile('Index').evaluate()` and `Index.html:6` contains
one server scriptlet `<?!= include_('Wallpaper'); ?>` → `include_` (255) does
`createHtmlOutputFromFile('Wallpaper').getContent()`. There is no try/catch anywhere
on this path. If the `Wallpaper` file is renamed/removed, or its content errors, or
the template evaluation throws for any reason, `evaluate()` throws and every visitor
gets a raw GAS error page instead of the app — no story can even begin. Probability
is low today (Wallpaper is static HTML and present), but the sole entry point for the
entire app has zero fallback. Fix: wrap the template build in try/catch and return a
minimal static `HtmlOutput` ("Inventory is temporarily unavailable — reload") on
failure, so a single bad include degrades gracefully instead of hard-failing load.

#### IDEA · Code.js:427 · Admin equipment-library import shares the document lock with player writes, locking out all sells/adds for up to ~4.25 min
`continueCleanEquipmentLibrary` takes `LockService.getDocumentLock()` (427) and holds
it across a batch that intentionally runs up to `maxRuntimeMs = 4.25 min` (434).
Player write endpoints contend on the same document lock with short tries —
`apiSellInventoryBatch` does `lock.tryLock(10000)` (674) and returns
`{ok:false, error:'Server busy, please try again.'}` on timeout. So while a DM/admin
runs a library import batch from the editor, **Sell item / Remove item / Sell batch /
Add / quick-adjust** (any endpoint on the shared doc lock) fail with "Server busy" for
the whole batch window. It's intentional maintenance and rare, but undocumented as a
player-facing outage window. Suggestion: run imports during downtime, or scope the
import to a narrower lock (e.g. a dedicated PropertiesService flag) so player writes
aren't starved; at minimum note the window in HANDOFF/README so it isn't mistaken for a
sync bug.

#### Note · Code.js:1244 · Core validators/helpers and section-1 config are clean across all write stories
Positive baseline. `safeText_` (1244) maps null/undefined→'' and otherwise
`String(value).trim()` — numeric `0`→`'0'` (not dropped), Dates stringify safely;
no data is silently lost. `validateQuantity_` (1616) rejects non-finite input
(`Number(undefined)`→NaN throws "Quantity must be numeric") and range-checks min/max;
`validateText_` (1606) length-guards and returns trimmed text; `validateMoney_`/
`normalizeOptionalMoney_` (1634/1646) pass `''` through and reject negatives. These
thread through every write story (Add, Edit, Sell, Gold, Delerium, Notes) and handle
empty/0/NaN correctly — bad input surfaces as a clean `!res.ok` the client can retry,
not a corrupt write. Config constants (`QUICK_ADD_ITEMS`, `APPROVED_INVENTORY_CATEGORIES`,
`DELERIUM_SIZE_VALUES`, the `*_HEADERS` schemas) are internally consistent and match
their client mirrors. `PARTY_NOTES_SHEET`/`PARTY_CAMPAIGN_NOTES_HEADERS` referenced by
`setupInventoryTabs`/`resetAppDataSheets` (272/299) are defined later (2253/2246) but
GAS evaluates all top-level `const`s at script load before any function body runs, so
there is no ReferenceError.

### 2026-06-19 (run 39) — Sections audited: 13

Section 13 = Index.html lines 7501–end (add item flow, custom item, form
handling). Read in-range plus the cross-referenced flow helpers:
`pollSync`/`loadInventory` (4359 / 4079), `cacheInventoryRows`/
`primeInventoryCacheAfterAdd` (2939 / 2950), `findDuplicateInventoryCandidate`/
`showCombineChoice`/`confirmCombineInventoryItem` (3423–3487), `setCommandMode`/
`handleSearchInput`/`handleCommandSearchInput` (3206 / 4050 / 3281).

Note: much of this section was traced in run 5 (FINDINGS ~1420) when
`addInventoryItem` did **not** bump `_inFlightWrites`. The code has since changed
— `addInventoryItem` (8240/8243/8279), `saveInventoryEdits` (7488/7491/7503),
and `deleteSelectedInventory` (7622/7625/7641) now all bracket their round-trips
in `_inFlightWrites`. That re-introduces the leak class discussed below, so the
"immune" framing of run 5 is partially outdated for the Add path.

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Add library item** (search → `selectEquipmentResult` 7860 → `addInventoryItem`
  8176 → optimistic `_opt_` row → server confirm → combine suggestion). Optimistic
  row removed by `optId` filter on all three terminal branches; both failure
  branches restore `selectedEquipment` + every form field from snapshots incl.
  scroll-spell reconstruction; combine fires only on success-ok via
  `findDuplicateInventoryCandidate(res.item)`. Double-submit blocked by the
  synchronous `clearAddForm()` emptying `#item`. Clean within scope — see the
  cold-load recursion BUG (search step) and the `_inFlightWrites`-freeze RISK.
- **Add custom item** (`startCustomItem` 8039 / `customizeSelectedItem` 8067 →
  `addInventoryItem` via `apiAddCustomInventory`). Same optimistic machinery;
  clean.
- **Edit inventory item** (`saveInventoryEdits` 7475 → `apiUpdateInventory`).
  Non-optimistic; patches the row by id on success only, re-enables the button on
  both paths, retryable. Clean (the single-arg `cacheInventoryRows` ledger
  fallback is safe, as logged in run 5).
- **Delete inventory item** (`deleteSelectedInventory` 7563, incl. swipe
  `decrementOnly` path 7548 and qty>1 "Confirm delete all" gate 7578).
  `previousRows` snapshot restored on both `!res.ok` and transport failure;
  button never stuck (renderInventory recreates it). Clean.
- **Combine duplicate** (`confirmCombineInventoryItem` 3455). `pendingCombineChoice`
  restored on both failure branches, sheet kept open for retry, `_inFlightWrites`
  paired. Clean.

#### ~~BUG · Index.html:7774 · `searchEquipment` ⇄ `loadEquipmentIndex` infinite mutual recursion during a cold (uncached) library load~~ FIXED
Story: **Add library item**, the *search* step, under failure/timing. When the
equipment index has not yet loaded but a fetch is already in flight
(`equipmentIndexLoaded === false && equipmentIndexLoading === true`), typing in
the search box stack-overflows. Trace: `searchEquipment` (7769) tests
`if (!equipmentIndexLoaded) { loadEquipmentIndex(); return; }` (7774) **before**
anything else (even before the `q.length < 2` branch). `loadEquipmentIndex` with
the default `preloadOnly=false` computes `shouldPaintSearchUi = true`, hits the
`if (equipmentIndexLoading) { if (shouldPaintSearchUi) searchEquipment(); return; }`
guard (7675–7680), and calls `searchEquipment()` again → `!loaded` →
`loadEquipmentIndex()` → `loading` → `searchEquipment()` → … unbounded
synchronous recursion → `RangeError: Maximum call stack size exceeded`, aborting
that keystroke's render. Reachability: cold start with no `EQUIPMENT_LIBRARY`
localStorage cache (first ever use, cleared cache, or expired TTL) — boot fires
`loadEquipmentIndex(true)` (8447) which sets `equipmentIndexLoading=true` and
dispatches `apiGetEquipmentIndex` (a sheet read, ~1–3 s). During that window the
user switches to the Add tab (`clearAddForm`'s load call is correctly guarded by
`!equipmentIndexLoading`, so the tab switch itself is safe) and types a letter →
`handleCommandSearchInput` → `debouncedSearchEquipment` → `searchEquipment` →
overflow. Every keystroke until the fetch resolves overflows; search is broken
and throws for the whole load window. It self-heals once `apiGetEquipmentIndex`
returns (`equipmentIndexLoaded=true` breaks the `!loaded` guard) or fails
(`equipmentIndexLoading=false`, so the next call re-dispatches instead of
recursing). Note the cache-paint path inside `loadEquipmentIndex` sets
`equipmentIndexLoaded=true` *before* `loading=true`, which is exactly why a warm
cache never hits this — masking the bug in everyday use. Fix: don't re-enter
`searchEquipment` from the loading guard — paint a "Loading library…" status and
return; or in `searchEquipment` guard the dispatch: `if (!equipmentIndexLoaded)
{ if (!equipmentIndexLoading) loadEquipmentIndex(); else showLoadingStatus();
return; }`.

#### RISK · Index.html:8240 · A leaked `_inFlightWrites` does not merely defer the poll — it permanently freezes server reconciliation via the `loadInventory` 4134 guard
Cross-cutting: **iOS background/foreground** and **collaborative sync
interference**, intersecting every write in this section. `addInventoryItem`
(8240), `saveInventoryEdits` (7488), and `deleteSelectedInventory` (7622) each do
`_inFlightWrites++` and decrement **only** inside their success/failure handlers.
If those `google.script.run` callbacks never fire — the documented iOS GAS
webview suspension mid-round-trip (same mechanism accepted for `quickEditInFlight`
at FINDINGS ~1311) or the webview being torn down — the counter is stranded ≥1
for the rest of the session; nothing (not `visibilitychange` 8426, not any
watchdog) resets it. The prior note at ~1311 states the `_inFlightWrites` leak's
"only consequence is deferral." That is incomplete: `loadInventory`'s success
handler early-returns at line 4134 — `if (_inFlightWrites > 0) { markInventoryReady();
return; }` — discarding the server fetch. So with the counter stuck, **every**
`loadInventory` (tab switch via `setCommandMode`→4079, forced reload from a
foreign-sync poll, periodic revalidation) fetches from the server and throws the
result away. Foreign writes never appear, the user's own subsequent writes show
only optimistically, and `cacheInventoryRows` (2940, same `>0` guard) stops
persisting — the inventory silently goes stale until a full page reload (which
resets the counter to 0). Severity is higher than the deferral framing implies
and now reaches the Add path too (run 5 audited a version where Add didn't touch
the counter). Fix: track in-flight writes by id/token with a watchdog timeout
that releases a stranded entry after N seconds, or reconcile the counter on
`visibilitychange` foreground — but a blind `_inFlightWrites = 0` there is unsafe
(a resumed-then-fired callback would decrement to −1), so prefer the
id/watchdog approach.

#### Note · Index.html:8176 · Add/Edit/Delete/Combine optimistic write paths re-confirmed clean post-`_inFlightWrites` change; navigate-away self-heals
Stories: **Add library item**, **Add custom item**, **Edit inventory item**,
**Delete inventory item**, **Combine duplicate**. The optimistic `_opt_` row is
written to localStorage at 8230 while `_inFlightWrites===0` (so it does persist),
but a navigate-away/close mid-add self-heals on next launch: the fresh page resets
`_inFlightWrites=0`, and `loadInventory`'s server fetch replaces `inventoryRows`,
dropping any stale `_opt_` row (the only residual exposure is an offline relaunch,
where a fake-id `_opt_` row stays interactable — narrow edge). Tab-switch during an
in-flight add is safe: `loadInventory`'s 4134 guard preserves the optimistic state
and the success handler renders the confirmed row on return. `pollSync`'s
`pendingForeignReload` correctly survives the writer's own subsequent sync bump
(the deferred foreign reload still fires once `_inFlightWrites` returns to 0).
Both add-failure branches (`!res.ok` 8246 and transport 8278) surface error
feedback (`setMainStatus`, visible at top of `<main>` on the Add tab); the
transport branch additionally writes `#addStatus` — a minor cosmetic asymmetry,
not a feedback gap.

### 2026-06-19 (run 38) — Sections audited: 12

Section 12 = Index.html lines 6001–7500 (inventory groups, description sheet,
sell batch). Read in-range plus the referenced sheets that open from the
description sheet: `openGiveItemSheet`/`openSellItemSheet`/`confirmSellItem`
(5617–5738), `openSellBatchSheet`…`copyPartyPoolInventory` (5741–5991), and the
server functions `apiAdjustInventory`/`apiSetItemQuantity` (Code.js 3741–3920)
to confirm ledger attribution.

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **View item details** (tap card → description sheet → stat block + description
  loads). `openInventoryDescription` (6963) → cached `itemCache[libraryItemId]`
  short-circuit, else `apiGetEquipmentItem` with a `capturedId` guard
  (`selectedInventory['Inventory ID'] !== capturedId` → bail) so a late fetch
  cannot paint the wrong item. Failure handler does NOT cache null (next open
  retries). Clean.
- **Give item to character** (description → Give to… → `giveItemToCharacter`
  6081). Optimistic holder swap on the representative row, full revert on both
  error branches, `_inFlightWrites++/--` balanced. Documented rollup limitation
  only (moves rep row). Clean within scope.
- **Sell item** (description → Sell for Gold → stepper → `confirmSellItem` 5667)
  and **Remove item** (description → Remove stepper → `confirmDescRemove` 7066):
  both FIFO-drain across rollup rows, optimistic qty decrement, full
  `previousRows` restore on failure, `loadInventory(true)` reconcile on success.
  See RISK (no re-entry guard) and RISK (silent no-op when item vanished) below.
- **Sell item batch** (treasurer → `openSellBatchSheet` 5741 →
  `confirmSellBatch` 6026): FIFO distribution, balanced in-flight, retry-able on
  failure. Known 1.5 s auto-close-timer TODO already logged; not re-reported.
- **Quick-adjust currency/delerium** (tap gold/delerium card → quick-edit sheet
  → add/remove/set → Confirm). `openQuickEditPanel` (7179) / `confirmQuickEdit`
  (7308). `quickEditInFlight` guards double-tap; verify call guarded by
  `selectedQuickEdit.itemId`. See BUG (missing clientCharacter) and RISK
  (gold ADJUST invisible) below.
- **Edit inventory item** (swipe → Edit → Save → `saveInventoryEdits` 7474) and
  **Delete** (`deleteSelectedInventory` 7562): save disables button + restores on
  failure; delete has the qty>1 confirm gate and optimistic decrement/filter with
  `previousRows` restore. Clean.
- **Pay gold / Undo last pay** dashboard breakout (`payResource` 6712 /
  `undoResourcePay` 6781): traced; known "undo does not reverse RESOURCE_LEDGER"
  TODO already logged.

#### ~~BUG · Index.html:7379 · Quick add/remove adjust writes a ledger entry with no author~~ FIXED
In `confirmQuickEdit`, the **set** branch calls `apiSetItemQuantity({… clientCharacter:
myCharacterName …})` (7365) but the **add/remove** branch calls
`apiAdjustInventory({ itemId, delta, note, size, _syncClientId })` (7379) with **no
`clientCharacter`**. Server-side both functions attribute the ledger row via
`character: safeText_(payload && payload.clientCharacter)` (Code.js:3805 for adjust,
:3917 for set). So a currency/delerium quick-adjust done with **Add** or **Remove**
records a RESOURCE_LEDGER entry whose `Character` column is blank, while the
otherwise-identical **Set** adjustment, and every other ledger write in the app,
records the writer. Story: *Quick-adjust currency/delerium* — the audit-trail "who
changed this" is lost for the add/remove path only. Fix applied: added
`clientCharacter: myCharacterName || ''` to the `apiAdjustInventory` payload at 7379
and to the swipe-remove-one call at 7649, matching the set branch.

#### ~~RISK · Index.html:6337 · Gold quick-adjust ledger entries are silently hidden~~ FIXED
`apiAdjustInventory`/`apiSetItemQuantity` stamp gold quick-edits with
`Action: 'ADJUST'` (Code.js:3797/3909). `confirmQuickEdit` pushes the returned
`ledgerEntry` into `inventoryResourceLedger` (7345) and caches it, but
`renderResourceLedger` filters gold entries through `LEDGER_VISIBLE_ACTIONS`
(6337), which does **not** include `ADJUST`. Result: a gold quick-adjust changes
the live Gold total but produces **no visible ledger row** in either the Gold
sheet (`renderResourceLedger('gold', 60)`, 5470) or the dashboard breakout (6325).
Delerium quick-adjusts are unaffected because non-gold entries skip the
allow-list filter (6369), so the two resources behave inconsistently for the same
user action. Story: *Quick-adjust currency*. Either add `'ADJUST'` to
`LEDGER_VISIBLE_ACTIONS`, or intentionally document that gold quick-adjusts are
ledger-silent (combined with the BUG above, gold quick-adjusts are currently both
unattributed and invisible).

#### ~~RISK · Index.html:7066 · Description Sell/Remove rely on sheet-close, not an in-flight flag, to block re-entry~~ FIXED
`confirmSellItem` (5667) and `confirmDescRemove` (7066) have no boolean re-entry
guard. They prevent a second submission only by calling `closeDescriptionSheet()`
synchronously before the async `apiSellInventoryBatch`. Neither nulls
`selectedInventory` (only `closeInventoryPanels` does, which these paths don't
call), and each recomputes `allForKey`/`items` from the live, already-mutated
`inventoryRows`. A genuine fast double-tap on the **Remove**/**Sell for Gold**
button that lands before the sheet's hide transition completes would fire the
handler twice and drain the FIFO rows a second time (double removal/sale). Lower
confidence because the immediate `classList.remove('active')` usually intercepts
the second tap, but adding a simple `if (descActionInFlight) return;` guard
(mirroring `quickEditInFlight`) would close the race deterministically.

#### Note · Index.html:6963 · Stale-item edge in description-sheet write paths
Story trace note for *Sell/Remove item* navigate-away: if a collaborator's write
triggers `loadInventory(true)` while the description sheet is open (no local
in-flight write to defer the poll), `inventoryRows` is replaced but the open sheet
is not re-rendered — title/stepper-max go stale. If the item was fully removed by
the other user, `allForKey` is empty and both `confirmSellItem`/`confirmDescRemove`
hit `if (!items.length) return;` — a silent no-op with no status feedback. Edge
case; worth a one-line "Item no longer available" message rather than a silent
return. Otherwise the description-sheet flows are clean.

### 2026-06-19 (run 37) — Sections audited: 11

Section 11 = Index.html lines 4501–6000 (gold/delerium UI, sync). The actual sync
poll lives at 4357–4395 (traced run 36); the in-range material is: the tail of
Party Notes v2 handlers (`renderNotesList` tail, `handleNotesSearch`, `openNoteForm`,
`deleteNoteFromForm`, `saveNoteForm`, `archiveNote`, `toggleNotePin` — 4501–4746),
the full identity flow (`readCachedIdentity`/`cacheIdentity`/`applyIdentity`/
`loadMyIdentity`/`loadFallbackCharacterIdentity`/`showIdentitySheet`/`confirmIdentity`
— 4754–4914), the **Gold sheet** (`openGoldSheet`/`setGoldSheetScope`/
`renderGoldSheetBody`/`renderGoldSheetButtons`/`receivedGold`/`openPayReasonSheet` —
4918–5559), the **Delerium sheet** (`renderDeleriumSheetActions`/`openDeleriumSheet`/
`renderDeleriumSheetBody`/`adjustDeleriumSell`/`updateDeleriumButtonStates`/
`receiveDelerium`/`refreshDeleriumStateFromInventory_`/`sellDelerium` — 4948–5362),
**Give item** (`openGiveItemSheet`/`giveItemToCharacter` — 5567/6045), **Sell item**
(`openSellItemSheet`/`confirmSellItem` — 5598/5618), and the **Sell batch** sheet
(`openSellBatchSheet`…`confirmSellBatch` — 5692–6043). Ledger-edit handlers
(`renderResourceLedger`/`selectLedgerRowForEdit`/`cancelLedgerEdit`/
`updateLedgerNoteFromBottom` — 6311–6450) read outside range.

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Receive crystals** (Delerium tab → increment → Received → gold + note → confirm).
  Treasurer path via `receiveDelerium` (5154) is clean (optimistic rows + pending
  ledger, full revert on both error branches, counters resynced via
  `refreshDeleriumStateFromInventory_`). The **non-treasurer** path is BROKEN — see
  BUG below.
- **Sell crystals** (decrement → Sell → 0 gp inline confirm). `sellDelerium` (5254)
  clean: 0 gp confirm gate, optimistic negative rows, inputs snapshotted/restored,
  double-tap naturally guarded by the post-sell counter resync (delta→0). Noted the
  button-state-not-refreshed-after-sell nit (Sell stays red until next adjust) — benign
  (second tap bails on empty `items`).
- **Receive gold (Got Paid)** (`receivedGold` 5460) and **Pay gold** (`openPayReasonSheet`
  5529 → `confirmPayWithReason` 6104). Receive: optimistic pending ledger, inputs
  restored on failure, double-tap guarded by cleared amount → re-validates `>0`. Balance
  lag IDEA already filed (run 32). Pay-reason validates amount before opening; amount
  re-read at confirm.
- **Edit ledger note** (Gold + Delerium) — `selectLedgerRowForEdit` (6363) →
  `updateLedgerNoteFromBottom` (6411). Buttons disabled during save; `closeGoldSheet`/
  `closeDeleriumSheet` both `cancelLedgerEdit()` so no stuck edit state on navigate-away;
  amount field readOnly toggled correctly. Found the timestamp-match RISK below.
- **Give item to character** (`giveItemToCharacter` 6045) — optimistic holder swap, full
  revert on both failure paths, `.saving` pulse null-checked. Clean (qty-stepper-ignored
  BUG already filed run 35; rollup limitation is a README TODO).
- **Sell item** (`confirmSellItem` 5618) and **Sell batch** (`confirmSellBatch` 5977).
  Single-item sell: FIFO drain, optimistic pre-call removal, full `previousRows` revert.
  Batch: optimistic removal deferred to success handler (no rollback needed on failure),
  confirm button disabled during flight. Found the auto-close RISK below.
- **Identity selection** (`confirmIdentity` 4884 → `apiSetMyCharacter`) — double-tap
  guarded (`identityChoiceSaving`), optimistic local apply, localStorage cache persists on
  server failure. `startSyncPoll` (4388) is idempotent (`if (syncPollTimer) return`) so
  the 2–3 `applyIdentity` calls per load (cached + fallback + confirm) don't stack polls.
  Clean — except the notes-tab gating RISK below.
- **Create / Edit / Pin / Archive note** (4580–4746) — re-confirmed run 31 traces;
  `_inFlightNoteWrites`/`_notesActionInFlight` paired, optimistic + rollback. No new issue.

#### ~~BUG · Index.html:5154 · Non-treasurer "Received" delerium button can never succeed~~ FIXED
Story **Receive crystals**, non-treasurer path. README §Delerium: "Non-treasurers see a
Received button to log crystal pickups." But `renderDeleriumSheetBody` builds the
adjustable per-size counters **only** inside `if (isTreasurer)` (5028); the non-treasurer
`else` branch (5071–5078) renders a read-only `resource-lines` list with no counters and
no way to call `adjustDeleriumSell`. `openDeleriumSheet` (4999) calls
`refreshDeleriumStateFromInventory_` which sets `deleriumOriginalQtys[s] ===
deleriumSellQtys[s] === stock` for every size. `receiveDelerium` (5161) computes each
`qty = deleriumSellQtys[s] − deleriumOriginalQtys[s]` → always `0` → `items` is empty →
the function bails at 5164 with `"Increment at least one crystal to receive."` and never
reaches the server. So a non-treasurer tapping **Received** can only ever see that error;
there is no UI to specify a quantity. The documented non-treasurer crystal-pickup flow is
non-functional. Fix: give non-treasurers a per-size quantity input (or a simple
+/− counter that drives `deleriumSellQtys` upward), or a dedicated "received N of size X"
mini-form, so `items` can be non-empty.

#### ~~BUG · Index.html:5510 · `receivedGold`/`confirmPayWithReason`/`splitGold` set `goldSheetMutated` only inside the success handler~~ FIXED
Story **Receive gold / Pay gold / Split gold evenly**, navigate-away step. All three gold
write paths set `goldSheetMutated = true` only inside their success handlers (lines 5558,
6192, 6265). `closeGoldSheet` evaluates `if (goldSheetMutated) renderInventory()` at line
5431. If the user closes the gold sheet before the round-trip returns (i.e. taps **Done**
or a nav tab), `goldSheetMutated` is still `false` → no `renderInventory()` → the inventory
dashboard `Gold = X gp` total stays stale. The writer's own sync-skip (`by === syncClientId`)
also prevents the 20 s poll from correcting it. Also: `receivedGold` and `confirmPayWithReason`
never called `renderInventory()` in their success handlers even when the sheet was still open,
so the dashboard wasn't refreshed on-screen either. Fix applied: set `goldSheetMutated = true`
synchronously right after the optimistic render in all three functions; add `renderInventory()`
to `receivedGold` and `confirmPayWithReason` success handlers.

#### ~~BUG · Index.html:6154 · Pay→Purchase from the gold sheet never offers Undo~~ FIXED
Story **Pay gold → Purchase → Undo last pay**. `confirmPayWithReason`'s `onSuccess` only
sets `lastResourceUndo['gold']` when `isTreasurer && res.poolDeduct` (line 6188). A
Purchase routes to `apiDepleteResource`, which returns `res.item` (the negative deduct row)
but no `res.poolDeduct` — so the condition is always false for purchases and the undo token
is never armed. `renderGoldSheetButtons` gates the "↩ Undo Last Pay" button on
`lastResourceUndo['gold']` → button never appears for the most common pay type. Additionally,
success handlers called only `renderGoldSheetBody()` not `renderGoldSheetButtons()`, so even
member-routed pays (where undo WAS set) wouldn't show the button until scope toggle / reopen.
Fix applied: extended the undo-token gate to also handle `!isMember && res.item`; added
`renderGoldSheetButtons()` call in `onSuccess` after setting the token.

#### ~~RISK · Index.html:5427 · Gold-sheet write buttons render in the DM "grand-total" scope, letting gold be mis-attributed to the DM as a holder~~ FIXED
Stories **Receive gold / Pay gold**. `renderGoldSheetBody` (5387) frames the DM-in-character-scope
view as an all-rows read-only grand total (`isDMGoldScope`, 5393). But `renderGoldSheetButtons`
(5427) renders Got Paid / Pay unconditionally and Split whenever `isTreasurer && (party ||
isDMUser)` — all three show in DM scope. In that scope `goldSheetScope` equals the DM character
name, so `receivedGold` sends `holder: goldSheetScope` and `confirmPayWithReason`/`splitGold`
deduct `fromHolder: goldSheetScope`. A DM tapping Got Paid while viewing the grand total
therefore creates a "DM-held" gold row instead of the party pool — misattributed and invisible
to the party-pool treasurer view (though not lost). Fix: in DM character scope either hide the
write buttons or force `holder`/`fromHolder` to `''` (party pool) for DM gold writes.

#### ~~RISK · Index.html:4810 · Party Notes tab is revealed to every user, contradicting the documented treasurer-only beta gate~~ RESOLVED (intentional — notes tab released to all players)
`applyIdentity` unconditionally un-hides the notes tab — `notesTabEl.style.display = ''`
plus the 3-column nav (4810–4812) — with **no `isTreasurer` check**, and `setCommandMode`
(3206–3221) doesn't gate it either. README §Party Notes states the tab is "currently
treasurer-only (Corvane) for beta; gated in `setCommandMode` and `applyIdentity`." The
gate is absent in both places, so as soon as any player resolves an identity they see the
"Party Notes" tab and can open/create/edit/pin/archive notes (the `apiCreateNote`/
`apiUpdateNote`/`apiArchiveNote` calls carry no treasurer gate). Either the README is
stale (beta gate intentionally dropped) or the gate was lost in a refactor and is exposing
a beta feature to all players. Behavioral/access divergence from spec — confirm intent; if
still beta-gated, wrap 4809–4813 in `if (isTreasurer)` (and hide via `setCommandMode` too).

#### ~~RISK · Index.html:6029 · Sell-batch 1500 ms auto-close timer can close a reopened sheet, and a manual close mid-flight hides the failure~~ FIXED
Story **Sell Items batch**. On success `confirmSellBatch` schedules
`window.setTimeout(() => closeSellBatchSheet(), 1500)` (6029). The timer holds no
generation token, so if the treasurer reopens the sell-batch sheet within that 1.5 s
window (e.g. to sell a second lot), the stale timer fires and closes the freshly-reopened
sheet out from under them. Separately, the **failure** path (6031–6035) only writes the
error into `sellBatchStatus` and re-enables the confirm button — both inside the sheet; if
the user has tapped Cancel (`closeSellBatchSheet`) during the in-flight window, the failure
is invisible. Because the optimistic row removal is deferred to the success handler,
inventory stays correct in that case (no data loss), but the user gets no signal the batch
sell failed and may assume it succeeded. Fix: guard the auto-close with a generation
counter (only close if the sheet wasn't reopened), and surface batch-sell failures via
`setMainStatus` as a fallback when the sheet is no longer open.

#### RISK · Index.html:6435 · Ledger note-edit matches by Timestamp when entryId is empty — multi-entry delerium sells can patch the wrong row client-side
Story **Edit ledger note**. `updateLedgerNoteFromBottom`'s success handler reconciles the
local copy with `inventoryResourceLedger.find(e => entryId ? e['Inventory ID'] === entryId
: e['Timestamp'] === timestamp)` (6435–6436). A single delerium **Sell** of multiple sizes
posts one `ledgerEntries` row per size, all created in the same server pass and therefore
sharing (or nearly sharing) a `Timestamp`. If those entries carry no `Inventory ID`
(`entryId` empty — the optimistic gold pending entry already sets `'Inventory ID': ''`),
the client `.find` returns the **first** timestamp match and writes `newNote` onto it,
regardless of which of the same-timestamp rows the user actually tapped. The tapped row's
displayed note then doesn't update (or the wrong sibling's does) until the next
`loadInventory` reload. Server-side correctness depends on `apiUpdateLedgerNote`'s own
matching, but the optimistic client patch is ambiguous. Fix: prefer a stable per-entry key
(write a unique ledger row id into `data-entry-id` for every entry, including delerium
multi-sells) and match on it rather than falling back to a non-unique Timestamp.

#### Note · Index.html:5154 · Treasurer gold/delerium write paths and identity flow are clean
Positive baseline. Traced Receive gold, Pay gold, Sell crystals (treasurer), Give item,
Sell item, Sell batch (happy + failure + navigate-away), Edit ledger note, and Identity
selection. All paired `_inFlightWrites` on success and failure, snapshotted+restored inputs
(`savedGoldAmount`/`savedSellGold`/`savedRecNote`), and reverted optimistic state on
failure; sheets covering the bottom-nav defuse tab-switch-mid-flight, and both resource
sheets cancel any active ledger edit on close. `startSyncPoll` idempotency prevents stacked
polls across the multiple `applyIdentity` calls per load. The four findings above are the
only divergences in this range.

### 2026-06-19 (run 36) — Sections audited: 10

Section 10 = Index.html lines 3001–4500 (inventory render, search). Range covers:
phone/DPR scaling helpers, the delegated swipe-to-delete gesture layer
(`initInventoryGestures`), `setCommandMode`/command-search handlers, the legacy
chat-style "campaign notes" v1 block (`openCampaignNotes`…`deleteCampaignNote`,
3342–3894 — dead: `openCampaignNotes` has no caller, skipped per audit rules),
the combine-duplicate flow (`findDuplicateInventoryCandidate`, `showCombineChoice`,
`confirmCombineInventoryItem`), `loadInventory`/`renderInventory`/
`renderInventoryRowCard`/`renderInventoryDashboard`, the collaborative-sync poll
(`pollSync`/`startSyncPoll`/`stopSyncPoll`), and Party Notes v2 load/render
(`loadNotes`/`renderNotesList`).

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Combine duplicate** (add → duplicate detected → combine sheet → Confirm).
  `findDuplicateInventoryCandidate` (3423) → `showCombineChoice` (3432) →
  `confirmCombineInventoryItem` (3455) → `apiCombineInventoryItems`. Clean:
  `_inFlightWrites` paired on both handlers, `pendingCombineChoice` restored on
  failure so the sheet stays open and retryable, success merges target / drops
  source and re-renders. Navigate-away (switch to Add tab mid-flight): combine
  overlay stays active but the success handler closes it via
  `keepDuplicateInventoryItem`; no stuck state.
- **Delete inventory item** (swipe → Delete) + **swipe-tap to open**.
  `initInventoryGestures` (3056) → `handleInventoryDeleteActionById` (7474) →
  `deleteSelectedInventory` (7489). Optimistic decrement/remove, full rollback to
  `previousRows` on both failure paths, `_inFlightWrites` paired, retryable. Found
  the tap double-fire RISK below.
- **View item details** (tap card → description sheet). Tap routes through the
  gesture layer → `openInventoryPrimaryActionById` (6836) →
  `openInventoryDescription`. `suppressInventoryClickUntil` correctly swallows the
  synthetic post-touch `click`. Found tap double-fire RISK below.
- **Quick-adjust currency** (dashboard gold/delerium card tap). `renderInventoryDashboard`
  (4319) wires `openGoldSheet`/`openDeleriumSheet`. Affected by the sync-render BUG
  below (foreign gold/delerium qty change doesn't repaint the dashboard total).
- **Collaborative sync interference** (cross-cutting). `pollSync` (4357) +
  `loadInventory` (4077). In-flight deferral via `pendingForeignReload` /
  `_inFlightWrites` is correct and own-write skip works. Found the stale-render BUG
  below in the signature gate.
- **Tab switch during in-flight** (cross-cutting). `setCommandMode` (3206) →
  `loadInventory`; the `if (_inFlightWrites > 0) return` guard at 4132 preserves
  optimistic state on revalidation. Clean.
- **iOS background/foreground** (cross-cutting). `stopSyncPoll`/`startSyncPoll`
  (4388/4393) + the `visibilitychange` listener; poll restarts and an immediate
  check fires on foreground. Clean (deferral logic above carries any unresolved
  in-flight write).

#### ~~BUG · Index.html:4073 · Sync revalidation misses field-only changes (qty/holder/notes/gold/delerium)~~ FIXED

`inventorySignature_()` returns only `inventoryRows.length + '|' + first-8 Inventory IDs`.
`loadInventory`'s success handler (4140–4144) re-renders only when
`signatureAfterFetch !== signatureBeforeFetch`. Any foreign write that changes a
field **without** adding/removing a row or reordering the first 8 rows produces an
identical signature, so the freshly-fetched rows are stored in `inventoryRows` and
cached but **never rendered** — the DOM keeps the stale values until the next
unrelated interaction (filter keystroke, tab switch, swipe). This silently breaks:

- **Collaborative sync interference**: another user's *Edit inventory item* (qty/
  holder/notes/value), partial **Sell**, **Give to…** (holder reassignment),
  **Quick-adjust currency** (gold row qty), or **Delerium** receive/sell (crystal
  row qty) all keep row count and IDs constant. My 20 s poll fires
  `loadInventory(true)`, the new data arrives, signatures match → no repaint. The
  gold/delerium dashboard totals and `N×` card titles stay wrong.
- Also affects the normal foreground revalidation path (tab switch back after the
  60 s TTL), not just the poll.

Fix: make the signature cover the mutable fields it renders — e.g. fold
`Qty`/`Holder`/`Value GP`/`Notes` of each row into the hash (or hash the whole
payload), or simply always `renderInventory()` on a real fetch (the README's
"only re-render when changed" optimization is what introduced the gap). The
existing `_inFlightWrites > 0` early-return already protects optimistic state, so
unconditional re-render here is safe.

#### ~~RISK · Index.html:3169 · Tap opens the panel twice when `pointerup` precedes `touchend`~~ FIXED

In `initInventoryGestures`, both the `pointerup` handler (3085) and the `touchend`
handler (3151) detect a stationary tap and call `openInventoryPrimaryActionById(...)`
directly. The `pointerup` branch guards with `if (Date.now() - lastTapOpenedAt < 500)
return` (3091), but the `touchend` tap branch (3169–3173) has **no** such guard — it
only sets `lastTapOpenedAt`. On touch input both event streams fire for one tap; when
the browser dispatches `pointerup` before `touchend` (the common WebKit/Chrome order),
`pointerup` opens (setting `lastTapOpenedAt`), then `touchend` opens again because it
never checks the timestamp. Result: `openInventoryPrimaryAction` runs twice — for a
library item that means a duplicate `apiGetEquipmentItem` round-trip and a re-render of
the description sheet; for a gold/delerium row `openQuickEditPanel` re-initialises mid-
interaction. The synthetic `click` is correctly suppressed by `suppressInventoryClickUntil`,
so only the pointer/touch pair is unguarded. Fix: add the same
`if (Date.now() - lastTapOpenedAt < 500) return;` guard to the `touchend` tap branch
(or route both through one `maybeOpenFromTap()` helper).

#### Note · Index.html:4357 · Sync poll deferral and combine/delete flows are clean

`pollSync` correctly defers foreign reloads while local writes are in flight
(`pendingForeignReload` + `_inFlightWrites`/`_inFlightNoteWrites`) and skips reloads
for the client's own writes; the deferred reload fires on a subsequent poll once
writes drain. `confirmCombineInventoryItem` and `deleteSelectedInventory` both pair
`_inFlightWrites`, roll back to a captured snapshot on failure, and remain retryable
without reload. Traced as part of Combine duplicate, Delete, and the three
cross-cutting sync stories.

### 2026-06-19 (run 35) — Sections audited: 9

Section 9 = Index.html lines 1501–3000. The range splits into: phone/DPR-scaled CSS
overrides + dice-overlay + party-notes CSS (1501–2046), the entire `<body>` markup —
header, inventory/add/notes `<section>`s, and **every mobile-sheet component**
(`inventorySheet`, `descriptionSheet`, `quickEditSheet`, `noteFormSheet`, `combineSheet`,
`goldSheet`, `deleriumSheet`, `sellItemSheet`, `sellBatchSheet`, `giveItemSheet`,
`payReasonSheet`, `identitySheet`, dice overlay) plus bottom-nav (2049–2750), and the
early JS state block + cache/character helpers (`cacheInventoryRows`,
`primeInventoryCacheAfterAdd`, `getCachedInventoryRows/Payload`,
`populateCharacterSelectors`, `loadCharacters`, equipment-index cache) (2752–3000).
Because the sheets are the literal UI of nearly every story, each story was traced from
its in-range component into the out-of-range handler.

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path / component):

- **View item details** (tap card → description sheet → stat block + description).
  `descriptionSheet` HTML (2415–2447) → `openDescriptionSheet` (~6890) →
  `apiGetEquipmentItem` with session `itemCache`. Found the cache-poisoning RISK below.
- **Give item to character** (description sheet → Give to… → pick). `descriptionSheet`
  stepper (2432–2444) → `openGiveItemSheet` (5567) → `giveItemToCharacter` (6045). Found
  the stepper-ignored BUG below. Optimistic holder swap + revert is otherwise clean and
  closes the quick-edit sheet correctly via `closeInventoryPanels` (7391) →
  `setQuickEditorOpen(false)`.
- **Sell item / Remove item** (description sheet → stepper → confirm). `openSellItemSheet`
  (5598)/`confirmSellItem` (5618) and `stepDescRemoveQty`/`confirmDescRemove` (6989/6995)
  both honor `descRemoveQty` via FIFO drain across rollup rows; full `previousRows` revert
  on failure; sheet closed immediately so double-tap is unreachable. Clean.
- **Edit inventory item** / **Quick-adjust** / **Combine duplicate** / **Create/Edit note**
  — component structure traced (`inventorySheet` 2345, `quickEditSheet` 2450,
  `combineSheet` 2569, `noteFormSheet` 2531) into handlers covered in runs 31/33; markup
  matches handler IDs, no orphaned/duplicate IDs, all close buttons wired.
- **Add library/custom item** (cache path). `addInventoryItem` (8102) success/failure
  ordering vs the in-range `cacheInventoryRows` guard — see Note below (self-heals).

#### ~~BUG · Index.html:5571 · Description-sheet "Give to…" silently ignores the qty stepper~~ FIXED (removed misleading qty from title; full FIFO give deferred to a future multi-row endpoint)
Story **Give item to character**, step "pick character → confirm". The description sheet's
shared qty stepper (`descRemoveQty`, HTML 2432–2439) is documented (README §Item
description sheet: "shared qty stepper… stepper drives all three") to drive Sell, Give,
and Remove. Sell (`confirmSellItem` 5637: `let remaining = descRemoveQty`) and Remove
(`confirmDescRemove` 7009) both FIFO-drain exactly `descRemoveQty` units. **Give does not.**
`openGiveItemSheet` (5571) even renders the promise into the title —
`giveQty = (item === selectedInventory && descRemoveQty > 1) ? descRemoveQty : 0` →
`Give 3× "Gemstone" To…` — but `giveItemToCharacter` (6045) ignores `descRemoveQty`
entirely and just flips the holder of the single representative row via
`apiUpdateInventory({inventoryId, holder})`. Concretely: a Party-pool row of `5× Gemstone`,
stepper set to 2, tap **Give to Bob** → title says "Give 2×", but the result moves **all 5**
gemstones to Bob (the whole representative row), and for a multi-row rollup the other rows
stay put (the documented TODO). So Give neither splits the requested quantity nor matches
its own title. Fix: have Give FIFO-split `descRemoveQty` across rollup rows like Sell/Remove
(server-side this needs a qty-aware move: decrement source rows, create/merge a holder-tagged
row), or — if partial give is out of scope — drop the `descRemoveQty` from the title and
reset the stepper so the UI doesn't promise a quantity it discards.

#### ~~RISK · Index.html:6948 · A transient description fetch failure poisons `itemCache` for the whole session~~ FIXED
Story **View item details**, failure-at-step. On first open of an item with a
`Library Item ID`, `openDescriptionSheet` fires `apiGetEquipmentItem`. The
`withFailureHandler` (6946) sets `itemCache[libraryItemId] = null` and clears the status
line, leaving the description area showing only `userNotes` (or blank) with **no error
message**. Because the cached-branch test is `itemCache[libraryItemId] !== undefined`
(6931), the now-`null` entry is treated as "fetched, not found" forever: re-opening the
same item takes the cached branch and renders "No description available." via
`applyItemToDescSheet_(null)` and **never retries the fetch**. So a single transient
network/quota blip while viewing one item permanently suppresses that item's stat block +
description for the rest of the session (until full reload), and the user gets no feedback
that anything failed. The success path is fine; only the failure path is over-eager to
cache. Fix: on failure, leave `itemCache[libraryItemId]` `undefined` (so the next open
retries) and surface a retryable "Couldn't load description — tap to retry" in
`descStatus`, rather than caching the negative result.

#### Note · Index.html:2939 · `cacheInventoryRows` in-flight guard self-heals; sheet components map cleanly to handlers
Positive baseline. Traced the in-range `cacheInventoryRows` (2939, `if (_inFlightWrites > 0)
return;`) against `primeInventoryCacheAfterAdd` (2950) and all its callers
(`addInventoryItem` 8197, `confirmSellItem` 5676, `confirmPayWithReason` 6149): every caller
decrements `_inFlightWrites` **before** priming, so in the common single-write case the
localStorage cache is written. The only skip window is a genuinely concurrent second
in-flight write, where memory (`inventoryRows`) is correct but the cache lags one snapshot;
a navigate-away-and-return in that window shows slightly stale cache until the next
revalidation/`loadInventory` corrects it — self-healing, by design. Also confirmed the
12 mobile-sheet components in this range have unique IDs matching their handlers, every
`.active`-toggling sheet pairs an `add` with a `syncModalOpenState()`/`remove` close path,
and the give-from-quick-edit path closes the underlying quick-edit sheet (no stuck sheet).
Stories with clean component↔handler mapping: Edit item, Quick-adjust, Combine, Create/Edit
note, Sell/Remove from description.


### 2026-06-19 (run 34) — Sections audited: 8

Section 8 = Index.html lines 1–1500. The whole range is the `<style>` block
(`</style>` is at 2046; `<body>` opens at 2049), so the section is **pure CSS** —
the "HTML structure" label is aspirational; no markup lives in 1–1500. Audit
therefore focused on the *visual state machines* the in-range CSS classes drive,
tracing each back to its JS toggler (read outside range as needed).

Stories traced (happy → failure-at-step → navigate-away → friction, with
state-machine analysis on each CSS-driven visual transition):

- **Give item to character** (description sheet → Give to… → pick → confirm).
  The `.inventory-row.saving` pulse (CSS 528–532) is added at Index.html:6073 and
  removed in **both** the success (6080) and failure (6094) handlers, each
  re-querying the row by `data-inventory-id` after `renderInventory()` rebuilds it,
  with full holder revert on failure. No stuck-pulse state; a mid-flight sync
  re-render just rebuilds the row without `.saving` (pulse stops early, data still
  reconciles). Clean.
- **Quick-adjust currency/delerium** and **Add item** (mode-class CSS 951–967).
  `.add-details-card` toggles `quick-add-mode`/`custom-mode`; library/custom/quick
  field visibility is purely additive and the togglers (8040–8048, 7960–7961,
  8280–8281) always `remove` both classes before re-applying, so no library+custom
  hybrid state is reachable. `.quick-size-field.active` and `.selected-item-card.active`
  display toggles are consistent.
- **Per-player scope slider** (`.scope-pill.active.remind`, CSS 534–539).
  `flashActiveScopePill` (5364) removes `.remind`, forces a reflow (`void offsetWidth`),
  re-adds it, and cleans up on `animationend` with `{ once:true }`. Re-trigger-safe;
  no leaked listener of consequence. Clean.
- **Tab switch during in-flight** (cross-cutting). `.section`/`.section.active`
  (375–376) is `display:none/block`, so a hidden section's optimistic DOM is
  preserved, not destroyed; on return `setCommandMode` (3206) re-renders/reloads.
  Because every full-screen `.mobile-sheet` (z-index ≥70, CSS 1240) covers the
  bottom-nav (z-index 30) and header (z-index 22), a tab tap is unreachable while a
  sheet is open — which defuses the navigate-away-with-sheet-open class of bugs.
- **Collaborative sync / iOS foreground** (cross-cutting, visual layer only).
  `html.app-booting` opacity:0 → `inventory-ready` opacity:1 (118–130) gates the
  initial paint, masking the brief window before JS sets the `--phone-font-*` vars
  (whose hardcoded fallbacks, e.g. `30px`, would otherwise look too small per the
  README scaling note). No FOUC reaches the user.

Secondary (interactive components / overlays not in a story): the `app-modal-open`
scroll-lock contract (line 110) is honored by every `.mobile-sheet` via the
self-healing `syncModalOpenState()` (3410, toggles from live `.mobile-sheet.active`
query) and by the two direct `add` sites (identity 4869→remove 4897, description
6963→sync 7071) — both balanced. The mobile-sheet z-index ladder is correctly
layered (base 70; inline overrides sell/give 80, sellBatch 82, identity 90,
payReason 80), and parent/child sheets that co-exist always give the child a higher
override, so no same-z source-order collision is reachable. One overlay breaks the
contract — see RISK below.

#### ~~RISK · Index.html:110 · Dice overlay is the only full-screen overlay that does not honor the `app-modal-open` scroll-lock contract~~ FIXED
Line 110 (`body.app-modal-open { overflow: hidden }`) is the scroll-lock every
overlay in the app opts into so the page behind cannot move. The dice calculator
overlay does not: `.dice-overlay` (CSS 1810–1816, `position:fixed; inset:0;
z-index:50`) is opened by `openDiceCalc` (3916) which only toggles `.open` and never
adds `app-modal-open`; its `.dice-sheet` is `overflow:hidden`, so a touch-drag on the
calculator scroll-chains to the body behind it on iOS GAS webview. Behavioral
consequence: while the dice sheet is open the inventory/gold page can scroll
underneath the blur, and on close the user is at a different scroll position than
where they opened it — inconsistent with every mobile-sheet, which freezes the
background. Not data loss; a UX inconsistency. Fix: add `app-modal-open` (or call
`syncModalOpenState` after setting/clearing `.open`) in `openDiceCalc`/`closeDiceCalc`,
or add `overscroll-behavior: contain` to `.dice-overlay`. (CSS root in this section;
the open/close JS and overlay block live at 1810/3916, just past the range.)

#### Note · Index.html:1 · Section 8 (pure CSS) — visual state machines clean for all traced stories
Positive baseline. Traced Give-to (`.saving` pulse), Add-item / Quick-adjust
(mode-class visibility), scope slider (`.remind` animation), Tab-switch-during-in-flight
(`.section` display + sheet-covers-nav), and the sync/iOS-foreground boot gate. Every
CSS-driven visual transition has a matching, balanced JS toggler; the `app-modal-open`
lock is self-healing and the z-index ladder is collision-free. The single divergence
(dice overlay) is the RISK above.

### 2026-06-19 (run 33) — Sections audited: 7

Section 7 = Code.js lines 3501–end. Despite the "sync, audit, utilities" label,
the real `bumpSync_`/`apiGetSyncState`/`auditWrite_`/`log_` definitions live at
1823–2250; the **line range** 3501–4067 actually holds the tail of
`apiDeleteInventory` (3501), `apiCombineInventoryItems` (3565),
`apiGetCurrencyQuickEdit` (3688), `apiAdjustCurrency` (3730, unused wrapper),
`apiAdjustInventory` (3740), `apiSetItemQuantity` (3860), and the read/write
utilities `getInventoryRowObjectById_`, `writeInventoryRow_`, `classifyQuickEdit_`,
`ensureInventoryHeaders_`, `fillMissingInventoryRarity_`, `findInventoryRowById_`.

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Quick-adjust currency/delerium** (tap card → quick-edit sheet → add/remove/set →
  amount → Confirm). Client `openQuickEditPanel` (Index.html:7108), `confirmQuickEdit`
  (7237) → `apiAdjustInventory` (add/remove) or `apiSetItemQuantity` (set). Found the
  Notes-overwrite BUG, the set-mode-drops-size BUG, the classification-divergence RISK,
  and the in-flight-flag-reset RISK below.
- **Delete inventory item** (swipe card → Delete; confirm if qty>1) and the edit-form
  delete. `handleInventoryDeleteActionById` (7474) → `deleteSelectedInventory` (7489) →
  `apiAdjustInventory` (decrement) or `apiDeleteInventory` (3501). Optimistic
  decrement/filter with `previousRows` snapshot, full revert + re-render on both
  failure paths, `_inFlightWrites` balanced, confirm-all gate for qty>1. Clean except
  the swipe-decrement-of-a-delerium-row interaction noted under the Notes BUG.
- **Combine duplicate** (duplicate detected after add → combine sheet → Confirm).
  `confirmCombineInventoryItem` (Index.html:3455) → `apiCombineInventoryItems` (3565).
  `pendingCombineChoice` nulled-then-copied (double-tap safe), full restore of the
  choice on failure with retry kept open, `_inFlightWrites` balanced, server merges
  qty/holder/faction/notes and value-mismatch is surfaced in the message. Clean.

#### ~~BUG · Code.js:3781 · Quick-adjust delerium overwrites the item's Notes with the ledger note~~ FIXED
In `apiAdjustInventory`, the `quickType === 'delerium crystal'` branch does
`if (note) rowObj['Notes'] = [note, 'Size: '+size].join('\n')`. The Quick-adjust
"Note" field is meant as a *transaction* note (it is also written to the ledger as
`ledgerEntry.notes`). For the **currency** branch the note is correctly sent only to
the ledger and the row's `Notes` are left untouched — but for delerium the same note
*replaces* the row's persistent `Notes`. So in the Quick-adjust story, step "enter
amount + note → Confirm" on any delerium crystal silently destroys whatever was in the
item's Notes (e.g. "found in dragon hoard" → "from the cache\nSize: chip"). It is also
reachable without typing a note via swipe-remove-one: `handleInventoryDeleteActionById`
→ `deleteSelectedInventory` calls `apiAdjustInventory({delta:-1, note:'Swipe remove one'})`,
so a swipe on a delerium row rewrites Notes to "Swipe remove one\nSize: …". Fix: append
the ledger note to the ledger only; do not assign it into `rowObj['Notes']` (or, if a
size-driven Notes update is wanted, append rather than replace, and gate it on an actual
size change). The unconditional `rowObj['Item'] = 'Delerium {Size}'` rename in the same
branch has the same flavor — it canonicalizes a custom name (e.g. "Aqua Delerium" with
category `delerium` → "Delerium Chip") on a plain quantity bump because the size dropdown
always defaults to a concrete size.

#### ~~BUG · Code.js:3860 · "Set" quick-edit mode silently drops the delerium size selection~~ FIXED
`apiSetItemQuantity` has no `size` parameter and no delerium branch, and
`confirmQuickEdit` (Index.html:7290) only sends `{itemId, quantity, note}` in the `set`
branch. The Quick-adjust sheet still renders and pre-selects the size dropdown in `set`
mode, so a user who switches mode to "set", changes the size, and Confirms gets a
"Quantity updated." success with the size change discarded — no error, no indication it
was ignored. The `add`/`remove` path honors `size`; `set` does not. Either honor `size`
in `apiSetItemQuantity` or hide/disable the size field when mode is `set`.

#### ~~RISK · Index.html:7093 · Client/server delerium quick-edit classification diverges~~ FIXED
`getQuickEditType` (client, 7081) treats anything whose name matches `/delerium|delirium/`
(and category not potion) as `delerium crystal`, but server `classifyQuickEdit_`
(Code.js:1806) only matches `category === 'delerium'` OR a name matching
`^(delerium|delirium)\s+(chip|fragment|shard|crystal|geode|massive cluster|unknown)`.
For an item named "Aqua Delerium" with a non-delerium category, the client opens the
delerium size editor (size dropdown active), but the server's `quickType` is `''`, so
`apiAdjustInventory` skips the delerium branch entirely: the size selection is a no-op
**and no ledger entry is appended** (`ledgerEntry` stays null), yet the user sees
"Saved." and used a "Quick Delerium" editor expecting a logged crystal transaction. The
adjustment still happens, but it never reaches the delerium ledger. Align the two
classifiers (ideally have the client trust the `editType` returned by
`apiGetCurrencyQuickEdit` at Index.html:7161 rather than its own `getQuickEditType`).

#### ~~RISK · Index.html:7109 · openQuickEditPanel resets the in-flight guard, allowing a double write + UI race~~ FIXED
`openQuickEditPanel` unconditionally sets `quickEditInFlight = false`. If a quick-adjust
is already in flight (panel showing "Saving…") and the user opens the quick editor for a
second item (reachable on desktop, where `desktopQuickEditor` doesn't fully block the
list), the guard is cleared and a second `apiAdjustInventory`/`apiSetItemQuantity` can be
launched while the first is unresolved. `confirmQuickEdit`'s `finishSuccess` also lacks
the identity guard that `apiGetCurrencyQuickEdit`'s handler has
(`selectedQuickEdit.itemId !== row[...]` at 7152), so the first response's
`closeQuickEditPanel()` + success status land on the *second* item's open panel. Row data
stays correct (handlers key off `res.item`'s ID), so this is a UI/state-machine race, not
data loss — but `_inFlightWrites` can briefly double and the panel closes out from under
an unresolved second write. Suggest not resetting `quickEditInFlight` when it is already
true (or refusing to open a new quick edit mid-flight), and adding an identity check in
`finishSuccess`.

#### Note · Index.html:4357 · Sync deferral correctly protects in-range write paths
Traced the cross-cutting "collaborative sync interference" concern against the Section 7
writes: `pollSync` (4357) sets `pendingForeignReload = true` and leaves
`syncState.inventory.ts` unchanged when a foreign write arrives while `_inFlightWrites > 0`,
so `loadInventory(true)` is deferred (and re-attempted on the next poll) rather than
clobbering an optimistic quick-adjust/delete/combine mid-flight. All three traced flows
increment/decrement `_inFlightWrites` on both success and failure, so the guard holds.
`apiDeleteInventory` (3501) and `apiCombineInventoryItems` (3565) release the
`DocumentLock` in `finally` on every path including not-found/auth-failure. Clean.


### 2026-06-19 (run 32) — Sections audited: 6

Section 6 = Code.js lines 2901–3500 ("batch sell, give, remove"). In-range write APIs:
`apiUpdateLedgerNote` (2905), `apiReceiveResource` (2961), `apiSellInventoryItem`
(3046, **unused** — client sells via `apiSellInventoryBatch`), `apiSellDelerium`
(3101), `apiSplitGold` (3186), `apiSendGoldToMember` (3324), `apiUpdateInventory`
(3408), `apiDeleteInventory` (3496, partial). Client handlers traced where they sit:
`confirmSellItem` (Index.html:5618), `giveItemToCharacter` (6045), `confirmSellBatch`
(5977), `sellDelerium` (5254), `receiveDelerium` (~5160), `receivedGold` (5460),
`confirmPayWithReason` (6104), `splitGold` (6184), `payResource` (6662),
`undoResourcePay` (6731), `updateLedgerNoteFromBottom` (6411).

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Pay gold → character** (Gold tab → Pay → pick member → confirm) via
  `apiSendGoldToMember`. Found the gold-duplication-on-undo BUG below.
- **Pay gold → Purchase** via `apiDepleteResource` — pending ledger entry, removePending
  + prepend real entry, inputs saved/restored on failure. Clean.
- **Undo last pay** (`undoGoldPay`/`undoResourcePay`) — clean for the dashboard
  `payResource` single-row deduct; BROKEN for member sends (see BUG).
- **Split gold evenly** (treasurer) via `apiSplitGold` — found the lost-inputs-on-failure
  BUG below.
- **Give item to character** (description sheet → Give to… → pick) via
  `apiUpdateInventory({holder})` — optimistic holder swap on the representative row,
  full revert on failure, `.saving` pulse null-checked. Clean except the documented
  rollup limitation (README known TODO: only the representative row moves).
- **Sell item** (description sheet → Sell for Gold → stepper) and **Remove item**
  (description sheet → Remove → stepper) via `apiSellInventoryBatch` (out of range,
  but traced) — FIFO drain, optimistic decrement, full `previousRows` revert on
  failure/!ok. Clean.
- **Sell crystals** via `apiSellDelerium` and **Receive crystals** via
  `apiReceiveResource` — optimistic rows + pending ledger entry, inputs saved/restored
  on both error branches, counters resynced from reverted inventory. Clean.
- **Receive gold (Got Paid)** via `apiReceiveResource` gold branch — clean rollback,
  but balance-lag friction noted as IDEA.
- **Edit ledger note** via `apiUpdateLedgerNote` — buttons disabled during save, entry
  found by entryId/timestamp and patched on success, `cancelLedgerEdit` on close.
  Clean (only-deduct-row note inconsistency for member sends is cosmetic).

#### ~~BUG · Index.html:6155 · "Undo Last Pay" duplicates gold after Pay→member~~ FIXED
Story **Undo last pay**, after **Pay gold → character**. When a Pay is routed to a
party member, `confirmPayWithReason` stores `lastResourceUndo['gold'] = { item:
res.poolDeduct, ledgerEntry: res.ledgerEntry }` (6155). `apiSendGoldToMember`
(Code.js:3324) writes **two** inventory rows: the member credit (`res.item`, Qty
`+amount`, Holder = character) and the pool/personal deduction (`res.poolDeduct`, Qty
`-amount`). The "↩ Undo Last Pay" button (5450) → `undoGoldPay` → `undoResourcePay`
(6731) deletes **only** `undo.item['Inventory ID']` (the deduction) via
`apiDeleteInventory`. The member credit row is never deleted. Net result: the pool/sender
deduction is reversed **and** the recipient keeps the credited gold — `amount` gp is
created from nothing. This persists server-side; `loadInventory(true)` reloads the
orphaned credit row. (The dashboard `payResource` path is fine because
`apiDepleteResource` writes a single row.) Fix: for member sends, undo must delete both
the credit and the deduction (store both IDs, or send a dedicated reversal API), or
suppress the Undo affordance for member-routed pays.

#### ~~BUG · Index.html:6205 · Failed Split Evenly loses the typed amount and note~~ FIXED
Story **Split gold evenly**, step "server returns !ok or failure". `splitGold` clears
`goldSheetAmount` and `goldSheetNote` optimistically (6205–6206) but neither the
success-`!ok` branch (6215–6218) nor the `withFailureHandler` (6232–6236) restores
them — unlike `confirmPayWithReason` (`restoreInputs`), `receivedGold`
(`savedGoldAmount`/`savedGoldNote`), and `sellDelerium`
(`savedSellGold`/`savedSellNote`), which all snapshot and restore. The error message
says "Failed." / shows the server error, but the amount the user typed is gone, so
"try again" forces a full re-entry. Fix: snapshot amount/note before clearing and
restore them in both failure paths (mirror `receivedGold`).

#### ~~IDEA · Index.html:5474 · Gold receive/pay balance lags behind the ledger entry~~ FIXED (optimistic gold inventory row in receivedGold + confirmPayWithReason)
Stories **Receive gold** and **Pay gold**. `receivedGold` and `confirmPayWithReason`
optimistically insert only a *pending ledger entry*; they do **not** add an optimistic
inventory row, so the header "Gold = XXX gp" total and the party-pool balance (both
derived from `inventoryRows` via `getGoldBreakout`) don't move until the server
responds and `primeInventoryCacheAfterAdd(res.items/res.item)` runs. By contrast
`receiveDelerium` (5179) prepends optimistic inventory rows immediately, so the
delerium total updates instantly. The result is inconsistent feedback between adjacent
resource flows: the ledger shows the transaction but the balance appears unchanged for
the round-trip. Suggest adding an optimistic gold inventory row (reverted on failure
like delerium) so the balance updates in lockstep with the ledger.

#### Note · Code.js:3046 · `apiSellInventoryItem` is unreachable
Confirmed no caller in Index.html (all sell flows use `apiSellInventoryBatch`). Flagged
only to record that the single-item sell path was excluded from story tracing as dead.

### 2026-06-19 (run 31) — Sections audited: 5

Section 5 = Code.js lines 2301–2900 ("delerium, custom inventory, notes"). In-range
write APIs: `apiCreateNote` (2330), `apiUpdateNote` (2371), `apiArchiveNote` (2402),
`apiAddInventory` (2424), `apiAddCustomInventory` (2533), `apiQuickAddInventory`
(2632), `apiDepleteResource` (2773), `apiUpdateLedgerNote` (2905, partial). Client
handlers traced where they sit: `loadNotes` (Index.html:4429), `renderNotesList`
(4455), `openNoteForm` (4542), `deleteNoteFromForm` (4580), `saveNoteForm` (4608),
`archiveNote` (4690), `toggleNotePin` (4719), `addInventoryItem` (8102),
`clearAddForm` (8251).

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Create note** (Notes → + → fill → Save → optimistic card) — found BUG below:
  failed create discards all typed content with no restore.
- **Edit note** (tap card → edit → Save) / **Pin note** (toggleNotePin) /
  **Archive note** (edit form → Archive, plus card Archive) — optimistic mutate,
  `_notesActionInFlight`/`notesSaving` guards, rollback on failure. Found the
  stale-index rollback RISK below (edit/archive/delete vs the hardened create path).
- **Add library item** (search → select → Add → optimistic row → confirm → combine
  suggestion) and **Add custom item** (Custom Item → fill → Add) — both route through
  `addInventoryItem` → `apiAddInventory` / `apiAddCustomInventory`. Traced clean
  (see Note below).
- **Quick-adjust currency/delerium** and **Pay gold (Purchase route)** — through
  `apiQuickAddInventory` / `apiDepleteResource`, which call the silent-failure
  `appendResourceLedger_` (RISK below).

#### ~~BUG · Index.html:4650 · Failed note create loses all typed content~~ FIXED
Story **Create note**, step "Save → server returns !ok or failure". `saveNoteForm`
(create branch) builds the optimistic card, then `closeNoteForm()` + `renderNotesList()`
and fires `apiCreateNote`. On failure it only removes the temp card (`splice(tidx,1)` /
`filter`) and shows `setMainStatus('Save failed…')` — it never restores the Title,
Category, Note body, Tags, or Pinned the user typed. The form was already closed, and
the next `openNoteForm('add')` blanks every field, so the content is unrecoverable: the
user must retype the whole note. This is inconsistent with `addInventoryItem`
(Index.html:8179–8189 / 8214–8226), which snapshots the payload and restores every form
field on both the success-not-ok and failure handlers. Fix: capture a snapshot of the
five form values before `closeNoteForm()`, and on create failure re-open the sheet
pre-filled (or keep the sheet open with an inline `noteFormStatus` error until the
server confirms, mirroring the add-item pattern).

#### ~~RISK · Index.html:4628 · Edit/Archive/Delete note rollback uses a stale array index~~ FIXED
Stories **Edit note** / **Archive note** (+ `deleteNoteFromForm`). Each captures a
position index `idx = notesData.findIndex(...)` and, on failure, restores via
`notesData[idx] = backup` (saveNoteForm edit, 4637/4645) or
`notesData.splice(idx, 0, backup)` (archiveNote 4704/4712, deleteNoteFromForm
4595/4602). But the 20 s collaborative-sync poll calls `loadNotes(true)`, which
**replaces `notesData` with a fresh array** (4443). If another user's write is detected
mid-flight (Cross-cutting: collaborative-sync interference) and then the local op fails,
`idx` now points at a different note in the new array — the rollback overwrites or
misplaces an unrelated note until the next reload. The create branch was explicitly
hardened against exactly this (re-finds the temp by id, 4663–4670, with the comment
"loadNotes replaced notesData mid-flight"); edit/archive/delete were not. `toggleNotePin`
is safe because it holds the object reference, not an index. Fix: roll back by noteId
lookup (`findIndex` at handler time), not a captured index.

#### RISK · Code.js:1853 · Resource-ledger append failure is silent; client shows a phantom entry
Stories **Quick-adjust currency/delerium** (`apiQuickAddInventory`, 2713) and
**Pay gold — Purchase route** (`apiDepleteResource`, 2847). `appendResourceLedger_`
wraps its `appendRow` in `try/catch` that only `Logger.log`s on error and returns
nothing. Both callers invoke it, then unconditionally append the inventory row and
return `{ok:true, ledgerEntry: …}`. If the ledger append silently failed (schema drift,
transient sheet error), the client prepends a ledger entry to `inventoryResourceLedger`
(Index.html:8195) that was never persisted — it disappears on the next reload, while the
inventory gold/delerium row that backs it remains, leaving the ledger and the balance
out of sync with no error surfaced. Fix: have `appendResourceLedger_` signal failure and
have the API either roll back the inventory row or return `ok:false`.

#### IDEA · Index.html:4609 · Second note Save during an in-flight create is a silent no-op
`saveNoteForm` guards re-entry with `if (notesSaving) return;` but writes no feedback.
While create A is in flight the user can open the form, type note B, tap Save, and
nothing happens — the sheet looks frozen until A resolves. Minor, recoverable. Suggest a
brief `noteFormStatus` "Saving previous note…" message instead of a bare return.

#### Note · Code.js:2424 · Add library/custom item write paths trace clean
Stories **Add library item** and **Add custom item**. `apiAddInventory` /
`apiAddCustomInventory`: lock acquired after `requireAllowedUser_`, released in `finally`
on every path (success, validation throw, auth failure), `auditWrite_` records both
SUCCESS and FAILED, `bumpSync_` only on success. Client `addInventoryItem` keys the
optimistic row by `optId` and removes it in BOTH success and failure handlers, restores
all form fields and scroll/quick-add/size state on failure, and double-tap is guarded by
`clearAddForm()` synchronously emptying `#item` (a second tap reads an empty `rawName`
and early-returns). Navigate-away during the round-trip is safe: handlers operate on
`inventoryRows`/cache and `setMainStatus`, not on the active tab's DOM.

#### Note · Code.js:2939 · Ledger-note edit matches by Inventory ID, not timestamp
The returned `ledgerEntry.Timestamp` (rowObj['Date Added'], a separate `new Date()`)
differs by milliseconds from the timestamp `appendResourceLedger_` actually stamps
(1863), but `apiUpdateLedgerNote` matches by `entryId` (Inventory ID, 2939) first and
only falls back to timestamp when entryId is absent. Since both quick-add and deplete
set `inventoryId`, the mismatch is cosmetic and the **Edit ledger note** story is
unaffected.

### 2026-06-19 (run 30) — Sections audited: 4

Section 4 = Code.js lines 1701–2300 ("sell, combine, gold ops"). The literal
range is mostly client-sanitizers / ledger helpers (`sanitizeResourceLedgerForClient_`,
`getResourceLedgerForClient_`, `appendResourceLedger_`, `auditWrite_`), the sync
helpers (`bumpSync_` 2219, `apiGetSyncState` 2229), and the legacy campaign-notes
APIs. The actual sell/combine/gold APIs live outside the range and were traced
where they sit: `apiSellInventoryBatch` (671), `apiDepleteResource` (2773),
`apiUpdateLedgerNote` (2905), `apiReceiveResource` (2961), `apiSellInventoryItem`
(3046), `apiSellDelerium` (3101), `apiSplitGold` (3186), `apiSendGoldToMember`
(3324), `apiCombineInventoryItems` (3565). Client handlers: `confirmPayWithReason`
(Index.html:6104), `splitGold` (6184), `payResource` (6662), `undoResourcePay`
(6731), `receivedGold` (5460), `sellDelerium` (5254), `confirmSellBatch` (~5960),
`confirmCombineInventoryItem` (3455), `updateLedgerNoteFromBottom` (6411).

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Undo last pay** (Gold tab → Pay → character → Undo) — found the BUG below: the
  undo for a member-pay deletes only the pool-deduct row and leaves the +amount
  credit row in place, creating gold.
- **Pay gold** (Pay → route to Purchase or character → confirm) — `confirmPayWithReason`
  builds an optimistic pending ledger entry, clears inputs, `_inFlightWrites++`,
  routes to `apiSendGoldToMember` (member) or `apiDepleteResource` (Purchase). Both
  success/fail branches `removePending` + decrement; failure `restoreInputs`. Server
  writes credit+deduct rows (member) or single deduct (Purchase), lock released in
  `finally`. Clean except the undo wiring (see BUG) and a redundant-reload note.
- **Receive gold** (Got Paid → amount+note → confirm) — `receivedGold` → `apiReceiveResource`.
  Optimistic pending entry, clean rollback on both failure branches, lock released
  in `finally`. Clean.
- **Split gold evenly** (treasurer) — `splitGold` → `apiSplitGold`. Optimistic deduct
  pending entry; server deducts pool then credits each active non-DM member, remainder
  to pool; all ledger entries returned and merged; lock in `finally`. Double-tap
  guarded by immediate input-clear. Clean.
- **Edit ledger note** (tap entry → inline edit → Update Note) — `selectLedgerRowForEdit`
  / `updateLedgerNoteFromBottom` → `apiUpdateLedgerNote` (matches by entryId or
  normalized timestamp+resource). Buttons disabled during flight, re-enabled on
  failure, local entry patched on success. Clean.
- **Sell item / Sell batch** (description sheet → Sell for Gold → stepper; Sell Items
  batch) — `confirmSellBatch` → `apiSellInventoryBatch` (FIFO drain, deletes/decrements
  highest-row-first, appends gold row + ledger). Confirm button disabled during flight,
  re-enabled on failure. Pessimistic (rows removed only on success). See IDEA on the
  redundant `loadInventory(true)`.
- **Sell crystals / Receive crystals** (Delerium tab) — `sellDelerium` / delerium
  `apiReceiveResource` branch. Optimistic negative/positive rows + pending ledger,
  full snapshot revert on both failure branches, `refreshDeleriumStateFromInventory_`
  rebuilds counters. 0 gp inline-confirm path works. Clean.
- **Combine duplicate** (duplicate detected → combine sheet → Confirm) —
  `confirmCombineInventoryItem` → `apiCombineInventoryItems`. Double-tap guarded
  (`pendingCombineChoice` nulled first), failure restores choice for retry, server
  merges qty/holder/faction/notes and deletes source with row-shift adjustment.
  Clean.

#### ~~BUG · Index.html:6155 · Undo of a member-pay creates gold (only deduct row reversed)~~ FIXED

Story: **Undo last pay**, at the Undo step. When a treasurer routes a Pay to a
character, `confirmPayWithReason` calls `apiSendGoldToMember`, which writes TWO
inventory rows: `item` (Gold, Holder = recipient, Qty = **+amount**) and
`poolDeduct` (Gold, Qty = **−amount**) — a transfer that nets zero. On success the
handler stores the undo token as `lastResourceUndo['gold'] = { item: res.poolDeduct,
ledgerEntry: res.ledgerEntry }` (Index.html:6155) — i.e. it remembers **only the
deduct row**.

`undoResourcePay` (Index.html:6731) reverses by deleting a single inventory row:
`const itemId = undo.item['Inventory ID']` → `apiDeleteInventory({ inventoryId: itemId })`.
That deletes the −amount pool-deduct row but leaves the +amount credit to the
recipient untouched on both client and server. Net effect of "Undo Last Pay":
the pool is refunded **and** the recipient keeps the gold → `amount` gp is created
from nothing every time a member-pay is undone. (The "Undo Last Pay" button in the
gold sheet, Index.html:5450, only ever appears after a member-pay, because the
Purchase path via `apiDepleteResource` returns no `poolDeduct` and so never sets
`lastResourceUndo` — so every time this button is usable, it mis-reverses.)

Fix: the undo token must carry both inventory IDs (credit + deduct) and
`undoResourcePay` must delete both (ideally one server call that reverses the whole
SEND/SEND_DEDUCT pair atomically under the lock). The dashboard `payResource` undo
is correct because `apiDepleteResource` creates only one row.

#### ~~RISK · Index.html:6741 · Undo deletes inventory rows but leaves RESOURCE_LEDGER entries on the server~~ FIXED

`undoResourcePay` removes the matching `Inventory ID` from the in-memory
`inventoryResourceLedger` and deletes the inventory row via `apiDeleteInventory`,
but `apiDeleteInventory` does not touch the RESOURCE_LEDGER sheet. The SEND /
SEND_DEDUCT (or PAY) ledger rows persist server-side, so after the next
`loadInventory(true)` / 20 s sync the "undone" payment reappears in the ledger
history (and, combined with the BUG above, the orphaned credit row also reappears).
Locally the undo looks clean; a reload exposes the divergence. Consider having the
undo reverse the ledger entries too, or post a compensating REVERSAL entry.

#### ~~IDEA · Index.html:6028 · Sell-batch does an optimistic update then immediately full-reloads~~ FIXED

Story: **Sell item / Sell batch**, friction. `confirmSellBatch`'s success handler
optimistically rebuilds `inventoryRows` (decrement/remove sold rows, prime gold
item) and `renderInventory()` — then calls `loadInventory(true)` on the very next
line, forcing a full server round-trip that overwrites the just-applied optimistic
state. The optimistic block is effectively dead work and the extra reload can cause
a visible flicker / scroll reset and an unnecessary `apiGetInventory` call. Either
trust the optimistic update (drop the reload) or skip the optimistic rebuild and
rely on the reload — not both.

#### Note · Code.js:2905 · Ledger-note edit, receive, split, delerium, combine all traced clean

`apiUpdateLedgerNote` (entryId-or-timestamp match, schema-mismatch guarded, lock in
`finally`), `apiReceiveResource`, `apiSplitGold`, `apiSellDelerium`,
`apiSellInventoryBatch`, and `apiCombineInventoryItems` all validate before writing,
release the LockService document lock on every path including auth-failure and
error (`finally { try { lock.releaseLock() } catch {} }`), and return sanitized
optimistic payloads the client merges correctly. Stories confirmed clean: Receive
gold, Pay gold (Purchase path), Split gold evenly, Edit ledger note, Sell crystals,
Receive crystals, Combine duplicate, Sell item/batch (modulo the IDEA above). The
only economy-affecting defect found this section is the member-pay Undo BUG.

### 2026-06-19 (run 29) — Sections audited: 3

Section 3 = Code.js lines 1101–1700 ("inventory write — add, edit, delete").
The literal range is mostly helpers/validation/identity (`getInventorySpreadsheet_`,
`validate*_`, `requireAllowedUser_`, `getCharacterForEmail_`, etc.). The actual
inventory-write APIs live outside the range and were traced where they sit:
`apiAddInventory` (2424), `apiAddCustomInventory` (2533), `apiUpdateInventory`
(3408), `apiDeleteInventory` (3496), `apiCombineInventoryItems` (3565). Client
handlers: `addInventoryItem` (Index.html:8102), `saveInventoryEdits` (7401),
`deleteSelectedInventory` (7489), `giveItemToCharacter` (6045),
`confirmCombineInventoryItem` (3455).

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write path):

- **Edit inventory item** (swipe → Edit → change fields → Save) — found the BUG
  below: server `apiUpdateInventory` ignores Item/Category/Rarity from the payload
  while the client optimistically writes them to local state + cache → delayed
  silent revert. Qty/Holder/Value/Faction/Notes paths are clean (validated, then
  `writeInventoryRow_`, lock released in `finally`).
- **Add library item / Add custom item** — `addInventoryItem` builds an optimistic
  `_opt_` row, caches it, increments `_inFlightWrites`, calls `apiAddInventory` /
  `apiAddCustomInventory` / `apiQuickAddInventory`. Success removes opt row +
  `primeInventoryCacheAfterAdd`; both failure branches decrement the flag, strip
  the opt row, and restore every form field (incl. scroll spell + quick-add size).
  Found the RISK below (library add discards user-edited Category/Rarity). Custom
  add honors category/rarity (2562-2563) — clean.
- **Delete inventory item / swipe decrement** — `deleteSelectedInventory` snapshots
  `previousRows`, optimistically removes/decrements, both handlers restore
  `previousRows` on failure. Multi-qty delete requires a second "Confirm delete
  all" tap. Clean.
- **Combine duplicate** — `confirmCombineInventoryItem` copies `pendingCombineChoice`,
  nulls it, restores it on failure (retry works without reload). Client rollupKey
  (item|category|rarity, 6609) matches server's combine equality check (3596-3601)
  — consistent. Clean.
- **Give item to character** — `giveItemToCharacter` optimistic holder swap, both
  handlers revert `item['Holder']`/row on failure. Clean (note: the
  `cacheInventoryRows` at 6059 runs after `_inFlightWrites++` so it no-ops, but the
  success handler re-caches — harmless).

#### ~~BUG · Code.js:3408 · apiUpdateInventory silently drops Item / Category / Rarity edits~~ FIXED
**Story: Edit inventory item, at the Save step.** The edit form (desktop `editItem`/
`editCategory`/`editRarity` at Index.html:2150/2174/2178; mobile `sheetEdit*` at
2357/2381/2385) exposes Item, Category, and Rarity as plain editable `<input>`s.
`getInventoryEditorValues()` (Index.html:7358) puts all three in the payload, and
the optimistic `updateInventoryRowLocally()` (7436) writes them into the in-memory
row **and** into the localStorage cache (`cacheInventoryRows` at 7425). But
`apiUpdateInventory` builds its row as `{...existingObj, 'Inventory ID', 'Qty',
'Holder', 'Value GP', 'Total Value GP', 'Faction Relevance', 'Notes'}` (3440-3449)
and **never reads `payload.item`, `payload.category`, or `payload.rarity`** — those
fields are taken from `existingObj` (the old sheet values) via the spread.

Result: a user who renames an item or re-categorizes it (e.g. moves it from
Treasure → Potions) taps Save, sees optimistic success ("Updated …") and the row
move groups immediately. The sheet keeps the OLD values. On the next full reload or
collaborative sync — `loadInventory(true)` fired by the 20 s poll on any other
user's write — `inventoryRows` is replaced with server data and the name/category/
rarity silently revert. This is delayed data loss (the cache also holds the wrong
value, so even a same-user reload shows new→old flip). No error is ever surfaced.

Fix: in `apiUpdateInventory`, read and validate the three fields like the others,
defaulting to existing when undefined, e.g.
`'Item': validateText_(payload && payload.item === undefined ? existingObj['Item'] : payload.item, 'Item name', 200)`,
`'Category': normalizeInventoryCategory_(payload && payload.category === undefined ? existingObj['Category'] : payload.category)`,
`'Rarity': validateText_(payload && payload.rarity === undefined ? existingObj['Rarity'] : payload.rarity, 'Rarity', 60)`.
(If renaming/recategorizing is intentionally disallowed, make the inputs readOnly
instead so the client stops promising a change it can't keep.)

#### ~~RISK · Code.js:2424 · apiAddInventory discards user-edited Category / Rarity on library adds~~ FIXED
Same root cause, lower blast radius. In the Add Item form the `category`/`rarity`
inputs (Index.html:2297/2301) stay editable after a library item is selected
(`fillAddFormFromEquipment` at 7806 fills them but does not set readOnly). The
optimistic row uses `payload.category`/`payload.rarity` (8145-8146), but
`apiAddInventory` derives Category from `libraryItem.category` (2467) and Rarity
from `libraryItem.rarity` (2468) and ignores the payload values (only
`payload.item` is honored, for the name, at 2465). So a category/rarity edit the
user makes before tapping Add flashes in the optimistic row, then snaps back when
`primeInventoryCacheAfterAdd(res.item)` swaps in the server row. Less harmful than
the edit case (revert is immediate, not delayed), but the user's input is still
silently dropped. Either honor the payload values for library adds or make those
inputs readOnly in library mode.

#### ~~IDEA · Index.html:7401 · Edit save leaves the editor open; inconsistent with give/delete~~ FIXED
After a successful `saveInventoryEdits`, the success handler shows "Saved." but
does not close the editor panel (`closeInventoryPanels` is never called), so the
user must manually dismiss it. The adjacent write flows — `giveItemToCharacter`
(6068) and `deleteSelectedInventory` (7542) — close panels immediately on the
optimistic path. The Edit flow feels heavier for no reason; consider closing the
editor on success (the inventory list already reflects the change optimistically).

#### Note · Code.js:3496 · Delete / Combine / Give server paths clean
`apiDeleteInventory`, `apiCombineInventoryItems`, and the holder-only
`apiUpdateInventory` path all validate IDs up front, resolve rows via
`getInventoryRowObjectById_`, mutate once, and release the document lock in a
`finally` on every path (success, validation throw, lock-timeout early return).
Combine correctly adjusts the target row number after deleting the (possibly
lower-indexed) source row (3642). Stories traced: Delete inventory item, Combine
duplicate, Give item to character — no defects in these three.

### 2026-06-19 (run 28) — Sections audited: 2

Section 2 = Code.js lines 501–1100 (auth, character, inventory read). The titled
"inventory read" (`apiGetInventory`) actually lives at 1958 (section 4); the read
APIs physically in this range are `apiSearchEquipment` (595, dead — client uses
`apiGetEquipmentIndex` at 7682 only), `apiGetEquipmentIndex` (632),
`apiGetEquipmentItem`/`apiGetItemDetails` (655/878), `apiGetCharacters` (762),
`apiGetMyCharacter`/`apiSetMyCharacter`/`apiForgetMyCharacter` (830/859/868),
`apiGetCategories`/`apiGetQuickAddItems` (882/891). The one write path in-range is
`apiSellInventoryBatch` (671). Identity helpers `resolveIdentityForCharacter_`
(1282), `getUserProfileForKey_` (1307), `saveUserProfile_` (1331) read outside
the range.

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on each write/read path):

- **View item details** — tap card → `openDescriptionSheet` (Index.html:6905) →
  `apiGetEquipmentItem` (655) → `getEquipmentItemById_` (1745). Found the BUG
  below (failure poisons `itemCache`) and the RISK below (blank body on failure).
- **Add library item (search → select → preview)** — `apiGetEquipmentIndex` (632)
  loads the in-memory index once; client filters locally; select fires
  `apiGetEquipmentItem` (8099). Failure path here is clean (does NOT cache null —
  see BUG contrast).
- **Sell item / Sell Items batch** — `apiSellInventoryBatch` (671). Re-traced:
  validates `goldAmount`/`note`/`character` (681–683) BEFORE any mutation, resolves
  all rows up front, sorts highest-row-first so `deleteRow` shifting only touches
  already-processed rows, `tryLock(10000)` with `finally` release on every path.
  Gold append re-reads headers post-delete. Clean — no new finding (prior clamp +
  lock findings already FIXED/confirmed at lines 304, 746, 869, 927).
- **Give item to character** — dropdown sourced from `apiGetCharacters` (762);
  `loadCharacters` (2927) failure handler degrades to "Party / shared" only
  (already noted, line 205). DM rows split into `dmRows`; non-DM `rows` feed the
  give/holder selectors — intended.
- **Identity (first open + remembered)** — `apiGetMyCharacter` (830): temp-key
  profile → email → client hint, in that order; `resolveIdentityForCharacter_`
  computes treasurer from `getAdminEmails_().includes(email)` or DM prefix.
  `getUserProfileForKey_` writes `Last Seen` inside a read (already noted, 652).
  No new finding.

#### ~~BUG · Index.html:6948 · Description-sheet detail failure caches `null`, poisoning `itemCache` and blocking retry for the session~~ FIXED
Story: **View item details**, failure-at-step (the `apiGetEquipmentItem` round-trip).
The failure handler does `itemCache[libraryItemId] = null` (6948). The gate at 6931
treats any *defined* value (including `null`) as "known", so a single transient
network failure permanently routes every future open of that item to
`applyItemToDescSheet_(null)` → "No description available." with the stat block
hidden, for the rest of the session, even after the network recovers — the server
is never retried. Worse, `itemCache` is shared with the **Add library item**
preview (8063): a poisoned `null` makes 8064 skip the `Object.assign` and show
"Description loaded." over a stat-block-less form, silently hiding the real library
data there too. The Add path proves the intended contract: its handlers cache
`res.item` only on success (8087) and never cache on failure (8093–8098). The
description sheet should match — only the **success** handler legitimately caches
(including `null` for a genuine not-found at 6942–6943, which correctly avoids
re-fetching a truly missing item). Fix: drop the `itemCache[libraryItemId] = null`
write from the failure handler at 6948 so the next open retries; keep the
`capturedId` guard.

#### ~~RISK · Index.html:6936 · Detail-fetch failure with no user notes leaves the description body blank instead of a fallback message~~ FIXED
Story: **View item details**, failure-at-step. Pre-fetch, `descText` is set to
`userNotes || ''` (6936). On failure the handler only clears `descStatus` (6949)
and never repaints `descText`, so an item with no notes shows a completely blank
sheet body — no "No description available.", no error. The success-with-null path
(item not found) shows "No description available." via `mergeDescAndNotes_('', '')`
(6918). Inconsistent feedback for two outcomes the user can't distinguish. Fix:
in the failure handler set `descText.textContent = userNotes || 'No description
available.'` (and, if combined with the BUG fix, optionally leave a retry-on-next-open
path). Cosmetic-but-confusing, hence RISK.

#### Note · Code.js:671 · `apiSellInventoryBatch` write ordering re-confirmed clean (Sell item / Sell batch)
Validation precedes mutation; rows resolved before any delete; highest-row-first
ordering makes `deleteRow` index-shift safe; lock acquired with `tryLock(10000)`
and released in `finally` on success, error, and busy paths. Gold row + ledger +
audit + `bumpSync_` all fire only after successful drains. No data-loss or
partial-rollback gap found in this section's pass.

### 2026-06-19 (run 27) — Sections audited: 1

Section 1 = Code.js lines 1–500 (config, helpers, validation). This range holds
the CONFIG object, the sheet-header constants, `QUICK_ADD_ITEMS`,
`DELERIUM_SIZE_VALUES`, `APPROVED_INVENTORY_CATEGORIES`, the admin menu
(`onOpen`), the web-app entry (`doGet`/`include_`), and the admin-only
setup/import tooling (`setupInventoryTabs`, `resetAppDataSheets`,
`setupLookupsSheet_`, `resetCleanEquipmentLibrary`, `continueCleanEquipmentLibrary`).
The validation/helper *functions* the section title alludes to (`safeText_`,
`validateText_`, `validateMoney_`, `normalizeInventoryCategory_`,
`requireAllowedUser_`, etc.) are all defined past line 500, so no user-facing
write path executes inside 1–500. The story-surface here is the **constants and
maps** that the catalog write paths consume; each story below was traced from
its client tap through to the server code that reads a section-1 constant, then
back, to confirm the config is internally consistent and mirrored correctly on
the client.

Stories traced (happy → failure-at-step → navigate-away → friction, with
execution-trace + state-machine on the consuming write path):

- **Add library item (quick-add)** — client mirror at `Index.html:2855-2861`
  sends `quickKey` → server `getQuickAddDefinition_` (1813) → `QUICK_ADD_ITEMS`
  (53) → `apiQuickAddInventory` (2632).
- **Add custom item** — category dropdown sourced from
  `APPROVED_INVENTORY_CATEGORIES` (30) via `apiGetInventoryCategories` (885) →
  `apiAddCustomInventory` (2533) → `normalizeInventoryCategory_` (993).
- **Quick-adjust currency / delerium** — `getQuickEditType` (Index.html:7094)
  classifies the existing row; server validates sizes against
  `DELERIUM_SIZE_VALUES` (43) in `apiAdjustInventory`/quick-add paths
  (2664, 2791, 3775).
- **Create note** — touches the section-1 `CAMPAIGN_NOTES_HEADERS` constant
  (135); traced to disambiguate the two coexisting note backends (below).

#### ~~RISK · Code.js:135 · Two parallel note backends share no schema; only one is documented~~ FIXED
`CAMPAIGN_NOTES_HEADERS` (5 columns: Note ID · Created At · Updated At ·
Updated By · Body) backs the **legacy** "campaign notes" feature on the
`CAMPAIGN_NOTES_FEED` sheet (`CONFIG.NOTES_SHEET`, line 22), consumed by
`apiGetCampaignNotes`/`apiAddCampaignNote`/`apiUpdateCampaignNote`/
`apiDeleteCampaignNote` (Code.js 1994–2191) and live in the client at
`Index.html:3407/3589/3861/3893`. Separately, `PARTY_CAMPAIGN_NOTES_HEADERS`
(11 columns, defined at 2248) backs the **current** Party Notes feature on the
`NOTES` sheet (`PARTY_NOTES_SHEET`, 2255), consumed by
`apiGetNotes`/`apiCreateNote`/`apiUpdateNote`/`apiArchiveNote` (2282–2436) and
live in the client at `Index.html:4452/4649/4686/4605`. Both backends are wired
and reachable; the README's "Party Notes" section documents only the 11-column
schema and never mentions the 5-column legacy store. No behavioral bug today —
each API set is internally consistent and writes to its own sheet — but the
silent coexistence is a real maintenance hazard: a future edit to "the notes
sheet" can easily target the wrong store, and the Create-note story's
single-Body legacy form (`apiAddCampaignNote({body})`) drops every field the
Party Notes form collects (title/category/tags/pinned). Recommend documenting
the split (or retiring the legacy feature) and renaming one constant so the two
are not confused at a glance.

#### ~~RISK · Code.js:290 · `resetAppDataSheets` wipes the CHARACTERS roster (and Email column), breaking identity for every player~~ FIXED
`resetAppDataSheets` (290) calls
`clearSheetToHeaders_(getOrCreateSheet_(ss, CONFIG.CHARACTERS_SHEET), CHARACTERS_HEADERS)`
at line 300 — it clears the roster, including the `Email` column that
`apiGetMyCharacter`/`getEmailForCharacter_` depend on for identity resolution.
The README "Reset Script" section advertises that reset "preserves CHARACTERS
and equipment library sheets," but that promise belongs to `Reset.js`'s
`resetCampaignData()`; this *separate* `resetAppDataSheets` does the opposite.
It is not exposed in the `onOpen` menu (only callable from the Apps Script
editor), so blast radius is limited to an admin who runs the wrong function —
but the consequence is severe (all players fall back to the identity overlay
and lose character→email scoping until the roster is re-entered). Recommend
dropping CHARACTERS from the cleared list here, or renaming the function to make
its destructiveness explicit.

#### Note · Code.js:53 · Quick-add config parity (client ↔ server) is clean; delerium/currency quick-add is intentionally absent
Verified that the 7 `QUICK_ADD_ITEMS` server entries (53–61) match the client
mirror at `Index.html:2855-2861` on `quickKey`, `name`, `category`, `rarity`,
and `valueGp` (health 50 / greater-health 150 / rations 0.5 / others blank), so
the **Add library item (quick-add)** optimistic row renders the same values the
server persists. `getQuickAddDefinition_` (1813) only ever returns one of these
7, none of which carry `editType` `'currency'` or `'delerium crystal'`; the
client likewise exposes no delerium/currency quick-ADD tile (those editTypes
come from `getQuickEditType` on an existing row, i.e. the quick-*adjust* flow).
The `editType === 'currency' || 'delerium crystal'` ledger branch inside
`apiQuickAddInventory` (2700–2714) is therefore unreachable defensive code, not
a live path — no behavioral issue, recorded here only to close the trace and
explain why the run-26 "delerium quick-add size" fix has no remaining server
consequence.

#### Note · Code.js:993 · Custom-item category validation closes cleanly over the approved set
`normalizeInventoryCategory_` (993) returns `map[normalized] || value || 'Other'`.
All 10 `APPROVED_INVENTORY_CATEGORIES` values lowercase to keys present in the
map (`armor / shield`, `weapon`, `potion`, `scroll`, `wondrous item`,
`ammunition`, `tool / gear`, `currency`, `delerium`, `other`), so the **Add
custom item** story — whose dropdown is populated *from* that approved list —
always round-trips its category unchanged. (Worth noting for later sections: an
*unmapped* category passes through verbatim rather than collapsing to `Other`,
so library imports or future callers that supply a non-approved category would
store it raw; harmless for the catalog stories because client-side inventory
grouping is name-heuristic-driven, not server-category-driven.)

### 2026-06-19 (run 26) — Sections audited: 13

Section 13 = Index.html 7501–end (add item flow, custom item, form handling), the last section before the cursor wraps to 1. Stories traced through this range, each happy → failure-at-step → navigate-away → friction with execution-trace + state-machine on every write path:

- **Add library item** (`searchEquipment` 7681 → `selectEquipmentResult` 7772 → `loadSelectedDescription` 8042 → `addInventoryItem` 8088 → combine via `findDuplicateInventoryCandidate`/`showCombineChoice`)
- **Add custom item** (`startCustomItem` 7951 / `customizeSelectedItem` 7979 → `addInventoryItem` → `apiAddCustomInventory`)
- **Add library item (quick-add / delerium size variant)** (`fillAddFormFromEquipment` 7792 delerium branch → `addInventoryItem` → `apiQuickAddInventory`)
- **Swipe delete / remove-one tail** (`apiAdjustInventory` / `apiDeleteInventory` optimistic block 7505–7565, already covered in run 24/25 but re-verified here for rollback symmetry)
- Cross-cutting **sync interference**, **tab-switch in-flight**, and **iOS background/foreground** (`visibilitychange` 8335) where they intersect the add write path.

#### ~~BUG · Index.html:8221 · Delerium quick-add always sends `size: ''` — `clearAddForm()` runs before the runner reads the active-class~~ FIXED
Story: **Add library item** (quick-add path, delerium crystal variant). In `addInventoryItem`, `clearAddForm()` is called at line 8143 — synchronously, before the server runner is dispatched. `clearAddForm` removes the active class from `#quickAddSizeField` (line 8262). The `apiQuickAddInventory` call is then built at 8212–8226 and reads the size like this:
```
size: document.getElementById('quickAddSizeField').classList.contains('active')
  ? document.getElementById('quickAddSize').value
  : '',
```
By the time this line executes, the active class has already been stripped, so the ternary always evaluates to `''`. The server (`apiQuickAddInventory`, Code.js:2662) uses `payload.size` to build the item name (`Delerium Geode` → falls back to a generic name when blank, Code.js:2668-2669), the ledger `subtype` (2705), and the "Size: …" note (2674). Net effect: a user who opens Add Item, selects a delerium crystal quick-add, picks a size from the dropdown, and taps Add gets a generic crystal (server falls back to `quick.size || 'crystal'`) — their size selection is silently dropped on every add. Fix: capture the size into a local variable *before* `clearAddForm()` (e.g. read it alongside `quickKey` at the top of `addInventoryItem`), and pass that captured value into `apiQuickAddInventory`. The same root cause means the failure-restore path can't recover the size either (see RISK below).

#### ~~RISK · Index.html:8158 · Add-failure restore re-derives quick-add size from the item *name*, losing a user's dropdown override~~ FIXED
Story: **Add library item** (quick-add delerium), failure-at-step. When the add fails, both the `!res.ok` branch (8158) and the failure handler (8192) restore the form via `fillAddFormFromEquipment(selectedSnapshot, false)`. For a delerium quick-add that helper re-derives the size purely from the item *name* (7852-7861), so it reactivates the size field but resets the dropdown to the name-implied default. If the user had changed the dropdown to a different size before submitting, that choice is gone after a failed add — they must re-pick before retrying. Lower severity than the BUG above only because the BUG already prevents the size from reaching the server at all; once the BUG is fixed by snapshotting the size, the restore path should restore that same snapshot rather than re-deriving from the name.

#### Note · Index.html:8088 · Add-item rollback, in-flight balance, and double-tap guard are clean
`addInventoryItem` was traced end-to-end for the **Add library item** and **Add custom item** stories. Confirmed clean: the optimistic row (`_opt_` id, 8121-8138) is removed in all three terminal branches (success-ok 8154, success-not-ok 8154, failure 8188); `_inFlightWrites` is incremented once (8149) and decremented on every path (8152 / 8187), so the in-flight counter cannot leak from this flow; both failure branches fully restore `selectedEquipment` and every form field from `payloadSnapshot`/`selectedSnapshot` (incl. scroll spell reconstruction 8170/8206), so the user can retry without reloading. Double-tap on Add is guarded structurally: `clearAddForm()` (8143) empties `#item` before the round-trip resolves, so a second tap hits the empty-name guard at 8093 and aborts rather than double-posting. Combine suggestion (`findDuplicateInventoryCandidate`/`showCombineChoice`, 8183-8184) correctly fires only on the success-ok branch after the real server row is primed. Navigate-away during the round-trip is safe: the optimistic row already lives in `inventoryRows` + cache, and the success handler renders unconditionally (8181) so the confirmed row appears on return.

### 2026-06-19 (run 25) — Sections audited: 12

**Audited against the post-fix tree (commit 0191357 "Fix all open findings from CCR audit runs 22-24", which rewrote ~290 lines of Index.html). Line numbers below are for the current file.** Stories traced through Index.html 6001–7500 (gold pay/split tail, resource-breakout dashboard, ledger-note edit, inventory groups + rollup, item-description sheet, description-remove, quick-edit currency/delerium, full inventory edit, inventory delete), each traced happy → failure-at-step → navigate-away → friction with execution-trace + state-machine on every write path: **Pay gold** (`confirmPayWithReason` 6097), **Split gold evenly** (`splitGold` 6174), **Edit ledger note** (`selectLedgerRowForEdit` / `updateLedgerNoteFromBottom` / `cancelLedgerEdit`), **Undo last pay** (`payResource` / `undoResourcePay` / `renderResourceBreakout` 6231), **View item details** (`openInventoryDescription` 6883), **Remove item** (`confirmDescRemove` 6984), **Give item to character** (`openGiveItemSheet` / give-tail), **Quick-adjust currency/delerium** (`openQuickEditPanel` / `confirmQuickEdit` 7226), **Edit inventory item** (`selectInventoryItem` / `saveInventoryEdits` 7390), **Delete inventory item** (`deleteSelectedInventory` 7475), plus the inventory-group render/rollup path (`buildInventoryGroups` / `rollupInventoryRows`) and the three cross-cutting sync stories where they intersect these write paths.

**Re-verification note:** the run-22-24 fix commit already closed the two `_inFlightWrites` gaps I would have flagged here — `confirmPayWithReason` now does `_inFlightWrites++` (6160) and `--` in both handlers (6134/6152) plus `restoreInputs()` (6128); `splitGold` now brackets too (6200/6203/6223); `confirmQuickEdit` now brackets (7248/7252/7275). Those are confirmed fixed and are **not** re-reported below. The remaining findings survive in the current tree.

#### ~~BUG · Index.html:6231 · "Undo last pay" is unreachable — the only Undo affordance lives in `renderResourceBreakout`, which is never rendered~~ FIXED
Story: **Undo last pay** ("Undo button appears after pay → tap to reverse"). The Undo button (6178/`undo` block), the `payResource` Pay button, and the `lastResourceUndo`/`undoResourcePay` machinery are all rendered exclusively inside `renderResourceBreakout` (6231). A full-file search for call sites of `renderResourceBreakout` finds **none** — it is never invoked anywhere (verified again against the post-fix tree). The reachable pay path is the gold sheet's **Pay → openPayReasonSheet → confirmPayWithReason (6097)**, which posts the deduction and shows the ledger entry but renders **no Undo button** (the gold/delerium sheets call `renderResourceLedger` directly, never `renderResourceBreakout`). Net effect: after a user pays gold there is no way to reverse it from the UI — the catalogued "Undo last pay" story cannot be completed. `undoResourcePay` itself is correctly written (snapshots rows+ledger, `_inFlightWrites++`, dual rollback) but is dead because nothing ever sets `lastResourceUndo` on the live path. Fix: either wire an undo affordance into `confirmPayWithReason`/`renderGoldSheetBody` (capture the committed ledger entry + pool-deduct row, expose an Undo that calls `apiDeleteInventory` on the deduct row like `undoResourcePay` does), or remove the story from the catalog. This is a behavioral feature gap, not dead-code cleanup.

#### ~~RISK · Index.html:7390 · `saveInventoryEdits` omits `_inFlightWrites` (full inventory edit) — only write path in this section still missing the guard~~ FIXED
Story: **Edit inventory item**, collaborative-sync interference. The edit save (`apiUpdateInventory` at 7419) is non-optimistic and applies `updateInventoryRowLocally(payload)` (7411) only after success, then `cacheInventoryRows(inventoryRows)` (7412) and `renderInventory()`. With `_inFlightWrites` at 0 the whole round-trip is unprotected: a foreign poll mid-save runs `loadInventory(true)` and replaces `inventoryRows`; the by-id patch self-heals the visible row, but the unguarded cache write (7412) can race the reload's own cache write and briefly desync localStorage from `inventoryRows`. Now that the fix commit added the guard to `confirmPayWithReason`/`splitGold`/`confirmQuickEdit`, `saveInventoryEdits` is the lone in-section write path still lacking it. (Note: the single-argument `cacheInventoryRows(inventoryRows)` at 7412 is **safe** — the missing `resourceLedger` param falls back to the live `inventoryResourceLedger` global at 2938, so the cached ledger is not wiped.) Low impact; bracket the round-trip in `_inFlightWrites++/--` for consistency with the now-uniform sibling pattern.

#### ~~RISK · Index.html:6936 · `openInventoryDescription` failure handler lacks the `capturedId` navigate-away guard the success handler has~~ FIXED
Story: **View item details**, navigate-away. The async `apiGetEquipmentItem` success handler correctly bails if the user moved on (`if (!selectedInventory || selectedInventory['Inventory ID'] !== capturedId) return;`, 6931). The matching failure handler (6936–6939) has **no such guard** — it unconditionally sets `itemCache[libraryItemId] = null` and clears the shared `descriptionStatus` element. If item A's fetch fails after the user has closed the sheet and opened item B (whose own fetch is showing "Loading description…"), A's failure clears B's loading status prematurely. Transient/cosmetic (B's success then repaints), hence RISK. Fix: mirror the success-handler `capturedId` guard before touching `descStatus`.

#### Note · Index.html:6984 · `confirmDescRemove`, `deleteSelectedInventory`, and `openInventoryDescription` traces are clean; gold/quick `_inFlightWrites` gaps confirmed fixed (positive baseline)
Stories: **Remove item**, **Delete inventory item**, **View item details**, **Pay gold**, **Split gold evenly**, **Quick-adjust currency/delerium**. `confirmDescRemove` (6984) snapshots `previousRows` before the optimistic FIFO drain, increments `_inFlightWrites` (7027), and on BOTH failure paths restores rows, re-renders, AND emits `setMainStatus('<span class="error">Remove failed…')` (7035/7046) — the clear-feedback-on-failure that `confirmSellItem` (run-24 BUG 5602) was missing. `deleteSelectedInventory` (7475) captures `previousRows`, `_inFlightWrites++`, and restores + re-renders on both `!res.ok` and failure, with the qty>1 "Confirm delete all" gate and `decrementOnly` swipe path tracing cleanly. The post-fix gold paths (`confirmPayWithReason` 6097, `splitGold` 6174) and `confirmQuickEdit` (7226) now bracket their round-trips in `_inFlightWrites` and restore inputs on failure — the run-22-24 fix commit closed those, verified here.

### 2026-06-19 (run 24) — Sections audited: 11

**Stories traced through Index.html 4501–6000 (notes create/edit/pin/archive/delete handlers, identity apply/confirm, gold sheet open/scope/render, gold receive, pay-reason routing, delerium receive/sell, item sell from description sheet, give-to-character, and the full batch-sell sheet).** Stories touching this range, traced fully (happy → failure-at-step → navigate-away → friction, with execution-trace + state-machine on each write path): **Receive gold** (`receivedGold` 5391), **Pay gold** (`openPayReasonSheet` 5451 → `confirmPayWithReason` 6021), **Split gold evenly** (button gate `renderGoldSheetButtons` 5380 → `splitGold` 6089), **Receive crystals** (`receiveDelerium` 5101), **Sell crystals** (`sellDelerium` 5198), **Sell item** (`openSellItemSheet` 5520 → `confirmSellItem` 5540), **Give item to character** (`openGiveItemSheet` 5489 → `giveItemToCharacter` 5962), **Sell Items batch** (`openSellBatchSheet` 5612 → `confirmSellBatch` 5897), **Create/Edit/Pin/Archive note** (`saveNoteForm` 4580 / `toggleNotePin` 4673 / `archiveNote` 4651 / `deleteNoteFromForm` 4558), and the cross-cutting **Collaborative sync interference** / **Tab-switch in-flight** / **iOS background/foreground** stories as they intersect these write paths (`pollSync` 4350/4357, `loadInventory` 4123, `loadNotes` 4421).

#### ~~BUG · Index.html:5422 · `receivedGold` (and `confirmPayWithReason`/`splitGold`) never increment `_inFlightWrites` — optimistic gold ledger entry gets clobbered or duplicated by a foreign-sync reload~~ FIXED
Stories: **Receive gold** / **Pay gold**, navigate-away + collaborative-sync interference. `receiveDelerium` (5147) and `sellDelerium` (5255) bracket their round-trip in `_inFlightWrites++/--`, so `pollSync` defers a foreign reload while they are in flight (4350). The gold paths do **not**: `receivedGold` (server call at 5422), `confirmPayWithReason` (6078/6083), and `splitGold` (6089+) each push an optimistic `_pending` entry into `inventoryResourceLedger` and then call the server with `_inFlightWrites` left at 0. Sequence: (1) I tap Got Paid → pending entry prepended, rendered. (2) Another player commits any inventory write → `SYNC_INVENTORY` marker = `{ts, them}`. (3) My 20 s poll fires; because `_inFlightWrites === 0` it does **not** take the defer branch — it runs `loadInventory(true)`, whose success handler unconditionally does `inventoryResourceLedger = newLedger` (4124), wiping my optimistic pending entry. (4a) If my `apiReceiveResource` had **not** yet committed, the fetched ledger lacks my entry → my success handler later re-prepends `res.ledgerEntries`, net correct. (4b) If it **had** committed before the fetch, the fetched ledger already contains my real entry; my success handler then prepends `res.ledgerEntries` **again** → the gold receive/pay shows **twice** in the ledger until the next foreign reload or 60 s revalidation. Either way the optimistic entry is not protected the way delerium's is. Fix: wrap each gold write's round-trip in `_inFlightWrites++` / `--` (decrement in both success and failure handlers), exactly as `receiveDelerium`/`sellDelerium` already do. `confirmPayWithReason`/`splitGold` live in section 12 and will be re-confirmed there, but the root asymmetry is the same single fix.

#### ~~BUG · Index.html:4421 · Create note silently lost when a foreign notes-sync reload lands during the create round-trip~~ FIXED
Story: **Create note**, collaborative-sync interference. Unlike the inventory branch, the `pollSync` notes branch (4357–4360) has **no `_inFlightWrites`/`notesSaving` defer** — any foreign notes write triggers `loadNotes(true)` immediately. `loadNotes` success then does `notesData = res.notes` unconditionally (4421). Sequence: (1) I tap Save on a new note → optimistic temp card (`NOTE_TEMP_…`) pushed into `notesData` (4623), `apiCreateNote` in flight. (2) Another player creates/edits a note → `SYNC_NOTES` marker bumps. (3) My poll fires → `loadNotes(true)` → `notesData` replaced with the server fetch, which does **not** contain my temp card (and, if my create hasn't committed yet, doesn't contain the real note either). (4) My `apiCreateNote` success handler runs `const tidx = notesData.findIndex(x => x.noteId === tempId)` → `-1`, so `if (tidx >= 0) notesData[tidx] = res.note` (4632) is skipped — **the newly created note is never inserted into local state**. The card vanishes from my screen even though it was saved server-side; it only reappears on the next full reload. Fix: in the create success handler, when `tidx < 0`, still merge the note in (`if (!notesData.some(n => n.noteId === res.note.noteId)) notesData.unshift(res.note)`); better, give in-flight note writes a defer guard mirroring inventory's `_inFlightWrites` so `pollSync`/`loadNotes` don't clobber `notesData` mid-write. Same exposure (weaker) applies to optimistic edit/pin/archive whose success/failure handlers index `notesData` by id after a possible reload.

#### ~~BUG · Index.html:5602 · `confirmSellItem` reverts silently on failure — no error feedback to the user~~ FIXED
Story: **Sell item** (description sheet), step b (failure at server call). Before the round-trip, `confirmSellItem` closes the sell sheet, description sheet, and inventory panels (5569–5571), then optimistically decrements the rows. On failure, both the `!res.ok` branch (5591–5595) and the `withFailureHandler` (5602–5606) restore `previousRows` and `renderInventory()` but emit **no message at all** — no `setMainStatus`, no toast. The user tapped "Sell for Gold", watched the item quantity drop, and then sees it silently pop back to its old value with zero explanation; they cannot tell whether the sale failed or whether they mis-tapped. Compare `giveItemToCharacter`, which calls `setMainStatus('<span class="error">Give failed — change reverted.</span>')` on both failure paths (6003, 6016). Fix: add a `setMainStatus('<span class="error">Sell failed — change reverted.</span>')` to both failure paths of `confirmSellItem`.

#### ~~RISK · Index.html:5413 · Resource write handlers clear the amount/note inputs before the server call and never restore them on failure~~ FIXED
Stories: **Receive gold** (`receivedGold` clears `goldSheetAmount`/`goldSheetNote` at 5413–5414), **Receive crystals** (`receiveDelerium` clears the note at 5141), **Sell crystals** (`sellDelerium` clears gold+note at 5250–5251). All three clear the inputs optimistically, then on the failure path (5425/5440, 5172, 5267/5295) show an error but leave the inputs blank. The user must re-type the amount and note to retry. For a one-off small amount this is mild friction, but for a large/awkward number or a long note it is real re-entry cost and inconsistent with the inputs-restored expectation. Fix: snapshot the entered amount/note and restore them into the fields on the failure branches (or defer clearing until success).

#### ~~RISK · Index.html:5923 · `confirmSellBatch` omits `_inFlightWrites` and applies its optimistic decrement inside the success handler over possibly-reloaded rows~~ FIXED
Story: **Sell Items batch**, collaborative-sync interference. Unlike `confirmSellItem` (which increments `_inFlightWrites` at 5574), `confirmSellBatch` calls `apiSellInventoryBatch` (5923) with the flag left at 0, and it applies the row decrement only **after** success (5932–5942) against the live `inventoryRows`. If a foreign poll fires during the round-trip, `pollSync` does not defer (flag is 0) and runs `loadInventory(true)`; should the batch sell have already committed server-side, the refetched rows already reflect reduced quantities, and the success handler then subtracts `soldIds` **again** → a transient double-decrement is shown. It self-heals because the success handler's own trailing `loadInventory(true)` (5946) refetches authoritative rows, so the wrong quantity is visible only briefly — hence RISK, not BUG. Fix: bracket the round-trip in `_inFlightWrites++/--` for consistency with the other write paths, and/or rely solely on the trailing `loadInventory(true)` rather than the local decrement.

#### ~~RISK · Index.html:4673 · Note pin/archive/delete have no in-flight guard — double-tap pin can desync~~ FIXED
Story: **Pin note**, double-tap race. `saveNoteForm` is guarded by `notesSaving` (4581), but `toggleNotePin` (4673), `archiveNote` (4651), and `deleteNoteFromForm` (4558) are not. Rapid double-tap of the pin button issues two `apiUpdateNote` calls with opposite `Pinned` values; whichever the server applies last wins, and if that differs from the final optimistic local state the card's pin indicator stays wrong until the next reload. Low impact (single small button, self-heals on reload), but a per-note in-flight flag or button disable during the round-trip would close it.

#### Note · Index.html:4955 · Ledger-edit teardown on sheet close is clean (positive baseline)
Story: **Edit ledger note** (gold + delerium). `closeGoldSheet` (5314) and `closeDeleriumSheet` (4955) both call `cancelLedgerEdit()` when `ledgerEditTarget` is set before removing the sheet, so navigating away mid-edit does not leave the next open of the sheet stuck in note-edit mode. The render branches in `renderGoldSheetButtons` (5368) and `renderDeleriumSheetActions` (4898) key purely off `ledgerEditTarget`, so the state machine has a clean idle⇄editing toggle. The underlying Timestamp-only keying of the edit target remains the separately-tracked DEFERRED item at 6301; no new issue here.

### 2026-06-19 (run 23) — Sections audited: 10

**Stories traced through Index.html 3001–4500 (phone/DPR scaling, swipe-to-delete gestures, `setCommandMode` navigation, command-search, the legacy campaign-notes composer, combine-choice handlers, dice calc, and the core inventory load/render + the collaborative-sync poll).** Stories touching this range and traced fully (happy → failure-at-step → navigate-away → friction, with execution-trace + state-machine on each write path): **View item details** (`renderInventory` 4191 → card `onclick` → `handleInventoryCardClickById` 6725 → `openInventoryPrimaryAction` 6738), **Delete inventory item** (swipe gesture 3050 → `handleInventoryDeleteActionById` 7355 → `deleteSelectedInventory` 7370), **Combine duplicate** (`showCombineChoice` 3426 / `confirmCombineInventoryItem` 3449), **Create/Edit/Pin/Archive note** (render target `renderNotesList` 4433 / `loadNotes` 4407), and all three **cross-cutting** stories (Collaborative sync interference, Tab-switch in-flight, iOS background/foreground), which route through `loadInventory` 4066 and `pollSync` 4345. The dual tap-vs-click dedupe (`lastTapOpenedAt` for `pointerup` 3079 + `suppressInventoryClickUntil` for the native card `onclick` 6726) was verified to suppress double-opens on both touch and mouse — clean.

#### ~~BUG · Index.html:4349 · `pollSync` permanently drops another user's write when it interleaves with my own in-flight write~~ FIXED
Cross-cutting story "Collaborative sync interference." The sync marker is single-valued: `SYNC_INVENTORY` (ts) + `SYNC_INVENTORY_BY` (writer), overwritten on every write. Sequence: (1) another player commits a write → marker `{ts_A, playerA}`. (2) My poll fires while I have a write in flight; `4350` sees `by !== syncClientId && _inFlightWrites > 0` and takes the *defer* branch — it deliberately does **not** update `syncState.inventory`, intending to reload on a later tick. (3) My own write commits → marker is overwritten to `{ts_mine, me}`, and `_inFlightWrites` returns to 0. (4) Next poll: `res.inventory.ts !== syncState.inventory.ts` is still true (syncState was never advanced), so it enters the block, but now `res.inventory.by === syncClientId`, so it takes the `else` branch: `syncState.inventory = res.inventory; if (by !== me) loadInventory(true)` — the reload is skipped because the *last* writer was me. **Player A's change is never loaded** until some unrelated third write happens. The deferral comment ("defer reload to next tick") assumes the deferred ts survives, but my own subsequent write clobbers the marker and erases the evidence that a foreign write was ever pending.
Fix: when taking the defer branch, remember that a foreign reload is owed (e.g. set a `pendingForeignReload = true` flag instead of relying on the ts comparison). On any later poll where `_inFlightWrites === 0`, if `pendingForeignReload` is set, call `loadInventory(true)` and clear it regardless of `res.inventory.by`. Same logic applies to the notes branch at 4357 (though that branch never defers, so it's only exposed if a defer is added there).

#### ~~RISK · Index.html:4123 · `loadInventory` revalidation overwrites in-flight optimistic state with no `_inFlightWrites` guard~~ FIXED
`pollSync` carefully defers when `_inFlightWrites > 0` (4350), but the success handler of `loadInventory` itself does `inventoryRows = newRows` (4123) and `cacheInventoryRows(...)` (4125) **unconditionally**. A manual revalidation fetch — triggered when the user switches away and back to the Inventory tab after the 60 s `INVENTORY_REVALIDATE_MS` window (4104) — is not gated by `_inFlightWrites`. If it lands while an optimistic delete/sell/give is still in flight, it replaces `inventoryRows` with server rows that don't yet reflect the pending op (e.g. the deleted row reappears). For most ops the write's own success handler self-heals via `updateInventoryRowFromServer` (7443), but **for a full delete (`apiDeleteInventory`, qty was 1) the server returns no `res.item`** (7442 is skipped), so the reappeared row persists on screen until the next foreign sync. Narrow timing (requires >60 s between optimistic write and the tab-return fetch), hence RISK not BUG. Fix: guard the overwrite — `if (_inFlightWrites > 0) { markInventoryReady(); return; }` at the top of the success handler, mirroring the poll's defer.

#### ~~RISK · Index.html:3449 · `confirmCombineInventoryItem` does not increment `_inFlightWrites`~~ FIXED
Combine duplicate story, step c. Like `addInventoryItem` (prior run's BUG at 8033), the combine round-trip leaves `_inFlightWrites` at 0 for its whole duration. Combine is *not* optimistic (it waits for the server before mutating `inventoryRows`), so there's no optimistic row to lose; but if a foreign write's poll fires mid-combine it will run `loadInventory(true)`, reassigning `inventoryRows` underneath the in-flight handler. The success handler at 3461 reads `inventoryRows` fresh and filters source / merges target, so it self-heals in the common case — but it then calls `cacheInventoryRows` (3464) which, with the flag at 0, is not suppressed, so a reload racing the cache write can briefly desync the localStorage cache from `inventoryRows`. Fix: wrap the round-trip in `_inFlightWrites++` / `--` for consistency with the other write paths.

#### IDEA · Index.html:4350 · Deferred foreign reload waits a full 20 s poll cycle even after the local write resolves
Friction in "Collaborative sync interference." Even after the BUG above is fixed, the deferred foreign reload only re-evaluates on the next `setInterval` tick — up to `SYNC_POLL_MS` (20 s) of staleness after my own write completes. Since every write's success handler already runs at the moment `_inFlightWrites` hits 0, that handler could opportunistically fire one `pollSync()` immediately (or call `loadInventory(true)` if a foreign reload is owed), collapsing the worst-case staleness from 20 s to ~0. Low priority; only matters during rapid multi-player editing.

#### Note · Index.html:3050 · Swipe/tap state machine and delete optimistic-rollback trace clean
Traced **Delete inventory item** and **View item details** end-to-end. The single delegated gesture listener (`initInventoryGestures` 3050) correctly auto-closes a previously-open swipe before a new drag (3107), axis-locks h/v (3130), and dedupes tap-open against the native card `onclick` via two independent guards. `deleteSelectedInventory` (7370) captures `previousRows` before the optimistic mutation, increments `_inFlightWrites`, and restores + re-renders on both `!res.ok` and failure — navigate-away-and-return self-heals correctly. The qty>1 "Confirm delete all" safety gate (7385) and `decrementOnly` swipe path (7407) both trace cleanly.

### 2026-06-19 (run 22) — Sections audited: 9

**Stories traced through Index.html 1501–3000 (CSS tail, body HTML for all mobile sheets, and the early JS: state declarations + cache/identity helpers):** This range defines (a) the DOM for every mobile sheet and the bottom nav, and (b) the optimistic-cache + collaborative-sync machinery (`_inFlightWrites` 2782, `syncState` 2819, `cacheInventoryRows` 2934 with its in-flight guard, `primeInventoryCacheAfterAdd` 2944, `getCachedInventoryRows`/`getCachedInventoryPayload` 2864/2881). I traced every story whose optimistic write or cache step runs through these helpers — **Add library item** and **Add custom item** (`addInventoryItem` 7983, optimistic row 8019, prime 8072), **Combine duplicate** (`#combineSheet` 2567, `showCombineChoice` at 8076), **Identity first-open** (`loadCharacters` 2921, `populateCharacterSelectors` 2901, `#identitySheet` 2684), and the three **cross-cutting** stories (Collaborative sync interference, Tab-switch in-flight, iOS background/foreground) which all route through the `_inFlightWrites` guard at 2934 and the sync-defer at `pollSync` 4350. Each checked happy-path → failure-at-step → navigate-away → friction with execution-trace + state-machine analysis.

#### ~~BUG · Index.html:8033 · `addInventoryItem` never increments `_inFlightWrites`, so the optimistic add is unprotected from concurrent background sync~~ FIXED
The whole optimistic-cache safety net defined in this section — `_inFlightWrites` (declared 2782), the `if (_inFlightWrites > 0) return;` guard inside `cacheInventoryRows` (2934), and the matching `_inFlightWrites > 0` defer in `pollSync` (4350) — exists so a write's local optimistic state survives until the server confirms. **Every other write path participates**: delerium receive (5147), sell (5255), gold receive/pay (5574/5975), give (6636), remove (6931), inventory edit (7429) all do `_inFlightWrites++` and `--` around the round-trip. The single most common operation, **Add library/custom item**, does not. `addInventoryItem` pushes the optimistic row (8033) and caches it (8034), fires `apiAddInventory`, and never touches the flag in either handler (8045 success / 8079 failure).
Consequence (Add story, step c / cross-cutting "Collaborative sync interference"): during the ~1–2 s add round-trip the flag stays 0, so if the 20 s poll fires and sees *another* user's write, the guard at 4350 reads `_inFlightWrites === 0` and proceeds straight to `loadInventory(true)`. That replaces `inventoryRows` (and, via the unguarded `cacheInventoryRows` at 4125, the localStorage cache) with server rows that may not yet contain my just-added item — the optimistic row flickers out mid-add, and if the user backgrounds/closes the webview before `addInventoryItem`'s success handler re-primes (8072), the cache is left without the item the server actually committed. Edits/gives/sells in the same window are immune precisely because they set the flag.
Fix: mirror the sibling pattern — keep the optimistic `cacheInventoryRows` at 8034 (flag still 0 so it persists), then `_inFlightWrites++` immediately after, and `_inFlightWrites--` as the first line of BOTH the success (8046) and failure (8080) handlers, before the re-prime/re-cache calls. (Do not increment *before* 8034 or the guard at 2934 would suppress the optimistic write itself.)

#### ~~RISK · Index.html:4354 · Single `by` sync field drops a peer's write when my write is the most recent one~~ FIXED
Traced as part of the "Collaborative sync interference" cross-cutting story (sync state declared in-section at 2819). `pollSync` reloads only when `res.inventory.by !== syncClientId`. The server keeps just one `SYNC_INVENTORY_BY` (last writer). Sequence: peer B writes → server `{ts:T1, by:B}`; before my next poll I add an item → server `{ts:T2, by:me}`; my poll sees `{T2, by:me}`, takes the else branch (4353–4354), sets `syncState.inventory = {T2,me}` and skips `loadInventory` because `by === me`. B's write is now invisible to me until some *third* writer bumps the timestamp again — my own add response (`primeInventoryCacheAfterAdd`) only merges my item, never B's. Window is one poll interval (≤20 s) but on a busy table it silently hides loot. Mitigation: when `by === me` but `ts` advanced past the ts I last *reloaded* (not last *saw*), still reconcile — e.g. track `lastReloadedTs` and force `loadInventory(true)` if the server ts moved beyond my own known bump, or have the server return a monotonic writer set instead of a single name.

#### Note · Index.html:2944 · Optimistic-prime + double-add mitigation trace clean
`primeInventoryCacheAfterAdd` (2944) correctly de-dupes by `Inventory ID` (merges if present, prepends if new) and the add success handler guards it with `if (!cachePrimed) bustInventoryCache()` (8072–8073) so a malformed server row can't poison the cache. Double-tap on "Add to Inventory" is mitigated structurally: `clearAddForm()` runs synchronously (8038) and hides `#addSubmitBtn`, so a second tap has no target before the first round-trip returns — acceptable in lieu of a flag. Identity first-open trace (`loadCharacters` 2921 → `populateCharacterSelectors` 2901, re-showing `#identitySheet` when active) is sound; on `apiGetCharacters` failure it degrades to "Party / shared"-only holder dropdowns rather than breaking the Add flow.

### 2026-06-19 (run 21) — Sections audited: 8

**Stories traced through Index.html 1–1500 (HTML structure / CSS):** This range is entirely the `<style>` block, so I traced every story whose UI component is *defined* here, reading the driving JS as needed: Quick-adjust currency/delerium (`#quickEditSheet` 2448, `setQuickEditorOpen` 7082, `openQuickEditPanel`), Edit inventory item (`#inventorySheet` 2343, `setInventoryEditorOpen` 7225), View/Give/Sell/Remove (`#descriptionSheet` 2413), Combine duplicate (`#combineSheet` 2567, `confirmCombineInventoryItem` 3449), Create/Edit note (`#noteFormSheet` 2529), Identity first-open (`#identitySheet` 2684, `confirmIdentity` 4831 / `applyIdentity` 4728), and the boot/reveal path (`markInventoryReady` 3408, `loadInventory` 4066). Each checked happy-path → failure-at-step → navigate-away → friction with execution-trace + state-machine analysis. Layout-detection logic cross-checked: `isMobileLayout` 3038, `updatePhoneClass` 3002, `@media (min-width:700px)` 1494.

#### ~~BUG · Index.html:1522 · Edit-item & quick-adjust sheets are `display:none` on touch + wide viewports (iPad always; iOS GAS webview per project's own 980px quirk)~~ FIXED
The `@media (min-width:700px)` block sets `.mobile-sheet { display:none !important }` (line 1522) then re-enables a hand-curated allowlist (1523–1533) that **omits `#inventorySheet`** (Edit inventory item) **and `#quickEditSheet`** (Quick-adjust). Meanwhile the JS picks the sheet vs. the inline desktop editor via `isMobileLayout()` (3038), which keys off `html.is-phone` = `matchMedia('(pointer: coarse)')` (3003) — a *different* condition from the width media query. On any touch device whose CSS viewport is ≥700px — an iPad always, and per this project's own documented GAS-webview behavior (innerWidth ≈ 980, comment at 3016) an iOS phone too — both conditions are simultaneously true.
- **Quick-adjust currency/delerium** (tap gold/delerium card): `setQuickEditorOpen(true)` takes the mobile branch (7087) and adds `.active` to `#quickEditSheet`, but the media query keeps it `display:none !important` → nothing appears. Worse, `quickSheetAmount.focus()` (7067) can raise the keyboard over a field that isn't visible, and `syncModalOpenState()` sets `body.app-modal-open` (scroll lock) — the page looks frozen with no visible way out.
- **Edit inventory item** (swipe → Edit): `setInventoryEditorOpen(true)` mobile branch (7230) adds `.active` to `#inventorySheet`; same media query hides it → the editor never shows.
Both core flows are dead on the affected devices. The allowlist was clearly curated (11 other sheets are listed), so these two were simply forgotten. Fix: add `#inventorySheet.active { display:block !important; }` and `#quickEditSheet.active { display:block !important; }` to the allowlist; better, make the layout decision single-sourced (gate `.mobile-sheet` visibility on `html.is-phone`, not `(min-width:700px)`, so CSS and `isMobileLayout()` can never disagree).

#### ~~RISK · Index.html:1397 · iOS keyboard covers the pinned action bar on every mobile sheet except campaign notes~~ FIXED
`--keyboard-offset` viewport tracking is bound only for `#notesSheet` (`bindCampaignNotesViewport`/`syncCampaignNotesViewport`, 3531–3547) and only `.notes-sheet-actions` consumes it in CSS (1205). The generic `.mobile-sheet-actions` (1397) has no keyboard offset, and the panel is `position:absolute; inset:0` (1248) — sized to the layout viewport, not visualViewport. So focusing a field in **Party Notes create/edit** (`#noteFormSheet`, Save; Title/Note/Tags inputs — this sheet *is* in the allowlist so it renders on touch+wide), and on any device not hit by the BUG above, in **Edit inventory item** (Save Changes; Notes textarea + Category/Rarity/Value/Faction) and **Quick-adjust** (Confirm; Amount + Note), raises the iOS keyboard which sits over the flex-pinned action bar — the user must dismiss the keyboard to reach Save/Confirm. The team already solved this for campaign notes, so the pattern exists but wasn't generalized. Fix: bind visualViewport for any active `.mobile-sheet` and add `var(--keyboard-offset)` to `.mobile-sheet-actions` padding-bottom.

#### Note · Index.html:3408 · Boot reveal & modal-lock are robust — clean trace
`markInventoryReady()` is called on *every* `loadInventory()` branch — cache paint (4080/4091), server app-error (4117), success (4133), and network failure (4139) — so a failed first load still removes `app-booting`/adds `inventory-ready` and shows a retriable error; the UI never stays invisible. Boot calls `loadInventory()` unconditionally via `setCommandMode('inventory')` (8242 → 3257), independent of identity, so the first-time identity flow (`confirmIdentity` 4831 → `applyIdentity` 4728, neither of which reveals the app itself) still ends with a visible app behind the splash. `syncModalOpenState()` (3405) recomputes `body.app-modal-open` from the live DOM on each sheet open/close, so the scroll lock self-heals after a navigate-away or error instead of getting stuck. Stories traced clean: first-open identity, initial inventory load (happy + app-error + failure), combine-duplicate rollback (`confirmCombineInventoryItem` 3449 restores `pendingCombineChoice` on both failure paths).

### 2026-06-19 (run 20) — Sections audited: 7

**Stories traced through Code.js 3501–end:** Quick-adjust currency/delerium (`apiGetCurrencyQuickEdit` 3682, `apiAdjustCurrency` 3723, `apiAdjustInventory` 3733, `apiSetItemQuantity` 3853) traced end-to-end against the client flow in Index.html (`openQuickEditPanel` 7001, `populateQuickSize` 7071, `confirmQuickEdit` 7124, `finishSuccess`/`fail` 7147–7172), plus the sync-poll guard at 4350. Delete inventory tail (`apiDeleteInventory` 3501–3558) and Combine duplicate (`apiCombineInventoryItems` 3560) re-read; both were fully traced in run 19, so only the section-local write paths and the quick-adjust story produced new findings this run. Each new path checked happy-path → failure-at-step → navigate-away → friction with execution-trace + state-machine analysis.

#### ~~BUG · Code.js:3773 · Delerium quick-adjust silently renames the row to the size dropdown's default ("chip")~~ FIXED
**Story: Quick-adjust currency/delerium (add/remove mode).** When a delerium-crystal inventory card is quick-edited, the client builds the size `<select>` from `DELERIUM_SIZE_VALUES` (Index.html `populateQuickSize` 7071) but never pre-selects the row's actual size, so the browser defaults the selection to the **first** option, `'chip'` (Code.js:43). For delerium the size field is `.active`, so `confirmQuickEdit` (Index.html:7134) reads `size = 'chip'` and passes it to `apiAdjustInventory`. The server then unconditionally does `rowObj['Item'] = 'Delerium Chip'` (3773) and rewrites the row. Net effect: adding 2 crystals to a **"Delerium Geode"** row renames it to **"Delerium Chip"** and merges its quantity into the wrong size, corrupting stock. It compounds downstream: the ledger `subtype` is derived from the *renamed* item (`normalizeDeleriumSize_(rowObj['Item'])`, 3791/3895) so the RESOURCE_LEDGER also records the wrong size, and if a note is present `rowObj['Notes']` is overwritten with `Size: chip` (3774). Note the asymmetry that confirms this is unintended: `set` mode routes to `apiSetItemQuantity`, which never sends `size` and never renames — only `add`/`remove` corrupt. Fix: either pre-select the dropdown to the row's current size in `populateQuickSize`, or (better) drop the size field from quick-adjust of an existing delerium row entirely — the row already has a fixed size; quantity adjustment should not be allowed to re-classify it. If a "convert size" feature is genuinely wanted it should be an explicit, separate action.

#### ~~BUG · Index.html:7145 · `confirmQuickEdit` skips `_inFlightWrites` accounting — sync poll can wipe the optimistic update and duplicate the ledger line~~ FIXED
**Story: Quick-adjust currency/delerium.** The cross-cutting sync deferral (Index.html:4350) only postpones a foreign-write `loadInventory(true)` while `_inFlightWrites > 0`. `confirmQuickEdit` gates re-entry with its own `quickEditInFlight` flag (7145) but never bumps `_inFlightWrites`, so a quick-adjust round-trip is invisible to the guard — exactly the same defect class flagged in run 19 for the gold/pay/split/ledger-note handlers, but in a different handler covering a different story. Failure modes if the 20 s poll fires during the round-trip and sees another player's write: (1) `loadInventory(true)` overwrites `inventoryRows` and `inventoryResourceLedger` wholesale (4123–4124), racing the success handler; (2) if `apiAdjustInventory`/`apiSetItemQuantity` has already committed server-side, the reloaded ledger already contains the new row, and `finishSuccess` then unconditionally prepends `res.ledgerEntry` again (7159) → **duplicate gold/delerium ledger line** until the next full reload. Fix: wrap the `google.script.run` calls in `_inFlightWrites++` / `--` on both success and failure paths, matching the delerium handlers (5147/5255).

#### ~~RISK · Index.html:7126 · `quickEditInFlight` never resets on a lost callback — quick-adjust becomes permanently dead until reload~~ FIXED
**Story: Quick-adjust currency/delerium; cross-cutting iOS background/foreground.** `quickEditInFlight` is set `true` at 7145 and cleared **only** inside the success (7148) and failure (7170) handlers of the in-flight call. If those callbacks never fire — iOS GAS webview suspending JS mid-round-trip, or the user navigating/closing such that `google.script.run` is torn down — the flag stays `true`. Neither `openQuickEditPanel` nor `closeQuickEditPanel` resets it, so every subsequent `confirmQuickEdit` early-returns at 7126 and the Confirm button silently does nothing for the rest of the session. Unlike `_inFlightWrites` (whose only consequence is deferral), this fully disables the feature. Fix: reset `quickEditInFlight = false` in `openQuickEditPanel`/`closeQuickEditPanel`, and/or restore it on `visibilitychange` foreground alongside the existing sync re-check.

#### Note · Code.js:3723 · `apiAdjustCurrency` guard and currency-zero handling trace clean
**Story: Quick-adjust currency (add/remove/set).** `apiAdjustCurrency` (3723) correctly re-validates `editType === 'currency'` before delegating, and `validateQuantity_` default `min: 0` (1626) means setting/removing currency down to exactly 0 succeeds while over-removal (negative result) throws a clean bounded error surfaced via the status line. `apiSetItemQuantity` and the currency branch of `apiAdjustInventory` emit a correctly-signed ledger delta and return a sanitized `ledgerEntry`; the currency path (no size field active) is unaffected by the delerium rename bug above. Lock is acquired after auth and released in `finally` on every path. Delete tail (`apiDeleteInventory` 3501–3558) and `apiCombineInventoryItems` (3560) re-confirmed consistent with their run-19 traces.

### 2026-06-19 (run 19) — Sections audited: 6

**Stories traced through Code.js 2901–3500:** Edit ledger note gold/delerium (`apiUpdateLedgerNote` 2905), Receive gold "Got Paid" (`apiReceiveResource` 2955), Receive crystals (`apiReceiveResource` delerium branch), Sell item single (`apiSellInventoryItem` 3040), Sell crystals (`apiSellDelerium` 3096), Split gold evenly (`apiSplitGold` 3181), Pay gold → character (`apiSendGoldToMember` 3319), Edit inventory item (`apiUpdateInventory` 3403), Delete inventory item (`apiDeleteInventory` 3491), Combine duplicate (`apiCombineInventoryItems` 3560). Each traced happy-path → failure-at-step → navigate-away → friction, reading the client handlers in Index.html (5140–5300 delerium receive/sell, 5391–5449 received gold, 6021–6141 pay/split, 6311–6346 ledger-note edit, 3449–3478 combine, 4066–4142 loadInventory, 4345–4364 sync poll, 2933–2957 cache/prime helpers).

#### ~~BUG · Code.js:2935 · `apiUpdateLedgerNote` matches by timestamp+resource only — edits the wrong row for any multi-entry transaction~~ FIXED
**Story: Edit ledger note (gold and delerium).** The match loop (2936–2942) stops at the **first** sheet row whose `Timestamp` (second-resolution, 19-char) and `Resource` match. But several transactions write multiple ledger rows in the same second with the same resource: `apiSplitGold` emits SPLIT_DEDUCT + one SPLIT per member + SPLIT_REMAINDER (all `gold`, all sharing the single `nowStr` from 3218); `apiReceiveResource`/`apiSellDelerium` emit one row per crystal size (all `delerium`, all same `nowStr`). When the user taps the "Gold (Alice)" split line and edits its note, the server rewrites the note on whichever same-second `gold` row appears **first in the sheet** (the pool-deduct row), not the tapped one. The client mirror at Index.html:6333 has the identical defect — `find(e => e['Timestamp'] === timestamp)` returns the first array match, so client and server agree only by coincidence and both target the wrong entry. Result: the note edit silently lands on a different ledger line; the line the user actually tapped is unchanged. Fix: each ledger row already carries a unique `Inventory ID` (written by `appendResourceLedger_` and surfaced via `sanitizeResourceLedgerForClient_`); pass and match on that instead of timestamp+resource.

#### ~~BUG · Index.html:6089 · Gold receive/pay/split/ledger-note handlers skip `_inFlightWrites` accounting — defeats the sync-poll deferral guard and can duplicate ledger lines~~ FIXED
**Stories: Receive gold, Pay gold, Split gold evenly, Edit ledger note.** The cross-cutting "collaborative sync interference" guard at Index.html:4350 only defers a foreign-write `loadInventory(true)` while `_inFlightWrites > 0`. The delerium handlers (`sellDelerium` 5255, `receiveDelerium` 5147) and the sell-batch/add handlers bump that counter, but `receivedGold` (5391), `confirmPayWithReason` (6021), `splitGold` (6089), and `updateLedgerNoteFromBottom` (6311) **never do**. So if the 20 s poll fires during one of these round-trips and sees another player's write, it proceeds straight to `loadInventory(true)`, which overwrites `inventoryRows` **and** `inventoryResourceLedger` wholesale (4123–4124). Two failure modes:
1. The optimistic pending entry (e.g. the SPLIT_DEDUCT prepended at 6109) is wiped mid-flight → it flickers out then back.
2. If `apiGetInventory` resolves **after** the gold/split write has committed server-side, the fresh ledger already contains the committed rows; the success handler then unconditionally re-prepends `res.ledgerEntries` (6063, 6127, 5432) → **duplicate ledger lines** (each split/pay line shown twice) until the next full reload. `primeInventoryCacheAfterAdd` dedups inventory rows by ID (2949) so the row list survives, but the ledger array has no such guard.
Fix: wrap each of these four handlers in `_inFlightWrites++` / `--` (in both success and failure paths) exactly as the delerium handlers do, so the deferral and the `cacheInventoryRows` guard apply uniformly.

#### ~~RISK · Code.js:3636 · `apiCombineInventoryItems` writes the merged target then deletes the source non-atomically~~ FIXED
**Story: Combine duplicate.** `writeInventoryRow_(... merged)` (3636) commits the combined quantity onto the target, then `sheet.deleteRow(source.rowNumber)` (3637) removes the source. There is no transaction: if `deleteRow` throws (transient Sheets error, row-shift race with a concurrent delete), the target keeps the **summed** quantity while the source row still exists → the combined items are double-counted. The `catch` returns `{ok:false}` and the client (Index.html:3457) restores `pendingCombineChoice` for retry, but a retry re-reads both rows and sums again → triple. Lower-probability than the gold paths but same non-atomic class as the run-18 ledger findings. Fix: delete source first, then write target (a failed delete leaves the original two rows intact and is safely retryable), or capture and re-add on failure.

#### ~~RISK · Code.js:3062 · `apiSellInventoryItem` deletes the item before appending gold/ledger — a later throw reports failure on an already-applied sale~~ FIXED
**Story: Sell item (legacy single-row path).** Order is: `deleteRow(found.rowNumber)` (3062) → `auditWrite_` → append Gold row (3079) → `appendResourceLedger_` (3080). If the gold append or ledger append throws, the item is already gone but the client receives `{ok:false, goldItem:null}` and shows "failed". The user retries → `getInventoryRowObjectById_` now returns nothing → "Item not found", leaving them unsure whether the gold was credited (it may have been). Fix: append the gold/ledger rows first and delete the source last, so a mid-flight failure leaves the sale fully un-applied and retryable.

#### Note · Code.js:3403 · `apiUpdateInventory` / `apiDeleteInventory` lock + audit discipline is clean; combine client is idempotent under sync interference
**Stories: Edit inventory item, Delete inventory item, Combine duplicate.** Both update/delete acquire the document lock, validate the ID, write/delete, `bumpSync_`, and release the lock in `finally` on every path including the auth-failure and validation-error branches; each writes an audit row on both SUCCESS and FAILED. `confirmCombineInventoryItem` (Index.html:3449) is non-optimistic (shows "Combining…", mutates only on success) and its success mutation — filter out source, merge `res.item` into target — is idempotent, so a `loadInventory(true)` racing in mid-combine leaves a consistent list. No new bug in these three client/server traces beyond the RISK noted above.

### 2026-06-18 (run 18) — Sections audited: 5

**Stories traced through Code.js 2301–2900:** Add library item (`apiAddInventory` 2424), Add custom item (`apiAddCustomInventory` 2533), Quick-adjust currency/delerium (`apiQuickAddInventory` 2632), Pay gold / Pay delerium (`apiDepleteResource` 2773), Create/Edit/Pin/Archive note (`apiCreateNote` 2330, `apiUpdateNote` 2371, `apiArchiveNote` 2402). Each traced happy-path → failure-at-step → navigate-away → friction, reading the client handlers in Index.html (8000–8124 add flow, 6021–6141 gold pay/split, 6558–6623 dashboard pay, 4585–4693 notes write handlers, 4345–4364 sync poll).

#### ~~RISK · Code.js:2847 · `apiDepleteResource` / `apiQuickAddInventory` write inventory row then ledger non-atomically — failed ledger append orphans the row and a retry double-counts~~ FIXED
**Stories: Pay gold, Pay/Sell delerium, Quick-adjust currency/delerium.** Both functions do `sheet.appendRow(...)` for the inventory deduction/addition row FIRST (2847 deplete; 2699 quick-add), then `appendResourceLedger_(ledgerEntry)` (2848 deplete; 2715 quick-add). There is no transaction and no rollback: if `appendResourceLedger_` throws (transient Sheets API error, quota, schema mismatch), the `catch` returns `{ ok:false }` to the client **but the inventory row has already been committed**. For Pay gold this means the party-pool gold was deducted (negative-qty `Currency` row written) while the client shows "Pay failed" — the user re-pays → **double deduction**, with only one of the two reflected in the ledger. For quick-add currency/delerium the same yields a duplicate inventory addition. The window is small but the consequence is silent resource corruption that the ledger (the audit-of-record) won't even show consistently. Suggested fix: append the ledger row first (or capture the inventory row index and delete it in the catch before returning the error), so the client-visible failure matches the persisted state. Note `apiAddInventory`/`apiAddCustomInventory` are not exposed to this because they write only the single inventory row.

#### ~~RISK · Index.html:4357 · Notes sync poll has no in-flight guard — a concurrent reload during a note write can silently drop the just-created note~~ FIXED
**Story: Create note + cross-cutting "Collaborative sync interference".** The inventory branch of `pollSync` (4350) defers `loadInventory(true)` while `_inFlightWrites > 0`, but the notes branch (4357-4360) has **no equivalent guard** and no write path bumps a notes-side counter. Sequence: user taps Save → optimistic temp note pushed to `notesData` (4623) keyed `NOTE_TEMP_*`; `apiCreateNote` round-trip in flight. The 20 s poll fires and sees another player's note write (`res.notes.by !== syncClientId`), so it calls `loadNotes(true)`, which replaces `notesData` wholesale with server data — the temp is gone. When the create's success handler returns it does `tidx = notesData.findIndex(x => x.noteId === tempId)` (4630) → `-1`, and the add is gated `if (tidx >= 0) notesData[tidx] = res.note` (4632), so **the real note is never inserted**. If the server-side `loadNotes` read happened before this create persisted, the user's brand-new note is invisible until the next sync event or the 2-min TTL reload. The edit/pin/archive handlers have the same fragility: their failure-rollbacks reference a captured `idx`/object (4607 `notesData[idx]=backup`, 4682 `n.pinned=...`) that may point at a stale slot or an orphaned object after a mid-flight `loadNotes(true)`, so a rollback can edit the wrong row or no-op. Suggested fix: make create-success additive when `tidx < 0` (push `res.note`, dedup by `noteId`), and/or add a notes in-flight guard mirroring 4350.

#### ~~RISK · Index.html:8044 · Add-item write path omits the `_inFlightWrites` guard that every other optimistic inventory write uses~~ FIXED
**Stories: Add library item, Add custom item, Quick-adjust currency/delerium + cross-cutting "Collaborative sync interference".** The give (5975), edit (5574/5147/5255), undo-pay (6636), and other optimistic writes all bracket their round-trip with `_inFlightWrites++/--` so `pollSync` (4350) defers a competing `loadInventory(true)` until the local write resolves. The add-item dispatcher (`runner` at 8044, calling `apiAddInventory`/`apiAddCustomInventory`/`apiQuickAddInventory`) **never increments `_inFlightWrites`**. So if the 20 s poll detects another player's write during the add round-trip, the guard sees `0` and runs `loadInventory(true)` immediately, replacing `inventoryRows` with server data. If that reload's sheet read lands before the add persists, the optimistic row (`optId`) is wiped and the freshly added item momentarily vanishes from the list (it reconverges only when the add's success handler re-adds via `primeInventoryCacheAfterAdd`, or on the next reload). Lower severity than the notes case because the success handler is additive (`primeInventoryCacheAfterAdd(res.item)` 8072) rather than index-keyed, so it self-heals — but it still produces a visible flicker/disappearance during multi-user sessions and is inconsistent with sibling write paths. Suggested fix: wrap the add dispatch in `_inFlightWrites++` / `--` in both handlers.

#### ~~IDEA · Index.html:6044 · Pay clears the amount/note inputs optimistically and never restores them on failure~~ FIXED
**Stories: Pay gold (`confirmPayWithReason` 6021), Pay/Sell delerium (`payResource` 6558).** Both blank the amount input (6044 / 6578) — and Pay-gold also the note (6045) — *before* the server call, then on failure show an error but do **not** repopulate the cleared fields. After a failed pay the user has to re-type the amount (and note) from scratch. This is inconsistent with the add-item flow, which snapshots the whole payload (`payloadSnapshot`) and restores every field on failure (8053-8062, 8088-8097). Suggested improvement: capture `amount`/`note` and restore the inputs in the failure/`!ok` branches, matching the add-item restore pattern.

#### Note · Code.js:2330 · Clean traces — notes server endpoints and lock discipline
`apiCreateNote` (2330), `apiUpdateNote` (2371), `apiArchiveNote` (2402) all call `requireAllowedUser_()` **before** `lock.tryLock` (so an auth failure never holds a lock) and release in a `finally` on every path including error and busy-return. `apiUpdateNote` correctly whitelists patch fields (2385), coerces `Pinned`, and falls back to the existing category on an invalid value (2390); a missing note returns a clean `{ok:false,'Note not found.'}` (2381) with the lock released. Client-side, the **edit/pin/archive** optimistic handlers (4597-4693) have proper happy-path + rollback on both `!ok` and transport failure. `apiAddInventory`/`apiAddCustomInventory` validate every field (length-capped `validateText_`, `validateMoney_`, `validateQuantity_`) and their client flow fully restores all form inputs from `payloadSnapshot` on failure (8048-8101) — the strongest failure-restoration path in the app.

### 2026-06-18 (run 17) — Sections audited: 4

#### ~~BUG · Index.html:4631 · Create note success never re-renders — the just-created card stays stuck "Saving…" (dimmed, non-clickable, no Pin/Archive) until an unrelated render~~ FIXED
**Story traced: Create note (Notes tab → + → fill title/category/body/tags → Save → optimistic card appears → server confirms).** The in-range server endpoint is `apiCreateNote` (Code.js:2307); the defect is in its client success handler. On Save (create branch, `saveNoteForm` 4619), the client builds an optimistic note with `noteId: 'NOTE_TEMP_' + Date.now()` (4620), inserts it into `notesData`, `closeNoteForm()` + `renderNotesList()` (4625-4626). `renderNotesList` keys the pending visual purely on the id prefix: `isPending = n.noteId.startsWith('NOTE_TEMP_')` (4465), and a pending card renders dimmed (`note-pending`), with a `Saving…` badge (4475), **no `onclick` to open the editor** (4471), and **no Pin/Archive action buttons** (4482). When `apiCreateNote` returns ok, the success handler (4628-4633) does `notesData[tidx] = res.note` — replacing the temp with the real note (real `NOTE_xxxx` id) — and sets `lastNotesLoadAt = Date.now()`, but **calls no `renderNotesList()`**. So the DOM is never repainted: the card keeps its `NOTE_TEMP_`-era markup and stays dimmed, "Saving…", and non-interactive even though the note is fully saved and reconciled in memory. The user cannot tap the card to edit it, nor Pin, nor Archive it. Contrast the sibling paths that all *do* re-render: create-failure (4636), create-transport-fail (4643), edit success/failure (4602/4608/4615), pin (4677/4682), archive (4655/4660/4666). The state only self-corrects when some other action triggers a render — typing in the notes search (4497), changing the category filter (4511), toggling the pin filter (4517), creating/pinning/archiving a *different* note, or leaving and returning to the Notes tab (loadNotes() non-force re-renders from cache at 4411). Crucially the **navigate-away-and-return scenario recovers** (the return render clears it), but **staying on the Notes tab leaves it stuck**, and a single-user session never gets a sync-poll render because the writer's own `SYNC_NOTES_BY === syncClientId` poll skips. Fix: call `renderNotesList()` inside the create-success `ok` branch right after `notesData[tidx] = res.note` (4632), matching every other notes write handler.

#### Note · Code.js:2307,2348,2379,2259,2196,2013 · Party Notes v2 write paths, sync helpers, and v1 campaign notes otherwise traced clean (positive baseline)
**Stories traced: Create note (server side `apiCreateNote`), Edit note (`apiUpdateNote` 2348), Pin note (`apiUpdateNote` patch `{Pinned}`), Archive note (`apiArchiveNote` 2379), Edit ledger note (read side `getResourceLedgerForClient_` 1700), Collaborative sync interference (`bumpSync_` 2196 / `apiGetSyncState` 2206).** The three Party Notes writers are structurally sound: each takes `LockService.getDocumentLock().tryLock(10000)` after `requireAllowedUser_()`, releases in `finally` on every path incl. auth-failure and not-found returns, and `bumpSync_('notes', payload._syncClientId)` so the writer's own poll skips. The client sends `_syncClientId: syncClientId` on all three (Index.html:4646/4618/4691/4577), and category coercion can't desync the UI because the server whitelist `PARTY_NOTES_CATEGORIES` (Code.js:2229) and the client `NOTE_CATEGORIES` (Index.html:2823) are the **same three values** (`General/Quest/Location`) — so the dropdown can never submit a value `apiCreateNote`/`apiUpdateNote` would silently reject. (The README's "8 categories" table at lines 83-89 is stale documentation, not a code mismatch — both code lists are 3.) `apiUpdateNote`/`apiArchiveNote` return only `{ok:true}` (no echoed note), but the client is fully optimistic (Object.assign at 4600 for edit, in-place `n.pinned`/`splice` for pin/archive) with snapshot-rollback on `!ok` and transport failure, so the missing echo is benign. **Two recorded observations (latent, out of catalog scope, not counted as defects):** (1) the legacy v1 campaign-notes writers `apiAddCampaignNote` (2013) / `apiUpdateCampaignNote` (2072) / `apiDeleteCampaignNote` (2142) — still wired to the v1 chat list (Index.html:3578 etc.) — **never call `bumpSync_`**, so the legacy campaign-notes feed has no collaborative sync at all: a new v1 note from one client is never auto-detected by another until an unrelated inventory/notes write bumps a sync key. (2) `appendResourceLedger_` (1830), `auditWrite_` (1800), and `bumpSync_` (2196) all swallow their own errors in `try/catch` and only `Logger.log`. For the ledger/audit helpers this is intentional (don't fail the user-facing write over an audit row), but it means a gold/delerium op whose `appendResourceLedger_` throws (e.g. sheet quota) still returns `ok` and the optimistically-shown ledger entry — never persisted — silently vanishes on the next reload; and a swallowed `bumpSync_` failure leaves other clients un-notified of a committed write until the next bump.

### 2026-06-18 (run 16) — Sections audited: 3

#### ~~BUG · Code.js:3416,3419,3420 · `apiUpdateInventory` wipes Notes + Faction Relevance on any partial-payload edit — the "Give item to character" flow erases them~~ FIXED
**Story traced: Give item to character (description sheet → Give to… → pick character → confirm).** `apiUpdateInventory` (3380) builds the new row as `{ ...existingObj, <overrides> }` (3412). For `Qty` (3408) and `Value GP` (3409) it guards `payload.X === undefined ? existingObj[...] : validate…(payload.X)`, so an omitted field falls back to the stored value. But `Holder` (3416), `Faction Relevance` (3419), and `Notes` (3420) have **no such guard** — they are unconditionally set to `validateText_(payload && payload.X, …)`, and `validateText_(undefined,…)` returns `''` (via `safeText_`, 1227/1585). So any caller that omits those keys overwrites the stored values with empty strings. The **Give** flow does exactly this: `giveItemToCharacter` sends `apiUpdateInventory({ inventoryId, holder: newHolder, _syncClientId })` (Index.html:6017) — no `notes`, no `factionRelevance`. Result: giving an item to a character **silently erases that item's Notes and Faction Relevance on the sheet**. The optimistic client mutates only `Holder` (6011/6017), so client memory still shows the notes until the next `loadInventory(true)` (any later sync) pulls server truth and the notes/faction vanish from the UI too — persistent data loss, not transient. The normal Edit path is unaffected because `getInventoryEditorValues` (Index.html:7255) always sends all ten fields. Fix: in `apiUpdateInventory`, give `Holder`/`Faction Relevance`/`Notes` the same `payload.X === undefined ? existingObj[...] : validate…` fallback that `Qty`/`Value GP` already use, so partial payloads preserve unspecified fields. (This also future-proofs any other partial-update caller.)

#### ~~RISK · Code.js:3408 · Edit accepts Qty 0 (and fractional) — `validateQuantity_` is called with no `min`, unlike Add's `{min:1}`, creating zombie 0-qty rows~~ FIXED
**Story traced: Edit inventory item (swipe card → Edit → change fields → Save).** `apiAddInventory`/`apiAddCustomInventory`/`apiQuickAddInventory` all validate qty with `{ min: 1 }` (2431/2538/2632), but `apiUpdateInventory` calls `validateQuantity_(… payload.qty)` with **no options** (3408), so `min` defaults to 0 (1603) and any value in `[0, 999999]` passes — including a **non-integer** (validateQuantity_ never enforces integrality). The `editQty` input carries `min="1" step="1"` (Index.html:2159), but that is only a browser hint: clearing the field yields `value === ''`, `saveInventoryEdits` (7283) performs no client-side qty check, and `''` is sent as-is. Server-side, `'' !== undefined`, so the existing-value fallback at 3408 does **not** fire; `validateQuantity_('')` runs `Number('') === 0`, which is `>= min(0)` and passes. The row is written with `Qty: 0`, `Total Value GP: 0`, and persists — `rollupInventoryRows` sums it as 0 but the card/row still exists ("0× Item"), and there is no Add-style `min:1` floor to stop it. The Delete story is the intended path to remove an item; editing qty to 0 is an unintended back door to a zombie row that can only be cleared by a real delete. Fix: pass `{ min: 1 }` (and ideally an integer check) to `validateQuantity_` in `apiUpdateInventory`, matching the three Add handlers, and/or guard empty/zero qty client-side in `saveInventoryEdits`.

#### Note · Code.js:1575,1595,1613,1632,1668,1790,1312 · Section-3 validators/sanitizers and the identity write path traced clean (positive baseline)
**Stories traced: Add library item / Add custom item / Add quick item (validation + sanitize), Edit inventory item, Delete inventory item, First-open identity (write side: `apiSetMyCharacter` → `saveUserProfile_`).** The shared validation layer feeding every inventory write is sound: `validateId_` (1575) enforces `^[A-Za-z0-9_-]+$` ≤80 (so a malformed `inventoryId`/`libraryItemId` throws "Invalid …" — whitelisted by `publicValidationError_` 1562 and surfaced verbatim); `validateMoney_` (1613) returns `''` for empty and clamps `[0, 999999999]`; `validateText_` (1585) trims + length-caps; `sanitizeInventoryForClient_` (1668) and the equipment sanitizers (1632/1654) emit a fixed field set with `safeText_`/`normalizeForClient_`, so no raw sheet object leaks to the client. `getQuickAddDefinition_` (1790) throws "Unsupported quick-add item." (whitelisted) on an unknown lowercased key. The Add handlers (2401/2510/2609) all `tryLock(10000)` with `finally releaseLock()` on every throw/return incl. auth failure, `bumpSync_('inventory', _syncClientId)` so the writer's own poll skips, and write a paired SUCCESS/FAILED `auditWrite_`. The identity write `saveUserProfile_` (1312) throws "Could not identify this browser session." on an empty temp key (run-15 RISK), `validateCharacterChoice_` (1357) rejects inactive/unknown characters before any write, and the update-vs-append branch preserves `Created At` (1331). One observation (not counted as a defect, in scope of section-3 reads): `apiGetMyCharacter` (826) is a read endpoint that performs a sheet **write** via `getUserProfileForKey_` (1304, `setValue` on Last Seen) on every call — including the background preload poll — without taking the document lock; harmless for correctness (last-seen tracking) but a lock-free write on a nominal read path. The two findings above are the only behavioral gaps in the section.

### 2026-06-18 (run 15) — Sections audited: 2

#### ~~RISK · Code.js:826 · `apiGetMyCharacter` ignores its documented hint + email path; identity/treasurer survives long gaps only via the temp-user-key profile sheet, with a 24 h localStorage bridge~~ FIXED
**Stories traced: First-open identity (catalog Identity & access) + cross-cutting treasurer gating (Split Evenly / Sell batch / Party Notes tab).** The README (lines 126, 134) documents `apiGetMyCharacter(clientCharacterHint)` as "resolves email → character via CHARACTERS sheet then `PLAYER_CHARACTER_MAP`… falls back to reverse-lookup from client character hint when `Session.getActiveUser()` returns empty." The actual implementation (826–838) does **none** of that: the `clientCharacterHint` parameter is never referenced, `getActiveUserEmail_`/`resolveIdentityForEmail_` (1253/1257, the latter dead — no caller) are never invoked, and the client calls it with **no argument** (Index.html:4788). The function resolves identity *solely* from the `USER_PROFILES` sheet keyed by `getTemporaryUserKey_()` = `Session.getTemporaryActiveUserKey()` (1277). Trace of a returning user: `loadMyIdentity` (Index.html:4766) applies the localStorage `IDENTITY_CACHE_KEY` identity if present and **< 24 h old** (`IDENTITY_CACHE_MAX_AGE`, 2796), then fires `apiGetMyCharacter()`; on `character:null` it keeps the cached value (`if (!myCharacterName)` guard at 4777 is false). So the 24 h localStorage cache is only a *bridge* — for any return visit after a day (the norm for a weekly campaign) identity and treasurer status come **exclusively** from the temp-key profile sheet. Behavioral risk: `Session.getTemporaryActiveUserKey()` can return empty in anonymous/webview contexts and rotates (~30 d). If it is empty, `getUserProfileForKey_` (1290) bails on the empty key and `saveUserProfile_` (1314) **throws "Could not identify this browser session."** — so `apiSetMyCharacter` fails, the profile is never written, and on the next cold load after the 24 h TTL the user is re-prompted. Worse for the **treasurer**: `confirmIdentity`'s optimistic identity hardcodes `isTreasurer: /^DM/.test(character)` (Index.html:4836) → `false` for Corvane, and treasurer status is only ever upgraded to `true` by a server round-trip resolving via `resolveIdentityForCharacter_` → `getAdminEmails_` (1267/1246). If the save throws (empty key), the failure handler (4855) only sets a status message and never re-applies identity, so the treasurer is silently demoted to a plain player (no Split Evenly, no Sell batch, no Party Notes tab) with the cached `isTreasurer:false` persisting. Mitigated in production because the deployer-treasurer (javajawa16) authenticates and resolves a non-empty temp key, so this is latent, not active — but the README's identity model is materially out of sync with the code, and the treasurer gate has a single point of failure (the temp-key round-trip) with no email-based fallback. Fix: either wire the documented hint/email fallback into `apiGetMyCharacter` (resolve `resolveIdentityForEmail_(getActiveUserEmail_())` or `resolveIdentityForCharacter_(clientCharacterHint)` when no profile is found), or update the README to describe the actual localStorage + temp-key-profile model and have the client persist `isTreasurer` resolution more robustly (e.g. pass the cached character as hint so a re-resolve can restore treasurer without a successful write).

#### ~~RISK · Code.js:695,750 · `apiSellInventoryBatch` silently clamps `sellQty` and returns no resolved rows — the Remove flow can't reconcile a concurrent stack reduction and leaves phantom qty in memory~~ FIXED
**Stories traced: Sell item, Remove item, Sell Items batch (server side) + cross-cutting Collaborative sync interference.** The server clamps each row to what actually exists (`const sellQty = Math.min(qtyToSell, rowQty)`, 695) and on success returns only `{ ok, message, goldItem }` (750) — it does **not** report per-row resulting quantities or which `inventoryId`s were deleted vs. decremented. So no client can fully reconcile the optimistic mutation from the response; it must refetch. Two of the three callers do: `confirmSellItem` (Index.html:5599) and `confirmSellBatch` (5945) both call `loadInventory(true)` in their success handler, which corrects any clamp. But **`confirmDescRemove` (the Remove story, Index.html:6940) only calls `bustInventoryCache()` on success — no `loadInventory(true)`**. Concrete divergence: row INV_X has Qty 5; another user concurrently reduces it to 2 (sync bumped); user A (stale view) opens the description sheet and removes 3. Client A optimistically sets INV_X→Qty 2 and sends `{inventoryId:INV_X, qtyToSell:3}`. Server: `rowQty=2`, `sellQty=min(3,2)=2`, `2>=2` so it **deletes** the row entirely. Server truth = gone; client A in-memory = phantom Qty 2. `bustInventoryCache()` only fixes a *cold* reload; the in-memory `inventoryRows` keeps the phantom, and because the remove committed with `SYNC_INVENTORY_BY = user A`, every later poll hits the `by === syncClientId` skip and never force-reloads. The phantom persists until an unrelated user writes — the same persistence shape as the run-10/12 clobber bugs, but reached through the server's lossy response rather than a poll race. Fix (either end): have `apiSellInventoryBatch` return the resolved rows (e.g. `[{inventoryId, newQty | deleted}]`) so callers can apply server truth precisely, **or** add the trailing `loadInventory(true)` to `confirmDescRemove`'s success branch to match its two sibling sell paths.

#### Note · Code.js:591,628,651,758,667 · Read endpoints, sell-batch server shape, and identity happy path traced clean (positive baseline)
**Stories traced: Add library item (search→select via `apiSearchEquipment` 591 / `apiGetEquipmentIndex` 628), View item details (`apiGetEquipmentItem` 651 / `apiGetItemDetails` 859), Sell/Remove/batch (`apiSellInventoryBatch` 667), First-open identity happy path (`apiGetCharacters` 758 / `apiGetMyCharacter` 826 / `apiSetMyCharacter` 840).** The four read endpoints all gate on `requireAllowedUser_`, read a bounded range synchronously (no stale `getDataRange`), sanitize every field for the client, and degrade to `{ok:false…,rows:[]}` / `{ok:true,rows:[]}` on missing-sheet so a transient failure just drops results (recoverable, no stuck state) — and `q.length < 2` short-circuits search. `apiSellInventoryBatch` is correct on its core shape: `tryLock(10000)` with `finally releaseLock()` on every throw/return incl. auth failure, highest-row-first delete so row-shift only touches already-processed rows (703), `Math.min` clamp prevents overselling, the gold row re-reads headers post-delete before append (729), and `bumpSync_('inventory', _syncClientId)` lets the writer's own poll skip. The two RISKs above are the only behavioral gaps. `apiGetCharacters` correctly splits DM-prefixed rows into `dmRows`, excludes inactive characters (780), and its catch logs no PII (804). Identity happy path (deployer-treasurer, non-empty temp key): pick → optimistic `applyIdentity` → `apiSetMyCharacter` writes profile + returns resolved treasurer → re-`applyIdentity` upgrades the gate; cold return within 24 h reads localStorage, after 24 h re-resolves from the profile sheet — all consistent for the configured production case.

### 2026-06-18 (run 14) — Sections audited: 1

#### Note · Code.js:53 · Clean trace — "Add library item (quick-add)" path through config
**Stories traced: Add library item (quick-add variant), Add custom item, Receive/Sell crystals (size validation), plus cross-cutting auth/failure for all stories.** Section 1 is config + admin + app entry; almost no catalog story executes code here at runtime, but several read this section's constants:
- `QUICK_ADD_ITEMS` (53) → `apiGetQuickAddItems` (872) emits `quickKey`/`terms`/`valueGp` to the client; on Add the client returns `quickKey`, resolved server-side by `getQuickAddDefinition_` (1790). Key is lowercased on both emit and resolve, so case can't desync; an unknown key throws `Unsupported quick-add item.`, which is whitelisted by `publicValidationError_` (1566) and surfaces verbatim. `valueGp:''` for gemstone/art/trade/scroll flows safely to `Number(x)||0` at sell time. Happy path, server-failure path (returns `{ok:false, items:[]}` → search just loses quick-add rows, recoverable), and navigate-away are all clean — these are stateless reads, no in-flight write state to strand.
- Auth gate `requireAllowedUser_` (1475) wraps every story's server call; all thrown gate messages (`Access denied.`, `Treasurer access required.`, `Quantity…`, `Value…`, `…too long.`, `Unsupported…`) match the `publicValidationError_` whitelist, so per-step failure feedback is informative rather than masked to "Request failed." Directly-returned strings ("Server busy…", "No items selected.") bypass the whitelist and reach the user verbatim. `doGet` (247) serves the template unauthenticated by design (URL is the security boundary).
- Confirmed the two notes schemas defined here are **both live and use separate sheets**: 5-col `CAMPAIGN_NOTES_HEADERS` (271) → `CAMPAIGN_NOTES_FEED`, driven by the legacy `apiGetCampaignNotes`/`apiAddCampaignNote`/… (still called from Index.html:3578/3850/3852/3882); 11-col `PARTY_CAMPAIGN_NOTES_HEADERS` (2225) → `NOTES`, driven by the Party Notes tab (`apiGetNotes`/`apiCreateNote`/…). No schema collision in setup despite the shared "notes" naming.

#### ~~RISK · Code.js:288 · `resetAppDataSheets` / `setupInventoryTabs` never touch the live Party Notes `NOTES` sheet~~ FIXED
**Story affected: Create/Edit/Archive note (data lifecycle).** `setupInventoryTabs` (263) and `resetAppDataSheets` (288) initialize/clear the *legacy* `CAMPAIGN_NOTES_FEED` (5-col) but neither references `PARTY_NOTES_SHEET = 'NOTES'` (2232), which is the sheet the live Party Notes feature actually reads and writes. The live sheet is created lazily by `ensurePartyNotesSheet_` (2234) on first note access. Consequences: (a) the documented "reset app data" admin action wipes every other campaign sheet but leaves all Party Notes intact, so a "fresh start" silently retains stale party notes; (b) the documented setup tooling never provisions the live notes sheet, and what it *does* provision (`CAMPAIGN_NOTES_FEED`) is the legacy schema. Suggested fix: add `getOrCreateSheet_`/`clearSheetToHeaders_` for `PARTY_NOTES_SHEET` with `PARTY_CAMPAIGN_NOTES_HEADERS` to both `setupInventoryTabs` and `resetAppDataSheets`, and decide whether the legacy 5-col campaign-notes sheet/API should still be initialized at all.

#### ~~RISK · Code.js:1483 · Unconfigured-access deny only fires for empty-email visitors; `DEV_ALLOW_UNCONFIGURED_ACCESS:false` does not block authenticated users~~ FIXED
**Cross-cutting (auth) surfaced while tracing the section-1 API gates.** When the app is unconfigured (`ALLOWED_USERS` unset *and* `PLAYER_CHARACTER_MAP` empty, so `effectiveAllowed.length === 0`): with the DEV flag now `false` (11), a visitor whose `Session.getActiveUser().getEmail()` resolves to a non-empty value falls through 1483 (DEV false), 1491 (`!email` false), and 1496 (`effectiveAllowed.length` 0 → condition false) to `return email` at 1500 — i.e. **allowed**. Only empty-email visitors are denied (1493). The flag's name and README imply unconfigured access should be closed when the flag is false. Mitigated in practice: with `executeAs: USER_DEPLOYING` on personal Gmail only the deployer resolves a non-empty email, and production is configured (`@306`, map set → `effectiveAllowed` non-empty → 1496 enforces the allowlist), so this path is unreachable today. Latent risk if the map is ever cleared. Suggested fix: gate the unconfigured fall-through on the DEV flag explicitly rather than relying on email emptiness.

### 2026-06-18 (run 13) — Sections audited: 13

#### ~~RISK · Index.html:8224 · `visibilitychange` resume guard compares an object to the string `'0'` — always true, so the intended "only resume if sync was initialized" gate never fires~~ FIXED
**Stories traced: Cross-cutting "iOS background/foreground" + Collaborative sync interference.** `syncState` is initialized at 2819 as `{ inventory: { ts: '0', by: '' }, notes: { ts: '0', by: '' } }`, and `pollSync` consistently reads it as an object (`res.inventory.ts !== syncState.inventory.ts`, 4349). But the foreground handler at 8221–8230 guards the resume with:

```js
} else if (syncState.inventory !== '0' || syncPollTimer) {
  pollSync(); stopSyncPoll(); startSyncPoll();
}
```

`syncState.inventory` is the object `{ts, by}`, so `syncState.inventory !== '0'` is **always true** (an object is never strict-equal to a string). The guard was clearly meant to read `syncState.inventory.ts !== '0'` — i.e. "only resume polling on foreground if sync state was ever established, or a timer already exists." As written, the first operand short-circuits the condition to always-true and the `|| syncPollTimer` arm is dead.

Behavioral consequence (the reason this is RISK, not just dead code): the resume now fires **unconditionally** on every foreground return, including the one case the guard was meant to exclude — the app being backgrounded *before identity resolves* (during the full-screen identity-picker overlay, before `applyIdentity` sets `syncClientId` at 4733 and before the normal `startSyncPoll`). On return, `pollSync()` runs with `syncClientId === ''`: any real `res.inventory.by` then satisfies `by !== syncClientId`, so `loadInventory(true)` fires and `syncState.inventory` is advanced — a full inventory fetch kicked off before identity is known, behind the still-visible overlay, and with the writer's-own-skip (`by === syncClientId`) inoperative for that tick. `startSyncPoll` is idempotent (4367) and `pollSync`/`apiGetSyncState` are read-only, so there is no data corruption and the later `applyIdentity` reconciles — impact is a wasted early round-trip and a prematurely-advanced `syncState`, not state loss. Fix: change the operand to `syncState.inventory.ts !== '0'` so the guard matches its intent (and `syncPollTimer` again becomes the meaningful resume condition).

#### ~~IDEA · Index.html:8049,8081 · Scroll add-failure restores the generic library name in the preview, leaving the visible spell field blank — confusing on retry (not data loss)~~ FIXED
**Story traced: Add library item (Scroll variant) — failure at the Add step.** For a scroll, the visible input is `#scrollSpellName`; the real submitted name is composed as `Scroll of <spell>` and stored in the hidden `#item` field (7994). On add failure, the handler restores `selectedEquipment = selectedSnapshot` and calls `fillAddFormFromEquipment(selectedSnapshot, false)` (8050/8082) — `selectedSnapshot` is the generic library/quick item (`name` ≈ "Spell Scroll"), so: (a) the preview header `#selectedName` is set back to "Spell Scroll", and (b) `setScrollMode_(true)` re-shows the spell field but does **not** repopulate it (the `scroll of (.+)` regex doesn't match the generic name, and `clearAddForm` at 8036 already blanked `#scrollSpellName` via `setScrollMode_(false)`). The user is left looking at a header that says "Spell Scroll" and an empty spell field. The good news — and why this is IDEA not BUG — is that `#item` was restored to `payloadSnapshot.item` = "Scroll of Fireball" (8053/8086), and on the next Add `rawName` reads from `#item` with an empty `_spellVal`, so the retry **does** resubmit the correct "Scroll of Fireball". So there's no data loss, only a misleading preview. Suggested improvement: on the scroll failure restore, repopulate `#scrollSpellName` from the captured spell value (parse it back out of `payloadSnapshot.item`, or snapshot `_spellVal` alongside the payload) and re-run `handleScrollSpellInput()` so the header and field reflect what will actually be submitted.

#### Note · Index.html:7981,8120,7665,7935,8206 · Add library/custom/quick happy paths, double-submit guard, and Add self-heal traced clean (positive baseline)
**Stories traced: Add library item, Add custom item, Add quick item, Combine duplicate (entry), Tab-switch-during-in-flight (add), Collaborative sync interference (add).** `addInventoryItem` (7981) builds the optimistic row, caches, fires the matching endpoint (`apiQuickAddInventory`/`apiAddCustomInventory`/`apiAddInventory`) with `_syncClientId` so the writer's own poll skips (4350). Confirmed Add is genuinely immune to the run-10/11/12 poll-clobber class **even though it never bumps `_inFlightWrites`**: it removes the optimistic row by `optId` with `inventoryRows.filter(...)` (8045/8076) — not a blind `previousRows` snapshot restore — and re-applies the real server row by id via `primeInventoryCacheAfterAdd` (8068, upsert by `Inventory ID`). So if a concurrent write's `loadInventory(true)` replaces `inventoryRows` mid-flight, the success branch yields `serverSet + realAddedRow` and the failure branch yields the clean `serverSet` (optId already gone, filter is a no-op) — both correct, and both preserve the other user's synced-in change, unlike the delerium/remove revert paths fixed in earlier runs. Double-submit is blocked by the synchronous `clearAddForm()` (8036) emptying `#item` before the round-trip, so a second tap hits the empty-`rawName` guard (7986). The run-5 form-restore on `!ok` (8049–8061) and on transport failure (8076–8095) are both present and symmetric. `clearAddForm` (8120) clears `#scrollSpellName` via `setScrollMode_(false)` (8146) even though it is not in the id list, and resets `qty` to 1. The `resize` handler's run-2 fix (only close editor/description when `|heightDelta| > 150`, 8211) is intact, so the virtual keyboard appearing during Add no longer dismisses an open sheet. `selectEquipmentResult`/`loadSelectedDescription` closure guards (`selectedEquipment.itemId !== requestedItemId`, 7957/7973) survive a navigate-away mid-description-fetch. XSS surface re-verified: every interpolated field in `renderEquipmentResults`/`renderStatBlock_`/`fillAddFormFromEquipment` uses `escapeHtml` or `.textContent`. Only the two findings above stand for this section.

### 2026-06-18 (run 12) — Sections audited: 12

#### ~~BUG · Index.html:7366 · `deleteSelectedInventory` omits the `_inFlightWrites` bump — the one optimistic write path the run-10 poll-clobber fix missed; full-delete reverts and never self-heals~~ FIXED
**Stories traced: Delete inventory item (swipe card → Delete; editor → Delete / Confirm delete all) + Cross-cutting "Collaborative sync interference."** Run-10 closed the poll-clobber hole by adding a `pollSync` guard (4350: defer `loadInventory(true)` when `_inFlightWrites > 0`) and bracketing `confirmDescRemove` with `_inFlightWrites++/--`. Run-10 enumerated the other clobber-prone optimistic writes (Give 5968, Sell-for-Gold 5567, Undo 6629) — all of which **do** now bump the counter — but **`deleteSelectedInventory` (7366) was not on that list and still does not bump it** (grep confirms the only four bumpers are 5567/5968/6629/6928). This function backs the entire **Delete inventory item** story: swipe-delete-one (`handleInventoryDeleteActionById` 6363 → `decrementOnly`), swipe-delete of a qty-1 row, and the editor "Delete / Confirm delete all" buttons. Failure sequence for a **full delete** (qty-1 swipe, or editor delete-all):

1. User deletes. `inventoryRows` is optimistically filtered (7416), `closeInventoryPanels(false)` + `renderInventory()` (7419–7420) paint the item gone, and `apiDeleteInventory` fires (7452) — **no `_inFlightWrites++`**.
2. The 20 s poll fires and sees a *different* user's write. Because `_inFlightWrites === 0`, the guard at 4350 is skipped → `loadInventory(true)` runs. If GAS serializes the read before the delete commits, the server set still contains the item; `inventoryRows = newRows` (4116, unguarded) puts it back and `renderInventory()` re-shows it.
3. The delete's success handler (7426) calls `bustInventoryCache()` and `updateInventoryRowFromServer(res.item)` — but a *full* `apiDeleteInventory` returns no `res.item` (the row is gone), so the clobbered-back row is **not** re-removed and there is no `renderInventory()` on the success path beyond the merge.
4. The delete committed with `SYNC_INVENTORY_BY = this user`, so every later poll hits the `by === syncClientId` skip (4356). The deleted item **stays visible indefinitely** until an unrelated user writes. Server truth is correct; the client lies.

The swipe-**remove-one** sub-path (qty>1 → `apiAdjustInventory` delta −1, 7450) happens to self-heal because `apiAdjustInventory` returns `res.item` and `updateInventoryRowFromServer` re-applies the decrement — so the damage is confined to the full-delete branch, exactly as Add self-heals but Remove did not in run-10. Fix: bracket both the `apiDeleteInventory` and `apiAdjustInventory` calls in `deleteSelectedInventory` with `_inFlightWrites++` (before the call) / `_inFlightWrites--` (first line of both success and failure handlers), matching its four siblings. Note this path also never writes the optimistic mutation to cache (no `cacheInventoryRows` before the call, unlike `confirmDescRemove` 6925) — relying solely on in-memory + `bustInventoryCache` on success — so the bump is the complete fix here; there is no stale-cache write to additionally guard.

#### ~~BUG · Index.html:6855,6886,5540 · Multiple-holder rollup: the `isMultiple` branch is dead, so a DM-scope cross-holder stack shows a card qty the description sheet can't match or fully remove/sell~~ FIXED
**Stories traced: View item details (tap card → description sheet), Remove item, Sell item (description sheet → Sell for Gold → stepper).** `rollupInventoryRows` (6506) merges rows by `name|category|rarity` (holder is **not** in the key) and sets `existing['Holder'] = 'Multiple'` (6531) when the merged rows span different holders, summing `Qty` across them. The grouped card therefore shows the *full* cross-holder total. But `selectedInventory` is **only ever assigned a raw `inventoryRows[index]` row** (6735/6752/6784 and the `*ById` entry points) — never the rolled-up object — so `selectedInventory['Holder']` is always a concrete single holder and `selectedInventory._rollupKey` is always `undefined`. Consequences:

- In `getDescRemoveTotalQty_` (6852) and `confirmDescRemove` (6883) and `confirmSellItem` (5540), `isMultiple = repHolder === 'Multiple'` is **always false** — the entire `isMultiple` handling is dead code.
- `repHolder` is the representative row's single holder, so the matching-row filter (`String(r['Holder']) !== repHolder` → reject, 6860/6892/5546) scopes to **only that one holder's rows**, not the full rollup.

Concrete defect in **DM scope** (the only scope where a rollup spans holders — Party scope filters to empty-holder rows, player scope to one holder, so both collapse to a single-holder rollup that works correctly): a potion held by A(3) and B(2) renders as a single `5× Potion` card. Tapping it sets `selectedInventory` to A's raw row → `descriptionTitle` shows `3× Potion` (6793, only A's subset) and the remove/sell stepper max is 3 (`getDescRemoveTotalQty_` → 3). The DM sees a card that says 5 but a sheet that says 3, and **cannot remove or sell B's 2 units from the description sheet at all** — directly contradicting the README's claim that description-sheet Remove/Sell "use FIFO drain across all rollup rows." Fix options: (a) carry `_rollupKey`/`Holder` of the tapped rollup into the selected context (e.g. through `openInventoryPrimaryActionById`) so `getDescRemoveTotalQty_` can set `isMultiple` correctly; or (b) if single-holder scoping is the intended behavior, drop the dead `isMultiple` branches and make the card title reflect the representative-holder subset so card and sheet agree. Either way the current state — full total on the card, partial total in the sheet — is inconsistent.

#### Note · Index.html:6014,6082,6304,7120,6506 · Pay/split, ledger-note edit, quick-adjust, and rollup render traced clean (positive baseline)
**Stories traced: Pay gold (confirmPayWithReason 6014, routing to Purchase/character), Split gold evenly (splitGold 6082), Edit ledger note (selectLedgerRowForEdit 6257 / updateLedgerNoteFromBottom 6304), Quick-adjust currency/delerium (openQuickEditPanel 6997 / confirmQuickEdit 7120).** `confirmPayWithReason` and `splitGold` are optimistic on `inventoryResourceLedger` *only* (prepend a `_pending` entry; no `inventoryRows` mutation), so a poll clobber during their in-flight window loses nothing — `loadInventory(true)` replaces `inventoryRows` but the success handlers `primeInventoryCacheAfterAdd` the returned pool-deduct/items/remainder by id (upsert) and strip the pending entry by `_pendingId` on both `ok` and `!ok`/transport-fail; this is why neither needs the `_inFlightWrites` bump that the `inventoryRows`-mutating paths above require. `updateLedgerNoteFromBottom` captures `timestamp`/`resource`/element refs into locals (survives a tab switch mid-flight), disables the action buttons during flight, finds the entry by `Timestamp`, writes `Notes`, re-caches (run-5 fix at 6328), and exits edit mode on success; failure re-enables buttons and leaves the note in the input for retry (the same-millisecond `Timestamp` keying remains the previously-DEFERRED schema item, not re-counted). `confirmQuickEdit` is `quickEditInFlight`-guarded (run-5) and **non-optimistic** (mutates `inventoryRows` only inside `finishSuccess` via `updateInventoryRowFromServer`, which re-applies the server row by id), so a poll clobber self-heals like Add — its omission of `_inFlightWrites` is benign, unlike `deleteSelectedInventory`. `rollupInventoryRows` (6506) / `renderInventoryGroup` (6482) / `getInventoryGroupKey` (6432) classification and the `escapeHtml` coverage on every interpolated card field (4243) are intact. Separately confirmed `renderResourceBreakout` (6136) — and therefore the dashboard `payResource` (6551) / `undoResourcePay` (6618) / `lastResourceUndo` "Undo last pay" UI — has **no caller** (grep: only the definition). The live Pay flow is the gold sheet (`confirmPayWithReason`), which has no inline Undo; the catalog "Undo last pay" story has no rendered entry point in the current build. Recorded as an observation (dead UI is out of audit scope, not counted as a defect).

### 2026-06-18 (run 11) — Sections audited: 11

#### ~~BUG · Index.html:5100,5193 · `receiveDelerium`/`sellDelerium` skip the `_inFlightWrites` bump, so the run-10 poll guard never protects them — a concurrent write gets reverted + cache-poisoned on failure~~ FIXED
**Stories traced: Receive crystals, Sell crystals + Cross-cutting "Collaborative sync interference."**
The run-10 fix added a guard in `pollSync` (4350): when another user's write arrives *and*
`_inFlightWrites > 0`, the reload is deferred (`syncState` is intentionally left un-advanced so the
next tick retries). That guard is the only thing standing between an in-flight optimistic write and a
clobbering `loadInventory(true)`. But **only three heavy paths bump `_inFlightWrites`**
(`confirmSellItem` 5567, `giveItemToCharacter` 5968, plus remove/undo elsewhere). `receiveDelerium`
(5100) and `sellDelerium` (5193) **do not**, even though both optimistically mutate `inventoryRows`
(prepend temp rows, 5123/5226) and snapshot `previousRows`/`previousLedger` (5115/5218). Failure
sequence for **Sell crystals**:

1. Treasurer decrements counters and taps Sell. `sellDelerium` snapshots `previousRows`, prepends
   negative-qty optimistic rows, caches, fires `apiSellDelerium` (still in flight).
2. The 20 s poll fires and sees a *different* user's write. Because `_inFlightWrites === 0`, the guard
   at 4350 is skipped → the `else` runs: `syncState.inventory = res.inventory` (4353, **advanced**) and
   `loadInventory(true)` (4354). `inventoryRows` is replaced with the server set (which includes the
   other user's committed change and excludes my temp rows).
3. `apiSellDelerium` comes back `!ok` (or transport fails). The handler does a **blind**
   `inventoryRows = previousRows` (5256 / 5283) — the snapshot taken in step 1, which predates and
   therefore **erases the other user's synced-in change** — then `cacheInventoryRows(previousRows…)`
   (5260/5285) writes that stale set to `localStorage`, and `renderDeleriumSheetBody()` repaints from
   it. The main inventory DOM still shows the poll's render, so DOM and `inventoryRows` now disagree.
4. Because the poll already advanced `syncState.inventory` to the other user's `ts` (step 2), no future
   poll re-triggers for that write. The other user's change is gone from this client's memory **and**
   cache until some *later* unrelated write bumps the sync timestamp again.

The success path happens to self-heal (temp rows are filtered out and `res.items` are re-applied via
`primeInventoryCacheAfterAdd`, like Add), so the damage is confined to the **failure** branch — but
that is exactly when the user most needs correct state. Note `receiveDelerium`'s failure handler
(5169–5178) additionally omits any `renderInventory()`, so the main list is left showing the poll's
data while `inventoryRows`/cache hold the stale revert. Fix: bracket both `apiSellDelerium` /
`apiReceiveResource` calls with `_inFlightWrites++` / `_inFlightWrites--` on **all** exit paths
(matching `confirmSellItem`/`giveItemToCharacter`), so `pollSync` defers the mid-write reload. This is
the same gap the run-4 note explicitly waved off ("rely on the `by === syncClientId` poll skip") — but
that skip only covers the *writer's own* poll, not a concurrent *other* user's write, which is the case
that breaks here.

#### ~~BUG · Index.html:5240 · `sellDelerium`'s optimistic pending ledger entry is built AFTER the render, so the "Selling…" entry never shows (and isn't cached)~~ FIXED
**Story traced: Sell crystals (optimistic ledger feedback).** `receiveDelerium` builds its `_pending`
RECEIVE ledger entry at 5131–5137 **before** `renderDeleriumSheetBody()` (5144) and before
`cacheInventoryRows` (5143), so the pending row appears in the ledger immediately and is persisted.
`sellDelerium` does the opposite: it calls `cacheInventoryRows(inventoryRows, inventoryResourceLedger)`
(5234) and `renderDeleriumSheetBody()` (5238) **first**, and only *then* prepends the `_pending` SELL
entry to `inventoryResourceLedger` (5240–5247) — with no further render or cache write before the
`google.script.run` call. Consequences during the in-flight window: (a) the SELL pending entry is
**invisible** in the ledger (the negative-qty crystal rows and the title total do update, but the
ledger does not), inconsistent with the documented optimistic-feedback behavior and with the RECEIVE
path; (b) the pending entry is **not** in the cached payload, so a reload/navigate-away mid-flight
shows no trace of the pending sell. On success the real entry is prepended and rendered (5271–5278), so
this is cosmetic/feedback only, not data loss. Fix: move the `_pending` ledger-entry construction
(5240–5247) above the `cacheInventoryRows`/`renderDeleriumSheetBody` calls (5234/5238), mirroring
`receiveDelerium`.

#### Note · Index.html:5382,5442,5955,4830,4727,4580 · Receive-gold, pay-routing, give, identity, and notes write paths traced clean
**Stories traced: Receive gold, Pay gold (routing/setup), Give item to character, Create/Edit/Pin/Archive
note, First-open identity.** `receivedGold` (5382) is optimistic on the *ledger only* (no
`inventoryRows` mutation), so a poll clobber during its in-flight window loses nothing — the pending
entry self-heals on success (`removePending` + prepend `res.ledgerEntries`) and on failure the poll's
fresh server ledger is already correct; the cleared amount/note inputs are not restored on failure
(shared cosmetic gap with the other pay handlers, already recorded run-5). Double-tap is blocked by the
immediate `amountInput.value=''` (second tap hits the amount≤0 guard). `openPayReasonSheet` (5442)
re-validates the amount, excludes any `/^DM/` payee from the member list, and the confirm
(`confirmPayWithReason`, verified clean run-5) is reachable. `giveItemToCharacter` (5955) brackets
`_inFlightWrites` up/down on success and failure, reverts `Holder` on both error paths, and captures
`item`/`inventoryId`/`idx` into locals before closing panels (survives navigate-away). The notes
optimistic writes — `saveNoteForm` create/edit (4580), `deleteNoteFromForm` (4558), `archiveNote`
(4650), `toggleNotePin` (4672) — all snapshot a backup, roll back on `!ok` and on transport failure,
clear `notesSaving` on every path, and surface errors via `setMainStatus`/`alert`; notes are an
independent in-memory store (`notesData`) untouched by `loadInventory`, so the inventory-poll clobber
class does not apply. Identity: `confirmIdentity` (4830) is `identityChoiceSaving`-guarded;
`startSyncPoll` (4366) is idempotent (`if (syncPollTimer) return`), so the multiple `applyIdentity`
calls during startup (cached → fallback → server) create only one poll interval. `confirmSellBatch`
(5890) is **non-optimistic** (mutates `inventoryRows` only inside its success handler) and ends with a
`loadInventory(true)` refetch, so although it also omits `_inFlightWrites`, the worst case is a
transient double-subtract that the trailing refetch immediately corrects — no persistent divergence,
unlike the delerium paths above which revert to a stale snapshot.

### 2026-06-18 (run 10) — Sections audited: 10

#### ~~BUG · Index.html:4116 · Poll-triggered `loadInventory(true)` clobbers an in-flight optimistic write and never self-heals~~ FIXED
**Story traced: Cross-cutting "Collaborative sync interference" + Remove item / Sell item.** `pollSync`
(4338) fires every 20 s; when it sees another user's write (`res.inventory.by !== syncClientId`) it
calls `loadInventory(true)` (4344). `loadInventory`'s success handler does `inventoryRows = newRows`
(4116) **unconditionally** — there is no `_inFlightWrites` guard on the in-memory replacement, only
`cacheInventoryRows` (2927) is guarded. Concrete failure sequence for **Remove item** (description
sheet → Remove → Confirm, `confirmDescRemove` 6872):

1. User confirms a remove. `inventoryRows` is optimistically FIFO-drained (6899–6909), cache written,
   `renderInventory()` shows the items gone, and `apiSellInventoryBatch` fires (still in flight).
2. The 20 s poll fires and detects a *different* user's write → `loadInventory(true)`. GAS serializes
   on the document lock, so if `apiGetInventory` runs before the remove commits, it returns rows that
   **still contain the items being removed**. `inventoryRows = newRows` puts them back; the signature
   check (4102 vs 4122 — pre-fetch signature is from the drained array, post-fetch from the full
   server set) differs, so `renderInventory()` (4124) re-paints the removed items as present.
3. The remove's success handler (6918) only calls `bustInventoryCache()` on the `ok` path — it does
   **not** re-apply the removal to the now-clobbered in-memory `inventoryRows`, and does not
   `renderInventory()`. So the UI keeps showing the removed items.
4. The remove committed with `SYNC_INVENTORY_BY = this user`, so every subsequent poll hits the
   `by === syncClientId` skip (4344) and never force-reloads. **The stale "items still present" view
   persists** until an unrelated user writes (or the revalidate window lets a manual load refetch).
   Server truth is correct; the client lies indefinitely.

The same clobber-window exists for Give (5957), Sell-for-Gold (5556), sell-batch, and the optimistic
Add (8012) — Add happens to self-heal because its success handler re-inserts the real row via
`primeInventoryCacheAfterAdd`, but Remove/Sell have no such re-application. Fix: gate the poll trigger
or the in-memory swap on `_inFlightWrites` — e.g. in `pollSync` skip `loadInventory(true)` when
`_inFlightWrites > 0` (and re-check on the next tick), or in `loadInventory`'s success handler bail out
of the `inventoryRows = newRows` swap while a local write is pending. The cleanest is the `pollSync`
guard since it also avoids the wasted round-trip mid-write.

#### ~~BUG · Index.html:6917 · `confirmDescRemove` omits the `_inFlightWrites` bump its siblings all have — poisons the cache during the clobber above~~ FIXED
**Story traced: Remove item (description sheet → Remove → stepper → Confirm).** Every other comparable
optimistic write brackets its server call with `_inFlightWrites++ … _inFlightWrites--`: Give
(5957/5977/5991), Sell-for-Gold (5556), and Undo-pay (6618/6626/6639). `confirmDescRemove` (6872) does
**not** — it mutates `inventoryRows`, calls `cacheInventoryRows` (6914), and fires
`apiSellInventoryBatch` (6917) with no bump. Consequence: during the in-flight window, the
`_inFlightWrites > 0` guard in `cacheInventoryRows` (2927) is **not** asserted, so the
poll-triggered `loadInventory(true)` from the finding above will happily write the stale
"items-present" snapshot to the `localStorage` cache as well as to memory. The post-commit
`bustInventoryCache()` (6925) clears it, but `loadInventory` already set `lastInventoryLoadAt`
(4119), so a later non-force load can re-paint stale from memory inside the revalidate window before
any refetch. Fix: bracket the `apiSellInventoryBatch` call in `confirmDescRemove` with
`_inFlightWrites++` / `_inFlightWrites--` on both success and failure handlers, matching its siblings.
This is necessary but not sufficient on its own — the in-memory clobber (above) still needs its own
guard.

#### Note · Index.html:3064,3193,3419,4338,4422 · Tap-to-open, tab-switch, combine, and Party-Notes-v2 render traced clean
**Stories traced: View item details (tap card), Tab-switch-during-in-flight, Combine duplicate,
Create/Edit/Pin/Archive note (render side).** Tap-to-open: `pointerup` (3072) and `touchend` (3138)
both route through `openInventoryPrimaryActionById(getRepId(row))` and both set/check
`lastTapOpenedAt` with the 500 ms timestamp guard (3078/3086/3157) — the run-4 race fix holds, no
double-open. Tab switch (`setCommandMode` 3193) clears the filter, re-applies scope as holder on the
Add tab, and on return to inventory calls non-force `loadInventory()` which paints from in-memory
`inventoryRows` (4071) — an in-flight add's success handler reconciles by `optId`, so a tab-switch
mid-add lands correctly. Combine: `showCombineChoice`/`confirmCombineInventoryItem` (3419/3442)
double-tap guard (null `pendingCombineChoice`, restore on error) is intact; the only combine defect
remains the run-9 `combineSheet` invisibility BUG (still open, not re-counted). Party Notes v2
`loadNotes` (4396) `notesLoading` re-entrancy guard + stale/TTL revalidate and `renderNotesList`
(4422) pinned-first sort, pending-badge dimming, and `escapeHtml`/`escapeJsString` on every interpolated
field are all correct — no XSS or stuck-state in the render path. v1 campaign-notes optimistic
submit/delete (3762/3849) snapshot+rollback verified; swipe-delete-no-confirm is the existing README
TODO, not re-counted.

### 2026-06-18 (run 9) — Sections audited: 9

#### ~~BUG · Index.html:1516 · `combineSheet` is invisible on every device — Combine duplicate story is dead, plus a phantom scroll-lock~~ FIXED
**Story traced: Combine duplicate (duplicate detected after add → combine sheet → Confirm).** The
desktop media query `@media (min-width: 700px)` sets `.mobile-sheet { display: none !important }`
(1516) and then re-enables only a hardcoded whitelist of sheet ids via
`#X.active { display: block !important }` (1517–1526). `#combineSheet` is the **only** `.mobile-sheet`
in the HTML (2560) that is neither in that whitelist nor has a desktop-editor equivalent (`inventorySheet`
and `quickEditSheet` are deliberately omitted because `desktopInventoryEditor` / `desktopQuickEditor`
replace them — combine has no such replacement). The base rule `.mobile-sheet.active { display: block }`
(1240) carries no `!important`, so the `!important` desktop override wins for **all** viewports ≥700px.
The catch: the iOS GAS webview renders at ~980px CSS width (documented in README CSS notes), so this
"desktop" query is always active on the actual target phones, and no `html.is-phone` rule re-enables
`.mobile-sheet` display. Net effect on every real device:

1. `addInventoryItem` success handler detects a duplicate and calls `showCombineChoice` (8053–8054 →
   3419). It adds `.active` to `#combineSheet` and calls `syncModalOpenState()`.
2. The sheet stays `display:none !important` → the combine suggestion **never appears**. The Combine
   duplicate user story cannot be completed by any user.
3. `syncModalOpenState()` (3398) sees a `.mobile-sheet.active` exists and sets `body.app-modal-open`
   (`overflow:hidden`, 110) → **page scroll locks behind an invisible modal**. The only handlers that
   clear `.active` (`keepDuplicateInventoryItem` 3436, `confirmCombineInventoryItem` 3442) are wired to
   buttons *inside* the invisible sheet, so they are unreachable by tap. `setCommandMode`/tab switches
   don't clear `combineSheet`, so the scroll-lock persists until a full page reload.

Fix: add `#combineSheet.active { display: block !important; }` to the whitelist at 1517–1526 (and
mirror any phone-specific block if one is later added). Two-line change; restores the entire Combine
duplicate flow and removes the stuck scroll-lock.

#### Note · Index.html:5469,5944,7257,2894 · Give-from-quick-edit and holder-dropdown repopulation traced clean
**Stories traced: Give item to character (quick-edit entry point), Edit inventory item (holder dropdown),
Add library item (holder dropdown).** The quick-edit sheet exposes a "Give to…" button (2484); verified
it works: `openGiveItemSheet` (5469) falls back to `selectedQuickEdit` when `selectedInventory` is null,
and `giveItemToCharacter` (5944) captures `item` into a local before `closeInventoryPanels(false)` (7257)
nulls `selectedQuickEdit` and closes *both* the quick-edit and inventory editors via `setQuickEditorOpen
(false)` — so the quick sheet does not get orphaned open. The optimistic `apiUpdateInventory` write pairs
`_inFlightWrites` up/down on success and failure and reverts `Holder` on both error paths. Status-element
precedence (`sheetEditStatusMessage || editStatusMessage || quickSheetStatus`, 5960) always resolves to
the always-present hidden inventory-edit status, but every give path closes all sheets immediately, so
the message is never surfaced anyway (row-pulse `.saving` is the real feedback) — cosmetic, not a defect.
`populateCharacterSelectors` (2894) repopulates `holder`/`editHolder`/`sheetEditHolder` on every
`loadCharacters` (2914) return, preserving the current `el.value` and synthesizing an `(existing)` option
when the held character is no longer active — so an in-flight edit started before the roster resolves
keeps its holder. No findings in these paths.

#### Note · Index.html:1233–2037, 2040–2741, 2743–2992 · Section 9 CSS / sheet markup / early-JS helpers otherwise clean
Re-verified the remainder of the range carries no other write paths. The mobile-sheet display whitelist
(1517–1526) is correct for every id *except* combineSheet (above). Cache helpers (`cacheInventoryRows`
2926 `_inFlightWrites` guard, `primeInventoryCacheAfterAdd` 2937, equipment cache 2964/2981) and
`updatePhoneClass` (2995) match the run-4 baseline. The static sheet markup for all overlays
(inventory/description/quickEdit/notes/noteForm/combine/gold/delerium/sell/sellBatch/give/payReason/
identity/dice) is structurally intact with the correct `.mobile-sheet` class and close handlers; module
state declarations (2745–2849) are consistent with their consumers.

### 2026-06-18 (run 8) — Sections audited: 8

#### ~~RISK · Index.html:1098 · `.notes-list` chat scroll uses `align-content: end` (iOS WKWebView top-clip)~~ FIXED
**Story traced: Party Notes (v1 campaign-notes chat list, `#campaignNotesList`).** The list is a
scrollable flex child: `.notes-sheet-body` is `display:flex; flex-direction:column`, and
`.notes-list` (1098) is `flex:1; display:grid; align-content:end; overflow-y:auto`. `align-content:
end` pins entries to the bottom (chat style, newest last). This is the classic WebKit/WKWebView
overflow-clip pitfall: when a grid/flex scroll container aligns its content to `end` (or `center`)
and the content is taller than the container, the overflowing items in the *start* (top) direction
get clipped above `scrollTop: 0` and cannot be reached by scrolling on older iOS Safari/WKWebView.
The app explicitly targets the iOS GAS webview, and the campaign-notes list grows unbounded with
use, so once there are more notes than fit on screen the **oldest notes become unreachable**. A JS
scroll-to-bottom does not help — the clipped region sits above the scrollable origin. Safer pattern:
order entries normally (top-aligned), push them to the bottom with `margin-block-start: auto` on the
first child (or a leading spacer `div`), and keep `overflow-y:auto` — that bottom-anchors without the
end-alignment clip. Severity is RISK rather than BUG because newer WKWebView builds have largely
fixed the clip; flagging because the target runtime and the unbounded list make it reachable.

#### Note · Index.html:110,3397,4804,4832,6838,6943 · Body scroll-lock reconciliation is sound across nested sheets
**Stories traced: View item details → Give to… / Sell / Remove (description→give nesting), First-open
identity, Quick-adjust currency.** `body.app-modal-open { overflow:hidden }` (110) is driven by two
mechanisms: `syncModalOpenState()` (3397) recomputes the class from `Boolean(document.querySelector(
'.mobile-sheet.active'))`, and a few flows `add`/`remove` it directly (identity 4804/4832, description
6838). Confirmed every overlay (`#descriptionSheet` 2406, `#giveItemSheet` 2655, `#identitySheet`
2677, `#notesSheet` 2495) carries the `.mobile-sheet` class, so the direct adds/removes are
idempotent with the toggle. `closeDescriptionSheet` (6943) routes through `syncModalOpenState`, so the
description→give→close-give→close-description nesting keeps the lock asserted while any sheet remains
open and releases it exactly once the last sheet closes. No stuck-scroll state. Stacking order is also
non-blocking: `html::before/::after`, `.scope-slider-indicator`, and the wallpaper layers all carry
`pointer-events:none`; sheet z-indexes (description 70 < give/payReason 80 < identity 90) nest taps
correctly above `.app-header` (22) and `.bottom-nav` (30).

#### Note · Index.html:1124–1168 · Notes/inventory swipe-action CSS resting state matches the JS reveal
**Stories traced: Edit/Archive note (swipe), Delete inventory item (swipe).** `.notes-edit-action`/
`.notes-delete-action` (1136) default to `opacity:0` with a small offset transform; `setNoteSwipeVisual`
(3663) drives `opacity` and `transform` via inline styles proportional to drag progress, so the CSS
`opacity:0` is the correct resting state, not a dead rule — no CSS↔JS class mismatch that would leave
the actions invisible. `.inventory-card` (542) intentionally omits a transform transition (JS-driven
live drag) and `.snap` (555) re-adds it for release; `.inventory-delete-action` (569) sits at z-index 1
behind the card (z-index 2). `.inventory-row.saving` (532) and `.notes-note.pending`/`.editing`
(1170/1174) optimistic-state classes are all defined and exercised by the render paths. Section 8 is a
pure CSS/token range; no other write paths or interactive logic live here.

#### ~~BUG · Index.html:7132 · Quick-adjust discards the server's ADJUST ledger entry~~ FIXED
`finishSuccess` in `confirmQuickEdit` now prepends `res.ledgerEntry` to `inventoryResourceLedger`
(sliced to 60) when present, then passes both arrays to `cacheInventoryRows`. The ADJUST entry
now appears immediately in the Gold/Delerium tab ledger after a quick add/remove, matching the
`receiveDelerium`/`sellDelerium` pattern.

#### ~~BUG · Index.html:7148 · "Set total" quick-adjust on gold/delerium writes no ledger entry at all~~ FIXED
`apiSetItemQuantity` now calls `classifyQuickEdit_` on the row, and when the item is currency or
delerium crystal and `qty !== oldQty`, appends an `ADJUST` ledger entry (delta = qty − oldQty)
via `appendResourceLedger_` and returns the sanitized entry to the client. `confirmQuickEdit`'s
`finishSuccess` (fix above) then prepends it to the ledger. Set-mode gold/delerium adjustments now
produce the same RESOURCE_LEDGER history as add/remove mode.

#### ~~IDEA · Index.html:6960 · Client/server disagree on whether platinum/silver/copper is quick-editable~~ FIXED
`getQuickEditType` now applies the same two-guard pattern as `classifyQuickEdit_` and `isGoldItem_`:
platinum/pp/silver/sp/copper/cp names return `''` first, then gold/gp/category-currency return
`'currency'`. Non-gold coin stacks now route directly to the full inventory editor with no
flash-and-swap.

#### Note · Code.js:3501–end / Index.html:3466,6646,7430 · Combine + delete + swipe-remove stories re-traced clean
Traced **Combine duplicate**, **Delete inventory item**, and the swipe remove-one/delete paths.
Server `apiCombineInventoryItems` (3537), `apiDeleteInventory` tail (3501), `apiAdjustInventory`
(3710), `apiSetItemQuantity` (3830), and `apiGetCurrencyQuickEdit` (3659) all acquire
`tryLock(10000)`, release in `finally` on every throw/return, and route catches through
`publicValidationError_`/`publicApiError_` — consistent with the run-6 server baseline. Navigate-away
on `confirmQuickEdit`: handlers capture static sheet elements (`status`, `prefix`) that survive a
tab switch; `quickEditInFlight` is paired up/down on both success and fail; `closeQuickEditPanel`
nulls `selectedQuickEdit` without leaving the in-flight flag stuck. The run-4 close guard keeps the
quick sheet open across a poll-triggered `loadInventory(true)`. The two BUGs above are the only
write-path defects found; the lock/rollback/state-machine shape is otherwise sound.

### 2026-06-18 (run 6) — Sections audited: 3, 4, 5, 6

#### Note · Code.js:1101–1700 · Section 3 re-audit — clean
Range is helpers / validation / identity / sanitizers — no client-facing optimistic
write path lives here. Re-verified the pieces that feed the write handlers:
`requireTreasurer_` (1415) resolves the client-character hint only when
`requireAllowedUser_` yields the `url-authenticated-user` / `dev-unconfigured-user`
placeholder (documented USER_DEPLOYING model); `validateCharacterChoice_` (1357)
rejects inactive characters; `publicValidationError_` (1562) allowlist passes through
exactly the user-actionable prefixes and masks everything else as "Request failed.";
`validateQuantity_`/`validateMoney_`/`validateId_` bounds are consistent with the
callers in §4–6. `saveUserProfile_`/`getUserProfileForKey_` write `Last Seen` without a
lock, but the row is keyed on a single browser's temp user key (no real concurrent
writer), so no campaign-data divergence. No new findings.

#### Note · Code.js:1701–2300 · Section 4 re-audit — clean
`getResourceLedgerForClient_` (1700) read-limit clamp (1–200) and `.reverse()` newest-first
order verified; `appendResourceLedger_`/`auditWrite_` swallow their own errors so a logging
failure never aborts the parent write. Campaign-notes v1 handlers (`apiAddCampaignNote`
2013 / `apiUpdateCampaignNote` 2072 / `apiDeleteCampaignNote` 2142) each acquire
`tryLock(10000)`, release in `finally`, return the sanitized note on success, and route
catches through `publicApiError_`. `apiGetSyncState` (2206) is read-only and degrades to
`{ts:'0',by:''}` on error so a transient failure can't wedge the poll loop. `apiGetNotes`
(2259) applies all filters server-side over an in-memory snapshot. No new findings.

#### Note · Code.js:dead `apiSellInventoryItem` (3017) confirmed unreferenced
`apiSellInventoryItem` deletes the entire inventory row regardless of `Qty` (no partial/FIFO
handling), which would lose a whole stack — but a full Index.html grep shows the client only
ever calls `apiSellInventoryBatch` (5589/5934/6932). The single-item endpoint is dead, so the
whole-row-delete is not reachable by any user. Recording the trace so a future re-wiring of
this endpoint doesn't silently reintroduce stack-loss. (Dead code itself is out of audit scope.)

#### Note · Code.js:2301–2900 · Section 5 re-audit — clean
Party-notes v2 (`apiCreateNote` 2307 / `apiUpdateNote` 2348 / `apiArchiveNote` 2379) and the
inventory-add family (`apiAddInventory` 2401, `apiAddCustomInventory` 2510, `apiQuickAddInventory`
2609, `apiDepleteResource` 2750) all follow the same correct shape: auth → `tryLock(10000)` →
validate → write → `appendResourceLedger_`/`auditWrite_` → `bumpSync_` → return sanitized item +
sanitized ledger entry, with `finally releaseLock()` reached on every throw/return. Category
guard (`PARTY_NOTES_CATEGORIES.includes` 2316/2367) downgrades unknown categories to the stored
value rather than corrupting; `apiUpdateNote` patches only the 6 allowed fields. Confirmed the
optimistic ledger Timestamp the client receives matches what gets persisted: both
`normalizeForClient_` (3895) and `apiUpdateLedgerNote.norm()` (2907) format Dates with
`formatDate(scriptTimeZone,'yyyy-MM-dd HH:mm:ss')` — no timezone skew, so the only residual is
the previously-DEFERRED same-second collision in batch ledger ops, not re-counted. No new findings.

#### Note · Code.js:2901–3500 · Section 6 re-audit — clean
The multi-row write handlers (`apiReceiveResource` 2932, `apiSellDelerium` 3073, `apiSplitGold`
3158, `apiSendGoldToMember` 3296) each build their `ledgerEntries[]`/`items[]` arrays from the
same rowObjects they append, so every optimistic entry returned to the client mirrors a persisted
row. Treasurer gate is correct: split + sell-delerium use `requireTreasurer_(clientCharacter)`;
`apiSendGoldToMember` blocks any `/^DM(\s|$)/i` payee (3308). `apiSplitGold` math
(`floor` per-member + rounded remainder to pool, 3189–3190) reconciles to the input total and
guards `perMember <= 0`. `apiDeleteInventory` accepts both bare-string and object payloads (3472)
and `apiCombineInventoryItems` (3537) re-checks name+category+rarity equality before merging,
writes the merged target, deletes the source, and surfaces a value-mismatch note. All paths
`finally releaseLock()`. No new findings.

### 2026-06-18 (run 5) — Sections audited: 12, 13, 1, 2

#### ~~BUG · Index.html:7100 · `confirmQuickEdit` has no in-flight guard — double-tap double-applies the delta~~ FIXED
Added `let quickEditInFlight = false` module-level flag. `confirmQuickEdit` returns early if
the flag is set; sets it to `true` before firing the API call; both `finishSuccess` and `fail`
clear it on all exit paths. Matches the `resourcePayInFlight` pattern used by `payResource`.

#### ~~BUG · Index.html:6314 · `updateLedgerNoteFromBottom` mutates the in-memory ledger but never re-caches it~~ FIXED
Added `cacheInventoryRows(inventoryRows, inventoryResourceLedger)` immediately after
`entry['Notes'] = newNote`. The `by === syncClientId` poll-skip means the writer's own 20 s
interval never reloads, so the stale-cache cold-reload bug was permanent for the note editor.
Matches the pattern in `confirmPayWithReason` (6046) and `splitGold` (6110).

#### ~~IDEA · Index.html:8013 · `addInventoryItem` success-but-`!ok` path does not restore the cleared form~~ FIXED
The same `payloadSnapshot` / `selectedSnapshot` restore block from `withFailureHandler` is now
also applied in the `!res.ok` branch: `selectedEquipment`, `fillAddFormFromEquipment`, and all
individual form fields (`libraryItemId`, `item`, `category`, `rarity`, `qty`, `holder`,
`valueGp`, `factionRelevance`, `notes`) are restored before `updateAddFlow()`. Server-side
validation rejections no longer silently clear the add form.

#### Note · Index.html:6002,6070,6538,6605 · Gold/delerium pay + undo optimistic flows are otherwise correct (positive baseline)
`confirmPayWithReason`, `splitGold`, `payResource`, and `undoResourcePay` each snapshot/track
state correctly: pending ledger entries are stripped by `_pendingId` on both success and
failure, `resourcePayInFlight` / `_inFlightWrites` are paired up/down on every path, and
`primeInventoryCacheAfterAdd` + `cacheInventoryRows` re-persist on success. The only rollback
gap is cosmetic (amount/note inputs are cleared optimistically and not restored on failure,
shared by all three pay handlers) — re-entry, not data loss. Recording the core traces as clean.

#### Note · Index.html:6870 · `confirmDescRemove` FIFO drain + rollback verified
Optimistic FIFO removal across all rollup rows, `previousRows` snapshot restored on both
`!ok` and failure with `cacheInventoryRows` + `renderInventory`, success busts the cache so a
cold reload refetches server truth. `apiSellInventoryBatch` payload (goldAmount 0) matches the
"Remove" semantics. No rollback gap.

#### Note · Index.html:7501–end · Section 13 add-item flow re-audit — otherwise clean
`addInventoryItem` optimistic add + `optId` removal, snapshot restore on transport failure,
double-submit protection via immediate `clearAddForm()` (second tap hits the empty-name guard),
and the `selectedEquipment.itemId !== requestedItemId` closure guards in `loadSelectedDescription`
/ `openInventoryDescription` are all intact. XSS surface (`escapeHtml` on every `innerHTML`,
`.textContent` for direct assigns) re-verified clean. Only the §13 finding above (8013) stands.

#### Note · Code.js:1–500 · Section 1 re-audit — clean
Config (`DEV_ALLOW_UNCONFIGURED_ACCESS: false` at 11), header constants, menu/setup, and the
`continueCleanEquipmentLibrary` import batcher (lock `tryLock(5000)` + `finally releaseLock()`,
425–583) all consistent with prior fixes. No client-facing optimistic write paths in this
range. No new findings.

#### Note · Code.js:501–1100 · Section 2 re-audit — clean
`apiSellInventoryBatch` lock (`tryLock(10000)`, highest-row-first delete, `finally` release on
all paths incl. auth failure, 667–756) and the read endpoints (`apiGetEquipmentIndex`,
`apiGetCharacters`, `apiGetMyCharacter`) are unchanged and correct. `apiGetCharacters` catch-only
`Logger.log` (804) carries no PII. Classification helpers (`categorizeItem_` magic-item-only
fallback at 1039, `detectMagicItem_` rarity heuristic at 1052) match the documented baseline.
No new findings.

### 2026-06-18 (run 4) — Sections audited: 8, 9, 10, 11

#### ~~BUG · Index.html:4060 · Background sync reload closes an open edit sheet mid-edit (input loss)~~ FIXED
`closeInventoryPanels(false)` at the top of `loadInventory` is now guarded:
`if (!document.querySelector('#inventorySheet.active, #quickEditSheet.active'))`.
When the editor or quick-edit sheet is open, the close is skipped; `inventoryRows`
still refreshes in memory so the list is current once the user dismisses the sheet.

#### ~~BUG · Index.html:4561 · Party Notes v2 save/delete/pin failures roll back silently~~ FIXED
Every silent-revert path now calls `setMainStatus(...)` with an error message:
`saveNoteForm` (edit + create), `deleteNoteFromForm`, and `toggleNotePin` all
surface failures via the main status bar, consistent with every other write
handler in the app. `archiveNote`'s existing `alert()` is left unchanged.

#### ~~IDEA · Index.html:3441 · `confirmCombineInventoryItem` doesn't guard against double-tap~~ FIXED
`pendingCombineChoice` is nulled immediately when the API call fires (after
spreading to `choice`), preventing a second tap from re-entering. On API error,
`pendingCombineChoice` is restored from `choice` so the user can retry from the
still-open combine sheet.

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

#### ~~BUG · Code.js:3701 · `apiAdjustInventory` currency/delerium quick-adjust writes NO ledger entry~~ FIXED
When `quickType` is `'currency'` or `'delerium crystal'`, `apiAdjustInventory`
now calls `appendResourceLedger_` with action `ADJUST`, resource/subtype/qty/
character/notes, and returns the sanitized entry to the client so the ledger
list updates immediately without waiting for the next full sync.

#### ~~BUG · Code.js:1772 · `classifyQuickEdit_` over-broad currency regex~~ FIXED
Split the single regex into two guards: non-gold currency names
(`platinum|pp|silver|sp|copper|cp`) now return `''` first, then gold/gp/
category-currency matches return `'currency'`. Mirrors the same precedence used
by `isGoldItem_` in Index.html. "Silver Holy Symbol", "Copper Key", etc. now
fall through to the normal edit path instead of getting the currency stepper.

#### ~~RISK · Code.js:2301,2340,2371,2393 · v2 notes handlers leak raw `e.message` to client~~ FIXED
`apiGetNotes`, `apiCreateNote`, `apiUpdateNote`, and `apiArchiveNote` catch
blocks now route through `publicApiError_` (which calls `publicValidationError_`
+ `log_`), consistent with every other handler in Code.js.

#### ~~IDEA · Code.js:2709 · `apiQuickAddInventory` optimistic ledger entry drops Notes + Character~~ FIXED
Added `'Notes': ledgerEntry.notes` and `'Character': ledgerEntry.character` to
the `sanitizeResourceLedgerForClient_` call in the success return, matching
`apiDepleteResource` and `apiReceiveResource`.

#### ~~IDEA · Code.js:3579 · `apiCombineInventoryItems` silently discards a Value GP mismatch~~ FIXED
`sourceValue` vs `targetValue` are now compared after `validateMoney_`. When
they differ, the success message includes a note: "values differed — kept
X gp/unit from target." The merge proceeds (fungible stacks are the common
case); the mismatch is surfaced so the user knows.

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
