const assert = require('assert');
const { parseSubtitles, serializeSubtitles, protectTags, restoreTags, decodeSubtitleBuffer } = require('../server/services/subtitles/parser');
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

// Test 4: UTF-16 LE Encoding & Null Byte handling
console.log('Test 4: UTF-16 LE Buffer Handling');
const utf16leBuf = Buffer.from('\uFEFF1\r\n00:00:10,000 --> 00:00:15,000\r\nUTF-16 Encoded Line\r\n', 'utf16le');
const parsedUtf16 = parseSubtitles(utf16leBuf);
assert.strictEqual(parsedUtf16.cues.length, 1);
assert.strictEqual(parsedUtf16.cues[0].text, 'UTF-16 Encoded Line');
assert.strictEqual(parsedUtf16.cues[0].startTime, '00:00:10,000');
console.log('✓ UTF-16 LE decoding passed');

// Test 5: ASS / SSA Subtitle Support
console.log('Test 5: ASS / SSA Subtitle Support');
const assText = `[Script Info]
Title: Dark Matter
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:20.12,0:01:25.45,Default,,0,0,0,,Hello from ASS dialogue!
Dialogue: 0,0:01:26.00,0:01:29.99,Default,,0,0,0,,{\\an8}Second ASS line
`;
const parsedAss = parseSubtitles(assText);
assert.strictEqual(parsedAss.cues.length, 2);
assert.strictEqual(parsedAss.cues[0].text, 'Hello from ASS dialogue!');
console.log('✓ ASS subtitle parsing passed');

// Test 6: Translation Provider Factory
console.log('Test 6: Translation Provider Factory');
const gtx = getTranslationProvider('googleTranslate');
assert(gtx.name === 'googleTranslate');
console.log('✓ Provider factory passed');

console.log('\n=== All Tests Passed Successfully! ===');
