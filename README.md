# Drakkenheim Party Inventory — Apps Script Workspace

Local working repo for the **Wieners of Drakkenheim** D&D campaign inventory web app.

- **Spreadsheet**: `1DRs3BhuiAdojDBonns42b8FRPEBLNdjH2z8AUfW5U0o`
- **Apps Script project**: `1yXM9QmYIftBAuMunK-ehpebnXqv4qzGHgsJt_-rznRrjPvRN0ANuJxxt`
- **Web app deployment ID**: `AKfycbx3D0qyi20ijwdCc7sFNnwfFqcAASNASfUaQD5fcA3PFujB9wAyXeaKDT3yqhfhUAN8`
- **Current version**: `@311`

## Layout

- `src/` — Apps Script source files (`Code.js`, `Index.html`, `Reset.js`, `Wallpaper.html`, `Web.js`, `appsscript.json`)
- `sheets/` — Notes, schemas, lightweight spreadsheet documentation
- `data/exports/` — Local spreadsheet exports (git-ignored)
- `scripts/` — PowerShell wrappers for clasp commands
- `parse_compendium.js` — Node script: parses `Complete_Compendium_5.5e.xml` → `equipment_library_5e.xlsx`
- `equipment_library_5e.xlsx` — Generated import-ready equipment library (5,836 items, 20 columns)

## Sheets (backend tabs)

| Tab | Purpose |
|---|---|
| `PARTY_INVENTORY` | All inventory rows (positive qty = held, negative qty = sold/deducted) |
| `EQUIPMENT_LIBRARY` | Raw equipment import |
| `EQUIPMENT_LIBRARY_CLEAN` | App-facing searchable library (20-column schema) |
| `RESOURCE_LEDGER` | Transaction log for gold and delerium |
| `DELERIUM_LEDGER` | Legacy delerium tracking |
| `CHARACTERS` | Party roster (Character, Player, Active?, Notes, Email) |
| `CAMPAIGN_NOTES_FEED` | Campaign notes |
| `LOOKUPS` | Category/rarity lookup values |
| `INVENTORY_LOG` | Audit trail |

## Feature Summary

### Inventory
- Full-text equipment library search with quick-add items (potions, gemstone, art object, trade goods, rations, scroll)
- Default search shows health potions first; 20 results on mobile
- Add / edit / delete / combine inventory items with optimistic updates
- Holder assignment with character dropdowns (populated from CHARACTERS sheet)
- Per-player scope slider (Party ↔ character name) — see Identity section
- Item detail view: stat block (Damage · Properties · Range · AC · Weight · Value) shown above description, matching D&D compendium format; library description cached in-session
- Inventory filter clears on every tab switch; tab switch uses in-memory rows (no flash), background sync only re-renders when data has changed
- Swipe gestures use a single delegated listener on the list container; filter input debounced 80 ms; swiping a new card auto-closes any previously open swipe
- Filtered view shows notes inline for gold and delerium rows (single line, meta suppressed when notes present)
- Add item library preview: stat block + description in a unified scrollable container; category/rarity shown as pills
- Inventory groups: **Murder Tools** (weapons), **Armor**, **Accessories**, **Potions**, **Treasure**, **Bonus Junk** (misc)
- "Weiners of Drakkenheim" title shown in header on both Inventory and Add Item tabs
- Value GP shown right-aligned on inventory card title row and sell batch rows (suppressed for scrolls)
- Currency classification: only items matching `\b(gold|gp)\b` count as gold; platinum/silver/copper/other currency land in Treasure group; delerium excluded from inventory groups
- **Scroll**: single quick-add (no spell-level variants); spell name field shown on select; library spell scroll results suppressed from search
- **Item description sheet**: total qty shown in title (e.g. `2× Aqua Delerium`); shared qty stepper pinned at top of actions area; three action buttons below equally — "Sell for Gold", "Give to…", "Remove"; stepper drives all three; Sell for Gold and Remove use FIFO drain across all rollup rows via `apiSellInventoryBatch`; edit form delete requires confirmation for qty > 1
- **Sell Items batch** (treasurer): +/- steppers per item (partial qty sell); same-name+holder items rolled up into one row; groups collapsed by default; group header shows selling count; targeted DOM updates avoid scroll reset on stepper tap; gold amount + note in one row; PHB Value total shown live between Select All / Clear (scroll items excluded); Copy button in header copies party pool inventory as formatted text (scroll gp prices suppressed)

