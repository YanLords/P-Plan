import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_CIRCUMFERENCE,
  metersPerPixel,
  metersToPixels,
  parseDistance,
  haversine,
  destinationPoint,
  snapDistance,
  formatCoord,
  ringArea,
  ringCentroid,
  ringLength,
  formatMeters,
  scaleDenominator,
} from './geo.ts';

test('résolution Web Mercator au zoom 0 / équateur', () => {
  assert.ok(Math.abs(metersPerPixel(0, 0) - EARTH_CIRCUMFERENCE / 256) < 1e-9);
  // un zoom de plus = deux fois moins de mètres par pixel
  const a = metersPerPixel(45, 15);
  const b = metersPerPixel(45, 16);
  assert.ok(Math.abs(a / b - 2) < 1e-9);
});

test('metersToPixels : rayon cohérent avec la résolution', () => {
  const mpp = metersPerPixel(48.85, 17);
  assert.ok(Math.abs(metersToPixels(mpp, 48.85, 17) - 1) < 1e-9);
  // une distance de sécurité de 70 m ne peut pas faire 0 px
  assert.ok(metersToPixels(70, 48.85, 17) > 0);
});

test('parseDistance : formats CSV JCO et unités', () => {
  assert.equal(parseDistance('70 M'), 70);
  assert.equal(parseDistance('50m'), 50);
  assert.equal(parseDistance(' 35  '), 35);
  assert.equal(parseDistance(70), 70);
  assert.equal(parseDistance('1,5 M'), 1.5);
  assert.equal(parseDistance('200 ft'), 61);
  assert.equal(parseDistance(''), null);
  assert.equal(parseDistance(undefined), null);
  assert.equal(parseDistance('n/a'), null);
});

test('haversine : Paris–Lyon ≈ 391 km', () => {
  const d = haversine([48.8566, 2.3522], [45.764, 4.8357]);
  assert.ok(Math.abs(d - 391000) < 10000, `distance inattendue: ${d}`);
});

test('ringArea : carré de 100 m de côté ≈ 10 000 m²', () => {
  const lat = 45;
  const dLat = 100 / 110540;
  const dLng = 100 / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [
    [lat, 2],
    [lat + dLat, 2],
    [lat + dLat, 2 + dLng],
    [lat, 2 + dLng],
  ];
  const area = ringArea(ring);
  assert.ok(Math.abs(area - 10000) / 10000 < 0.02, `aire inattendue: ${area}`);
  assert.equal(ringArea([[1, 2], [3, 4]]), 0);
});

test('destinationPoint : 1 km à l’est de l’équateur, et retour cohérent', () => {
  const [lat, lng] = destinationPoint(0, 0, 1000, 90);
  assert.ok(Math.abs(lat) < 1e-9, `latitude: ${lat}`);
  assert.ok(Math.abs(lng - 0.008993) < 1e-4, `longitude: ${lng}`);
  // le rayon mesuré revient à la distance demandée (poignée de distance de sécurité)
  const origin: [number, number] = [48.85, 2.35];
  const back = haversine(origin, destinationPoint(origin[0], origin[1], 70, 90));
  assert.ok(Math.abs(back - 70) < 0.5, `distance retour: ${back}`);
});

test('snapDistance : au mètre sous 25 m, par 5 m au-delà', () => {
  // < 25 m : mètre près
  assert.equal(snapDistance(3.4), 3);
  assert.equal(snapDistance(12.6), 13);
  assert.equal(snapDistance(24.2), 24);
  // ≥ 25 m : pas de 5 m
  assert.equal(snapDistance(25), 25);
  assert.equal(snapDistance(27.4), 25);
  assert.equal(snapDistance(27.6), 30);
  assert.equal(snapDistance(80), 80);
  assert.equal(snapDistance(437), 435);
  // garde-fous
  assert.equal(snapDistance(0), 1);
  assert.equal(snapDistance(-5), 1);
  assert.equal(snapDistance(Number.NaN), 1);
  // toute valeur ≥ 25 est un multiple de 5
  for (const m of [25, 31, 44.9, 99.99, 1234]) assert.equal(snapDistance(m) % 5, 0, `${m}`);
});

test('ringCentroid : centre du carré, du triangle, repli sur un segment', () => {
  const square: [number, number][] = [
    [45, 2],
    [45, 2.001],
    [45.001, 2.001],
    [45.001, 2],
  ];
  const [lat, lng] = ringCentroid(square);
  assert.ok(Math.abs(lat - 45.0005) < 1e-6, `lat ${lat}`);
  assert.ok(Math.abs(lng - 2.0005) < 1e-6, `lng ${lng}`);

  const triangle: [number, number][] = [
    [0, 0],
    [0, 2],
    [2, 0],
  ];
  const [tLat, tLng] = ringCentroid(triangle);
  assert.ok(Math.abs(tLat - 2 / 3) < 0.002, `tLat ${tLat}`);
  assert.ok(Math.abs(tLng - 2 / 3) < 0.002, `tLng ${tLng}`);

  // segment (2 points) : barycentre au milieu
  assert.deepEqual(ringCentroid([[10, 20], [12, 22]]), [11, 21]);
  assert.deepEqual(ringCentroid([]), [0, 0]);
});

test('ringLength : ligne ouverte, périmètre fermé, cas dégénérés', () => {
  const dLng = 100 / 111320; // ~100 m en longitude à l'équateur
  const line: [number, number][] = [
    [0, 0],
    [0, dLng],
  ];
  assert.ok(Math.abs(ringLength(line) - 100) < 0.2, `ligne ${ringLength(line)}`);
  // fermée, la ligne referme le même tracé : 2 trajets de 100 m
  assert.ok(Math.abs(ringLength(line, true) - 200) < 0.4);

  const lat = 45;
  const dy = 100 / 110540;
  const dx = 100 / (111320 * Math.cos((lat * Math.PI) / 180));
  const square: [number, number][] = [
    [lat, 2],
    [lat + dy, 2],
    [lat + dy, 2 + dx],
    [lat, 2 + dx],
  ];
  // ouvert : 3 côtés, fermé : le périmètre complet
  assert.ok(Math.abs(ringLength(square) - 300) / 300 < 0.02);
  assert.ok(Math.abs(ringLength(square, true) - 400) / 400 < 0.02);

  assert.equal(ringLength([]), 0);
  assert.equal(ringLength([[1, 2]]), 0);
});

test('formatMeters : arrondi et espaces normales', () => {
  assert.equal(formatMeters(1234.6), '1 235');
  assert.equal(formatMeters(0.4), '0');
  assert.equal(formatMeters(87), '87');
  assert.equal(formatMeters(Number.NaN), '0');
  assert.ok(!/[\u202f\u00a0]/.test(formatMeters(12345)), 'pas d’espace fine');
});

test('formatCoord / scaleDenominator', () => {
  assert.equal(formatCoord(48.1234567, 2.1), '48.12346, 2.10000');
  assert.equal(scaleDenominator(190, 190), 1000);
  assert.equal(scaleDenominator(0, 190), 0);
});
