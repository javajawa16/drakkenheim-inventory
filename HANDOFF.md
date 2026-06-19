# Handoff — 2026-06-19 (updated)

## Project

**Drakkenheim Party Inventory Web App** — Google Apps Script web app backed by the "Wieners of Drakkenheim" spreadsheet (`1DRs3BhuiAdojDBonns42b8FRPEBLNdjH2z8AUfW5U0o`). Source in `src/`, deployed via `clasp`, currently at version `@311`.

---

## Session Summary (2026-06-05)

### LocalStorage identity picker (from prior session, @167–@168)
- `Session.getActiveUser().getEmail()` is confirmed broken for non-deployer users with `USER_DEPLOYING` on personal Gmail — verified by debug logging (`dev-unconfigured-user` returned for all non-deployer users).
- Solution: `apiGetMyCharacter(clientCharacterHint)` accepts a character name from the client and reverse-looks up the email via `getEmailForCharacter_()`.
- On first open: full-screen `mobile-sheet` overlay shows all active characters as large tappable cards. Tap one → stored in `localStorage('drakkenheim_character')` → identity resolves on every subsequent load instantly.
- `requireTreasurer_(clientCharacterHint)` and `apiSellDelerium`/`apiSplitGold` payloads updated to pass `clientCharacter` so treasurer-gated operations work for non-deployer users including DM.

### Add form description fix (@159)
- `fillAddFormFromEquipment(item, includeDescription)` had `includeDescription` parameter but never used it — notes field always cleared. Fixed. Cache-hit path in `loadSelectedDescription` also fixed to inject cached description into `selectedEquipment` before calling fill.

### Filtered inventory notes inline (@160–@162)
- Gold and delerium rows in filtered view now show their Notes field as a single truncated line directly below the item name. Meta line suppressed when notes present (two-line card).

### Equipment library — 20-column schema (@169–@182)
- `EQUIPMENT_HEADERS` expanded from 14 → 20 columns adding: Damage, Damage Versatile, Properties, Range, AC, Strength Req, Stealth Disadvantage. Value Raw dropped (Value GP used directly).
- All row mappers, column reads, and sanitize functions updated consistently.
- `continueCleanEquipmentLibrary` updated to write empty strings for new columns (old pipeline still works).
- `descriptionCache` → `itemCache`: stores full sanitized item object (not just description string) so the detail sheet can access all fields without a second fetch.
- Description sheet now renders a **stat block** above the description text: italic type subtitle, bold `Label: Value` rows for Damage, Property, Range, AC, Weight, Cost, Attunement — matching D&D compendium format.
- `parse_compendium.js` (Node.js) parses `Complete_Compendium_5.5e.xml` → `equipment_library_5e.xlsx`. Output column order exactly matches `EQUIPMENT_HEADERS` for direct import. 5,836 items, `[5.5e]` suffix stripped, rarity/attunement split from `<detail>`, Search Text generated.

### Get Paid / Received buttons (@183–@189)
- **Gold sheet**: `[Get Paid]` (green, `button.success`) and `[Pay]` (red) side by side via inline flex (bypasses `html.is-phone .quick-actions` single-column override). `[Split]` and `[Done]` each full-width below.
  - `receivedGold()`: reads same Amount + Note inputs, calls `apiReceiveResource({ resource: 'gold', ... })`, adds RECEIVE ledger entry.
- **Delerium sheet**: Single unified counter per size — bidirectional. Counter starts at current stock; decrement = sell (red `-X for sale` label), increment above stock = receive (green `+X receiving` label).
  - `[Received]` (green) and `[Sell]` (red/danger) side by side via inline flex.
  - `updateDeleriumButtonStates()`: Sell activates only when purely negative; Received activates only when purely positive; mixed state disables both buttons (`disabled` attribute + 35% opacity).
  - Entry guards in `sellDelerium()` and `receiveDelerium()` silent-reject if mixed state somehow bypasses disabled buttons.
  - `receiveDelerium()` reads positive delta from `deleriumSellQtys` (above original).
  - `adjustDeleriumReceive` and separate receive section removed — unified into `adjustDeleriumSell` with no upper bound.
- **`apiReceiveResource`** (new server function): mirror of `apiDepleteResource` + `apiSellDelerium` for positive qty. Handles both gold (`{ resource, amount, note, holder }`) and delerium (`{ resource, items, note }`). Writes RECEIVE ledger entries.
- **`LEDGER_VISIBLE_ACTIONS`** updated to include `'RECEIVE'` — fixes Get Paid entries disappearing from gold ledger after confirmation.
- `button.success` CSS class added: `#14532d` background, `#86efac` text, green border.

### Inventory tab switch fix (@190)
- **Root cause 1**: `loadInventory` checked `getCachedInventoryPayload()` (5-minute localStorage TTL) before checking in-memory `inventoryRows`. After 5 minutes away from inventory tab, cache expired → "Loading…" + list cleared even though `inventoryRows` was fully populated in memory.
- **Root cause 2**: Background server fetch always called `renderInventory()` on completion, causing scroll-reset and list flash even when data hadn't changed.
- **Fix**: Check `inventoryRows.length` first — if populated, render immediately from memory. Fall back to localStorage only on cold start. Background fetch computes `inventorySignature_()` (row count + first 8 IDs) before and after; only re-renders if signature changed.

---

## Current Deploy State

