const fs = require('fs/promises');
const path = require('path');
const db = require('../config/database');
const tmdbService = require('./tmdbService');

const isVideoFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext);
};

const parseMediaTitle = (filename) => {
  const cleanName = filename.replace(/\.(mp4|mkv|avi|mov|wmv)$/i, '');
  
  // Check if it's a TV Show (e.g., S01E01, Season 1, S1E1)
  const tvShowMatch = cleanName.match(/(S\d{1,2}E\d{1,2}|Season \d+)/i);
  if (tvShowMatch) {
    let title = cleanName.substring(0, tvShowMatch.index).replace(/[\.\_\(\)\[\]\-]/g, ' ').trim();
    return { title, isShow: true };
  }

  // Otherwise, treat as Movie
  const yearMatch = cleanName.match(/(19\d{2}|20\d{2})/);
  let year = yearMatch ? parseInt(yearMatch[0]) : null;
  
  let titlePart = cleanName;
  if (yearMatch) {
    titlePart = cleanName.substring(0, yearMatch.index);
  }

  let title = titlePart.replace(/[\.\_\(\)\[\]\-]/g, ' ').trim();
  title = title.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|web-dl|x264|x265)\b.*/i, '').trim();

  return { title, year, isShow: false };
};

const scanLibrary = async () => {
  const paths = db.prepare('SELECT * FROM library_paths').all();
  if (!paths || paths.length === 0) return { status: 'success', message: 'No paths configured' };

  let addedCount = 0;
  let scannedCount = 0;

  for (const libPath of paths) {
    try {
      const stat = await fs.stat(libPath.path);
      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(libPath.path, { recursive: true, withFileTypes: true });
      
      for (const file of files) {
        if (!file.isFile() || !isVideoFile(file.name)) continue;
        scannedCount++;

        const fullPath = path.join(file.parentPath || file.path, file.name);
        
        const { title, year, isShow } = parseMediaTitle(file.name);
        if (!title) continue;

        if (isShow) {
          // TV Show logic
          const folderPath = file.parentPath || file.path;
          const existingShow = db.prepare('SELECT id FROM shows WHERE folder_path = ?').get(folderPath);
          if (existingShow) continue; // Already added this show via this folder

          try {
            const results = await tmdbService.searchShows(title);
            if (results.length > 0) {
              const matchedShow = results[0];
              const existingMonitored = db.prepare('SELECT id FROM shows WHERE tmdb_id = ?').get(matchedShow.id);
              
              if (existingMonitored) {
                db.prepare('UPDATE shows SET folder_path = ?, status = ? WHERE tmdb_id = ?').run(folderPath, 'downloaded', matchedShow.id);
              } else {
                const showYear = matchedShow.first_air_date ? parseInt(matchedShow.first_air_date.split('-')[0]) : null;
                db.prepare(`
                  INSERT INTO shows (tmdb_id, title, year, poster_path, overview, status, folder_path)
                  VALUES (?, ?, ?, ?, ?, 'downloaded', ?)
                `).run(
                  matchedShow.id,
                  matchedShow.name,
                  showYear,
                  matchedShow.poster_path,
                  matchedShow.overview,
                  folderPath
                );
              }
              addedCount++;
            }
          } catch (tmdbErr) {
            console.error(`TMDB error for show ${title}:`, tmdbErr.message);
          }

        } else {
          // Movie logic
          const existingMovie = db.prepare('SELECT id FROM movies WHERE file_path = ?').get(fullPath);
          if (existingMovie) continue;

          try {
            const results = await tmdbService.searchMovies(title);
            let matchedMovie = null;
            if (results.length > 0) {
              if (year) {
                matchedMovie = results.find(r => r.release_date && r.release_date.startsWith(year.toString()));
              }
              if (!matchedMovie) matchedMovie = results[0];
            }

            if (matchedMovie) {
              const movieYear = matchedMovie.release_date ? parseInt(matchedMovie.release_date.split('-')[0]) : year;
              const existingMonitored = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id);
              
              if (existingMonitored) {
                db.prepare('UPDATE movies SET file_path = ?, status = ? WHERE tmdb_id = ?').run(fullPath, 'downloaded', matchedMovie.id);
              } else {
                db.prepare(`
                  INSERT INTO movies (tmdb_id, title, year, poster_path, overview, status, file_path)
                  VALUES (?, ?, ?, ?, ?, 'downloaded', ?)
                `).run(
                  matchedMovie.id,
                  matchedMovie.title,
                  movieYear,
                  matchedMovie.poster_path,
                  matchedMovie.overview,
                  fullPath
                );
              }
              addedCount++;
            }
          } catch (tmdbErr) {
            console.error(`TMDB error for movie ${title}:`, tmdbErr.message);
          }
        }
      }
    } catch (e) {
      console.error(`Error scanning path ${libPath.path}:`, e.message);
    }
  }

  return { status: 'success', message: `Scanned ${scannedCount} files, added ${addedCount} movies.` };
};

module.exports = {
  scanLibrary
};
