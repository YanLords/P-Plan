/** Types du plan de disposition + métadonnées d'affichage. */

export type Kind =
  | 'artifice'
  | 'barrierage'
  | 'sortie'
  | 'zone_public'
  | 'zone_perso'
  | 'accueil_secours'
  | 'point_eau'
  | 'bouee'
  | 'extincteur'
  | 'son'
  | 'bateau'
  | 'surveillance'
  | 'regie'
  | 'marqueur';

export interface PElement {
  id: string;
  kind: Kind;
  label: string;
  lat: number;
  lng: number;
  /** barriérage / zone public : sommets [lat, lng] */
  ring?: [number, number][];
  ref?: string;
  calibre?: number | null;
  /** distance de sécurité en mètres */
  ds?: number | null;
  /** couleur personnalisée (zone artifice, zones, marqueurs) */
  color?: string;
  /** zone affichée en simple icône : le tracé reste enregistré */
  pointMode?: boolean;
  /** voie de sortie : icône (pastille) masquée, le tracé et sa pointe de flèche restent */
  hideIcon?: boolean;
  notes?: string;
}

export interface Plan {
  version: 1;
  titre: string;
  /** lieu du tir (renseigné par la recherche d'adresse, éditable) */
  site: string;
  date: string;
  center: [number, number];
  zoom: number;
  base: 'osm' | 'sat';
  elements: PElement[];
}

export const KIND_META: Record<
  Kind,
  { label: string; color: string; shape: 'point' | 'line' | 'zone' }
> = {
  artifice: { label: 'Artifice', color: '#FCA04B', shape: 'point' },
  barrierage: { label: 'Barriérage', color: '#FF9500', shape: 'line' },
  sortie: { label: 'Voie accès secours', color: '#E03131', shape: 'line' },
  zone_public: { label: 'Zone public', color: '#2F80ED', shape: 'zone' },
  zone_perso: { label: 'Zone perso', color: '#8E5CF7', shape: 'zone' },
  accueil_secours: { label: 'Accueil secours', color: '#34C759', shape: 'point' },
  point_eau: { label: "Point d'eau", color: '#0A84FF', shape: 'point' },
  bouee: { label: 'Bouée', color: '#F76707', shape: 'point' },
  extincteur: { label: 'Extincteur', color: '#FF3B30', shape: 'point' },
  son: { label: 'Son', color: '#0B7285', shape: 'point' },
  bateau: { label: 'Fond de bateau', color: '#4A6C8C', shape: 'zone' },
  surveillance: { label: 'Agent de surveillance', color: '#B5179E', shape: 'point' },
  regie: { label: 'Régie de tir', color: '#495057', shape: 'point' },
  marqueur: { label: 'Marqueur', color: '#1A1A1A', shape: 'point' },
};

/** Ordre du rail : tracé (lignes/zones) puis points, puis divers. */
export const TOOL_ORDER: Kind[] = [
  'artifice',
  'zone_public',
  'zone_perso',
  'barrierage',
  'sortie',
  'accueil_secours',
  'point_eau',
  'bouee',
  'extincteur',
  'son',
  'surveillance',
  'regie',
  'bateau',
  'marqueur',
];

const PATHS: Record<Kind, string> = {
  artifice:
    '<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/><circle cx="12" cy="12" r="3.1"/>',
  barrierage: '<path d="M3 8h18M3 16h18M7 8v8M12 8v8M17 8v8"/>',
  sortie: '<path d="M3 12h13"/><path d="m12 6 6 6-6 6"/>',
  zone_public:
    '<circle cx="9" cy="8" r="2.6"/><path d="M3.6 19.5a5.4 5.4 0 0 1 10.8 0"/><circle cx="17" cy="9.2" r="2"/><path d="M16.2 19.5a4.6 4.6 0 0 1 4.4-4.4"/>',
  zone_perso:
    '<path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z"/><path d="M12 9.2v5.6" stroke-dasharray="2 2"/>',
  accueil_secours: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.8v8.4M7.8 12h8.4"/>',
  point_eau: '<path d="M12 2.8 6.4 8.4a8 8 0 1 0 11.2 0z"/>',
  // bouée de sauvetage (life-buoy, Feather)
  bouee:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="m5.6 5.6 3.8 3.8M14.6 9.4l3.8-3.8M14.6 14.6l3.8 3.8M9.4 14.6l-3.8 3.8"/>',
  extincteur:
    '<path d="M8.2 8h5.8a2 2 0 0 1 2 2v9.2a1.8 1.8 0 0 1-1.8 1.8H8a1.8 1.8 0 0 1-1.8-1.8V10a2 2 0 0 1 2-2z"/><path d="M9 8V5.2h6"/><path d="M6.2 8V6.2h6.6"/><path d="M16 11.4h2.6"/>',
  son: '<path d="M11 4.7 6.2 8.6H2.6v6.8h3.6L11 19.3z"/><path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  bateau:
    '<path d="M3.4 14.2h17.2l-2.1 4.1a1.7 1.7 0 0 1-1.5.9H7a1.7 1.7 0 0 1-1.5-.9z"/><path d="M12 14.2V4.6"/><path d="m12 5.6 4.6 2.9H12z"/><path d="M12 8.5H7.8L12 5.9z"/>',
  surveillance:
    '<path d="M2.2 12s3.7-7 9.8-7 9.8 7 9.8 7-3.7 7-9.8 7-9.8-7-9.8-7z"/><circle cx="12" cy="12" r="2.9"/>',
  // régie de tir : écran d'ordinateur sur son pied
  regie:
    '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 16.5V21"/>',
  marqueur:
    '<path d="M20 10.2c0 6-8 11.8-8 11.8S4 16.2 4 10.2a8 8 0 0 1 16 0z"/><circle cx="12" cy="10.2" r="2.6"/>',
};

