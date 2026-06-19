# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 10. Index.html lines 3001–4500 (inventory render, search)

## Sessions

### 2026-06-19 (run 22) — Sections audited: 9

**Stories traced through Index.html 1501–3000 (CSS tail, body HTML for all mobile sheets, and the early JS: state declarations + cache/identity helpers):** This range defines (a) the DOM for every mobile sheet and the bottom nav, and (b) the optimistic-cache + collaborative-sync machinery (`_inFlightWrites` 2782, `syncState` 2819, `cacheInventoryRows` 2934 with its in-flight guard, `primeInventoryCacheAfterAdd` 2944, `getCachedInventoryRows`/`getCachedInventoryPayload` 2864/2881). I traced every story whose optimistic write or cache step runs through these helpers — **Add library item** and **Add custom item** (`addInventoryItem` 7983, optimistic row 8019, prime 8072), **Combine duplicate** (`#combineSheet` 2567, `showCombineChoice` at 8076), **Identity first-open** (`loadCharacters` 2921, `populateCharacterSelectors` 2901, `#identitySheet` 2684), and the three **cross-cutting** stories (Collaborative sync interference, Tab-switch in-flight, iOS background/foreground) which all route through the `_inFlightWrites` guard at 2934 and the sync-defer at `pollSync` 4350. Each checked happy-path → failure-at-step → navigate-away → friction with execution-trace + state-machine analysis.

#### BUG · Index.html:8033 · `addInventoryItem` never increments `_inFlightWrites`, so the optimistic add is unprotected from concurrent background sync
The whole optimistic-cache safety net defined in this section — `_inFlightWrites` (declared 2782), the `if (_inFlightWrites > 0) return;` guard inside `cacheInventoryRows` (2934), and the matching `_inFlightWrites > 0` defer in `pollSync` (4350) — exists so a write's local optimistic state survives until the server confirms. **Every other write path participates**: delerium receive (5147), sell (5255), gold receive/pay (5574/5975), give (6636), remove (6931), inventory edit (7429) all do `_inFlightWrites++` and `--` around the round-trip. The single most common operation, **Add library/custom item**, does not. `addInventoryItem` pushes the optimistic row (8033) and caches it (8034), fires `apiAddInventory`, and never touches the flag in either handler (8045 success / 8079 failure).
Consequence (Add story, step c / cross-cutting "Collaborative sync interference"): during the ~1–2 s add round-trip the flag stays 0, so if the 20 s poll fires and sees *another* user's write, the guard at 4350 reads `_inFlightWrites === 0` and proceeds straight to `loadInventory(true)`. That replaces `inventoryRows` (and, via the unguarded `cacheInventoryRows` at 4125, the localStorage cache) with server rows that may not yet contain my just-added item — the optimistic row flickers out mid-add, and if the user backgrounds/closes the webview before `addInventoryItem`'s success handler re-primes (8072), the cache is left without the item the server actually committed. Edits/gives/sells in the same window are immune precisely because they set the flag.
Fix: mirror the sibling pattern — keep the optimistic `cacheInventoryRows` at 8034 (flag still 0 so it persists), then `_inFlightWrites++` immediately after, and `_inFlightWrites--` as the first line of BOTH the success (8046) and failure (8080) handlers, before the re-prime/re-cache calls. (Do not increment *before* 8034 or the guard at 2934 would suppress the optimistic write itself.)

#### RISK · Index.html:4354 · Single `by` sync field drops a peer's write when my write is the most recent one
Traced as part of the "Collaborative sync interference" cross-cutting story (sync state declared in-section at 2819). `pollSync` reloads only when `res.inventory.by !== syncClientId`. The server keeps just one `SYNC_INVENTORY_BY` (last writer). Sequence: peer B writes → server `{ts:T1, by:B}`; before my next poll I add an item → server `{ts:T2, by:me}`; my poll sees `{T2, by:me}`, takes the else branch (4353–4354), sets `syncState.inventory = {T2,me}` and skips `loadInventory` because `by === me`. B's write is now invisible to me until some *third* writer bumps the timestamp again — my own add response (`primeInventoryCacheAfterAdd`) only merges my item, never B's. Window is one poll interval (≤20 s) but on a busy table it silently hides loot. Mitigation: when `by === me` but `ts` advanced past the ts I last *reloaded* (not last *saw*), still reconcile — e.g. track `lastReloadedTs` and force `loadInventory(true)` if the server ts moved beyond my own known bump, or have the server return a monotonic writer set instead of a single name.

