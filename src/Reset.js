/**
 * resetCampaignData
 *
 * Clears all campaign data while preserving the CHARACTERS roster,
 * the equipment library, and the LOOKUPS reference sheet.
 *
 * Run this from the Apps Script editor (not from the web app).
 * You will see a confirmation dialog before anything is deleted.
 *
 * Sheets cleared (headers kept):
 *   PARTY_INVENTORY, RESOURCE_LEDGER, DELERIUM_LEDGER,
 *   CAMPAIGN_NOTES_FEED, INVENTORY_LOG
 *
 * Sheets preserved:
 *   CHARACTERS, LOOKUPS, EQUIPMENT_LIBRARY, EQUIPMENT_LIBRARY_CLEAN
 */
function resetCampaignData() {
  const ui = SpreadsheetApp.getUi();

  const first = ui.alert(
    '⚠️  Reset Campaign Data',
    'This will permanently delete ALL inventory, gold history, delerium ledger, ' +
    'campaign notes, and the inventory log.\n\n' +
    'The CHARACTERS sheet will NOT be touched.\n\n' +
    'Are you absolutely sure?',
    ui.ButtonSet.YES_NO
  );

  if (first !== ui.Button.YES) {
    ui.alert('Reset cancelled — nothing was changed.');
    return;
  }

  const second = ui.alert(
    '⚠️  Final confirmation',
    'This cannot be undone. Type YES in the next prompt to confirm.',
    ui.ButtonSet.OK_CANCEL
  );

  if (second !== ui.Button.OK) {
    ui.alert('Reset cancelled — nothing was changed.');
    return;
  }

  const typed = ui.prompt(
    'Type RESET to confirm',
    'Enter the word RESET (all caps) to proceed:',
    ui.ButtonSet.OK_CANCEL
  );

  if (typed.getSelectedButton() !== ui.Button.OK ||
      typed.getResponseText().trim() !== 'RESET') {
    ui.alert('Reset cancelled — nothing was changed.');
    return;
  }

  const ss = getInventorySpreadsheet_();
  const cleared = [];
  const skipped = [];

  const targets = [
    { name: CONFIG.INVENTORY_SHEET,      headers: INVENTORY_HEADERS },
    { name: CONFIG.RESOURCE_LEDGER_SHEET, headers: RESOURCE_LEDGER_HEADERS },
    { name: CONFIG.DELERIUM_SHEET,       headers: DELERIUM_HEADERS },
    { name: CONFIG.NOTES_SHEET,          headers: CAMPAIGN_NOTES_HEADERS },
    { name: CONFIG.LOG_SHEET,            headers: [
        'Timestamp', 'Level', 'Function', 'Message', 'Details',
        'User Email', 'Action', 'Item ID', 'Item Name',
        'Old Value', 'New Value', 'Delta', 'Note / Source', 'Request Status'
      ]},
  ];

  targets.forEach(({ name, headers }) => {
    const sheet = getSheetByTrimmedName_(ss, name);
    if (!sheet) {
      skipped.push(name + ' (not found)');
      return;
    }
    if (headers) {
      clearSheetToHeaders_(sheet, headers);
    } else {
      sheet.clearContents();
    }
    cleared.push(name);
  });

  const summary =
    'Reset complete.\n\n' +
    'Cleared: ' + cleared.join(', ') + '\n' +
    (skipped.length ? 'Not found: ' + skipped.join(', ') : '');

  Logger.log(summary);
  ui.alert('✅  Reset complete', summary, ui.ButtonSet.OK);
}

/**
 * resetCampaignDataDirect
 *
 * Same as resetCampaignData but skips UI dialogs — run this from the
 * Apps Script editor Run button (standalone scripts can't use getUi).
 * No confirmation prompts: make sure you mean it before running.
 */
