<script lang="ts">
  import { store } from './store.svelte';
  import { settings } from './settings.svelte';
  import { KIND_META, RULER, TOOL_ORDER, kindIcon, type Kind } from './elements';

  let {
    onNew,
    onOpen,
    onSave,
    onPdf,
    onSettings,
    busy = false,
  }: {
    onNew: () => void;
    onOpen: () => void;
    onSave: () => void;
    onPdf: () => void;
    onSettings: () => void;
    busy?: boolean;
  } = $props();

  const TOOL_ICON: Record<Kind, string> = Object.fromEntries(TOOL_ORDER.map((k) => [k, kindIcon(k)])) as Record<
    Kind,
    string
  >;

  // Zone public : un appui prolongé ouvre le choix zone / icône (comme les outils cachés de Photoshop)
  const HOLD_MS = 450;
  let menuOpen = $state(false);
  // le menu est en position fixe (le rail coupe son débordement) : on le place à la sortie du bouton
  let menuPos = $state({ x: 0, y: 0 });
  let wrap: HTMLElement | undefined = $state();
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let held = false;

  function holdStart(k: Kind) {
    if (k !== 'zone_public') return;
    held = false;
    holdTimer = setTimeout(() => {
      held = true;
      const r = wrap?.getBoundingClientRect();
      if (r) menuPos = { x: r.right + 6, y: r.top };
      menuOpen = true;
    }, HOLD_MS);
  }

  function holdEnd() {
    clearTimeout(holdTimer);
  }

  function clickTool(k: Kind) {
    // le clic qui suit un appui prolongé ne doit pas changer d'outil
    if (held) {
      held = false;
      return;
    }
    store.setTool(k);
  }

  function pickPublic(icon: boolean) {
    store.setPublicIcon(icon);
    store.setTool('zone_public');
    menuOpen = false;
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (menuOpen && !(e.target as HTMLElement).closest('.pub-wrap')) menuOpen = false;
  }}
/>

