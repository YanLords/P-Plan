<script lang="ts">
  import { store } from './store.svelte';
  import { settings } from './settings.svelte';
  import { KIND_META, colorOf } from './elements';
  import { kindIcon } from './icons';

  let open = $state(true);
</script>

{#if store.plan.elements.length}
  <section class="legend" class:collapsed={!open}>
    <header>
      <h2>Légende · {store.plan.elements.length}</h2>
      <button
        class="disc"
        class:on={settings.value.pinDisc}
        aria-pressed={settings.value.pinDisc}
        onclick={() => settings.set('pinDisc', !settings.value.pinDisc)}
        title="Fond rond blanc derrière les icônes de la carte"
      >Fond rond</button>
      <button onclick={() => (open = !open)} title={open ? 'Replier' : 'Déplier'}>{open ? '−' : '+'}</button>
    </header>
    {#if open}
      <ol>
        {#each store.plan.elements as e, i (e.id)}
          <li class:sel={store.selection === e.id}>
            <button onclick={() => store.select(e.id)}>
              <span class="num">{i + 1}</span>
              <span class="ico" style="--c:{colorOf(e)}" aria-hidden="true">{@html kindIcon(e.kind, colorOf(e))}</span>
              <span class="txt">{e.label}</span>
              {#if e.kind === 'artifice' && e.ds != null}
                <span class="ds">{e.ds} m</span>
              {/if}
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<style>
  .legend {
    position: absolute;
    bottom: 12px;
    left: 12px;
    z-index: 500;
    width: 250px;
    max-height: 46%;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid var(--border-card);
    border-radius: 11px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-card);
  }

  h2 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted);
    font-weight: 600;
  }

  header .disc {
    margin-left: auto;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 6px;
    border: 1px solid var(--sidebar-border);
    color: var(--text-secondary);
  }

  header .disc.on {
    background: var(--accent-light);
    color: var(--text-primary);
  }

  header button {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1;
  }

  header button:hover {
    background: #f0f0f0;
  }

  ol {
    list-style: none;
    overflow-y: auto;
  }

  li button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 11px;
    color: var(--text-primary);
    text-align: left;
  }

  li button:hover,
  li.sel button {
    background: var(--accent-light);
  }

  .num {
    width: 15px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-size: 10px;
    flex: none;
  }

  .ico {
    width: 15px;
    height: 15px;
    color: var(--c);
    display: grid;
    place-items: center;
    flex: none;
    line-height: 0;
  }

  .ico :global(svg),
  .ico :global(img) {
    width: 13px;
    height: 13px;
  }

  .txt {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ds {
    font-size: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    flex: none;
  }
</style>