| Version | What it contains |
|---|---|
| `@153` | Base features |
| `@154–@158` | Performance, DM permissions, filter clear, silent refresh |
| `@159` | Fix: description not loading in add form |
| `@160–@162` | Filtered inventory notes inline for gold/delerium |
| `@163–@168` | Identity: localStorage character picker, full-screen overlay |
| `@169–@182` | Equipment library 20-col schema, stat block detail view, Excel parser |
| `@183–@186` | Get Paid/Pay gold buttons, button layout phone fix |
| `@187–@188` | Unified delerium counter, mixed-state guard |
| `@189` | Fix: RECEIVE in LEDGER_VISIBLE_ACTIONS |
| `@190` | Fix: inventory tab switch — in-memory first, smart re-render |
| `@191–@199` | Equipment search fix, add form library preview, currency/delerium removed from quick-add |
| `@200–@201` | Fix: server-side QUICK_ADD_ITEMS also had old currency items; deploy script now pushes first |
| `@202` | Add form: unified scrollable container for stat block + description |
| `@203–@213` | Dice calculator — overlay popup, 7-row segmented grid, smart die count increment, display scaling fix |
| `@214–@215` | Gold sheet button labels: "Got Paid", "Split Evenly"; inventory group rename: Murder Tools, Bonus Junk |
| `@216–@217` | Inventory groups: Murder Tools (weapons), Pain Meds→Armor (reverted), Bonus Junk (misc) |
| `@218` | Delerium title → Purple Rocks; Weiners header on both Inventory and Add Item tabs |
| `@219–@220` | Gold sheet: static scope slider outside scroll area; Amount+Note in one row (33/66); no horizontal drag on sheets |
| `@221` | Ledger note editing: tap row to edit note, `apiUpdateLedgerNote` writes to RESOURCE_LEDGER — **live** |
| `@222–@240` | Bottom-field UX for note editing; delerium sheet same consolidation; Gold/Note inline 33/66; "= XX crystals" in Purple Rocks header; static counter section; Total label removed; ledger 8 rows; counter fonts +2px (with `!important` — see @242 for why this was the wrong approach) |
| `@241` | Delerium counter fonts bumped to 24px `!important`, ledger reduced to 6 rows |
| `@242` | Fix: counter fonts now use `var(--phone-font-heading/body)` DPR-scaled vars instead of hardcoded px |
| `@243` | Gold ledger: show up to 20 rows (later overridden by @245) |
| `@244` | Fix: delerium totals row variance label alignment — placeholder `<span>` → `<button>` for correct counter-div width |
| `@245` | Both ledgers show full 60-entry in-memory buffer |
| `@246` | Header: phone `padding-top` 8px → 0px, title `margin-bottom` 8px → 4px — header+filter closer to top |
| `@247` | Party Notes: 3rd nav tab, NOTES sheet (11-col schema), full CRUD API, category/tag/pin/archive UI |
| `@248–@249` | Notes: fix +Add Note sheet visibility on GAS webview; treasurer-only gate; remove inventory shortcut |
| `@250–@253` | Notes: optimistic saves, client-side filtering, toolbar in header, card compression, normal-flow section |
| `@254` | Notes: pre-beta review — sort fix, pending state, archive rollback, form close on tab switch, stale TTL |
| `@255` | Dice: backspace icon enlarged (52px desktop / 72px phone) |
| `@256` | Notes: background preload after identity resolves as treasurer |
| `@257–@259` | Collab sync: 20s poll, per-section timestamps, writers skip own reload, character name as client ID |
| `@260–@288` | (version range pruned — intermediate UI work prior to @289) |
| `@289` | Fix: currency classification — citrine/platinum/etc go to inventory, only gold/gp counts as gold |
| `@290` | Fix: add-nav single tap; remove scroll-jitter on item select |
| `@291–@292` | Sell batch: +/- steppers, name+holder rollup, FIFO drain, partial qty server support |
| `@293` | Value GP right-aligned on inventory cards and sell batch rows |
| `@295` | Sell batch: Copy button replaces Cancel in header — copies party pool as formatted text |
| `@296` | Notes form: Cancel + Archive Note buttons; optimistic archive with rollback |
| `@297–@299` | Description sheet: remove qty stepper (replaces Delete), Sell for Gold + Give to… compact row, total-qty max fix |
| `@300` | Scroll quick-add (no level variants); hardening pass (title qty, sell qty label, delete guard, archive label, swipe auto-close) |
| `@301–@303` | Sell batch: copy suppresses scroll gp prices; PHB Value live total between Select All/Clear; description sheet: shared qty stepper on top, three equal-width buttons below (Sell for Gold, Give to…, Remove); stepper height restored |
| `@304–@305` | Sell for Gold (description sheet) rewritten: uses `descRemoveQty` + FIFO drain via `apiSellInventoryBatch`; `apiSellInventoryBatch` returns `goldItem` for smooth optimistic gold insert; gold ledger shows sold item name instead of "Received"; `loadInventory(true)` in `confirmSellItem` success handler so ledger refreshes after description-sheet sells |
| `@306` | Custom/homebrew item flow fix: `#item` field pre-filled with "Custom Item" (auto-selected) so blank-name submit is impossible; `handleCustomItemNameInput` now updates card header live as user types |

---

## Session Summary (2026-06-06)

### Fix: server QUICK_ADD_ITEMS still had currency (@200–@201)
- `loadQuickAddItems()` in Index.html calls `apiGetQuickAddItems()` on server load and overwrites the client array. The server-side `const QUICK_ADD_ITEMS` in Code.js still had all currency (gold/platinum/silver/copper/electrum) and all delerium sizes.
- Fixed by trimming server `QUICK_ADD_ITEMS` to match client: health_potion, greater_health_potion, gemstone, art_object, trade_goods, rations.
- Root cause of prior @199 "fix" not working: `clasp-deploy-webapp.ps1` only ran `clasp deploy`, never `clasp push`. Updated script to always push first.

### Add form: unified scroll container (@202)
- `#addStatBlock` and `#addDescText` were separate — stat block was static, description scrolled independently. Moved scroll to `.add-library-preview` container (`max-height: 380px`, `overflow-y: auto`), both scroll together. Phone override: `55vh`.

### Dice calculator (@203–@213)
- **Entry point**: d20 icon button in the header search bar row (`1fr auto` grid), matching app's dark card style. Width ~120px desktop, ~130px phone.
- **Overlay**: `position: fixed; top:0; left:0; right:0; bottom:0` backdrop + `position: absolute; left:0; right:0; bottom:0` sheet (`88-92dvh` tall). Tap backdrop to close.
- **Layout** — 7-row × 4-col segmented grid:
  - `grid-template-rows: repeat(7, 1fr)` with `gap: 1px` and keypad `background` color showing as thin separators
  - Individual buttons: `border-radius: 0; border: none` — no bubbles
  - Right column: del (red), ÷, ×, −, +, Roll×2 (purple gradient, `grid-row: 6/8`)
  - Dice rows: d2→d100 in ascending order (d2, d4, d6 | d8, d10, d12 | d20, d100, CLR)
  - CLR: `.dk.clr` gray-blue, clearly different from dice (italic purple) and operators (opaque purple)
- **Smart die tap**: pressing same die increments count (`1d8`→`2d8`→`3d8`); pressing different die appends `+1dX`; pressing die after a plain number uses it as count (`5` + d6 → `5d6`).
- **Display** — two permanent rows (no layout jump on roll):
  - Row 1: formula (`dice-expr`, dim text, `line-height: 1.3`, no fixed px heights)
  - Row 2: inline flex — breakdown text + large result number baseline-aligned
  - Phone: uses `var(--phone-font-body)` so it scales with DPR system correctly
- **Operators**: ÷ and × stored as Unicode display chars, converted to `/` and `*` before `Function()` eval. `dkClear()` resets expression + result to 0.
- **Deploy script fix**: `clasp-deploy-webapp.ps1` now runs `clasp push` before `clasp deploy` so deployed code always matches local source.

### Version limit hit and resolved
- Apps Script hit 200-version limit during deploy. User manually deleted old versions via `script.google.com`. `projects.versions.delete` API endpoint does not exist — UI-only. Will need periodic manual pruning.

---

## Session Summary (2026-06-06, continued)

### Inventory group labels (@214–@217)
- `buildInventoryGroups` label strings renamed: Weapons → **Murder Tools**, Misc → **Bonus Junk**. Armor briefly renamed to "Pain Meds" then reverted to **Armor** at user request.

### UI standardisation (@218)
- Delerium sheet title changed from "Delerium" to **Purple Rocks** (HTML static string in `#deleriumSheet .mobile-sheet-title`).
- `app-header-title` CSS changed from `display: none` (shown only under `.inventory-mode`) to `display: block` always — title "Weiners of Drakkenheim" now appears on both Inventory and Add Item tabs.

### Gold sheet layout (@219–@220)
- Scope toggle (Party Pool / character) extracted from `#goldSheetBody` into a new static `#goldScopeStatic` div between the header and the body. CSS `.gold-scope-static { flex-shrink: 0; padding: 10px 14px; border-bottom: 1px solid …; background: … }`. Previous sticky approach caused "dragging" feel — true static separation fixes it.
- Amount + Note inputs moved from two stacked fields to a `grid-template-columns: 1fr 2fr` single row (33% / 66%).
- `overflow-x: hidden` added to `.mobile-sheet-panel`; `overflow-x: hidden; overscroll-behavior: contain` added to `.mobile-sheet-body` to eliminate horizontal drag on all sheets.

