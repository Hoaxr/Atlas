const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLanguageCode, ISO_639_2_TO_1, LANGUAGE_NAMES } = require('../server/utils/languages');

test('Language Normalization & ISO 639 Mapping', async (t) => {
  await t.test('normalizes 3-letter codes to standard 2-letter ISO 639-1', () => {
    assert.strictEqual(normalizeLanguageCode('eng'), 'en');
    assert.strictEqual(normalizeLanguageCode('dut'), 'nl');
    assert.strictEqual(normalizeLanguageCode('nld'), 'nl');
    assert.strictEqual(normalizeLanguageCode('fre'), 'fr');
    assert.strictEqual(normalizeLanguageCode('fra'), 'fr');
    assert.strictEqual(normalizeLanguageCode('ger'), 'de');
    assert.strictEqual(normalizeLanguageCode('deu'), 'de');
    assert.strictEqual(normalizeLanguageCode('spa'), 'es');
    assert.strictEqual(normalizeLanguageCode('ita'), 'it');
    assert.strictEqual(normalizeLanguageCode('por'), 'pt');
    assert.strictEqual(normalizeLanguageCode('swe'), 'sv');
    assert.strictEqual(normalizeLanguageCode('dan'), 'da');
    assert.strictEqual(normalizeLanguageCode('nor'), 'no');
    assert.strictEqual(normalizeLanguageCode('pol'), 'pl');
    assert.strictEqual(normalizeLanguageCode('fin'), 'fi');
  });

  await t.test('preserves valid 2-letter codes', () => {
    assert.strictEqual(normalizeLanguageCode('en'), 'en');
    assert.strictEqual(normalizeLanguageCode('nl'), 'nl');
    assert.strictEqual(normalizeLanguageCode('fr'), 'fr');
    assert.strictEqual(normalizeLanguageCode('de'), 'de');
    assert.strictEqual(normalizeLanguageCode('es'), 'es');
  });

  await t.test('handles case and regional tags', () => {
    assert.strictEqual(normalizeLanguageCode('ENG'), 'en');
    assert.strictEqual(normalizeLanguageCode('EN-US'), 'en');
    assert.strictEqual(normalizeLanguageCode('pt-BR'), 'pt');
    assert.strictEqual(normalizeLanguageCode('  NLD  '), 'nl');
  });

  await t.test('provides human-readable names for top languages', () => {
    assert.strictEqual(LANGUAGE_NAMES['en'], 'English');
    assert.strictEqual(LANGUAGE_NAMES['nl'], 'Dutch');
    assert.strictEqual(LANGUAGE_NAMES['fr'], 'French');
    assert.strictEqual(LANGUAGE_NAMES['es'], 'Spanish');
    assert.strictEqual(LANGUAGE_NAMES['de'], 'German');
    assert.strictEqual(LANGUAGE_NAMES['sv'], 'Swedish');
  });
});