#### Note · Index.html:2944 · Optimistic-prime + double-add mitigation trace clean
`primeInventoryCacheAfterAdd` (2944) correctly de-dupes by `Inventory ID` (merges if present, prepends if new) and the add success handler guards it with `if (!cachePrimed) bustInventoryCache()` (8072–8073) so a malformed server row can't poison the cache. Double-tap on "Add to Inventory" is mitigated structurally: `clearAddForm()` runs synchronously (8038) and hides `#addSubmitBtn`, so a second tap has no target before the first round-trip returns — acceptable in lieu of a flag. Identity first-open trace (`loadCharacters` 2921 → `populateCharacterSelectors` 2901, re-showing `#identitySheet` when active) is sound; on `apiGetCharacters` failure it degrades to "Party / shared"-only holder dropdowns rather than breaking the Add flow.

### 2026-06-19 (run 21) — Sections audited: 8

**Stories traced through Index.html 1–1500 (HTML structure / CSS):** This range is entirely the `<style>` block, so I traced every story whose UI component is *defined* here, reading the driving JS as needed: Quick-adjust currency/delerium (`#quickEditSheet` 2448, `setQuickEditorOpen` 7082, `openQuickEditPanel`), Edit inventory item (`#inventorySheet` 2343, `setInventoryEditorOpen` 7225), View/Give/Sell/Remove (`#descriptionSheet` 2413), Combine duplicate (`#combineSheet` 2567, `confirmCombineInventoryItem` 3449), Create/Edit note (`#noteFormSheet` 2529), Identity first-open (`#identitySheet` 2684, `confirmIdentity` 4831 / `applyIdentity` 4728), and the boot/reveal path (`markInventoryReady` 3408, `loadInventory` 4066). Each checked happy-path → failure-at-step → navigate-away → friction with execution-trace + state-machine analysis. Layout-detection logic cross-checked: `isMobileLayout` 3038, `updatePhoneClass` 3002, `@media (min-width:700px)` 1494.

#### BUG · Index.html:1522 · Edit-item & quick-adjust sheets are `display:none` on touch + wide viewports (iPad always; iOS GAS webview per project's own 980px quirk)
The `@media (min-width:700px)` block sets `.mobile-sheet { display:none !important }` (line 1522) then re-enables a hand-curated allowlist (1523–1533) that **omits `#inventorySheet`** (Edit inventory item) **and `#quickEditSheet`** (Quick-adjust). Meanwhile the JS picks the sheet vs. the inline desktop editor via `isMobileLayout()` (3038), which keys off `html.is-phone` = `matchMedia('(pointer: coarse)')` (3003) — a *different* condition from the width media query. On any touch device whose CSS viewport is ≥700px — an iPad always, and per this project's own documented GAS-webview behavior (innerWidth ≈ 980, comment at 3016) an iOS phone too — both conditions are simultaneously true.
- **Quick-adjust currency/delerium** (tap gold/delerium card): `setQuickEditorOpen(true)` takes the mobile branch (7087) and adds `.active` to `#quickEditSheet`, but the media query keeps it `display:none !important` → nothing appears. Worse, `quickSheetAmount.focus()` (7067) can raise the keyboard over a field that isn't visible, and `syncModalOpenState()` sets `body.app-modal-open` (scroll lock) — the page looks frozen with no visible way out.
- **Edit inventory item** (swipe → Edit): `setInventoryEditorOpen(true)` mobile branch (7230) adds `.active` to `#inventorySheet`; same media query hides it → the editor never shows.
Both core flows are dead on the affected devices. The allowlist was clearly curated (11 other sheets are listed), so these two were simply forgotten. Fix: add `#inventorySheet.active { display:block !important; }` and `#quickEditSheet.active { display:block !important; }` to the allowlist; better, make the layout decision single-sourced (gate `.mobile-sheet` visibility on `html.is-phone`, not `(min-width:700px)`, so CSS and `isMobileLayout()` can never disagree).

