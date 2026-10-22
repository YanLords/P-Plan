<script lang="ts">
  import Rail from './lib/Rail.svelte';
  import MapView from './lib/MapView.svelte';
  import Legend from './lib/Legend.svelte';
  import PanelProps from './lib/PanelProps.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import { store } from './lib/store.svelte';
  import { LS_KEY } from './lib/store.svelte';
  import { settings } from './lib/settings.svelte';
  import { savePlan, openPlan, saveFile, slug } from './lib/files';
  import { buildPdf } from './lib/pdf';

  let mapEl = $state<HTMLDivElement | null>(null);
  let mapView = $state<{
    setPrintBoost: (on: boolean, mapWidthMm?: number) => void;
    setPrintFit: (aspect: number, on: boolean) => Promise<number | void>;
  } | null>(null);
  let busy = $state(false);
  let toast = $state('');
  let showSettings = $state(false);

  // taille de l'interface demandée dans les réglages
  $effect(() => {
    document.documentElement.style.zoom = String(settings.value.uiScale);
  });

  // autosave + point de retour undo (debounce) : tout changement du plan est persisté localement
  $effect(() => {
    const json = JSON.stringify(store.plan);
    const t = setTimeout(() => {
      if (settings.value.autosave) {
        try {
          localStorage.setItem(LS_KEY, json);
        } catch {
          /* quota : l'export fichier reste la sortie de secours */
        }
      }
      store.snapshot();
    }, 400);
    return () => clearTimeout(t);
  });

  function notify(msg: string) {
    toast = msg;
    setTimeout(() => (toast = ''), 2800);
  }

  async function onSave() {
    try {
      const p = await savePlan(store.plan);
      if (p) notify('Plan enregistré');
    } catch (e) {
      console.error(e);
      notify('Enregistrement impossible');
    }
  }

  async function onOpen() {
    try {
      const p = await openPlan();
      if (p) {
        store.loadPlan(p);
        notify('Plan ouvert');
      }
    } catch (e) {
      console.error(e);
      notify('Fichier de plan illisible');
    }
  }

  async function onPdf() {
    busy = true;
    try {
      const bytes = await buildPdf(
        store.plan,
        mapEl,
        mapEl?.clientWidth ?? 900,
        (on, mm) => mapView?.setPrintBoost(on, mm),
        (aspect, on) => mapView?.setPrintFit(aspect, on) ?? Promise.resolve(),
        settings.value.company
      );
      const name = `${slug(store.plan.titre)}-${store.plan.date}.pdf`;
      const path = await saveFile(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
      if (path) notify('PDF exporté');
    } catch (e) {
      console.error(e);
      notify('Export PDF impossible');
    } finally {
      busy = false;
    }
  }

  function onNew() {
    if (
      store.plan.elements.length &&
      !confirm('Créer un nouveau plan ? Le plan courant sera remplacé (exportez-le avant si besoin).')
    )
      return;
    store.newPlan();
    notify('Nouveau plan');
  }

  function onKey(e: KeyboardEvent) {
    if (showSettings) return;

    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && (key === 'z' || key === 'y')) {
      e.preventDefault();
      const redone = key === 'y' || e.shiftKey;
      if (redone) {
        if (store.redo()) notify('Rétabli');
      } else if (store.undo()) {
        notify('Annulé');
      }
      return;
    }

    const t = e.target as HTMLElement | null;
    if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;

    // raccourcis d'outils (touches simples, configurables dans les réglages)
    if (!mod && !e.altKey && e.key.length === 1) {
      const tool = settings.toolFor(e.key);
      if (tool) {
        e.preventDefault();
        store.setTool(tool);
        return;
      }
    }

    if (e.key === 'Escape') {
      if (store.draft.length) store.cancelDraft();
      else store.select(null);
    } else if (e.key === 'Enter' && store.draft.length) {
      store.finishDraft();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && store.selection) {
      store.remove(store.selection);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <Rail {onNew} {onOpen} {onSave} {onPdf} {busy} onSettings={() => (showSettings = true)} />

  <div class="work">
    <header class="topbar">
      <div class="titles">
        <input class="title" bind:value={store.plan.titre} spellcheck="false" aria-label="Titre du plan" />
        <input
          class="site"
          bind:value={store.plan.site}
          spellcheck="false"
          placeholder="Lieu : ville, adresse, lieu-dit…"
          aria-label="Lieu du spectacle (ville, adresse)"
          title="Lieu du spectacle — ville et adresse imprimées sur le plan"
        />
      </div>
      <label class="date">
        <span>Date</span>
        <input type="date" bind:value={store.plan.date} />
      </label>
      <div class="stats">
        <span><b>{store.artifices.length}</b> artifices</span>
        <span><b>{store.maxDs}</b> m DS max</span>
        <span><b>{store.plan.elements.length}</b> éléments</span>
      </div>

      <div class="history">
        <button onclick={() => store.undo()} disabled={!store.hasUndo} title="Annuler (⌘Z)" aria-label="Annuler">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h9a6 6 0 0 1 0 12h-3" /></svg>
        </button>
        <button onclick={() => store.redo()} disabled={!store.hasRedo} title="Rétablir (⇧⌘Z)" aria-label="Rétablir">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9h-9a6 6 0 0 0 0 12h3" /></svg>
        </button>
      </div>
    </header>

    <div class="stage">
      <div class="map" bind:this={mapEl}></div>
      <MapView el={mapEl} bind:this={mapView} />
      {#if settings.value.showLegend}
        <Legend />
      {/if}
      <PanelProps />
      {#if showSettings}
        <SettingsPanel onClose={() => (showSettings = false)} />
      {/if}
      {#if busy}
        <div class="busy">Génération du PDF…</div>
      {/if}
      {#if toast}
        <div class="toast">{toast}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .app {
    display: flex;
    width: 100%;
    height: 100%;
    background: var(--bg-app);
  }

  .work {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border-card);
    background: #fff;
  }

  .titles {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 200px;
    max-width: 380px;
    flex: 0 1 auto;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 4px 8px 2px;
    width: 340px;
    min-width: 200px;
    max-width: 380px;
    flex: 0 1 auto;
    outline: none;
  }

  .site {
    font-size: 11px;
    color: var(--text-muted);
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0 8px 4px;
    width: 340px;
    min-width: 200px;
    max-width: 380px;
    outline: none;
  }

  .site:hover,
  .site:focus {
    background: var(--bg-surface);
    border-color: var(--border);
    color: var(--text-primary);
  }

  .title:hover {
    background: var(--bg-surface);
  }

  .title:focus {
    border-color: var(--accent);
    background: #fff;
  }

  .date {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .date input {
    border: 1px solid var(--border-card);
    border-radius: 7px;
    padding: 3px 6px;
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-surface);
  }

  .stats {
    margin-left: auto;
    display: flex;
    gap: 14px;
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .stats b {
    color: var(--text-primary);
    font-weight: 600;
  }

  .history {
    display: flex;
    gap: 2px;
    padding-left: 12px;
    border-left: 1px solid var(--border-card);
  }

  .history button {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    color: var(--text-secondary);
  }

  .history button:hover:not(:disabled) {
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .history button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .map {
    position: absolute;
    inset: 0;
    background: #eef1f3;
  }

  .busy,
  .toast {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 900;
    background: #1a1a1a;
    color: #fff;
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 999px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .busy {
    top: 14px;
  }

  .toast {
    bottom: 16px;
  }
</style>
