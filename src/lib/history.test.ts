import test from 'node:test';
import assert from 'node:assert/strict';
import { History } from './history.ts';

test('undo / redo : aller-retour sur trois états', () => {
  const h = new History('A');
  assert.equal(h.canUndo, false);

  h.record('B');
  h.record('C');
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);

  assert.equal(h.undo('C'), 'B');
  assert.equal(h.undo('B'), 'A');
  assert.equal(h.undo('A'), null, 'plus rien à annuler');
  assert.equal(h.canRedo, true);

  assert.equal(h.redo('A'), 'B');
  assert.equal(h.redo('B'), 'C');
  assert.equal(h.redo('C'), null);
});

test('un nouveau changement vide la pile de rétablissement', () => {
  const h = new History('A');
  h.record('B');
  h.undo('B');
  assert.equal(h.canRedo, true);
  h.record('X');
  assert.equal(h.canRedo, false);
  assert.equal(h.undo('X'), 'A');
});

test('snapshot identique : aucun nouveau point de retour', () => {
  const h = new History('A');
  assert.equal(h.record('A'), false);
  assert.equal(h.canUndo, false);
});

test('limite de profondeur respectée', () => {
  const h = new History('0', 3);
  for (let i = 1; i <= 10; i++) h.record(String(i));
  let live = '10';
  let steps = 0;
  for (let prev = h.undo(live); prev !== null; prev = h.undo(live)) {
    live = prev;
    steps++;
  }
  assert.equal(steps, 3);
});
