<script lang="ts">
  import raw from '../../CHANGELOG.md?raw';
  import { updater } from './updater.svelte';
  import { changelogFor } from './changelog';

  const entry = $derived(updater.freshVersion ? changelogFor(updater.freshVersion, raw) : null);
</script>

{#if updater.freshVersion && entry}
  <div class="news" role="dialog" aria-label={`Nouveautés de la version ${entry.version}`}>
    <header>
      <span class="tag">Nouveautés</span>
      <strong>Version {entry.version}</strong>
      {#if entry.date}<span class="date">{entry.date}</span>{/if}
      <button class="close" aria-label="Fermer" onclick={() => updater.dismissFresh()}>×</button>
    </header>

    <div class="body">
      {#each entry.groups as group}
        <p class="group">{group.title}</p>
        <ul>
          {#each group.items as item}
            <li>{item}</li>
          {/each}
        </ul>
      {/each}
    </div>

    <button class="ok" onclick={() => updater.dismissFresh()}>J’ai lu</button>
  </div>
{/if}

<style>
  .news {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 910;
    width: 330px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    padding: 12px 14px 12px;
    border-radius: 12px;
    border: 1px solid var(--border-card, #e4e4e4);
    background: #fff;
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.18);
  }

  header {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
  }

  .tag {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #a35c14;
    background: var(--accent-light, #fdeedd);
    border-radius: 999px;
    padding: 2px 7px;
  }

  header strong {
    font-size: 13px;
    color: var(--text-primary);
  }

  .date {
    font-size: 10.5px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .close {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: 17px;
    line-height: 1;
    color: var(--text-muted);
    padding: 0 2px;
  }

  .body {
    overflow-y: auto;
    margin-bottom: 10px;
  }

  .group {
    margin: 8px 0 3px;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted);
  }

  ul {
    margin: 0;
    padding-left: 15px;
  }

  li {
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--text-secondary);
    margin-bottom: 3px;
  }

  .ok {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 12px;
    font-family: inherit;
    border-radius: 8px;
    padding: 7px;
    cursor: pointer;
  }
</style>
