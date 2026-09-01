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
  if (/^(samples|extras|featurettes|trailers)$/i.test(dirName)) return true;
  return false;
};

const shouldSkipFile = (fileName) => {
  if (/^\./.test(fileName)) return true;
  if (/^(sample|trailer|proof|screen)/i.test(fileName)) return true;
  if (/-sample\./i.test(fileName)) return true;
  return false;
};

const { VALID_LANGUAGES } = require('../../utils/languages');

const SUBTITLE_EXTS = [...SUBTITLE_EXTENSIONS];

const scanSubtitleLangs = async (filePath) => {
  const dir = path.dirname(filePath);
  const videoBase = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const normVideo = videoBase.replace(/[^a-z0-9]/g, '');
  try {
    const items = await fs.readdir(dir);
    return [...new Set(
      items
        .filter(item => {
          if (!SUBTITLE_EXTS.includes(path.extname(item).toLowerCase())) return false;
          const itemLower = item.toLowerCase();
          if (itemLower.startsWith(videoBase)) return true;
          const normSub = itemLower.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '');
          if (normVideo && (normSub.startsWith(normVideo) || normVideo.startsWith(normSub))) return true;
          return false;
        })
        .map(item => {
          let name = path.basename(item, path.extname(item));
          name = name.replace(/[._-](?:forced|sdh|hi|cc|\d+)$/i, '');
          const match = name.match(/[._-]([a-z]{2,3})$/i);
          if (match) {
            const code = match[1].toLowerCase();
            const langMap = {
              eng: 'en', english: 'en',
              nld: 'nl', dutch: 'nl', dut: 'nl',
              fra: 'fr', fre: 'fr', french: 'fr',
              deu: 'de', ger: 'de', german: 'de',
              spa: 'es', spanish: 'es',
              ita: 'it', italian: 'it',
              por: 'pt', portuguese: 'pt',
            };
            const mapped = langMap[code] || code;
            if (VALID_LANGUAGES.has(mapped)) return mapped;
          }
          return 'en';
        })
        .filter(Boolean)
    )];
  } catch {
    return [];
  }
};

const extractIds = (text) => {
  let tmdbId = null;
  let imdbId = null;
  if (!text) return { tmdbId, imdbId };

  // Match tmdb: [tmdb-12345], {tmdb-12345}, [tmdbid:12345], tmdbid=12345, tmdb-12345
  const tmdbMatch = text.match(/(?:\[|\{)?\btmdb(?:id)?[-=:\s]+(\d+)(?:\]|\})?/i);
  if (tmdbMatch) {
    tmdbId = parseInt(tmdbMatch[1], 10);
  }

  // Match imdb: [imdb-tt1234567], {imdb:tt1234567}, (tt1234567), tt1234567
  const imdbMatch = text.match(/(?:\[|\{)?\b(?:imdb[-=:\s]+)?(tt\d{7,10})\b(?:\]|\})?/i);
  if (imdbMatch) {
    imdbId = imdbMatch[1].toLowerCase();
  }

  return { tmdbId, imdbId };
};

