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

#### IDEA · Index.html:2915 · Debug `console.log`/`console.warn` still in `loadCharacters`
`loadCharacters` logs `[loadCharacters] API response:`, the populated
`characterOptions`, and warn/error lines on every identity resolve (lines 2915,
2917, 2922, 2926). This is one of the README's own Known TODOs ("Remove debug
`console.log` lines in `loadCharacters`"). `characterOptions` includes player
names — minor PII leaking into the webview console. Recommend removing the three
success-path logs; keep the failure-path `console.error` if desired.

#### IDEA · Index.html:3000 · Phone detection still ORs `(max-width: 699px)` with `(pointer: coarse)`
`updatePhoneClass()` uses `window.matchMedia('(max-width: 699px), (pointer: coarse)')`.
The project's own CSS note (README + harness pitfalls) states phone detection
should use `(pointer: coarse)` **not** `(max-width: 699px)`, because the GAS
webview reports `innerWidth ≈ 980` and the width query never fires there anyway.
The width arm is harmless on-device (never matches in the webview) but does flip
a narrow desktop browser window into phone layout, contradicting the documented
single-signal design. Low risk; flag for consistency with the stated approach.

#### Note · Index.html:2924 · `getElementById('identitySheet')` deref is safe here
`loadCharacters`' success handler reads
`document.getElementById('identitySheet').classList` with no null guard, but
`#identitySheet` is a static element in the DOM (line 2677), so it always
resolves. Recording as checked — not the missing-null-check class of bug
called out in the harness pitfalls.

#### RISK · Index.html:3077 · Inventory tap-to-open is wired on BOTH `pointerup` and `touchend`
`initInventoryGestures` registers a tap-detector in the `pointerup` handler
(3077–3094) **and** in the `touchend` handler (3162–3166); both call
`openInventoryPrimaryActionById(getRepId(row))`. They share a single
`tapHandled` closure flag to dedupe, and `pointerup` early-returns when
`tapHandled` is already set. This relies on `touchend` firing (and setting the
flag) *before* the compatibility `pointerup` on the GAS/iOS webview. That order
is not guaranteed across engines — if `pointerdown` (which resets
`tapHandled=false` at 3074) is delivered after `touchend`, the dedupe is
defeated and the item sheet opens twice. Recommend driving tap from a single
event source (touch on phones, pointer/click on desktop) or guarding the open
with a short timestamp debounce like the existing `suppressInventoryClickUntil`.

#### IDEA · Index.html:3638 · Dead `ondblclick` on campaign-note cards (unreachable on touch)
`renderCampaignNotes` emits `ondblclick="…startEditCampaignNote(…)"` on each
`.notes-note-card`. Double-tap/dblclick does not fire on the phone webview this
app targets, mirroring the README's "Remove dead `ondblclick` on inventory
cards" TODO. Edit is already reachable via the Edit button and right-swipe, so
the handler is dead weight. Cleanup candidate.

