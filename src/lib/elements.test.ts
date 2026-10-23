import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_META, KNOWN_KINDS, colorOf, isFond, sanitizePlan, type Plan } from './elements.ts';

const plan = (elements: unknown[]): Plan =>
  ({ version: 1, titre: 't', site: '', date: '2026-10-22', center: [0, 0], zoom: 5, base: 'osm', elements }) as Plan;

test('types retirés (échelle, accès secours) écartés à la relecture', () => {
  const p = sanitizePlan(
    plan([
      { id: '1', kind: 'artifice', label: 'A', lat: 1, lng: 2 },
      { id: '2', kind: 'echelle', label: 'Échelle', lat: 1, lng: 2 },
      { id: '3', kind: 'acces_secours', label: 'Accès', lat: 1, lng: 2 },
      { id: '4', kind: 'son', label: 'Son', lat: 1, lng: 2 },
    ])
  );
  assert.deepEqual(
    p.elements.map((e) => e.kind),
    ['artifice', 'son']
  );
});

test('nouveaux types déclarés partout (métadonnées, rail, tracés)', () => {
  assert.ok(KNOWN_KINDS.includes('son') && KNOWN_KINDS.includes('bateau'));
  assert.equal(KIND_META.bouee.label, 'Bouée');
  assert.equal(KIND_META.sortie.label, 'Voie accès secours');
  assert.ok(isFond('bateau') && !isFond('artifice'));
});

test('la couleur personnalisée prime sur celle du type (icône de légende PDF)', () => {
  assert.equal(colorOf({ kind: 'artifice', color: '#0B7285' }), '#0B7285');
  assert.equal(colorOf({ kind: 'artifice' }), KIND_META.artifice.color);
});
