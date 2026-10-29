<script lang="ts">
  import { settings } from './settings.svelte';
  import { logoDataUrl } from './media';
  import { updater } from './updater.svelte';
  import { MAX_LOGO_CHARS, companyIsEmpty, vcardOf } from './settings-model';
  import {
    SHORTCUT_LABELS,
    SHORTCUT_ORDER,
    PIN_SCALE_MAX,
    PIN_SCALE_MIN,
    PIN_SCALE_STEP,
    UI_SCALE_MAX,
    UI_SCALE_MIN,
    UI_SCALE_STEP,
    clampPinScale,
    clampScale,
    type ToolKey,
  } from './settings-model';

  let { onClose }: { onClose: () => void } = $props();

  // compte à rebours du garde-fou de redémarrage
  $effect(() => {
    const id = setInterval(() => updater.tick(), 1000);
    return () => clearInterval(id);
  });

  function capture(tool: ToolKey, e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Shift') return;
    e.preventDefault();
    if (e.key === 'Backspace' || e.key === 'Delete') settings.setShortcut(tool, '');
    else settings.setShortcut(tool, e.key);
  }

  let logoError = $state('');

  async function pickLogo(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    logoError = '';
    try {
      const dataUrl = await logoDataUrl(file);
      if (dataUrl.length > MAX_LOGO_CHARS) {
        logoError = 'Image trop lourde, choisissez un logo plus simple.';
        return;
      }
      settings.setCompany({ logo: dataUrl });
    } catch {
      logoError = 'Format d’image non reconnu (PNG, JPEG, WebP).';
    }
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
          <label for="pin-scale">Taille des icônes</label>
          <div class="scale">
            <input
              id="pin-scale"
              type="range"
              min={PIN_SCALE_MIN}
              max={PIN_SCALE_MAX}
              step={PIN_SCALE_STEP}
              value={settings.value.pinScale}
              oninput={(e) => settings.set('pinScale', clampPinScale(e.currentTarget.valueAsNumber))}
            />
            <output>{Math.round(settings.value.pinScale * 100)} %</output>
            <button class="ghost" onclick={() => settings.set('pinScale', 1)}>défaut</button>
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
        <h3>Entreprise</h3>
        <p class="note">Logo et coordonnées imprimés dans le cartouche du PDF, avec un QR code de contact.</p>

        <div class="logo-row">
          {#if settings.value.company.logo}
            <img class="logo-preview" src={settings.value.company.logo} alt="Logo de l’entreprise" />
          {:else}
            <div class="logo-preview empty">Logo</div>
          {/if}
          <div class="logo-actions">
            <label class="file">
              Choisir une image
              <input type="file" accept="image/*" onchange={pickLogo} />
            </label>
            {#if settings.value.company.logo}
              <button class="link" onclick={() => settings.setCompany({ logo: '' })}>Retirer</button>
            {/if}
          </div>
        </div>
        {#if logoError}<p class="error">{logoError}</p>{/if}

        <label class="field">
          <span>Nom de l’entreprise</span>
          <input
            type="text"
            value={settings.value.company.name}
            oninput={(e) => settings.setCompany({ name: e.currentTarget.value })}
          />
        </label>

        <label class="field">
          <span>Adresse</span>
          <input
            type="text"
            value={settings.value.company.address}
            oninput={(e) => settings.setCompany({ address: e.currentTarget.value })}
          />
        </label>

        <div class="duo">
          <label class="field">
            <span>Téléphone</span>
            <input
              type="tel"
              value={settings.value.company.phone}
              oninput={(e) => settings.setCompany({ phone: e.currentTarget.value })}
            />
          </label>
          <label class="field">
            <span>E-mail</span>
            <input
              type="email"
              value={settings.value.company.email}
              oninput={(e) => settings.setCompany({ email: e.currentTarget.value })}
            />
          </label>
        </div>

        <label class="field">
          <span>Site web</span>
          <input
            type="url"
            value={settings.value.company.website}
            oninput={(e) => settings.setCompany({ website: e.currentTarget.value })}
          />
        </label>

        <div class="row">
          <span>QR code de contact dans le PDF</span>
          <button
            class="switch"
            aria-label="QR code de contact dans le PDF"
            role="switch"
            aria-checked={settings.value.company.qr}
            class:on={settings.value.company.qr}
            onclick={() => settings.setCompany({ qr: !settings.value.company.qr })}
          >
            <span></span>
          </button>
        </div>

        {#if settings.value.company.qr && !companyIsEmpty(settings.value.company)}
          <p class="note mono">{vcardOf(settings.value.company).split('\n').length} lignes vCard · QR généré à l’export</p>
        {/if}
      </section>

      <section>
        <h3>Mises à jour</h3>
        <p class="note">
          Version installée : <b>{updater.version || '—'}</b>
          {#if updater.state === 'uptodate'}· à jour{/if}
        </p>

        {#if updater.next}
          <p class="note">
            Version <b>{updater.next.version}</b> disponible
            {#if updater.next.notes}<br /><span class="release-notes">{updater.next.notes}</span>{/if}
          </p>
        {/if}

        {#if updater.state === 'downloading'}
          <div class="progress" role="progressbar" aria-valuenow={updater.progress} aria-valuemin="0" aria-valuemax="100">
            <span style="width:{updater.progress}%"></span>
          </div>
          <p class="note">Téléchargement… {updater.progress} %</p>
        {/if}

        {#if updater.message}
          <p class="error">{updater.message}</p>
        {/if}

        <div class="update-actions">
          <button class="file" disabled={updater.busy} onclick={() => updater.check()}>
            {updater.busy && updater.state === 'checking' ? 'Vérification…' : 'Vérifier les mises à jour'}
          </button>
          {#if updater.next}
            <button
              class="file primary"
              disabled={updater.busy || updater.cooldown > 0}
              onclick={() => updater.install()}
            >
              {updater.cooldown > 0
                ? `Redémarrage possible dans ${updater.cooldown} s`
                : 'Installer et redémarrer'}
            </button>
          {/if}
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

  .logo-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 10px 0 12px;
  }

  .logo-preview {
    width: 58px;
    height: 58px;
    object-fit: contain;
    border: 1px solid var(--border-card);
    border-radius: 8px;
    background: #fff;
    padding: 4px;
  }

  .logo-preview.empty {
    display: grid;
    place-items: center;
    font-size: 10px;
    color: var(--text-muted);
    border-style: dashed;
  }

  .logo-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }

  .file {
    font-size: 12px;
    color: var(--accent-text, #a35c14);
    border: 1px solid var(--border-card);
    border-radius: 7px;
    padding: 5px 10px;
    cursor: pointer;
    background: #fff;
  }

  .file input {
    display: none;
  }

  .link {
    font-size: 11.5px;
    color: var(--text-muted);
    border: 0;
    background: none;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .field span {
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .field input {
    border: 1px solid var(--border-card);
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 12.5px;
    color: var(--text-primary);
    background: #fff;
    outline: none;
  }

  .field input:focus {
    border-color: var(--accent);
  }

  .duo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .error {
    font-size: 11.5px;
    color: #c0392b;
    margin: 0 0 8px;
  }

  .mono {
    font-variant-numeric: tabular-nums;
  }

  .release-notes {
    font-size: 11px;
    color: var(--text-muted);
  }

  .progress {
    height: 6px;
    border-radius: 999px;
    background: var(--bg-surface, #eee);
    overflow: hidden;
    margin: 6px 0 4px;
  }

  .progress span {
    display: block;
    height: 100%;
    background: var(--accent, #fca04b);
    transition: width 0.2s ease;
  }

  .update-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .update-actions .file.primary {
    background: var(--accent, #fca04b);
    border-color: var(--accent, #fca04b);
    color: #fff;
  }

  .update-actions .file:disabled {
    opacity: 0.55;
    cursor: default;
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
