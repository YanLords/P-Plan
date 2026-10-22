<script lang="ts">
  import { updater } from './updater.svelte';

  // le compte à rebours du garde-fou doit s'afficher en direct
  $effect(() => {
    const id = setInterval(() => updater.tick(), 1000);
    return () => clearInterval(id);
  });

  const visible = $derived(
    !!updater.next &&
      !updater.dismissed &&
      (updater.state === 'available' || updater.state === 'downloading' || updater.state === 'ready')
  );
</script>

{#if visible && updater.next}
  <aside class="update" role="status" aria-live="polite">
    <header>
      <span class="dot"></span>
      <strong>Mise à jour {updater.next.version}</strong>
      <button class="close" aria-label="Plus tard" onclick={() => updater.dismiss()} title="Plus tard">×</button>
    </header>

    {#if updater.state === 'downloading'}
      <div class="progress" role="progressbar" aria-valuenow={updater.progress} aria-valuemin="0" aria-valuemax="100">
        <span style="width:{updater.progress}%"></span>
      </div>
      <p class="note">Téléchargement… {updater.progress} %</p>
    {:else if updater.state === 'ready'}
      <p class="note">Installée — redémarrage…</p>
    {:else}
      <p class="note">Une nouvelle version de Planete Plan est disponible.</p>
      <div class="actions">
        <button class="primary" disabled={updater.busy || updater.cooldown > 0} onclick={() => updater.install()}>
          {updater.cooldown > 0 ? `Patientez ${updater.cooldown} s` : 'Installer maintenant'}
        </button>
        <button class="ghost" onclick={() => updater.dismiss()}>Plus tard</button>
      </div>
    {/if}

    {#if updater.message}<p class="error">{updater.message}</p>{/if}
  </aside>
{/if}

<style>
  .update {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 60;
    width: 300px;
    padding: 12px 14px 13px;
    border-radius: 12px;
    border: 1px solid var(--border-card, #e4e4e4);
    background: #fff;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.16);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  header strong {
    font-size: 13px;
    color: var(--text-primary);
    flex: 1;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent, #fca04b);
    flex: none;
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

  .note {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions button {
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid var(--border-card, #e4e4e4);
  }

  .primary {
    background: var(--accent, #fca04b);
    border-color: var(--accent, #fca04b);
    color: #fff;
    font-weight: 600;
  }

  .primary:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .ghost {
    background: #fff;
    color: var(--text-primary);
  }

  .progress {
    height: 6px;
    border-radius: 999px;
    background: var(--bg-surface, #f1f1f1);
    overflow: hidden;
    margin-bottom: 6px;
  }

  .progress span {
    display: block;
    height: 100%;
    background: var(--accent, #fca04b);
    transition: width 0.2s ease;
  }

  .error {
    margin: 8px 0 0;
    font-size: 11.5px;
    color: #c0392b;
  }
</style>
