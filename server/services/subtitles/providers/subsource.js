const axios = require('axios');
const { CODE_TO_LANG } = require('../../../utils/constants');

const findMovieEntry = (searchData, movie) => {
  if (!searchData || searchData.length === 0) return null;
  const movieYear = movie.year || (movie.release_date ? parseInt(movie.release_date.split('-')[0], 10) : null);
  
  // Prefer exact movie type matching release year
  if (movieYear) {
    const yearMatch = searchData.find(s => s.type === 'movie' && s.releaseYear && Math.abs(s.releaseYear - movieYear) <= 1);
    if (yearMatch) return yearMatch;
  }
  return searchData.find(s => s.type === 'movie') || searchData[0];
};

const findShowSeasonEntry = (searchData, show, episode) => {
  if (!searchData || searchData.length === 0) return null;
  const targetSeason = Number(episode.season_number);

  // Match tvseries type and exact season
  if (show.tmdb_id) {
    const tmdbMatch = searchData.find(s => 
      (s.type === 'tvseries' || s.type === 'tv') && 
      Number(s.season) === targetSeason && 
      String(s.tmdbId) === String(show.tmdb_id)
    );
    if (tmdbMatch) return tmdbMatch;
  }

  const seasonMatch = searchData.find(s => 
    (s.type === 'tvseries' || s.type === 'tv') && 
    Number(s.season) === targetSeason
  );
  if (seasonMatch) return seasonMatch;

  // Never fall back to another season (e.g. season 1 or 2 when requesting season 4)
  return null;
};

const filterSubsForEpisode = (subtitles, episode) => {
  if (!Array.isArray(subtitles)) return [];
  const targetEp = Number(episode.episode_number);
  const targetSeason = Number(episode.season_number);
  const seRegex = new RegExp(`\\bs0?${targetSeason}[._\\s-]*e0?${targetEp}\\b`, 'i');
  const epRegex = new RegExp(`\\be0?${targetEp}\\b|\\bepisode[._\\s-]*0?${targetEp}\\b`, 'i');

  const isDifferentEp = (text) => {
    const m = text.match(/\b(?:s\d{1,2})?[._\\s-]*e(\d{1,3})\b/i) || text.match(/\bepisode[._\\s-]*(\d{1,3})\b/i);
    if (m && Number(m[1]) !== targetEp) return true;
    return false;
  };

  return subtitles.filter(item => {
    if (item.episode !== undefined && item.episode !== null && Number(item.episode) === targetEp) return true;

    const releases = Array.isArray(item.releaseInfo) ? item.releaseInfo.join(' ') : String(item.releaseInfo || '');
    const link = item.link || '';
    const combined = `${releases} ${link}`;

    // Reject subtitles that explicitly state a different episode number
    if (isDifferentEp(combined)) return false;

    // Matches target episode
    if (seRegex.test(combined) || epRegex.test(combined)) return true;

    // Full season pack (contains season tag without specific other episode)
    if (/\b(?:s\d{1,2}|season[._\\s-]*\d{1,2})\b/i.test(combined)) return true;

    return false;
  });
};

const downloadForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
    params: { api_key: apiKey, searchType: 'text', q: movie.title },
    validateStatus: () => true,
    timeout: 30000
  });
  if (!searchRes.data?.data || searchRes.data.data.length === 0) return null;
  const movieEntry = findMovieEntry(searchRes.data.data, movie);
  if (!movieEntry) return null;

  const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
    params: { api_key: apiKey, movieId: movieEntry.movieId, language: CODE_TO_LANG[langCode] || 'english', limit: 30 },
    validateStatus: () => true,
    timeout: 30000
  });
  if (!subsRes.data?.data || subsRes.data.data.length === 0) return null;
  const subId = subsRes.data.data[0].subtitleId;
  const dlRes = await axios.get(`https://api.subsource.net/api/v1/subtitles/${subId}/download`, {
    params: { api_key: apiKey },
    responseType: 'arraybuffer',
    validateStatus: () => true,
    timeout: 30000
  });
  if (dlRes.status !== 200) return null;
  return Buffer.from(dlRes.data);
};

const downloadForEpisode = async (apiKey, show, episode, langCode) => {
  const results = await searchForEpisode(apiKey, show, episode, langCode);
  if (!results || results.length === 0) return null;
  const subId = results[0].subId;
  const dlRes = await axios.get(`https://api.subsource.net/api/v1/subtitles/${subId}/download`, {
    params: { api_key: apiKey },
    responseType: 'arraybuffer',
    validateStatus: () => true,
    timeout: 30000
  });
  if (dlRes.status !== 200) return null;
  return Buffer.from(dlRes.data);
};

const searchForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
    params: { api_key: apiKey, searchType: 'text', q: movie.title },
    validateStatus: () => true,
    timeout: 30000
  });
  if (searchRes.data?.data?.length > 0) {
    const movieEntry = findMovieEntry(searchRes.data.data, movie);
    if (!movieEntry) return [];
    const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
      params: { api_key: apiKey, movieId: movieEntry.movieId, language: CODE_TO_LANG[langCode] || 'english', limit: 30 },
      validateStatus: () => true,
      timeout: 30000
    });
    if (subsRes.data?.data?.length > 0) {
      return subsRes.data.data.map(item => ({
        id: item.subtitleId || item.id,
        name: langCode,
        language: langCode,
        release: item.releaseInfo?.[0] || '',
        downloads: item.downloads || 0,
        rating: item.rating?.total || item.rating || 0,
        fps: item.framerate || null,
        format: 'srt',
        uploadDate: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null,
        uploader: item.contributors?.[0]?.displayname || null,
        hearingImpaired: item.hearingImpaired || false,
        url: item.link ? `https://subsource.net${item.link}` : null,
        subId: item.subtitleId
      }));
    }
  }
  return [];
};

const searchForEpisode = async (apiKey, show, episode, langCode) => {
  const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
    params: { api_key: apiKey, searchType: 'text', q: show.title },
    validateStatus: () => true,
    timeout: 30000
  });
  if (searchRes.data?.data?.length > 0) {
    const showEntry = findShowSeasonEntry(searchRes.data.data, show, episode);
    if (!showEntry) return [];

    const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
      params: { api_key: apiKey, movieId: showEntry.movieId, language: CODE_TO_LANG[langCode] || 'english', limit: 30 },
      validateStatus: () => true,
      timeout: 30000
    });
    if (subsRes.data?.data?.length > 0) {
      const matched = filterSubsForEpisode(subsRes.data.data, episode);
      return matched.map(item => ({
        id: item.subtitleId || item.id,
        name: langCode,
        language: langCode,
        release: item.releaseInfo?.[0] || '',
        downloads: item.downloads || 0,
        rating: item.rating?.total || item.rating || 0,
        fps: item.framerate || null,
        format: 'srt',
        uploadDate: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null,
        uploader: item.contributors?.[0]?.displayname || null,
        hearingImpaired: item.hearingImpaired || false,
        url: item.link ? `https://subsource.net${item.link}` : null,
        subId: item.subtitleId
      }));
    }
  }
  return [];
};

module.exports = {
  downloadForMovie,
  downloadForEpisode,
  searchForMovie,
  searchForEpisode
};