#### RISK · Index.html:1397 · iOS keyboard covers the pinned action bar on every mobile sheet except campaign notes
`--keyboard-offset` viewport tracking is bound only for `#notesSheet` (`bindCampaignNotesViewport`/`syncCampaignNotesViewport`, 3531–3547) and only `.notes-sheet-actions` consumes it in CSS (1205). The generic `.mobile-sheet-actions` (1397) has no keyboard offset, and the panel is `position:absolute; inset:0` (1248) — sized to the layout viewport, not visualViewport. So focusing a field in **Party Notes create/edit** (`#noteFormSheet`, Save; Title/Note/Tags inputs — this sheet *is* in the allowlist so it renders on touch+wide), and on any device not hit by the BUG above, in **Edit inventory item** (Save Changes; Notes textarea + Category/Rarity/Value/Faction) and **Quick-adjust** (Confirm; Amount + Note), raises the iOS keyboard which sits over the flex-pinned action bar — the user must dismiss the keyboard to reach Save/Confirm. The team already solved this for campaign notes, so the pattern exists but wasn't generalized. Fix: bind visualViewport for any active `.mobile-sheet` and add `var(--keyboard-offset)` to `.mobile-sheet-actions` padding-bottom.

#### Note · Index.html:3408 · Boot reveal & modal-lock are robust — clean trace
`markInventoryReady()` is called on *every* `loadInventory()` branch — cache paint (4080/4091), server app-error (4117), success (4133), and network failure (4139) — so a failed first load still removes `app-booting`/adds `inventory-ready` and shows a retriable error; the UI never stays invisible. Boot calls `loadInventory()` unconditionally via `setCommandMode('inventory')` (8242 → 3257), independent of identity, so the first-time identity flow (`confirmIdentity` 4831 → `applyIdentity` 4728, neither of which reveals the app itself) still ends with a visible app behind the splash. `syncModalOpenState()` (3405) recomputes `body.app-modal-open` from the live DOM on each sheet open/close, so the scroll lock self-heals after a navigate-away or error instead of getting stuck. Stories traced clean: first-open identity, initial inventory load (happy + app-error + failure), combine-duplicate rollback (`confirmCombineInventoryItem` 3449 restores `pendingCombineChoice` on both failure paths).

### 2026-06-19 (run 20) — Sections audited: 7

**Stories traced through Code.js 3501–end:** Quick-adjust currency/delerium (`apiGetCurrencyQuickEdit` 3682, `apiAdjustCurrency` 3723, `apiAdjustInventory` 3733, `apiSetItemQuantity` 3853) traced end-to-end against the client flow in Index.html (`openQuickEditPanel` 7001, `populateQuickSize` 7071, `confirmQuickEdit` 7124, `finishSuccess`/`fail` 7147–7172), plus the sync-poll guard at 4350. Delete inventory tail (`apiDeleteInventory` 3501–3558) and Combine duplicate (`apiCombineInventoryItems` 3560) re-read; both were fully traced in run 19, so only the section-local write paths and the quick-adjust story produced new findings this run. Each new path checked happy-path → failure-at-step → navigate-away → friction with execution-trace + state-machine analysis.

