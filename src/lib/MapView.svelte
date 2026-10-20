<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { store } from './store.svelte';
  import { KIND_META, kindIcon, colorOf, isShape, isZone, type PElement } from './elements';
  import { destinationPoint, haversine, snapDistance } from './geo';
  import { searchPlaces, type Place } from './geocode';

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
      html: `<div class="pf-pin${selected ? ' sel' : ''}" style="--c:${colorOf(e)}">${kindIcon(e.kind)}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  const handleIcon = () =>
    L.divIcon({ className: 'pf-handle-wrap', html: '<div class="pf-handle"></div>', iconSize: [11, 11], iconAnchor: [5.5, 5.5] });

  const radiusIcon = () =>
    L.divIcon({
      className: 'pf-radius-wrap',
      html: '<div class="pf-radius"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

  function draw() {
    if (!map || !overlay) return;
    overlay.clearLayers();

    store.plan.elements.forEach((e, i) => {
      const sel = store.selection === e.id;
      const color = colorOf(e);

      if (e.ring && e.ring.length > 1) {
        const shape = isZone(e.kind)
            ? L.polygon(e.ring, { color, weight: 2, fillColor: color, fillOpacity: 0.12 })
            : L.polyline(e.ring, { color, weight: 3, dashArray: '7 5' });        shape.addTo(overlay!).on('click', () => store.select(e.id));
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

      let onPinDrag: ((ll: L.LatLng) => void) | null = null;

      if (e.kind === 'artifice') {
        const ds = e.ds ?? 0;
        if (ds > 0) {
          const center = L.latLng(e.lat, e.lng);
          const circle = L.circle(center, {
            radius: ds,
            color,
            weight: 1,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(overlay!);

          // poignée de réglage du rayon, à l'est du point (axe carte)
          if (sel) {
            const at = destinationPoint(center.lat, center.lng, ds, 90);
            const ray = L.polyline([center, at], {
              color,
              weight: 1,
              dashArray: '3 4',
              opacity: 0.8,
              interactive: false,
            }).addTo(overlay!);

            const grip = L.marker(at, { icon: radiusIcon(), draggable: true, zIndexOffset: 700 }).addTo(
              overlay!
            );
            grip.bindTooltip(`DS ${ds} m`, { direction: 'top', offset: [0, -12], sticky: false });

            // mesure en direct pendant le geste : cercle, rayon et étiquette suivent la souris
            grip.on('dragstart', () => grip.openTooltip());
            grip.on('drag', (ev) => {
              const ll = (ev as L.LeafletEvent & { latlng?: L.LatLng }).latlng ?? grip.getLatLng();
              // aperçu déjà arrondi : ce qui est affiché est ce qui sera enregistré
              const meters = snapDistance(haversine([center.lat, center.lng], [ll.lat, ll.lng]));
              circle.setRadius(meters);
              ray.setLatLngs([center, ll]);
              grip.setTooltipContent(`DS ${meters} m`);
            });
            grip.on('dragend', () => {
              const ll = grip.getLatLng();
              const meters = haversine([center.lat, center.lng], [ll.lat, ll.lng]);
              grip.closeTooltip();
              store.setRadius(e.id, meters);
            });

            // déplacer le point déplace aussi son périmètre et sa poignée, en direct
            onPinDrag = (ll) => {
              const at2 = destinationPoint(ll.lat, ll.lng, ds, 90);
              circle.setLatLng(ll);
              ray.setLatLngs([ll, at2]);
              grip.setLatLng(at2);
            };
          }
        }
      }

      const m = L.marker([e.lat, e.lng], { icon: pin(e, sel), draggable: true, zIndexOffset: 300 }).addTo(
        overlay!
      );
      m.bindTooltip(`${i + 1}. ${e.label}`, { direction: 'top', offset: [0, -14], opacity: 0.95 });
      m.on('drag', (ev) => {
        const ll = (ev as L.LeafletEvent & { latlng?: L.LatLng }).latlng ?? m.getLatLng();
        onPinDrag?.(ll);
      });
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
    const isZoneDraft = store.tool !== 'select' && isZone(store.tool);
    if (pts.length > 1) {
      (isZoneDraft
        ? L.polygon(pts, {
            color: store.tool === 'select' ? KIND_META.zone_perso.color : KIND_META[store.tool].color,
            weight: 2,
            dashArray: '6 4',
            fillOpacity: 0.1,
          })
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
      places = [];
      if (store.tool !== 'select' && isShape(store.tool)) store.addVertex(at);
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

  const shaping = $derived(store.tool !== 'select' && isShape(store.tool));
  const hint = $derived(
    store.tool === 'select'
      ? 'Cliquez un élément pour l’éditer · glissez pour déplacer'
      : shaping
        ? 'Cliquez les sommets · Entrée pour terminer'
        : `Cliquez sur la carte pour placer : ${KIND_META[store.tool].label}`
  );
  // ---- Recherche de lieu (barre d'adresse)
  let q = $state('');
  let places = $state<Place[]>([]);
  let searching = $state(false);
  let searched = $state(false);

  async function findLieu(e?: SubmitEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 3 || !map) return;
    searching = true;
    searched = false;
    places = [];
    try {
      places = await searchPlaces(query);
    } finally {
      searching = false;
      searched = true;
    }
  }

  function goTo(p: Place) {
    places = [];
    searched = false;
    q = p.label;
    map?.flyTo([p.lat, p.lng], 16, { duration: 0.9 });
  }
</script>

<div class="ui">
  <div class="search">
    <form onsubmit={findLieu}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
      <input bind:value={q} placeholder="Rechercher une adresse, une commune…" aria-label="Rechercher un lieu" />
      {#if searching}
        <span class="spinner" aria-hidden="true"></span>
      {/if}
    </form>
    {#if places.length}
      <ul>
        {#each places as p, i (i)}
          <li>
            <button onclick={() => goTo(p)}>
              <span class="lbl">{p.label}</span>
              {#if p.detail}<span class="det">{p.detail}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else if searched && !searching}
      <div class="none">Aucun résultat pour « {q} »</div>
    {/if}
  </div>

  <div class="base-switch">
    <button class:active={store.plan.base === 'osm'} onclick={() => store.setBase('osm')}>Plan</button>
    <button class:active={store.plan.base === 'sat'} onclick={() => store.setBase('sat')}>Satellite</button>
  </div>

  {#if shaping}
    <div class="draft-bar">
      <span>{store.draft.length} point{store.draft.length > 1 ? 's' : ''}</span>
      <button
        class="primary"
        disabled={store.draft.length < (store.tool !== 'select' && isZone(store.tool) ? 3 : 2)}
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
  .draft-bar,
  .search {
    pointer-events: auto;
  }

  .search {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    width: min(380px, calc(100% - 120px));
    z-index: 550;
  }

  .search form {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 0 10px;
    height: 36px;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.09);
    color: var(--text-muted);
  }

  .search form:focus-within {
    border-color: var(--accent);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: none;
    font-size: 12.5px;
    color: var(--text-primary);
  }

  .search ul {
    list-style: none;
    margin-top: 5px;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.11);
    overflow: hidden;
    max-height: 240px;
    overflow-y: auto;
  }

  .search li button {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid #f2f2f2;
  }

  .search li button:hover {
    background: var(--accent-light);
  }

  .lbl {
    font-size: 12px;
    color: var(--text-primary);
  }

  .det {
    font-size: 10px;
    color: var(--text-muted);
  }

  .none {
    margin-top: 5px;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border-card);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
    top: 58px;
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
