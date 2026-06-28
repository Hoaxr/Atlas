const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const getResolution = async (filePath) => {
  try {
    const { stdout: widthStr } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    const { stdout: heightStr } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    
    const w = parseInt(widthStr.trim(), 10);
    const h = parseInt(heightStr.trim(), 10);
    if (isNaN(w) || isNaN(h)) return null;

    if (w >= 3800 || h >= 2100) return '2160p';
    if (w >= 1900 || h >= 1000) return '1080p';
    if (w >= 1200 || h >= 700) return '720p';
    return 'SD';
  } catch (err) {
    return null;
  }
};

module.exports = {
  getResolution
};