#### Note · Index.html:3723 · v1 campaign-note swipe-delete fires with no confirmation
`bindCampaignNoteGestures` calls `deleteCampaignNote(row.dataset.noteId)` the
instant a left-swipe passes `NOTE_ACTION_ACTIVATE` (380px), with no inline
confirm step. This matches the existing README TODO ("Swipe-delete has no undo
— consider inline confirmation"). Not a new finding; recording that the v1
notes list shares the same no-undo gesture as inventory.

#### IDEA · Index.html:3036 · `isMobileLayout()` repeats the `window.innerWidth < 700` signal
`isMobileLayout()` returns `is-phone || window.innerWidth < 700`. In the GAS
webview `innerWidth ≈ 980`, so the `is-phone` class (driven by `pointer:coarse`)
is the real signal and the width arm is inert on-device — same documented
single-signal concern noted for `updatePhoneClass`. Consistent-but-redundant;
flag for tidy-up alongside the section-9 phone-detection note.

#### BUG · Index.html:5460 · `openGiveItemSheet` double-escapes the item name into `textContent`
The Give-To sheet title is built with
`title.textContent = \`Give …"${escapeHtml(item['Item'] || 'Item')}" To…\`;`.
Because the value is assigned via `textContent` (not `innerHTML`), running it
through `escapeHtml` first double-encodes it: an item named `Assassin's Blade`
renders literally as `Assassin&#39;s Blade`, and `Sword & Shield` shows as
`Sword &amp; Shield`. The parallel `openSellItemSheet` (line 5490) correctly
assigns `item['Item']` to `textContent` with no `escapeHtml`. Fix: drop the
`escapeHtml(...)` wrapper here and let `textContent` do the escaping. Affects
any party item whose name contains `& ' " < >` — apostrophes are common.

#### IDEA · Index.html:4747 · Debug `console.log`/`console.warn` in the identity flow
`loadFallbackCharacterIdentity` (4747, 4752), `showIdentitySheet` (4788), and
`confirmIdentity` (4807) log `[identity] …` lines on every boot, including the
resolved character name and the raw profile response object. Same class as the
README's `loadCharacters` logging TODO — minor PII (character/player names) in
the webview console. Recommend stripping the success-path logs before
production; keep the failure-path warn if useful.

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

#### RISK · Index.html:6301 · Ledger-note edit is keyed only on `Timestamp`
`updateLedgerNoteFromBottom` locates the in-memory entry with
`inventoryResourceLedger.find(e => e['Timestamp'] === timestamp)` and the server
call `apiUpdateLedgerNote({ timestamp, resource, notes })` keys the sheet write
the same way. Several write paths in section 11 emit *multiple* ledger rows with
the same ISO timestamp in a single operation (e.g. `sellDelerium`/`apiSellDelerium`
push one entry per crystal size plus a gold row, and `splitGold` emits a deduct +
per-member rows). When a treasurer taps one of those rows to edit its note, both
the local `find` (first match only) and the server's timestamp match can hit the
wrong row — or every row sharing that millisecond. Recommend keying ledger edits
on a stable per-row id (the RESOURCE_LEDGER row number or a generated entry id)
rather than the timestamp. Worth confirming the server-side matcher's behavior in
section 5/`apiUpdateLedgerNote` against same-timestamp siblings.

#### IDEA · Index.html:6434 · `isAccessoryItem_` requires BOTH a wondrous/accessory category AND a name keyword
Accessory grouping only fires when `category` contains `wondrous`/`accessor`
*and* the name matches the ring/amulet/cloak/etc. word list. A magic accessory
whose Category is something else (e.g. a custom-added "Ring of X" typed with
category `Magic Item` or `Ring`, or a library item categorized `Rod`/`Ring`)
falls through to **Bonus Junk** instead of **Accessories**. Given custom items
let the user type a free-form category, this likely misfiles some accessories.
Consider making the name-keyword match sufficient on its own, or broadening the
category test. Low severity (cosmetic grouping only).

#### IDEA · Index.html:6397 · Minor dead code in section 12
`isDashboardResourceRow_` declares `const category = …` (6399) but only uses
`name`. `payResource` writes `amountInput.dataset.lastPaidAmount` (6546) which is
never read back anywhere. Both are harmless leftovers — cleanup candidates.

#### Note · Index.html:6315 · Gold/currency classification correctly excludes non-gold (positive baseline)
`isGoldItem_` first rejects `\b(platinum|pp|silver|sp|copper|cp)\b` and only then
matches `\b(gold|gp)\b`, and `isDashboardResourceRow_` only pulls gold + delerium
out of the inventory groups — so "silver holy symbol" et al. stay visible and
land in Treasure/Bonus Junk rather than being miscounted as gold or filtered out.
This is the corrected behavior for the over-broad-currency-regex pitfall; no
issue in this section.
