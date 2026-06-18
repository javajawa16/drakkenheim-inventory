const fs   = require('fs');
const XLSX = require('xlsx');
const path = require('path');

const XML_PATH  = path.join(__dirname, 'Complete_Compendium_5.5e.xml');
const OUT_PATH  = path.join(__dirname, 'equipment_library_5e.xlsx');

// ── Type code → human-readable label ────────────────────────────────────────
const TYPE_LABELS = {
  'M':  'Melee Weapon',
  'R':  'Ranged Weapon',
  'A':  'Armor',
  'LA': 'Light Armor',
  'MA': 'Medium Armor',
  'HA': 'Heavy Armor',
  'S':  'Shield',
  'P':  'Potion',
  'W':  'Wondrous Item',
  'RD': 'Rod',
  'ST': 'Staff',
  'WD': 'Wand',
  'RG': 'Ring',
  'SC': 'Scroll',
  'G':  'Gear',
  '$':  'Currency',
  'GS': 'Gaming Set',
  'MU': 'Musical Instrument',
  'T':  'Tool',
  'AT': 'Artisan Tools',
  'INS':'Instrument',
  'EXP':'Explosive',
  'FD': 'Food/Drink',
  'MNT':'Mount',
  'VEH':'Vehicle',
  'TG': 'Tack & Gear',
  'AIR':'Airship',
  'SHP':'Watercraft',
};

// ── Weapon property codes → labels ──────────────────────────────────────────
const PROP_LABELS = {
  'A':  'Ammunition',
  'F':  'Finesse',
  'H':  'Heavy',
  'L':  'Light',
  'LD': 'Loading',
  'R':  'Reach',
  'S':  'Special',
  'T':  'Thrown',
  'V':  'Versatile',
  '2H': 'Two-Handed',
  'LD': 'Loading',
  'BF': 'Burst Fire',
  'RLD':'Reload',
};

// ── Damage type codes → labels ───────────────────────────────────────────────
const DMG_TYPES = {
  'S':  'slashing',
  'P':  'piercing',
  'B':  'bludgeoning',
  'F':  'fire',
  'C':  'cold',
  'L':  'lightning',
  'A':  'acid',
  'T':  'thunder',
  'N':  'necrotic',
  'R':  'radiant',
  'PY': 'psychic',
  'PS': 'poison',
  'O':  'force',
};

// ── Derive category from type + rarity + detail ─────────────────────────────
function getCategory(typeRaw, rarity, detail, magic) {
  const t = (typeRaw || '').toUpperCase();
  const r = (rarity  || '').toLowerCase();
  if (t === '$')  return 'Currency';
  if (t === 'P')  return 'Potion';
  if (t === 'SC') return 'Scroll';
  if (t === 'WD') return 'Wand';
  if (t === 'ST') return 'Staff';
  if (t === 'RD') return 'Rod';
  if (t === 'RG') return 'Ring';
  if (['LA','MA','HA','A','S'].includes(t)) return 'Armor';
  if (t === 'M' || t === 'R') return magic === 'YES' ? 'Magic Weapon' : 'Weapon';
  if (t === 'W') return 'Magic Item';
  if (['GS','MU','T','AT','INS'].includes(t)) return 'Tools & Kits';
  if (['MNT','TG'].includes(t)) return 'Mounts & Gear';
  if (['VEH','SHP','AIR'].includes(t)) return 'Vehicles';
  if (magic === 'YES') return 'Magic Item';
  return 'Gear';
}

// ── Parse rarity + attunement out of <detail> ──────────────────────────────
function parseDetail(detail) {
  if (!detail) return { rarity: '', attunement: '' };
  const d = detail.toLowerCase();
  let rarity = '';
  const rarities = ['legendary','very rare','rare','uncommon','common','artifact','varies'];
  for (const r of rarities) {
    if (d.includes(r)) { rarity = r; break; }
  }
  const attunement = /requires attunement/.test(d) ? 'Yes' : '';
  return { rarity, attunement };
}

// ── Expand property codes ────────────────────────────────────────────────────
function expandProperties(propStr) {
  if (!propStr) return '';
  return propStr.split(',').map(p => PROP_LABELS[p.trim()] || p.trim()).join(', ');
}

// ── Expand damage type ───────────────────────────────────────────────────────
function expandDmgType(code) {
  return DMG_TYPES[code] || code || '';
}

// ── Extract source line from description text ─────────────────────────────
function extractSource(text) {
  const m = text && text.match(/Source:\s*(.+?)(?:\n|$)/i);
  return m ? m[1].trim() : '';
}

// ── Strip description down (remove trailing source line) ──────────────────
function cleanDescription(text) {
  if (!text) return '';
  return text.replace(/\nSource:\s*.+$/im, '').trim();
}

// ── Strip [5.5e] suffix from name ─────────────────────────────────────────
function cleanName(name) {
  return (name || '').replace(/\s*\[5\.5e\]\s*$/i, '').trim();
}

