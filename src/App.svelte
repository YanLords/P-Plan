<script lang="ts">
  import Rail from './lib/Rail.svelte';
  import MapView from './lib/MapView.svelte';
  import Catalog from './lib/Catalog.svelte';
  import Legend from './lib/Legend.svelte';
  import PanelProps from './lib/PanelProps.svelte';
  import { store } from './lib/store.svelte';
  import { LS_KEY } from './lib/store.svelte';
  import { savePlan, openPlan, saveFile, slug } from './lib/files';
  import { buildPdf } from './lib/pdf';

  let mapEl = $state<HTMLDivElement | null>(null);
  let busy = $state(false);
  let toast = $state('');

  // autosave (debounce) : tout changement du plan est persisté localement
  $effect(() => {
    const json = JSON.stringify(store.plan);
    const t = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, json);
      } catch {
        /* quota : l'export fichier reste la sortie de secours */
      }
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
      const bytes = await buildPdf(store.plan, mapEl, mapEl?.clientWidth ?? 900);
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
    const t = e.target as HTMLElement | null;
    if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
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
  <Rail {onNew} {onOpen} {onSave} {onPdf} {busy} />

  <div class="work">
    <header class="topbar">
      <input class="title" bind:value={store.plan.titre} spellcheck="false" aria-label="Titre du plan" />
      <label class="date">
        <span>Date</span>
        <input type="date" bind:value={store.plan.date} />
      </label>
      <div class="stats">
        <span><b>{store.artifices.length}</b> artifices</span>
        <span><b>{store.maxDs}</b> m DS max</span>
        <span><b>{store.plan.elements.length}</b> éléments</span>
      </div>
    </header>

    <div class="stage">
      <div class="map" bind:this={mapEl}></div>
      <MapView el={mapEl} />
      <Catalog />
      <Legend />
      <PanelProps />
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

  .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 5px 8px;
    min-width: 200px;
    max-width: 380px;
    flex: 0 1 auto;
    outline: none;
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
