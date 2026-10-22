<script lang="ts">
  import { store } from './store.svelte';
  import { KIND_META, colorOf, isZone } from './elements';
  import { formatCoord, formatMeters, ringArea, ringLength } from './geo';

  const el = $derived(store.selected);

  async function copyCoord(lat: number, lng: number) {
    try {
      await navigator.clipboard.writeText(formatCoord(lat, lng, 6));
    } catch {
      /* presse-papier indisponible */
    }
  }
</script>

{#if el}
  <aside class="props">
    <header>
      <span class="badge" style="--c:{colorOf(el)}">{KIND_META[el.kind].label}</span>
      <button class="close" onclick={() => store.select(null)} title="Fermer">×</button>
    </header>

    <label>
      <span>Libellé</span>
      <input bind:value={el.label} />
    </label>

    {#if el.kind === 'artifice'}
      <div class="row">
        <label>
          <span>Référence</span>
          <input bind:value={el.ref} />
        </label>
        <label class="sm">
          <span>Calibre (mm)</span>
          <input type="number" min="0" bind:value={el.calibre} />
        </label>
      </div>
      <label>
        <span>Distance de sécurité (m)</span>
        <input type="number" min="0" step="1" bind:value={el.ds} />
      </label>
      <p class="tip">Poignée orange sur la carte pour régler le rayon à la souris.</p>
    {/if}

    {#if isZone(el.kind)}
      <div class="field">
        <span>Affichage</span>
        <div class="seg">
          <button class:on={!el.pointMode} onclick={() => store.update(el.id, { pointMode: false })}>Zone</button>
          <button class:on={!!el.pointMode} onclick={() => store.update(el.id, { pointMode: true })}>Icône</button>
        </div>
      </div>
    {/if}

    {#if el.kind === 'artifice' || isZone(el.kind) || el.kind === 'marqueur'}
      <label>
        <span>Couleur</span>
        <input
          class="color"
          type="color"
          value={colorOf(el)}
          oninput={(ev) => store.update(el.id, { color: ev.currentTarget.value })}
        />
      </label>
    {/if}

    {#if el.ring?.length}
      <div class="stat">
        {#if isZone(el.kind)}
          <span>
            {el.ring.length} sommets · périmètre {formatMeters(ringLength(el.ring, true))} m · ≈ {formatMeters(
              ringArea(el.ring)
            )} m²
          </span>
        {:else}
          {#if el.kind === 'barrierage'}
            <span class="measure">Longueur à couvrir : <b>{formatMeters(ringLength(el.ring))} m</b></span>
          {/if}
          <span>{el.ring.length} sommets</span>
        {/if}
        <span class="hint">glissez les poignées sur la carte</span>
      </div>
    {/if}

    <label>
      <span>Notes</span>
      <textarea rows="3" bind:value={el.notes} placeholder="Régie, sonorisation, remarques terrain…"></textarea>
    </label>

    <div class="gps">
      <span>GPS</span>
      <code>{formatCoord(el.lat, el.lng, 6)}</code>
      <button onclick={() => copyCoord(el.lat, el.lng)} title="Copier">⧉</button>
    </div>

    <button class="danger" onclick={() => store.remove(el.id)}>Supprimer l’élément</button>
  </aside>
{/if}

<style>
  .props {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 268px;
    z-index: 600;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 12px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.1);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: calc(100% - 24px);
    overflow-y: auto;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 12%, white);
    border-radius: 999px;
    padding: 3px 9px;
  }

  .close {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
  }

  .close:hover {
    background: #f2f2f2;
    color: var(--text-primary);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field > span {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--text-muted);
  }

  .seg {
    display: flex;
    background: var(--bg-surface);
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
  }

  .seg button {
    flex: 1;
    font-size: 11.5px;
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--text-secondary);
  }

  .seg button.on {
    background: #fff;
    color: var(--text-primary);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  label span {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--text-muted);
  }

  input,
  textarea {
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    background: var(--bg-surface);
    outline: none;
    width: 100%;
    resize: vertical;
  }

  input:focus,
  textarea:focus {
    border-color: var(--accent);
    background: #fff;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .row .sm {
    max-width: 108px;
  }

  input.color {
    padding: 2px;
    width: 100%;
    height: 30px;
    cursor: pointer;
  }

  .tip {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: -4px;
  }

  .stat {
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-surface);
    border-radius: 8px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .measure {
    font-size: 12px;
    color: var(--text-primary);
  }

  .measure b {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #a35c14;
  }

  .hint {
    font-size: 10px;
    color: var(--text-muted);
  }

  .gps {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .gps code {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-primary);
    background: var(--bg-surface);
    border-radius: 6px;
    padding: 3px 6px;
  }

  .gps button {
    color: var(--text-muted);
    font-size: 13px;
  }

  .danger {
    border: 1px solid #ffd6d2;
    color: var(--error);
    background: #fff6f5;
    border-radius: 8px;
    padding: 7px;
    font-size: 12px;
    font-weight: 500;
  }

  .danger:hover {
    background: #ffeceb;
  }
</style>
