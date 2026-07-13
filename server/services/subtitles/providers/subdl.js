const axios = require('axios');

const LANG_MAP = { en: 'EN', nl: 'NL', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT' };

const downloadForMovie = async (apiKey, movie, langCode) => {
  const params = {
    api_key: apiKey,
    tmdb_id: movie.tmdb_id,
    type: 'movie',
    languages: LANG_MAP[langCode] || 'EN',
    unpack: '1'
  };
  const searchRes = await axios.get('https://api.subdl.com/api/v1/subtitles', { params });
  if (!searchRes.data.status || !searchRes.data.subtitles || searchRes.data.subtitles.length === 0) return null;
  const match = searchRes.data.subtitles.find(s => (s.language || '').toLowerCase() === langCode);
  if (!match) return null;

  const url = match.unpack_files?.[0]?.url || match.url;
  if (!url) return null;
  const downloadUrl = `https://dl.subdl.com${url.startsWith('/') ? url : '/' + url}`;
  const srtRes = await axios.get(downloadUrl, { responseType: 'text' });
  return srtRes.data;
};

const downloadForEpisode = async (apiKey, show, episode, langCode) => {
  const params = {
    api_key: apiKey,
    tmdb_id: show.tmdb_id,
    type: 'tv',
    languages: LANG_MAP[langCode] || 'EN',
    unpack: '1',
    season_number: episode.season_number,
    episode_number: episode.episode_number
  };
  const searchRes = await axios.get('https://api.subdl.com/api/v1/subtitles', { params });
  if (!searchRes.data.status || !searchRes.data.subtitles || searchRes.data.subtitles.length === 0) return null;
  const match = searchRes.data.subtitles.find(s => (s.language || '').toLowerCase() === langCode);
  if (!match) return null;

  const url = match.unpack_files?.[0]?.url || match.url;
  if (!url) return null;
  const downloadUrl = `https://dl.subdl.com${url.startsWith('/') ? url : '/' + url}`;
  const srtRes = await axios.get(downloadUrl, { responseType: 'text' });
  return srtRes.data;
};

const searchForMovie = async (apiKey, movie, langCode) => {
  const res = await axios.get('https://api.subdl.com/api/v1/subtitles', {
    params: { api_key: apiKey, tmdb_id: movie.tmdb_id, type: 'movie', languages: LANG_MAP[langCode] || 'EN', unpack: '1' }
  });
  if (res.data.status && res.data.subtitles?.length > 0) {
    const matching = res.data.subtitles.filter(s => (s.language || '').toLowerCase() === langCode);
    return matching.map(item => ({
      id: item.sd_id || item.id,
      name: item.release_name || item.name || 'Subtitle',
      language: item.language,
      release: item.release_name || item.name || '',
      downloads: item.downloads || 0,
      rating: item.rating || 0,
      fps: item.fps || null,
      format: item.format || 'srt',
      uploadDate: item.created_at ? new Date(item.created_at).toLocaleDateString() : null,
      uploader: item.uploader || null,
      hearingImpaired: item.hearing_impaired || false,
      url: item.url ? `https://dl.subdl.com${item.url.startsWith('/') ? item.url : '/' + item.url}` : null,
      subdlId: item.sd_id || item.id
    }));
  }
  return [];
};

const searchForEpisode = async (apiKey, show, episode, langCode) => {
  const res = await axios.get('https://api.subdl.com/api/v1/subtitles', {
    params: { api_key: apiKey, tmdb_id: show.tmdb_id, type: 'tv', season_number: episode.season_number, episode_number: episode.episode_number, languages: LANG_MAP[langCode] || 'EN', unpack: '1' }
  });
  if (res.data.status && res.data.subtitles?.length > 0) {
    const matching = res.data.subtitles.filter(s => (s.language || '').toLowerCase() === langCode);
    const items = [];
    for (const sub of matching) {
      if (sub.full_season && sub.unpack_files?.length > 0) {
        const epFile = sub.unpack_files.find(f => f.episode === episode.episode_number);
        if (epFile) {
          items.push({
            id: epFile.file_n_id || sub.sd_id,
            name: epFile.name || sub.filename || 'Subtitle',
            language: sub.language,
            release: epFile.release_name || sub.release_name || sub.filename || '',
            downloads: sub.downloads || 0,
            rating: sub.rating || 0,
            fps: epFile.fps || sub.fps || null,
            format: epFile.format || sub.format || 'srt',
            uploadDate: sub.created_at ? new Date(sub.created_at).toLocaleDateString() : null,
            uploader: sub.author || sub.uploader || null,
            hearingImpaired: epFile.hi || sub.hi || false,
            url: epFile?.url ? `https://dl.subdl.com${epFile.url.startsWith('/') ? epFile.url : '/' + epFile.url}` : sub.url ? `https://dl.subdl.com${sub.url.startsWith('/') ? sub.url : '/' + sub.url}` : null,
            subdlId: sub.sd_id || sub.id
          });
        }
      } else {
        items.push({
          id: sub.sd_id || sub.id,
          name: sub.filename || 'Subtitle',
          language: sub.language,
          release: sub.release_name || sub.filename || '',
          downloads: sub.downloads || 0,
          rating: sub.rating || 0,
          fps: sub.fps || null,
          format: sub.format || 'srt',
          uploadDate: sub.created_at ? new Date(sub.created_at).toLocaleDateString() : null,
          uploader: sub.author || sub.uploader || null,
          hearingImpaired: sub.hi || false,
          url: sub.url ? `https://dl.subdl.com${sub.url.startsWith('/') ? sub.url : '/' + sub.url}` : null,
          subdlId: sub.sd_id || sub.id
        });
      }
    }
    return items;
  }
  return [];
};

module.exports = {
  downloadForMovie,
  downloadForEpisode,
  searchForMovie,
  searchForEpisode
};