### Gold sheet
- Header shows live `Gold = XXX gp` total
- Party pool balance with resource ledger history (up to 60 entries, independently scrollable)
- **`[Got Paid]` `[Pay]`** side by side (Got Paid = green, Pay = red); Amount (33%) + Note (66%) inputs in one row
  - Got Paid: adds gold to pool, creates RECEIVE ledger entry
  - Pay: deducts gold, routes to Purchase or a specific character
- **`[Split Evenly]`** full width below (treasurer only) — splits evenly, remainder to pool
- **`[Done]`** full width
- Scope toggle (Party Pool / character) is statically pinned above the ledger scroll area — never scrolls
- Ledger entries are tappable: tap to edit the note, save writes back to RESOURCE_LEDGER sheet
- Treasurer scope: Party Pool / character toggle; DM sees grand total on DM tab

### Delerium sheet (treasurer / DM only)
- Sheet title: **Purple Rocks = XX crystals** (live total in header)
- Counter section is **statically pinned** above a scrollable ledger (same `flex-shrink: 0` pattern as gold scope slider)
- Single set of per-size counters — bidirectional: decrement below stock = sell (red label), increment above stock = receive (green label)
- Counter font sizes use DPR-scaled CSS variables (`--phone-font-heading` for labels/qty, `--phone-font-body` for variance labels) — required because GAS webview renders at ~980px CSS width and scales visually; hardcoded px values appear too small
- **`[Received]` `[Sell]`** side by side — each activates only when the counters are in the matching direction; both disable when counters are mixed (+/−); silent guard prevents posting in mixed state
- Gold received (33%) and Note (66%) inputs share one inline row
- Sell accepts 0 gp with inline "are you sure?" confirmation
- Non-treasurers see a Received button to log crystal pickups
- Ledger shows up to 60 entries (full in-memory buffer), independently scrollable

### Party Notes
- **3rd bottom-nav tab** ("Party Notes") — currently treasurer-only (Corvane) for beta; gated in `setCommandMode` and `applyIdentity`
- Normal `<section>` in `<main>`, shown/hidden via `.active` class (same pattern as inventory/add)
- Backed by a `NOTES` sheet (auto-created on first use) with 11-column schema:
  `Note ID · Created At · Updated At · Author · Category · Title · Note · Tags · Pinned · Archived · Related Item ID`
- **Filter bar**: in the app header (replaces commandSearch row on notes tab). Live search, category dropdown, 📌 pinned-only toggle — all client-side, no server roundtrip
- **8 categories** with playful display labels:

| Internal | Display label |
|---|---|
| General | General Nonsense |
| Quest | Quest |
| Location | Location |

- **Note cards**: category pill + tags on same row (tags right-aligned), title, 3-line body preview, author + date, Pin/Archive buttons. Cards with in-flight creates are dimmed + non-clickable with "Saving…" badge.
- **Optimistic saves**: create/edit/archive/pin all update local state immediately; server syncs in background; rollback on failure
- **Caching**: notes loaded once and kept in memory; 2-minute TTL triggers silent background refresh on tab switch; preloaded in background immediately after identity resolves
- **Add/Edit form**: mobile-sheet overlay — Title, Category, Note body, Tags, Pinned checkbox, hidden Related Item ID
- Author set from `clientCharacter` (not `Session.getActiveUser()` — known unreliable)
- `apiGetNotes({})` — loads all non-archived notes, pinned-first, Updated At desc. Client applies all filters.
- `apiCreateNote(payload)`, `apiUpdateNote({noteId, patch})`, `apiArchiveNote({noteId})`
- `Related Item ID` field plumbed server-side and in form — item-detail integration not yet built

