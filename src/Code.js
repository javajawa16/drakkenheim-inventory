/*******************************************************
 * DRAKKENHEIM PARTY INVENTORY WEB APP
 * Stable / logged / low-risk version
 *******************************************************/

const CONFIG = {
  SPREADSHEET_ID: '1DRs3BhuiAdojDBonns42b8FRPEBLNdjH2z8AUfW5U0o',

  // Access is gated by PLAYER_CHARACTER_MAP when set; URL is the security boundary
  // (Session.getActiveUser() is unreliable with USER_DEPLOYING on personal Gmail).
  DEV_ALLOW_UNCONFIGURED_ACCESS: false,

  // Raw pasted/imported library. Leave messy. Do not use directly in the app.
  SOURCE_EQUIPMENT_SHEET: 'EQUIPMENT_LIBRARY',

  // Clean app-facing library. The app searches this tab.
  EQUIPMENT_SHEET: 'EQUIPMENT_LIBRARY_CLEAN',

  INVENTORY_SHEET: 'PARTY_INVENTORY',
  DELERIUM_SHEET: 'DELERIUM_LEDGER',
  RESOURCE_LEDGER_SHEET: 'RESOURCE_LEDGER',
  NOTES_OWNER_EMAIL: 'javajawa16@gmail.com',
  CHARACTERS_SHEET: 'CHARACTERS',
  USER_PROFILES_SHEET: 'USER_PROFILES',
  LOOKUPS_SHEET: 'LOOKUPS',
  LOG_SHEET: 'INVENTORY_LOG'
};

const APPROVED_INVENTORY_CATEGORIES = [
  'Armor / Shield',
  'Weapon',
  'Potion',
  'Scroll',
  'Wondrous Item',
  'Ammunition',
  'Tool / Gear',
  'Currency',
  'Delerium',
  'Other'
];

const DELERIUM_SIZE_VALUES = [
  'chip',
  'fragment',
  'shard',
  'crystal',
  'geode',
  'massive cluster',
  'unknown'
];

const QUICK_ADD_ITEMS = {
  health_potion:         { name: 'Health Potion',          category: 'Potion',      rarity: 'Common',  valueGp: 50,   editType: 'health potion',   terms: ['health', 'healing', 'potion'] },
  greater_health_potion: { name: 'Greater Health Potion',  category: 'Potion',      rarity: 'Uncommon',valueGp: 150,  editType: 'health potion',   terms: ['greater health', 'greater healing'] },
  gemstone:              { name: 'Gemstone',               category: 'Other',       rarity: '',        valueGp: '',   editType: 'commodity',       terms: ['gem', 'gemstone', 'jewel'] },
  art_object:            { name: 'Art Object',             category: 'Other',       rarity: '',        valueGp: '',   editType: 'commodity',       terms: ['art', 'object', 'painting', 'statue'] },
  trade_goods:           { name: 'Trade Goods',            category: 'Other',       rarity: '',        valueGp: '',   editType: 'commodity',       terms: ['trade', 'goods', 'commodity', 'commodities'] },
  rations:               { name: 'Rations',                category: 'Tool / Gear', rarity: '',        valueGp: 0.5,  editType: 'commodity',       terms: ['ration', 'rations', 'food'] },
  scroll:                { name: 'Scroll',                 category: 'Scroll',      rarity: '',        valueGp: '',   editType: 'scroll',          terms: ['scroll', 'spell scroll', 'spell'] }
};

const EQUIPMENT_HEADERS = [
  'Item ID',              // 0
  'Name',                 // 1
  'Type Raw',             // 2
  'Type Clean',           // 3
  'Category',             // 4
  'Rarity',               // 5
  'Requires Attunement',  // 6
  'Magic Item',           // 7
  'Damage',               // 8
  'Damage Versatile',     // 9
  'Properties',           // 10
  'Range',                // 11
  'AC',                   // 12
  'Strength Req',         // 13
  'Stealth Disadvantage', // 14
  'Weight',               // 15
  'Value GP',             // 16
  'Source',               // 17
  'Text / Description',   // 18
  'Search Text',          // 19
];

const INVENTORY_HEADERS = [
  'Inventory ID',
  'Item',
  'Library Item ID',
  'Category',
  'Rarity',
  'Qty',
  'Holder',
  'Shared?',
  'Identified?',
  'Attunement?',
  'Value GP',
  'Total Value GP',
  'Status',
  'Faction Relevance',
  'Risk',
  'Notes',
  'Date Added',
  'Added By'
];

const DELERIUM_HEADERS = [
  'Date',
  'Delerium Type',
  'Qty In',
  'Qty Out',
  'Net Qty',
  'Holder',
  'Reason',
  'Faction / Buyer',
  'Value Each GP',
  'Total Value GP',
  'Notes'
];

const RESOURCE_LEDGER_HEADERS = [
  'Timestamp',
  'User Email',
  'Action',
  'Resource',
  'Subtype',
  'Qty',
  'Value GP',
  'Inventory ID',
  'Item',
  'Notes',
  'Character'
];

const CHARACTERS_HEADERS = [
  'Character',
  'Player',
  'Active?',
  'Notes',
  'Email'
];

const USER_PROFILE_HEADERS = [
  'User Key',
  'Character',
  'Confirmed',
  'Created At',
  'Last Seen',
  'User Agent'
];

/*******************************************************
 * MENU
 *******************************************************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Drakkenheim Inventory')
    .addItem('Run Health Check', 'runHealthCheck')
    .addItem('Setup Inventory Tabs', 'setupInventoryTabs')
    .addItem('Add Email Column to Characters', 'addEmailColumnToCharacters')
    .addSeparator()
    .addItem('Reset Clean Equipment Library', 'resetCleanEquipmentLibrary')
    .addItem('Continue Clean Equipment Library', 'continueCleanEquipmentLibrary')
    .addSeparator()
    .addItem('Create Equipment CSV in Drive', 'createEquipmentCsvDownload')
    .addToUi();
}

function addEmailColumnToCharacters() {
  return runLogged_('addEmailColumnToCharacters', function () {
    requireAdminUser_();
    const ss    = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.CHARACTERS_SHEET);

    const lastCol = sheet.getLastColumn();
    const headers = lastCol >= 1
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String)
      : [];

    if (headers.some(h => h.trim().toLowerCase() === 'email')) {
      SpreadsheetApp.getUi().alert('Email column already exists in the CHARACTERS sheet.');
      return;
    }

    const newCol = lastCol + 1;
    ensureSheetSize_(sheet, Math.max(sheet.getLastRow(), 1), newCol);
    sheet.getRange(1, newCol).setValue('Email');

    log_('INFO', 'Email column added to CHARACTERS sheet', { column: newCol });
    SpreadsheetApp.getUi().alert('Done! "Email" column added as column ' + newCol + '. Fill in each player\'s Google account email to enable character scoping in the app.');
  });
}

/*******************************************************
 * HEALTH CHECK
 *******************************************************/

function runHealthCheck() {
  return runLogged_('runHealthCheck', function () {
    requireAdminUser_();
    const ss = getInventorySpreadsheet_();

    log_('INFO', 'Spreadsheet opened', {
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName()
    });

    const sheets = ss.getSheets().map(s => ({
      name: s.getName(),
      rows: s.getMaxRows(),
      cols: s.getMaxColumns(),
      lastRow: s.getLastRow(),
      lastCol: s.getLastColumn()
    }));

    log_('INFO', 'Available sheets', sheets);

    const source = getSheetByTrimmedName_(ss, CONFIG.SOURCE_EQUIPMENT_SHEET);
    const clean = getSheetByTrimmedName_(ss, CONFIG.EQUIPMENT_SHEET);

    log_('INFO', 'Equipment sheet status', {
      sourceExists: Boolean(source),
      cleanExists: Boolean(clean),
      sourceLastRow: source ? source.getLastRow() : null,
      sourceLastCol: source ? source.getLastColumn() : null,
      cleanLastRow: clean ? clean.getLastRow() : null,
      cleanLastCol: clean ? clean.getLastColumn() : null
    });

    Logger.log('Health check complete. Review INVENTORY_LOG.');
  });
}

/*******************************************************
 * WEB APP ENTRY
 *******************************************************/

function doGet(e) {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Drakkenheim Inventory')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/*******************************************************
 * SETUP TABS
 *******************************************************/

function setupInventoryTabs() {
  return runLogged_('setupInventoryTabs', function () {
    requireAdminUser_();
    const ss = getInventorySpreadsheet_();

    writeHeaderOnly_(getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET), INVENTORY_HEADERS);
    writeHeaderOnly_(getOrCreateSheet_(ss, CONFIG.DELERIUM_SHEET), DELERIUM_HEADERS);
    writeHeaderOnly_(getOrCreateSheet_(ss, CONFIG.RESOURCE_LEDGER_SHEET), RESOURCE_LEDGER_HEADERS);
    writeHeaderOnly_(getOrCreateSheet_(ss, PARTY_NOTES_SHEET), PARTY_CAMPAIGN_NOTES_HEADERS);
    writeHeaderOnly_(getOrCreateSheet_(ss, CONFIG.CHARACTERS_SHEET), CHARACTERS_HEADERS);
    writeHeaderOnly_(getOrCreateSheet_(ss, CONFIG.USER_PROFILES_SHEET), USER_PROFILE_HEADERS);
    setupLookupsSheet_(ss);
    setupLogSheet_(ss);

    log_('INFO', 'Inventory tabs setup complete', {
      inventorySheet: CONFIG.INVENTORY_SHEET,
      deleriumSheet: CONFIG.DELERIUM_SHEET,
      partyNotesSheet: PARTY_NOTES_SHEET,
      charactersSheet: CONFIG.CHARACTERS_SHEET,
      userProfilesSheet: CONFIG.USER_PROFILES_SHEET,
      lookupsSheet: CONFIG.LOOKUPS_SHEET
    });
  });
}

function resetAppDataSheets() {
  return runLogged_('resetAppDataSheets', function () {
    requireAdminUser_();
    const ss = getInventorySpreadsheet_();

    clearSheetToHeaders_(getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET), INVENTORY_HEADERS);
    clearSheetToHeaders_(getOrCreateSheet_(ss, CONFIG.DELERIUM_SHEET), DELERIUM_HEADERS);
    clearSheetToHeaders_(getOrCreateSheet_(ss, CONFIG.RESOURCE_LEDGER_SHEET), RESOURCE_LEDGER_HEADERS);
    clearSheetToHeaders_(getOrCreateSheet_(ss, PARTY_NOTES_SHEET), PARTY_CAMPAIGN_NOTES_HEADERS);
    clearSheetToHeaders_(getOrCreateSheet_(ss, CONFIG.LOG_SHEET), [
      'Timestamp',
      'Level',
      'Function',
      'Message',
      'Details',
      'User Email',
      'Action',
      'Item ID',
      'Item Name',
      'Old Value',
      'New Value',
      'Delta',
      'Note / Source',
      'Request Status'
    ]);
    setupLookupsSheet_(ss);

    log_('INFO', 'App data sheets reset', {
      clearedSheets: [
        CONFIG.INVENTORY_SHEET,
        CONFIG.DELERIUM_SHEET,
        CONFIG.RESOURCE_LEDGER_SHEET,
        PARTY_NOTES_SHEET,
        CONFIG.LOG_SHEET
      ],
      preservedSheets: [
        CONFIG.SOURCE_EQUIPMENT_SHEET,
        CONFIG.EQUIPMENT_SHEET,
        CONFIG.LOOKUPS_SHEET
      ]
    });
  });
}

function setupLookupsSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, CONFIG.LOOKUPS_SHEET);

  const values = [
    ['Inventory Status'],
    ['Keep'],
    ['Use Soon'],
    ['Sell'],
    ['Trade'],
    ['Identify'],
    ['Do Not Mention'],
    ['Faction Leverage'],
    ['Corvane Is Holding It For Reasons'],
    [''],
    ['Factions'],
    ['Amethyst Academy'],
    ['Hooded Lanterns'],
    ['Queen’s Men'],
    ['Knights of the Silver Order'],
    ['Followers of the Falling Fire'],
    ['Neutral / Unknown'],
    [''],
    ['Delerium Types'],
    ['Chip'],
    ['Fragment'],
    ['Shard'],
    ['Crystal'],
    ['Geode'],
    ['Massive Cluster'],
    ['Unknown']
  ];

  sheet.clearContents();
  ensureSheetSize_(sheet, values.length, 1);
  sheet.getRange(1, 1, values.length, 1).setValues(values);
}

function setupLogSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, CONFIG.LOG_SHEET);
  writeHeaderOnly_(sheet, [
    'Timestamp',
    'Level',
    'Function',
    'Message',
    'Details',
    'User Email',
    'Action',
    'Item ID',
    'Item Name',
    'Old Value',
    'New Value',
    'Delta',
    'Note / Source',
    'Request Status'
  ]);
}

/*******************************************************
 * CLEAN EQUIPMENT LIBRARY
 *******************************************************/

function resetCleanEquipmentLibrary() {
  return runLogged_('resetCleanEquipmentLibrary', function () {
    requireAdminUser_();
    const ss = getInventorySpreadsheet_();
    const source = getRequiredSheet_(ss, CONFIG.SOURCE_EQUIPMENT_SHEET);
    const clean = getOrCreateSheet_(ss, CONFIG.EQUIPMENT_SHEET);

    clean.clearContents();
    ensureSheetSize_(clean, 2, EQUIPMENT_HEADERS.length);
    clean.getRange(1, 1, 1, EQUIPMENT_HEADERS.length).setValues([EQUIPMENT_HEADERS]);

    const props = PropertiesService.getDocumentProperties();
    props.setProperty('CLEAN_LIB_NEXT_READ_ROW', '2');
    props.setProperty('CLEAN_LIB_NEXT_WRITE_ROW', '2');
    props.setProperty('CLEAN_LIB_COPIED_COUNT', '0');
    props.setProperty('CLEAN_LIB_SOURCE_LAST_ROW', String(source.getLastRow()));

    log_('INFO', 'Clean equipment library reset', {
      sourceSheet: CONFIG.SOURCE_EQUIPMENT_SHEET,
      cleanSheet: CONFIG.EQUIPMENT_SHEET,
      sourceLastRow: source.getLastRow(),
      sourceLastCol: source.getLastColumn()
    });
  });
}

