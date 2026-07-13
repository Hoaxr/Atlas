const fs = require('fs/promises');
const path = require('path');
const { isVideoFile, SUBTITLE_EXTENSIONS } = require('../../utils/fileUtils');

const RECYCLE_DIRS = new Set([
  '$Recycle.Bin',     // Windows
  '.Trash',           // Linux root trash
  '.Trashes',         // macOS
  '.recycle',         // Common NAS
  '#recycle',         // Synology
  '@Recycle',         // Some NAS
  '@Recycle.Bin',     // Some NAS
  '.Trash-1000',      // Linux user trash
]);

const shouldSkipDir = (dirName) => {
  if (RECYCLE_DIRS.has(dirName)) return true;
  if (/^\.Trash-\d+$/.test(dirName)) return true;
  return false;
};

const SUBTITLE_EXTS = [...SUBTITLE_EXTENSIONS];

const scanSubtitleLangs = async (filePath) => {
  const dir = path.dirname(filePath);
  try {
    const items = await fs.readdir(dir);
    return [...new Set(
      items
        .filter(item => SUBTITLE_EXTS.includes(path.extname(item).toLowerCase()))
        .map(item => {
          const name = path.basename(item, path.extname(item));
          const match = name.match(/[._-]([a-z]{2,3})(?:\.[a-z0-9]+)?$/i);
          return match ? match[1].toLowerCase() : null;
        })
        .filter(Boolean)
    )];
  } catch {
    return [];
  }
};

const parseMediaTitle = (filename, folderPath) => {
  const cleanName = filename.replace(/\.(mp4|mkv|avi|mov|wmv)$/i, '');
  
  const tvShowMatch = cleanName.match(/(S\d{1,2}E\d{1,2}(?:[-]E?\d{1,2})*|Season \d+)/i);
  if (tvShowMatch) {
    let title = cleanName.substring(0, tvShowMatch.index).replace(/[._()[\]-]/g, ' ').trim();
    let seasonNumber = 1;
    let episodeNumber = 1;
    let episodeEnd = null;
    
    const sMatch = tvShowMatch[0].match(/S(\d{1,2})/i);
    if (sMatch) seasonNumber = parseInt(sMatch[1], 10);

    const epBlock = tvShowMatch[0].replace(/^S\d{1,2}/i, '');
    const epNumbers = [...epBlock.matchAll(/(\d{1,3})/g)].map(m => parseInt(m[1], 10));
    if (epNumbers.length > 0) {
      episodeNumber = epNumbers[0];
      if (epNumbers.length > 1) {
        episodeEnd = epNumbers[epNumbers.length - 1];
      }
    }
    
    if (!sMatch && epNumbers.length === 0) {
      const seasonWordMatch = tvShowMatch[0].match(/Season\s+(\d+)/i);
      if (seasonWordMatch) seasonNumber = parseInt(seasonWordMatch[1], 10);
      const epWordMatch = cleanName.match(/Episode\s+(\d+)/i);
      if (epWordMatch) episodeNumber = parseInt(epWordMatch[1], 10);
    }

    if (!title && folderPath) {
      const parts = folderPath.split(path.sep);
      const parent = parts[parts.length - 1];
      if (parent.match(/Season\s*\d+/i)) {
        title = parts[parts.length - 2];
      } else {
        title = parent;
      }
    }
    
    title = title.replace(/\s*(19\d{2}|20\d{2})\s*$/, '').trim();
    return { title, seasonNumber, episodeNumber, episodeEnd, isShow: true };
  }

  const yearMatch = cleanName.match(/(19\d{2}|20\d{2})/);
  const year = yearMatch ? parseInt(yearMatch[0]) : null;
  
  let titlePart = cleanName;
  if (yearMatch) {
    titlePart = cleanName.substring(0, yearMatch.index);
  }

  let title = titlePart.replace(/[._()[\]-]/g, ' ').trim();
  title = title.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|web-dl|x264|x265)\b.*/i, '').trim();
  
  return { title, year, isShow: false, episodeEnd: null };
};

const gatherFilesFromPaths = async (paths, scanProgress) => {
  const allFiles = [];

  async function getFiles(dir) {
    try {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        const res = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          if (shouldSkipDir(dirent.name)) {
            console.log(`[Scanner] Skipping recycle/trash directory: ${res}`);
            continue;
          }
          await getFiles(res);
        } else if (dirent.isFile() && isVideoFile(dirent.name)) {
          allFiles.push({
            name: dirent.name,
            path: res,
            parentPath: dir,
            isFile: () => true
          });
          if (allFiles.length % 50 === 0) {
            scanProgress.currentFile = `Gathering files... (Found ${allFiles.length})`;
          }
        }
      }
    } catch (e) {
      console.error(`Error reading directory ${dir}:`, e.message);
    }
  }

  for (const libPath of paths) {
    try {
      const stat = await fs.stat(libPath.path);
      if (!stat.isDirectory()) {
        scanProgress.emptyPaths.push({ path: libPath.path, error: 'Not a directory' });
        continue;
      }
      
      const initialCount = allFiles.length;
      await getFiles(libPath.path);
      
      if (allFiles.length === initialCount) {
        scanProgress.emptyPaths.push({ path: libPath.path, error: 'No video files found — mount may be empty or disconnected' });
      }
    } catch (err) {
      console.error(`Error gathering files from ${libPath.path}:`, err.message);
      scanProgress.unreachablePaths.push({ path: libPath.path, error: err.message });
    }
  }
  return allFiles;
};

module.exports = {
  shouldSkipDir,
  scanSubtitleLangs,
  parseMediaTitle,
  SUBTITLE_EXTS,
  gatherFilesFromPaths
};
