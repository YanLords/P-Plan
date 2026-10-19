<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { store } from './store.svelte';
  import { KIND_META, kindIcon, type PElement } from './elements';

  let { el }: { el: HTMLDivElement | null } = $props();

  let map: L.Map | null = null;
  let overlay: L.LayerGroup | null = null;
  let draftGroup: L.LayerGroup | null = null;
  let baseKey: 'osm' | 'sat' | null = null;
  let baseLayer: L.TileLayer | null = null;

  const TILES = {
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: '&copy; OpenStreetMap',
      max: 19,
    },
    sat: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: 'Imagery &copy; Esri',
      max: 19,
    },
  };

  function ensureBase(k: 'osm' | 'sat') {
    if (!map || baseKey === k) return;
    baseKey = k;
    baseLayer?.remove();
    baseLayer = L.tileLayer(TILES[k].url, { attribution: TILES[k].attr, maxZoom: TILES[k].max });
    baseLayer.addTo(map);
    baseLayer.bringToBack();
  }

  function pin(e: PElement, selected: boolean) {
    return L.divIcon({
      className: 'pf-pin-wrap',
      html: `<div class="pf-pin${selected ? ' sel' : ''}" style="--c:${KIND_META[e.kind].color}">${kindIcon(e.kind)}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  const handleIcon = () =>
    L.divIcon({ className: 'pf-handle-wrap', html: '<div class="pf-handle"></div>', iconSize: [11, 11], iconAnchor: [5.5, 5.5] });

  function draw() {
    if (!map || !overlay) return;
    overlay.clearLayers();

    store.plan.elements.forEach((e, i) => {
      const sel = store.selection === e.id;
      const color = KIND_META[e.kind].color;

      if (e.ring && e.ring.length > 1) {
        const shape =
          e.kind === 'zone_public'
            ? L.polygon(e.ring, { color, weight: 2, fillColor: color, fillOpacity: 0.12 })
            : L.polyline(e.ring, { color, weight: 3, dashArray: '7 5' });
        shape.addTo(overlay!).on('click', () => store.select(e.id));
        if (sel) {
          e.ring.forEach((p, idx) => {
            const h = L.marker(p, { icon: handleIcon(), draggable: true, zIndexOffset: 600 }).addTo(overlay!);
            h.on('dragend', () => {
              const ll = h.getLatLng();
              store.moveVertex(e.id, idx, [ll.lat, ll.lng]);
            });
          });
        }
      }

      if (e.kind === 'artifice' && e.ds && e.ds > 0) {
        L.circle([e.lat, e.lng], {
          radius: e.ds,
          color,
          weight: 1,
          opacity: 0.8,
          fillColor: color,
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(overlay!);
      }

      const m = L.marker([e.lat, e.lng], { icon: pin(e, sel), draggable: true, zIndexOffset: 300 }).addTo(
        overlay!
      );
      m.bindTooltip(`${i + 1}. ${e.label}`, { direction: 'top', offset: [0, -14], opacity: 0.95 });
      m.on('dragend', () => {
        const ll = m.getLatLng();
        store.moveTo(e.id, [ll.lat, ll.lng]);
      });
      m.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        store.select(e.id);
      });
    });
  }

  function drawDraft() {
    if (!map) return;
    draftGroup?.remove();
    draftGroup = L.layerGroup().addTo(map);
    const pts = store.draft;
    if (!pts.length) return;
    const isZone = store.tool === 'zone_public';
    if (pts.length > 1) {
      (isZone
        ? L.polygon(pts, { color: KIND_META.zone_public.color, weight: 2, dashArray: '6 4', fillOpacity: 0.1 })
        : L.polyline(pts, { color: KIND_META.barrierage.color, weight: 2, dashArray: '6 4' })
      ).addTo(draftGroup);
    }
    pts.forEach((p) =>
      L.circleMarker(p, { radius: 4, color: '#1A1A1A', weight: 1.5, fillColor: '#fff', fillOpacity: 1 }).addTo(
        draftGroup!
      )
    );
  }

  $effect(() => {
    // dépend des éléments/selection via draw()
    store.plan.elements.length;
    store.selection;
    if (map) draw();
  });

  $effect(() => {
    store.draft.length;
    store.tool;
    if (map) drawDraft();
  });

  $effect(() => {
    store.plan.base;
    if (map) ensureBase(store.plan.base);
  });

  onMount(() => {
    if (!el) return;
    const m = L.map(el, {
      center: store.plan.center,
      zoom: store.plan.zoom,
      zoomControl: true,
      worldCopyJump: true,
    });
    map = m;
    overlay = L.layerGroup().addTo(m);
    L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(m);
    ensureBase(store.plan.base);

    m.on('moveend', () => {
      store.plan.center = [m.getCenter().lat, m.getCenter().lng];
      store.plan.zoom = m.getZoom();
    });

    m.on('click', (ev: L.LeafletMouseEvent) => {
      const at: [number, number] = [ev.latlng.lat, ev.latlng.lng];
      if (store.tool === 'barrierage' || store.tool === 'zone_public') store.addVertex(at);
      else if (store.tool !== 'select') store.addPoint(store.tool, at);
      else store.select(null);
    });

    m.on('dblclick', () => {
      if (store.draft.length > 1) store.finishDraft();
    });

    map = m;
    setTimeout(() => m.invalidateSize(), 0);
    return () => {
      m.remove();
      map = null;
      overlay = null;
      draftGroup = null;
      baseKey = null;
      baseLayer = null;
    };
  });

  const shaping = $derived(store.tool === 'barrierage' || store.tool === 'zone_public');
  const hint = $derived(
    store.tool === 'select'
      ? 'Cliquez un élément pour l’éditer · glissez pour déplacer'
      : shaping
        ? store.tool === 'zone_public'
          ? 'Cliquez les sommets de la zone · Entrée pour terminer'
          : 'Cliquez les points du barriérage · Entrée pour terminer'
        : `Cliquez sur la carte pour placer : ${KIND_META[store.tool].label}`
  );
</script>

<div class="ui">
  <div class="base-switch">
    <button class:active={store.plan.base === 'osm'} onclick={() => store.setBase('osm')}>Plan</button>
    <button class:active={store.plan.base === 'sat'} onclick={() => store.setBase('sat')}>Satellite</button>
  </div>

  {#if shaping}
    <div class="draft-bar">
      <span>{store.draft.length} point{store.draft.length > 1 ? 's' : ''}</span>
      <button
        class="primary"
        disabled={store.draft.length < (store.tool === 'zone_public' ? 3 : 2)}
        onclick={() => store.finishDraft()}
      >
        Terminer
      </button>
      <button onclick={() => store.cancelDraft()}>Annuler</button>
    </div>
  {/if}

  <div class="hint">{hint}</div>
</div>

<style>
  .ui {
    position: absolute;
    inset: 0;
    z-index: 400;
    pointer-events: none;
  }

  .base-switch,
  .draft-bar {
    pointer-events: auto;
  }

  .base-switch {
    position: absolute;
    bottom: 44px;
    right: 12px;
    z-index: 500;
    display: flex;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 9px;
    padding: 2px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .base-switch button {
    font-size: 11px;
    padding: 5px 10px;
    border-radius: 7px;
    color: var(--text-secondary);
  }

  .base-switch button.active {
    background: var(--accent-light);
    color: #a35c14;
    font-weight: 600;
  }

  .draft-bar {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 6px 8px 6px 12px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
    font-size: 12px;
    color: var(--text-secondary);
  }

  .draft-bar button {
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 7px;
    border: 1px solid var(--border-card);
    color: var(--text-primary);
    background: #fff;
  }

  .draft-bar button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .draft-bar button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .hint {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    font-size: 11px;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid var(--border-card);
    border-radius: 999px;
    padding: 4px 12px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
