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

const scoreRelease = (relName, sceneName) => {
  if (!relName || !sceneName) return 0;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const rWords = new Set(norm(relName).split(/\s+/));
  const sWords = new Set(norm(sceneName).split(/\s+/));
  let count = 0;
  for (const w of rWords) {
    if (sWords.has(w)) count++;
  }
  return count;
};

const downloadForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    timeout: 30000,
    params: { tmdb_id: movie.tmdb_id, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return null;

  const valid = data.filter(d => d.attributes?.files?.[0]?.file_id);
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => {
    const scoreA = scoreRelease(a.attributes?.release, movie.scene_name);
    const scoreB = scoreRelease(b.attributes?.release, movie.scene_name);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return (b.attributes?.download_count || 0) - (a.attributes?.download_count || 0);
  });

  const best = sorted[0];
  const fileId = best.attributes.files[0].file_id;
  try {
    const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
      { file_id: fileId },
      { headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' }, timeout: 30000 }
    );
    if (!downloadRes.data?.link) return null;
    const srtRes = await axios.get(downloadRes.data.link, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(srtRes.data);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.warn(`[OpenSubtitles] Download failed: ${msg}`);
    throw new Error(`OpenSubtitles: ${msg}`, { cause: err });
  }
};

const downloadForEpisode = async (apiKey, show, episode, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    timeout: 30000,
    params: { tmdb_id: show.tmdb_id, season_number: episode.season_number, episode_number: episode.episode_number, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return null;

  const targetSeason = Number(episode.season_number);
  const targetEp = Number(episode.episode_number);

  const matching = data.filter(d => {
    const fd = d.attributes?.feature_details;
    if (fd?.season_number && Number(fd.season_number) !== targetSeason) return false;
    if (fd?.episode_number && Number(fd.episode_number) !== targetEp) return false;
    return !!d.attributes?.files?.[0]?.file_id;
  });
  if (matching.length === 0) return null;

  const sorted = [...matching].sort((a, b) => {
    const scoreA = scoreRelease(a.attributes?.release, episode.scene_name);
    const scoreB = scoreRelease(b.attributes?.release, episode.scene_name);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return (b.attributes?.download_count || 0) - (a.attributes?.download_count || 0);
  });

  const match = sorted[0];
  const fileId = match.attributes.files[0].file_id;
  try {
    const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
      { file_id: fileId },
      { headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' }, timeout: 30000 }
    );
    if (!downloadRes.data?.link) return null;
    const srtRes = await axios.get(downloadRes.data.link, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(srtRes.data);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.warn(`[OpenSubtitles] Download failed: ${msg}`);
    throw new Error(`OpenSubtitles: ${msg}`, { cause: err });
  }
};

const searchForMovie = async (apiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    timeout: 30000,
    params: { tmdb_id: movie.tmdb_id, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return [];
  return data.map(mapOpenSubtitlesItem);
};

const searchForEpisode = async (apiKey, show, episode, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    timeout: 30000,
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