### Ledger note editing (@221)
- **`apiUpdateLedgerNote(payload)`** (Code.js): finds row in RESOURCE_LEDGER by normalised Timestamp (first 19 chars, space→T), updates Notes column. Safe for gold and delerium ledgers.
- **`renderResourceLedger`** updated: each non-pending row now has `data-timestamp`, `data-resource`, `data-note` attributes and a hidden `.ledger-note-edit` form (input + Save button). `onclick` calls `toggleLedgerEdit(this)`.
- **`toggleLedgerEdit(row)`**: closes any other open edit form, adds `.editing` class, pre-fills input from `data-note`, focuses.
- **`saveLedgerNote(btn)`**: calls `apiUpdateLedgerNote`, on success updates `inventoryResourceLedger` client-side, clears `.editing`, re-renders the correct sheet body.
- Note: editing only affects the audit log — gold balance is derived from inventory rows and is not recalculated.

---

---

## Session Summary (2026-06-06, continued — @241–@246)

### Delerium counter font sizes — root cause found (@241–@242)
- **Problem**: Adding `!important` to hardcoded px values (18px → 20px → 24px) made fonts look the *same or smaller* than before, not larger.
- **Root cause**: GAS webview renders at ~980px CSS viewport width and scales it visually onto the phone screen (~0.4× factor). The `--phone-font-*` CSS variables are DPR-calibrated to compensate (e.g. `--phone-font-body = Math.round(18 × scale)px` where scale = clamp(DPR, 1.6, 2.8) → 50px on 3× iPhone, visually ~20px after scaling). Hardcoded `24px !important` appeared at ~10px after scaling — smaller than the 39–50px variables.
- **All other elements** that look correct (sheet titles, ledger rows, inputs) use `var(--phone-font-*)`. Counter elements had no phone overrides, so they defaulted to their tiny base px values.
- **Fix** (@242): Removed `!important` from all base class font-size rules for delerium counter elements. Added `html.is-phone` overrides that use phone CSS variables:
  - `.delerium-row-label`, `.delerium-counter-qty`: `var(--phone-font-heading, 30px)`
  - `.delerium-for-sale`, `.delerium-receiving`: `var(--phone-font-body, 28px)`
  - `.delerium-counter-btn` phone rule: kept hardcoded `32px !important` (button is 60px circle; global phone rule would push to 50px+ which overflows)
- Also added `padding: 0 !important; border-radius: 999px !important` to phone counter-btn to prevent global `html.is-phone button` padding/radius from overriding the circular pill shape.

### Delerium totals row variance label alignment (@244)
- The "+X receiving / −X for sale" label in the totals row appeared misaligned (too far left) compared to per-row labels.
- **Root cause**: The totals counter div used invisible `<span class="delerium-counter-btn">` placeholders. Even as flex items, `<span>` elements do not pick up identical box-model sizing as `<button>` elements — the invisible spacers were narrower, shifting the flex:1 spacer and misplacing the variance label.
- **Fix**: Changed placeholder `<span>` → `<button tabindex="-1" disabled>` so they receive identical CSS (including phone-specific sizing rules) as the real counter buttons.

### Ledger row limits (@243, @245)
- `renderResourceLedger(resource, limit = 6)` — added optional `limit` parameter.
- Gold sheet: initially set to 20 (@243), then expanded to 60 (@245) to show the full in-memory buffer.
- Delerium sheet: also set to 60 (@245).
- Both ledger panels are independently scrollable; counters section (delerium) is a static `flex-shrink: 0` div above the scroll body.

### Header tightened (@246)
- Phone `.app-header`: `padding-top` reduced from 8px → 0px.
- Phone `.app-header-title`: `margin-bottom` reduced from 8px → 4px.
- Title + filter bar move up together; scope slider (party/character) is in the same header and shifts up with it — horizontal layout unchanged.

---

---

## Session Summary (2026-06-06, continued — @247)

### Party Notes feature (@247)

**What existed before:** A `CAMPAIGN_NOTES_FEED` sheet with a simple 5-column schema (Note ID, Created At, Updated At, Updated By, Body). The notes UI was a chat-style textarea overlay, gated to admin users only via `requireCampaignNotesOwner_()`. Non-admin users saw "Under Construction".

**What was built:** Full replacement with a proper 3rd nav tab.

**Backend — new `NOTES` sheet (Code.js):**
- `PARTY_NOTES_HEADERS`: 11-column schema — Note ID, Created At, Updated At, Author, Category, Title, Note, Tags, Pinned, Archived, Related Item ID
- `PARTY_NOTES_CATEGORIES`: General, Quest, Location
- `ensurePartyNotesSheet_()`: creates the `NOTES` sheet on first use; safely appends missing headers to existing sheet
- `makeNoteId_()`: generates `NOTE_XXXXXXXX` IDs
- `apiGetNotes(payload)` — uses `requireAllowedUser_()` (NOT admin-only). Supports filters: search (title/note/tags/category), category, relatedItemId, pinnedOnly, includeArchived. Sort: pinned first, then updatedAt desc.
- `apiCreateNote(payload)` — author set from `payload.clientCharacter` (not `Session.getActiveUser()`)
- `apiUpdateNote({noteId, patch})` — allowed patch fields: Category, Title, Note, Tags, Pinned, Related Item ID
- `apiArchiveNote({noteId})` — soft-delete only; sets Archived=true

**Frontend — Index.html:**
- Bottom nav: `grid-template-columns: 1fr 1fr` → `1fr 1fr 1fr`, added `notesTab` button
- `setCommandMode('notes')` hides app header, shows `#notesSection` flex column
- `#notesSection`: filter bar (search + category dropdown + pin toggle) + scrollable card list + FAB button
- `#noteFormSheet`: mobile-sheet overlay for add/edit — Title, Category select, Note textarea, Tags, Pinned checkbox, hidden relatedItemId
- 8 category labels + 8 category colors defined as JS constants
- `loadNotes()`, `renderNotesList()`, `openNoteForm()`, `closeNoteForm()`, `saveNoteForm()`, `archiveNote()`, `toggleNotePin()`, `handleNotesSearch()`, `applyNotesFilters()`, `toggleNotesPinFilter()`
- `renderNotesShortcut()` in inventory list now shows live count and routes to the notes tab

**Key decisions:**
- Old `CAMPAIGN_NOTES_FEED` and its API functions (`apiGetCampaignNotes`, `apiAddCampaignNote`, `apiUpdateCampaignNote`, `apiDeleteCampaignNote`) are still in place — not removed. They still work for any existing data.
- New notes live in a separate `NOTES` sheet — no migration needed.
- `Related Item ID` plumbing is in place server-side and in the form (hidden field); item-detail integration (the "+ Add Item Note" button on description sheets) is **not yet built**.

**Planned next work on notes:**
- Visual polish and layout testing on device
- Item detail integration: "+ Add Item Note" on description sheet, show related notes inline
- Possibly: note detail/full-view sheet (expand beyond 3-line preview)
- Consider inline editing vs. always using the form sheet
- Search debounce behavior on slow connections
- Category filter select sizing on phone (needs phone-specific min-height)

---

## Session Summary (2026-06-07 — @248–@259)

### Party Notes — bug fixes and UX polish (@248–@254)

**+Add Note was silent on GAS webview (@248)**
- Root cause: `@media (min-width: 700px)` sets `.mobile-sheet { display: none !important }`. GAS webview uses a ~980px CSS viewport, so this rule fires. `#noteFormSheet` was missing from the exception list (unlike `#goldSheet`, `#descriptionSheet`, etc.).
- Fix: added `#noteFormSheet.active { display: block !important; }` to the media query block.

**Treasurer-only gate (@248–@249)**
- `#notesTab` hidden by default via `style="display:none"` in HTML. Shown only when `isTreasurer` is confirmed in `applyIdentity`.
- `setCommandMode('notes')` redirects non-treasurers to inventory as a hard guard.
- Nav grid expands from `1fr 1fr` → `1fr 1fr 1fr` dynamically when treasurer is confirmed.
- `renderNotesShortcut` call removed from inventory render (replaced by bottom nav tab).

