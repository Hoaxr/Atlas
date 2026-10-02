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
});
