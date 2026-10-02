const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { isDangerousFile, findDangerousFiles } = require('../server/utils/fileUtils');
const indexerService = require('../server/services/indexerService');
const downloadClientService = require('../server/services/downloadClientService');

test('Executable Payload Blocking & Quarantine Security', async (t) => {
  await t.test('fileUtils.isDangerousFile correctly identifies executable extensions', () => {
    assert.strictEqual(isDangerousFile('movie.exe'), true);
    assert.strictEqual(isDangerousFile('Dark.Matter.S02E06.1080p.WEB.H264.exe'), true);
    assert.strictEqual(isDangerousFile('/mnt/nas/downloads/setup.msi'), true);
    assert.strictEqual(isDangerousFile('script.bat'), true);
    assert.strictEqual(isDangerousFile('trojan.vbs'), true);
    assert.strictEqual(isDangerousFile('malware.scr'), true);
    assert.strictEqual(isDangerousFile('hack.ps1'), true);

    // Legitimate media and sidecar extensions must NOT be marked dangerous
    assert.strictEqual(isDangerousFile('movie.mkv'), false);
    assert.strictEqual(isDangerousFile('episode.mp4'), false);
    assert.strictEqual(isDangerousFile('track.flac'), false);
    assert.strictEqual(isDangerousFile('song.mp3'), false);
    assert.strictEqual(isDangerousFile('subtitle.en.srt'), false);
    assert.strictEqual(isDangerousFile('info.nfo'), false);
  });

  await t.test('fileUtils.findDangerousFiles locates executables recursively in a folder', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'atlas-sec-test-'));
    try {
      const subDir = path.join(tmpDir, 'sub');
      await fs.promises.mkdir(subDir, { recursive: true });

      const safeFile = path.join(tmpDir, 'sample.mkv');
      const exeFile = path.join(subDir, 'payload.exe');
      const batFile = path.join(tmpDir, 'install.bat');

      await fs.promises.writeFile(safeFile, 'dummy media');
      await fs.promises.writeFile(exeFile, 'fake exe binary');
      await fs.promises.writeFile(batFile, '@echo off');

      const found = await findDangerousFiles(tmpDir);
      assert.strictEqual(found.length, 2);
      assert.ok(found.some(f => f.endsWith('payload.exe')));
      assert.ok(found.some(f => f.endsWith('install.bat')));
      assert.ok(!found.some(f => f.endsWith('sample.mkv')));
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('indexerService.isMaliciousOrFakeRelease rejects dangerous releases and software categories', () => {
    const isMalicious = indexerService.isMaliciousOrFakeRelease;
    assert.strictEqual(typeof isMalicious, 'function');

    // Title with .exe or zipx
    assert.strictEqual(isMalicious('Dark.Matter.S02E06.1080p.WEB.H264-MeGusta.exe'), true);
    assert.strictEqual(isMalicious('Inception.2010.1080p.BluRay.zipx'), true);
    assert.strictEqual(isMalicious('Setup.msi'), true);

    // Torznab PC/Software categories (4000-4999) disguised as TV/Movie title
    assert.strictEqual(isMalicious('Dark Matter S02E06 1080p WEB H264-MeGusta', [{ id: 4000, name: 'PC' }]), true);
    assert.strictEqual(isMalicious('Gladiator 2000 1080p', [{ id: 4050, name: 'PC/Games' }]), true);

    // Extra links containing .exe
    assert.strictEqual(isMalicious('Clean Title', [], { link: 'https://indexer.com/dl/malicious.exe' }), true);
    assert.strictEqual(isMalicious('Clean Title', [], { fileName: 'payload.exe' }), true);

    // Legitimate video and audio releases
    assert.strictEqual(isMalicious('Dark Matter S02E06 1080p WEB H264-MeGusta', [{ id: 5000, name: 'TV' }]), false);
    assert.strictEqual(isMalicious('Inception 2010 1080p BluRay x264', [{ id: 2000, name: 'Movies' }]), false);
  });

  await t.test('downloadClientService.addTorrent blocks URLs containing executable payloads', async () => {
    await assert.rejects(
      () => downloadClientService.addTorrent('http://example.com/payload.exe'),
      /Refusing to download executable/
    );

    await assert.rejects(
      () => downloadClientService.addTorrent('magnet:?xt=urn:btih:1234567890abcdef&dn=Dark+Matter+S02E06.exe'),
      /Refusing to download executable/
    );
  });

  await t.test('downloadClientService exports getTorrentFiles and security helpers', () => {
    assert.strictEqual(typeof downloadClientService.getTorrentFiles, 'function');
    assert.strictEqual(typeof downloadClientService.quarantineMaliciousTorrent, 'function');
    assert.strictEqual(typeof downloadClientService.inspectTorrentsForMalware, 'function');
  });

  await t.test('resetDownloadsNotInClient correctly resets unmonitored items and recalculates music artist status', async () => {
    const db = require('../server/config/database');
    const { resetDownloadsNotInClient } = require('../server/services/mediaManagementService');

    // Create temporary test items
    db.prepare("INSERT INTO movies (title, year, tmdb_id, status, monitored) VALUES ('Test Unmonitored Movie', 2026, 9999901, 'downloading', 0)").run();
    db.prepare("INSERT INTO music_artists (name, status, monitored) VALUES ('Test Reset Artist', 'downloading', 1)").run();
    const artist = db.prepare("SELECT id FROM music_artists WHERE name = 'Test Reset Artist'").get();
    db.prepare("INSERT INTO music_albums (artist_id, title, status, monitored) VALUES (?, 'Test Album', 'downloading', 1)").run(artist.id);

    try {
      // Empty torrent list -> downloads no longer in client
      await resetDownloadsNotInClient([]);

      const updatedMovie = db.prepare("SELECT status FROM movies WHERE tmdb_id = 9999901").get();
      assert.strictEqual(updatedMovie.status, 'unmonitored');

      const updatedArtist = db.prepare("SELECT status FROM music_artists WHERE id = ?").get(artist.id);
      assert.strictEqual(updatedArtist.status, 'monitored');
    } finally {
      db.prepare("DELETE FROM movies WHERE tmdb_id = 9999901").run();
      db.prepare("DELETE FROM music_albums WHERE artist_id = ?").run(artist.id);
      db.prepare("DELETE FROM music_artists WHERE id = ?").run(artist.id);
    }
  });

  await t.test('matchMovieToTorrent accurately matches titles containing year tokens and respects release years', () => {
    const { matchMovieToTorrent } = require('../server/services/mediaManagementService');

    // 1917 (2019)
    assert.strictEqual(
      matchMovieToTorrent({ name: '1917.2019.1080p.BluRay.x264-SPARKS' }, { title: '1917', year: 2019 }),
      true
    );

    // Blade Runner 2049 (2017)
    assert.strictEqual(
      matchMovieToTorrent({ name: 'Blade.Runner.2049.2017.1080p.BluRay.x264-SPARKS' }, { title: 'Blade Runner 2049', year: 2017 }),
      true
    );

    // 2001: A Space Odyssey (1968)
    assert.strictEqual(
      matchMovieToTorrent({ name: '2001.A.Space.Odyssey.1968.1080p.BluRay' }, { title: '2001: A Space Odyssey', year: 1968 }),
      true
    );

    // Wrong year must NOT match (e.g. 1982 original vs 2011 remake)
    assert.strictEqual(
      matchMovieToTorrent({ name: 'The.Thing.2011.1080p.BluRay' }, { title: 'The Thing', year: 1982 }),
      false
    );
  });

  await t.test('calculateNextSearchAt requires boolean isCutoffMet === true to avoid false expirations', () => {
    const { calculateNextSearchAt } = require('../server/services/schedulerLogic');

    // Passing a function or non-boolean truthy object must NOT trigger expiration
    const fakeFn = () => {};
    const res = calculateNextSearchAt({ retry_count: 0 }, 'episode', { isDownloaded: true, isCutoffMet: fakeFn });
    assert.notStrictEqual(res.state, 'EXPIRED');

    // True boolean cutoff met triggers expiration
    const resExpired = calculateNextSearchAt({ retry_count: 0 }, 'episode', { isDownloaded: true, isCutoffMet: true });
    assert.strictEqual(resExpired.state, 'EXPIRED');
    assert.strictEqual(resExpired.nextSearch, null);
  });

  await t.test('matchEpisodeToTorrent handles multi-episode releases, dots, and scene formats', () => {
    const { matchEpisodeToTorrent } = require('../server/services/mediaManagementService');

    const ep1 = { show_title: 'Dark Matter', season_number: 1, episode_number: 1 };
    const ep2 = { show_title: 'Dark Matter', season_number: 1, episode_number: 2 };
    const ep5 = { show_title: 'Dark Matter', season_number: 1, episode_number: 5 };

    // S01E01-E02 with dots
    assert.strictEqual(matchEpisodeToTorrent({ name: 'Dark.Matter.S01E01.E02.1080p.WEB-DL' }, ep1), true);
    assert.strictEqual(matchEpisodeToTorrent({ name: 'Dark.Matter.S01E01.E02.1080p.WEB-DL' }, ep2), true);
    assert.strictEqual(matchEpisodeToTorrent({ name: 'Dark.Matter.S01E01.E02.1080p.WEB-DL' }, ep5), false);

    // Multi-episode with range
    assert.strictEqual(matchEpisodeToTorrent({ name: 'Dark.Matter.S01E01-E04.1080p' }, ep2), true);
    assert.strictEqual(matchEpisodeToTorrent({ name: 'Dark.Matter.S01E01-E04.1080p' }, ep5), false);

    // Scene format 1x01-02
    assert.strictEqual(matchEpisodeToTorrent({ name: 'Dark.Matter.1x01-02.720p' }, ep1), true);
    assert.strictEqual(matchEpisodeToTorrent({ name: 'Dark.Matter.1x01-02.720p' }, ep2), true);
  });
});
