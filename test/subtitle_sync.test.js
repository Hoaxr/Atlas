const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { parseSubtitleMetadata, normalizeLanguageCode } = require('../server/utils/languages');
const { parseSubtitles, serializeSubtitles } = require('../server/services/subtitles/parser');
const {
  compareSubtitlesRobust,
  calculateSubtitleQualityScore,
  applyOffsetRepair,
  applyDriftRepair,
  restoreBackup
} = require('../server/services/subtitles/subtitleSyncService');

test('Subtitle Metadata & Tokenizer Suite', async (t) => {
  await t.test('extracts clean ISO language codes from standard filenames', () => {
    assert.strictEqual(parseSubtitleMetadata('Inception.2010.en.srt').langCode, 'en');
    assert.strictEqual(parseSubtitleMetadata('Inception.2010.eng.srt').langCode, 'en');
    assert.strictEqual(parseSubtitleMetadata('The.Matrix.nl.srt').langCode, 'nl');
    assert.strictEqual(parseSubtitleMetadata('The.Matrix.nld.srt').langCode, 'nl');
    assert.strictEqual(parseSubtitleMetadata('The.Matrix.dut.srt').langCode, 'nl');
    assert.strictEqual(parseSubtitleMetadata('Amelie.fre.srt').langCode, 'fr');
    assert.strictEqual(parseSubtitleMetadata('Amelie.fra.srt').langCode, 'fr');
  });

  await t.test('handles regional language tags without misclassifying sub-dialects', () => {
    // nl-BE must normalize to nl (Dutch), NOT be (Belarusian)
    const nlBe = parseSubtitleMetadata('Movie.nl-BE.srt');
    assert.strictEqual(nlBe.langCode, 'nl');
    assert.strictEqual(nlBe.langName, 'Dutch');

    // pt-BR must normalize to pt (Portuguese), NOT br (Breton)
    const ptBr = parseSubtitleMetadata('Movie.pt-BR.srt');
    assert.strictEqual(ptBr.langCode, 'pt');
    assert.strictEqual(ptBr.langName, 'Portuguese');

    // zh-CN must normalize to zh (Chinese)
    const zhCn = parseSubtitleMetadata('Movie.zh-CN.srt');
    assert.strictEqual(zhCn.langCode, 'zh');
    assert.strictEqual(zhCn.langName, 'Chinese');
  });

  await t.test('correctly parses compound tags (forced, sdh, hearing impaired)', () => {
    const forced = parseSubtitleMetadata('Dune.nl.forced.srt');
    assert.strictEqual(forced.langCode, 'nl');
    assert.strictEqual(forced.isForced, true);
    assert.strictEqual(forced.isSdh, false);

    const sdh = parseSubtitleMetadata('Dune.en.sdh.srt');
    assert.strictEqual(sdh.langCode, 'en');
    assert.strictEqual(sdh.isSdh, true);
    assert.strictEqual(sdh.isHearingImpaired, true);

    const compound = parseSubtitleMetadata('Dune.en.forced.sdh.srt');
    assert.strictEqual(compound.langCode, 'en');
    assert.strictEqual(compound.isForced, true);
    assert.strictEqual(compound.isSdh, true);
    assert.strictEqual(compound.isHearingImpaired, true);
  });

  await t.test('disambiguates Hindi (.hi.srt) vs Hearing Impaired (.en.hi.srt)', () => {
    // Hindi movie subtitle
    const hindi = parseSubtitleMetadata('RRR.2022.hi.srt');
    assert.strictEqual(hindi.langCode, 'hi');
    assert.strictEqual(hindi.langName, 'Hindi');
    assert.strictEqual(hindi.isHearingImpaired, false);

    // English Hearing Impaired subtitle
    const enHi = parseSubtitleMetadata('RRR.2022.en.hi.srt');
    assert.strictEqual(enHi.langCode, 'en');
    assert.strictEqual(enHi.isHearingImpaired, true);
  });

  await t.test('strips scene release tags and does not confuse them with languages', () => {
    const scene1 = parseSubtitleMetadata('Gladiator.II.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX.en.srt');
    assert.strictEqual(scene1.langCode, 'en');

    const scene2 = parseSubtitleMetadata('Movie.2160p.UHD.BluRay.x265.HDR.nl.forced.srt');
    assert.strictEqual(scene2.langCode, 'nl');
    assert.strictEqual(scene2.isForced, true);

    // False tags alone should not resolve to language
    const nonLang = parseSubtitleMetadata('Movie.1080p.web.bluray.x264.srt');
    assert.strictEqual(nonLang.langCode, 'und');
  });
});

