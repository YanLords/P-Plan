import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  SHORTCUT_ORDER,
  assignShortcut,
  clampScale,
  normalizeKey,
  sanitizeSettings,
  toolForShortcut,
} from './settings-model.ts';

test('raccourcis par défaut : ceux de la spécification', () => {
  assert.deepEqual(DEFAULT_SHORTCUTS, {
    select: 'v',
    artifice: 'a',
    zone_public: 'p',
    zone_perso: 'z',
    barrierage: 'b',
    acces_secours: 's',
    accueil_secours: 'q',
    point_eau: 'e',
    extincteur: 'w',
    echelle: 'x',
    marqueur: 'm',
  });
  for (const tool of SHORTCUT_ORDER) {
    assert.equal(toolForShortcut(DEFAULT_SHORTCUTS, DEFAULT_SHORTCUTS[tool]), tool);
  }
});

test('toolForShortcut : casse ignorée, inconnue -> null', () => {
  assert.equal(toolForShortcut(DEFAULT_SHORTCUTS, 'A'), 'artifice');
  assert.equal(toolForShortcut(DEFAULT_SHORTCUTS, '  z '), 'zone_perso');
  assert.equal(toolForShortcut(DEFAULT_SHORTCUTS, 'k'), null);
  assert.equal(toolForShortcut(DEFAULT_SHORTCUTS, ''), null);
  assert.equal(toolForShortcut(DEFAULT_SHORTCUTS, 'Meta'), null);
});

test('assignShortcut : pas de doublon, touche invalide ignorée', () => {
  const map = assignShortcut(DEFAULT_SHORTCUTS, 'artifice', 'v');
  assert.equal(map.artifice, 'v');
  assert.equal(map.select, '', 'la touche est retirée de Sélect.');
  assert.equal(map.marqueur, 'm', 'les autres touches sont intactes');

  const unchanged = assignShortcut(DEFAULT_SHORTCUTS, 'artifice', 'F5');
  assert.deepEqual(unchanged, DEFAULT_SHORTCUTS);

  assert.equal(assignShortcut(DEFAULT_SHORTCUTS, 'artifice', 'A').artifice, 'a');
});

test('normalizeKey / clampScale', () => {
  assert.equal(normalizeKey(' A '), 'a');
  assert.equal(normalizeKey('7'), '7');
  assert.equal(normalizeKey('é'), '');
  assert.equal(normalizeKey(undefined), '');

  assert.equal(clampScale(1), 1);
  assert.equal(clampScale(0.1), 0.8);
  assert.equal(clampScale(9), 1.3);
  assert.equal(clampScale(1.07), 1.05);
  assert.equal(clampScale(Number.NaN), 1);
  assert.equal(clampScale('1.2'), 1.2);
});

test('sanitizeSettings : données corrompues -> défauts, champs valides conservés', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);

  const partial = sanitizeSettings({ uiScale: 42, defaultBase: 'sat', showLegend: false, autosave: 'oui' });
  assert.equal(partial.uiScale, 1.3);
  assert.equal(partial.defaultBase, 'sat');
  assert.equal(partial.showLegend, false);
  assert.equal(partial.autosave, true, 'valeur non booléenne -> défaut');

  const badBase = sanitizeSettings({ defaultBase: 'ignoré' });
  assert.equal(badBase.defaultBase, 'osm');

  const custom = sanitizeSettings({ shortcuts: { select: '', artifice: 'k', marqueur: '!!' } });
  assert.equal(custom.shortcuts.select, '', 'touche volontairement vidée conservée');
  assert.equal(custom.shortcuts.artifice, 'k');
  assert.equal(custom.shortcuts.marqueur, 'm', 'touche invalide -> défaut');
  assert.equal(custom.shortcuts.echelle, 'x');
});
