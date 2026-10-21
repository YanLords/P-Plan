import type { Company, ToolKey, ToolSettings } from './settings-model';
import {
  DEFAULT_SETTINGS,
  assignShortcut,
  sanitizeCompany,
  sanitizeSettings,
  toolForShortcut,
} from './settings-model';

const LS_KEY = 'plan-de-feu:settings';

function load(): ToolSettings {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'));
  } catch {
    return sanitizeSettings(null);
  }
}

class SettingsStore {
  value = $state<ToolSettings>(load());

  #persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.value));
    } catch {
      /* quota : les réglages restent valables pour la session */
    }
  }

  set<K extends keyof ToolSettings>(key: K, value: ToolSettings[K]) {
    this.value[key] = value;
    this.#persist();
  }

  setShortcut(tool: ToolKey, rawKey: string) {
    this.value.shortcuts = assignShortcut(this.value.shortcuts, tool, rawKey);
    this.#persist();
  }

  setCompany(patch: Partial<Company>) {
    this.value.company = sanitizeCompany({ ...this.value.company, ...patch });
    this.#persist();
  }

  toolFor(key: string): ToolKey | null {
    return toolForShortcut(this.value.shortcuts, key);
  }

  reset() {
    // les coordonnées de l'entreprise sont une identité, pas un réglage d'affichage
    const company = this.value.company;
    this.value = { ...sanitizeSettings(DEFAULT_SETTINGS), company };
    this.#persist();
  }
}

export const settings = new SettingsStore();
