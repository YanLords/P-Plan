import type { Update } from '@tauri-apps/plugin-updater';

/** Délai minimal entre deux redémarrages (garde-fou anti-boucle). */
export const RESTART_COOLDOWN_MS = 20_000;
const RESTART_KEY = 'plan-de-feu:last-restart';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Secondes restantes avant de pouvoir redémarrer (0 = autorisé). */
export function restartCooldown(): number {
  try {
    const last = Number(localStorage.getItem(RESTART_KEY) ?? 0);
    const left = RESTART_COOLDOWN_MS - (Date.now() - last);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  } catch {
    return 0;
  }
}

function markRestart(): void {
  try {
    localStorage.setItem(RESTART_KEY, String(Date.now()));
  } catch {
    /* stockage indisponible : le garde-fou est simplement inactif */
  }
}

export type UpdateState = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'ready' | 'error';

class UpdaterStore {
  /** version installée, lue au démarrage */
  version = $state('');
  state = $state<UpdateState>('idle');
  /** version proposée + notes de version */
  next = $state<{ version: string; notes: string } | null>(null);
  progress = $state(0);
  message = $state('');
  busy = $state(false);
  /** secondes de garde-fou avant redémarrage */
  cooldown = $state(0);

  #update: Update | null = null;

  async init(): Promise<void> {
    this.cooldown = restartCooldown();
    if (!isTauri()) return;
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      this.version = await getVersion();
    } catch {
      /* version inconnue : l'interface reste utilisable */
    }
  }

  /** Vérifie les mises à jour ; `silent` évite de déranger au démarrage. */
  async check(silent = false): Promise<void> {
    if (!isTauri()) {
      if (!silent) {
        this.state = 'error';
        this.message = 'Les mises à jour ne sont disponibles que dans l’application installée.';
      }
      return;
    }
    if (this.busy) return;
    this.state = 'checking';
    this.busy = true;
    if (!silent) this.message = '';
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        this.#update = null;
        this.next = null;
        this.state = 'uptodate';
        return;
      }
      this.#update = update;
      this.next = { version: update.version, notes: (update.body ?? '').trim() };
      this.state = 'available';
    } catch (err) {
      this.state = 'error';
      this.message = silent ? '' : `Vérification impossible : ${String(err)}`;
    } finally {
      this.busy = false;
    }
  }

  /** Télécharge et installe la mise à jour, puis redémarre (avec garde-fou). */
  async install(): Promise<void> {
    if (!this.#update || this.busy) return;
    const wait = restartCooldown();
    if (wait > 0) {
      this.cooldown = wait;
      this.message = `Redémarrage déjà demandé — patientez ${wait} s.`;
      return;
    }
    this.busy = true;
    this.state = 'downloading';
    this.progress = 0;
    this.message = '';
    try {
      let total = 0;
      let done = 0;
      await this.#update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          this.progress = total ? Math.min(99, Math.round((done / total) * 100)) : 0;
        } else if (event.event === 'Finished') {
          this.progress = 100;
        }
      });
      this.state = 'ready';
      await this.restart();
    } catch (err) {
      this.state = 'error';
      this.message = `Installation impossible : ${String(err)}`;
    } finally {
      this.busy = false;
    }
  }

  /** Redémarre l'application, en refusant un second redémarrage trop rapproché. */
  async restart(): Promise<boolean> {
    const wait = restartCooldown();
    if (wait > 0) {
      this.cooldown = wait;
      this.message = `L’application vient de redémarrer — réessayez dans ${wait} s.`;
      return false;
    }
    markRestart();
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
      return true;
    } catch (err) {
      this.message = `Redémarrage impossible : ${String(err)}`;
      return false;
    }
  }

  /** Mise à jour du compte à rebours affiché (appelée par l'interface). */
  tick(): void {
    const wait = restartCooldown();
    if (wait !== this.cooldown) this.cooldown = wait;
  }
}

export const updater = new UpdaterStore();
