const assert = require('assert');
const { parseSubtitles, serializeSubtitles, protectTags, restoreTags } = require('../server/services/subtitles/parser');
const { getTranslationProvider } = require('../server/services/subtitles/translationProviders');

console.log('=== Running Subtitle System Tests ===\n');

// Test 1: Parser & Serializer
console.log('Test 1: Parser & Serializer');
const sampleSrt = `1
00:01:20,123 --> 00:01:25,456
JOHN: <i>Hello there!</i> [Dramatic music]
How are you today?

2
00:01:26,000 --> 00:01:29,999
{\\an8}♪ Under the moonlight ♪
`;

const { cues, format } = parseSubtitles(sampleSrt);
assert.strictEqual(format, 'srt');
assert.strictEqual(cues.length, 2);
assert.strictEqual(cues[0].id, 1);
assert.strictEqual(cues[0].startTime, '00:01:20,123');
assert.strictEqual(cues[0].endTime, '00:01:25,456');
assert.strictEqual(cues[1].startTime, '00:01:26,000');
assert.strictEqual(cues[1].endTime, '00:01:29,999');
console.log('✓ Parsing passed');

// Test 2: Tag & Format Protection
console.log('Test 2: Tag & Format Protection');
const textWithTags = cues[0].text;
const { protectedText, tagMap } = protectTags(textWithTags);
assert(tagMap.size >= 3, `Expected at least 3 protected tags, got ${tagMap.size}`);
assert(protectedText.includes('❲T'), 'Protected text should contain tokens');

// Simulate translation
const translatedWithTokens = protectedText
  .replace('Hello there!', 'Hallo daar!')
  .replace('How are you today?', 'Hoe gaat het met je vandaag?');

const restored = restoreTags(translatedWithTokens, tagMap);
assert(restored.includes('JOHN:'), 'Should restore speaker prefix');
assert(restored.includes('<i>'), 'Should restore HTML start tag');
assert(restored.includes('</i>'), 'Should restore HTML end tag');
assert(restored.includes('[Dramatic music]'), 'Should restore bracketed sound effect');
assert(restored.includes('Hallo daar!'), 'Should contain translated text');
console.log('✓ Tag protection & restoration passed:', restored);

// Test 3: Re-serialization
console.log('Test 3: Re-serialization');
cues[0].text = restored;
const serialized = serializeSubtitles(cues, 'srt');
assert(serialized.includes('00:01:20,123 --> 00:01:25,456'));
assert(serialized.includes('JOHN: <i>Hallo daar!</i> [Dramatic music]'));
console.log('✓ Serialization passed');

// Test 4: Translation Provider
console.log('Test 4: Translation Provider Factory');
const gtx = getTranslationProvider('googleTranslate');
assert(gtx.name === 'googleTranslate');
console.log('✓ Provider factory passed');

console.log('\n=== All Tests Passed Successfully! ===');
