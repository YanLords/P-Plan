import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_CIRCUMFERENCE,
  metersPerPixel,
  metersToPixels,
  parseDistance,
  haversine,
  destinationPoint,
  formatCoord,
  ringArea,
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

test('formatCoord / scaleDenominator', () => {
  assert.equal(formatCoord(48.1234567, 2.1), '48.12346, 2.10000');
  assert.equal(scaleDenominator(190, 190), 1000);
  assert.equal(scaleDenominator(0, 190), 0);
});