#### BUG · Code.js:3773 · Delerium quick-adjust silently renames the row to the size dropdown's default ("chip")
**Story: Quick-adjust currency/delerium (add/remove mode).** When a delerium-crystal inventory card is quick-edited, the client builds the size `<select>` from `DELERIUM_SIZE_VALUES` (Index.html `populateQuickSize` 7071) but never pre-selects the row's actual size, so the browser defaults the selection to the **first** option, `'chip'` (Code.js:43). For delerium the size field is `.active`, so `confirmQuickEdit` (Index.html:7134) reads `size = 'chip'` and passes it to `apiAdjustInventory`. The server then unconditionally does `rowObj['Item'] = 'Delerium Chip'` (3773) and rewrites the row. Net effect: adding 2 crystals to a **"Delerium Geode"** row renames it to **"Delerium Chip"** and merges its quantity into the wrong size, corrupting stock. It compounds downstream: the ledger `subtype` is derived from the *renamed* item (`normalizeDeleriumSize_(rowObj['Item'])`, 3791/3895) so the RESOURCE_LEDGER also records the wrong size, and if a note is present `rowObj['Notes']` is overwritten with `Size: chip` (3774). Note the asymmetry that confirms this is unintended: `set` mode routes to `apiSetItemQuantity`, which never sends `size` and never renames — only `add`/`remove` corrupt. Fix: either pre-select the dropdown to the row's current size in `populateQuickSize`, or (better) drop the size field from quick-adjust of an existing delerium row entirely — the row already has a fixed size; quantity adjustment should not be allowed to re-classify it. If a "convert size" feature is genuinely wanted it should be an explicit, separate action.

#### BUG · Index.html:7145 · `confirmQuickEdit` skips `_inFlightWrites` accounting — sync poll can wipe the optimistic update and duplicate the ledger line
**Story: Quick-adjust currency/delerium.** The cross-cutting sync deferral (Index.html:4350) only postpones a foreign-write `loadInventory(true)` while `_inFlightWrites > 0`. `confirmQuickEdit` gates re-entry with its own `quickEditInFlight` flag (7145) but never bumps `_inFlightWrites`, so a quick-adjust round-trip is invisible to the guard — exactly the same defect class flagged in run 19 for the gold/pay/split/ledger-note handlers, but in a different handler covering a different story. Failure modes if the 20 s poll fires during the round-trip and sees another player's write: (1) `loadInventory(true)` overwrites `inventoryRows` and `inventoryResourceLedger` wholesale (4123–4124), racing the success handler; (2) if `apiAdjustInventory`/`apiSetItemQuantity` has already committed server-side, the reloaded ledger already contains the new row, and `finishSuccess` then unconditionally prepends `res.ledgerEntry` again (7159) → **duplicate gold/delerium ledger line** until the next full reload. Fix: wrap the `google.script.run` calls in `_inFlightWrites++` / `--` on both success and failure paths, matching the delerium handlers (5147/5255).

#### RISK · Index.html:7126 · `quickEditInFlight` never resets on a lost callback — quick-adjust becomes permanently dead until reload
**Story: Quick-adjust currency/delerium; cross-cutting iOS background/foreground.** `quickEditInFlight` is set `true` at 7145 and cleared **only** inside the success (7148) and failure (7170) handlers of the in-flight call. If those callbacks never fire — iOS GAS webview suspending JS mid-round-trip, or the user navigating/closing such that `google.script.run` is torn down — the flag stays `true`. Neither `openQuickEditPanel` nor `closeQuickEditPanel` resets it, so every subsequent `confirmQuickEdit` early-returns at 7126 and the Confirm button silently does nothing for the rest of the session. Unlike `_inFlightWrites` (whose only consequence is deferral), this fully disables the feature. Fix: reset `quickEditInFlight = false` in `openQuickEditPanel`/`closeQuickEditPanel`, and/or restore it on `visibilitychange` foreground alongside the existing sync re-check.

#### Note · Code.js:3723 · `apiAdjustCurrency` guard and currency-zero handling trace clean
**Story: Quick-adjust currency (add/remove/set).** `apiAdjustCurrency` (3723) correctly re-validates `editType === 'currency'` before delegating, and `validateQuantity_` default `min: 0` (1626) means setting/removing currency down to exactly 0 succeeds while over-removal (negative result) throws a clean bounded error surfaced via the status line. `apiSetItemQuantity` and the currency branch of `apiAdjustInventory` emit a correctly-signed ledger delta and return a sanitized `ledgerEntry`; the currency path (no size field active) is unaffected by the delerium rename bug above. Lock is acquired after auth and released in `finally` on every path. Delete tail (`apiDeleteInventory` 3501–3558) and `apiCombineInventoryItems` (3560) re-confirmed consistent with their run-19 traces.

