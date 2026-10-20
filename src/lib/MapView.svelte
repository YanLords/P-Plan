<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { store } from './store.svelte';
  import { settings } from './settings.svelte';
  import { KIND_META, kindIcon, colorOf, isShape, isZone, TOOL_ORDER, type PElement } from './elements';
  import { destinationPoint, formatMeters, haversine, ringLength, snapDistance } from './geo';
  import { kindCursor } from './cursors';
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

  // ---- Sortie PDF : le plan entier est réduit à ~190 mm de large, donc tout
  // rapetisse (pin 26 px -> 1,3 mm sur un écran large). On épaissit traits et
  // icônes d'un facteur déduit de la largeur réelle de la carte, le temps de la capture.
  const PRINT_REF_PX = 1188; // largeur de référence : pin imprimé ~4 mm
  let printBoost = false;
  let strokes: { layer: L.Path; base: number }[] = [];
  let pinEls: HTMLElement[] = [];
  let gain = 1;

  export function setPrintBoost(on: boolean) {
    printBoost = on;
    gain = Math.min(4, Math.max(1, (el?.clientWidth ?? PRINT_REF_PX) / PRINT_REF_PX));
    for (const { layer, base } of strokes) {
      layer.setStyle({ weight: on ? Math.max(base, 1.6) * gain : base });
    }
    for (const pinEl of pinEls) pinEl.style.transform = on ? `scale(${gain})` : '';
  }

  function draw() {
    if (!map || !overlay) return;
    overlay.clearLayers();
    strokes = [];
    pinEls = [];

    store.plan.elements.forEach((e, i) => {
      const sel = store.selection === e.id;
      const color = colorOf(e);

      if (e.ring && e.ring.length > 1) {
        const baseW = isZone(e.kind) ? 2 : 3;
        const shape = isZone(e.kind)
          ? L.polygon(e.ring, { color, weight: baseW, fillColor: color, fillOpacity: 0.12 })
          : L.polyline(e.ring, { color, weight: baseW, dashArray: '7 5' });
        shape.addTo(overlay!).on('click', () => store.select(e.id));
        strokes.push({ layer: shape, base: baseW });
        // barrière : longueur survolée = métrage à couvrir
        if (!isZone(e.kind) && e.ring) {
          shape.bindTooltip(`${formatMeters(ringLength(e.ring))} m`, {
            sticky: true,
            direction: 'top',
            opacity: 0.95,
          });
          if (!settings.value.showLabels) shape.unbindTooltip();
        }
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

      if (e.kind === 'artifice' && settings.value.showRings) {
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
          strokes.push({ layer: circle, base: 1 });

          let ray: L.Polyline | null = null;
          let grip: L.Marker | null = null;

          // poignée de réglage du rayon, à l'est du point (axe carte)
          if (sel) {
            const at = destinationPoint(center.lat, center.lng, ds, 90);
            ray = L.polyline([center, at], {
              color,
              weight: 1,
              dashArray: '3 4',
              opacity: 0.8,
              interactive: false,
            }).addTo(overlay!);

            const g = L.marker(at, { icon: radiusIcon(), draggable: true, zIndexOffset: 700 }).addTo(overlay!);
            grip = g;
            g.bindTooltip(`DS ${ds} m`, { direction: 'top', offset: [0, -12], sticky: false });

            // mesure en direct pendant le geste : cercle, rayon et étiquette suivent la souris
            g.on('dragstart', () => g.openTooltip());
            g.on('drag', (ev) => {
              const ll = (ev as L.LeafletEvent & { latlng?: L.LatLng }).latlng ?? g.getLatLng();
              // aperçu déjà arrondi : ce qui est affiché est ce qui sera enregistré
              const meters = snapDistance(haversine([center.lat, center.lng], [ll.lat, ll.lng]));
              circle.setRadius(meters);
              ray?.setLatLngs([center, ll]);
              g.setTooltipContent(`DS ${meters} m`);
            });
            g.on('dragend', () => {
              const ll = g.getLatLng();
              const meters = haversine([center.lat, center.lng], [ll.lat, ll.lng]);
              g.closeTooltip();
              store.setRadius(e.id, meters);
            });
          }

          // déplacer le point déplace son périmètre en direct (sélectionné ou non)
          onPinDrag = (ll) => {
            circle.setLatLng(ll);
            if (ray && grip) {
              const at = destinationPoint(ll.lat, ll.lng, ds, 90);
              ray.setLatLngs([ll, at]);
              grip.setLatLng(at);
            }
          };
        }
      }

      // une zone/ligne se déplace par ses sommets : l'icône reste au centre
      const m = L.marker([e.lat, e.lng], {
        icon: pin(e, sel),
        draggable: !e.ring,
        zIndexOffset: 300,
      }).addTo(overlay!);
      const pinEl = m.getElement()?.querySelector<HTMLElement>('.pf-pin');
      if (pinEl) pinEls.push(pinEl);
      m.bindTooltip(`${i + 1}. ${e.label}`, { direction: 'top', offset: [0, -14], opacity: 0.95 });
      if (!settings.value.showLabels) m.unbindTooltip();
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
    if (printBoost) setPrintBoost(true);
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

  // le curseur prend l'apparence de l'outil sélectionné
  $effect(() => {
    const tool = store.tool;
    if (!el) return;
    if (tool === 'select') {
      el.style.cursor = '';
      return;
    }
    let cancelled = false;
    kindCursor(tool).then((css) => {
      if (!cancelled && css && el) el.style.cursor = css;
    });
    return () => {
      cancelled = true;
    };
  });

  onMount(() => {
    // pré-chauffe les curseurs d'outils : le changement d'outil doit être instantané
    TOOL_ORDER.forEach((k) => void kindCursor(k));

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
    draw(); // le premier passage de l'$effect a lieu avant la création de la carte

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
  // ---- Recherche de lieu : suggestions au fil de la saisie
  let q = $state('');
  let places = $state<Place[]>([]);
  let searching = $state(false);
  let searched = $state(false);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;

  async function suggest() {
    const query = q.trim();
    inFlight?.abort();
    if (query.length < 3) {
      places = [];
      searched = false;
      active = -1;
      return;
    }
    const controller = new AbortController();
    inFlight = controller;
    searching = true;
    try {
      const found = await searchPlaces(query, 6, { signal: controller.signal, autocomplete: true });
      if (inFlight === controller) {
        places = found;
        active = -1;
        searched = true;
      }
    } finally {
      if (inFlight === controller) searching = false;
    }
  }

  function scheduleSuggest() {
    clearTimeout(timer);
    timer = setTimeout(suggest, 220);
  }

  async function findLieu(e?: SubmitEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 3 || !map) return;
    clearTimeout(timer);
    inFlight?.abort();
    searching = true;
    searched = false;
    try {
      places = await searchPlaces(query);
    } finally {
      searching = false;
      searched = true;
      active = -1;
    }
  }

  function goTo(p: Place) {
    places = [];
    searched = false;
    active = -1;
    q = p.label;
    store.setSite(p.label);
    map?.flyTo([p.lat, p.lng], 16, { duration: 0.9 });
  }

  function onSearchKey(e: KeyboardEvent) {
    if (!places.length) {
      if (e.key === 'Escape') places = [];
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % places.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = active <= 0 ? places.length - 1 : active - 1;
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const p = places[active];
      if (p) goTo(p);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      places = [];
      active = -1;
    }
  }

  onDestroy(() => {
    clearTimeout(timer);
    inFlight?.abort();
  });
</script>

<div class="ui">
  <div class="search">
    <form onsubmit={findLieu}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
      <input
        bind:value={q}
        oninput={scheduleSuggest}
        onkeydown={onSearchKey}
        placeholder="Rechercher une adresse, une commune…"
        aria-label="Rechercher un lieu"
        aria-autocomplete="list"
        aria-expanded={places.length > 0}
        autocomplete="off"
        spellcheck="false"
      />
      {#if searching}
        <span class="spinner" aria-hidden="true"></span>
      {/if}
    </form>
    {#if places.length}
      <ul>
        {#each places as p, i (i)}
          <li class:active={i === active}>
            <button onclick={() => goTo(p)} onmouseenter={() => (active = i)}>
              <span class="lbl">{p.label}</span>
              {#if p.detail}<span class="det">{p.detail}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else if searched && !searching && q.trim().length >= 3}
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

  .search li button:hover,
  .search li.active button {
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