test('Robust Subtitle Synchronization Engine Suite', async (t) => {
  // Helper to generate synthetic cues
  const generateCues = (count, startSec, stepSec, cueDurationSec = 2.0) => {
    const cues = [];
    for (let i = 0; i < count; i++) {
      const startMs = (startSec + i * stepSec) * 1000;
      const endMs = startMs + cueDurationSec * 1000;
      cues.push({
        id: i + 1,
        startTime: new Date(startMs).toISOString().substr(11, 12).replace('.', ','),
        endTime: new Date(endMs).toISOString().substr(11, 12).replace('.', ','),
        startMs,
        endMs,
        text: `Dialogue cue number ${i + 1} with clear speech text.`
      });
    }
    return cues;
  };

  const refCues = generateCues(60, 60, 25, 2.5); // 60 cues across 25 mins
  const videoDuration = 1800; // 30 min video

  await t.test('identifies perfectly synchronized subtitles as in_sync', () => {
    const targetCues = generateCues(60, 60, 25, 2.5);
    const result = compareSubtitlesRobust(targetCues, refCues, videoDuration);

    assert.strictEqual(result.status, 'in_sync');
    assert(Math.abs(result.offset) < 0.15, `Expected offset near 0, got ${result.offset}`);
    assert(result.confidence >= 0.85, `Expected high confidence, got ${result.confidence}`);
  });

  await t.test('detects positive constant timing offset (+1.85s)', () => {
    const targetCues = generateCues(60, 60 + 1.85, 25, 2.5); // All cues shifted by +1.85s
    const result = compareSubtitlesRobust(targetCues, refCues, videoDuration);

    assert.strictEqual(result.status, 'offset_detected');
    assert(Math.abs(result.offset - 1.85) < 0.1, `Expected offset near 1.85s, got ${result.offset}`);
    assert(result.confidence >= 0.80, `Expected confidence >= 0.80, got ${result.confidence}`);
  });

  await t.test('detects negative constant timing offset (-3.20s)', () => {
    const targetCues = generateCues(60, 60 - 3.20, 25, 2.5); // All cues shifted by -3.20s
    const result = compareSubtitlesRobust(targetCues, refCues, videoDuration);

    assert.strictEqual(result.status, 'offset_detected');
    assert(Math.abs(result.offset - (-3.20)) < 0.1, `Expected offset near -3.20s, got ${result.offset}`);
    assert(result.confidence >= 0.80, `Expected confidence >= 0.80, got ${result.confidence}`);
  });

  await t.test('detects linear framerate drift (23.976 -> 25.0 fps stretch)', () => {
    // Framerate change ratio: 25.0 / 23.976 = 1.0427 (starts near 0, drifts by ~60s over 25 mins)
    const stretch = 25.0 / 23.976;
    const targetCues = refCues.map((c, i) => {
      const newStart = c.startMs * stretch;
      const newEnd = c.endMs * stretch;
      return {
        ...c,
        startMs: newStart,
        endMs: newEnd,
        startTime: new Date(newStart).toISOString().substr(11, 12).replace('.', ','),
        endTime: new Date(newEnd).toISOString().substr(11, 12).replace('.', ',')
      };
    });

    const result = compareSubtitlesRobust(targetCues, refCues, videoDuration);
    assert.strictEqual(result.status, 'drift_detected');
    assert(result.driftSlope !== 0, 'Drift slope should be non-zero');
    assert(Math.abs(result.driftTotal) > 2.0, `Total drift should be significant, got ${result.driftTotal}`);
    assert(result.confidence >= 0.70, `Drift confidence should be >= 0.70, got ${result.confidence}`);
  });

  await t.test('detects cut mismatch / edition mismatch when subtitle only covers fraction of video', () => {
    const shortCues = generateCues(10, 60, 20, 2.0); // Ends at 260s out of a 2 hour (7200s) movie
    const longVideo = 7200;
    const result = compareSubtitlesRobust(shortCues, null, longVideo);

    assert(['duration_mismatch', 'partial_subtitle'].includes(result.status));
  });

  await t.test('computes subtitle quality score accurately', () => {
    const goodCues = generateCues(500, 30, 15, 2.5);
    const scoreGood = calculateSubtitleQualityScore(goodCues, {
      syncResult: { status: 'in_sync', confidence: 0.95 },
      meta: { langCode: 'en' },
      videoDuration: 7500
    });
    assert(scoreGood >= 85, `Expected quality score >= 85 for good sub, got ${scoreGood}`);

    const badCues = [
      { id: 1, startMs: 1000, endMs: 2000, text: '' }, // empty cue
      { id: 2, startMs: 5000, endMs: 4000, text: 'backwards timing' }, // negative duration
      { id: 3, startMs: 6000, endMs: 60000, text: 'extremely long line' }
    ];
    const scoreBad = calculateSubtitleQualityScore(badCues, {
      syncResult: { status: 'invalid_timing', confidence: 0.2 },
      meta: { langCode: 'und' },
      videoDuration: 7500
    });
    assert(scoreBad < 50, `Expected low quality score for broken sub, got ${scoreBad}`);
  });
});

