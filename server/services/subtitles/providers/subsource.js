const axios = require('axios');
const { CODE_TO_LANG } = require('../../../utils/constants');

const downloadForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
    params: { api_key: apiKey, searchType: 'text', q: movie.title },
    validateStatus: () => true
  });
  if (!searchRes.data?.data || searchRes.data.data.length === 0) return null;
  const movieEntry = searchRes.data.data[0];
  const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
    params: { api_key: apiKey, movieId: movieEntry.movieId, language: CODE_TO_LANG[langCode] || 'english', limit: 30 },
    validateStatus: () => true
  });
  if (!subsRes.data?.data || subsRes.data.data.length === 0) return null;
  const subId = subsRes.data.data[0].subtitleId;
  const dlRes = await axios.get(`https://api.subsource.net/api/v1/subtitles/${subId}/download`, {
    params: { api_key: apiKey },
    responseType: 'text',
    validateStatus: () => true
  });
  if (dlRes.status !== 200) return null;
  return dlRes.data;
};

const downloadForEpisode = async (apiKey, show, episode, langCode) => {
  // Search with season/episode so we get a subtitle for the right episode,
  // then download it directly by its subtitleId.
  const results = await searchForEpisode(apiKey, show, episode, langCode);
  if (!results || results.length === 0) return null;
  const subId = results[0].subId;
  const dlRes = await axios.get(`https://api.subsource.net/api/v1/subtitles/${subId}/download`, {
    params: { api_key: apiKey },
    responseType: 'text',
    validateStatus: () => true
  });
  if (dlRes.status !== 200) return null;
  return dlRes.data;
};

const searchForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
    params: { api_key: apiKey, searchType: 'text', q: movie.title },
    validateStatus: () => true
  });
  if (searchRes.data?.data?.length > 0) {
    const movieEntry = searchRes.data.data[0];
    const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
      params: { api_key: apiKey, movieId: movieEntry.movieId, language: CODE_TO_LANG[langCode] || 'english', limit: 30 },
      validateStatus: () => true
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
    validateStatus: () => true
  });
  if (searchRes.data?.data?.length > 0) {
    const showEntry = searchRes.data.data.find(s => s.type === 'tv') || searchRes.data.data[0];
    const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
      params: { api_key: apiKey, movieId: showEntry.movieId, season: episode.season_number, episode: episode.episode_number, language: CODE_TO_LANG[langCode] || 'english', limit: 30 },
      validateStatus: () => true
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

module.exports = {
  downloadForMovie,
  downloadForEpisode,
  searchForMovie,
  searchForEpisode
};