### 2026-06-19 (run 19) — Sections audited: 6

**Stories traced through Code.js 2901–3500:** Edit ledger note gold/delerium (`apiUpdateLedgerNote` 2905), Receive gold "Got Paid" (`apiReceiveResource` 2955), Receive crystals (`apiReceiveResource` delerium branch), Sell item single (`apiSellInventoryItem` 3040), Sell crystals (`apiSellDelerium` 3096), Split gold evenly (`apiSplitGold` 3181), Pay gold → character (`apiSendGoldToMember` 3319), Edit inventory item (`apiUpdateInventory` 3403), Delete inventory item (`apiDeleteInventory` 3491), Combine duplicate (`apiCombineInventoryItems` 3560). Each traced happy-path → failure-at-step → navigate-away → friction, reading the client handlers in Index.html (5140–5300 delerium receive/sell, 5391–5449 received gold, 6021–6141 pay/split, 6311–6346 ledger-note edit, 3449–3478 combine, 4066–4142 loadInventory, 4345–4364 sync poll, 2933–2957 cache/prime helpers).

#### BUG · Code.js:2935 · `apiUpdateLedgerNote` matches by timestamp+resource only — edits the wrong row for any multi-entry transaction
**Story: Edit ledger note (gold and delerium).** The match loop (2936–2942) stops at the **first** sheet row whose `Timestamp` (second-resolution, 19-char) and `Resource` match. But several transactions write multiple ledger rows in the same second with the same resource: `apiSplitGold` emits SPLIT_DEDUCT + one SPLIT per member + SPLIT_REMAINDER (all `gold`, all sharing the single `nowStr` from 3218); `apiReceiveResource`/`apiSellDelerium` emit one row per crystal size (all `delerium`, all same `nowStr`). When the user taps the "Gold (Alice)" split line and edits its note, the server rewrites the note on whichever same-second `gold` row appears **first in the sheet** (the pool-deduct row), not the tapped one. The client mirror at Index.html:6333 has the identical defect — `find(e => e['Timestamp'] === timestamp)` returns the first array match, so client and server agree only by coincidence and both target the wrong entry. Result: the note edit silently lands on a different ledger line; the line the user actually tapped is unchanged. Fix: each ledger row already carries a unique `Inventory ID` (written by `appendResourceLedger_` and surfaced via `sanitizeResourceLedgerForClient_`); pass and match on that instead of timestamp+resource.

#### BUG · Index.html:6089 · Gold receive/pay/split/ledger-note handlers skip `_inFlightWrites` accounting — defeats the sync-poll deferral guard and can duplicate ledger lines
**Stories: Receive gold, Pay gold, Split gold evenly, Edit ledger note.** The cross-cutting "collaborative sync interference" guard at Index.html:4350 only defers a foreign-write `loadInventory(true)` while `_inFlightWrites > 0`. The delerium handlers (`sellDelerium` 5255, `receiveDelerium` 5147) and the sell-batch/add handlers bump that counter, but `receivedGold` (5391), `confirmPayWithReason` (6021), `splitGold` (6089), and `updateLedgerNoteFromBottom` (6311) **never do**. So if the 20 s poll fires during one of these round-trips and sees another player's write, it proceeds straight to `loadInventory(true)`, which overwrites `inventoryRows` **and** `inventoryResourceLedger` wholesale (4123–4124). Two failure modes:
1. The optimistic pending entry (e.g. the SPLIT_DEDUCT prepended at 6109) is wiped mid-flight → it flickers out then back.
2. If `apiGetInventory` resolves **after** the gold/split write has committed server-side, the fresh ledger already contains the committed rows; the success handler then unconditionally re-prepends `res.ledgerEntries` (6063, 6127, 5432) → **duplicate ledger lines** (each split/pay line shown twice) until the next full reload. `primeInventoryCacheAfterAdd` dedups inventory rows by ID (2949) so the row list survives, but the ledger array has no such guard.
Fix: wrap each of these four handlers in `_inFlightWrites++` / `--` (in both success and failure paths) exactly as the delerium handlers do, so the deferral and the `cacheInventoryRows` guard apply uniformly.