test('Safe Atomic Repair & Verification Suite', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sub-test-'));

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  // Create reference SRT and desynced target SRT
  const refSrtContent = `1
00:01:00,000 --> 00:01:03,000
Welcome back to Atlas.

2
00:01:10,000 --> 00:01:14,000
Everything is running properly.

3
00:01:20,000 --> 00:01:24,000
Subtitles are perfectly aligned.
`;

  // Target is desynced by +2.0 seconds
  const targetSrtContent = `1
00:01:02,000 --> 00:01:05,000
Welcome back to Atlas.

2
00:01:12,000 --> 00:01:16,000
Everything is running properly.

3
00:01:22,000 --> 00:01:26,000
Subtitles are perfectly aligned.
`;

  const refPath = path.join(tmpDir, 'movie.en.srt');
  const targetPath = path.join(tmpDir, 'movie.nl.srt');
  const backupPath = `${targetPath}.bak`;

  fs.writeFileSync(refPath, refSrtContent, 'utf8');
  fs.writeFileSync(targetPath, targetSrtContent, 'utf8');

  await t.test('applies safe offset repair and creates backup', async () => {
    // Repair target with offset = 2.0s
    const repairResult = await applyOffsetRepair(targetPath, 2.0, {
      refPath,
      videoDuration: 300
    });

    assert.strictEqual(repairResult.success, true);
    assert(fs.existsSync(backupPath), 'Backup file (.bak) must exist after repair');

    // Check backup content preserved the original unedited file
    const bakContent = fs.readFileSync(backupPath, 'utf8');
    assert.strictEqual(bakContent.trim(), targetSrtContent.trim());

    // Verify repaired file has shifted cues (-2.0s)
    const repairedContent = fs.readFileSync(targetPath, 'utf8');
    assert(repairedContent.includes('00:01:00,000 --> 00:01:03,000'));
    assert(repairedContent.includes('00:01:10,000 --> 00:01:14,000'));

    // Post-repair verification must confirm in_sync
    assert.strictEqual(repairResult.verification?.status, 'in_sync');
    assert(Math.abs(repairResult.verification?.offset) < 0.1);
  });

  await t.test('restores original subtitle from backup (.bak)', async () => {
    const restoreResult = await restoreBackup(targetPath);
    assert.strictEqual(restoreResult.success, true);
    assert(!fs.existsSync(backupPath), 'Backup file should be deleted upon restore');

    // Target content must match original target before repair
    const restoredContent = fs.readFileSync(targetPath, 'utf8');
    assert.strictEqual(restoredContent.trim(), targetSrtContent.trim());
  });

  await t.test('applies safe drift repair and verifies result', async () => {
    // Create a drifted file with slope = -0.04
    const driftSrtContent = `1
00:01:00,000 --> 00:01:03,000
First line at one minute.

2
00:02:00,000 --> 00:02:03,000
Second line at two minutes.
`;
    fs.writeFileSync(targetPath, driftSrtContent, 'utf8');

    const driftResult = await applyDriftRepair(targetPath, -0.04, {
      videoDuration: 300
    });

    assert.strictEqual(driftResult.success, true);
    assert(fs.existsSync(backupPath), 'Backup file (.bak) must exist after drift repair');

    const repaired = fs.readFileSync(targetPath, 'utf8');
    const { cues } = parseSubtitles(repaired);
    assert.strictEqual(cues.length, 2);
    // Timestamps should have scaled
    assert(cues[1].startMs !== 120000, 'Second cue should have stretched timing');
  });
});
