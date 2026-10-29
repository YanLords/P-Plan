import test from 'node:test';
import assert from 'node:assert/strict';
import { cityOf, legendRowsFor } from './legend.ts';
import type { Plan } from './elements.ts';

const plan = (elements: unknown[]): Plan =>
  ({ version: 1, titre: 't', site: '', date: '2026-10-23', center: [0, 0], zoom: 5, base: 'osm', elements }) as Plan;

test('barriérage : une seule ligne, avec la somme des longueurs', () => {
  const rows = legendRowsFor(
    plan([
      { id: 'b1', kind: 'barrierage', label: 'Barriérage', lat: 0, lng: 0, ring: [[0, 0], [0, 0.01]] },
      { id: 'b2', kind: 'barrierage', label: 'Barriérage', lat: 0, lng: 0, ring: [[0, 0], [0, 0.02]] },
    ])
  );
  const bar = rows.filter((r) => r.kind === 'barrierage');
  assert.equal(bar.length, 1);
  // 0,01° + 0,02° de longitude à l'équateur ≈ 1113 m + 2226 m
  assert.match(bar[0].details, /^3\s?3\d\d m à couvrir$/);
});

test('artifices : une ligne par couleur, pas par engin', () => {
  const rows = legendRowsFor(
    plan([
      { id: 'a1', kind: 'artifice', label: 'Artifice', lat: 0, lng: 0, ds: 20, color: '#111111' },
      { id: 'a2', kind: 'artifice', label: 'Artifice', lat: 0, lng: 0, ds: 40, color: '#111111' },
      { id: 'a3', kind: 'artifice', label: 'Artifice', lat: 0, lng: 0, ds: 20, color: '#222222' },
    ])
  );
  const arts = rows.filter((r) => r.kind === 'artifice');
  assert.equal(arts.length, 2);
  assert.equal(arts[0].color, '#111111');
  assert.equal(arts[0].details, 'DS 20 m · 40 m');
  assert.equal(arts[1].details, 'DS 20 m');
});

test('équipements répétés fusionnés, notes concaténées', () => {
  const rows = legendRowsFor(
    plan([
      { id: 'p1', kind: 'extincteur', label: 'Extincteur', lat: 0, lng: 0, notes: 'poste 1' },
      { id: 'p2', kind: 'extincteur', label: 'Extincteur', lat: 0, lng: 0, notes: 'poste 2' },
    ])
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, 'poste 1 · poste 2');
});

test('zones public en icône : une seule ligne, zones en surface gardées', () => {
  const rows = legendRowsFor(
    plan([
      { id: 'z1', kind: 'zone_public', label: 'Zone public', lat: 0, lng: 0, ring: [[0, 0], [0, 0.01], [0.01, 0.01]], pointMode: true },
      { id: 'z2', kind: 'zone_public', label: 'Zone public', lat: 0, lng: 0, ring: [[0, 0], [0, 0.02], [0.02, 0.02]], pointMode: true },
      { id: 'z3', kind: 'zone_public', label: 'Zone public', lat: 0, lng: 0, ring: [[0, 0], [0, 0.03], [0.03, 0.03]] },
    ])
  );
  const icons = rows.filter((r) => r.kind === 'zone_public' && r.details === '');
  assert.equal(icons.length, 1);
  assert.equal(rows.filter((r) => r.kind === 'zone_public').length, 2);
});

test('légende triée par type (ordre du rail), artifices gardés ensemble', () => {
  const rows = legendRowsFor(
    plan([
      { id: 'e1', kind: 'extincteur', label: 'Extincteur', lat: 0, lng: 0 },
      { id: 'a1', kind: 'artifice', label: 'Artifice', lat: 0, lng: 0, color: '#111111' },
      { id: 'b1', kind: 'barrierage', label: 'Barriérage', lat: 0, lng: 0, ring: [[0, 0], [0, 0.01]] },
      { id: 'a2', kind: 'artifice', label: 'Artifice', lat: 0, lng: 0, color: '#222222' },
      { id: 'm1', kind: 'marqueur', label: 'Marqueur A', lat: 0, lng: 0 },
    ])
  );
  // extincteur (placé en premier sur le plan) doit passer après artifice/barriérage
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['artifice', 'artifice', 'barrierage', 'extincteur', 'marqueur']
  );
});

test('commune extraite des formats BAN et Nominatim', () => {
  assert.equal(cityOf('Montpellier, Hérault, Occitanie, France'), 'Montpellier');
  assert.equal(cityOf('12 Rue de la Loge, 34000 Montpellier'), 'Montpellier');
  assert.equal(cityOf('12 Rue de la Loge 34000 Montpellier'), 'Montpellier');
  assert.equal(cityOf(''), '');
});