function continueCleanEquipmentLibrary() {
  return runLogged_('continueCleanEquipmentLibrary', function () {
    requireAdminUser_();

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(5000)) {
      throw new Error('Another import batch is already running. Wait for it to finish before continuing.');
    }
    try {

    const started = Date.now();
    const maxRuntimeMs = 4.25 * 60 * 1000;
    const batchSize = 150;
    const readCols = 30; // wide enough to salvage pasted description columns, but still safe

    const ss = getInventorySpreadsheet_();
    const source = getRequiredSheet_(ss, CONFIG.SOURCE_EQUIPMENT_SHEET);
    const clean = getRequiredSheet_(ss, CONFIG.EQUIPMENT_SHEET);

    const props = PropertiesService.getDocumentProperties();

    let readRow = Number(props.getProperty('CLEAN_LIB_NEXT_READ_ROW') || 2);
    let writeRow = Number(props.getProperty('CLEAN_LIB_NEXT_WRITE_ROW') || 2);
    let copiedCount = Number(props.getProperty('CLEAN_LIB_COPIED_COUNT') || 0);

    const sourceLastRow = source.getLastRow();
    const sourceLastCol = source.getLastColumn();
    const actualReadCols = Math.min(readCols, Math.max(sourceLastCol, EQUIPMENT_HEADERS.length));

    log_('INFO', 'Clean batch starting', {
      readRow,
      writeRow,
      copiedCount,
      sourceLastRow,
      sourceLastCol,
      actualReadCols
    });

    let loops = 0;
    let skippedBlankName = 0;
    let copiedThisRun = 0;

    while (readRow <= sourceLastRow) {
      if (Date.now() - started > maxRuntimeMs) {
        log_('INFO', 'Stopping before timeout', {
          elapsedMs: Date.now() - started,
          nextReadRow: readRow
        });
        break;
      }

      const numRows = Math.min(batchSize, sourceLastRow - readRow + 1);
      const sourceValues = source.getRange(readRow, 1, numRows, actualReadCols).getValues();

      const cleanedRows = [];

      sourceValues.forEach(row => {
        const itemId = safeText_(row[0]);
        const name = safeText_(row[1]);

        if (!name) {
          skippedBlankName++;
          return;
        }

        const typeRaw = safeText_(row[2]);
        const rarity = safeText_(row[5]);
        const requiresAttunement = safeText_(row[6]);
        const magicItem = safeText_(row[7]);
        const weight = row[8];
        const valueRaw = row[9];
        const valueGp = row[10];
        const sourceText = safeText_(row[11]);

        let description = safeText_(row[12]);
        if (!description) {
          description = salvageDescription_(row);
        }

        const typeClean = cleanItemType_(typeRaw);
        const category = categorizeItem_(typeRaw, rarity, description);

        const searchText = [
          name,
          typeRaw,
          typeClean,
          category,
          rarity,
          sourceText
        ].join(' ').toLowerCase().trim();

        cleanedRows.push([
          itemId || makeStableItemId_(name, typeRaw, sourceText),
          name,
          typeRaw,
          typeClean,
          category,
          rarity,
          requiresAttunement || detectAttunement_(rarity, description),
          magicItem || detectMagicItem_(typeRaw, rarity, description),
          '', '', '', '', '', '', '',  // damage, damageVersatile, properties, range, ac, strengthReq, stealth
          weight,
          valueGp,
          sourceText,
          description,
          searchText
        ]);
      });

      if (cleanedRows.length) {
        ensureSheetSize_(clean, writeRow + cleanedRows.length - 1, EQUIPMENT_HEADERS.length);
        clean.getRange(writeRow, 1, cleanedRows.length, EQUIPMENT_HEADERS.length).setValues(cleanedRows);

        writeRow += cleanedRows.length;
        copiedCount += cleanedRows.length;
        copiedThisRun += cleanedRows.length;
      }

      readRow += numRows;
      loops++;

      props.setProperty('CLEAN_LIB_NEXT_READ_ROW', String(readRow));
      props.setProperty('CLEAN_LIB_NEXT_WRITE_ROW', String(writeRow));
      props.setProperty('CLEAN_LIB_COPIED_COUNT', String(copiedCount));

      SpreadsheetApp.flush();

      log_('INFO', 'Clean batch chunk complete', {
        chunk: loops,
        readThroughRow: readRow - 1,
        copiedThisChunk: cleanedRows.length,
        copiedTotal: copiedCount,
        skippedBlankName
      });
    }

    const complete = readRow > sourceLastRow;

    if (complete) {
      props.deleteProperty('CLEAN_LIB_NEXT_READ_ROW');
      props.deleteProperty('CLEAN_LIB_NEXT_WRITE_ROW');
      props.deleteProperty('CLEAN_LIB_COPIED_COUNT');
      props.deleteProperty('CLEAN_LIB_SOURCE_LAST_ROW');

      writeHeaderOnly_(clean, EQUIPMENT_HEADERS);

      log_('INFO', 'Clean library complete', {
        copiedTotal: copiedCount,
        cleanLastRow: clean.getLastRow(),
        cleanLastCol: clean.getLastColumn()
      });
    } else {
      log_('INFO', 'Clean library paused', {
        copiedThisRun,
        copiedTotal: copiedCount,
        nextReadRow: readRow,
        nextWriteRow: writeRow
      });
    }

    } finally {
      lock.releaseLock();
    }
  });
}

/*******************************************************
 * WEB APP API
 *******************************************************/

function apiSearchEquipment(query) {
  try {
    requireAllowedUser_();
    const ss = getInventorySpreadsheet_();
    const sheet = getSheetByTrimmedName_(ss, CONFIG.EQUIPMENT_SHEET);

    if (!sheet || sheet.getLastRow() < 2) {
      return { ok: false, error: 'Equipment library is unavailable.', rows: [] };
    }

    const q = String(query || '').trim().toLowerCase();

    if (q.length < 2) {
      return { ok: true, rows: [] };
    }

    // Get all data synchronously before any async operations
    const lastRow = sheet.getLastRow();
    const allData = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

    // Filter and extract matches programmatically (no Range calls)
    const matches = allData
      .map((row, idx) => ({
        itemId: safeText_(row[0]),
        name: safeText_(row[1]),
        nameToMatch: String(row[1] || '').trim().toLowerCase()
      }))
      .filter(row => row.nameToMatch.includes(q) && row.itemId && row.name)
      .slice(0, 30)
      .map(({ itemId, name }) => ({ itemId, name }));

    return { ok: true, rows: matches };
  } catch (err) {
    return publicApiError_('apiSearchEquipment', err, { rows: [] });
  }
}

function apiGetEquipmentIndex() {
  try {
    requireAllowedUser_();
    const ss = getInventorySpreadsheet_();
    const sheet = getSheetByTrimmedName_(ss, CONFIG.EQUIPMENT_SHEET);

    if (!sheet || sheet.getLastRow() < 2) {
      return { ok: false, error: 'Equipment library is unavailable.', rows: [] };
    }

    const lastRow = sheet.getLastRow();
    const values = sheet.getRange(2, 1, lastRow - 1, EQUIPMENT_HEADERS.length).getValues();
    const rows = values
      .map(equipmentRowToClientIndexItem_)
      .map(sanitizeEquipmentIndexForClient_)
      .filter(row => row.itemId && row.name);

    return { ok: true, rows };
  } catch (err) {
    return publicApiError_('apiGetEquipmentIndex', err, { rows: [] });
  }
}

function apiGetEquipmentItem(itemId) {
  try {
    requireAllowedUser_();
    const ss = getInventorySpreadsheet_();
    const item = getEquipmentItemById_(ss, itemId);

    if (!item) {
      return { ok: false, error: 'Item not found.', item: null };
    }

    return { ok: true, item: sanitizeEquipmentItemForClient_(item) };
  } catch (err) {
    return publicApiError_('apiGetEquipmentItem', err, { item: null });
  }
}

function apiSellInventoryBatch(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';
  try {
    userEmail = requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const items = payload && Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) return { ok: false, error: 'No items selected.' };

    const goldAmount = validateQuantity_(payload && payload.goldAmount, { min: 0, max: 999999 });
    const note       = validateText_(payload && payload.note, 'Note', 500);
    const character  = safeText_(payload && payload.clientCharacter);

    const ss      = getInventorySpreadsheet_();
    const sheet   = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    ensureInventoryHeaders_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);

    // Resolve rows and compute sell quantities
    const resolved = [];
    for (const entry of items) {
      const inventoryId = safeText_(entry && entry.inventoryId);
      const qtyToSell   = Math.max(0, Number(entry && entry.qtyToSell) || 0);
      if (!inventoryId || qtyToSell <= 0) continue;
      const found = getInventoryRowObjectById_(sheet, headers, inventoryId);
      if (!found) continue;
      const rowQty  = Math.max(0, Number(found.rowObj['Qty']) || 0);
      const sellQty = Math.min(qtyToSell, rowQty);
      if (sellQty <= 0) continue;
      resolved.push({ rowNumber: found.rowNumber, rowObj: found.rowObj, sellQty, rowQty,
                       itemName: safeText_(found.rowObj['Item']) });
    }
    if (!resolved.length) return { ok: false, error: 'None of the selected items were found.' };

    // Process highest rows first so row-number shifting only affects already-processed rows
    resolved.sort((a, b) => b.rowNumber - a.rowNumber);

    const soldNames = [];
    let totalUnitsSold = 0;
    for (const { rowNumber, rowObj, sellQty, rowQty, itemName } of resolved) {
      if (sellQty >= rowQty) {
        sheet.deleteRow(rowNumber);
      } else {
        const newQty   = rowQty - sellQty;
        const valueGp  = Number(rowObj['Value GP']) || 0;
        writeInventoryRow_(sheet, headers, rowNumber,
          { ...rowObj, 'Qty': newQty, 'Total Value GP': newQty * valueGp });
      }
      soldNames.push(itemName);
      totalUnitsSold += sellQty;
    }

    const sellNote = note || `Sold ${totalUnitsSold} unit${totalUnitsSold !== 1 ? 's' : ''}`;

    const uniqueNames = [...new Set(soldNames)];
    const soldLabel = uniqueNames.length === 1 ? uniqueNames[0]
      : uniqueNames.length <= 3 ? uniqueNames.join(', ')
      : `${totalUnitsSold} items`;

    let goldItem = null;
    if (goldAmount > 0) {
      const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const gRow = {
        'Inventory ID': makeInventoryId_(), 'Item': 'Gold', 'Library Item ID': '',
        'Category': 'Currency', 'Rarity': '', 'Qty': goldAmount, 'Holder': '',
        'Shared?': '', 'Identified?': '', 'Attunement?': '', 'Value GP': 1,
        'Total Value GP': goldAmount, 'Status': '', 'Faction Relevance': '', 'Risk': '',
        'Notes': sellNote, 'Date Added': new Date(), 'Added By': character
      };
      sheet.appendRow(updatedHeaders.map(h => gRow[h] !== undefined ? gRow[h] : ''));
      appendResourceLedger_({
        userEmail, action: 'ADD', resource: 'gold', subtype: 'gold',
        qty: goldAmount, valueGp: 1, inventoryId: gRow['Inventory ID'],
        item: `Gold (sold ${soldLabel})`, notes: sellNote, character
      });
      goldItem = sanitizeInventoryForClient_(gRow);
    }

    auditWrite_({ userEmail, action: 'SELL_BATCH', itemName: soldNames.join(', '),
      note: sellNote, delta: -totalUnitsSold, status: 'SUCCESS' });

    bumpSync_('inventory', payload && payload._syncClientId);
    return { ok: true, message: `Sold ${totalUnitsSold} unit${totalUnitsSold !== 1 ? 's' : ''} for ${goldAmount} gp.`, goldItem };
  } catch (err) {
    return publicApiError_('apiSellInventoryBatch', err, {});
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiGetCharacters() {
  try {
    requireAllowedUser_();
    const ss = getInventorySpreadsheet_();
    const sheet = getSheetByTrimmedName_(ss, CONFIG.CHARACTERS_SHEET);

    if (!sheet) return { ok: true, rows: [] };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [] };

    // Get specific range synchronously (not getDataRange to avoid stale references)
    const values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();

    const headers = values.shift().map(String);

    const allActiveRows = values
      .filter(row => String(row[0] || '').trim())
      .map(rowToObject_(headers))
      .filter(row => {
        const name   = safeText_(row['Character']);
        const active = safeText_(row['Active?']).toLowerCase();
        if (['n', 'no', 'false', '0'].includes(active)) return false;
        return Boolean(name);
      });

    const rows = allActiveRows
      .filter(row => !/^DM(\s|$)/i.test(safeText_(row['Character'])))
      .map(row => ({
        character: safeText_(row.Character),
        player: safeText_(row.Player),
        active: safeText_(row['Active?']),
        notes: safeText_(row.Notes)
      }));

    const dmRows = allActiveRows
      .filter(row => /^DM(\s|$)/i.test(safeText_(row['Character'])))
      .map(row => ({
        character: safeText_(row.Character),
        player: safeText_(row.Player),
        active: safeText_(row['Active?']),
        notes: safeText_(row.Notes)
      }));

    return { ok: true, rows, dmRows };
  } catch (err) {
    Logger.log('[apiGetCharacters] ERROR: ' + err.message);
    return publicApiError_('apiGetCharacters', err, { rows: [] });
  }
}

function apiGetInventorySummary() {
  return apiGetInventory();
}

/*
 * Returns the current user's character name and treasurer status.
 *
 * Two ways to set up the character mapping (in priority order):
 *
 * 1. Add an "Email" column to the CHARACTERS sheet. Put each player's
 *    Google account email in their row. Most transparent approach.
 *
 * 2. Set the Script Property PLAYER_CHARACTER_MAP to a comma-separated
 *    list of "email:CharacterName" pairs, e.g.:
 *    javajawa16@gmail.com:Corvane,other@gmail.com:Aldric
 *    (Apps Script → Project Settings → Script Properties)
 */
function apiGetMyCharacter(clientCharacterHint) {
  try {
    requireAllowedUser_();
    const profile = getUserProfileForKey_(getTemporaryUserKey_());
    if (profile && profile.character) {
      return Object.assign({ ok: true, remembered: true }, resolveIdentityForCharacter_(profile.character));
    }

    // Temp-key profile absent (first visit, key rotation, or empty key in some webview contexts).
    // Try email-based resolution first (works when email resolves, e.g. for the deployer).
    const emailIdentity = resolveIdentityForEmail_(getActiveUserEmail_());
    if (emailIdentity.character) {
      return Object.assign({ ok: true, remembered: false }, emailIdentity);
    }

    // Fall back to client-provided cached character hint (passed from localStorage on ≤24 h returns).
    if (clientCharacterHint) {
      const hintIdentity = resolveIdentityForCharacter_(clientCharacterHint);
      if (hintIdentity.character) {
        return Object.assign({ ok: true, remembered: false }, hintIdentity);
      }
    }

    return { ok: true, email: '', character: null, isTreasurer: false, isDM: false, remembered: false };
  } catch (err) {
    return publicApiError_('apiGetMyCharacter', err, { character: null, isTreasurer: false });
  }
}

function apiSetMyCharacter(character, userAgent) {
  try {
    requireAllowedUser_();
    return Object.assign({ ok: true, remembered: true }, saveUserProfile_(character, userAgent));
  } catch (err) {
    return publicApiError_('apiSetMyCharacter', err, { character: null, isTreasurer: false, isDM: false });
  }
}

function apiForgetMyCharacter() {
  try {
    requireAllowedUser_();
    const removed = deleteUserProfileForKey_(getTemporaryUserKey_());
    return { ok: true, removed };
  } catch (err) {
    return publicApiError_('apiForgetMyCharacter', err, { removed: false });
  }
}

function apiGetItemDetails(itemId) {
  return apiGetEquipmentItem(itemId);
}

function apiGetCategories() {
  try {
    requireAllowedUser_();
    return { ok: true, rows: APPROVED_INVENTORY_CATEGORIES.slice() };
  } catch (err) {
    return publicApiError_('apiGetCategories', err, { rows: [] });
  }
}

function apiGetQuickAddItems() {
  try {
    requireAllowedUser_();
    const items = Object.entries(QUICK_ADD_ITEMS).map(([key, item]) => ({
      quickAdd: true,
      quickKey: key,
      name: item.name,
      category: item.category,
      rarity: item.rarity || '',
      valueGp: item.valueGp !== undefined ? item.valueGp : '',
      terms: item.terms || [item.name.toLowerCase()]
    }));
    return { ok: true, items };
  } catch (err) {
    return publicApiError_('apiGetQuickAddItems', err, { items: [] });
  }
}

function apiLogUse(payload) {
  try {
    const userEmail = requireAllowedUser_();
    const id = validateId_(payload && payload.itemId, 'item ID');
    const note = validateText_(payload && payload.note, 'Note', 500);

    auditWrite_({
      userEmail,
      action: 'LOG_USE',
      itemId: id,
      note,
      status: 'RECORDED'
    });

    return { ok: true, message: 'Use logged.' };
  } catch (err) {
    return publicApiError_('apiLogUse', err);
  }
}

/*******************************************************
 * EXPORT
 *******************************************************/

