/** Pile d'historique undo/redo sur des snapshots JSON opaques (pas de runes : testable en Node). */
export class History {
  #past: string[] = [];
  #future: string[] = [];
  #current: string;
  #limit: number;

  constructor(initial: string, limit = 100) {
    this.#current = initial;
    this.#limit = limit;
  }

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }

  /** Enregistre un point de retour. Sans changement, ne fait rien. */
  record(snapshot: string): boolean {
    if (snapshot === this.#current) return false;
    this.#past.push(this.#current);
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#future = [];
    this.#current = snapshot;
    return true;
  }

  /** Renvoie l'état précédent (`live` = état affiché courant, mémorisé pour le rétablir). */
  undo(live: string): string | null {
    const prev = this.#past.pop();
    if (prev === undefined) return null;
    this.#future.push(live);
    this.#current = prev;
    return prev;
  }

  redo(live: string): string | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(live);
    this.#current = next;
    return next;
  }
}
