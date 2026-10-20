import test from 'node:test';
import assert from 'node:assert/strict';
import { fromGouv, fromNominatim } from './geocode.ts';

test('fromGouv : GeoJSON Base Adresse Nationale -> Place[]', () => {
  const places = fromGouv({
    features: [
      {
        properties: { label: '1 Rue de la Paix 75002 Paris', postcode: '75002', city: 'Paris' },
        geometry: { coordinates: [2.3312, 48.8698] },
      },
      // entrée cassée : ignorée, pas de crash
      { properties: {}, geometry: {} },
    ],
  });
  assert.equal(places.length, 1);
  assert.equal(places[0].label, '1 Rue de la Paix 75002 Paris');
  assert.equal(places[0].detail, '75002 Paris');
  // GeoJSON = [lng, lat]
  assert.equal(places[0].lat, 48.8698);
  assert.equal(places[0].lng, 2.3312);
});

test('fromNominatim : lat/lon en chaînes -> nombres', () => {
  const places = fromNominatim([
    { display_name: 'Sarrey, Haute-Marne', lat: '48.0', lon: '5.5', type: 'village' },
    { display_name: 'sans coordonnées' },
  ]);
  assert.equal(places.length, 1);
  assert.deepEqual(places[0], { label: 'Sarrey, Haute-Marne', detail: 'village', lat: 48, lng: 5.5 });
});

test('payloads inattendus : tableau vide, jamais d’exception', () => {
  assert.deepEqual(fromGouv(null), []);
  assert.deepEqual(fromGouv({}), []);
  assert.deepEqual(fromNominatim(null), []);
  assert.deepEqual(fromNominatim({ error: 'x' }), []);
});
