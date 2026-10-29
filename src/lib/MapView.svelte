<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { store } from './store.svelte';
  import { settings } from './settings.svelte';
  import { KIND_META, RULER, colorOf, isFond, isKindTool, isShape, isZone, TOOL_ORDER, type PElement } from './elements';
  import { kindIcon } from './icons';
  import { destinationPoint, formatMeters, haversine, ringLength, snapDistance } from './geo';
  import { kindCursor } from './cursors';
  import { searchPlaces, type Place } from './geocode';

  let { el }: { el: HTMLDivElement | null } = $props();

  let map: L.Map | null = null;
  let overlay: L.LayerGroup | null = null;
  let draftGroup: L.LayerGroup | null = null;
  let measureLine: L.Polyline | null = null;
  let measureTip: L.Tooltip | null = null;
  let measureFrom: L.LatLng | null = null;
  /** menu contextuel (clic droit) : élément visé ou simple point de collage */
  let menu = $state<{ x: number; y: number; id: string | null; at: [number, number] } | null>(null);
  let measureMoved = false;
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
    // tuiles natives jusqu'à `max`, agrandies au-delà (sinon la couche disparaît)
    baseLayer = L.tileLayer(TILES[k].url, { attribution: TILES[k].attr, maxNativeZoom: TILES[k].max, maxZoom: 22 });
    baseLayer.addTo(map);
    baseLayer.bringToBack();
  }

  function pin(e: PElement, selected: boolean) {
    return L.divIcon({
      className: 'pf-pin-wrap',
      html: `<div class="pf-pin${selected ? ' sel' : ''}" data-kind="${e.kind}" style="--c:${colorOf(e)}">${kindIcon(e.kind, colorOf(e))}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  /** Pointe de flèche orientée dans l'axe du dernier segment (voie de sortie). */
  function arrowIcon(from: [number, number], to: [number, number], color: string): L.DivIcon {
    let deg = 0;
    if (map) {
      const a = map.latLngToContainerPoint(from);
      const b = map.latLngToContainerPoint(to);
      deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
    return L.divIcon({
      className: 'pf-arrow-wrap',
      html: `<div class="pf-arrow" style="--c:${color};--rot:${deg}deg"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M21.5 12 3 2.6l4.8 9.4L3 21.4z" fill="currentColor"/></svg></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
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
  const PIN_CSS_PX = 26; // diamètre écran d'une icône
  const PRINT_PIN_MM = 4.2; // diamètre voulu sur le papier
  let printBoost = false;
  let strokes: { layer: L.Path; base: number }[] = [];
  let gain = 1;

  let printPixels = 1;
  let savedSize: { w: string; h: string } | null = null;

  /** Capture PDF : élargit la carte au format du plan (même échelle, plus de terrain). */
  export async function setPrintFit(aspect: number, on: boolean): Promise<number | void> {
    const node = el;
    const leaflet = map;
    if (!node || !leaflet) return;

    if (on) {
      if (!savedSize) savedSize = { w: node.style.width, h: node.style.height };
      const h = node.clientHeight || 1;
      // ponytail: budget de 10 Mpx CSS pour la capture (au-delà, la carte garde
      // son format et se cale avec des marges plutôt que de saturer la mémoire)
      const maxW = Math.floor(10_000_000 / h);
      node.style.width = `${Math.min(maxW, Math.round(h * aspect))}px`;
      node.style.height = `${h}px`;
    } else if (savedSize) {
      node.style.width = savedSize.w;
      node.style.height = savedSize.h;
      savedSize = null;
    }

    leaflet.invalidateSize({ animate: false });
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        leaflet.off('idle', finish);
        resolve();
      };
      leaflet.once('idle', finish);
      setTimeout(finish, 900);
    });

    if (!on) return;
    printPixels = node.clientWidth || printPixels;
    return printPixels;
  }

  export function setPrintBoost(on: boolean, mapWidthMm = 281) {
    printBoost = on;
    // l'icône doit mesurer PRINT_PIN_MM sur le papier, quelle que soit la largeur
    // de la capture : gain = (mm voulus / largeur imprimée) / (taille écran)
    const width = el?.clientWidth ?? printPixels;
    gain = Math.min(6, Math.max(0.3, (width * PRINT_PIN_MM) / (PIN_CSS_PX * mapWidthMm)));

    for (const { layer, base } of strokes) {
      layer.setStyle({ weight: on ? Math.max(base, 1.6) * gain : base });
    }
    // icônes et pointes de flèche : même facteur, via une variable CSS
    for (const node of el?.querySelectorAll<HTMLElement>('.pf-pin, .pf-arrow') ?? []) {
      if (on) {
        node.style.setProperty('--sc', String(gain));
        // l'ombre portée n'est pas transformée par la capture -> artefact gris à l'impression
        node.style.boxShadow = 'none';
      } else {
        node.style.removeProperty('--sc');
        node.style.boxShadow = '';
      }
    }
    // les contrôles Leaflet ne font pas partie du plan
    for (const ctrl of el?.querySelectorAll<HTMLElement>('.leaflet-control-zoom') ?? []) {
      ctrl.style.display = on ? 'none' : '';
    }
    // le picto d'une barrière reste à l'écran ; sur le PDF, seul son tracé est imprimé
    for (const pin of el?.querySelectorAll<HTMLElement>('.pf-pin[data-kind="barrierage"]') ?? []) {
      pin.style.visibility = on ? 'hidden' : '';
    }
  }

  function draw() {
    if (!map || !overlay) return;
    overlay.clearLayers();
    strokes = [];

    // le fond (bateau) est dessiné en premier, sous les équipements
    const ordered = store.plan.elements
      .map((e, i) => ({ e, i }))
      .sort((a, b) => Number(isFond(b.e.kind)) - Number(isFond(a.e.kind)));

    ordered.forEach(({ e, i }) => {
      const sel = store.selection === e.id;
      const color = colorOf(e);

      // contour et poignées d'une zone : suivis en direct quand on glisse son icône
      let zoneShape: L.Polygon | null = null;
      const handles: L.Marker[] = [];

      if (e.ring && e.ring.length > 1 && !e.pointMode) {
        const baseW = isZone(e.kind) ? 2 : 3;
        const isSortie = e.kind === 'sortie';
        const shape = isZone(e.kind)
          ? L.polygon(e.ring, { color, weight: baseW, fillColor: color, fillOpacity: 0.12 })
          : L.polyline(e.ring, { color, weight: baseW });
        if (isZone(e.kind)) zoneShape = shape as L.Polygon;
        shape
          .addTo(overlay!)
          .on('click', () => store.select(e.id))
          .on('contextmenu', (ev) => openMenu(ev as L.LeafletMouseEvent, e.id));
        strokes.push({ layer: shape, base: baseW });

        if (isSortie && e.ring.length > 1) {
          const last = e.ring[e.ring.length - 1];
          const prev = e.ring[e.ring.length - 2];
          L.marker(last, {
            icon: arrowIcon(prev, last, color),
            interactive: false,
            zIndexOffset: 350,
          }).addTo(overlay!);
        }
        // barrière : longueur survolée = métrage à couvrir (pas pour une voie de sortie)
        if (e.kind === 'barrierage' && e.ring) {
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
            handles.push(h);
            h.on('dragend', () => {
              const ll = h.getLatLng();
              store.moveVertex(e.id, idx, [ll.lat, ll.lng]);
              // l'icône (centre de zone ou premier point du tracé) doit suivre le sommet
              draw();
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

          let grip: L.Marker | null = null;

          // rayon visible en permanence : il fait partie du plan imprimé
          const at = destinationPoint(center.lat, center.lng, ds, 90);
          const ray = L.polyline([center, at], {
            color,
            weight: 1,
            dashArray: '3 4',
            opacity: 0.8,
            interactive: false,
          }).addTo(overlay!);
          strokes.push({ layer: ray, base: 1 });

          // la bulle du rayon reste affichée sur le plan (pas seulement à la souris)
          if (settings.value.showLabels) {
            ray.bindTooltip(`<b style="color:${color}">DS ${ds} m</b>`, {
              permanent: true,
              direction: 'top',
              offset: [0, -3],
              opacity: 1,
              className: 'pf-ds',
            });
          }

          // poignée de réglage du rayon, à l'est du point (axe carte)
          if (sel) {
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
            const to = destinationPoint(ll.lat, ll.lng, ds, 90);
            ray.setLatLngs([ll, to]);
            grip?.setLatLng(to);
          };
        }
      }

      // un point se déplace à l'icône ; une zone aussi (tout le contour suit),
      // un tracé se déplace par ses sommets
      const movable = !e.ring || isZone(e.kind) || !!e.pointMode;
      // voie de sortie : l'icône peut être masquée (la pointe de flèche reste sur le tracé)
      const hidden = e.kind === 'sortie' && !!e.hideIcon;
      const m = L.marker([e.lat, e.lng], {
        icon: hidden ? L.divIcon({ className: 'pf-pin-wrap', html: '', iconSize: [0, 0] }) : pin(e, sel),
        draggable: movable,
        interactive: !hidden,
        zIndexOffset: 300,
      }).addTo(overlay!);
      m.bindTooltip(`${i + 1}. ${e.label}`, { direction: 'top', offset: [0, -14], opacity: 0.95 });
      if (!settings.value.showLabels) m.unbindTooltip();
      let from: L.LatLng | null = null;
      m.on('dragstart', () => {
        from = m.getLatLng();
      });
      m.on('drag', (ev) => {
        const ll = (ev as L.LeafletEvent & { latlng?: L.LatLng }).latlng ?? m.getLatLng();
        // aperçu : le contour et ses poignées suivent l'icône pendant le geste
        if (zoneShape && e.ring && from) {
          const dLat = ll.lat - from.lat;
          const dLng = ll.lng - from.lng;
          zoneShape.setLatLngs(e.ring.map(([la, ln]) => [la + dLat, ln + dLng] as [number, number]));
          handles.forEach((h, idx) => {
            const p = e.ring?.[idx];
            if (p) h.setLatLng([p[0] + dLat, p[1] + dLng]);
          });
        }
        onPinDrag?.(ll);
      });
      m.on('dragend', () => {
        const ll = m.getLatLng();
        const start = from;
        from = null;
        if (start && e.ring) {
          // la zone entière (sommet par sommet) suit le déplacement de l'icône
          store.moveBy(e.id, ll.lat - start.lat, ll.lng - start.lng);
          draw();
        } else {
          store.moveTo(e.id, [ll.lat, ll.lng]);
        }
      });
      m.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        store.select(e.id);
      });
      m.on('contextmenu', (ev) => openMenu(ev as L.LeafletMouseEvent, e.id));
    });
    if (printBoost) setPrintBoost(true);
  }

  function closeMenu() {
    menu = null;
  }

  function openMenu(ev: L.LeafletMouseEvent, id: string | null) {
    // un événement Leaflet porte la souris dans `originalEvent`
    const mouse = (ev.originalEvent ?? ev) as MouseEvent;
    mouse.preventDefault?.();
    mouse.stopPropagation?.();
    const at: [number, number] = ev.latlng ? [ev.latlng.lat, ev.latlng.lng] : store.plan.center;
    if (id) store.select(id);
    // position dans le repère de la carte (le menu est rendu dans .ui)
    const box = el?.getBoundingClientRect();
    const x = Math.min(mouse.clientX - (box?.left ?? 0), (box?.width ?? 0) - 190);
    const y = Math.min(mouse.clientY - (box?.top ?? 0), (box?.height ?? 0) - 170);
    menu = { x: Math.max(8, x), y: Math.max(8, y), id, at };
  }

  function drawDraft() {
    if (!map) return;
    draftGroup?.remove();
    draftGroup = L.layerGroup().addTo(map);
    const pts = store.draft;
    if (!pts.length) return;
    const isZoneDraft = isKindTool(store.tool) && isZone(store.tool);
    const toolColor = !isKindTool(store.tool)
      ? KIND_META.zone_perso.color
      : KIND_META[store.tool].color;
    if (pts.length > 1) {
      (isZoneDraft
        ? L.polygon(pts, { color: toolColor, weight: 2, dashArray: '6 4', fillOpacity: 0.1 })
        : L.polyline(pts, { color: toolColor, weight: 2, dashArray: '6 4' })
      ).addTo(draftGroup);

      // plume : la pointe suit le dernier point posé
      if (store.tool === 'sortie') {
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        L.marker(last, { icon: arrowIcon(prev, last, toolColor), interactive: false }).addTo(draftGroup);
      }
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
    store.rev;
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

  /** Règle : trait + bulle de distance, hors plan (jamais enregistré). */
  function clearMeasure() {
    measureLine?.remove();
    measureTip?.remove();
    measureLine = null;
    measureTip = null;
    measureFrom = null;
    measureMoved = false;
  }

  function drawMeasure(from: L.LatLng, to: L.LatLng) {
    if (!map) return;
    const pts = [from, to];
    if (!measureLine) {
      measureLine = L.polyline(pts, {
        color: RULER.color,
        weight: 2,
        dashArray: '5 4',
        interactive: false,
      }).addTo(map);
    } else {
      measureLine.setLatLngs(pts);
    }
    const mid = L.latLng((from.lat + to.lat) / 2, (from.lng + to.lng) / 2);
    const label = `${formatMeters(map.distance(from, to))} m`;
    if (!measureTip) {
      // setLatLng avant addTo : un tooltip sans position ne peut pas être ajouté à la carte
      measureTip = L.tooltip({ permanent: true, direction: 'top', opacity: 0.95 })
        .setLatLng(mid)
        .addTo(map);
    }
    measureTip.setLatLng(mid).setContent(label);
  }

  // quitter l'outil efface la mesure en cours
  $effect(() => {
    if (store.tool !== 'regle') clearMeasure();
  });

  // le curseur prend l'apparence de l'outil sélectionné
  $effect(() => {
    const tool = store.tool;
    if (!el) return;
    if (tool === 'select') {
      el.style.cursor = '';
      return;
    }
    if (tool === 'regle') {
      el.style.cursor = 'crosshair';
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
      // les fonds s'arrêtent à 19 : au-delà, leurs tuiles sont agrandies
      maxZoom: 22,
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

    m.on('contextmenu', (ev: L.LeafletMouseEvent) => openMenu(ev, null));
    // pas de menu contextuel natif du navigateur sur la carte
    L.DomEvent.on(el, 'contextmenu', (e) => e.preventDefault());

    m.on('click', (ev: L.LeafletMouseEvent) => {
      closeMenu();
      const at: [number, number] = [ev.latlng.lat, ev.latlng.lng];
      places = [];
      if (store.drawsShape) store.addVertex(at);
      else if (store.tool === 'zone_public' && store.publicIcon) store.addPoint('zone_public', at, { pointMode: true });
      else if (isKindTool(store.tool)) store.addPoint(store.tool, at);
      else store.select(null);
    });

    // ---- Règle : glisser du point de départ au point d'arrivée
    const endMeasure = () => {
      if (!measureFrom) return;
      window.removeEventListener('mouseup', endMeasure);
      m.dragging.enable(); // sinon la carte se déplace au lieu de mesurer
      // un simple clic (aucun déplacement) efface la mesure
      if (!measureMoved) clearMeasure();
      measureFrom = null;
      measureMoved = false;
    };

    m.on('mousedown', (ev: L.LeafletMouseEvent) => {
      if (store.tool !== 'regle') return;
      clearMeasure();
      measureFrom = ev.latlng;
      m.dragging.disable();
      window.addEventListener('mouseup', endMeasure);
    });

    m.on('mousemove', (ev: L.LeafletMouseEvent) => {
      if (!measureFrom || store.tool !== 'regle') return;
      measureMoved = true;
      drawMeasure(measureFrom, ev.latlng);
    });

    m.on('mouseup', endMeasure);

    const onMeasureKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearMeasure();
    };
    window.addEventListener('keydown', onMeasureKey);

    m.on('dblclick', () => {
      if (store.draft.length > 1) store.finishDraft();
    });

    map = m;
    setTimeout(() => m.invalidateSize(), 0);
    return () => {
      window.removeEventListener('keydown', onMeasureKey);
      m.remove();
      map = null;
      overlay = null;
      draftGroup = null;
      baseKey = null;
      baseLayer = null;
    };
  });

  const shaping = $derived(store.drawsShape);
  const hint = $derived(
    store.tool === 'regle'
      ? 'Glissez pour mesurer une distance · Échap pour effacer'
      : store.tool === 'select'
        ? 'Cliquez un élément pour l’éditer · glissez pour déplacer'
        : shaping
          ? 'Cliquez les sommets · Entrée pour terminer'
          : isKindTool(store.tool)
            ? `Cliquez sur la carte pour placer : ${store.tool === 'zone_public' && store.publicIcon ? 'icône zone public' : KIND_META[store.tool].label}`
            : ''
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
        disabled={store.draft.length < (isKindTool(store.tool) && isZone(store.tool) ? 3 : 2)}
        onclick={() => store.finishDraft()}
      >
        Terminer
      </button>
      <button onclick={() => store.cancelDraft()}>Annuler</button>
    </div>
  {/if}

  <div class="hint">{hint}</div>

  {#if menu}
    <div class="menu" style="left:{menu.x}px; top:{menu.y}px" role="menu">
      {#if menu.id}
        <button role="menuitem" onclick={() => { store.duplicate(menu?.id ?? null); closeMenu(); }}>
          Dupliquer <kbd>⌘D</kbd>
        </button>
        <button role="menuitem" onclick={() => { store.copy(menu?.id ?? null); closeMenu(); }}>
          Copier <kbd>⌘C</kbd>
        </button>
        <button role="menuitem" disabled={!store.clipboard} onclick={() => { store.paste(menu?.at); closeMenu(); }}>
          Coller <kbd>⌘V</kbd>
        </button>
        <button class="danger" role="menuitem" onclick={() => { if (menu?.id) store.remove(menu.id); closeMenu(); }}>
          Supprimer <kbd>⌫</kbd>
        </button>
      {:else}
        <button role="menuitem" disabled={!store.clipboard} onclick={() => { store.paste(menu?.at); closeMenu(); }}>
          Coller ici <kbd>⌘V</kbd>
        </button>
      {/if}
    </div>
  {/if}
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

  .menu {
    position: absolute;
    z-index: 700;
    pointer-events: auto;
    min-width: 176px;
    padding: 4px;
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 9px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .menu button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    text-align: left;
    font-size: 12px;
    font-family: inherit;
    color: var(--text-primary);
    border-radius: 6px;
    padding: 6px 8px;
  }

  .menu button:hover:not(:disabled) {
    background: var(--accent-light);
  }

  .menu button:disabled {
    opacity: 0.42;
    cursor: default;
  }

  .menu button.danger {
    color: var(--error);
  }

  .menu kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
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