const parseMediaTitle = (filename, folderPath, showContext = false) => {
  const cleanName = filename.replace(/\.(mp4|mkv|avi|mov|wmv|webm|ts|m2ts|mpg|mpeg)$/i, '');
  const combinedContext = `${folderPath || ''} ${cleanName}`;
  const { tmdbId, imdbId } = extractIds(combinedContext);

  // Strip explicit ID tags from cleanName so they don't pollute the parsed title
  const strippedName = cleanName
    .replace(/(?:\[|\{)?\btmdb(?:id)?[-=:\s]+\d+(?:\]|\})?/gi, '')
    .replace(/(?:\[|\{)?\b(?:imdb[-=:\s]+)?tt\d{7,10}\b(?:\]|\})?/gi, '')
    .trim();

  // Check for S01E01 / S01E01E02 / S01E01-E02 / S01E01-02
  const sxxExxMatch = strippedName.match(/\bS(\d{1,2})[._\s-]*E(\d{1,3})(?:[-_E\s]+(?:S\d{1,2})?E?(\d{1,3}))*\b/i);
  // Check for classic scene format 1x01 / 01x02 / 1x01-02
  const sceneMatch = !sxxExxMatch ? strippedName.match(/\b(\d{1,2})x(\d{1,3})(?:[-_x]+(\d{1,3}))*\b/i) : null;
  // Check for Season folder or Specials / Season 0
  const seasonWordMatch = !sxxExxMatch && !sceneMatch ? strippedName.match(/(Season\s*\d+|Specials|Season\s*0+)/i) : null;

  const isSeasonFolder = Boolean(folderPath && /(?:Season\s*\d+|Specials)/i.test(folderPath));
  let isTvShow = Boolean(sxxExxMatch || sceneMatch || seasonWordMatch || isSeasonFolder);

  // Anime/absolute numbering: only when folder context suggests a show
  let absoluteEpisode = null;
  let absoluteMatch = null;
  let cleaned = null;
  if (!isTvShow && showContext) {
    cleaned = strippedName.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
      .replace(/\b(1080p|720p|480p|2160p|4k|x264|x265|h\.?264|h\.?265|hevc|avc|bluray|bdrip|webdl|web-?dl|webrip|hdtv|dvdrip|flac)\b/gi, ' ');
    let m = cleaned.match(/\bEP(\d{1,4})\b/i) || cleaned.match(/\bE(\d{2,4})\b/i);
    if (!m) {
      const trailing = [...cleaned.matchAll(/(?:^|[\s._-])(\d{2,4})(?=[\s._-]*$)/g)]
        .filter(x => !/^(19|20)\d{2}$/.test(x[1]));
      if (trailing.length > 0) m = trailing[trailing.length - 1];
    }
    if (m) {
      absoluteMatch = m;
      absoluteEpisode = parseInt(m[1], 10);
      isTvShow = true;
    }
  }

  if (isTvShow) {
    let title = '';
    let seasonNumber = null;
    let episodeNumber = null;
    let episodeEnd = null;

    if (absoluteEpisode !== null) {
      title = cleaned.substring(0, absoluteMatch.index).replace(/[._()[\]-]/g, ' ').trim();
      seasonNumber = 1;
      episodeNumber = absoluteEpisode;
    } else if (sxxExxMatch) {
      title = strippedName.substring(0, sxxExxMatch.index).replace(/[._()[\]-]/g, ' ').trim();
      seasonNumber = parseInt(sxxExxMatch[1], 10);
      episodeNumber = parseInt(sxxExxMatch[2], 10);

      // Multi-episode end check
      const epBlock = sxxExxMatch[0].replace(/^S\d{1,2}[._\s-]*E\d{1,3}/i, '');
      const extraNumbers = [...epBlock.matchAll(/(\d{1,3})/g)].map(m => parseInt(m[1], 10));
      if (extraNumbers.length > 0) {
        episodeEnd = extraNumbers[extraNumbers.length - 1];
      }
    } else if (sceneMatch) {
      title = strippedName.substring(0, sceneMatch.index).replace(/[._()[\]-]/g, ' ').trim();
      seasonNumber = parseInt(sceneMatch[1], 10);
      episodeNumber = parseInt(sceneMatch[2], 10);
      if (sceneMatch[3]) {
        episodeEnd = parseInt(sceneMatch[3], 10);
      }
    } else {
      const epWordMatch = strippedName.match(/Episode\s*(\d+)/i) || strippedName.match(/\bE(\d{1,3})\b/i);
      if (epWordMatch) episodeNumber = parseInt(epWordMatch[1], 10);

      const sFolder = (folderPath || '').match(/Season\s*(\d+)/i);
      if (sFolder) seasonNumber = parseInt(sFolder[1], 10);
      else if (/(?:Specials|Season\s*0+)/i.test(folderPath || '')) seasonNumber = 0;
    }

    if (!title && folderPath) {
      const parts = folderPath.split(path.sep);
      const parent = parts[parts.length - 1];
      if (parent.match(/(?:Season\s*\d+|Specials)/i)) {
        title = parts[parts.length - 2] || parent;
      } else {
        title = parent;
      }
    }

    // Clean title of tags
    title = title
      .replace(/(?:\[|\{)?\btmdb(?:id)?[-=:\s]+\d+(?:\]|\})?/gi, '')
      .replace(/(?:\[|\{)?\b(?:imdb[-=:\s]+)?tt\d{7,10}\b(?:\]|\})?/gi, '')
      .replace(/\b(1080p|720p|4k|2160p|bluray|webdl|web-dl|x264|x265|dvdrip|hdtv)\b.*/i, '')
      .replace(/[._()[\]-]/g, ' ')
      .trim();

    let year = null;
    const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    } else if (folderPath) {
      const folderYearMatch = folderPath.match(/\b(19\d{2}|20\d{2})\b/);
      if (folderYearMatch) {
        year = parseInt(folderYearMatch[1], 10);
      }
    }

    title = title.replace(/\s*(19\d{2}|20\d{2})\s*$/, '').trim();
    return { title, year, seasonNumber, episodeNumber, episodeEnd, isShow: true, tmdbId, imdbId };
  }

  // Movie parsing
  const yearMatches = [...strippedName.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  const qualityMatch = strippedName.match(/\b(1080p|720p|480p|2160p|4k|x264|x265|h\.?264|h\.?265|hevc|bluray|webdl|web-?dl|webrip|hdtv|dvdrip)\b/i);
  const qualityPos = qualityMatch ? qualityMatch.index : strippedName.length;
  let yearMatch = [...yearMatches].reverse().find(y => y.index < qualityPos) || null;
  if (!yearMatch && yearMatches.length > 0) yearMatch = yearMatches[0];
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  let titlePart = strippedName;
  if (yearMatch) {
    titlePart = strippedName.substring(0, yearMatch.index);
  }

  let title = titlePart
    .replace(/(?:\[|\{)?\btmdb(?:id)?[-=:\s]+\d+(?:\]|\})?/gi, '')
    .replace(/(?:\[|\{)?\b(?:imdb[-=:\s]+)?tt\d{7,10}\b(?:\]|\})?/gi, '')
    .replace(/[._()[\]-]/g, ' ')
    .trim();
  title = title.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|web-dl|x264|x265|dvdrip|hdtv)\b.*/i, '').trim();
  
  return { title, year, isShow: false, episodeEnd: null, tmdbId, imdbId };
};

