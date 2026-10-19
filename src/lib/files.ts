import type { Plan } from './elements';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Enregistre un fichier : dialogue natif sous Tauri, téléchargement dans un navigateur. */
export async function saveFile(defaultName: string, data: string | Uint8Array, filters: FileFilter[]) {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile, writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: defaultName, filters });
    if (!path) return null;
    if (typeof data === 'string') await writeTextFile(path, data);
    else await writeFile(path, data);
    return path;
  }
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: 'application/json' })
      : new Blob([data as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return defaultName;
}

export async function savePlan(plan: Plan) {
  const name = `${slug(plan.titre)}-${plan.date}.planfeu.json`;
  return saveFile(name, JSON.stringify(plan, null, 2), [{ name: 'Plan de feu', extensions: ['json'] }]);
}

/** Ouvre un plan depuis un fichier. Renvoie null si annulé. */
export async function openPlan(): Promise<Plan | null> {
  let text: string | null = null;
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, filters: [{ name: 'Plan de feu', extensions: ['json'] }] });
    if (!path) return null;
    text = await readTextFile(path as string);
  } else {
    text = await new Promise<string | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? await f.text() : null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
  if (!text) return null;
  const plan = JSON.parse(text) as Plan;
  if (plan?.version !== 1 || !Array.isArray(plan.elements)) throw new Error('Fichier de plan invalide');
  return plan;
}

export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'plan'
  );
}
