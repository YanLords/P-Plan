/** Types du plan de disposition + métadonnées d'affichage. */

export type Kind =
  | 'artifice'
  | 'barrierage'
  | 'zone_public'
  | 'zone_perso'
  | 'acces_secours'
  | 'accueil_secours'
  | 'point_eau'
  | 'extincteur'
  | 'echelle'
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
  /** couleur personnalisée (zones perso, marqueurs) */
  color?: string;
  notes?: string;
}

export interface Plan {
  version: 1;
  titre: string;
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
  zone_public: { label: 'Zone public', color: '#2F80ED', shape: 'zone' },
  zone_perso: { label: 'Zone perso', color: '#8E5CF7', shape: 'zone' },
  acces_secours: { label: 'Accès secours', color: '#34C759', shape: 'point' },
  accueil_secours: { label: 'Accueil secours', color: '#34C759', shape: 'point' },
  point_eau: { label: "Point d'eau", color: '#0A84FF', shape: 'point' },
  extincteur: { label: 'Extincteur', color: '#FF3B30', shape: 'point' },
  echelle: { label: 'Échelle', color: '#8E8E93', shape: 'point' },
  marqueur: { label: 'Marqueur', color: '#1A1A1A', shape: 'point' },
};

/** Ordre du rail : tracé (lignes/zones) puis points, puis divers. */
export const TOOL_ORDER: Kind[] = [
  'artifice',
  'zone_public',
  'zone_perso',
  'barrierage',
  'acces_secours',
  'accueil_secours',
  'point_eau',
  'extincteur',
  'echelle',
  'marqueur',
];

const PATHS: Record<Kind, string> = {
  artifice:
    '<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/><circle cx="12" cy="12" r="3.1"/>',
  barrierage: '<path d="M3 8h18M3 16h18M7 8v8M12 8v8M17 8v8"/>',
  zone_public:
    '<circle cx="9" cy="8" r="2.6"/><path d="M3.6 19.5a5.4 5.4 0 0 1 10.8 0"/><circle cx="17" cy="9.2" r="2"/><path d="M16.2 19.5a4.6 4.6 0 0 1 4.4-4.4"/>',
  zone_perso:
    '<path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z"/><path d="M12 9.2v5.6" stroke-dasharray="2 2"/>',
  acces_secours: '<path d="M4 12h10"/><path d="M11 7.5 16 12l-5 4.5"/><path d="M3 5.5v13"/>',
  accueil_secours: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.8v8.4M7.8 12h8.4"/>',
  point_eau: '<path d="M12 2.8 6.4 8.4a8 8 0 1 0 11.2 0z"/>',
  extincteur:
    '<path d="M8.2 8h5.8a2 2 0 0 1 2 2v9.2a1.8 1.8 0 0 1-1.8 1.8H8a1.8 1.8 0 0 1-1.8-1.8V10a2 2 0 0 1 2-2z"/><path d="M9 8V5.2h6"/><path d="M6.2 8V6.2h6.6"/><path d="M16 11.4h2.6"/>',
  echelle: '<path d="M7 2.5v19M17 2.5v19M7 6.5h10M7 11h10M7 15.5h10"/>',
  marqueur:
    '<path d="M20 10.2c0 6-8 11.8-8 11.8S4 16.2 4 10.2a8 8 0 0 1 16 0z"/><circle cx="12" cy="10.2" r="2.6"/>',
};

/** SVG inline (style Feather : tracé 1.7, 24×24) pour une icône d'élément. */
export function kindIcon(kind: Kind): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[kind]}</svg>`;
}

export const isZone = (kind: Kind) => KIND_META[kind].shape === 'zone';

/** barriérage ou zone : éléments tracés au clic (pas un simple point). */
export const isShape = (kind: Kind) => KIND_META[kind].shape !== 'point';

/** couleur effective d'un élément (couleur perso prioritaire). */
export const colorOf = (e: { kind: Kind; color?: string }) => e.color || KIND_META[e.kind].color;