**Optimistic saves (@250)**
- Create: local stub with temp ID (`NOTE_TEMP_...`) inserted immediately; server call fires in background. On success, temp ID replaced with real `noteId`. On failure, stub removed.
- Edit: local `notesData` updated immediately, form closed. On failure, backup restored.
- `pinned` field in `apiCreateNote` was hardcoded `false` — fixed.

**Card layout (@250)**
- Tags moved to same row as category pill (right-aligned via `margin-left: auto`). Separate tags row removed.
- Card padding reduced; pin/archive buttons given `min-height: 0 !important` to override global phone button rule; `min-width: 64px` for equal sizing.
- Pin toggle toolbar button: DPR-scaled font size; clear active (gold glow) vs inactive (dimmed) styling.
- "Pin this note" form label: removed hardcoded `font-size: 15px` so phone DPR scaling applies correctly.

**Client-side filtering + toolbar in header (@250)**
- All notes loaded without server-side filter params on initial load.
- Search, category, pin-only filters applied client-side in `renderNotesList` — no server roundtrip on filter change.
- Notes toolbar (search input + category select + pin toggle) moved into the app header, replacing the `commandSearch` row on notes tab. `app-header.notes-mode .search-bar-row { display: none }` hides inventory search; `#notesHeaderToolbar` shown instead. Visually aligned with filter rows on other tabs.

**Notes section as normal flow (@252–@253)**
- Removed `position: fixed; inset: 0` from `#notesSection`. It is now a plain `<section class="section">` inside `<main>`, shown/hidden via `.active` class — identical to inventory and addSection. The sticky header, scroll, and nav clearance all work automatically. Eliminated all positioning hacks.

**Pre-beta review (@254)**
- `noteFormSheet` now closed when switching away from notes tab (was floating over other tabs).
- Pending (in-flight create) cards: non-clickable, dimmed, show "Saving…" badge.
- `renderNotesList` sorts pinned-first, updatedAt-desc before rendering (fixes optimistic inserts landing at bottom).
- `archiveNote` now optimistic (instant removal) with rollback + alert on failure. Previously `withFailureHandler(() => {})` was completely silent.
- 2-minute `NOTES_REVALIDATE_MS` TTL: on tab switch, if data is older than 2 minutes, a silent background reload fires without clearing the visible list.
- `renderNotesShortcut` dead code removed.

### Dice calculator (@255)
- Backspace (del) icon: 34px → 52px desktop, 40px → 72px phone.

### Background notes preload (@256)
- `loadNotes()` called from `applyIdentity` when `isTreasurer && commandMode !== 'notes'`.
- Notes data is in memory before the user taps the tab — first open is instant.

### Collaborative sync polling (@257–@259)

**Architecture**
- `bumpSync_(section, clientId)` in Code.js writes two PropertiesService keys atomically: `SYNC_INVENTORY` (timestamp) and `SYNC_INVENTORY_BY` (character name). Same for notes.
- `apiGetSyncState()` returns `{ inventory: {ts, by}, notes: {ts, by} }` — one call, ~15ms execution, reads from PropertiesService (not sheets).
- Every write API function calls `bumpSync_` on success. Coverage: all 15+ inventory/ledger writes + 3 notes writes.
- `apiDeleteInventory` refactored from bare string arg to payload object (`{ inventoryId, _syncClientId }`) for consistency. Backward-compatible.

**Client**
- `syncClientId = myCharacterName` (set in `applyIdentity`) — no random ID. The PropertiesService shows `SYNC_INVENTORY_BY = "Corvane"`, which is readable and debuggable.
- `startSyncPoll()` starts a `setInterval(pollSync, 20000)` after identity resolves.
- `pollSync()`: compares `res.inventory.ts !== syncState.inventory.ts`. If changed AND `by !== syncClientId`, fires `loadInventory(true)` or `loadNotes(true)`. If `by === syncClientId`, skips reload (the writer already has the data).
- `visibilitychange` listener: `stopSyncPoll()` when app is backgrounded (iOS kills timers anyway); on foreground return fires an immediate `pollSync()` then restarts the interval.
- Every client write call now includes `_syncClientId: syncClientId` in the payload.

**Quota math** (5 players, 3-hour session, 20s poll): ~2,700 calls × ~25ms avg = ~67 seconds of execution time, against a 90-minute daily quota. ~1.2% per session.

---

---

## Session Summary (2026-06-15 — @260–@300)

### Currency / gold classification fix (@289)
- `isGoldItem_`: now matches only `\b(gold|gp)\b` in item name (case-insensitive). Platinum, silver, copper excluded from gold count.
- `isDashboardResourceRow_`: extended to exclude platinum/silver/copper from inventory groups (they appear as ledger entries like gold).
- `isTreasureItem_`: added `category === 'currency'` — non-gold currency items (citrine, etc.) land in the Treasure inventory group instead of being miscounted as gold.

### Add flow fixes (@290)
- `shouldSubmitAddFromNav()`: removed `addFormInteractionPrimed` requirement — was causing double-tap needed for the Add nav button when search bar had been touched. Now simply checks `detailsVisible && hasItemContext`.
- `scrollAddDetailsIntoView()`: returns early on mobile — iOS focus scroll handles positioning; the old 80 ms timer raced with `focusPrimaryAddField` causing double-scroll jitter.

### Sell Items batch: +/- steppers + rollup (@291–@292)
- Checkboxes replaced with +/- steppers per rollup row. Stepper goes from 0 (not selling) to `totalQty`; partial sells supported.
- `buildSellBatchRollups(rows)`: groups rows by `name + '\x00' + holder` — same item held by different characters stays separate; same item from multiple additions (same holder) rolls into one row with combined qty.
- `buildSellBatchGroups()`: organises rollups into the same 6 inventory groups.
- `stepSellBatchQty(idx, delta)`: targeted DOM update (stepper display + group count label only) — avoids scroll reset from full re-render.
- `confirmSellBatch()`: FIFO drain — distributes sell qty across underlying rows sorted oldest-first. Server receives `{ items: [{inventoryId, qtyToSell}] }`.
- `apiSellInventoryBatch` (Code.js): accepts `items` array; partial qty → `writeInventoryRow_` to update; full qty → `sheet.deleteRow`. Rows processed highest-rowNumber first to avoid row-shift corruption.

### Value GP in inventory and sell batch (@293)
- Inventory cards: `valueGp` shown right-aligned in the title row (`item-title-row` flex, `item-value-gp` class). Suppressed when 0 or blank.
- Sell batch rows: `sell-batch-value-gp` element appended after item name. Suppressed for scroll items (category = Scroll or name contains "scroll").

### Copy party pool inventory (@295)
- "Cancel" button in sell batch sheet header replaced with "Copy". Copies party pool inventory (non-gold, non-delerium, empty Holder) as formatted text grouped by category. Button text flashes "Copied!" / "Failed" for 1.8 s. Uses `navigator.clipboard.writeText` with `document.execCommand('copy')` fallback.

### Notes: Cancel + Archive buttons in edit form (@296)
- Note form actions now: Save Note (success), Cancel (secondary), Archive Note (danger, edit-only, hidden on new).
- `deleteNoteFromForm()`: optimistic archive (removes from `notesData`, calls `apiArchiveNote`), rollback on failure.
- Button labelled "Archive Note" (not "Delete") to reflect the soft-delete nature.

