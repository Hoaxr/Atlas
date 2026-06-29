const axios = require('axios');
const db = require('../config/database');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const cleanTitle = (title) =>
  title.replace(/['']/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const parseQuality = (title) => {
  const t = title.toLowerCase();
  const camTerms = /\b(cam|ts|telesync|hdts|hdcam|hc|telecine|tc|workprint|wp|screener|scr)\b/;
  if (camTerms.test(t)) return 'CAM';
  if (t.includes('2160p') || t.includes('4k')) return '2160p';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p')) return '720p';
  if (t.includes('480p') || t.includes('dvdrip') || t.includes('xvid') || t.includes('hdtv')) return 'SD';
  return 'Unknown';
};

// ─── Prowlarr JSON Search ─────────────────────────────────────────────

const searchProwlarr = async (query, type = 'search') => {
  const prowlarrUrl = getSetting('prowlarrUrl');
  const prowlarrApiKey = getSetting('prowlarrApiKey');

  if (!prowlarrUrl || !prowlarrApiKey) {
    console.warn('[IndexerService] Prowlarr URL or API Key is missing.');
    return [];
  }

  try {
    const baseUrl = prowlarrUrl.replace(/\/$/, '');
    const params = new URLSearchParams({
      query,
      type
    });

    const url = `${baseUrl}/api/v1/search?${params}`;
    const res = await axios.get(url, {
      timeout: 30000,
      headers: { 
        'X-Api-Key': prowlarrApiKey,
        'User-Agent': 'Atlas/1.0' 
      },
    });

    if (!Array.isArray(res.data)) return [];

    return res.data.map(item => {
      let link = item.magnetUrl;
      if (!link && item.downloadUrl) {
        link = item.downloadUrl;
        if (link.includes('?')) {
          link += `&apikey=${prowlarrApiKey}`;
        } else {
          link += `?apikey=${prowlarrApiKey}`;
        }
      }
      if (!link) link = item.infoUrl;

      return {
        title: item.title,
        size: item.size || 0,
        seeders: item.seeders || 0,
        leechers: item.leechers || 0,
        link,
        indexer: item.indexer,
      };
    });
  } catch (err) {
    console.error(`[IndexerService] Prowlarr search failed:`, err.message);
    return [];
  }
};

// ─── Filter & Sort ────────────────────────────────────────────────────────────

const filterAndSortResults = (results, profile, type, currentQuality = null, isManualSearch = false, expectedTitle = null) => {
  let releaseProfiles = [];
  if (!isManualSearch) {
    try {
      releaseProfiles = db.prepare(`
        SELECT rp.*, i.name as indexer_name 
        FROM release_profiles rp 
        LEFT JOIN indexers i ON rp.indexer_id = i.id 
        WHERE rp.enabled = 1
      `).all().map(p => ({
        ...p,
        must_contain: JSON.parse(p.must_contain || '[]').map(t => t.toLowerCase()),
        must_not_contain: JSON.parse(p.must_not_contain || '[]').map(t => t.toLowerCase()),
      }));
    } catch { /* ignore */ }
  }

  const camTerms = /\b(cam|ts|telesync|hdts|hdcam|hc|telecine|tc|workprint|wp|screener|scr)\b/;
  let camFiltered = 0;
  let filtered = results.filter(r => {
    if (expectedTitle) {
      const normalizedExpected = expectedTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedResult = r.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      const expectedWords = expectedTitle.toLowerCase().replace(/['"]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
      const resultWords = r.title.toLowerCase().replace(/['"]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
      
      const hasAllWords = expectedWords.every(w => resultWords.includes(w));
      const isLooseMatch = normalizedResult.includes(normalizedExpected);
      
      if (normalizedExpected.length < 5) {
        if (!hasAllWords) return false;
      } else {
        if (!hasAllWords && !isLooseMatch) return false;
      }
    }

    const titleLower = r.title.toLowerCase();
    if (camTerms.test(titleLower)) { camFiltered++; return false; }

    if (!isManualSearch) {
      for (const rp of releaseProfiles) {
        if (rp.apply_to && rp.apply_to !== 'all' && rp.apply_to !== type) continue;
        if (rp.indexer_name && rp.indexer_name !== r.indexer) continue;
        if (rp.must_not_contain.length > 0 && rp.must_not_contain.some(t => titleLower.includes(t))) return false;
        if (rp.must_contain.length > 0 && !rp.must_contain.every(t => titleLower.includes(t))) return false;
      }
    }
    return true;
  });

  if (!profile || !profile.qualities) {
    filtered.sort((a, b) => b.seeders - a.seeders);
    filtered._camFiltered = camFiltered;
    return filtered;
  }

  let qualities = ['1080p'];
  try { qualities = JSON.parse(profile.qualities); } catch { /* ignore */ }

  if (currentQuality) {
    const currentIdx = qualities.indexOf(currentQuality);
    if (currentIdx !== -1) {
      filtered = filtered.filter(r => {
        const idx = qualities.indexOf(parseQuality(r.title));
        return idx !== -1 && idx < currentIdx;
      });
    }
  }

  filtered.sort((a, b) => {
    const idxA = qualities.indexOf(parseQuality(a.title));
    const idxB = qualities.indexOf(parseQuality(b.title));
    if (idxA === -1 && idxB === -1) return b.seeders - a.seeders;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    if (idxA !== idxB) return idxB - idxA;
    return b.seeders - a.seeders;
  });

  filtered._camFiltered = camFiltered;
  return filtered;
};

// ─── Public API ───────────────────────────────────────────────────────────────

const searchMovie = async (title, year, profile = null, currentQuality = null, isManualSearch = false) => {
  const cleanedTitle = cleanTitle(title);
  const searchTerm = year ? `${cleanedTitle} ${year}` : cleanedTitle;
  
  const results = await searchProwlarr(searchTerm, 'movie');
  return filterAndSortResults(results, profile, 'movies', currentQuality, isManualSearch, title);
};

const searchEpisode = async (showTitle, season, episode, profile = null, currentQuality = null, isManualSearch = false) => {
  const s = season.toString().padStart(2, '0');
  const e = episode.toString().padStart(2, '0');
  const searchTerm = `${cleanTitle(showTitle)} S${s}E${e}`;

  const results = await searchProwlarr(searchTerm, 'tvsearch');
  return filterAndSortResults(results, profile, 'shows', currentQuality, isManualSearch, showTitle);
};

const searchShowPack = async (showTitle, profile = null, currentQuality = null, isManualSearch = false) => {
  const searchTerm = cleanTitle(showTitle);
  const results = await searchProwlarr(searchTerm, 'tvsearch');
  return filterAndSortResults(results, profile, 'shows', currentQuality, isManualSearch, showTitle);
};

const searchGeneric = async (query) => {
  const searchTerm = cleanTitle(query || '');
  const results = await searchProwlarr(searchTerm, 'search');
  return results.sort((a, b) => b.seeders - a.seeders);
};

module.exports = {
  searchMovie,
  searchEpisode,
  searchShowPack,
  searchGeneric,
  parseQuality,
};