const gatherFilesFromPaths = async (paths, scanProgress) => {
  const allFiles = [];

  async function getFiles(dir, libType) {
    try {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        const res = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          if (shouldSkipDir(dirent.name)) {
            console.log(`[Scanner] Skipping recycle/trash/extras directory: ${res}`);
            continue;
          }
          await getFiles(res, libType);
        } else if (dirent.isFile() && isVideoFile(dirent.name)) {
          if (shouldSkipFile(dirent.name)) continue;
          allFiles.push({
            name: dirent.name,
            path: res,
            parentPath: dir,
            tvLibType: libType,
            isFile: () => true
          });
          if (allFiles.length % 50 === 0) {
            scanProgress.currentFile = `Gathering files... (Found ${allFiles.length})`;
            await new Promise(resolve => setImmediate(resolve));
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
      await getFiles(libPath.path, libPath.type);

      if (allFiles.length === initialCount) {
        scanProgress.emptyPaths.push({ path: libPath.path, error: 'No video files found — mount may be empty or disconnected' });
      }
    } catch (err) {
      console.error(`Error gathering files from ${libPath.path}:`, err.message);
      scanProgress.unreachablePaths.push({ path: libPath.path, error: err.message });
    }
  }

  // Tag files whose folder context suggests a show (for anime/absolute numbering)
  const dirs = [...new Set(allFiles.map(f => f.parentPath))];
  for (const dir of dirs) {
    const hasSxxExxSibling = allFiles.some(f =>
      f.parentPath === dir &&
      (/\bS\d{1,2}[._\s-]*E\d{1,3}\b/i.test(f.name) || /\b\d{1,2}x\d{1,3}\b/i.test(f.name))
    );
    if (!hasSxxExxSibling) continue;
    for (const f of allFiles) {
      if (f.parentPath === dir) f.showContext = true;
    }
  }
  for (const f of allFiles) {
    if (!f.showContext && f.tvLibType === 'tv') f.showContext = true;
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
