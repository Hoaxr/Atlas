const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { parseAudio } = require('./mediaParsing');


const { VALID_LANGUAGES } = require('./languages');

const getMediaMetadata = async (filePath) => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,width,height,channels,channel_layout:stream_tags=language:format=duration',
      '-of', 'json',
      filePath
    ], { timeout: 30000 });
    const info = JSON.parse(stdout) || {};
    const streams = info.streams || [];
    const format = info.format || {};
    
    const videoStream = streams.find(s => s.codec_type === 'video') || {};
    const audioStreams = streams.filter(s => s.codec_type === 'audio');
    const audioStream = audioStreams[0] || {};
    const subStreams = streams.filter(s => s.codec_type === 'subtitle');

    // Extract embedded subtitle language codes
    const embeddedSubtitles = [...new Set(
      subStreams
        .map(s => (s.tags?.language || '').toLowerCase().trim())
        .filter(lang => lang && VALID_LANGUAGES.has(lang))
    )];

    // Extract audio language codes
    const audioLangs = [...new Set(
      audioStreams
        .map(s => (s.tags?.language || '').toLowerCase().trim())
        .filter(lang => lang && VALID_LANGUAGES.has(lang))
    )];

    // Determine runtime in minutes from ffprobe duration (seconds)
    let runtime = null;
    const duration = parseFloat(format.duration);
    if (!isNaN(duration) && duration > 0) {
      runtime = Math.round(duration / 60);
    }
    
    // Determine resolution
    let resolution = null;
    const w = parseInt(videoStream.width, 10);
    const h = parseInt(videoStream.height, 10);
    if (!isNaN(w) && !isNaN(h)) {
      if (w >= 3800 || h >= 2100) resolution = '2160p';
      else if (w >= 1900 || h >= 1000) resolution = '1080p';
      else if (w >= 1200 || h >= 700) resolution = '720p';
      else resolution = 'SD';
    }

    // Determine codec
    let codec = null;
    if (videoStream.codec_name) {
      const val = videoStream.codec_name.toLowerCase();
      if (val === 'hevc' || val === 'h265') codec = 'x265';
      else if (val === 'h264' || val === 'avc') codec = 'x264';
      else codec = val;
    }

    // Determine audio
    let audio = null;
    if (audioStream.codec_name) {
      let audioCodec = audioStream.codec_name.toUpperCase();
      if (audioCodec === 'EAC3') audioCodec = 'DDP';
      else if (audioCodec === 'AC3') audioCodec = 'DD';
      else if (audioCodec === 'DCA') audioCodec = 'DTS';
      
      let channelsLabel = '';
      if (audioStream.channels === 6) channelsLabel = '5.1';
      else if (audioStream.channels === 8) channelsLabel = '7.1';
      else if (audioStream.channels === 2) channelsLabel = 'Stereo';
      else if (audioStream.channels === 1) channelsLabel = 'Mono';
      else if (audioStream.channels) channelsLabel = `${audioStream.channels}.0`;

      if (channelsLabel) {
        audio = `${audioCodec} ${channelsLabel}`;
      } else {
        audio = audioCodec;
      }
    }

    return { resolution, codec, audio, runtime, embeddedSubtitles, audioLangs };
  } catch {
    return { resolution: null, codec: null, audio: null, runtime: null, embeddedSubtitles: [], audioLangs: [] };
  }
};

/**
 * Parse audio codec from a filename or scene name.
 * Delegates to the canonical parseAudio in mediaParsing.js.
 * Returns a codec string or null.
 */
const parseAudioFromFileName = (fileName) => parseAudio(fileName);


const getResolution = async (filePath) => {
  const meta = await getMediaMetadata(filePath);
  return meta.resolution;
};

const getCodec = async (filePath) => {
  const meta = await getMediaMetadata(filePath);
  return meta.codec;
};

module.exports = {
  getResolution,
  getCodec,
  getMediaMetadata,
  parseAudioFromFileName
};
