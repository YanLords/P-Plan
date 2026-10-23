import test from 'node:test';
import assert from 'node:assert/strict';
import { changelogFor } from './changelog.ts';

const SAMPLE = `# Journal

## [Non publié]

## [1.2.3] — 2026-10-23

### Ajouté

- Premier point.
- Deuxième point.

### Modifié

- Un point modifié.

## [1.2.2] — 2026-10-22

### Corrigé

- Ancien point.
`;

test('lit la section de la version demandée', () => {
  const entry = changelogFor('1.2.3', SAMPLE);
  assert.ok(entry);
  assert.equal(entry.date, '2026-10-23');
  assert.deepEqual(
    entry.groups.map((g) => g.title),
    ['Ajouté', 'Modifié']
  );
  assert.equal(entry.groups[0].items.length, 2);
  assert.equal(entry.groups[1].items[0], 'Un point modifié.');
});

test('ne déborde pas sur la version suivante', () => {
  const entry = changelogFor('1.2.2', SAMPLE);
  assert.deepEqual(entry?.groups.flatMap((g) => g.items), ['Ancien point.']);
});

test('le balisage markdown est retiré', () => {
  const text = '## [2.0.0] — 2026-10-23\n\n### Ajouté\n\n- **Gras** et `code` ici.\n';
  assert.deepEqual(changelogFor('2.0.0', text)?.groups[0].items, ['Gras et code ici.']);
});

test('version inconnue ou vide -> null', () => {
  assert.equal(changelogFor('9.9.9', SAMPLE), null);
  assert.equal(changelogFor('', SAMPLE), null);
});

test('le CHANGELOG livré contient la version courante', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile('CHANGELOG.md', 'utf8');
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
  const entry = changelogFor(pkg.version, text);
  assert.ok(entry, `CHANGELOG.md doit décrire la version ${pkg.version}`);
  assert.ok(entry.groups.length > 0);
});