### Dice calculator
- Accessible via the d20 icon button in the header search bar row (next to Filter/Search input)
- Opens as a full-screen bottom-sheet overlay with blurred backdrop; tap outside to close
- **7-row × 4-column segmented grid** (no bubble borders, thin 1px separators):
  - Row 1: d2, d4, d6 | ⌫ (backspace — 52px desktop / 72px phone)
  - Row 2: d8, d10, d12 | ÷
  - Row 3: d20, d100, CLR | ×
  - Row 4: 7, 8, 9 | −
  - Row 5: 4, 5, 6 | +
  - Row 6: 1, 2, 3 | Roll (spans rows 6–7)
  - Row 7: 0, (, )
- **Smart die tapping**: tapping the same die increments its count (`d8` → `1d8` → `2d8`); tapping a different die auto-inserts `+1dX`
- **Display** (two permanent rows): formula line (dim, top) + breakdown=result row (breakdown text + large result number inline, baseline-aligned)
- Supports ÷ and × operators (converted to `/` and `*` for evaluation); CLR resets expression to 0
- Uses `var(--phone-font-body)` for display text so it scales correctly with the DPR scaling system

### Collaborative sync
- Every write API bumps a PropertiesService timestamp: `SYNC_INVENTORY` / `SYNC_NOTES` (millisecond epoch) and `SYNC_INVENTORY_BY` / `SYNC_NOTES_BY` (character name of writer)
- `apiGetSyncState()` returns both `{ts, by}` pairs — ~15ms execution, no sheet reads
- Clients poll every 20 seconds via `setInterval`. On change: if `by !== myCharacterName`, triggers `loadInventory(true)` or `loadNotes(true)`. If `by === myCharacterName`, skips reload (writer already has the data).
- `visibilitychange` listener: poll pauses when app is backgrounded (iOS suspends JS anyway); fires an immediate check + restarts interval on foreground return
- Poll starts after identity resolves; `syncClientId = myCharacterName` (set in `applyIdentity`)
- Quota: ~1.2% of daily 90-minute GAS execution limit per 3-hour 5-player session

### Identity & access
- **First open**: full-screen overlay shows all active characters as large tappable cards. Selection stored in `localStorage` and used on every subsequent visit.
- `apiGetMyCharacter(clientCharacterHint)`: resolves email → character via CHARACTERS sheet then `PLAYER_CHARACTER_MAP` Script Property. Falls back to reverse-lookup from client character hint when `Session.getActiveUser()` returns empty (known GAS limitation on personal Gmail with `USER_DEPLOYING`).
- `getEmailForCharacter_(character)`: reverse lookup (character → email).
- DM-prefixed characters automatically receive `isTreasurer: true` and `isDM: true`.
- `requireTreasurer_(clientCharacterHint)`: gates split/sell; accepts character hint as fallback.
- `apiSplitGold` and `apiSellDelerium` include `clientCharacter` in payloads.
- DM inventory scope shows all items combined; DM gold tab shows grand total; all DM transactions deduct from party pool.
- Inactive characters excluded from dropdowns and splits.
- `DEV_ALLOW_UNCONFIGURED_ACCESS: false` in `Code.js` — dev flag is off; unconfigured access is denied for all visitors.
- `Session.getActiveUser().getEmail()` is unreliable for non-deployer users with `executeAs: USER_DEPLOYING` on personal Gmail. localStorage + character-hint is the working identity model.

### Equipment library (20-column schema)