### Description sheet: qty stepper replaces Delete (@297–@299)
- Header button changed from danger "Delete" to secondary "Close".
- Actions area: "Sell for Gold" + "Give to…" on one row (side by side, `flex:1` each). Remove stepper row below: `[−][qty][+]` (2/3 width) + "Remove" danger button (1/3 width). `align-items: stretch` makes stepper buttons fill the row height.
- `getDescRemoveTotalQty_()`: sums qty across ALL rollup rows matching same item+category+rarity and same holder as representative (or all holders if representative holder is "Multiple"). This is the stepper max.
- `confirmDescRemove()`: FIFO drain across matching rows, calls `apiSellInventoryBatch({ items, goldAmount: 0 })` with optimistic update and rollback.
- Bug fix: `selectedInventory['Qty']` (one row) was used as max — replaced by `getDescRemoveTotalQty_()` sum so rolled-up items (e.g. "2 additions" each qty=1) show the correct max.

### Scroll: single quick-add, no spell level (@300)
- `scroll` added to `QUICK_ADD_ITEMS` (Code.js and client-side fallback array): `{ name: 'Scroll', category: 'Scroll', editType: 'scroll', terms: ['scroll','spell scroll','spell'] }`.
- Library search suppresses results matching `/spell scroll/i` — only the quick-add appears.
- `apiQuickAddInventory`: for `editType === 'scroll'`, uses `payload.item` (client-supplied, e.g. "Scroll of Fireball") instead of `quick.name`. Client now passes `item: payload.item` in the quick-add call.
- Scroll spell name field (`#scrollSpellField`) triggered as before — any item with "scroll" in name shows it.

### Hardening pass (@300)
- **Description title shows total qty**: `openInventoryDescription` prefixes title with `${totalQty}× ` when `getDescRemoveTotalQty_() > 1`.
- **Sell for Gold title shows qty**: `openSellItemSheet` title shows `Sell ${qty > 1 ? qty+'× ' : ''}"Item"` so user knows how many units are being sold.
- **Edit form delete guard**: `deleteSelectedInventory` shows an inline "Removes all N× — Confirm delete all" button before proceeding when `qty > 1` and not called with `decrementOnly`. Single-qty rows delete immediately.
- **"Archive Note" label**: note form delete button now accurately says "Archive Note" (soft-delete via `apiArchiveNote`, not permanent).
- **Swipe auto-close**: `touchstart` handler closes any previously swiped-open card (resets transform, clears `swipedInventoryId`) before starting a new swipe.
- **Dead code removed**: `const prev = btn.textContent` in `copyPartyPoolInventory` was set but never read.

### Version limit
- Hit 200-version hard limit during this session. User pruned old versions via `script.google.com` → project History. Limit resets after pruning; periodic manual pruning required.

---

## Session Summary (2026-06-16 — @301–@306)

### Sell batch: copy fix + PHB Value total (@301)
- `copyPartyPoolInventory`: added `isScroll` check — items whose name matches `/scroll/i` or category is `'scroll'` now omit the gp price from the copied text.
- `renderSellBatchBody()`: added `<span id="sellBatchPhbValue">` in the Select All / Clear header row (flex, centered). `updateSellBatchPhbValue()` recomputes the total live whenever steppers change — multiplies each rollup's stepper qty by its `Value GP`, skipping scrolls.

### Description sheet: shared stepper + three-button layout (@301–@303)
- **Old layout**: Sell for Gold + Give to… side by side, then separate stepper + Remove row.
- **New layout**: Single shared stepper (`[−] qty [+]`) in `#descRemoveRow` as its own row; all three action buttons equally sized on one row below: Sell for Gold (secondary), Give to… (secondary), Remove (danger).
- `descRemoveQty` module variable now drives all three actions.
- Removed `min-height: 0 !important` from stepper buttons — global phone rule (`html.is-phone button { min-height: var(--phone-input-height) }`) restores correct height via flex-stretch.

### Sell for Gold (description sheet): FIFO drain rewrite (@304–@305)
- **Problem**: `confirmSellItem` called `apiSellInventoryItem` which deleted the entire representative row regardless of the stepper qty.
- **Fix**: `confirmSellItem` now mirrors `confirmDescRemove`: filters matching rollup rows (by rollup key + holder), sorts by Date Added asc, drains `descRemoveQty` across rows, builds `items: [{inventoryId, qtyToSell}]` array, then calls `apiSellInventoryBatch`.
- Optimistic update: removes/decrements matching rows in `inventoryRows` immediately; rolls back on server failure.
- `apiSellInventoryBatch` (Code.js): deduplicates `soldNames`, now returns `goldItem` (sanitized row object for the new gold entry). Client calls `primeInventoryCacheAfterAdd(res.goldItem)` for smooth gold insertion without a fake optimistic row.
- Gold ledger label: `getLedgerWho_()` for `ADD`/`RECEIVE` actions now extracts the sold item name from `entry['Item']` matching pattern `Gold (sold X)` → returns `"X"`. Plain gold receives return `""` (letting character + note carry the label).
- `loadInventory(true)` added to `confirmSellItem` success handler so `inventoryResourceLedger` refreshes and the gold ledger updates immediately.

### Custom item flow fix (@306)
- `startCustomItem()`: `#item` field now pre-filled with `"Custom Item"` instead of empty string. Combined with `focusPrimaryAddField` which auto-selects custom items, the first keystroke replaces it — blank-name submits are no longer possible.
- `handleCustomItemNameInput()`: now updates `#selectedName` and `#selectedCardName` live as the user types, giving immediate confirmation the name is captured.

---

---

## Session Summary (2026-06-18 — audit findings, no new deploy)

### CCR audit routine

A scheduled Claude Code remote agent (`trig_019oafGWb1PDxJHZPbcpVkeR`, every 5 hours, `claude-opus-4-8`) runs a user-story-driven audit of the codebase section by section, writing findings to `FINDINGS.md` and pushing commits. The agent traces happy paths, failure paths, navigate-away, and cross-cutting scenarios (collaborative sync interference, DM scope, treasurer gating). Findings across 17 runs were all applied in this session.

### Poll-clobber class of bugs (runs 10–12)

The 20-second `pollSync` loop calls `loadInventory(true)` on another user's write, which unconditionally replaces `inventoryRows`. If a local write is optimistically in-flight at that moment, the new server set (which predates the in-flight write) reverts the optimistic mutation and the UI gets stuck showing stale state until some future unrelated write.

**Fix applied everywhere:**
- `pollSync` (4350): defers `loadInventory(true)` when `_inFlightWrites > 0` and leaves `syncState.ts` un-advanced so the next tick retries.
- `confirmDescRemove`, `deleteSelectedInventory`, `receiveDelerium`, `sellDelerium` — all now bracket their API calls with `_inFlightWrites++`/`--`, matching the existing pattern in `confirmSellItem`/`giveItemToCharacter`/`undoResourcePay`.
- `confirmDescRemove` success path also adds `loadInventory(true)` (matching `confirmSellItem`) to reconcile any server-side qty clamp from a concurrent stack reduction.

### Gold/delerium ledger gaps (runs 3, 7)

`apiAdjustInventory` (add/remove quick-edit) and `apiSetItemQuantity` (set-total quick-edit) never called `appendResourceLedger_` for currency or delerium items. The optimistic ledger entry returned by the server was also being discarded in `confirmQuickEdit`'s success handler.

**Fix:** Both server handlers now classify the row with `classifyQuickEdit_`, write an `ADJUST` ledger entry when the item is currency or delerium and qty changed, and return it via `sanitizeResourceLedgerForClient_`. `confirmQuickEdit`'s `finishSuccess` handler now prepends `res.ledgerEntry` to `inventoryResourceLedger`. Also: `sellDelerium`'s `_pending` entry was being built after `cacheInventoryRows`/`renderDeleriumSheetBody` (so it never showed during the in-flight window); moved to before the cache/render calls, matching `receiveDelerium`.

