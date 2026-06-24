const tmdbService = require('./server/services/tmdbService');

(async () => {
  try {
    const data = await tmdbService.getMovieById(936075);
    console.log(JSON.stringify(data.videos, null, 2));
  } catch (err) {
    console.error(err);
  }
})();
