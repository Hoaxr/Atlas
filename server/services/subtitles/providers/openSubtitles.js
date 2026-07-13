const axios = require('axios');

const mapOpenSubtitlesItem = (item) => ({
  id: item.attributes.files[0]?.file_id,
  name: item.attributes.feature_details?.movie_name || '',
  language: item.attributes.language,
  release: item.attributes.release,
  downloads: item.attributes.download_count,
  rating: item.attributes.ratings || 0,
  fps: item.attributes.fps,
  format: item.attributes.sub_format,
  uploadDate: item.attributes.upload_date ? new Date(item.attributes.upload_date).toLocaleDateString() : null,
  aiTranslated: item.attributes.ai_translated,
  machineTranslated: item.attributes.machine_translated,
  fromTrusted: item.attributes.from_trusted,
  hearingImpaired: item.attributes.hearing_impaired,
  uploader: item.attributes.uploader?.name || item.attributes.user?.name || null,
  url: item.attributes.url ? `https://www.opensubtitles.com${item.attributes.url}` : null,
  fileId: item.attributes.files[0]?.file_id
});

const downloadForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    params: { tmdb_id: movie.tmdb_id, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return null;
  const fileId = data[0].attributes.files[0].file_id;
  const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
    { file_id: fileId },
    { headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' } }
  );
  const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text' });
  return srtRes.data;
};

const downloadForEpisode = async (apiKey, show, episode, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    params: { tmdb_id: show.tmdb_id, season_number: episode.season_number, episode_number: episode.episode_number, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return null;
  const fileId = data[0].attributes.files[0].file_id;
  const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
    { file_id: fileId },
    { headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' } }
  );
  const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text' });
  return srtRes.data;
};

const searchForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    params: { tmdb_id: movie.tmdb_id, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return [];
  return data.map(mapOpenSubtitlesItem);
};

const searchForEpisode = async (apiKey, show, episode, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    params: { tmdb_id: show.tmdb_id, season_number: episode.season_number, episode_number: episode.episode_number, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return [];
  return data.map(item => {
    const mapped = mapOpenSubtitlesItem(item);
    mapped.name = item.attributes.feature_details?.movie_name || show.title;
    return mapped;
  });
};

module.exports = {
  downloadForMovie,
  downloadForEpisode,
  searchForMovie,
  searchForEpisode
};
