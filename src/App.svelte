<script lang="ts">
  import Rail from './lib/Rail.svelte';
  import MapView from './lib/MapView.svelte';
  import Legend from './lib/Legend.svelte';
  import PanelProps from './lib/PanelProps.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import UpdateToast from './lib/UpdateToast.svelte';
  import WhatsNew from './lib/WhatsNew.svelte';
  import { store } from './lib/store.svelte';
  import { LS_KEY } from './lib/store.svelte';
  import { settings } from './lib/settings.svelte';
  import { savePlan, openPlan, saveFile, slug, takePendingPlans } from './lib/files';
  import { buildPdf } from './lib/pdf';
  import { updater } from './lib/updater.svelte';
  import { onMount } from 'svelte';

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

  // version installée + recherche silencieuse au démarrage, puis toutes les 4 h
  onMount(() => {
    updater.init().then(() => updater.check(true));
    const id = setInterval(() => updater.check(true), 4 * 60 * 60 * 1000);
    return () => clearInterval(id);
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

  // plan ouvert par double-clic dans le Finder / l'Explorateur (ou « Ouvrir avec »)
  async function loadOpenedPlans() {
    let plans;
    try {
      plans = await takePendingPlans();
    } catch (e) {
      console.error(e);
      notify('Fichier de plan illisible');
      return;
    }
    const p = plans.at(-1);
    if (!p) return;
    if (
      store.plan.elements.length &&
      !confirm('Ouvrir ce plan ? Le plan courant sera remplacé (enregistrez-le avant si besoin).')
    )
      return;
    store.loadPlan(p);
    notify('Plan ouvert');
  }

  // écoute les ouvertures pendant que l'app tourne, et lit celles reçues au démarrage
  onMount(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen('plan-opened', () => void loadOpenedPlans()).then((f) => (unlisten = f))
    );
    void loadOpenedPlans();
    return () => unlisten?.();
  });

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
    // réglages : ⌘, / Ctrl+,
    if (mod && key === ',') {
      e.preventDefault();
      showSettings = true;
      return;
    }
    // nouveau plan : ⌘N / Ctrl+N
    if (mod && key === 'n') {
      e.preventDefault();
      onNew();
      return;
    }
    // enregistrer / ouvrir : ⌘S / Ctrl+S, ⌘O / Ctrl+O
    if (mod && key === 's') {
      e.preventDefault();
      void onSave();
      return;
    }
    if (mod && key === 'o') {
      e.preventDefault();
      void onOpen();
      return;
    }
    // export PDF : ⌘E / Ctrl+E
    if (mod && key === 'e') {
      e.preventDefault();
      if (!busy) void onPdf();
      return;
    }
    const target = e.target as HTMLElement | null;
    const typing = !!target && /^(input|textarea|select)$/i.test(target.tagName);
    if (typing) return;

    // zone public : Tab alterne zone tracée / icône (un clic)
    if (e.key === 'Tab' && store.tool === 'zone_public') {
      e.preventDefault();
      store.setPublicIcon(!store.publicIcon);
      notify(store.publicIcon ? 'Zone public : icône' : 'Zone public : zone');
      return;
    }

    // copier / coller / dupliquer : ⌘C, ⌘V, ⌘D (Ctrl sur Windows)
    if (mod && (key === 'c' || key === 'v' || key === 'd')) {
      if (!store.selection && key !== 'v') return;
      e.preventDefault();
      if (key === 'c') {
        if (store.copy()) notify('Élément copié');
      } else if (key === 'v') {
        const copy = store.paste();
        if (copy) notify('Élément collé');
      } else {
        const copy = store.duplicate();
        if (copy) notify('Élément dupliqué');
      }
      return;
    }

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
      <div class="fields">
        <label class="field g-title">
          <span>Titre du plan</span>
          <input class="title" bind:value={store.plan.titre} spellcheck="false" aria-label="Titre du plan" />
        </label>
        <label class="field g-site">
          <span>Lieu</span>
          <input
            class="site"
            bind:value={store.plan.site}
            spellcheck="false"
            placeholder="Ville, adresse, lieu-dit…"
            aria-label="Lieu du spectacle (ville, adresse)"
            title="Lieu du spectacle — ville et adresse imprimées sur le plan"
          />
        </label>
        <label class="field g-date">
          <span>Date</span>
          <input class="date-input" type="date" bind:value={store.plan.date} aria-label="Date du plan" />
        </label>
      </div>
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
      <UpdateToast />
      <WhatsNew />
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
    height: 64px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border-card);
    background: #fff;
  }

  .fields {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* chaque champ de l'en-tête est cadré : on doit voir où l'on écrit */
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .field > span {
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    padding-left: 2px;
  }

  .g-title {
    flex: 1 1 230px;
    max-width: 380px;
  }

  .g-site {
    flex: 1 1 200px;
    max-width: 360px;
  }

  .g-date {
    flex: none;
    width: 146px;
  }

  .field input {
    width: 100%;
    border: 1px solid var(--border-card);
    border-radius: 8px;
    background: #fff;
    padding: 6px 9px;
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
  }

  .field input::placeholder {
    color: var(--text-muted);
    font-weight: 400;
  }

  .field input:hover {
    border-color: var(--border, #c9c9c9);
  }

  .field input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .title {
    font-size: 14.5px;
    font-weight: 600;
  }

  .site {
    font-size: 12.5px;
    color: var(--text-secondary);
  }

  .date-input {
    font-size: 12.5px;
    font-weight: 500;
    color-scheme: light;
  }

  /* l'icône du calendrier doit se voir, c'est le seul moyen d'ouvrir le sélecteur */
  .date-input::-webkit-calendar-picker-indicator {
    width: 16px;
    height: 16px;
    opacity: 0.8;
    cursor: pointer;
  }

  .date-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
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