/** Tracés seuls (sans `<svg>`), réutilisables dans une autre composition SVG. */
export function kindGlyph(kind: Kind, color = 'currentColor', strokeWidth = 1.7): string {
  return (
    `<g fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    `${PATHS[kind]}</g>`
  );
}

/** SVG inline (style Feather : tracé 1.7, 24×24). `color` = currentColor par défaut. */
export function kindIconSvg(kind: Kind, size = 20, color = 'currentColor'): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` +
    `${kindGlyph(kind, color)}</svg>`
  );
}

/** Icône d'élément (hérite de la couleur du texte). */
export function kindIcon(kind: Kind): string {
  return kindIconSvg(kind);
}

export const isZone = (kind: Kind) => KIND_META[kind].shape === 'zone';

/** barriérage ou zone : éléments tracés au clic (pas un simple point). */
export const isShape = (kind: Kind) => KIND_META[kind].shape !== 'point';

/** Élément de fond (bateau) : dessiné sous les autres, jamais devant. */
export const isFond = (kind: Kind) => kind === 'bateau';

/** Types encore connus : sert à écarter les éléments d'anciens plans. */
export const KNOWN_KINDS = Object.keys(KIND_META) as Kind[];

/** Un plan relu peut venir d'une version antérieure : on écarte les types disparus. */
export function sanitizePlan(p: Plan): Plan {
  return {
    ...p,
    site: String(p.site ?? ''),
    elements: (p.elements ?? []).filter((el) => !!el && KNOWN_KINDS.includes(el.kind)),
  };
}

/** Mètres -> degrés (approximation locale suffisante pour un décalage d'icône). */
export function metersToDegrees(lat: number, meters: number): [number, number] {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  return [dLat, dLng];
}

/**
 * Copie d'un élément : nouvel identifiant, même forme, décalée de `meters`
 * pour que la copie ne se superpose pas à l'original.
 */
export function cloneElement(el: PElement, id: string, meters = 0): PElement {
  const [dLat, dLng] = metersToDegrees(el.lat, meters);
  const copy: PElement = { ...el, id, lat: el.lat + dLat, lng: el.lng + dLng };
  if (el.ring) copy.ring = el.ring.map(([la, ln]) => [la + dLat, ln + dLng] as [number, number]);
  return copy;
}

/** couleur effective d'un élément (couleur perso prioritaire). */
export const colorOf = (e: { kind: Kind; color?: string }) => e.color || KIND_META[e.kind].color;

/** Outils du rail : les éléments du plan, la sélection, et la règle (mesure, hors plan). */
export type Tool = Kind | 'select' | 'regle';

/** La règle ne crée pas d'élément : seul un outil d'élément porte un Kind. */
export const isKindTool = (tool: Tool): tool is Kind => tool !== 'select' && tool !== 'regle';

/** Règle de mesure : outil transitoire, jamais enregistré dans le plan. */
export const RULER = {
  label: 'Règle',
  color: '#2D6DFF',
  icon:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M15.6 2.9 2.9 15.6a1.4 1.4 0 0 0 0 2l3.5 3.5a1.4 1.4 0 0 0 2 0L21.1 8.4a1.4 1.4 0 0 0 0-2l-3.5-3.5a1.4 1.4 0 0 0-2 0z"/>' +
    '<path d="m7.5 11.5 2 2M10.5 8.5l2 2M13.5 5.5l2 2"/></svg>',
};
