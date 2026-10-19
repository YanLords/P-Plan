<script lang="ts">
  import { store } from './store.svelte';
  import { CATALOG, searchCatalog } from './catalog';

  let q = $state('');
  const results = $derived(searchCatalog(q, 200));

  function add(a: (typeof CATALOG)[number]) {
    store.addArtifice(store.plan.center, a);
  }
</script>

{#if store.tool === 'artifice'}
  <section class="catalog">
    <header>
      <h2>Artifices</h2>
      <input placeholder="Réf, nom, calibre…" bind:value={q} />
    </header>
    <ul>
      {#each results as a (a.ref + a.nom)}
        <li>
          <button onclick={() => add(a)} title="Placer au centre de la carte">
            <span class="nom">{a.nom}</span>
            <span class="meta">
              {a.ref || 'sans réf'} · {a.calibre != null ? `${a.calibre} mm` : '—'} · DS {a.ds ?? '—'} m
            </span>
          </button>
        </li>
      {/each}
      {#if !results.length}
        <li class="empty">Aucun article ne correspond.</li>
      {/if}
    </ul>
    <footer>{results.length} / {CATALOG.length} articles · clic = placer au centre</footer>
  </section>
{/if}

<style>
  .catalog {
    position: absolute;
    top: 12px;
    left: 12px;
    bottom: 12px;
    width: 272px;
    z-index: 500;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 12px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.09);
    overflow: hidden;
  }

  header {
    padding: 10px 10px 8px;
    border-bottom: 1px solid var(--border-card);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  h2 {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  input {
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: 6px 9px;
    font-size: 12px;
    outline: none;
    background: var(--bg-surface);
  }

  input:focus {
    border-color: var(--accent);
    background: #fff;
  }

  ul {
    list-style: none;
    overflow-y: auto;
    flex: 1;
  }

  li button {
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid #f2f2f2;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  li button:hover {
    background: var(--accent-light);
  }

  .nom {
    font-size: 12px;
    color: var(--text-primary);
  }

  .meta {
    font-size: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .empty {
    padding: 12px 10px;
    font-size: 11px;
    color: var(--text-muted);
  }

  footer {
    padding: 6px 10px;
    font-size: 10px;
    color: var(--text-muted);
    border-top: 1px solid var(--border-card);
    background: var(--bg-surface);
  }
</style>
