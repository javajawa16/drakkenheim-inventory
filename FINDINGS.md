# Audit Findings — Drakkenheim Inventory

## Audit Cursor
Next section: 2. Code.js lines 501–1100 (auth, character, inventory read)

## Sessions

### 2026-06-18 — Sections audited: 1 (in progress)

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
