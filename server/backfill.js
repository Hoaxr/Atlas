const db = require('./config/database');
const tmdbService = require('./services/tmdbService');

async function run() {
  console.log('Starting backfill of air_date for existing episodes...');
  
  // Apply schema changes just in case server hasn't restarted
  try { db.exec("ALTER TABLE episodes ADD COLUMN air_date TEXT;"); } catch(e) {}
  
  const shows = db.prepare("SELECT * FROM shows").all();
  let updatedCount = 0;

  const updateEp = db.prepare(`
    UPDATE episodes SET air_date = ? 
    WHERE show_id = ? AND season_number = ? AND episode_number = ?
  `);

  for (const show of shows) {
    try {
      console.log(`Processing show: ${show.title}`);
      const seasons = await tmdbService.getShowSeasons(show.tmdb_id);
      
      for (const season of seasons) {
        if (season.season_number === 0) continue;
        
        const eps = await tmdbService.getSeasonEpisodes(show.tmdb_id, season.season_number);
        for (const ep of eps) {
          if (ep.air_date) {
            const res = updateEp.run(ep.air_date, show.id, ep.season_number, ep.episode_number);
            if (res.changes > 0) {
              updatedCount++;
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed for show ${show.title}:`, err.message);
    }
  }

  console.log(`Backfill complete. Updated ${updatedCount} episodes.`);
}

run().catch(console.error);