#### RISK · Code.js:3636 · `apiCombineInventoryItems` writes the merged target then deletes the source non-atomically
**Story: Combine duplicate.** `writeInventoryRow_(... merged)` (3636) commits the combined quantity onto the target, then `sheet.deleteRow(source.rowNumber)` (3637) removes the source. There is no transaction: if `deleteRow` throws (transient Sheets error, row-shift race with a concurrent delete), the target keeps the **summed** quantity while the source row still exists → the combined items are double-counted. The `catch` returns `{ok:false}` and the client (Index.html:3457) restores `pendingCombineChoice` for retry, but a retry re-reads both rows and sums again → triple. Lower-probability than the gold paths but same non-atomic class as the run-18 ledger findings. Fix: delete source first, then write target (a failed delete leaves the original two rows intact and is safely retryable), or capture and re-add on failure.

#### RISK · Code.js:3062 · `apiSellInventoryItem` deletes the item before appending gold/ledger — a later throw reports failure on an already-applied sale
**Story: Sell item (legacy single-row path).** Order is: `deleteRow(found.rowNumber)` (3062) → `auditWrite_` → append Gold row (3079) → `appendResourceLedger_` (3080). If the gold append or ledger append throws, the item is already gone but the client receives `{ok:false, goldItem:null}` and shows "failed". The user retries → `getInventoryRowObjectById_` now returns nothing → "Item not found", leaving them unsure whether the gold was credited (it may have been). Fix: append the gold/ledger rows first and delete the source last, so a mid-flight failure leaves the sale fully un-applied and retryable.

#### Note · Code.js:3403 · `apiUpdateInventory` / `apiDeleteInventory` lock + audit discipline is clean; combine client is idempotent under sync interference
**Stories: Edit inventory item, Delete inventory item, Combine duplicate.** Both update/delete acquire the document lock, validate the ID, write/delete, `bumpSync_`, and release the lock in `finally` on every path including the auth-failure and validation-error branches; each writes an audit row on both SUCCESS and FAILED. `confirmCombineInventoryItem` (Index.html:3449) is non-optimistic (shows "Combining…", mutates only on success) and its success mutation — filter out source, merge `res.item` into target — is idempotent, so a `loadInventory(true)` racing in mid-combine leaves a consistent list. No new bug in these three client/server traces beyond the RISK noted above.

### 2026-06-18 (run 18) — Sections audited: 5

**Stories traced through Code.js 2301–2900:** Add library item (`apiAddInventory` 2424), Add custom item (`apiAddCustomInventory` 2533), Quick-adjust currency/delerium (`apiQuickAddInventory` 2632), Pay gold / Pay delerium (`apiDepleteResource` 2773), Create/Edit/Pin/Archive note (`apiCreateNote` 2330, `apiUpdateNote` 2371, `apiArchiveNote` 2402). Each traced happy-path → failure-at-step → navigate-away → friction, reading the client handlers in Index.html (8000–8124 add flow, 6021–6141 gold pay/split, 6558–6623 dashboard pay, 4585–4693 notes write handlers, 4345–4364 sync poll).

