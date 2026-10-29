import {
  KIND_META,
  colorOf,
  isZone,
  type Kind,
  type PElement,
  type Plan,
} from './elements.ts';
import { formatMeters, ringArea, ringLength } from './geo.ts';

/**
 * Types regroupés en une seule ligne de légende : un équipement répété sur le
 * terrain ne doit pas produire dix lignes dans le cartouche.
 */
export const MERGED: Kind[] = [
  'barrierage',
  'point_eau',
  'bouee',
  'extincteur',
  'son',
  'accueil_secours',
  'surveillance',
  'personnel_jco',
  'camion_pompier',
  'engin',
  'electricite',
  'regie',
];

export interface LegRow {
  kind: Kind;
  color: string;
  label: string;
  details: string;
  /** note libre saisie sur l'élément, imprimée sous sa ligne de légende */
  note: string;
}

/** Détails techniques d'un élément, sur une seule ligne (sans GPS : la carte suffit). */
export function detailOf(e: PElement): string {
  const d: string[] = [];
  if (e.kind === 'artifice') {
    if (e.ds != null) d.push(`DS ${e.ds} m`);
    if (e.ref) d.push(`réf ${e.ref}`);
    if (e.calibre != null) d.push(`${e.calibre} mm`);
    return d.join(' · ');
  }
  if (e.ring?.length) {
    // la longueur n'a de sens que pour un barriérage (métrage à prévoir) :
    // ni zone (aire) ni voie de sortie (simple itinéraire)
    if (isZone(e.kind)) d.push(`${formatMeters(ringLength(e.ring, true))} m · ${formatMeters(ringArea(e.ring))} m²`);
    else if (e.kind === 'barrierage') d.push(`${formatMeters(ringLength(e.ring))} m`);
  }
  return d.join(' · ');
}

/** Métrage total à couvrir : somme des longueurs de tous les barriérages. */
export function barrierageTotal(plan: Plan): number {
  return plan.elements
    .filter((e) => e.kind === 'barrierage' && e.ring?.length)
    .reduce((sum, e) => sum + ringLength(e.ring!), 0);
}

const notesOf = (elements: PElement[]) =>
  elements
    .map((e) => (e.notes ?? '').trim())
    .filter(Boolean)
    .join(' · ');

/**
 * Lignes de légende du PDF :
 * - les équipements répétés sont fusionnés (une ligne par type) ;
 * - le barriérage tient sur une ligne, avec la **somme** des périmètres ;
 * - les artifices sont regroupés **par couleur** (une ligne par teinte).
 */
export function legendRowsFor(plan: Plan): LegRow[] {
  const rows: LegRow[] = [];
  const seen = new Set<string>();

  for (const e of plan.elements) {
    const meta = KIND_META[e.kind];
    const color = colorOf(e);

    // artifices : une ligne par couleur, quel que soit le nombre d'engins
    if (e.kind === 'artifice') {
      const key = `artifice|${color}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const same = plan.elements.filter((o) => o.kind === 'artifice' && colorOf(o) === color);
      const ds = [...new Set(same.map((o) => o.ds).filter((v): v is number => v != null))].sort((a, b) => a - b);
      rows.push({
        kind: e.kind,
        color,
        label: meta.label,
        details: ds.length ? `DS ${ds.join(' m · ')} m` : '',
        note: notesOf(same),
      });
      continue;
    }

    // zone public en icône : pas de surface à lister, une seule ligne pour toutes
    if (e.kind === 'zone_public' && e.pointMode) {
      if (seen.has('zone_public|icon')) continue;
      seen.add('zone_public|icon');
      const same = plan.elements.filter((o) => o.kind === 'zone_public' && o.pointMode);
      rows.push({ kind: e.kind, color, label: meta.label, details: '', note: notesOf(same) });
      continue;
    }

    if (MERGED.includes(e.kind)) {
      if (seen.has(e.kind)) continue;
      seen.add(e.kind);
      const same = plan.elements.filter((o) => o.kind === e.kind);
      rows.push({
        kind: e.kind,
        color,
        label: meta.label,
        details: e.kind === 'barrierage' ? `${formatMeters(barrierageTotal(plan))} m à couvrir` : '',
        note: notesOf(same),
      });
      continue;
    }

    rows.push({
      kind: e.kind,
      color,
      label:
        e.kind === 'marqueur'
          ? `Marqueur — ${e.label}`
          : e.label && e.label !== meta.label
            ? `${meta.label} — ${e.label}`
            : meta.label,
      details: e.kind === 'marqueur' ? '' : detailOf(e),
      note: (e.notes ?? '').trim(),
    });
  }

  return rows;
}

/**
 * Commune d'un libellé de lieu, quel que soit le fournisseur :
 * - Nominatim : « Montpellier, Hérault, Occitanie, France » → Montpellier
 * - BAN : « 12 Rue de la Loge, 34000 Montpellier » → Montpellier
 * - BAN sans virgule : « 12 Rue de la Loge 34000 Montpellier » → Montpellier
 */
export function cityOf(site: string): string {
  const s = site.trim();
  if (!s) return '';
  const parts = s
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const withZip = parts.find((p) => /^\d{5}\b/.test(p));
    if (withZip) return withZip.replace(/^\d{5}\s*/, '');
    return parts[0];
  }
  const tail = s.match(/\b\d{5}\b\s*(.+)$/);
  return tail ? tail[1].trim() : s;
}
