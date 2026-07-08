const axios = require('axios');
const db = require('../config/database');
const { getSetting } = require('../utils/settings');
const { parseResolution: parseQuality } = require('../utils/mediaParsing');

// ─── Circuit breaker for Prowlarr ─────────────────────────────────────

const CIRCUIT_BREAKER = {
  failures: 0,
  maxFailures: 3,
  cooldownMs: 5 * 60 * 1000, // 5 minutes
  openUntil: null,
};

const isCircuitOpen = () => {
  if (CIRCUIT_BREAKER.openUntil && Date.now() < CIRCUIT_BREAKER.openUntil) {
    const remaining = Math.ceil((CIRCUIT_BREAKER.openUntil - Date.now()) / 1000);
    console.warn(`[IndexerService] Circuit breaker open — skipping search (${remaining}s remaining in cooldown)`);
    return true;
  }
  return false;
};

const recordFailure = () => {
  CIRCUIT_BREAKER.failures++;
  if (CIRCUIT_BREAKER.failures >= CIRCUIT_BREAKER.maxFailures) {
    CIRCUIT_BREAKER.openUntil = Date.now() + CIRCUIT_BREAKER.cooldownMs;
    console.error(`[IndexerService] Circuit breaker OPEN — ${CIRCUIT_BREAKER.maxFailures} consecutive failures. Pausing searches for ${CIRCUIT_BREAKER.cooldownMs / 1000}s.`);
  }
};

const recordSuccess = () => {
  if (CIRCUIT_BREAKER.failures > 0 || CIRCUIT_BREAKER.openUntil) {
    console.log('[IndexerService] Circuit breaker reset — Prowlarr is reachable again.');
  }
  CIRCUIT_BREAKER.failures = 0;
  CIRCUIT_BREAKER.openUntil = null;
};

const getCircuitStatus = () => ({
  failures: CIRCUIT_BREAKER.failures,
  open: isCircuitOpen(),
  cooldownRemaining: CIRCUIT_BREAKER.openUntil ? Math.max(0, Math.ceil((CIRCUIT_BREAKER.openUntil - Date.now()) / 1000)) : 0,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cleanTitle = (title) =>
  title.replace(/['']/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Extract a 4-digit release year (1900-2099) from a release title
const extractReleaseYear = (title) => {
  const match = title.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
};

// ─── Prowlarr JSON Search ─────────────────────────────────────────────

const searchProwlarr = async (query, type = 'search') => {
  if (isCircuitOpen()) {
    throw new Error('Prowlarr is temporarily unavailable (circuit breaker open).');
  }

  const prowlarrUrl = getSetting('prowlarrUrl');
  const prowlarrApiKey = getSetting('prowlarrApiKey');

  if (!prowlarrUrl || !prowlarrApiKey) {
    console.warn('[IndexerService] Prowlarr URL or API Key is missing.');
    throw new Error('No indexers are configured. Please configure Prowlarr in Settings.');
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

    recordSuccess();

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
    recordFailure();
    console.error(`[IndexerService] Prowlarr search failed:`, err.message);
    throw new Error(`Prowlarr search failed: ${err.message}`, { cause: err });
  }
};

// ─── Filter & Sort ────────────────────────────────────────────────────────────

const filterAndSortResults = (results, profile, type, currentQuality = null, isManualSearch = false, expectedTitle = null, expectedYear = null) => {
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
      const expectedWords = expectedTitle.toLowerCase().replace(/['"]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
      const cleanTitle = r.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      const resultWords = cleanTitle.toLowerCase().replace(/['"]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
      
      let matchIdx = -1;
      for (let i = 0; i <= resultWords.length - expectedWords.length; i++) {
        let isMatch = true;
        for (let j = 0; j < expectedWords.length; j++) {
          if (resultWords[i + j] !== expectedWords[j]) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx === -1) return false;

      // For single-word titles, require match at position 0, or position 1 if
      // preceded by a year or common article (the/a/an)
      if (expectedWords.length === 1) {
        const firstWord = resultWords[0];
        const firstIsYear = /^\d{4}$/.test(firstWord);
        const firstIsArticle = ['the', 'a', 'an'].includes(firstWord);
        const maxPos = (firstIsYear || firstIsArticle) ? 1 : 0;
        if (matchIdx > maxPos) return false;
      } else {
        // For multi-word titles, allow within first 3 positions
        if (matchIdx > 3) return false;
      }

      // Validate year if expected — allow ±2 years for edge cases
      if (expectedYear) {
        const releaseYear = extractReleaseYear(r.title);
        if (releaseYear && Math.abs(releaseYear - expectedYear) > 2) return false;
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
  
  let allResults;
  
  if (year) {
    // Try the given year first
    let rawResults = await searchProwlarr(`${cleanedTitle} ${year}`, 'movie');
    let filtered = filterAndSortResults(rawResults, profile, 'movies', currentQuality, isManualSearch, title, year);
    allResults = filtered;

    // If no good results, try the previous year (release may have been grouped differently)
    if (allResults.length === 0) {
      console.log(`[IndexerService] No matches for "${cleanedTitle} ${year}", trying year ${year - 1}`);
      rawResults = await searchProwlarr(`${cleanedTitle} ${year - 1}`, 'movie');
      filtered = filterAndSortResults(rawResults, profile, 'movies', currentQuality, isManualSearch, title, year - 1);
      allResults = filtered;
    }

    // If still no good results, try without any year but still validate the year
    if (allResults.length === 0) {
      console.log(`[IndexerService] No matches with year, trying without: "${cleanedTitle}"`);
      rawResults = await searchProwlarr(cleanedTitle, 'movie');
      // Allow years within ±2 of the expected year for the no-year fallback
      filtered = filterAndSortResults(rawResults, profile, 'movies', currentQuality, isManualSearch, title, year);
      // If year validation is too strict, fall back to no year check at all
      if (filtered.length === 0) {
        filtered = filterAndSortResults(rawResults, profile, 'movies', currentQuality, isManualSearch, title);
      }
      allResults = filtered;
    }
  } else {
    const rawResults = await searchProwlarr(cleanedTitle, 'movie');
    allResults = filterAndSortResults(rawResults, profile, 'movies', currentQuality, isManualSearch, title);
  }
  
  return allResults;
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

const searchSeasonPack = async (showTitle, seasonNumber, profile = null, currentQuality = null, isManualSearch = false) => {
  const s = seasonNumber.toString().padStart(2, '0');
  const searchTerm = `${cleanTitle(showTitle)} S${s}`;
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
  searchSeasonPack,
  searchGeneric,
  parseQuality,
  getCircuitStatus,
};
