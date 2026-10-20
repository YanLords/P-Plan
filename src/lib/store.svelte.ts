import type { Kind, PElement, Plan } from './elements';
import { KIND_META } from './elements';
import { History } from './history';
import { snapDistance } from './geo';

export const LS_KEY = 'plan-de-feu:autosave';

export function emptyPlan(): Plan {
  return {
    version: 1,
    titre: 'Plan de disposition',
    date: new Date().toISOString().slice(0, 10),
    center: [46.6, 2.4],
    zoom: 5,
    base: 'osm',
    elements: [],
  };
}

function loadLocal(): Plan {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Plan;
      if (p?.version === 1 && Array.isArray(p.elements)) return p;
    }
  } catch {
    /* autosave illisible : on repart d'un plan vide */
  }
  return emptyPlan();
}

class PlanStore {
  plan = $state<Plan>(loadLocal());
  tool = $state<Kind | 'select'>('select');
  selection = $state<string | null>(null);
  /** sommets en cours de tracé (barriérage / zone public) */
  draft = $state<[number, number][]>([]);
  hasUndo = $state(false);
  hasRedo = $state(false);

  #hist = new History(JSON.stringify(loadLocal()));

  /** Point de retour : à appeler après stabilisation (debounce) d'une modification. */
  snapshot() {
    if (this.#hist.record(JSON.stringify(this.plan))) this.#syncFlags();
  }

  undo(): boolean {
    const prev = this.#hist.undo(JSON.stringify(this.plan));
    if (prev === null) return false;
    this.#apply(prev);
    return true;
  }

  redo(): boolean {
    const next = this.#hist.redo(JSON.stringify(this.plan));
    if (next === null) return false;
    this.#apply(next);
    return true;
  }

  #apply(json: string) {
    this.plan = JSON.parse(json) as Plan;
    this.selection = null;
    this.draft = [];
    this.#syncFlags();
  }

  #syncFlags() {
    this.hasUndo = this.#hist.canUndo;
    this.hasRedo = this.#hist.canRedo;
  }

  #resetHistory() {
    this.#hist = new History(JSON.stringify(this.plan));
    this.#syncFlags();
  }

  get selected(): PElement | undefined {
    return this.plan.elements.find((e) => e.id === this.selection);
  }

  get artifices(): PElement[] {
    return this.plan.elements.filter((e) => e.kind === 'artifice');
  }

  get maxDs(): number {
    return this.artifices.reduce((m, e) => Math.max(m, e.ds ?? 0), 0);
  }

  setTool(t: Kind | 'select') {
    this.tool = t;
    this.draft = [];
    if (t !== 'select') this.selection = null;
  }

  setBase(base: 'osm' | 'sat') {
    this.plan.base = base;
  }

  select(id: string | null) {
    this.selection = id;
  }

  addPoint(kind: Kind, at: [number, number], extra: Partial<PElement> = {}) {
    const el: PElement = {
      id: crypto.randomUUID(),
      kind,
      label: KIND_META[kind].label,
      lat: at[0],
      lng: at[1],
      ...extra,
      // lat/lng/id/kind jamais écrasés par extra
      ...{},
    };
    el.lat = at[0];
    el.lng = at[1];
    el.kind = kind;
    // artifice générique : périmètre de sécurité par défaut, réglable à la poignée
    if (kind === 'artifice' && el.ds == null) el.ds = 20;
    this.plan.elements.push(el);
    this.selection = el.id;
    return el;
  }

  /** Ajoute un sommet au tracé en cours. */
  addVertex(at: [number, number]) {
    this.draft = [...this.draft, at];
  }

  /** Termine le tracé en cours : crée le barriérage (≥2 pts) ou la zone (≥3 pts). */
  finishDraft(): boolean {
    const ring = this.draft;
    const kind: Kind | null = this.tool === 'zone_public' ? 'zone_public' : this.tool === 'barrierage' ? 'barrierage' : null;
    if (!kind) return false;
    const min = kind === 'zone_public' ? 3 : 2;
    if (ring.length < min) return false;
    const el: PElement = {
      id: crypto.randomUUID(),
      kind,
      label: KIND_META[kind].label,
      lat: ring[0][0],
      lng: ring[0][1],
      ring: ring.map((p) => [...p] as [number, number]),
    };
    this.plan.elements.push(el);
    this.draft = [];
    this.selection = el.id;
    this.tool = 'select';
    return true;
  }

  cancelDraft() {
    this.draft = [];
  }

  moveTo(id: string, at: [number, number]) {
    const el = this.plan.elements.find((e) => e.id === id);
    if (!el) return;
    el.lat = at[0];
    el.lng = at[1];
  }

  moveVertex(id: string, index: number, at: [number, number]) {
    const el = this.plan.elements.find((e) => e.id === id);
    if (!el?.ring?.[index]) return;
    el.ring[index] = at;
  }

  /** Rayon de sécurité (m) réglé à la souris : 1 m près < 25 m, pas de 5 m ensuite. */
  setRadius(id: string, meters: number) {
    const el = this.plan.elements.find((e) => e.id === id);
    if (!el) return;
    el.ds = snapDistance(meters);
  }

  update(id: string, patch: Partial<PElement>) {
    const el = this.plan.elements.find((e) => e.id === id);
    if (!el) return;
    Object.assign(el, patch);
  }

  remove(id: string) {
    this.plan.elements = this.plan.elements.filter((e) => e.id !== id);
    if (this.selection === id) this.selection = null;
  }

  newPlan() {
    this.plan = emptyPlan();
    this.selection = null;
    this.draft = [];
    this.tool = 'select';
    this.#resetHistory();
  }

  loadPlan(p: Plan) {
    this.plan = p;
    this.selection = null;
    this.draft = [];
    this.tool = 'select';
    this.#resetHistory();
  }

  toJson(): string {
    return JSON.stringify(this.plan, null, 2);
  }

  saveLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.plan));
    } catch {
      /* quota plein : l'export fichier reste la sortie de secours */
    }
  }
}

export const store = new PlanStore();