// ── Simple stable ID (hash of name+type) ────────────────────────────────────
function makeId(name, typeRaw, source) {
  const base = `${name}|${typeRaw}|${source}`.toLowerCase();
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = Math.imul(31, h) + base.charCodeAt(i) | 0;
  }
  return 'ITEM_' + Math.abs(h).toString(36).toUpperCase();
}

// ── Main parse ───────────────────────────────────────────────────────────────
console.log('Reading XML…');
const xml = fs.readFileSync(XML_PATH, 'utf8');

console.log('Parsing items…');

const rows = [];

// Use regex-based parser — XmlService not available in Node, and the file is large
// Each <item>…</item> block is self-contained
const itemRegex = /<item>([\s\S]*?)<\/item>/g;

function getField(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = block.match(re);
  return m ? m[1].trim() : '';
}

function getAllFields(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(block)) !== null) results.push(m[1].trim());
  return results;
}

let count = 0;
let match;
while ((match = itemRegex.exec(xml)) !== null) {
  const block = match[1];

  const rawName = getField(block, 'name');
  if (!rawName) continue;

  const name    = cleanName(rawName);
  const typeRaw = getField(block, 'type');
  const magic   = getField(block, 'magic');
  const detail  = getField(block, 'detail');
  const text    = getField(block, 'text');
  const weight  = getField(block, 'weight');
  const value   = getField(block, 'value');
  const dmg1    = getField(block, 'dmg1');
  const dmg2    = getField(block, 'dmg2');
  const dmgType = getField(block, 'dmgType');
  const propRaw = getField(block, 'property');
  const range   = getField(block, 'range');
  const ac      = getField(block, 'ac');
  const strReq  = getField(block, 'str');
  const stealth = getField(block, 'stealth');
  const roll    = getAllFields(block, 'roll').join('; ');

  // Modifier lines: <modifier category="bonus">ac +1</modifier>
  const modifiers = getAllFields(block, 'modifier').join('; ');

  const { rarity, attunement } = parseDetail(detail);
  const typeLabel   = TYPE_LABELS[typeRaw.toUpperCase()] || typeRaw;
  const category    = getCategory(typeRaw, rarity, detail, magic);
  const properties  = expandProperties(propRaw);
  const dmgLabel    = dmg1 ? `${dmg1} ${expandDmgType(dmgType)}`.trim() : '';
  const dmg2Label   = dmg2 ? `${dmg2} ${expandDmgType(dmgType)}`.trim() : '';
  const source      = extractSource(text);
  const description = cleanDescription(text);
  const itemId      = makeId(rawName, typeRaw, source);

  // Value: XML value field is in GP already
  const valueGp = value !== '' ? parseFloat(value) || '' : '';

  const searchText = [name, typeRaw, typeLabel, category, rarity, source].join(' ').toLowerCase().trim();

  rows.push([
    itemId,           // 0  Item ID
    name,             // 1  Name
    typeRaw,          // 2  Type Raw
    typeLabel,        // 3  Type Clean
    category,         // 4  Category
    rarity,           // 5  Rarity
    attunement,       // 6  Requires Attunement
    magic === 'YES' ? 'Yes' : '',  // 7  Magic Item
    dmgLabel,         // 8  Damage
    dmg2Label,        // 9  Damage Versatile
    properties,       // 10 Properties
    range,            // 11 Range
    ac,               // 12 AC
    strReq,           // 13 Strength Req
    stealth === 'YES' ? 'Yes' : '',  // 14 Stealth Disadvantage
    weight !== '' ? parseFloat(weight) || '' : '',  // 15 Weight
    valueGp,          // 16 Value GP
    source,           // 17 Source
    description,      // 18 Text / Description
    searchText,       // 19 Search Text
  ]);
  count++;
  if (count % 1000 === 0) process.stdout.write(`  ${count} items…\r`);
}

console.log(`\nParsed ${count} items. Building workbook…`);

// Column order MUST match EQUIPMENT_HEADERS in Code.js exactly
const HEADERS = [
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

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);

// Column widths
ws['!cols'] = [
  { wch: 16 }, // Item ID
  { wch: 38 }, // Name
  { wch: 8  }, // Type Raw
  { wch: 20 }, // Type Label
  { wch: 18 }, // Category
  { wch: 12 }, // Rarity
  { wch: 10 }, // Attunement
  { wch: 10 }, // Magic
  { wch: 18 }, // Damage
  { wch: 18 }, // Damage Versatile
  { wch: 36 }, // Properties
  { wch: 10 }, // Range
  { wch: 6  }, // AC
  { wch: 10 }, // Str Req
  { wch: 10 }, // Stealth
  { wch: 10 }, // Weight
  { wch: 36 }, // Detail raw
  { wch: 10 }, // Value GP
  { wch: 36 }, // Source
  { wch: 80 }, // Description
];

// Freeze top row
ws['!freeze'] = { xSplit: 0, ySplit: 1 };

XLSX.utils.book_append_sheet(wb, ws, 'Equipment Library 5.5e');

console.log(`Writing ${OUT_PATH}…`);
XLSX.writeFile(wb, OUT_PATH);
console.log(`Done. ${count} items written.`);
