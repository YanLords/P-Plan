/** Types du plan de disposition + métadonnées d'affichage. */

export type Kind =
  | 'artifice'
  | 'barrierage'
  | 'sortie'
  | 'zone_public'
  | 'zone_perso'
  | 'accueil_secours'
  | 'point_eau'
  | 'bouche_incendie'
  | 'bouche_incendie'
  | 'bouee'
  | 'extincteur'
  | 'son'
  | 'bateau'
  | 'surveillance'
  | 'regie'
  | 'camion_pompier'
  | 'engin'
  | 'personnel_jco'
  | 'electricite'
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
  bouche_incendie: { label: 'Bouche incendie', color: '#E53013', shape: 'point' },
  bouee: { label: 'Bouée', color: '#F76707', shape: 'point' },
  extincteur: { label: 'Extincteur', color: '#FF3B30', shape: 'point' },
  son: { label: 'Son', color: '#000000', shape: 'point' },
  bateau: { label: 'Barge', color: '#4A6C8C', shape: 'zone' },
  surveillance: { label: 'Agent de surveillance', color: '#4eac4c', shape: 'point' },
  personnel_jco: { label: 'Personnel JCO', color: '#ea1f4c', shape: 'point' },
  camion_pompier: { label: 'Camion pompier', color: '#D9480F', shape: 'point' },
  engin: { label: 'Engin', color: '#F59F00', shape: 'point' },
  electricite: { label: 'Électricité', color: '#E67700', shape: 'point' },
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
  'bouche_incendie',
  'bouee',
  'extincteur',
  'son',
  'surveillance',
  'personnel_jco',
  'camion_pompier',
  'engin',
  'electricite',
  'regie',
  'bateau',
  'marqueur',
];

/** Outils regroupés sous un même bouton du rail : appui prolongé pour choisir. */
export interface ToolGroup {
  id: string;
  label: string;
  members: Kind[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'moyens', label: 'Moyens', members: ['camion_pompier', 'engin'] },
  { id: 'personnel', label: 'Personnel', members: ['surveillance', 'personnel_jco'] },
];

export const groupOf = (kind: Kind): ToolGroup | undefined => TOOL_GROUPS.find((g) => g.members.includes(kind));

export const PATHS: Partial<Record<Kind, string>> = {
  // carré plein (ancienne icône soleil d'artifice : src/lib/icons/archive/artifice.svg)
  artifice: '<rect x="4" y="4" width="16" height="16" rx="1.5" fill="currentColor"/>',
  barrierage: '<path d="M3 8h18M3 16h18M7 8v8M12 8v8M17 8v8"/>',
  sortie: '<path d="M3 12h13"/><path d="m12 6 6 6-6 6"/>',
  zone_public:
    '<circle cx="9" cy="8" r="2.6" fill="currentColor"/><path d="M3.6 19.5a5.4 5.4 0 0 1 10.8 0z" fill="currentColor"/><circle cx="17" cy="9.2" r="2" fill="currentColor"/><path d="M16.2 19.5a4.6 4.6 0 0 1 4.4-4.4z" fill="currentColor"/>',
  zone_perso:
    '<path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z" fill="currentColor"/><path d="M12 9.2v5.6" stroke="#fff" stroke-dasharray="2 2"/>',
  point_eau: '<path d="M12 2.8 6.4 8.4a8 8 0 1 0 11.2 0z" fill="currentColor"/>',
  // bouée de sauvetage (life-buoy, Feather) : disque plein, anneau et rayons en blanc
  bouee:
    '<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="3.6" fill="#fff" stroke="#fff"/><path d="m5.6 5.6 3.8 3.8M14.6 9.4l3.8-3.8M14.6 14.6l3.8 3.8M9.4 14.6l-3.8 3.8" stroke="#fff" stroke-width="2.4"/>',
  bateau:
    '<path d="M3.4 14.2h17.2l-2.1 4.1a1.7 1.7 0 0 1-1.5.9H7a1.7 1.7 0 0 1-1.5-.9z" fill="currentColor"/><path d="M12 14.2V4.6"/><path d="m12 5.6 4.6 2.9H12z" fill="currentColor"/><path d="M12 8.5H7.8L12 5.9z" fill="currentColor"/>',
  // régie de tir : PC portable (écran évidé, base pleine)
  regie:
    '<path fill-rule="evenodd" d="M5.5 4.5h13a1.5 1.5 0 0 1 1.5 1.5v9.5H4V6a1.5 1.5 0 0 1 1.5-1.5zM6.5 6v6.5h11V6z" fill="currentColor"/><path d="M2.5 16.5h19l-1.1 2.6a1 1 0 0 1-.9.6H4.5a1 1 0 0 1-.9-.6z" fill="currentColor"/>',
  marqueur:
    '<path d="M20 10.2c0 6-8 11.8-8 11.8S4 16.2 4 10.2a8 8 0 0 1 16 0z" fill="currentColor"/><circle cx="12" cy="10.2" r="2.6" fill="#fff" stroke="#fff"/>',
};

export const isZone = (kind: Kind) => KIND_META[kind].shape === 'zone';

/** barriérage ou zone : éléments tracés au clic (pas un simple point). */
export const isShape = (kind: Kind) => KIND_META[kind].shape !== 'point';

/** Élément de fond (bateau) : dessiné sous les autres, jamais devant. */
export const isFond = (kind: Kind) => kind === 'bateau';

/** Types répartissables : Tab bascule entre un tracé réparti tous les X m et le mode normal. */
export const SPREAD_KINDS: Kind[] = ['artifice', 'extincteur', 'son', 'bateau', 'zone_perso'];
export const canSpread = (tool: string): boolean => (SPREAD_KINDS as string[]).includes(tool);

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
