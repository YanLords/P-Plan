export const EARTH_CIRCUMFERENCE = 40075016.686;

/** Résolution Web Mercator : mètres terrain par pixel à cette latitude / ce zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
}

/** Rayon en pixels écran d'une distance terrain (m). */
export function metersToPixels(meters: number, lat: number, zoom: number): number {
  return meters / metersPerPixel(lat, zoom);
}

/** "70 M" | "50m" | 70 -> 70 m ; "200 ft" -> 61 m ; illisible -> null */
export function parseDistance(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const m = String(raw).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  return /ft|feet|pied/i.test(String(raw)) ? Math.round(v * 0.3048 * 10) / 10 : v;
}

/** Distance horizontale (m) entre deux points WGS84. */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "48.12345, 2.12345" */
export function formatCoord(lat: number, lng: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}

/** Point situé à `meters` d'un point, dans la direction `bearing` (degrés, 0 = nord). */
export function destinationPoint(
  lat: number,
  lng: number,
  meters: number,
  bearing: number
): [number, number] {
  const R = 6378137;
  const d = meters / R;
  const br = (bearing * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lat2 * 180) / Math.PI, (((lng2 * 180) / Math.PI + 540) % 360) - 180];
}

/** Dénominateur d'échelle : distance terrain (m) ramenée à une largeur papier (mm). */
export function scaleDenominator(groundMeters: number, imageWidthMm: number): number {
  if (!(groundMeters > 0) || !(imageWidthMm > 0)) return 0;
  return Math.round((groundMeters * 1000) / imageWidthMm);
}

/** Aire d'un anneau (m²) — approximation locale, suffisante pour une zone public. */
export function ringArea(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const mx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const my = 110540;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i];
    const [bLat, bLng] = ring[(i + 1) % ring.length];
    sum += aLng * mx * (bLat * my) - bLng * mx * (aLat * my);
  }
  return Math.abs(sum / 2);
}
