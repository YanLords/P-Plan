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

/** Recherche d'adresse : Base Adresse Nationale (FR) puis Nominatim (reste du monde). */
export async function searchPlaces(query: string, limit = 6): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  try {
    const r = await fetch(`${GOUV}?q=${encodeURIComponent(q)}&limit=${limit}`);
    if (r.ok) {
      const places = fromGouv(await r.json());
      if (places.length) return places.slice(0, limit);
    }
  } catch {
    /* hors ligne ou API indisponible : on tente Nominatim */
  }

  try {
    const r = await fetch(`${NOMINATIM}?format=json&limit=${limit}&q=${encodeURIComponent(q)}`);
    if (r.ok) return fromNominatim(await r.json()).slice(0, limit);
  } catch {
    /* aucune source disponible */
  }
  return [];
}
