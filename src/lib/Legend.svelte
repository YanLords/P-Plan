<script lang="ts">
  import { store } from './store.svelte';
  import { KIND_META } from './elements';

  let open = $state(true);
</script>

{#if store.plan.elements.length}
  <section class="legend" class:collapsed={!open}>
    <header>
      <h2>Légende · {store.plan.elements.length}</h2>
      <button onclick={() => (open = !open)} title={open ? 'Replier' : 'Déplier'}>{open ? '−' : '+'}</button>
    </header>
    {#if open}
      <ol>
        {#each store.plan.elements as e, i (e.id)}
          <li class:sel={store.selection === e.id}>
            <button onclick={() => store.select(e.id)}>
              <span class="num">{i + 1}</span>
              <span class="dot" style="--c:{e.color || KIND_META[e.kind].color}"></span>
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

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
    flex: none;
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
