import type { Kind, Tool } from './elements';

export type ToolKey = Tool;

/** Coordonnées de l'entreprise, imprimées dans le cartouche du PDF. */
export interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** logo en data URL (PNG/JPEG), '' si absent */
  logo: string;
  /** ajouter le QR code de contact (vCard) au cartouche */
  qr: boolean;
}

export const EMPTY_COMPANY: Company = {
  name: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  logo: '',
  qr: true,
};

/** Limite du logo stocké (localStorage) : ~300 Ko en base64. */
export const MAX_LOGO_CHARS = 400_000;

export function isImageDataUrl(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length <= MAX_LOGO_CHARS &&
    /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeCompany(raw: unknown): Company {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Company>;
  return {
    name: cleanText(src.name, 80),
    address: cleanText(src.address, 120),
    phone: cleanText(src.phone, 40),
    email: cleanText(src.email, 80),
    website: cleanText(src.website, 80),
    logo: isImageDataUrl(src.logo) ? String(src.logo) : '',
    qr: typeof src.qr === 'boolean' ? src.qr : EMPTY_COMPANY.qr,
  };
}

/** Rien à imprimer : ni identité, ni coordonnées, ni logo. */
export function companyIsEmpty(c: Company): boolean {
  return !c.name && !c.address && !c.phone && !c.email && !c.website && !c.logo;
}

/** vCard 3.0 : contenu du QR code de contact. */
export function vcardOf(c: Company): string {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/([;,\n])/g, (m) => (m === '\n' ? '\\n' : `\\${m}`));
  // version compacte : chaque champ en moins réduit la taille des modules du QR imprimé
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (c.name) lines.push(`FN:${esc(c.name)}`);
  if (c.phone) lines.push(`TEL:${esc(c.phone)}`);
  if (c.email) lines.push(`EMAIL:${esc(c.email)}`);
  if (c.website) lines.push(`URL:${esc(c.website)}`);
  if (c.address) lines.push(`ADR:;;${esc(c.address)};;;;`);
  lines.push('END:VCARD');
  return lines.join('\n');
}


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
  company: Company;
}

export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.3;
export const UI_SCALE_STEP = 0.05;

export const SHORTCUT_ORDER: ToolKey[] = [
  'select',
  'regle',
  'artifice',
  'zone_public',
  'zone_perso',
  'barrierage',
  'sortie',
  'accueil_secours',
  'point_eau',
  'extincteur',
  'son',
  'surveillance',
  'bateau',
  'marqueur',
];

export const SHORTCUT_LABELS: Record<ToolKey, string> = {
  select: 'Sélect.',
  regle: 'Règle',
  artifice: 'Artifice',
  zone_public: 'Zone public',
  zone_perso: 'Zone perso',
  barrierage: 'Barriérage',
  sortie: 'Accès secours',
  accueil_secours: 'Accueil secours',
  point_eau: "Point d'eau",
  extincteur: 'Extincteur',
  son: 'Son',
  surveillance: 'Surveillance',
  bateau: 'Bateau',
  marqueur: 'Marqueur',
};

export const DEFAULT_SHORTCUTS: Record<ToolKey, string> = {
  select: 'v',
  regle: 'r',
  artifice: 'a',
  zone_public: 'p',
  zone_perso: 'z',
  barrierage: 'b',
  sortie: 'o',
  accueil_secours: 'q',
  point_eau: 'e',
  extincteur: 'w',
  son: 's',
  surveillance: 'g',
  bateau: 'f',
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
  company: { ...EMPTY_COMPANY },
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
    company: sanitizeCompany(src.company),
  };
}
