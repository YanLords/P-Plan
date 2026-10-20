<script lang="ts">
  import { settings } from './settings.svelte';
  import {
    SHORTCUT_LABELS,
    SHORTCUT_ORDER,
    UI_SCALE_MAX,
    UI_SCALE_MIN,
    UI_SCALE_STEP,
    clampScale,
    type ToolKey,
  } from './settings-model';

  let { onClose }: { onClose: () => void } = $props();

  function capture(tool: ToolKey, e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Shift') return;
    e.preventDefault();
    if (e.key === 'Backspace' || e.key === 'Delete') settings.setShortcut(tool, '');
    else settings.setShortcut(tool, e.key);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="backdrop"
  role="presentation"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Réglages" tabindex="-1">
    <header>
      <h2>Réglages</h2>
      <button class="close" onclick={onClose} aria-label="Fermer">×</button>
    </header>

    <div class="body">
      <section>
        <h3>Interface</h3>

        <div class="row">
          <label for="ui-scale">Taille de l’interface</label>
          <div class="scale">
            <input
              id="ui-scale"
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={settings.value.uiScale}
              oninput={(e) => settings.set('uiScale', clampScale(e.currentTarget.valueAsNumber))}
            />
            <output>{Math.round(settings.value.uiScale * 100)} %</output>
            <button class="ghost" onclick={() => settings.set('uiScale', 1)}>défaut</button>
          </div>
        </div>

        <div class="row">
          <label for="default-base">Fond de carte par défaut</label>
          <select
            id="default-base"
            value={settings.value.defaultBase}
            onchange={(e) => settings.set('defaultBase', e.currentTarget.value as 'osm' | 'sat')}
          >
            <option value="osm">Plan (OpenStreetMap)</option>
            <option value="sat">Satellite (Esri)</option>
          </select>
        </div>
      </section>

      <section>
        <h3>Affichage</h3>

        <div class="row">
          <span>Cercles de distance de sécurité</span>
          <button
            class="switch"
            aria-label="Afficher les cercles de distance de sécurité"
            role="switch"
            aria-checked={settings.value.showRings}
            class:on={settings.value.showRings}
            onclick={() => settings.set('showRings', !settings.value.showRings)}
          >
            <span></span>
          </button>
        </div>

        <div class="row">
          <span>Légende à l’écran</span>
          <button
            class="switch"
            aria-label="Afficher la légende à l’écran"
            role="switch"
            aria-checked={settings.value.showLegend}
            class:on={settings.value.showLegend}
            onclick={() => settings.set('showLegend', !settings.value.showLegend)}
          >
            <span></span>
          </button>
        </div>

        <div class="row">
          <span>Étiquettes au survol</span>
          <button
            class="switch"
            aria-label="Afficher les étiquettes au survol"
            role="switch"
            aria-checked={settings.value.showLabels}
            class:on={settings.value.showLabels}
            onclick={() => settings.set('showLabels', !settings.value.showLabels)}
          >
            <span></span>
          </button>
        </div>
      </section>

      <section>
        <h3>Édition</h3>

        <div class="row">
          <span>Demander confirmation avant suppression</span>
          <button
            class="switch"
            aria-label="Demander confirmation avant suppression"
            role="switch"
            aria-checked={settings.value.confirmDelete}
            class:on={settings.value.confirmDelete}
            onclick={() => settings.set('confirmDelete', !settings.value.confirmDelete)}
          >
            <span></span>
          </button>
        </div>

        <div class="row">
          <span>Sauvegarde automatique locale</span>
          <button
            class="switch"
            aria-label="Sauvegarde automatique locale"
            role="switch"
            aria-checked={settings.value.autosave}
            class:on={settings.value.autosave}
            onclick={() => settings.set('autosave', !settings.value.autosave)}
          >
            <span></span>
          </button>
        </div>
      </section>

      <section>
        <h3>Raccourcis clavier</h3>
        <p class="note">Cliquez un champ puis appuyez sur une touche. <kbd>Retour arrière</kbd> pour désactiver.</p>
        <ul class="keys">
          {#each SHORTCUT_ORDER as tool (tool)}
            <li>
              <span>{SHORTCUT_LABELS[tool]}</span>
              <input
                class="key"
                readonly
                value={settings.value.shortcuts[tool]}
                placeholder="—"
                aria-label={`Raccourci ${SHORTCUT_LABELS[tool]}`}
                onkeydown={(e) => capture(tool, e)}
                onfocus={(e) => e.currentTarget.select()}
              />
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <footer>
      <button class="ghost" onclick={() => settings.reset()}>Réinitialiser les réglages</button>
      <button class="primary" onclick={onClose}>Terminé</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(20, 20, 20, 0.28);
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .panel {
    width: min(560px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 14px;
    border: 1px solid var(--border-card);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-card);
  }

  h2 {
    font-size: 14px;
    font-weight: 600;
  }

  .close {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    font-size: 17px;
    line-height: 1;
    color: var(--text-muted);
  }

  .close:hover {
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .body {
    overflow-y: auto;
    padding: 4px 16px 12px;
  }

  section {
    padding: 12px 0;
    border-bottom: 1px solid #f1f1f1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  section:last-child {
    border-bottom: none;
  }

  h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted);
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 30px;
  }

  .row label {
    font-size: 12.5px;
    color: var(--text-primary);
  }

  select {
    border: 1px solid var(--border-card);
    border-radius: 7px;
    padding: 5px 8px;
    font-size: 12px;
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .scale {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scale input[type='range'] {
    width: 150px;
    accent-color: var(--accent);
  }

  .scale output {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    min-width: 40px;
    text-align: right;
  }

  .ghost {
    font-size: 11px;
    color: var(--text-secondary);
    border: 1px solid var(--border-card);
    border-radius: 7px;
    padding: 4px 8px;
    background: #fff;
  }

  .ghost:hover {
    background: var(--bg-surface);
  }

  .switch {
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: #e3e3e3;
    position: relative;
    transition: background 0.15s ease;
    flex: none;
  }

  .switch span {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s ease;
  }

  .switch.on {
    background: var(--accent);
  }

  .switch.on span {
    transform: translateX(16px);
  }

  .note {
    font-size: 11px;
    color: var(--text-muted);
  }

  kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    border: 1px solid var(--border-card);
    border-radius: 4px;
    padding: 1px 4px;
  }

  .keys {
    list-style: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
  }

  .keys li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .key {
    width: 38px;
    text-align: center;
    text-transform: uppercase;
    font-family: var(--font-mono);
    font-size: 12px;
    border: 1px solid var(--border-card);
    border-radius: 6px;
    padding: 3px 0;
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
  }

  .key:focus {
    border-color: var(--accent);
    background: var(--accent-light);
    color: #a35c14;
  }

  footer {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-card);
    background: var(--bg-surface);
  }

  .primary {
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border-radius: 8px;
    padding: 7px 14px;
  }

  .primary:hover {
    background: var(--accent-hover);
  }
</style>
