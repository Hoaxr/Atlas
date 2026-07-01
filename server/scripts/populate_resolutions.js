const sqlite3 = require('better-sqlite3');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const db = sqlite3('/home/silence/Development/Atlas/server/data/database.sqlite');

const getResolution = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    const height = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]).toString().trim();
    if (!height) return null;
    const h = parseInt(height, 10);
    if (h >= 2160) return '2160p';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    return '480p';
  } catch (err) {
    return null;
  }
};

const movies = db.prepare('SELECT id, file_path, scene_name FROM movies WHERE file_path IS NOT NULL AND (scene_name IS NULL OR scene_name = "")').all();
console.log(`Found ${movies.length} movies to check.`);

const updateMovie = db.prepare('UPDATE movies SET scene_name = ? WHERE id = ?');

for (const movie of movies) {
  const res = getResolution(movie.file_path);
  if (res) {
    const fakeSceneName = `Unknown ${res}`;
    updateMovie.run(fakeSceneName, movie.id);
    console.log(`Updated Movie ID ${movie.id} with resolution ${res}`);
  }
}

const episodes = db.prepare('SELECT id, file_path, scene_name FROM episodes WHERE file_path IS NOT NULL AND (scene_name IS NULL OR scene_name = "")').all();
console.log(`Found ${episodes.length} episodes to check.`);

const updateEpisode = db.prepare('UPDATE episodes SET scene_name = ? WHERE id = ?');

for (const ep of episodes) {
  const res = getResolution(ep.file_path);
  if (res) {
    const fakeSceneName = `Unknown ${res}`;
    updateEpisode.run(fakeSceneName, ep.id);
    console.log(`Updated Episode ID ${ep.id} with resolution ${res}`);
  }
}

console.log('Done!');