| Col | Field | Notes |
|---|---|---|
| 0 | Item ID | Stable hash |
| 1 | Name | `[5.5e]` suffix stripped |
| 2 | Type Raw | M, A, W, P, etc. |
| 3 | Type Clean | "Melee Weapon", "Wondrous Item", etc. |
| 4 | Category | Derived |
| 5 | Rarity | common → legendary |
| 6 | Requires Attunement | Yes / blank |
| 7 | Magic Item | Yes / blank |
| 8 | Damage | "1d8 slashing" |
| 9 | Damage Versatile | "1d10 slashing" |
| 10 | Properties | "Versatile, Finesse" |
| 11 | Range | "20/60" |
| 12 | AC | Armor only |
| 13 | Strength Req | Heavy armor |
| 14 | Stealth Disadvantage | Yes / blank |
| 15 | Weight | lbs |
| 16 | Value GP | |
| 17 | Source | "Player's Handbook (2024) p. 215" |
| 18 | Text / Description | Full text |
| 19 | Search Text | Concatenated for search |

**Importing**: run `node parse_compendium.js` to regenerate `equipment_library_5e.xlsx` from `Complete_Compendium_5.5e.xml`. Upload to Google Drive → open as Sheets → copy rows 2–5837 → paste into `EQUIPMENT_LIBRARY_CLEAN` at row 2.

## Reset Script

`src/Reset.js` contains `resetCampaignData()` — run from the Apps Script editor. Three-step confirmation, clears all campaign data, preserves CHARACTERS and equipment library sheets.

`setupPlayerCharacterMap()` — interactive utility to write `PLAYER_CHARACTER_MAP` Script Property from the CHARACTERS sheet.

## Apps Script Sync

```powershell
npm install          # one-time: installs clasp + xlsx
.\scripts\clasp-push.ps1
.\scripts\clasp-deploy-webapp.ps1 "describe change"
```

```powershell
.\scripts\clasp-pull.ps1    # pull before pushing to check for drift
.\scripts\clasp-status.ps1
```

## Known TODOs

- Delete `temp_patch.py` (one-shot patch, no longer needed)
- Import `equipment_library_5e.xlsx` into `EQUIPMENT_LIBRARY_CLEAN` sheet to activate the full 5e item stat blocks
- Swipe-delete has no undo — consider inline confirmation (same pattern as 0 gp delerium sell)
- Gold float rounding: `parseFloat(x.toFixed(2))` at write boundaries in `apiSplitGold`
- Apps Script version limit — prune old versions at `script.google.com` before the next deploy batch (was at @306 before audit fixes; versions not yet pushed)
- Existing inventory items added before new equipment library import won't have stat blocks (different hash functions). Options: manual edit of Library Item ID column, or automated name-based backfill.
- "Give to…" from description sheet moves only the representative row when an item is rolled up from multiple additions — other rows stay in place

## CSS / Layout Architecture Notes

- **GAS webview viewport**: iOS GAS webview may render at ~980px CSS width scaled visually to device width. `window.innerWidth` reports ~980; `devicePixelRatio` is reliable. Phone detection uses `(pointer: coarse)` not `(max-width: 699px)`.
- **DPR-scaled font vars**: `--phone-font-body = Math.round(18 × scale)px`, `--phone-font-heading = Math.round(20 × scale)px`, etc. where `scale = clamp(DPR, 1.6, 2.8)`. All phone-mode text should use these variables — hardcoded px values appear too small in the scaled viewport.
- **Static section pattern**: `flex-shrink: 0` div outside the scrollable body pins UI sections (used for gold scope slider `#goldScopeStatic` and delerium counters `#deleriumCountersStatic`).
- **Button width override**: global `button { width: 100% }` rule requires `flex: 0 0 auto; width: auto` on any inline button, or the `style="flex:1"` / `style="width:100%"` approach on flex children.
- **`calc()` with CSS vars**: `calc(var(--name) * N)` works fine when the variable holds a **concrete px value** set by JS (e.g. `--phone-card-min-height: 95px`). What breaks is CSS-only variable chains where a property references another `var()` and you try to do arithmetic on it. Prefer JS-set concrete values over CSS-only variable math.
