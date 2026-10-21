import type { Kind } from './elements';

export type ToolKey = 'select' | Kind;

/** Réglages persistés (modèle pur : testable sans DOM). */
export interface ToolSettings {
  version: 1;
  /** échelle de l'interface (1 = 100 %) */
  uiScale: number;
  defaultBase: 'osm' | 'sat';
  showRings: boolean;
  showLegend: boolean;
  showLabels: boolean;
  confirmDelete: boolean;
  autosave: boolean;
  shortcuts: Record<ToolKey, string>;
}

export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.3;
export const UI_SCALE_STEP = 0.05;

export const SHORTCUT_ORDER: ToolKey[] = [
  'select',
  'artifice',
  'zone_public',
  'zone_perso',
  'barrierage',
  'acces_secours',
  'accueil_secours',
  'point_eau',
  'extincteur',
  'echelle',
  'surveillance',
  'marqueur',
];

export const SHORTCUT_LABELS: Record<ToolKey, string> = {
  select: 'Sélect.',
  artifice: 'Artifice',
  zone_public: 'Zone public',
  zone_perso: 'Zone perso',
  barrierage: 'Barriérage',
  acces_secours: 'Accès secours',
  accueil_secours: 'Accueil secours',
  point_eau: "Point d'eau",
  extincteur: 'Extincteur',
  echelle: 'Échelle',
  surveillance: 'Surveillance',
  marqueur: 'Marqueur',
};

export const DEFAULT_SHORTCUTS: Record<ToolKey, string> = {
  select: 'v',
  artifice: 'a',
  zone_public: 'p',
  zone_perso: 'z',
  barrierage: 'b',
  acces_secours: 's',
  accueil_secours: 'q',
  point_eau: 'e',
  extincteur: 'w',
  echelle: 'x',
  surveillance: 'g',
  marqueur: 'm',
};

export const DEFAULT_SETTINGS: ToolSettings = {
  version: 1,
  uiScale: 1,
  defaultBase: 'osm',
  showRings: true,
  showLegend: true,
  showLabels: true,
  confirmDelete: true,
  autosave: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

export function clampScale(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  const stepped = Math.round(n / UI_SCALE_STEP) * UI_SCALE_STEP;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(stepped.toFixed(2))));
}

/** Une touche utilisable = un seul caractère alphanumérique, en minuscule. */
export function normalizeKey(raw: unknown): string {
  const k = String(raw ?? '').trim().toLowerCase();
  return /^[a-z0-9]$/.test(k) ? k : '';
}

/** Assigne une touche à un outil ; la retire des autres (pas de doublon). */
export function assignShortcut(
  shortcuts: Record<ToolKey, string>,
  tool: ToolKey,
  rawKey: unknown
): Record<ToolKey, string> {
  const key = normalizeKey(rawKey);
  if (!key) return { ...shortcuts };
  const next = { ...shortcuts };
  for (const t of SHORTCUT_ORDER) {
    if (t !== tool && next[t] === key) next[t] = '';
  }
  next[tool] = key;
  return next;
}

/** Outil correspondant à une touche (insensible à la casse), ou null. */
export function toolForShortcut(shortcuts: Record<ToolKey, string>, key: unknown): ToolKey | null {
  const k = String(key ?? '').trim().toLowerCase();
  if (!k) return null;
  for (const t of SHORTCUT_ORDER) if (shortcuts[t] === k) return t;
  return null;
}

/** Réglages relus depuis le stockage local : tout champ invalide retombe sur le défaut. */
export function sanitizeSettings(raw: unknown): ToolSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<ToolSettings> & {
    shortcuts?: Partial<Record<ToolKey, string>>;
  };
  const shortcuts = { ...DEFAULT_SHORTCUTS };
  for (const tool of SHORTCUT_ORDER) {
    const value = src.shortcuts?.[tool];
    if (value === '') shortcuts[tool] = '';
    else if (normalizeKey(value)) shortcuts[tool] = normalizeKey(value);
  }
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    version: 1,
    uiScale: clampScale(src.uiScale ?? DEFAULT_SETTINGS.uiScale),
    defaultBase: src.defaultBase === 'sat' ? 'sat' : 'osm',
    showRings: bool(src.showRings, DEFAULT_SETTINGS.showRings),
    showLegend: bool(src.showLegend, DEFAULT_SETTINGS.showLegend),
    showLabels: bool(src.showLabels, DEFAULT_SETTINGS.showLabels),
    confirmDelete: bool(src.confirmDelete, DEFAULT_SETTINGS.confirmDelete),
    autosave: bool(src.autosave, DEFAULT_SETTINGS.autosave),
    shortcuts,
  };
}