#### RISK · Code.js:2847 · `apiDepleteResource` / `apiQuickAddInventory` write inventory row then ledger non-atomically — failed ledger append orphans the row and a retry double-counts
**Stories: Pay gold, Pay/Sell delerium, Quick-adjust currency/delerium.** Both functions do `sheet.appendRow(...)` for the inventory deduction/addition row FIRST (2847 deplete; 2699 quick-add), then `appendResourceLedger_(ledgerEntry)` (2848 deplete; 2715 quick-add). There is no transaction and no rollback: if `appendResourceLedger_` throws (transient Sheets API error, quota, schema mismatch), the `catch` returns `{ ok:false }` to the client **but the inventory row has already been committed**. For Pay gold this means the party-pool gold was deducted (negative-qty `Currency` row written) while the client shows "Pay failed" — the user re-pays → **double deduction**, with only one of the two reflected in the ledger. For quick-add currency/delerium the same yields a duplicate inventory addition. The window is small but the consequence is silent resource corruption that the ledger (the audit-of-record) won't even show consistently. Suggested fix: append the ledger row first (or capture the inventory row index and delete it in the catch before returning the error), so the client-visible failure matches the persisted state. Note `apiAddInventory`/`apiAddCustomInventory` are not exposed to this because they write only the single inventory row.

#### RISK · Index.html:4357 · Notes sync poll has no in-flight guard — a concurrent reload during a note write can silently drop the just-created note
**Story: Create note + cross-cutting "Collaborative sync interference".** The inventory branch of `pollSync` (4350) defers `loadInventory(true)` while `_inFlightWrites > 0`, but the notes branch (4357-4360) has **no equivalent guard** and no write path bumps a notes-side counter. Sequence: user taps Save → optimistic temp note pushed to `notesData` (4623) keyed `NOTE_TEMP_*`; `apiCreateNote` round-trip in flight. The 20 s poll fires and sees another player's note write (`res.notes.by !== syncClientId`), so it calls `loadNotes(true)`, which replaces `notesData` wholesale with server data — the temp is gone. When the create's success handler returns it does `tidx = notesData.findIndex(x => x.noteId === tempId)` (4630) → `-1`, and the add is gated `if (tidx >= 0) notesData[tidx] = res.note` (4632), so **the real note is never inserted**. If the server-side `loadNotes` read happened before this create persisted, the user's brand-new note is invisible until the next sync event or the 2-min TTL reload. The edit/pin/archive handlers have the same fragility: their failure-rollbacks reference a captured `idx`/object (4607 `notesData[idx]=backup`, 4682 `n.pinned=...`) that may point at a stale slot or an orphaned object after a mid-flight `loadNotes(true)`, so a rollback can edit the wrong row or no-op. Suggested fix: make create-success additive when `tidx < 0` (push `res.note`, dedup by `noteId`), and/or add a notes in-flight guard mirroring 4350.

#### RISK · Index.html:8044 · Add-item write path omits the `_inFlightWrites` guard that every other optimistic inventory write uses
**Stories: Add library item, Add custom item, Quick-adjust currency/delerium + cross-cutting "Collaborative sync interference".** The give (5975), edit (5574/5147/5255), undo-pay (6636), and other optimistic writes all bracket their round-trip with `_inFlightWrites++/--` so `pollSync` (4350) defers a competing `loadInventory(true)` until the local write resolves. The add-item dispatcher (`runner` at 8044, calling `apiAddInventory`/`apiAddCustomInventory`/`apiQuickAddInventory`) **never increments `_inFlightWrites`**. So if the 20 s poll detects another player's write during the add round-trip, the guard sees `0` and runs `loadInventory(true)` immediately, replacing `inventoryRows` with server data. If that reload's sheet read lands before the add persists, the optimistic row (`optId`) is wiped and the freshly added item momentarily vanishes from the list (it reconverges only when the add's success handler re-adds via `primeInventoryCacheAfterAdd`, or on the next reload). Lower severity than the notes case because the success handler is additive (`primeInventoryCacheAfterAdd(res.item)` 8072) rather than index-keyed, so it self-heals — but it still produces a visible flicker/disappearance during multi-user sessions and is inconsistent with sibling write paths. Suggested fix: wrap the add dispatch in `_inFlightWrites++` / `--` in both handlers.

#### IDEA · Index.html:6044 · Pay clears the amount/note inputs optimistically and never restores them on failure
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