<aside class="rail">
  <div class="brand" title="Planete Plan">
    <img class="brand-icon" src="/app-icon.png" alt="Planete Plan" width="34" height="34" />
    <span class="brand-name">Planete Plan</span>
  </div>

  <nav class="tools">
    <button
      class="item"
      class:active={store.tool === 'select'}
      onclick={() => store.setTool('select')}
      title={`Sélection (${settings.value.shortcuts.select || '—'})`}
    >
      <span class="ico" style="--c:#6B6B6B">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="m4 3 7 17 2.4-6.6L20 11z" />
        </svg>
      </span>
      <span class="lbl">Sélect.</span>
    </button>

    <button
      class="item"
      class:active={store.tool === 'regle'}
      onclick={() => store.setTool('regle')}
      title={`Règle (${settings.value.shortcuts.regle || '—'})`}
    >
      <span class="ico" style="--c:{RULER.color}">{@html RULER.icon}</span>
      <span class="lbl">Règle</span>
    </button>

    {#each TOOL_ORDER as k}
      {#if k === 'zone_public'}
        <div class="pub-wrap" bind:this={wrap}>
          <button
            class="item"
            class:active={store.tool === k}
            onclick={() => clickTool(k)}
            onpointerdown={() => holdStart(k)}
            onpointerup={holdEnd}
            onpointerleave={holdEnd}
            title={`${KIND_META[k].label} — Tab bascule zone / icône, appui prolongé pour choisir (${settings.value.shortcuts[k] || '—'})`}
          >
            <span class="ico" style="--c:{KIND_META[k].color}">{@html TOOL_ICON[k]}</span>
            <span class="lbl">{store.publicIcon ? 'Icône public' : KIND_META[k].label}</span>
          </button>
          {#if menuOpen}
            <div class="pub-menu" role="menu" style="left: {menuPos.x}px; top: {menuPos.y}px">
              <button role="menuitem" class:on={!store.publicIcon} onclick={() => pickPublic(false)}>Zone public</button>
              <button role="menuitem" class:on={store.publicIcon} onclick={() => pickPublic(true)}>Icône zone public</button>
            </div>
          {/if}
        </div>
      {:else}
        <button
          class="item"
          class:active={store.tool === k}
          onclick={() => clickTool(k)}
          title={`${KIND_META[k].label} (${settings.value.shortcuts[k] || '—'})`}
        >
          <span class="ico" style="--c:{KIND_META[k].color}">{@html TOOL_ICON[k]}</span>
          <span class="lbl">{KIND_META[k].label}</span>
        </button>
      {/if}
    {/each}
  </nav>

  <div class="spacer"></div>

  <div class="actions">
    <button class="item" onclick={onNew} title="Nouveau plan">
      <span class="ico" style="--c:#6B6B6B">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      </span>
      <span class="lbl">Nouveau</span>
    </button>
    <button class="item" onclick={onOpen} title="Ouvrir un plan (.json)">
      <span class="ico" style="--c:#6B6B6B">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z" /><path d="M3 7V6a2 2 0 0 1 2-2h4l2 3" /></svg>
      </span>
      <span class="lbl">Ouvrir</span>
    </button>
    <button class="item" onclick={onSave} title="Enregistrer le plan (.json)">
      <span class="ico" style="--c:#6B6B6B">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3" /><path d="M8 14h8v7H8z" /></svg>
      </span>
      <span class="lbl">Sauver</span>
    </button>
    <button class="item" class:busy onclick={onPdf} disabled={busy} title="Exporter en PDF (⌘E / Ctrl+E)">
      <span class="ico" style="--c:var(--accent)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11" /><path d="m7.5 10 4.5 4.5 4.5-4.5" /><path d="M4 18h16" /></svg>
      </span>
      <span class="lbl">PDF</span>
    </button>
    <button class="item" onclick={onSettings} title="Réglages">
      <span class="ico" style="--c:#6B6B6B">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
      </span>
      <span class="lbl">Réglages</span>
    </button>
  </div>
</aside>

<style>
  .rail {
    width: var(--sidebar-width);
    height: 100%;
    flex: none;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--sidebar-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    gap: 6px;
    overflow-y: auto;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    margin-bottom: 8px;
    padding: 0 4px;
  }

  .brand-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: block;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  .brand-name {
    font-family: 'Inter', var(--font-family);
    font-weight: 900;
    font-size: 9.5px;
    line-height: 1.05;
    letter-spacing: -0.3px;
    text-align: center;
    color: var(--text-primary);
    text-transform: none;
  }

  .tools,
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .item {
    width: 60px;
    padding: 5px 0 4px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: var(--text-secondary);
    transition: background 0.15s ease;
  }

  .pub-wrap {
    position: relative;
  }

  .pub-menu {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--sidebar-bg);
    border: 1px solid var(--sidebar-border);
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
  }

  .pub-menu button {
    padding: 7px 12px;
    border: none;
    border-radius: 7px;
    background: none;
    font: inherit;
    font-size: 13px;
    white-space: nowrap;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
  }

  .pub-menu button:hover {
    background: #f0f0f0;
  }

  .pub-menu button.on {
    background: var(--accent-light);
  }

  .item:hover {
    background: #f0f0f0;
    color: var(--text-primary);
  }

  .item.active {
    background: var(--accent-light);
  }

  .item.active .lbl {
    color: #a35c14;
    font-weight: 600;
  }

  .item:disabled {
    opacity: 0.55;
  }

  .ico {
    color: var(--c);
    line-height: 0;
  }

  .lbl {
    font-size: 9px;
    letter-spacing: 0.1px;
    /* les libellés longs (« Voie accès secours ») passent sur 2 lignes */
    line-height: 1.1;
    text-align: center;
    text-wrap: balance;
    max-width: 100%;
    overflow-wrap: break-word;
  }

  .spacer {
    flex: 1;
    min-height: 8px;
  }

  .actions {
    border-top: 1px solid var(--sidebar-border);
    padding-top: 6px;
  }
</style>
