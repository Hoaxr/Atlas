const test = require('node:test');
const assert = require('node:assert/strict');
const indexerService = require('../server/services/indexerService');

test('Manual Search Enhancements & Prowlarr Custom Query Handling', async (t) => {
  await t.test('indexerService exports all required search and helper methods', () => {
    assert.strictEqual(typeof indexerService.searchMovie, 'function');
    assert.strictEqual(typeof indexerService.searchEpisode, 'function');
    assert.strictEqual(typeof indexerService.searchSeasonPack, 'function');
    assert.strictEqual(typeof indexerService.searchShowPack, 'function');
    assert.strictEqual(typeof indexerService.searchMusic, 'function');
    assert.strictEqual(typeof indexerService.getCircuitStatus, 'function');
  });

  await t.test('circuit status reporting provides expected shape', () => {
    const status = indexerService.getCircuitStatus();
    assert.strictEqual(typeof status.failures, 'number');
    assert.strictEqual(typeof status.open, 'boolean');
    assert.strictEqual(typeof status.cooldownRemaining, 'number');
  });

  await t.test('isVideoMusicRelease correctly identifies and rejects video/concert releases', () => {
    const isVideo = indexerService.isVideoMusicRelease;
    assert.strictEqual(typeof isVideo, 'function');

    // Video releases that must be rejected
    assert.strictEqual(isVideo('No Doubt — The Videos 1992–2003 (2004) DVD9'), true);
    assert.strictEqual(isVideo('No.Doubt.The.Videos.1992.2003.2004.NTSC.DVD9.MDVDR-AURORA'), true);
    assert.strictEqual(isVideo('No Doubt - Live in the Tragic Kingdom 1997.avi'), true);
    assert.strictEqual(isVideo('Queen - Live at Wembley Stadium 1080p BluRay x264'), true);
    assert.strictEqual(isVideo('Metallica - Live in Mexico (2009) [720p WEB-DL]'), true);
    assert.strictEqual(isVideo('Nirvana - Live and Loud (1993) [DVD]'), true);
    assert.strictEqual(isVideo('Madonna - The Celebration Tour (2024) 4K UHD ISO'), true);
    assert.strictEqual(isVideo('Artist - Best of Music Videos [1080p]'), true);
    assert.strictEqual(isVideo('Some Band - Concert Film (2020)'), true);
    assert.strictEqual(isVideo('Artist - Album (2022) [VIDEO_TS]'), true);

    // Torznab category 3030 (Audio/Video) rejection
    assert.strictEqual(isVideo('Some Band - Live Concert', [{ id: 3030, name: 'Audio/Video' }]), true);

    // Legitimate music audio releases that must be accepted
    assert.strictEqual(isVideo('No Doubt - Tragic Kingdom (1995) [FLAC]'), false);
    assert.strictEqual(isVideo('Daft Punk - Random Access Memories (2013) [320 kbps MP3]'), false);
    assert.strictEqual(isVideo('Radiohead - OK Computer (1997) [WEB - FLAC 24-96]'), false);
    assert.strictEqual(isVideo('The Beatles - Abbey Road (1969) [Vinyl Rip FLAC]'), false);
    assert.strictEqual(isVideo('Coldplay - Parachutes (2000) [ALAC]'), false);
    assert.strictEqual(isVideo('Adele - 21 (2011) [AAC 256kbps]'), false);
  });
});
