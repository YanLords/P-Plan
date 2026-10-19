// Import du catalogue articles JCO (CSV ;) -> src/data/artifices.json
// Usage : node scripts/import-artifices.mjs [chemin.csv]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** "70 M" | "50m" | 70 -> 70 (mètres), illisible -> null */
export function parseDistance(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const m = String(raw).replace(',', '.').match(/\d+(\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  return /ft|feet|pied/i.test(String(raw)) ? Math.round(v * 0.3048 * 10) / 10 : v;
}

function findCsv(arg) {
  if (arg) return arg;
  const candidates = [
    join(root, '..', 'Plan de tir', 'Base de donnée', 'informations articles.csv'),
  ];
  // le dossier peut être en NFD (accents décomposés)
  const planDir = join(root, '..', 'Plan de tir');
  try {
    for (const d of readdirSync(planDir)) {
      if (d.normalize('NFC').startsWith('Base de donn')) {
        for (const f of readdirSync(join(planDir, d))) {
          if (/informations articles\.csv$/i.test(f)) candidates.push(join(planDir, d, f));
        }
      }
    }
  } catch {}
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {}
  }
  return null;
}

/** Découpe une ligne CSV (séparateur ; ou ,) en gérant les guillemets. */
function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCatalogue(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ';' : ',';
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));

  const iFamille = 0; // ex. "bombe_050mm"
  const iNom = col('désignation planet', 'denomination planet') >= 0 ? col('désignation planet', 'denomination planet') : 1;
  const iNomCourt = 1;
  const iDs = col('distance sécurité', 'distance securite');
  const iRef = col('ref');
  const iDuree = col('durée', 'duree');
  const iNet = col('net pyro');

  const rows = [];
  const seen = new Set();
  for (const line of lines.slice(1)) {
    const f = splitLine(line, sep);
    if (f.length < 5) continue;
    const famille = f[iFamille] ?? '';
    const ref = (iRef >= 0 ? f[iRef] : '') ?? '';
    const nom = (f[iNom] || f[iNomCourt] || '').trim();
    if (!nom && !ref) continue;
    const cal = famille.match(/(\d{2,3})\s*mm/i);
    const item = {
      ref,
      nom,
      famille,
      calibre: cal ? Number(cal[1]) : null,
      ds: parseDistance(iDs >= 0 ? f[iDs] : ''),
      duree: iDuree >= 0 ? parseDistance(f[iDuree]) : null,
      net: iNet >= 0 ? parseDistance(f[iNet]) : null,
    };
    const key = `${item.ref}|${item.nom}|${item.famille}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  rows.sort((a, b) => (a.famille || '').localeCompare(b.famille || '') || a.nom.localeCompare(b.nom));
  return rows;
}

function main() {
  const file = findCsv(process.argv[2]);
  if (!file) {
    console.error('CSV articles introuvable (passer le chemin en argument).');
    process.exit(1);
  }
  const items = parseCatalogue(readFileSync(file, 'utf8'));
  const out = join(root, 'src', 'data', 'artifices.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(items, null, 0) + '\n');
  const withDs = items.filter((i) => i.ds).length;
  console.log(`${items.length} articles importés (${withDs} avec distance de sécurité) -> ${out}`);
}

if (process.argv[1] && process.argv[1].endsWith('import-artifices.mjs')) main();