function createEquipmentCsvDownload() {
  return runLogged_('createEquipmentCsvDownload', function () {
    requireAdminUser_();
    const ss = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.EQUIPMENT_SHEET);

    const lastRow = sheet.getLastRow();

    if (lastRow < 1) {
      throw new Error(`No data found in ${CONFIG.EQUIPMENT_SHEET}`);
    }

    const values = sheet.getRange(1, 1, lastRow, EQUIPMENT_HEADERS.length).getValues();
    const csv = values.map(row => row.map(csvEscape_).join(',')).join('\n');

    const fileName = `Drakkenheim_Equipment_Library_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss')}.csv`;
    const blob = Utilities.newBlob(csv, 'text/csv', fileName);
    const file = DriveApp.createFile(blob);

    log_('INFO', 'CSV created', {
      fileName,
      url: file.getUrl()
    });

    Logger.log(file.getUrl());
  });
}

/*******************************************************
 * CLASSIFICATION HELPERS
 *******************************************************/

function cleanItemType_(typeRaw) {
  const type = safeText_(typeRaw);

  const map = {
    'A': 'Ammunition',
    'G': 'Adventuring Gear',

    'M': 'Melee Weapon',
    'R': 'Ranged Weapon',

    'LA': 'Light Armor',
    'MA': 'Medium Armor',
    'HA': 'Heavy Armor',
    'S': 'Shield',

    'RD': 'Rod',
    'RG': 'Ring',
    'SC': 'Scroll',
    'ST': 'Staff',
    'W': 'Wondrous Item',
    'WD': 'Wand',
    'P': 'Potion',
    '$': 'Treasure'
  };

  return map[type] || type || 'Unknown';
}

function normalizeInventoryCategory_(category) {
  const value = safeText_(category).trim();
  const normalized = value.toLowerCase();

  const map = {
    'ring': 'Wondrous Item',
    'wand': 'Wondrous Item',
    'staff': 'Wondrous Item',
    'rod': 'Wondrous Item',
    'treasure': 'Other',
    'magic item': 'Wondrous Item',
    'gear': 'Tool / Gear',
    'tool / gear': 'Tool / Gear',
    'wondrous item': 'Wondrous Item',
    'armor / shield': 'Armor / Shield',
    'weapon': 'Weapon',
    'potion': 'Potion',
    'scroll': 'Scroll',
    'ammunition': 'Ammunition',
    'currency': 'Currency',
    'delerium': 'Delerium',
    'other': 'Other'
  };

  return map[normalized] || value || 'Other';
}

function normalizeDeleriumSize_(size) {
  const value = safeText_(size).trim().toLowerCase();
  if (!value) return '';

  const map = {
    'large crystal': 'geode',
    'large delerium crystal': 'geode',
    'large delirium crystal': 'geode',
    'massive cluster': 'massive cluster',
    'cluster': 'massive cluster',
    'geode': 'geode',
    'chip': 'chip',
    'fragment': 'fragment',
    'shard': 'shard',
    'crystal': 'crystal',
    'unknown': 'unknown'
  };

  return map[value] || value;
}

function categorizeItem_(typeRaw, rarity, description) {
  const typeClean = cleanItemType_(typeRaw);
  const type = typeClean.toLowerCase();
  const text = `${rarity || ''} ${description || ''}`.toLowerCase();

  if (type.includes('armor') || type.includes('shield')) return 'Armor / Shield';
  if (type.includes('ammunition')) return 'Ammunition';
  if (type.includes('weapon')) return 'Weapon';
  if (type.includes('potion')) return 'Potion';
  if (type.includes('scroll')) return 'Scroll';
  if (type.includes('ring')) return 'Wondrous Item';
  if (type.includes('wand')) return 'Wondrous Item';
  if (type.includes('staff')) return 'Wondrous Item';
  if (type.includes('rod')) return 'Wondrous Item';
  if (type.includes('wondrous')) return 'Wondrous Item';
  if (type.includes('treasure')) return 'Other';

  if (text.includes('magic item')) return 'Wondrous Item';

  return 'Tool / Gear';
}

function detectAttunement_(rarity, description) {
  const text = `${rarity || ''} ${description || ''}`.toLowerCase();
  return text.includes('requires attunement') || text.includes('attunement') ? 'Yes' : 'No';
}

function detectMagicItem_(typeRaw, rarity, description) {
  const text = `${typeRaw || ''} ${rarity || ''} ${description || ''}`.toLowerCase();

  if (rarity) return 'Yes';
  if (text.includes('magic item')) return 'Yes';
  if (text.includes('wondrous item')) return 'Yes';
  if (text.includes('requires attunement')) return 'Yes';

  return 'No';
}

/*******************************************************
 * DESCRIPTION SALVAGE
 *******************************************************/

function salvageDescription_(row) {
  for (let i = 13; i < row.length; i++) {
    const candidate = safeText_(row[i]);

    if (
      candidate.length > 40 &&
      (
        candidate.includes('Source:') ||
        candidate.includes('\n') ||
        candidate.includes('Dungeon Master') ||
        candidate.includes('Player') ||
        candidate.includes('Whenever') ||
        candidate.includes('While you') ||
        candidate.includes('while you')
      )
    ) {
      return candidate;
    }
  }

  return '';
}

/*******************************************************
 * GENERAL HELPERS
 *******************************************************/

// Cache the spreadsheet connection for the lifetime of a single script execution.
// Apps Script resets module-level vars between requests, so this is safe.
var _cachedSpreadsheet_ = null;

