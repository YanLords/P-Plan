export interface Place {
  label: string;
  detail?: string;
  lat: number;
  lng: number;
}

const GOUV = 'https://api-adresse.data.gouv.fr/search/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export function fromGouv(json: any): Place[] {
  return (json?.features ?? []).map((f: any) => ({
    label: String(f.properties?.label ?? ''),
    detail: [f.properties?.postcode, f.properties?.city].filter(Boolean).join(' '),
    lat: Number(f.geometry?.coordinates?.[1]),
    lng: Number(f.geometry?.coordinates?.[0]),
  })).filter((p: Place) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export function fromNominatim(json: any): Place[] {
  return (Array.isArray(json) ? json : [])
    .map((r: any) => ({
      label: String(r.display_name ?? ''),
      detail: String(r.type ?? ''),
      lat: Number(r.lat),
      lng: Number(r.lon),
    }))
    .filter((p: Place) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export type GeocodeProvider = 'gouv' | 'nominatim';

/**
 * Source(s) interrogée(s) : la BAN seule en frappe au clavier (autocomplete),
 * BAN puis Nominatim pour une recherche explicite (hors France).
 */
export function providersFor(autocomplete: boolean): GeocodeProvider[] {
  return autocomplete ? ['gouv'] : ['gouv', 'nominatim'];
}

export interface SearchOptions {
  signal?: AbortSignal;
  autocomplete?: boolean;
}

export async function searchPlaces(query: string, limit = 6, options: SearchOptions = {}): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const { signal, autocomplete = false } = options;

  for (const provider of providersFor(autocomplete)) {
    const url =
      provider === 'gouv'
        ? `${GOUV}?q=${encodeURIComponent(q)}&limit=${limit}`
        : `${NOMINATIM}?format=json&limit=${limit}&q=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) continue;
      const places = provider === 'gouv' ? fromGouv(await r.json()) : fromNominatim(await r.json());
      if (places.length) return places.slice(0, limit);
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return [];
      /* source indisponible : on passe à la suivante */
    }
  }
  return [];
}
