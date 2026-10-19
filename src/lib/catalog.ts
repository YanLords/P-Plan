import type { Artifice } from './elements';
import raw from '../data/artifices.json';

/** Catalogue articles importé depuis la base JCO (scripts/import-artifices.mjs). */
export const CATALOG = raw as Artifice[];

export function searchCatalog(q: string, limit = 250): Artifice[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return CATALOG.slice(0, limit);
  const out: Artifice[] = [];
  for (const a of CATALOG) {
    if (
      a.nom.toLowerCase().includes(needle) ||
      a.ref.toLowerCase().includes(needle) ||
      a.famille.toLowerCase().includes(needle) ||
      (a.calibre != null && `${a.calibre}mm`.includes(needle))
    ) {
      out.push(a);
      if (out.length >= limit) break;
    }
  }
  return out;
}
