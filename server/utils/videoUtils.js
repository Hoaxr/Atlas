const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

const getMediaMetadata = async (filePath) => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,width,height,channels,channel_layout',
      '-of', 'json',
      filePath
    ]);
    const info = JSON.parse(stdout) || {};
    const streams = info.streams || [];
    
    const videoStream = streams.find(s => s.codec_type === 'video') || {};
    const audioStream = streams.find(s => s.codec_type === 'audio') || {};
    
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

    return { resolution, codec, audio };
  } catch (err) {
    return { resolution: null, codec: null, audio: null };
  }
};

const parseAudioFromFileName = (fileName) => {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();
  
  if (lower.includes('atmos')) return 'Atmos';
  if (lower.includes('truehd')) return 'TrueHD';
  if (lower.includes('dts-hd') || lower.includes('dtshd')) return 'DTS-HD';
  if (lower.includes('dts')) return 'DTS';
  
  if (lower.includes('ddp7.1') || lower.includes('dd+7.1') || lower.includes('e-ac3 7.1') || lower.includes('eac3 7.1')) return 'DDP 7.1';
  if (lower.includes('ddp5.1') || lower.includes('dd+5.1') || lower.includes('e-ac3 5.1') || lower.includes('eac3 5.1') || lower.includes('ddp') || lower.includes('dd+')) return 'DDP 5.1';
  if (lower.includes('dd5.1') || lower.includes('ac3 5.1') || lower.includes('ac-3 5.1')) return 'DD 5.1';
  if (lower.includes('dd2.0') || lower.includes('ac3 2.0') || lower.includes('ac-3 2.0')) return 'DD Stereo';
  if (lower.includes('ac3') || lower.includes('ac-3')) return 'AC3';
  
  if (lower.includes('aac 5.1') || lower.includes('aac5.1')) return 'AAC 5.1';
  if (lower.includes('aac 2.0') || lower.includes('aac2.0') || lower.includes('aac')) return 'AAC Stereo';
  
  if (lower.includes('7.1')) return '7.1';
  if (lower.includes('5.1')) return '5.1';
  if (lower.includes('2.0') || lower.includes('stereo')) return 'Stereo';
  
  if (lower.includes('flac')) return 'FLAC';
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('mp3')) return 'MP3';
  
  return null;
};

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
