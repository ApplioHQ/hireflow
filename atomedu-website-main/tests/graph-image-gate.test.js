import test from 'node:test';
import assert from 'node:assert/strict';
import { canImportGraphImage } from '../graph/plotter.js';

test('image drawing is available only on loopback graph pages', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(canImportGraphImage(hostname), true);
    assert.equal(canImportGraphImage(hostname, { showImageImport: true }), true);
  }
  for (const hostname of ['atom-edu.org', 'www.atom-edu.org', 'localhost.evil.test', '192.168.1.10', '']) {
    assert.equal(canImportGraphImage(hostname), false);
    assert.equal(canImportGraphImage(hostname, { showImageImport: true }), false);
  }
  assert.equal(canImportGraphImage('localhost', { compact: true }), false);
  assert.equal(canImportGraphImage('localhost', { showImageImport: false }), false);
});
