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

/**
 * Pas de réglage du rayon de sécurité à la souris :
 * < 25 m au mètre près, ≥ 25 m par pas de 5 m.
 */
export function snapDistance(meters: number): number {
  if (!Number.isFinite(meters)) return 1;
  const v = Math.max(1, meters);
  return v < 25 ? Math.round(v) : Math.round(v / 5) * 5;
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

/** Centre d'un anneau : centroïde pondéré par l'aire (barycentre si anneau dégénéré). */
export function ringCentroid(ring: [number, number][]): [number, number] {
  if (!ring.length) return [0, 0];
  const average = (): [number, number] => {
    const sum = ring.reduce<[number, number]>((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  };
  if (ring.length < 3) return average();

  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const mx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const my = 110540;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i];
    const [bLat, bLng] = ring[(i + 1) % ring.length];
    const ax = aLng * mx;
    const ay = aLat * my;
    const bx = bLng * mx;
    const by = bLat * my;
    const cross = ax * by - bx * ay;
    area += cross;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-6) return average();
  return [cy / (6 * area) / my, cx / (6 * area) / mx];
}