function resetCampaignDataDirect() {
  const ss = getInventorySpreadsheet_();
  const cleared = [];
  const skipped = [];

  const targets = [
    { name: CONFIG.INVENTORY_SHEET,       headers: INVENTORY_HEADERS },
    { name: CONFIG.RESOURCE_LEDGER_SHEET, headers: RESOURCE_LEDGER_HEADERS },
    { name: CONFIG.DELERIUM_SHEET,        headers: DELERIUM_HEADERS },
    { name: CONFIG.NOTES_SHEET,           headers: CAMPAIGN_NOTES_HEADERS },
    { name: CONFIG.LOG_SHEET,             headers: [
        'Timestamp', 'Level', 'Function', 'Message', 'Details',
        'User Email', 'Action', 'Item ID', 'Item Name',
        'Old Value', 'New Value', 'Delta', 'Note / Source', 'Request Status'
      ]},
  ];

  targets.forEach(({ name, headers }) => {
    const sheet = getSheetByTrimmedName_(ss, name);
    if (!sheet) { skipped.push(name + ' (not found)'); return; }
    clearSheetToHeaders_(sheet, headers);
    cleared.push(name);
  });

  const summary = 'Cleared: ' + cleared.join(', ') +
    (skipped.length ? ' | Not found: ' + skipped.join(', ') : '');
  Logger.log('resetCampaignDataDirect: ' + summary);
}

/**
 * setupPlayerCharacterMap
 *
 * One-time setup: reads every active character from the CHARACTERS sheet,
 * prompts you for each player's Google account email, then writes the
 * PLAYER_CHARACTER_MAP Script Property used for identity resolution.
 *
 * Run from the Apps Script editor. Safe to re-run — it overwrites the
 * existing map each time so you can correct entries.
 *
 * Skip any character by leaving the email blank when prompted.
 */
function setupPlayerCharacterMap() {
  const ui = SpreadsheetApp.getUi();
  const ss = getInventorySpreadsheet_();
  const sheet = getSheetByTrimmedName_(ss, CONFIG.CHARACTERS_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('CHARACTERS sheet is empty or missing.');
    return;
  }

  const values  = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift().map(String);
  const charIdx   = headers.findIndex(h => h.trim().toLowerCase() === 'character');
  const activeIdx = headers.findIndex(h => h.trim().toLowerCase() === 'active?');

  if (charIdx === -1) {
    ui.alert('Could not find a "Character" column in the CHARACTERS sheet.');
    return;
  }

  const characters = values
    .map(r => String(r[charIdx] || '').trim())
    .filter(name => {
      if (!name) return false;
      if (activeIdx !== -1) {
        const active = String(values[values.indexOf(
          values.find(r => String(r[charIdx] || '').trim() === name)
        )] && '').toLowerCase();
        // keep unless explicitly inactive — recompute cleanly below
      }
      return true;
    });

  // Rebuild cleanly with active filter
  const activeCharacters = values
    .filter(r => {
      const name   = String(r[charIdx] || '').trim();
      if (!name) return false;
      if (activeIdx !== -1) {
        const flag = String(r[activeIdx] || '').trim().toLowerCase();
        if (['n', 'no', 'false', '0'].includes(flag)) return false;
      }
      return true;
    })
    .map(r => String(r[charIdx]).trim());

  if (!activeCharacters.length) {
    ui.alert('No active characters found in the CHARACTERS sheet.');
    return;
  }

  // Show existing map so the user can see what's already set
  const existing = PropertiesService.getScriptProperties().getProperty('PLAYER_CHARACTER_MAP') || '';
  if (existing) {
    const proceed = ui.alert(
      'Existing map found',
      'Current PLAYER_CHARACTER_MAP:\n\n' + existing + '\n\nContinue to update it?',
      ui.ButtonSet.YES_NO
    );
    if (proceed !== ui.Button.YES) return;
  }

  const pairs = [];

  for (const character of activeCharacters) {
    const result = ui.prompt(
      `Email for: ${character}`,
      `Enter the Google account email for ${character}.\nLeave blank to skip.`,
      ui.ButtonSet.OK_CANCEL
    );
    if (result.getSelectedButton() !== ui.Button.OK) {
      ui.alert('Setup cancelled — no changes saved.');
      return;
    }
    const email = result.getResponseText().trim().toLowerCase();
    if (email) pairs.push(`${email}:${character}`);
  }

  if (!pairs.length) {
    ui.alert('No emails entered — nothing saved.');
    return;
  }

  const mapValue = pairs.join(',');
  PropertiesService.getScriptProperties().setProperty('PLAYER_CHARACTER_MAP', mapValue);

  Logger.log('PLAYER_CHARACTER_MAP set: ' + mapValue);
  ui.alert(
    '✅  Map saved',
    'PLAYER_CHARACTER_MAP is now:\n\n' + mapValue +
    '\n\nCharacters without an email were skipped and will not get a scope slider.',
    ui.ButtonSet.OK
  );
}