### DM-scope cross-holder rollup (run 12)

`rollupInventoryRows` merges rows by `name|category|rarity` (ignoring holder) and sets `Holder = 'Multiple'` for cross-holder stacks. But `selectedInventory` is always a raw single-holder row, so `repHolder` was never `'Multiple'` — the `isMultiple` branch in `getDescRemoveTotalQty_`, `confirmDescRemove`, and `confirmSellItem` was completely dead. In DM scope, a "5× Potion" card (3 held by A, 2 by B) showed a description sheet capped at 3 and could never drain B's units.

**Fix:** `isMultiple` is now derived by computing `holders = new Set(allForKey.map(r => r['Holder']))` and checking `holders.size > 1`. All three functions share this pattern. The description title (`openInventoryDescription`) already called `getDescRemoveTotalQty_()` for its prefix, so it automatically shows the correct cross-holder total once the function is fixed.

### Give item erases Notes and Faction Relevance (run 16)

`apiUpdateInventory` had undefined guards for `Qty` and `Value GP` (`payload.x === undefined ? existingObj[x] : validate(payload.x)`) but not for `Holder`, `Faction Relevance`, or `Notes`. The Give flow sends only `{ inventoryId, holder }`, so both Notes and Faction Relevance were written as `''` on every give — permanent data loss until the next full edit.

**Fix:** All three fields now use the same undefined guard. `validateQuantity_` also got `{ min: 1 }` to match the Add handlers and prevent zombie 0-qty rows from the edit form.

### Create note stuck "Saving…" (run 17)

`saveNoteForm` (create branch): on `apiCreateNote` returning ok, it updated `notesData[tidx] = res.note` but never called `renderNotesList()`. The card stayed dimmed with the "Saving…" badge indefinitely until an unrelated note action triggered a render. The edit/pin/archive paths all called `renderNotesList()`; the create success path didn't.

**Fix:** Added `renderNotesList()` after the `notesData[tidx] = res.note` assignment in the create-success ok branch.

### visibilitychange guard comparison bug (run 13)

```js
} else if (syncState.inventory !== '0' || syncPollTimer) {
```
`syncState.inventory` is an object `{ts, by}`, so `!== '0'` is always true (object vs. string), making the guard dead. This caused `pollSync()` to fire on every foreground return even before identity was resolved, with `syncClientId === ''` so any other user's write would trigger a full `loadInventory(true)` behind the still-visible identity overlay.

**Fix:** Changed to `syncState.inventory.ts !== '0'`.

### combineSheet invisible on every device (run 9)

The `@media (min-width: 700px)` block sets `.mobile-sheet { display: none !important }` and then re-enables specific sheet IDs via `.active { display: block !important }`. `#combineSheet` was the only overlay not in that whitelist — and since the iOS GAS webview renders at ~980px CSS width, the "desktop" media query always fires on real devices. Net effect: the Combine duplicate flow was entirely unreachable, and triggering it locked body scroll behind an invisible modal.

**Fix:** Added `#combineSheet.active { display: block !important; }` to the whitelist.

### Auth and security (runs 1, 14, 15, 16)

- `DEV_ALLOW_UNCONFIGURED_ACCESS`: set to `false` — live.
- `requireAllowedUser_`: when `effectiveAllowed` is empty and the DEV flag is false, now throws "App is not configured" for authenticated users too (previously fell through to `return email`).
- `apiGetMyCharacter`: previously ignored `clientCharacterHint` and never called email-based resolution. Now falls back to `resolveIdentityForEmail_(getActiveUserEmail_())` then `resolveIdentityForCharacter_(clientCharacterHint)` when the temp-key profile is absent. Client passes `myCharacterName` as the hint. This restores treasurer identity after temp-key rotation without requiring re-pick.
- Party Notes v2 error handling: `apiGetNotes`/`apiCreateNote`/`apiUpdateNote`/`apiArchiveNote` catch blocks now route through `publicApiError_` (previously leaked raw `e.message` to client).
- "Treasurer access required." added to `publicValidationError_` whitelist so treasurer-gated rejections surface verbatim.
- PII `Logger.log` calls removed from `apiGetCharacters` success path.
- Hardcoded `"DM Josh"` short-circuit in `validateCharacterChoice_` removed — DM characters now require CHARACTERS sheet entry like anyone else.

### Admin tooling (run 14)

`setupInventoryTabs` and `resetAppDataSheets` never referenced `PARTY_NOTES_SHEET` (`NOTES`). The live Party Notes feature creates it lazily, but "reset app data" was silently preserving stale party notes while clearing everything else. Both admin functions now include `PARTY_NOTES_SHEET` / `PARTY_CAMPAIGN_NOTES_HEADERS`.

### Other fixes (runs 2, 5, 8, 11, 13, 17)