function getInventorySpreadsheet_() {
  if (!_cachedSpreadsheet_) {
    _cachedSpreadsheet_ = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return _cachedSpreadsheet_;
}

function getSheetByTrimmedName_(ss, targetName) {
  const target = String(targetName).trim().toLowerCase();

  return ss.getSheets().find(sh =>
    String(sh.getName()).trim().toLowerCase() === target
  ) || null;
}

function getRequiredSheet_(ss, sheetName) {
  const sheet = getSheetByTrimmedName_(ss, sheetName);

  if (!sheet) {
    throw new Error(`Missing required sheet: ${sheetName}`);
  }

  return sheet;
}

function getOrCreateSheet_(ss, name) {
  return getSheetByTrimmedName_(ss, name) || ss.insertSheet(name);
}

function writeHeaderOnly_(sheet, headers) {
  ensureSheetSize_(sheet, 1, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureHeaderRow_(sheet, headers) {
  ensureSheetSize_(sheet, 1, headers.length);
  const width = Math.max(sheet.getLastColumn(), headers.length);
  const existing = sheet.getRange(1, 1, 1, width).getValues()[0].map(h => safeText_(h));
  if (!existing.some(Boolean)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const missing = headers.filter(h => !existing.includes(h));
  if (!missing.length) return;
  sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
}

function clearSheetToHeaders_(sheet, headers) {
  sheet.clearContents();
  ensureSheetSize_(sheet, 1, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureSheetSize_(sheet, minRows, minCols) {
  const currentRows = sheet.getMaxRows();
  const currentCols = sheet.getMaxColumns();

  if (currentRows < minRows) {
    sheet.insertRowsAfter(currentRows, minRows - currentRows);
  }

  if (currentCols < minCols) {
    sheet.insertColumnsAfter(currentCols, minCols - currentCols);
  }
}

function rowToObject_(headers) {
  return function (row) {
    const obj = {};

    headers.forEach((h, i) => {
      obj[h] = row[i];
    });

    return obj;
  };
}

function equipmentRowToClientItem_(row) {
  return {
    itemId:          row[0],
    name:            row[1],
    type:            row[3],
    category:        row[4],
    rarity:          row[5],
    attunement:      row[6],
    magicItem:       row[7],
    damage:          row[8],
    damageVersatile: row[9],
    properties:      row[10],
    range:           row[11],
    ac:              row[12],
    strengthReq:     row[13],
    stealth:         row[14],
    weight:          row[15],
    valueGp:         row[16],
    description:     row[18],
  };
}

function equipmentRowToClientIndexItem_(row) {
  return {
    itemId:     row[0],
    name:       row[1],
    type:       row[3],
    category:   row[4],
    rarity:     row[5],
    attunement: row[6],
    damage:     row[8],
    properties: row[10],
    valueGp:    row[16],
    searchText: row[19],
  };
}

function makeInventoryId_() {
  return 'INV_' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function makeStableItemId_(name, typeRaw, sourceText) {
  const base = `${name}|${typeRaw}|${sourceText}`.toLowerCase();

  let hash = 0;

  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) - hash) + base.charCodeAt(i);
    hash |= 0;
  }

  return 'ITEM_' + Math.abs(hash).toString(36).toUpperCase();
}

function safeText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getConfiguredEmails_(propertyName, fallback) {
  const raw = PropertiesService.getScriptProperties().getProperty(propertyName);
  const values = raw ? raw.split(',') : (fallback || []);

  return values
    .map(value => safeText_(value).toLowerCase())
    .filter(Boolean);
}

/*
 * Returns the list of app-level admin emails (treasurer + DM).
 * Set Script Property ADMIN_EMAILS = "email1@x.com,email2@x.com"
 * Falls back to NOTES_OWNER_EMAIL if the property isn't configured.
 */
function getAdminEmails_() {
  const prop = getConfiguredEmails_('ADMIN_EMAILS', []);
  if (prop.length) return prop;
  const owner = safeText_(CONFIG.NOTES_OWNER_EMAIL).toLowerCase();
  return owner ? [owner] : [];
}

function getActiveUserEmail_() {
  return safeText_(Session.getActiveUser().getEmail()).toLowerCase();
}

function resolveIdentityForEmail_(email) {
  const normalizedEmail = safeText_(email).toLowerCase();
  const character = normalizedEmail ? getCharacterForEmail_(normalizedEmail) : null;
  return Object.assign({ email: normalizedEmail }, resolveIdentityForCharacter_(character));
}

function resolveIdentityForCharacter_(character) {
  const resolvedCharacter = safeText_(character);
  const email = resolvedCharacter ? (getEmailForCharacter_(resolvedCharacter) || '') : '';
  const isDM = /^DM(\s|$)/i.test(resolvedCharacter || '');
  const isTreasurer = isDM || getAdminEmails_().includes(email);

  return {
    email,
    character: resolvedCharacter || null,
    isTreasurer,
    isDM
  };
}

function getTemporaryUserKey_() {
  return safeText_(Session.getTemporaryActiveUserKey());
}

function ensureUserProfilesSheet_() {
  const ss = getInventorySpreadsheet_();
  const sheet = getOrCreateSheet_(ss, CONFIG.USER_PROFILES_SHEET);
  ensureHeaderRow_(sheet, USER_PROFILE_HEADERS);
  return sheet;
}

function getUserProfileForKey_(userKey) {
  const key = safeText_(userKey);
  if (!key) return null;
  const sheet = ensureUserProfilesSheet_();
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift().map(h => safeText_(h));
  const keyIdx = headers.indexOf('User Key');
  const charIdx = headers.indexOf('Character');
  const confirmedIdx = headers.indexOf('Confirmed');
  const lastSeenIdx = headers.indexOf('Last Seen');
  if (keyIdx === -1 || charIdx === -1) return null;
  const rowIndex = values.findIndex(row => safeText_(row[keyIdx]) === key);
  if (rowIndex === -1) return null;
  if (confirmedIdx !== -1 && safeText_(values[rowIndex][confirmedIdx]).toLowerCase() !== 'yes') return null;
  const sheetRow = rowIndex + 2;
  if (lastSeenIdx !== -1) sheet.getRange(sheetRow, lastSeenIdx + 1).setValue(new Date());
  return {
    rowNumber: sheetRow,
    userKey: key,
    character: safeText_(values[rowIndex][charIdx])
  };
}

function saveUserProfile_(character, userAgent) {
  const userKey = getTemporaryUserKey_();
  if (!userKey) throw new Error('Could not identify this browser session.');
  const chosenCharacter = validateCharacterChoice_(character);
  const sheet = ensureUserProfilesSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => safeText_(h));
  const existing = getUserProfileForKey_(userKey);
  const rowObj = {
    'User Key': userKey,
    'Character': chosenCharacter,
    'Confirmed': 'Yes',
    'Created At': new Date(),
    'Last Seen': new Date(),
    'User Agent': safeText_(userAgent).slice(0, 300)
  };

  if (existing && existing.rowNumber) {
    const createdIdx = headers.indexOf('Created At');
    if (createdIdx !== -1) {
      rowObj['Created At'] = sheet.getRange(existing.rowNumber, createdIdx + 1).getValue() || new Date();
    }
    sheet.getRange(existing.rowNumber, 1, 1, headers.length)
      .setValues([headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '')]);
  } else {
    sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
  }

  return resolveIdentityForCharacter_(chosenCharacter);
}

function deleteUserProfileForKey_(userKey) {
  const key = safeText_(userKey);
  if (!key) return false;
  const sheet = ensureUserProfilesSheet_();
  if (sheet.getLastRow() < 2) return false;
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift().map(h => safeText_(h));
  const keyIdx = headers.indexOf('User Key');
  if (keyIdx === -1) return false;
  const rowIndex = values.findIndex(row => safeText_(row[keyIdx]) === key);
  if (rowIndex === -1) return false;
  sheet.deleteRow(rowIndex + 2);
  return true;
}

function validateCharacterChoice_(character) {
  const chosen = safeText_(character);
  if (!chosen) throw new Error('Invalid character.');
  const ss = getInventorySpreadsheet_();
  const sheet = getSheetByTrimmedName_(ss, CONFIG.CHARACTERS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('No characters found.');
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift().map(h => safeText_(h).toLowerCase());
  const charIdx = headers.indexOf('character');
  const activeIdx = headers.indexOf('active?');
  if (charIdx === -1) throw new Error('No characters found.');
  const match = values.find(row => safeText_(row[charIdx]).toLowerCase() === chosen.toLowerCase());
  if (!match) throw new Error('Invalid character.');
  if (activeIdx !== -1) {
    const active = safeText_(match[activeIdx]).toLowerCase();
    if (['n', 'no', 'false', 'inactive', '0'].includes(active)) throw new Error('Invalid character.');
  }
  return safeText_(match[charIdx]);
}

/*
 * Returns the character name mapped to the given email, checking the
 * CHARACTERS sheet Email column first, then PLAYER_CHARACTER_MAP property.
 * Returns null if no mapping found.
 */
function getCharacterForEmail_(email) {
  try {
    const ss    = getInventorySpreadsheet_();
    const sheet = getSheetByTrimmedName_(ss, CONFIG.CHARACTERS_SHEET);
    if (sheet && sheet.getLastRow() >= 2) {
      const values  = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
      const headers = values.shift().map(String);
      const charIdx  = headers.findIndex(h => h.trim().toLowerCase() === 'character');
      const emailIdx = headers.findIndex(h => h.trim().toLowerCase() === 'email');
      if (charIdx !== -1 && emailIdx !== -1) {
        const match = values.find(r => safeText_(r[emailIdx]).toLowerCase() === email);
        if (match) return safeText_(match[charIdx]) || null;
      }
    }
    const raw = PropertiesService.getScriptProperties().getProperty('PLAYER_CHARACTER_MAP') || '';
    for (const pair of raw.split(',')) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const mapEmail = pair.slice(0, colonIdx).trim().toLowerCase();
      const mapChar  = pair.slice(colonIdx + 1).trim();
      if (mapEmail === email && mapChar) return mapChar;
    }
  } catch (_) {}
  return null;
}

/*
 * Grants access to treasurer-level operations (split gold, sell delerium).
 * Passes if the user is in ADMIN_EMAILS or their character name starts with "DM".
 * clientCharacterHint is a trust-on-good-faith hint from the client used when
 * Session.getActiveUser() cannot identify the user (known GAS limitation with
 * USER_DEPLOYING on personal Gmail accounts).
 */
function requireTreasurer_(clientCharacterHint) {
  let email = requireAllowedUser_();
  if ((!email || email === 'dev-unconfigured-user' || email === 'url-authenticated-user') && clientCharacterHint) {
    const resolved = getEmailForCharacter_(safeText_(clientCharacterHint).trim());
    if (resolved) email = resolved;
  }
  if (getAdminEmails_().includes(email)) return email;
  const character = getCharacterForEmail_(email);
  if (/^DM(\s|$)/i.test(character || '')) return email;
  throw new Error('Treasurer access required.');
}

/*
 * Reverse of getCharacterForEmail_: given a character name, returns the mapped email.
 */
function getEmailForCharacter_(character) {
  if (!character) return null;
  const charLower = character.toLowerCase();
  try {
    const ss    = getInventorySpreadsheet_();
    const sheet = getSheetByTrimmedName_(ss, CONFIG.CHARACTERS_SHEET);
    if (sheet && sheet.getLastRow() >= 2) {
      const values  = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
      const headers = values.shift().map(String);
      const charIdx  = headers.findIndex(h => h.trim().toLowerCase() === 'character');
      const emailIdx = headers.findIndex(h => h.trim().toLowerCase() === 'email');
      if (charIdx !== -1 && emailIdx !== -1) {
        const match = values.find(r => safeText_(r[charIdx]).trim().toLowerCase() === charLower);
        if (match) {
          const email = safeText_(match[emailIdx]).toLowerCase();
          if (email) return email;
        }
      }
    }
    const raw = PropertiesService.getScriptProperties().getProperty('PLAYER_CHARACTER_MAP') || '';
    for (const pair of raw.split(',')) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const mapEmail = pair.slice(0, colonIdx).trim().toLowerCase();
      const mapChar  = pair.slice(colonIdx + 1).trim();
      if (mapChar.toLowerCase() === charLower && mapEmail) return mapEmail;
    }
  } catch (_) {}
  return null;
}

function getPlayerMapEmails_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('PLAYER_CHARACTER_MAP') || '';
    return raw.split(',')
      .map(pair => {
        const i = pair.indexOf(':');
        return i !== -1 ? pair.slice(0, i).trim().toLowerCase() : '';
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function requireAllowedUser_() {
  const email = getActiveUserEmail_();

  // ALLOWED_USERS overrides; falls back to PLAYER_CHARACTER_MAP so no separate
  // allowlist config is needed — the map already enumerates all valid users.
  const explicit = getConfiguredEmails_('ALLOWED_USERS', []);
  const effectiveAllowed = explicit.length ? explicit : getPlayerMapEmails_();

  if (CONFIG.DEV_ALLOW_UNCONFIGURED_ACCESS && !effectiveAllowed.length) {
    return email || 'dev-unconfigured-user';
  }

  // With executeAs: USER_DEPLOYING on personal Gmail, Session.getActiveUser()
  // returns empty for non-deployer visitors — the web app URL is the security
  // boundary. When the app is configured (PLAYER_CHARACTER_MAP is set), allow
  // through with a placeholder so audit logs remain meaningful.
  if (!email) {
    if (effectiveAllowed.length) return 'url-authenticated-user';
    throw new Error('Access denied. App is not configured.');
  }

  if (!effectiveAllowed.length) {
    throw new Error('Access denied. App is not configured.');
  }

  if (!effectiveAllowed.includes(email)) {
    throw new Error('Access denied.');
  }

  return email;
}

function requireAdminUser_() {
  const activeEmail = getActiveUserEmail_();
  const effectiveEmail = safeText_(Session.getEffectiveUser().getEmail()).toLowerCase();
  const email = activeEmail || effectiveEmail;
  const admins = getConfiguredEmails_('ADMIN_USERS', []);
  const allowed = admins.length ? admins : getConfiguredEmails_('ALLOWED_USERS', []);

  if (CONFIG.DEV_ALLOW_UNCONFIGURED_ACCESS && !allowed.length) {
    return email || 'dev-unconfigured-admin';
  }

  if (!email || !allowed.length || !allowed.includes(email)) {
    throw new Error('Admin access denied.');
  }

  return email;
}

function publicApiError_(functionName, err, fallback) {
  log_('ERROR', `${functionName} failed`, {
    error: err.message,
    stack: err.stack
  });

  return Object.assign({
    ok: false,
    error: publicValidationError_(err)
  }, fallback || {});
}

function publicValidationError_(err) {
  const message = safeText_(err && err.message);

  if (
    /^(Access denied|Admin access denied|Treasurer access required|Invalid|Quantity|Value|Selected library item|Inventory item not found|Item not found|Not a quick-edit|Unsupported|Size)/.test(message) ||
    /too long\.$/.test(message)
  ) {
    return message;
  }

  return 'Request failed.';
}

function validateId_(value, label) {
  const id = safeText_(value);

  if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ${label}.`);
  }

  return id;
}

function validateText_(value, label, maxLength) {
  const text = safeText_(value);

  if (text.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }

  return text;
}

function validateQuantity_(value, options) {
  const opts = options || {};
  const num = Number(value);

  if (!Number.isFinite(num)) {
    throw new Error('Quantity must be numeric.');
  }

  const min = opts.min === undefined ? 0 : opts.min;
  const max = opts.max === undefined ? 999999 : opts.max;

  if (num < min || num > max) {
    throw new Error(`Quantity must be between ${min} and ${max}.`);
  }

  return num;
}

function validateMoney_(value) {
  if (value === '' || value === null || value === undefined) return '';

  const num = Number(value);

  if (!Number.isFinite(num) || num < 0 || num > 999999999) {
    throw new Error('Value must be a valid non-negative number.');
  }

  return num;
}

function normalizeOptionalMoney_(value) {
  if (value === '' || value === null || value === undefined) return '';

  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : '';
}

function sanitizeEquipmentItemForClient_(item) {
  return {
    itemId:          safeText_(item.itemId),
    name:            safeText_(item.name),
    type:            safeText_(item.type),
    category:        normalizeInventoryCategory_(item.category),
    rarity:          safeText_(item.rarity),
    attunement:      safeText_(item.attunement),
    magicItem:       safeText_(item.magicItem),
    damage:          safeText_(item.damage),
    damageVersatile: safeText_(item.damageVersatile),
    properties:      safeText_(item.properties),
    range:           safeText_(item.range),
    ac:              safeText_(item.ac),
    strengthReq:     safeText_(item.strengthReq),
    stealth:         safeText_(item.stealth),
    weight:          normalizeForClient_(item.weight),
    valueGp:         normalizeForClient_(item.valueGp),
    description:     safeText_(item.description),
  };
}

function sanitizeEquipmentIndexForClient_(item) {
  return {
    itemId:     safeText_(item.itemId),
    name:       safeText_(item.name),
    type:       safeText_(item.type),
    category:   normalizeInventoryCategory_(item.category),
    rarity:     safeText_(item.rarity),
    damage:     safeText_(item.damage),
    properties: safeText_(item.properties),
    valueGp:    normalizeForClient_(item.valueGp),
    searchText: safeText_(item.searchText),
  };
}

function sanitizeInventoryForClient_(rowObj) {
  return {
    'Inventory ID': safeText_(rowObj['Inventory ID']),
    'Item': safeText_(rowObj['Item']),
    'Library Item ID': safeText_(rowObj['Library Item ID']),
    'Category': normalizeInventoryCategory_(rowObj['Category']),
    'Rarity': safeText_(rowObj['Rarity']),
    'Qty': normalizeForClient_(rowObj['Qty']),
    'Holder': safeText_(rowObj['Holder']),
    'Value GP': normalizeForClient_(rowObj['Value GP']),
    'Total Value GP': normalizeForClient_(rowObj['Total Value GP']),
    'Faction Relevance': safeText_(rowObj['Faction Relevance']),
    'Notes': safeText_(rowObj['Notes']),
    'Date Added': normalizeForClient_(rowObj['Date Added'])
  };
}

function sanitizeResourceLedgerForClient_(rowObj) {
  return {
    'Timestamp': normalizeForClient_(rowObj['Timestamp']),
    'Action': safeText_(rowObj['Action']),
    'Resource': safeText_(rowObj['Resource']),
    'Subtype': safeText_(rowObj['Subtype']),
    'Qty': normalizeForClient_(rowObj['Qty']),
    'Value GP': normalizeForClient_(rowObj['Value GP']),
    'Inventory ID': safeText_(rowObj['Inventory ID']),
    'Item': safeText_(rowObj['Item']),
    'Notes': safeText_(rowObj['Notes']),
    'Character': safeText_(rowObj['Character'])
  };
}

function getResourceLedgerForClient_(ss, limit) {
  const sheet = getSheetByTrimmedName_(ss, CONFIG.RESOURCE_LEDGER_SHEET);

  if (!sheet || sheet.getLastRow() < 2) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = Math.min(sheet.getLastColumn(), RESOURCE_LEDGER_HEADERS.length);
  const readLimit = Math.max(1, Math.min(Number(limit) || 40, 200));
  const firstRow = Math.max(2, lastRow - readLimit + 1);
  const values = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, lastCol).getValues();

  return values
    .map(row => {
      const obj = {};
      RESOURCE_LEDGER_HEADERS.forEach((h, i) => {
        obj[h] = row[i];
      });
      return sanitizeResourceLedgerForClient_(obj);
    })
    .reverse();
}

function getEquipmentItemById_(ss, itemId) {
  const sheet = getSheetByTrimmedName_(ss, CONFIG.EQUIPMENT_SHEET);

  if (!sheet || sheet.getLastRow() < 2) return null;

  const id = validateId_(itemId, 'item ID');
  const idCell = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(id)
    .matchCase(false)
    .matchEntireCell(true)
    .findNext();

  if (!idCell) return null;

  const row = sheet.getRange(idCell.getRow(), 1, 1, EQUIPMENT_HEADERS.length).getValues()[0];
  return equipmentRowToClientItem_(row);
}

function inventoryRowToObject_(headers, row) {
  const obj = {};

  headers.forEach((h, i) => {
    obj[h] = row[i];
  });

  return obj;
}

function getInventoryRowObjectById_(sheet, headers, inventoryId) {
  const rowNumber = findInventoryRowById_(sheet, inventoryId);

  if (!rowNumber) return null;

  const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

  return {
    rowNumber,
    rowObj: inventoryRowToObject_(headers, row)
  };
}

function writeInventoryRow_(sheet, headers, rowNumber, rowObj) {
  const row = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function classifyQuickEdit_(rowObj) {
  const name = safeText_(rowObj['Item']).toLowerCase();
  const category = safeText_(rowObj['Category']).toLowerCase();

  if (/\b(platinum|pp|silver|sp|copper|cp)\b/.test(name)) {
    return '';
  }
  if (/\b(gold|gp)\b/.test(name) || category === 'currency') {
    return 'currency';
  }

  if (/health potion|potion of healing/.test(name)) {
    return 'health potion';
  }

  if (category === 'delerium' || /^(delerium|delirium)\s+(chip|fragment|shard|crystal|geode|massive\s+cluster|unknown)/i.test(rowObj['Item'] || '')) {
    return 'delerium crystal';
  }

  return '';
}

function getQuickAddDefinition_(quickKey) {
  const key = safeText_(quickKey).toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(QUICK_ADD_ITEMS, key)) {
    throw new Error('Unsupported quick-add item.');
  }

  return Object.assign({ key }, QUICK_ADD_ITEMS[key]);
}

function auditWrite_(entry) {
  try {
    const ss = getInventorySpreadsheet_();
    const sheet = getOrCreateSheet_(ss, CONFIG.LOG_SHEET);

    if (sheet.getLastRow() === 0) {
      setupLogSheet_(ss);
    }

    sheet.appendRow([
      new Date(),
      'AUDIT',
      entry.action || '',
      entry.message || '',
      JSON.stringify(entry.details || {}),
      entry.userEmail || '',
      entry.action || '',
      entry.itemId || '',
      entry.itemName || '',
      entry.oldValue === undefined ? '' : JSON.stringify(entry.oldValue),
      entry.newValue === undefined ? '' : JSON.stringify(entry.newValue),
      entry.delta === undefined ? '' : entry.delta,
      entry.note || '',
      entry.status || ''
    ]);
  } catch (err) {
    Logger.log(`Failed to write audit log: ${err.message}`);
  }
}

function appendResourceLedger_(entry) {
  try {
    const ss = getInventorySpreadsheet_();
    const sheet = getOrCreateSheet_(ss, CONFIG.RESOURCE_LEDGER_SHEET);

    if (sheet.getLastRow() === 0) {
      writeHeaderOnly_(sheet, RESOURCE_LEDGER_HEADERS);
    }

    sheet.appendRow([
      new Date(),
      entry.userEmail || '',
      entry.action || '',
      entry.resource || '',
      entry.subtype || '',
      entry.qty === undefined ? '' : entry.qty,
      entry.valueGp === undefined ? '' : entry.valueGp,
      entry.inventoryId || '',
      entry.item || '',
      entry.notes || '',
      entry.character || ''
    ]);
  } catch (err) {
    Logger.log(`Failed to write resource ledger: ${err.message}`);
  }
}

function deleteResourceLedgerRowsForInventory_(ss, inventoryId) {
  try {
    const sheet = getSheetByTrimmedName_(ss, CONFIG.RESOURCE_LEDGER_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return;
    const idCol = RESOURCE_LEDGER_HEADERS.indexOf('Inventory ID') + 1;
    const lastRow = sheet.getLastRow();
    const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]).trim() === inventoryId) {
        sheet.deleteRow(i + 2);
      }
    }
  } catch (err) {
    Logger.log(`Failed to reverse ledger entry for ${inventoryId}: ${err.message}`);
  }
}

function csvEscape_(value) {
  if (value === null || value === undefined) return '';

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/*******************************************************
 * LOGGING
 *******************************************************/

function runLogged_(functionName, callback) {
  try {
    log_('INFO', `${functionName} started`, {});
    const result = callback();
    log_('INFO', `${functionName} finished`, {});
    return result;
  } catch (err) {
    log_('ERROR', `${functionName} failed`, {
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

function log_(level, message, details) {
  const timestamp = new Date();

  const payload = {
    timestamp,
    level,
    message,
    details: details || {}
  };

  Logger.log(JSON.stringify(payload));

  try {
    const ss = getInventorySpreadsheet_();
    const sheet = getOrCreateSheet_(ss, CONFIG.LOG_SHEET);

    if (sheet.getLastRow() === 0) {
      setupLogSheet_(ss);
    }

    sheet.appendRow([
      timestamp,
      level,
      getCallingFunctionName_(),
      message,
      JSON.stringify(details || {})
    ]);
  } catch (err) {
    Logger.log(`Failed to write log sheet: ${err.message}`);
  }
}

function getCallingFunctionName_() {
  try {
    const stack = new Error().stack || '';
    const lines = stack.split('\n');

    if (lines.length >= 4) {
      return lines[3].trim();
    }

    return '';
  } catch (err) {
    return '';
  }
}

function apiGetInventory() {
  try {
    requireAllowedUser_();
    const ss = getInventorySpreadsheet_();
    const sheet = getSheetByTrimmedName_(ss, CONFIG.INVENTORY_SHEET);
    const resourceLedger = getResourceLedgerForClient_(ss, 60);

    if (!sheet || sheet.getLastRow() < 2) {
      return { ok: true, rows: [], resourceLedger };
    }

    fillMissingInventoryRarity_(sheet, ensureInventoryHeaders_(sheet));

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = values.shift().map(String);

    const rows = values
      .filter(row => row.some(v => v !== '' && v !== null))
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = normalizeForClient_(row[i]);
        });
        return sanitizeInventoryForClient_(obj);
      });

    return { ok: true, rows, resourceLedger };

  } catch (err) {
    return publicApiError_('apiGetInventory', err, { rows: [], resourceLedger: [] });
  }
}

/* ── Sync / collaborative polling ──────────────────────────────────────── */

function bumpSync_(section, clientId) {
  try {
    const key = 'SYNC_' + section.toUpperCase();
    PropertiesService.getScriptProperties().setProperties({
      [key]:          String(Date.now()),
      [key + '_BY']:  String(clientId || '')
    });
  } catch (e) { /* non-fatal */ }
}

function apiGetSyncState() {
  try {
    requireAllowedUser_();
    const props = PropertiesService.getScriptProperties().getProperties();
    return {
      ok: true,
      inventory: { ts: props['SYNC_INVENTORY'] || '0', by: props['SYNC_INVENTORY_BY'] || '' },
      notes:     { ts: props['SYNC_NOTES']     || '0', by: props['SYNC_NOTES_BY']     || '' }
    };
  } catch (e) {
    return { ok: false,
      inventory: { ts: '0', by: '' },
      notes:     { ts: '0', by: '' }
    };
  }
}

/* ── Party Notes (v2) ───────────────────────────────────────────────── */

const PARTY_CAMPAIGN_NOTES_HEADERS = [
  'Note ID','Created At','Updated At','Author',
  'Category','Title','Note','Tags','Pinned','Archived','Related Item ID'
];
const PARTY_NOTES_CATEGORIES = [
  'General','Quest','Location'
];
const PARTY_NOTES_SHEET = 'NOTES';

function ensurePartyNotesSheet_() {
  const ss = getInventorySpreadsheet_();
  let sheet = ss.getSheetByName(PARTY_NOTES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PARTY_NOTES_SHEET);
    sheet.getRange(1, 1, 1, PARTY_CAMPAIGN_NOTES_HEADERS.length).setValues([PARTY_CAMPAIGN_NOTES_HEADERS]);
    return sheet;
  }
  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  PARTY_CAMPAIGN_NOTES_HEADERS.forEach(h => {
    if (!existing.includes(h)) {
      sheet.getRange(1, existing.length + 1).setValue(h);
      existing.push(h);
    }
  });
  return sheet;
}

function makeNoteId_() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'NOTE_';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function apiGetNotes(payload) {
  try {
    requireAllowedUser_();
    const sheet = ensurePartyNotesSheet_();
    if (sheet.getLastRow() < 2) return { ok: true, notes: [] };

    const data = sheet.getDataRange().getValues();
    const hdrs = data[0].map(String);
    const i = h => hdrs.indexOf(h);
    const f = payload || {};
    const search      = (f.search || '').toLowerCase();
    const catFilter   = f.category || '';
    const relFilter   = f.relatedItemId || '';
    const pinnedOnly  = !!f.pinnedOnly;
    const inclArchived = !!f.includeArchived;

    let notes = data.slice(1)
      .filter(r => String(r[i('Note ID')] || '').trim())
      .map(r => ({
        noteId:        String(r[i('Note ID')] || ''),
        createdAt:     normalizeForClient_(r[i('Created At')]),
        updatedAt:     normalizeForClient_(r[i('Updated At')]),
        author:        String(r[i('Author')] || ''),
        category:      String(r[i('Category')] || 'General'),
        title:         String(r[i('Title')] || ''),
        note:          String(r[i('Note')] || ''),
        tags:          String(r[i('Tags')] || ''),
        pinned:        r[i('Pinned')] === true || String(r[i('Pinned')]).toLowerCase() === 'true',
        archived:      r[i('Archived')] === true || String(r[i('Archived')]).toLowerCase() === 'true',
        relatedItemId: String(r[i('Related Item ID')] || '')
      }));

    if (!inclArchived) notes = notes.filter(n => !n.archived);
    if (pinnedOnly)    notes = notes.filter(n => n.pinned);
    if (catFilter)     notes = notes.filter(n => n.category === catFilter);
    if (relFilter)     notes = notes.filter(n => n.relatedItemId === relFilter);
    if (search)        notes = notes.filter(n =>
      [n.title, n.note, n.tags, n.category].some(v => v.toLowerCase().includes(search)));

    notes.sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    return { ok: true, notes };
  } catch (e) { return publicApiError_('apiGetNotes', e, { notes: [] }); }
}

function apiCreateNote(payload) {
  const lock = LockService.getDocumentLock();
  try {
    requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };
    const sheet = ensurePartyNotesSheet_();
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const noteId = makeNoteId_();
    const author = String((payload && payload.clientCharacter) || '');
    const cat = PARTY_NOTES_CATEGORIES.includes(payload && payload.category) ? payload.category : 'General';
    const row = PARTY_CAMPAIGN_NOTES_HEADERS.map(h => {
      switch (h) {
        case 'Note ID':         return noteId;
        case 'Created At':      return now;
        case 'Updated At':      return now;
        case 'Author':          return author;
        case 'Category':        return cat;
        case 'Title':           return String((payload && payload.title) || '').slice(0, 200);
        case 'Note':            return String((payload && payload.note)  || '');
        case 'Tags':            return String((payload && payload.tags)  || '');
        case 'Pinned':          return !!(payload && payload.pinned);
        case 'Archived':        return false;
        case 'Related Item ID': return String((payload && payload.relatedItemId) || '');
        default: return '';
      }
    });
    sheet.appendRow(row);
    bumpSync_('notes', payload && payload._syncClientId);
    return { ok: true, note: {
      noteId, createdAt: now, updatedAt: now, author, category: cat,
      title: String((payload && payload.title) || ''),
      note: String((payload && payload.note) || ''),
      tags: String((payload && payload.tags) || ''),
      pinned: !!(payload && payload.pinned), archived: false,
      relatedItemId: String((payload && payload.relatedItemId) || '')
    }};
  } catch (e) { return publicApiError_('apiCreateNote', e); } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiUpdateNote(payload) {
  const lock = LockService.getDocumentLock();
  try {
    requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };
    const sheet = ensurePartyNotesSheet_();
    const data  = sheet.getDataRange().getValues();
    const hdrs  = data[0].map(String);
    const i = h => hdrs.indexOf(h);
    const rowIdx = data.findIndex((r, idx) => idx > 0 && String(r[i('Note ID')]) === String(payload && payload.noteId));
    if (rowIdx < 0) return { ok: false, error: 'Note not found.' };
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const sheetRow = rowIdx + 1;
    const patch = payload.patch || {};
    const allowed = ['Category','Title','Note','Tags','Pinned','Related Item ID'];
    allowed.forEach(field => {
      if (patch[field] === undefined) return;
      if (i(field) < 0) return;
      let val = patch[field];
      if (field === 'Category') val = PARTY_NOTES_CATEGORIES.includes(val) ? val : data[rowIdx][i('Category')];
      if (field === 'Pinned')   val = val === true || val === 'true';
      sheet.getRange(sheetRow, i(field) + 1).setValue(val);
    });
    sheet.getRange(sheetRow, i('Updated At') + 1).setValue(now);
    bumpSync_('notes', payload && payload._syncClientId);
    return { ok: true };
  } catch (e) { return publicApiError_('apiUpdateNote', e); } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiArchiveNote(payload) {
  const lock = LockService.getDocumentLock();
  try {
    requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };
    const sheet = ensurePartyNotesSheet_();
    const data  = sheet.getDataRange().getValues();
    const hdrs  = data[0].map(String);
    const i = h => hdrs.indexOf(h);
    const rowIdx = data.findIndex((r, idx) => idx > 0 && String(r[i('Note ID')]) === String(payload && payload.noteId));
    if (rowIdx < 0) return { ok: false, error: 'Note not found.' };
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const sheetRow = rowIdx + 1;
    sheet.getRange(sheetRow, i('Archived') + 1).setValue(true);
    sheet.getRange(sheetRow, i('Updated At') + 1).setValue(now);
    bumpSync_('notes', payload && payload._syncClientId);
    return { ok: true };
  } catch (e) { return publicApiError_('apiArchiveNote', e); } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiAddInventory(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();

    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ss = getInventorySpreadsheet_();
    const sheet = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);

    if (sheet.getLastRow() < 1) {
      writeHeaderOnly_(sheet, INVENTORY_HEADERS);
    }

    ensureInventoryHeaders_(sheet);

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);

    const libraryItemId = validateId_(payload && payload.libraryItemId, 'library item ID');
    const libraryItem = getEquipmentItemById_(ss, libraryItemId);

    if (!libraryItem) {
      throw new Error('Selected library item does not exist.');
    }

    const qty = validateQuantity_(payload && payload.qty === undefined ? 1 : payload.qty, { min: 1 });

    const requestedValue = payload && payload.valueGp;
    const valueGp = requestedValue === '' || requestedValue === null || requestedValue === undefined
      ? normalizeOptionalMoney_(libraryItem.valueGp)
      : validateMoney_(requestedValue);

    const totalValue = valueGp === '' ? '' : qty * valueGp;

    const rowObj = {
      'Inventory ID': makeInventoryId_(),
      'Item': validateText_(payload && payload.item ? payload.item : libraryItem.name, 'Item name', 200),
      'Library Item ID': libraryItemId,
      'Category': normalizeInventoryCategory_(payload && payload.category !== undefined ? payload.category : libraryItem.category),
      'Rarity': safeText_(payload && payload.rarity !== undefined ? payload.rarity : libraryItem.rarity),
      'Qty': qty,
      'Holder': validateText_(payload && payload.holder, 'Holder', 80),
      'Shared?': '',
      'Identified?': '',
      'Attunement?': '',
      'Value GP': valueGp,
      'Total Value GP': totalValue,
      'Status': '',
      'Faction Relevance': validateText_(payload && payload.factionRelevance, 'Faction relevance', 180),
      'Risk': '',
      'Notes': validateText_(payload && payload.notes, 'Notes', 1200),
      'Date Added': new Date(),
      'Added By': safeText_(payload && payload.clientCharacter)
    };

    const newRow = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');

    sheet.appendRow(newRow);

    auditWrite_({
      userEmail,
      action: 'ADD_INVENTORY',
      itemId: rowObj['Inventory ID'],
      itemName: rowObj['Item'],
      oldValue: null,
      newValue: sanitizeInventoryForClient_(rowObj),
      delta: qty,
      note: 'web app',
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: `Added "${rowObj['Item']}" to inventory.`,
      item: sanitizeInventoryForClient_(rowObj)
    };

  } catch (err) {
    log_('ERROR', 'apiAddInventory failed', {
      payload,
      error: err.message,
      stack: err.stack
    });

    auditWrite_({
      userEmail,
      action: 'ADD_INVENTORY',
      itemId: payload && payload.libraryItemId,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiAddCustomInventory(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();

    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ss = getInventorySpreadsheet_();
    const sheet = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);

    if (sheet.getLastRow() < 1) {
      writeHeaderOnly_(sheet, INVENTORY_HEADERS);
    }

    ensureInventoryHeaders_(sheet);

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const itemName = validateText_(payload && payload.item, 'Item', 120);

    if (!itemName) {
      throw new Error('Invalid item.');
    }

    const qty = validateQuantity_(payload && payload.qty === undefined ? 1 : payload.qty, { min: 1 });
    const category = normalizeInventoryCategory_(validateText_(payload && payload.category || 'Other', 'Category', 60) || 'Other');
    const rarity = validateText_(payload && payload.rarity, 'Rarity', 60);
    const valueGp = validateMoney_(payload && payload.valueGp);
    const totalValue = valueGp === '' ? '' : qty * valueGp;
    const rowObj = {
      'Inventory ID': makeInventoryId_(),
      'Item': itemName,
      'Library Item ID': '',
      'Category': category,
      'Rarity': rarity,
      'Qty': qty,
      'Holder': validateText_(payload && payload.holder, 'Holder', 80),
      'Shared?': '',
      'Identified?': '',
      'Attunement?': '',
      'Value GP': valueGp,
      'Total Value GP': totalValue,
      'Status': '',
      'Faction Relevance': validateText_(payload && payload.factionRelevance, 'Faction relevance', 180),
      'Risk': '',
      'Notes': validateText_(payload && payload.notes, 'Notes', 1200),
      'Date Added': new Date(),
      'Added By': safeText_(payload && payload.clientCharacter)
    };

    sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));

    auditWrite_({
      userEmail,
      action: 'ADD_CUSTOM_INVENTORY',
      itemId: rowObj['Inventory ID'],
      itemName: rowObj['Item'],
      oldValue: null,
      newValue: sanitizeInventoryForClient_(rowObj),
      delta: qty,
      note: 'custom/homebrew',
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: `Added "${rowObj['Item']}" to inventory.`,
      item: sanitizeInventoryForClient_(rowObj)
    };
  } catch (err) {
    log_('ERROR', 'apiAddCustomInventory failed', {
      payload,
      error: err.message,
      stack: err.stack
    });

    auditWrite_({
      userEmail,
      action: 'ADD_CUSTOM_INVENTORY',
      itemId: '',
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiQuickAddInventory(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();

    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const quick = getQuickAddDefinition_(payload && payload.quickKey);
    const ss = getInventorySpreadsheet_();
    const sheet = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);

    if (sheet.getLastRow() < 1) {
      writeHeaderOnly_(sheet, INVENTORY_HEADERS);
    }

    ensureInventoryHeaders_(sheet);

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const qty = validateQuantity_(payload && payload.qty === undefined ? 1 : payload.qty, { min: 1 });
    const holder = validateText_(payload && payload.holder, 'Holder', 80);
    const note = validateText_(payload && payload.notes, 'Notes', 1200);
    const faction = validateText_(payload && payload.factionRelevance, 'Faction relevance', 180);
    const valueGp = payload && payload.valueGp !== undefined && payload.valueGp !== ''
      ? validateMoney_(payload.valueGp)
      : normalizeOptionalMoney_(quick.valueGp);
    const size = normalizeDeleriumSize_(payload && payload.size);

    if (quick.editType === 'delerium crystal' && size && !DELERIUM_SIZE_VALUES.includes(size)) {
      throw new Error('Size is not allowed.');
    }

    const itemName = quick.editType === 'delerium crystal' && size
      ? `Delerium ${size.replace(/\b\w/g, char => char.toUpperCase())}`
      : quick.editType === 'scroll' && payload && payload.item
        ? validateText_(payload.item, 'Item', 200)
        : quick.name;
    const totalValue = valueGp === '' ? '' : qty * valueGp;
    const notes = [note, quick.editType === 'delerium crystal' && size ? `Size: ${size}` : '']
      .filter(Boolean)
      .join('\n');

    const rowObj = {
      'Inventory ID': makeInventoryId_(),
      'Item': itemName,
      'Library Item ID': '',
      'Category': normalizeInventoryCategory_(quick.category),
      'Rarity': quick.rarity,
      'Qty': qty,
      'Holder': holder,
      'Shared?': '',
      'Identified?': '',
      'Attunement?': '',
      'Value GP': valueGp,
      'Total Value GP': totalValue,
      'Status': '',
      'Faction Relevance': faction,
      'Risk': '',
      'Notes': notes,
      'Date Added': new Date(),
      'Added By': safeText_(payload && payload.clientCharacter)
    };

    let ledgerEntry = null;
    if (quick.editType === 'currency' || quick.editType === 'delerium crystal') {
      ledgerEntry = {
        userEmail,
        action: 'ADD',
        resource: quick.editType === 'currency' ? 'gold' : 'delerium',
        subtype: quick.editType === 'currency' ? 'gold' : (size || quick.size || 'crystal'),
        qty,
        valueGp,
        inventoryId: rowObj['Inventory ID'],
        item: rowObj['Item'],
        notes: rowObj['Notes'],
        character: safeText_(payload && payload.clientCharacter)
      };
      appendResourceLedger_(ledgerEntry);
    }

    sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));

    auditWrite_({
      userEmail,
      action: 'QUICK_ADD_INVENTORY',
      itemId: rowObj['Inventory ID'],
      itemName: rowObj['Item'],
      oldValue: null,
      newValue: sanitizeInventoryForClient_(rowObj),
      delta: qty,
      note: quick.key,
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: `Added "${rowObj['Item']}" to inventory.`,
      item: sanitizeInventoryForClient_(rowObj),
      ledgerEntry: ledgerEntry ? sanitizeResourceLedgerForClient_({
        'Timestamp': rowObj['Date Added'],
        'Action': ledgerEntry.action,
        'Resource': ledgerEntry.resource,
        'Subtype': ledgerEntry.subtype,
        'Qty': ledgerEntry.qty,
        'Value GP': ledgerEntry.valueGp,
        'Inventory ID': ledgerEntry.inventoryId,
        'Item': ledgerEntry.item,
        'Notes': ledgerEntry.notes,
        'Character': ledgerEntry.character
      }) : null
    };
  } catch (err) {
    log_('ERROR', 'apiQuickAddInventory failed', {
      payload,
      error: err.message,
      stack: err.stack
    });

    auditWrite_({
      userEmail,
      action: 'QUICK_ADD_INVENTORY',
      itemId: payload && payload.quickKey,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiDepleteResource(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const resource = safeText_(payload && payload.resource).toLowerCase();
    const amount = validateQuantity_(payload && payload.amount, { min: 0.01, max: 999999 });
    const note   = validateText_(payload && payload.note,   'Note',   500);
    const holder = validateText_(payload && payload.holder, 'Holder', 80);
    const size   = normalizeDeleriumSize_(payload && payload.size);

    if (!['gold', 'delerium'].includes(resource)) {
      throw new Error('Unsupported resource.');
    }

    if (resource === 'delerium' && size && !DELERIUM_SIZE_VALUES.includes(size)) {
      throw new Error('Size is not allowed.');
    }

    const ss = getInventorySpreadsheet_();
    const sheet = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);

    if (sheet.getLastRow() < 1) {
      writeHeaderOnly_(sheet, INVENTORY_HEADERS);
    }

    ensureInventoryHeaders_(sheet);

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const isGold = resource === 'gold';
    // Encode payer in item name so the ledger can show who spent what
    const itemName = isGold
      ? (holder ? `Gold Payment (${holder})` : 'Gold Payment')
      : `Delerium ${size || 'crystal'} Used`;
    const valueGp = isGold ? 1 : '';
    const qty = -Math.abs(amount);
    const rowObj = {
      'Inventory ID': makeInventoryId_(),
      'Item': itemName,
      'Library Item ID': '',
      'Category': isGold ? 'Currency' : 'Delerium',
      'Rarity': '',
      'Qty': qty,
      'Holder': holder,
      'Shared?': '',
      'Identified?': '',
      'Attunement?': '',
      'Value GP': valueGp,
      'Total Value GP': valueGp === '' ? '' : qty * valueGp,
      'Status': '',
      'Faction Relevance': '',
      'Risk': '',
      'Notes': [note || 'Depleted from dashboard.', !isGold && size ? `Size: ${size}` : ''].filter(Boolean).join('\n'),
      'Date Added': new Date()
    };
    const ledgerEntry = {
      userEmail,
      action: 'PAY',
      resource,
      subtype: isGold ? 'gold' : (size || 'crystal'),
      qty,
      valueGp,
      inventoryId: rowObj['Inventory ID'],
      item: rowObj['Item'],
      notes: rowObj['Notes'],
      character: safeText_(payload && payload.clientCharacter)
    };

    appendResourceLedger_(ledgerEntry);
    sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));

    auditWrite_({
      userEmail,
      action: 'DEPLETE_RESOURCE',
      itemId: rowObj['Inventory ID'],
      itemName: rowObj['Item'],
      oldValue: null,
      newValue: sanitizeInventoryForClient_(rowObj),
      delta: qty,
      note: resource,
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: `Recorded ${itemName}.`,
      item: sanitizeInventoryForClient_(rowObj),
      ledgerEntry: sanitizeResourceLedgerForClient_({
        'Timestamp': rowObj['Date Added'],
        'Action': ledgerEntry.action,
        'Resource': ledgerEntry.resource,
        'Subtype': ledgerEntry.subtype,
        'Qty': ledgerEntry.qty,
        'Value GP': ledgerEntry.valueGp,
        'Inventory ID': ledgerEntry.inventoryId,
        'Item': ledgerEntry.item,
        'Notes': ledgerEntry.notes,
        'Character': ledgerEntry.character
      })
    };
  } catch (err) {
    log_('ERROR', 'apiDepleteResource failed', {
      payload,
      error: err.message,
      stack: err.stack
    });

    auditWrite_({
      userEmail,
      action: 'DEPLETE_RESOURCE',
      itemId: payload && payload.resource,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiUpdateLedgerNote(payload) {
  const lock = LockService.getDocumentLock();
  try {
    requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ts       = safeText_(payload && payload.timestamp).trim();
    const resource = safeText_(payload && payload.resource).trim().toLowerCase();
    const entryId  = safeText_(payload && payload.entryId).trim();
    const notes    = safeText_(payload && payload.notes).slice(0, 500);

    if (!ts && !entryId) return { ok: false, error: 'Timestamp required.' };

    const ss      = getInventorySpreadsheet_();
    const sheet   = getRequiredSheet_(ss, CONFIG.RESOURCE_LEDGER_SHEET);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Entry not found.' };

    const values   = sheet.getRange(1, 1, lastRow, RESOURCE_LEDGER_HEADERS.length).getValues();
    const headers  = values[0].map(String);
    const tsCol    = headers.indexOf('Timestamp');
    const resCol   = headers.indexOf('Resource');
    const idCol    = headers.indexOf('Inventory ID');
    const notesCol = headers.indexOf('Notes');

    if (tsCol === -1 || notesCol === -1) return { ok: false, error: 'Sheet schema mismatch.' };

    const norm = v => {
      if (Object.prototype.toString.call(v) === '[object Date]')
        return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      return String(v).replace('T', ' ').slice(0, 19);
    };
    let rowIdx = -1;
    for (let i = 1; i < values.length; i++) {
      if (entryId && idCol !== -1 && String(values[i][idCol]) === entryId) {
        rowIdx = i;
        break;
      }
      if (!entryId && norm(values[i][tsCol]) === norm(ts) &&
          (!resource || String(values[i][resCol]).toLowerCase() === resource)) {
        rowIdx = i;
        break;
      }
    }

    if (rowIdx === -1) return { ok: false, error: 'Entry not found.' };
    sheet.getRange(rowIdx + 1, notesCol + 1).setValue(notes);
    bumpSync_('inventory', payload && payload._syncClientId);
    return { ok: true };
  } catch (err) {
    return publicApiError_('apiUpdateLedgerNote', err, {});
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiReceiveResource(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';
  try {
    userEmail = requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const resource = safeText_(payload && payload.resource).toLowerCase();
    const note     = validateText_(payload && payload.note, 'Note', 500);

    if (!['gold', 'delerium'].includes(resource)) throw new Error('Unsupported resource.');

    const ss     = getInventorySpreadsheet_();
    const sheet  = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);
    if (sheet.getLastRow() < 1) writeHeaderOnly_(sheet, INVENTORY_HEADERS);
    ensureInventoryHeaders_(sheet);
    const headers  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const nowStr   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const addedItems    = [];
    const ledgerEntries = [];

    if (resource === 'gold') {
      const amount = validateQuantity_(payload && payload.amount, { min: 0.01, max: 999999 });
      const holder = validateText_(payload && payload.holder, 'Holder', 80);
      const recNote = note || 'Gold received.';
      const rowObj = {
        'Inventory ID': makeInventoryId_(), 'Item': 'Gold', 'Library Item ID': '',
        'Category': 'Currency', 'Rarity': '', 'Qty': amount, 'Holder': holder,
        'Shared?': '', 'Identified?': '', 'Attunement?': '',
        'Value GP': 1, 'Total Value GP': amount,
        'Status': '', 'Faction Relevance': '', 'Risk': '',
        'Notes': recNote, 'Date Added': new Date()
      };
      sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
      appendResourceLedger_({ userEmail, action: 'RECEIVE', resource: 'gold', subtype: 'gold',
        qty: amount, valueGp: 1, inventoryId: rowObj['Inventory ID'], item: rowObj['Item'], notes: recNote,
        character: safeText_(payload && payload.clientCharacter) });
      ledgerEntries.push(sanitizeResourceLedgerForClient_({
        'Timestamp': nowStr, 'Action': 'RECEIVE', 'Resource': 'gold',
        'Subtype': 'gold', 'Qty': amount, 'Value GP': 1,
        'Inventory ID': rowObj['Inventory ID'], 'Item': rowObj['Item'], 'Notes': recNote,
        'Character': safeText_(payload && payload.clientCharacter)
      }));
      addedItems.push(sanitizeInventoryForClient_(rowObj));
    } else {
      const rawItems = Array.isArray(payload && payload.items) ? payload.items : [];
      const items = rawItems
        .map(i => ({ size: normalizeDeleriumSize_(i && i.size), qty: Math.abs(Number(i && i.qty) || 0) }))
        .filter(i => i.size && i.qty > 0 && DELERIUM_SIZE_VALUES.includes(i.size));
      if (!items.length) throw new Error('No delerium selected.');
      const recNote = note || 'Delerium received.';
      items.forEach(({ size, qty }) => {
        const rowObj = {
          'Inventory ID': makeInventoryId_(),
          'Item': 'Delerium ' + size.replace(/\b\w/g, c => c.toUpperCase()),
          'Library Item ID': '', 'Category': 'Delerium', 'Rarity': '',
          'Qty': qty, 'Holder': '',
          'Shared?': '', 'Identified?': '', 'Attunement?': '',
          'Value GP': '', 'Total Value GP': '', 'Status': '', 'Faction Relevance': '', 'Risk': '',
          'Notes': recNote, 'Date Added': new Date()
        };
        sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
        appendResourceLedger_({ userEmail, action: 'RECEIVE', resource: 'delerium', subtype: size,
          qty, valueGp: '', inventoryId: rowObj['Inventory ID'], item: rowObj['Item'], notes: recNote,
          character: safeText_(payload && payload.clientCharacter) });
        ledgerEntries.push(sanitizeResourceLedgerForClient_({
          'Timestamp': nowStr, 'Action': 'RECEIVE', 'Resource': 'delerium',
          'Subtype': size, 'Qty': qty, 'Value GP': '',
          'Inventory ID': rowObj['Inventory ID'], 'Item': rowObj['Item'], 'Notes': recNote,
          'Character': safeText_(payload && payload.clientCharacter)
        }));
        addedItems.push(sanitizeInventoryForClient_(rowObj));
      });
    }

    auditWrite_({ userEmail, action: 'RECEIVE_RESOURCE', note: resource, status: 'SUCCESS' });
    bumpSync_('inventory', payload && payload._syncClientId);
    return { ok: true, items: addedItems, ledgerEntries };
  } catch (err) {
    return publicApiError_('apiReceiveResource', err, { items: [], ledgerEntries: [] });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiSellInventoryItem(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';
  try {
    userEmail = requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const inventoryId = validateId_(payload && payload.inventoryId, 'inventory ID');
    const goldAmount  = validateQuantity_(payload && payload.goldAmount, { min: 0, max: 999999 });
    const note        = validateText_(payload && payload.note, 'Note', 500);

    const ss    = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    ensureInventoryHeaders_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);

    const found = getInventoryRowObjectById_(sheet, headers, inventoryId);
    if (!found) return { ok: false, error: 'Item not found.' };

    const itemName = safeText_(found.rowObj['Item']);
    const holder   = safeText_(found.rowObj['Holder']);

    let goldItem = null;
    if (goldAmount > 0) {
      const sellNote = note || `Sold ${itemName}`;
      const gRow = {
        'Inventory ID': makeInventoryId_(), 'Item': 'Gold', 'Library Item ID': '',
        'Category': 'Currency', 'Rarity': '', 'Qty': goldAmount,
        'Holder': holder,
        'Shared?': '', 'Identified?': '', 'Attunement?': '', 'Value GP': 1,
        'Total Value GP': goldAmount, 'Status': '', 'Faction Relevance': '', 'Risk': '',
        'Notes': sellNote, 'Date Added': new Date()
      };
      sheet.appendRow(headers.map(h => gRow[h] !== undefined ? gRow[h] : ''));
      appendResourceLedger_({ userEmail, action: 'ADD', resource: 'gold', subtype: 'gold',
        qty: goldAmount, valueGp: 1, inventoryId: gRow['Inventory ID'],
        item: `Gold (sold ${itemName})`, notes: sellNote,
        character: safeText_(payload && payload.clientCharacter) });
      goldItem = sanitizeInventoryForClient_(gRow);
    }

    sheet.deleteRow(found.rowNumber);

    auditWrite_({ userEmail, action: 'SELL_ITEM', itemId: inventoryId,
      itemName, note: note || `Sold for ${goldAmount} gp`, status: 'SUCCESS' });

    bumpSync_('inventory', payload && payload._syncClientId);
    return { ok: true, message: `Sold "${itemName}" for ${goldAmount} gp.`, goldItem };
  } catch (err) {
    return publicApiError_('apiSellInventoryItem', err, { goldItem: null });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiSellDelerium(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';
  try {
    userEmail = requireTreasurer_(payload && payload.clientCharacter);
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const rawItems   = Array.isArray(payload && payload.items) ? payload.items : [];
    const goldAmount = validateQuantity_(payload && payload.goldAmount, { min: 0, max: 999999 });
    const note       = validateText_(payload && payload.note, 'Note', 500);

    const items = rawItems
      .map(i => ({ size: normalizeDeleriumSize_(i && i.size), qty: Math.abs(Number(i && i.qty) || 0) }))
      .filter(i => i.size && i.qty > 0 && DELERIUM_SIZE_VALUES.includes(i.size));

    if (!items.length) throw new Error('No delerium selected.');

    const ss      = getInventorySpreadsheet_();
    const sheet   = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);
    if (sheet.getLastRow() < 1) writeHeaderOnly_(sheet, INVENTORY_HEADERS);
    ensureInventoryHeaders_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const sellNote = note || `Sold for ${goldAmount} gp`;
    const nowStr   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const ledgerEntries = [];

    const createdItems = items.map(({ size, qty }) => {
      const rowObj = {
        'Inventory ID': makeInventoryId_(),
        'Item': `Delerium ${size.replace(/\b\w/g, c => c.toUpperCase())}`,
        'Library Item ID': '', 'Category': 'Delerium', 'Rarity': '',
        'Qty': -qty, 'Holder': '',
        'Shared?': '', 'Identified?': '', 'Attunement?': '', 'Value GP': '',
        'Total Value GP': '', 'Status': '', 'Faction Relevance': '', 'Risk': '',
        'Notes': sellNote, 'Date Added': new Date()
      };
      sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
      appendResourceLedger_({ userEmail, action: 'SELL', resource: 'delerium', subtype: size,
        qty: -qty, valueGp: '', inventoryId: rowObj['Inventory ID'],
        item: rowObj['Item'], notes: sellNote,
        character: safeText_(payload && payload.clientCharacter) });
      ledgerEntries.push(sanitizeResourceLedgerForClient_({
        'Timestamp': nowStr, 'Action': 'SELL', 'Resource': 'delerium',
        'Subtype': size, 'Qty': -qty, 'Value GP': '',
        'Inventory ID': rowObj['Inventory ID'], 'Item': rowObj['Item'], 'Notes': sellNote,
        'Character': safeText_(payload && payload.clientCharacter)
      }));
      return sanitizeInventoryForClient_(rowObj);
    });

    let goldItem = null;
    if (goldAmount > 0) {
      const gRow = {
        'Inventory ID': makeInventoryId_(), 'Item': 'Gold', 'Library Item ID': '',
        'Category': 'Currency', 'Rarity': '', 'Qty': goldAmount, 'Holder': '',
        'Shared?': '', 'Identified?': '', 'Attunement?': '', 'Value GP': 1,
        'Total Value GP': goldAmount, 'Status': '', 'Faction Relevance': '', 'Risk': '',
        'Notes': sellNote, 'Date Added': new Date()
      };
      sheet.appendRow(headers.map(h => gRow[h] !== undefined ? gRow[h] : ''));
      appendResourceLedger_({ userEmail, action: 'ADD', resource: 'gold', subtype: 'gold',
        qty: goldAmount, valueGp: 1, inventoryId: gRow['Inventory ID'],
        item: 'Gold (delerium sale)', notes: sellNote,
        character: safeText_(payload && payload.clientCharacter) });
      ledgerEntries.push(sanitizeResourceLedgerForClient_({
        'Timestamp': nowStr, 'Action': 'ADD', 'Resource': 'gold',
        'Subtype': 'gold', 'Qty': goldAmount, 'Value GP': 1,
        'Inventory ID': gRow['Inventory ID'], 'Item': 'Gold (delerium sale)', 'Notes': sellNote,
        'Character': safeText_(payload && payload.clientCharacter)
      }));
      goldItem = sanitizeInventoryForClient_(gRow);
    }

    auditWrite_({ userEmail, action: 'SELL_DELERIUM',
      newValue: { items, goldAmount }, note: sellNote, status: 'SUCCESS' });

    bumpSync_('inventory', payload && payload._syncClientId);
    return { ok: true, message: `Sold delerium for ${goldAmount} gp.`, items: createdItems, goldItem, ledgerEntries };
  } catch (err) {
    return publicApiError_('apiSellDelerium', err, { items: [], goldItem: null });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiSplitGold(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';
  try {
    userEmail = requireTreasurer_(payload && payload.clientCharacter);
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const amount = validateQuantity_(payload && payload.amount, { min: 0.01, max: 999999 });
    const note   = validateText_(payload && payload.note, 'Note', 500);

    const ss        = getInventorySpreadsheet_();
    const charSheet = getSheetByTrimmedName_(ss, CONFIG.CHARACTERS_SHEET);
    if (!charSheet || charSheet.getLastRow() < 2) throw new Error('No characters found.');

    const charValues  = charSheet.getRange(1, 1, charSheet.getLastRow(), charSheet.getLastColumn()).getValues();
    const charHeaders = charValues.shift().map(String);
    const charRows    = charValues
      .filter(row => String(row[0] || '').trim())
      .map(rowToObject_(charHeaders))
      .filter(row => {
        const name   = safeText_(row['Character']);
        const active = safeText_(row['Active?']).toLowerCase();
        if (/^DM(\s|$)/i.test(name)) return false;
        if (['n', 'no', 'false', '0'].includes(active)) return false;
        return Boolean(name);
      })
      .map(row => safeText_(row['Character']))
      .filter(Boolean);

    if (!charRows.length) throw new Error('No characters found.');

    const perMember  = Math.floor(amount / charRows.length);
    const remainder  = Math.round((amount - perMember * charRows.length) * 100) / 100;
    if (perMember <= 0) throw new Error('Amount is too small to split among all members.');
    const mathStr    = `${amount} ÷ ${charRows.length} = ${perMember} gp per` +
                       (remainder > 0 ? `, ${remainder} gp to pool` : '');
    const splitNote  = note ? `${note} (${mathStr})` : mathStr;
    const nowStr     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const ledgerEntries = [];

    const invSheet = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);
    if (invSheet.getLastRow() < 1) writeHeaderOnly_(invSheet, INVENTORY_HEADERS);
    ensureInventoryHeaders_(invSheet);
    const headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0].map(String);

    // Deduct total from party pool first (Holder = '' = unassigned pool)
    const poolDeduct = {
      'Inventory ID':    makeInventoryId_(),
      'Item':            'Gold',
      'Library Item ID': '',
      'Category':        'Currency',
      'Rarity':          '',
      'Qty':             -amount,
      'Holder':          '',
      'Shared?': '', 'Identified?': '', 'Attunement?': '',
      'Value GP':        1,
      'Total Value GP':  -amount,
      'Status': '', 'Faction Relevance': '', 'Risk': '',
      'Notes':           splitNote,
      'Date Added':      new Date()
    };
    invSheet.appendRow(headers.map(h => poolDeduct[h] !== undefined ? poolDeduct[h] : ''));
    appendResourceLedger_({ userEmail, action: 'SPLIT_DEDUCT', resource: 'gold', subtype: 'gold',
      qty: -amount, valueGp: 1, inventoryId: poolDeduct['Inventory ID'],
      item: 'Gold (party pool deduct)', notes: splitNote,
      character: safeText_(payload && payload.clientCharacter) });
    ledgerEntries.push(sanitizeResourceLedgerForClient_({ 'Timestamp': nowStr, 'Action': 'SPLIT_DEDUCT', 'Resource': 'gold',
      'Subtype': 'gold', 'Qty': -amount, 'Value GP': 1,
      'Inventory ID': poolDeduct['Inventory ID'], 'Item': 'Gold (party pool deduct)', 'Notes': splitNote,
      'Character': safeText_(payload && payload.clientCharacter) }));

    // Credit each member their share (Holder = character name)
    const items = charRows.map(character => {
      const rowObj = {
        'Inventory ID':    makeInventoryId_(),
        'Item':            'Gold',
        'Library Item ID': '',
        'Category':        'Currency',
        'Rarity':          '',
        'Qty':             perMember,
        'Holder':          character,
        'Shared?': '', 'Identified?': '', 'Attunement?': '',
        'Value GP':        1,
        'Total Value GP':  perMember,
        'Status': '', 'Faction Relevance': '', 'Risk': '',
        'Notes':           splitNote,
        'Date Added':      new Date()
      };
      invSheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
      appendResourceLedger_({ userEmail, action: 'SPLIT', resource: 'gold', subtype: 'gold',
        qty: perMember, valueGp: 1, inventoryId: rowObj['Inventory ID'],
        item: `Gold (${character})`, notes: splitNote,
        character: safeText_(payload && payload.clientCharacter) });
      ledgerEntries.push(sanitizeResourceLedgerForClient_({ 'Timestamp': nowStr, 'Action': 'SPLIT', 'Resource': 'gold',
        'Subtype': 'gold', 'Qty': perMember, 'Value GP': 1,
        'Inventory ID': rowObj['Inventory ID'], 'Item': `Gold (${character})`, 'Notes': splitNote,
        'Character': safeText_(payload && payload.clientCharacter) }));
      return sanitizeInventoryForClient_(rowObj);
    });

    // Return excess to party pool if amount didn't divide evenly
    let remainderItem = null;
    if (remainder > 0) {
      const remRow = {
        'Inventory ID': makeInventoryId_(), 'Item': 'Gold', 'Library Item ID': '',
        'Category': 'Currency', 'Rarity': '', 'Qty': remainder, 'Holder': '',
        'Shared?': '', 'Identified?': '', 'Attunement?': '', 'Value GP': 1,
        'Total Value GP': remainder, 'Status': '', 'Faction Relevance': '', 'Risk': '',
        'Notes': splitNote, 'Date Added': new Date()
      };
      invSheet.appendRow(headers.map(h => remRow[h] !== undefined ? remRow[h] : ''));
      appendResourceLedger_({ userEmail, action: 'SPLIT_REMAINDER', resource: 'gold', subtype: 'gold',
        qty: remainder, valueGp: 1, inventoryId: remRow['Inventory ID'],
        item: 'Gold (remainder to pool)', notes: splitNote,
        character: safeText_(payload && payload.clientCharacter) });
      ledgerEntries.push(sanitizeResourceLedgerForClient_({ 'Timestamp': nowStr, 'Action': 'SPLIT_REMAINDER', 'Resource': 'gold',
        'Subtype': 'gold', 'Qty': remainder, 'Value GP': 1,
        'Inventory ID': remRow['Inventory ID'], 'Item': 'Gold (remainder to pool)', 'Notes': splitNote,
        'Character': safeText_(payload && payload.clientCharacter) }));
      remainderItem = sanitizeInventoryForClient_(remRow);
    }

    auditWrite_({ userEmail, action: 'SPLIT_GOLD', itemName: 'Gold Split',
      newValue: { amount, perMember, remainder, members: charRows.length }, note, status: 'SUCCESS' });

    const message = `${perMember} gp each × ${charRows.length}` +
                    (remainder > 0 ? `, ${remainder} gp to pool` : '') +
                    ` (${mathStr})`;
    bumpSync_('inventory', payload && payload._syncClientId);
    return { ok: true, message,
      items, poolDeduct: sanitizeInventoryForClient_(poolDeduct), ledgerEntries, remainderItem };
  } catch (err) {
    return publicApiError_('apiSplitGold', err, { items: [] });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiSendGoldToMember(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';
  try {
    userEmail = requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const amount     = validateQuantity_(payload && payload.amount, { min: 0.01, max: 999999 });
    const character  = validateText_(payload && payload.character,  'Character',   80);
    const note       = validateText_(payload && payload.note,       'Note',       500);
    const fromHolder = validateText_(payload && payload.fromHolder, 'From holder', 80);
    if (!character) throw new Error('Invalid character.');
    if (/^DM(\s|$)/i.test(character)) throw new Error('DM is not a party member and cannot receive gold.');

    const ss     = getInventorySpreadsheet_();
    const sheet  = getOrCreateSheet_(ss, CONFIG.INVENTORY_SHEET);
    if (sheet.getLastRow() < 1) writeHeaderOnly_(sheet, INVENTORY_HEADERS);
    ensureInventoryHeaders_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);

    const rowObj = {
      'Inventory ID':    makeInventoryId_(),
      'Item':            'Gold',
      'Library Item ID': '',
      'Category':        'Currency',
      'Rarity':          '',
      'Qty':             amount,
      'Holder':          character,
      'Shared?': '', 'Identified?': '', 'Attunement?': '',
      'Value GP':        1,
      'Total Value GP':  amount,
      'Status': '', 'Faction Relevance': '', 'Risk': '',
      'Notes':           note || `Sent to ${character}`,
      'Date Added':      new Date()
    };
    sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
    appendResourceLedger_({ userEmail, action: 'SEND', resource: 'gold', subtype: 'gold',
      qty: amount, valueGp: 1, inventoryId: rowObj['Inventory ID'],
      item: `Gold → ${character}`, notes: rowObj['Notes'],
      character: safeText_(payload && payload.clientCharacter) });

    // Deduct from the source (party pool or sender's personal gold)
    const deductHolder = fromHolder || '';
    const deductAction = fromHolder ? 'PERSONAL_SEND_DEDUCT' : 'SEND_DEDUCT';
    const deductItem   = fromHolder
      ? `Gold → ${character} (from ${fromHolder})`
      : `Gold pool deduct → ${character}`;
    const poolDeduct = {
      'Inventory ID': makeInventoryId_(), 'Item': deductItem, 'Library Item ID': '',
      'Category': 'Currency', 'Rarity': '', 'Qty': -amount, 'Holder': deductHolder,
      'Shared?': '', 'Identified?': '', 'Attunement?': '', 'Value GP': 1,
      'Total Value GP': -amount, 'Status': '', 'Faction Relevance': '', 'Risk': '',
      'Notes': note || `Sent to ${character}`, 'Date Added': new Date()
    };
    sheet.appendRow(headers.map(h => poolDeduct[h] !== undefined ? poolDeduct[h] : ''));
    appendResourceLedger_({ userEmail, action: deductAction, resource: 'gold', subtype: 'gold',
      qty: -amount, valueGp: 1, inventoryId: poolDeduct['Inventory ID'],
      item: deductItem, notes: poolDeduct['Notes'],
      character: safeText_(payload && payload.clientCharacter) });

    auditWrite_({ userEmail, action: 'SEND_GOLD', itemId: rowObj['Inventory ID'],
      itemName: `Gold → ${character}`, delta: amount, note, status: 'SUCCESS' });

    const ledgerEntry = sanitizeResourceLedgerForClient_({
      'Timestamp': Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      'Action': deductAction, 'Resource': 'gold', 'Subtype': 'gold',
      'Qty': -amount, 'Value GP': 1,
      'Inventory ID': poolDeduct['Inventory ID'],
      'Item': deductItem,
      'Notes': poolDeduct['Notes'],
      'Character': safeText_(payload && payload.clientCharacter)
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return { ok: true, message: `Sent ${amount} gp to ${character}.`,
      item: sanitizeInventoryForClient_(rowObj), poolDeduct: sanitizeInventoryForClient_(poolDeduct),
      ledgerEntry };
  } catch (err) {
    return publicApiError_('apiSendGoldToMember', err, { item: null });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function apiUpdateInventory(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();

    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ss = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    const inventoryId = validateId_(payload && payload.inventoryId, 'inventory ID');

    ensureInventoryHeaders_(sheet);

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);

    const found = getInventoryRowObjectById_(sheet, headers, inventoryId);

    if (!found) {
      return { ok: false, error: 'Inventory item not found.' };
    }

    const existingObj = found.rowObj;

    const qty = validateQuantity_(payload && payload.qty === undefined ? existingObj['Qty'] : payload.qty, { min: 1 });
    const valueGp = validateMoney_(payload && payload.valueGp === undefined ? existingObj['Value GP'] : payload.valueGp);
    const totalValue = valueGp === '' ? '' : qty * valueGp;

    const rowObj = {
      ...existingObj,
      'Inventory ID': inventoryId,
      'Item': validateText_(payload && payload.item === undefined ? existingObj['Item'] : payload.item, 'Item name', 200),
      'Category': normalizeInventoryCategory_(payload && payload.category === undefined ? existingObj['Category'] : payload.category),
      'Rarity': validateText_(payload && payload.rarity === undefined ? existingObj['Rarity'] : payload.rarity, 'Rarity', 60),
      'Qty': qty,
      'Holder': validateText_(payload && payload.holder === undefined ? existingObj['Holder'] : payload.holder, 'Holder', 80),
      'Value GP': valueGp,
      'Total Value GP': totalValue,
      'Faction Relevance': validateText_(payload && payload.factionRelevance === undefined ? existingObj['Faction Relevance'] : payload.factionRelevance, 'Faction relevance', 180),
      'Notes': validateText_(payload && payload.notes === undefined ? existingObj['Notes'] : payload.notes, 'Notes', 1200)
    };

    writeInventoryRow_(sheet, headers, found.rowNumber, rowObj);

    auditWrite_({
      userEmail,
      action: 'UPDATE_INVENTORY',
      inventoryId,
      itemId: inventoryId,
      itemName: rowObj['Item'],
      oldValue: sanitizeInventoryForClient_(existingObj),
      newValue: sanitizeInventoryForClient_(rowObj),
      delta: qty - Number(existingObj['Qty'] || 0),
      note: 'web app',
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: `Updated "${rowObj['Item']}".`
    };
  } catch (err) {
    log_('ERROR', 'apiUpdateInventory failed', {
      payload,
      error: err.message,
      stack: err.stack
    });

    auditWrite_({
      userEmail,
      action: 'UPDATE_INVENTORY',
      itemId: payload && payload.inventoryId,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiDeleteInventory(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';
  // Accept either a bare ID string (legacy) or a payload object
  const inventoryId = (payload && typeof payload === 'object') ? payload.inventoryId : payload;

  try {
    userEmail = requireAllowedUser_();

    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ss = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    const id = validateId_(inventoryId, 'inventory ID');
    ensureInventoryHeaders_(sheet);

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const found = getInventoryRowObjectById_(sheet, headers, id);

    if (!found) {
      return { ok: false, error: 'Inventory item not found.' };
    }

    sheet.deleteRow(found.rowNumber);

    if (payload && payload.reverseLedgerEntry) {
      deleteResourceLedgerRowsForInventory_(ss, id);
    }

    auditWrite_({
      userEmail,
      action: 'DELETE_INVENTORY',
      itemId: id,
      itemName: found.rowObj['Item'],
      oldValue: sanitizeInventoryForClient_(found.rowObj),
      newValue: null,
      note: 'web app',
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: 'Inventory item deleted.'
    };
  } catch (err) {
    log_('ERROR', 'apiDeleteInventory failed', {
      inventoryId,
      error: err.message,
      stack: err.stack
    });

    auditWrite_({
      userEmail,
      action: 'DELETE_INVENTORY',
      itemId: inventoryId,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiCombineInventoryItems(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ss = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    ensureInventoryHeaders_(sheet);

    const sourceId = validateId_(payload && payload.sourceId, 'source inventory ID');
    const targetId = validateId_(payload && payload.targetId, 'target inventory ID');

    if (sourceId === targetId) {
      throw new Error('Source and target must be different items.');
    }

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);

    const source = getInventoryRowObjectById_(sheet, headers, sourceId);
    const target = getInventoryRowObjectById_(sheet, headers, targetId);

    if (!source || !target) {
      return { ok: false, error: 'Inventory item not found.' };
    }

    if (
      safeText_(source.rowObj['Item']).trim().toLowerCase() !== safeText_(target.rowObj['Item']).trim().toLowerCase() ||
      safeText_(source.rowObj['Category']).trim().toLowerCase() !== safeText_(target.rowObj['Category']).trim().toLowerCase() ||
      safeText_(source.rowObj['Rarity']).trim().toLowerCase() !== safeText_(target.rowObj['Rarity']).trim().toLowerCase()
    ) {
      throw new Error('Only matching items can be combined.');
    }

    const sourceQty = Number(source.rowObj['Qty'] || 0);
    const targetQty = Number(target.rowObj['Qty'] || 0);
    const combinedQty = validateQuantity_(sourceQty + targetQty, { min: 1 });

    const merged = Object.assign({}, target.rowObj, {
      'Qty': combinedQty
    });

    const sourceValue = validateMoney_(source.rowObj['Value GP']);
    const targetValue = validateMoney_(merged['Value GP']);
    const valueMismatch = sourceValue !== '' && targetValue !== '' && sourceValue !== targetValue;
    merged['Total Value GP'] = targetValue === '' ? '' : combinedQty * targetValue;

    const sourceHolder = safeText_(source.rowObj['Holder']);
    const targetHolder = safeText_(target.rowObj['Holder']);
    if (sourceHolder && targetHolder && sourceHolder !== targetHolder) {
      merged['Holder'] = 'Multiple';
    } else if (!targetHolder) {
      merged['Holder'] = sourceHolder;
    }

    const sourceFaction = safeText_(source.rowObj['Faction Relevance']);
    const targetFaction = safeText_(target.rowObj['Faction Relevance']);
    if (sourceFaction && targetFaction && sourceFaction !== targetFaction) {
      merged['Faction Relevance'] = targetFaction;
    } else if (!targetFaction) {
      merged['Faction Relevance'] = sourceFaction;
    }

    const sourceNotes = safeText_(source.rowObj['Notes']).trim();
    const targetNotes = safeText_(target.rowObj['Notes']).trim();
    if (sourceNotes && !targetNotes) {
      merged['Notes'] = sourceNotes;
    } else if (sourceNotes && targetNotes && sourceNotes !== targetNotes) {
      merged['Notes'] = `${targetNotes}\n\n${sourceNotes}`;
    }

    sheet.deleteRow(source.rowNumber);
    const adjustedTargetRow = target.rowNumber > source.rowNumber ? target.rowNumber - 1 : target.rowNumber;
    writeInventoryRow_(sheet, headers, adjustedTargetRow, merged);

    auditWrite_({
      userEmail,
      action: 'COMBINE_INVENTORY',
      itemId: targetId,
      itemName: merged['Item'],
      oldValue: {
        source: sanitizeInventoryForClient_(source.rowObj),
        target: sanitizeInventoryForClient_(target.rowObj)
      },
      newValue: sanitizeInventoryForClient_(merged),
      delta: sourceQty,
      note: `Combined ${sourceId} into ${targetId}`,
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: valueMismatch
        ? `Combined "${merged['Item']}" (values differed — kept ${targetValue} gp/unit from target).`
        : `Combined "${merged['Item']}".`,
      item: sanitizeInventoryForClient_(merged),
      removedId: sourceId
    };
  } catch (err) {
    auditWrite_({
      userEmail,
      action: 'COMBINE_INVENTORY',
      itemId: payload && payload.targetId,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiGetCurrencyQuickEdit(itemId) {
  try {
    requireAllowedUser_();

    const ss = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    ensureInventoryHeaders_(sheet);

    const id = validateId_(itemId, 'item ID');
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const found = getInventoryRowObjectById_(sheet, headers, id);

    if (!found) {
      return { ok: false, error: 'Inventory item not found.', item: null };
    }

    const editType = classifyQuickEdit_(found.rowObj);

    if (!editType) {
      return { ok: false, error: 'Not a quick-edit item.', item: null };
    }

    return {
      ok: true,
      item: {
        itemId: id,
        itemName: safeText_(found.rowObj['Item']),
        editType,
        quantity: normalizeForClient_(found.rowObj['Qty']),
        holder: safeText_(found.rowObj['Holder']),
        currentSize: editType === 'delerium crystal' ? normalizeDeleriumSize_(found.rowObj['Item']) : '',
        sizeOptions: editType === 'delerium crystal' ? DELERIUM_SIZE_VALUES.slice() : []
      }
    };
  } catch (err) {
    return publicApiError_('apiGetCurrencyQuickEdit', err, { item: null });
  }
}

function apiAdjustCurrency(payload) {
  const quick = apiGetCurrencyQuickEdit(payload && payload.itemId);

  if (!quick.ok || !quick.item || quick.item.editType !== 'currency') {
    return { ok: false, error: 'Unsupported quick-edit item.' };
  }

  return apiAdjustInventory(payload);
}

function apiAdjustInventory(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();

    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ss = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    ensureInventoryHeaders_(sheet);

    const id = validateId_(payload && payload.itemId, 'item ID');
    const delta = validateQuantity_(payload && payload.delta, { min: -999999, max: 999999 });
    const note = validateText_(payload && payload.note, 'Note', 500);
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const found = getInventoryRowObjectById_(sheet, headers, id);

    if (!found) {
      return { ok: false, error: 'Inventory item not found.' };
    }

    const quickType = classifyQuickEdit_(found.rowObj);

    const oldQty = Number(found.rowObj['Qty'] || 0);
    const newQty = validateQuantity_(oldQty + delta);
    const rowObj = Object.assign({}, found.rowObj, { 'Qty': newQty });

    if (quickType === 'delerium crystal') {
      const size = normalizeDeleriumSize_(payload && payload.size);

      if (size && !DELERIUM_SIZE_VALUES.includes(size)) {
        throw new Error('Size is not allowed.');
      }

      if (size) {
        rowObj['Item'] = `Delerium ${size.replace(/\b\w/g, c => c.toUpperCase())}`;
        // Note intentionally goes to the ledger only — not overwritten on the row
      }
    }

    const valueGp = validateMoney_(rowObj['Value GP']);
    rowObj['Total Value GP'] = valueGp === '' ? '' : newQty * valueGp;

    writeInventoryRow_(sheet, headers, found.rowNumber, rowObj);

    let ledgerEntry = null;
    if (quickType === 'currency' || quickType === 'delerium crystal') {
      const isGold = quickType === 'currency';
      const ledgerTs = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      ledgerEntry = {
        userEmail,
        action: 'ADJUST',
        resource: isGold ? 'gold' : 'delerium',
        subtype: isGold ? 'gold' : (normalizeDeleriumSize_(rowObj['Item']) || 'crystal'),
        qty: delta,
        valueGp: isGold ? validateMoney_(rowObj['Value GP']) : '',
        inventoryId: rowObj['Inventory ID'],
        item: rowObj['Item'],
        notes: note || '',
        character: safeText_(payload && payload.clientCharacter)
      };
      appendResourceLedger_(ledgerEntry);
      ledgerEntry._ts = ledgerTs;
    }

    auditWrite_({
      userEmail,
      action: 'ADJUST_INVENTORY',
      itemId: id,
      itemName: rowObj['Item'],
      oldValue: oldQty,
      newValue: newQty,
      delta,
      note,
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: 'Inventory adjusted.',
      item: sanitizeInventoryForClient_(rowObj),
      ledgerEntry: ledgerEntry ? sanitizeResourceLedgerForClient_({
        'Timestamp': ledgerEntry._ts,
        'Action': ledgerEntry.action,
        'Resource': ledgerEntry.resource,
        'Subtype': ledgerEntry.subtype,
        'Qty': ledgerEntry.qty,
        'Value GP': ledgerEntry.valueGp,
        'Inventory ID': ledgerEntry.inventoryId,
        'Item': ledgerEntry.item,
        'Notes': ledgerEntry.notes,
        'Character': ledgerEntry.character
      }) : null
    };
  } catch (err) {
    auditWrite_({
      userEmail,
      action: 'ADJUST_INVENTORY',
      itemId: payload && payload.itemId,
      delta: payload && payload.delta,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function apiSetItemQuantity(payload) {
  const lock = LockService.getDocumentLock();
  let userEmail = '';

  try {
    userEmail = requireAllowedUser_();
    if (!lock.tryLock(10000)) return { ok: false, error: 'Server busy, please try again.' };

    const ss = getInventorySpreadsheet_();
    const sheet = getRequiredSheet_(ss, CONFIG.INVENTORY_SHEET);
    ensureInventoryHeaders_(sheet);

    const id = validateId_(payload && payload.itemId, 'item ID');
    const qty = validateQuantity_(payload && payload.quantity);
    const note = validateText_(payload && payload.note, 'Note', 500);
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const found = getInventoryRowObjectById_(sheet, headers, id);

    if (!found) {
      return { ok: false, error: 'Inventory item not found.' };
    }

    const quickType = classifyQuickEdit_(found.rowObj);
    const oldQty = Number(found.rowObj['Qty'] || 0);
    const rowObj = Object.assign({}, found.rowObj, { 'Qty': qty });

    if (quickType === 'delerium crystal') {
      const size = normalizeDeleriumSize_(payload && payload.size);
      if (size && DELERIUM_SIZE_VALUES.includes(size)) {
        rowObj['Item'] = `Delerium ${size.replace(/\b\w/g, c => c.toUpperCase())}`;
      }
    }

    const valueGp = validateMoney_(rowObj['Value GP']);
    rowObj['Total Value GP'] = valueGp === '' ? '' : qty * valueGp;

    writeInventoryRow_(sheet, headers, found.rowNumber, rowObj);

    let ledgerEntry = null;
    if ((quickType === 'currency' || quickType === 'delerium crystal') && qty !== oldQty) {
      const isGold = quickType === 'currency';
      const delta = qty - oldQty;
      const ledgerTs = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      ledgerEntry = {
        userEmail,
        action: 'ADJUST',
        resource: isGold ? 'gold' : 'delerium',
        subtype: isGold ? 'gold' : (normalizeDeleriumSize_(rowObj['Item']) || 'crystal'),
        qty: delta,
        valueGp: isGold ? validateMoney_(rowObj['Value GP']) : '',
        inventoryId: rowObj['Inventory ID'],
        item: rowObj['Item'],
        notes: note || '',
        character: safeText_(payload && payload.clientCharacter)
      };
      appendResourceLedger_(ledgerEntry);
      ledgerEntry._ts = ledgerTs;
    }

    auditWrite_({
      userEmail,
      action: 'SET_ITEM_QUANTITY',
      itemId: id,
      itemName: rowObj['Item'],
      oldValue: oldQty,
      newValue: qty,
      delta: qty - oldQty,
      note,
      status: 'SUCCESS'
    });

    bumpSync_('inventory', payload && payload._syncClientId);
    return {
      ok: true,
      message: 'Quantity updated.',
      item: sanitizeInventoryForClient_(rowObj),
      ledgerEntry: ledgerEntry ? sanitizeResourceLedgerForClient_({
        'Timestamp': ledgerEntry._ts,
        'Action': ledgerEntry.action,
        'Resource': ledgerEntry.resource,
        'Subtype': ledgerEntry.subtype,
        'Qty': ledgerEntry.qty,
        'Value GP': ledgerEntry.valueGp,
        'Inventory ID': ledgerEntry.inventoryId,
        'Item': ledgerEntry.item,
        'Notes': ledgerEntry.notes,
        'Character': ledgerEntry.character
      }) : null
    };
  } catch (err) {
    auditWrite_({
      userEmail,
      action: 'SET_ITEM_QUANTITY',
      itemId: payload && payload.itemId,
      note: err.message,
      status: 'FAILED'
    });

    return { ok: false, error: publicValidationError_(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Ignore lock release errors.
    }
  }
}

function normalizeForClient_(value) {
  if (value === null || value === undefined) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    );
  }

  return value;
}

function ensureInventoryHeaders_(sheet) {
  const currentLastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet
    .getRange(1, 1, 1, currentLastCol)
    .getValues()[0]
    .map(h => safeText_(h));

  const missing = INVENTORY_HEADERS.filter(h => !headers.includes(h));

  if (!missing.length) return headers;

  ensureSheetSize_(sheet, 1, headers.length + missing.length);
  sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);

  return headers.concat(missing);
}

function fillMissingInventoryRarity_(inventorySheet, preloadedHeaders) {
  if (inventorySheet.getLastRow() < 2) return;

  // Accept pre-read headers to avoid a redundant sheet read when the caller already has them
  const headers = preloadedHeaders || inventorySheet
    .getRange(1, 1, 1, inventorySheet.getLastColumn())
    .getValues()[0]
    .map(h => safeText_(h));
  const libraryIdCol = headers.indexOf('Library Item ID') + 1;
  const rarityCol = headers.indexOf('Rarity') + 1;

  if (!libraryIdCol || !rarityCol) return;

  const numRows = inventorySheet.getLastRow() - 1;
  // Read both columns in a single range to avoid two separate sheet reads
  const minCol = Math.min(libraryIdCol, rarityCol);
  const maxCol = Math.max(libraryIdCol, rarityCol);
  const combined = inventorySheet.getRange(2, minCol, numRows, maxCol - minCol + 1).getValues();
  const libOffset = libraryIdCol - minCol;
  const rarOffset = rarityCol - minCol;
  const libraryIds = combined.map(r => [r[libOffset]]);
  const rarities   = combined.map(r => [r[rarOffset]]);
  const missingIds = new Set();

  combined.forEach(row => {
    const id     = safeText_(row[libOffset]);
    const rarity = safeText_(row[rarOffset]);
    if (id && !rarity) missingIds.add(id);
  });

  if (!missingIds.size) return;

  const ss = getInventorySpreadsheet_();
  const equipmentSheet = getSheetByTrimmedName_(ss, CONFIG.EQUIPMENT_SHEET);
  if (!equipmentSheet || equipmentSheet.getLastRow() < 2) return;

  const equipmentValues = equipmentSheet.getRange(2, 1, equipmentSheet.getLastRow() - 1, 6).getValues();
  const rarityById = {};

  equipmentValues.forEach(row => {
    const id = safeText_(row[0]);
    if (missingIds.has(id)) {
      rarityById[id] = row[5] || '';
    }
  });

  let changed = false;
  libraryIds.forEach((row, i) => {
    const id = safeText_(row[0]);
    if (id && !safeText_(rarities[i][0]) && rarityById[id]) {
      rarities[i][0] = rarityById[id];
      changed = true;
    }
  });

  if (changed) {
    inventorySheet.getRange(2, rarityCol, numRows, 1).setValues(rarities);
  }
}

function findInventoryRowById_(sheet, inventoryId) {
  if (sheet.getLastRow() < 2) return null;

  const match = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(inventoryId)
    .matchCase(false)
    .matchEntireCell(true)
    .findNext();

  return match ? match.getRow() : null;
}