- **Resize handler**: only closes description/editor on height delta > 150 px (guards iOS virtual keyboard events).
- **`ondblclick`** removed from inventory cards and campaign-note cards (unreachable on touch; runs 1 and 2).
- **`isMobileLayout()`**: now returns `classList.contains('is-phone')` only; `(max-width: 699px)` arm removed from `updatePhoneClass()`.
- **`--card-bg` CSS variable**: defined as `#212f4b` (same as `--panel-strong`) — three usages were referencing an undefined token.
- **Party Notes v2 write failures**: `saveNoteForm`, `deleteNoteFromForm`, `toggleNotePin` now call `setMainStatus()` with an error message instead of silently reverting.
- **`confirmCombineInventoryItem`**: double-tap guard — `pendingCombineChoice` nulled before the API call, restored on error.
- **`updateLedgerNoteFromBottom`**: re-caches after note edit (the `by === syncClientId` poll-skip means the writer's own poll never reloads, so the un-cached ledger change was permanent).
- **`isAccessoryItem_`**: now returns true when name matches OR category contains `wondrous`/`accessor`, so custom rings/cloaks with free-form categories land in Accessories.
- **`.notes-list` WKWebView clip**: `align-content: end` on a grid scroll container clips overflowed content above `scrollTop: 0` on older iOS WKWebView. Replaced with `display: flex; flex-direction: column` + `::before { flex: 1 }` spacer.
- **`sellDelerium` `_pending` ledger entry**: was built after `cacheInventoryRows`/`renderDeleriumSheetBody`, so the "Selling…" entry never appeared during the in-flight window. Now built before, matching `receiveDelerium`.
- **`receiveDelerium` failure path**: now calls `renderInventory()` (the only optimistic write path that didn't repaint the main list on rollback).
- **`classifyQuickEdit_` / `getQuickEditType`**: both now use the same two-guard pattern (platinum/silver/copper excluded first, then gold/gp matched). Fixes the flash-and-swap on silver/platinum/copper inventory cards.
- **Scroll spell restore on add-failure**: both the `!res.ok` and transport-fail branches now re-parse the spell name from `payloadSnapshot.item` and repopulate `#scrollSpellName`.
- **`apiSellInventoryBatch` combine value-mismatch**: source and target Value GP now compared; on mismatch the merge proceeds but the success message notes "values differed — kept X gp/unit from target."
- **`apiCombineInventoryItems`** lock: was missing `LockService`; now consistent with all other write handlers.
- **`apiUpdateLedgerNote`** lock: same pattern applied.
- **`continueCleanEquipmentLibrary`** lock: `tryLock(5000)` added; concurrent import runs no longer corrupt the cursor.
- **`categorizeItem_`**: over-broad fallback (`|| rarity`) removed; now only triggers on `text.includes('magic item')`.
- **Dead code removed**: `testAddInventoryDirect_`, `testGetInventoryDirect_`, unused `const category` in `isDashboardResourceRow_`, stale `amountInput.dataset.lastPaidAmount` write in `payResource`.
- **Debug logs removed**: `console.log`/`warn` from `loadCharacters` and `loadFallbackCharacterIdentity`/`showIdentitySheet`/`confirmIdentity`; `Logger.log` from `apiGetCharacters` success path.
- **`CAMPAIGN_NOTES_HEADERS`** renamed from `NOTES_HEADERS` throughout `Code.js` and `Reset.js` (was shadowing the Party Notes schema variable name).
- **`apiQuickAddInventory` ledger entry**: Notes + Character fields now included in the sanitized return, matching `apiDepleteResource`/`apiReceiveResource`.
- **`apiSellDelerium`/`apiSplitGold`** ledger entries: all five inline `ledgerEntries.push()` calls now wrapped with `sanitizeResourceLedgerForClient_`; `SPLIT_REMAINDER` entry got its missing `Character` field.

### Current deploy state (`@307–@312`, 2026-06-19)

| Version | What it contains |
|---|---|
| `@307–@309` | Audit fix batch: runs 1-21 (CSS/sheet-visibility bugs, combineSheet, auth hardening, ledger gaps, poll-clobber class, delerium send/receive, notes subsystem) |
| `@310` | Audit fix batch: runs 22-26 (pendingForeignReload, _inFlightWrites gaps, notes in-flight guard, delerium quick-add size, inventory edit save guard, Undo Last Pay wiring) |
| `@311` | Audit fix batch: runs 27-37 — all open BUG findings closed (see session summary below) |
| `@312` | Fix BUG 5510 + BUG 6154 from CCR audit run 37 re-audit (see session summary below) |
| `@313–@314` | Audit BUG fixes: BUG 7379 (quick-adjust missing clientCharacter), BUG 7774 (equipment index mutual recursion) from CCR runs 38–39 |
| `@315` | Fix 7 open RISKs: RISK 6337, 7066, 3169, 110, 7109, 6029, 5427 (see session summary below) |

---

## Session Summary (2026-06-19 — audit run 37 re-audit, deploy @312)

### CCR audit new findings from origin/audit-findings

The audit agent re-ran section 11 (Index.html lines 4501–6000, gold/delerium UI) and pushed new findings to the `audit-findings` branch. Two new BUGs were confirmed real and fixed:

### `goldSheetMutated` synchronous fix (BUG 5510)

`receivedGold`, `confirmPayWithReason`, and `splitGold` all set `goldSheetMutated = true` only inside their success handlers. `closeGoldSheet` checks `if (goldSheetMutated) renderInventory()`. If the user closes the sheet before the round-trip returns, the flag is still `false` → dashboard `Gold = X gp` total stays stale until the user manually triggers a re-render (the writer's own sync-skip also prevents the poll from correcting it).

Additionally, `receivedGold` and `confirmPayWithReason` never called `renderInventory()` in their success handlers, so the dashboard wasn't refreshed even when the sheet stayed open.

Fix: set `goldSheetMutated = true` synchronously right after the optimistic render in all three functions; added `renderInventory()` to `receivedGold` and `confirmPayWithReason` success handlers.

### Pay→Purchase Undo never armed (BUG 6154)

`confirmPayWithReason`'s `onSuccess` only set `lastResourceUndo['gold']` when `isTreasurer && res.poolDeduct`. A Purchase routes to `apiDepleteResource` which returns `res.item` but no `res.poolDeduct` → undo token never set → "↩ Undo Last Pay" button never appears for the most common pay type. Also: success handlers only called `renderGoldSheetBody()`, not `renderGoldSheetButtons()`, so even member-pays (where undo was set) didn't show the button until scope toggle or sheet reopen.

Fix: extended undo-token gate to also handle `!isMember && res.item`; added `renderGoldSheetButtons()` call in `onSuccess` after setting the token.

### New open RISK (RISK 5427)

In DM character scope, `renderGoldSheetButtons` renders Got Paid / Pay / Split unconditionally. `goldSheetScope` equals the DM's character name in that scope, so tapping Got Paid silently creates a gold row attributed to the DM character (not the party pool). Not a data-loss bug (the row shows in grand-total view) but misattributed and invisible to the party-pool view. Added to open RISK list.

---

## Session Summary (2026-06-19 — audit runs 22-37, deploys @307-@311)

### CCR audit continuation

The scheduled Claude Code remote agent continued through all 13 Index.html sections and all 7 Code.js sections (re-audited against the post-fix tree). Runs 22-37 surfaced 15 BUG-severity findings, all of which are now fixed and live at `@311`. `FINDINGS.md` has every BUG entry struck through; remaining open items are RISKs and IDEAs only.

---

### `_inFlightWrites` — closed the last gaps (runs 22-24)

`addInventoryItem` (BUG 8033, run 22), `receiveDelerium` / `sellDelerium` (run 11), `confirmSellBatch` (RISK 5923, run 24), `confirmCombineInventoryItem` (RISK 3449, run 23), and `saveInventoryEdits` (RISK 7390, run 25) were the last write paths missing `_inFlightWrites++/--`. All now bracket their server calls consistently.

---

### `pendingForeignReload` flag (BUG 4349, run 23)

Root cause: when `pollSync` deferred a foreign reload (because `_inFlightWrites > 0`), it left `syncState.ts` un-advanced. When the local write then committed, the marker was overwritten to `by=me`. The next poll saw `by === syncClientId` and skipped the reload permanently — the foreign write was silently lost.

Fix: added `pendingForeignReload` and `pendingForeignNoteReload` boolean flags. The defer branch sets the flag instead of relying on ts comparison. On a later poll where `_inFlightWrites === 0`, if the flag is set, `loadInventory(true)` fires and clears it regardless of `by`.

---

### Notes subsystem hardening (runs 17, 24, 31)

- **`_inFlightNoteWrites`** counter: mirrors `_inFlightWrites` for notes; `pollSync` defers `loadNotes(true)` while > 0
- **`_notesActionInFlight` Set**: per-noteId guard on `archiveNote`, `toggleNotePin`, `deleteNoteFromForm` — prevents double-tap desync
- **Stale-index rollback fixed** (RISK 4628, run 31): edit/archive/delete rollbacks now call `findIndex` at handler time; `archiveNote` and `deleteNoteFromForm` use `!notesData.some(n => n.noteId ===)` before re-inserting, safe after a mid-flight `loadNotes` replaces the array
- **Failed create restores form** (BUG 4650, run 31): create branch snapshots all five fields before `closeNoteForm()`; on failure, `restoreNoteForm_()` re-opens the sheet pre-filled so nothing is lost
- **Create-success re-renders** (BUG 4631, run 17): `renderNotesList()` added to create-success ok branch — card was stuck "Saving…" until an unrelated action

---

### `inventorySignature_` expanded (BUG 4073, run 36)

Previously: `length + '|' + first-8-IDs` — did not detect qty, holder, value, or notes changes. Foreign edits (Edit item, Give to…, quick-adjust) with a stable row set never triggered a re-render; values stayed stale until the next interaction.

Fix: signature now covers `InventoryID:Qty:Holder:ValueGP:Notes` for every row via `.map().join('|')`.

---

### `apiUpdateInventory` drops Item/Category/Rarity (BUG Code.js:3408, run 29)

`apiUpdateInventory` built its `rowObj` with `...existingObj` spread for Item/Category/Rarity — payload values were silently ignored. A user who renamed an item or re-categorized it saw optimistic success, then a revert on the next sync.

Fix: added `payload.x === undefined ? existingObj[x] : validate(payload.x)` fallback guards for all three fields, matching the existing pattern for Qty/Holder/ValueGP/Notes.

Also: `apiAddInventory` (RISK 2424, run 29) now honors `payload.category` / `payload.rarity` overrides on library adds — user edits before tapping Add no longer snap back to library defaults.

---

### Delerium quick-adjust bugs (Code.js:3781 and 3860, run 33)

- **BUG 3781**: `apiAdjustInventory` delerium branch was writing the ledger transaction note into the row's persistent `Notes` field (`rowObj['Notes'] = [note, 'Size: '+size].join('\n')`). This destroyed any item-specific note on every qty adjust, including swipe-remove-one. Fix: removed the `rowObj['Notes']` write; note now goes to the ledger only.
- **BUG 3860**: `apiSetItemQuantity` (set-mode quick-edit) had no `size` parameter. User changes to the size dropdown in set mode were silently discarded. Fix: client now passes `size` in the set call; server applies the delerium rename if size is valid.

---

### Undo Last Pay gold duplication (BUG 6155, runs 30 and 32)

`apiSendGoldToMember` writes two rows: `res.poolDeduct` (−amount from pool) and `res.item` (+amount credit to recipient). The undo token stored only `poolDeduct`; `undoResourcePay` deleted only that one row, leaving the credit row in place — creating gold from nothing on every member-pay undo.

Fix:
- `confirmPayWithReason` onSuccess now stores `creditItem: isMember ? res.item : null` in `lastResourceUndo['gold']`
- `undoResourcePay` makes two sequential `apiDeleteInventory` calls for member-pays: deduct first, then credit. If the second call fails (rare), `loadInventory(true)` resyncs server truth rather than attempting a complex local rollback.

---

### Other bug fixes

| Bug | Fix |
|---|---|
| **BUG 6205** — `splitGold` failure loses typed amount/note | Snapshot `savedAmount`/`savedNote` before clearing inputs; restore both on `!ok` and failure |
| **BUG 5154** — non-treasurer Received always fails (no counter UI) | Non-treasurer delerium sheet now shows `+/−` receive counters per size via new `adjustDeleriumReceive()`; Received button enables when any delta > 0 |
| **BUG 5571** — Give title promises a qty it ignores | Removed `"Give 3×"` from `openGiveItemSheet` title; only the representative row moves, so the qty was misleading |
| **BUG 6948/RISK 6936** — description failure caches `null`, blocks retry; blank body | Failure handler no longer writes `itemCache[libraryItemId] = null`; shows `userNotes \|\| 'No description available.'` instead of blank |
| **RISK Code.js:290** — `resetAppDataSheets` wipes CHARACTERS roster | Removed CHARACTERS from the clear list; roster preserved on reset (consistent with `resetCampaignData()`) |

---

### Quality-of-life fixes (IDEAs)

- **IDEA 6028** — `confirmSellBatch` applied an optimistic row-decrement block immediately before `loadInventory(true)` which overwrote it; removed the dead block
- **IDEA 7401** — `saveInventoryEdits` now calls `closeInventoryPanels(false)` on success, consistent with give/delete flows
- **RISK 4628 (notes rollback stale index)** — all three notes rollback handlers (edit/archive/delete) now find the note by `noteId` at rollback time rather than using a captured array index from before the API call

---

## Session Summary (2026-06-19 — RISK patch batch, deploy @315)

### 7 open RISKs fixed

- **RISK 6337** — Added `'ADJUST'` to `LEDGER_VISIBLE_ACTIONS`. Gold quick-adjust entries now appear in the gold ledger (were silently invisible; delerium already showed because it skips the allowlist).
- **RISK 3169** — Added `if (Date.now() - lastTapOpenedAt < 500) return;` guard to the `touchend` tap branch in `initInventoryGestures`. Was missing while `pointerup` branch already had it — both events fire on touch, causing double-open.
- **RISK 110** — `openDiceCalc` now adds `app-modal-open` to `document.body`; `closeDiceCalc` calls `syncModalOpenState()`. Dice overlay now honors the scroll-lock contract (body could scroll behind the calculator before).
- **RISK 7066** — Added `descActionInFlight` boolean flag (declared near `quickEditInFlight`). Both `confirmSellItem` and `confirmDescRemove` guard on it and set/clear it around the server call.
- **RISK 7109** — `openQuickEditPanel` now returns early with `if (quickEditInFlight) return;` instead of unconditionally resetting the flag. Prevents a second quick-edit from opening mid-flight and clearing the in-flight guard.
- **RISK 6029** — Added `sellBatchGeneration` counter. Success handler captures `const gen = ++sellBatchGeneration` before scheduling the 1.5 s close; timer only fires `closeSellBatchSheet()` if generation hasn't advanced (i.e. sheet wasn't reopened for a new batch).
- **RISK 5427** — `renderGoldSheetButtons` now computes `isDMGoldScope = isDMUser && goldSheetScope !== 'party'`. In DM grand-total scope, only the Done button renders; Got Paid / Pay / Split are hidden so the DM cannot accidentally attribute gold to their character name instead of the party pool.

---

## Outstanding / Next Tasks

1. **Import equipment library** — upload `equipment_library_5e.xlsx` to Google Drive, open as Sheets, paste rows 2–5837 into `EQUIPMENT_LIBRARY_CLEAN` at row 2. Activates full stat blocks for all 5,836 items.

2. **Delete `temp_patch.py`** — one-shot file, no longer needed.

3. **Swipe-delete confirmation** — single swipe + tap permanently deletes with no undo. Consider inline confirm (same pattern as 0 gp delerium sell). Edit form has multi-qty guard; swipe-delete does not.

4. **Gold float rounding** — `parseFloat(x.toFixed(2))` at write boundaries in `apiSplitGold`.

5. **Existing inventory stat block backfill** — items added before library import have non-matching IDs. Options: manual edit of Library Item ID column, or name-based backfill.

6. **Party Notes — next steps**:
   - Item detail integration: "+ Add Item Note" on `#descriptionSheet`; `relatedItemId` field and hidden form input already plumbed.
   - Note detail/full-view sheet (expand beyond 3-line body preview).

7. **Remaining open RISKs** (deferred — complex or schema-level changes):
   - RISK 8240: leaked `_inFlightWrites` permanently freezes reconciliation — needs watchdog/id-based counter (not a simple fix)
   - RISK 7093: client/server delerium quick-edit type classification diverges for custom names — align classifiers
   - RISK 6741: Undo Last Pay removes inventory rows but leaves RESOURCE_LEDGER entries; history shows the payment until next reload
   - RISK 1853: `appendResourceLedger_` swallows errors silently — ledger write failure invisible to client
   - RISK 6435: ledger note-edit falls back to Timestamp for same-second multi-row ops — needs stable per-entry ID

8. **"Give to…" rollup limitation** — moves only the representative row. Needs a dedicated server-side multi-row move endpoint for full FIFO give.

9. **Ledger entry ID** — DEFERRED. `apiUpdateLedgerNote` Timestamp-based fallback can hit wrong row in batch ops. Requires new `Entry ID` column in `RESOURCE_LEDGER_HEADERS` and threading through all `appendResourceLedger_` callers and the client cache.

10. **Audit cursor** — currently at section 1: `Code.js lines 1–500` (config, helpers, validation). New findings will appear at the top of `FINDINGS.md`.

11. **Version limit** — currently at `@315`; prune old versions at `script.google.com` when approaching 200.
