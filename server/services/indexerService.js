const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../config/database');

const getIndexers = () => {
  return db.prepare('SELECT * FROM indexers').all();
};

const searchYTS = async (title, url) => {
  try {
    const baseUrl = url || 'https://yts.lu';
    const res = await axios.get(`${baseUrl}/api/v2/list_movies.json?query_term=${encodeURIComponent(title)}`, { timeout: 10000 });
    if (res.data && res.data.data && res.data.data.movies) {
      const results = [];
      for (const movie of res.data.data.movies) {
        for (const torrent of movie.torrents) {
          results.push({
            title: `${movie.title} ${torrent.quality} ${torrent.type}`,
            size: torrent.size_bytes,
            seeders: torrent.seeds,
            link: torrent.url, // YTS provides direct .torrent files, which qBittorrent supports
            indexer: 'YTS'
          });
        }
      }
      return results;
    }
  } catch (err) {
    console.error('YTS search failed:', err.message);
  }
  return [];
};

const searchTPB = async (title, url) => {
  try {
    const baseUrl = url || 'https://apibay.org';
    const res = await axios.get(`${baseUrl}/q.php?q=${encodeURIComponent(title)}`, { timeout: 10000 });
    if (Array.isArray(res.data) && res.data[0].id !== '0') {
      return res.data.map(item => ({
        title: item.name,
        size: parseInt(item.size),
        seeders: parseInt(item.seeders),
        link: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce`,
        indexer: 'ThePirateBay'
      }));
    }
  } catch (err) {
    console.error('TPB search failed:', err.message);
  }
  return [];
};

const search1337x = async (title, url) => {
  try {
    const baseUrl = url || 'https://1337x.to';
    const res = await axios.get(`${baseUrl}/search/${encodeURIComponent(title)}/1/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const results = [];
    
    // Parse search results
    const rows = $('table.table-list tbody tr').toArray().slice(0, 5); // Limit to top 5 to avoid too many requests
    
    for (const row of rows) {
      const titleNode = $(row).find('.coll-1.name a:nth-child(2)');
      const titleText = titleNode.text();
      const href = titleNode.attr('href');
      const seeders = parseInt($(row).find('.coll-2.seeds').text()) || 0;
      
      let sizeStr = $(row).find('.coll-4.size').text().split('B')[0] + 'B';
      let size = 0;
      if (sizeStr.includes('MB')) size = parseFloat(sizeStr) * 1024 * 1024;
      else if (sizeStr.includes('GB')) size = parseFloat(sizeStr) * 1024 * 1024 * 1024;

      if (href) {
        // We must fetch the magnet link from the individual page
        try {
          const detailRes = await axios.get(`${baseUrl}${href}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
          });
          const detail$ = cheerio.load(detailRes.data);
          const magnet = detail$('a[href^="magnet:"]').attr('href');
          
          if (magnet) {
            results.push({
              title: titleText,
              size: size,
              seeders: seeders,
              link: magnet,
              indexer: '1337x'
            });
          }
        } catch (detailErr) {
           console.error('1337x detail fetch failed:', detailErr.message);
        }
      }
    }
    return results;
  } catch (err) {
    console.error('1337x search failed:', err.message);
  }
  return [];
};

const searchEZTV = async (title, url) => {
  try {
    const baseUrl = url || 'https://eztvx.to';
    // EZTV search format is usually /search/show-name
    const searchUrl = `${baseUrl}/search/${encodeURIComponent(title.replace(/ /g, '-').toLowerCase())}`;
    const res = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const results = [];
    
    $('tr.forum_header_border').each((i, el) => {
      if (i >= 5) return false;
      const titleNode = $(el).find('a.epinfo');
      const titleText = titleNode.text();
      const magnet = $(el).find('a.magnet').attr('href');
      const sizeStr = $(el).find('td:nth-child(4)').text();
      const seeders = parseInt($(el).find('td:nth-child(6)').text()) || 0;
      
      let size = 0;
      if (sizeStr.includes('MB')) size = parseFloat(sizeStr) * 1024 * 1024;
      else if (sizeStr.includes('GB')) size = parseFloat(sizeStr) * 1024 * 1024 * 1024;

      if (magnet && titleText) {
        results.push({
          title: titleText,
          size: size,
          seeders: seeders,
          link: magnet,
          indexer: 'EZTV'
        });
      }
    });
    return results;
  } catch (err) {
    console.error('EZTV search failed:', err.message);
  }
  return [];
};

const cleanTitle = (title) => {
  return title.replace(/['’]/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
};

const parseQuality = (title) => {
  const t = title.toLowerCase();
  if (t.includes('2160p') || t.includes('4k')) return '2160p';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p')) return '720p';
  if (t.includes('480p') || t.includes('dvdrip') || t.includes('xvid') || t.includes('hdtv')) return 'SD';
  return 'Unknown';
};

const filterAndSortResults = (results, profile) => {
  if (!profile || !profile.qualities) return results.sort((a, b) => b.seeders - a.seeders);
  
  let qualities = ['1080p'];
  try {
    qualities = JSON.parse(profile.qualities);
  } catch(e) {}
  
  const filtered = results.filter(r => qualities.includes(parseQuality(r.title)));
  
  filtered.sort((a, b) => {
    const qA = parseQuality(a.title);
    const qB = parseQuality(b.title);
    const idxA = qualities.indexOf(qA);
    const idxB = qualities.indexOf(qB);
    
    if (idxA !== idxB) return idxA - idxB;
    return b.seeders - a.seeders;
  });
  
  return filtered;
};

const searchMovie = async (title, year, profile = null) => {
  const indexers = getIndexers();
  let allResults = [];
  const searchTerm = `${cleanTitle(title)} ${year}`;

  for (const indexer of indexers) {
    let results = [];
    const name = indexer.name.toLowerCase();
    
    if (name.includes('eztv')) {
      results = await searchEZTV(searchTerm, indexer.url);
    } else if (name.includes('yts')) {
      results = await searchYTS(searchTerm, indexer.url);
    } else if (name.includes('pirate') || name.includes('tpb')) {
      results = await searchTPB(searchTerm, indexer.url);
    } else if (name.includes('1337')) {
      results = await search1337x(searchTerm, indexer.url);
    } else {
      results = await searchTPB(searchTerm, indexer.url);
    }
    
    allResults = [...allResults, ...results];
  }

  return filterAndSortResults(allResults, profile);
};

const searchEpisode = async (showTitle, season, episode, profile = null) => {
  const indexers = getIndexers();
  let allResults = [];
  
  const s = season.toString().padStart(2, '0');
  const e = episode.toString().padStart(2, '0');
  const searchTerm = `${cleanTitle(showTitle)} S${s}E${e}`;

  for (const indexer of indexers) {
    let results = [];
    const name = indexer.name.toLowerCase();
    
    if (name.includes('eztv')) {
      results = await searchEZTV(searchTerm, indexer.url);
    } else if (name.includes('pirate') || name.includes('tpb')) {
      results = await searchTPB(searchTerm, indexer.url);
    } else if (name.includes('1337')) {
      results = await search1337x(searchTerm, indexer.url);
    } else {
      results = await searchTPB(searchTerm, indexer.url);
    }
    
    allResults = [...allResults, ...results];
  }

  return filterAndSortResults(allResults, profile);
};

const searchShowPack = async (showTitle, profile = null) => {
  const indexers = getIndexers();
  let allResults = [];
  
  // Searching just the clean title usually works best for season packs on 1337x / TPB
  const searchTerm = cleanTitle(showTitle);

  for (const indexer of indexers) {
    let results = [];
    const name = indexer.name.toLowerCase();
    
    // Some indexers like EZTV don't explicitly have "season packs" easily searchable by just "Season", 
    // but they might return packs for the base query. 
    // Usually TPB and 1337x are better for packs.
    if (name.includes('eztv')) {
      results = await searchEZTV(searchTerm, indexer.url);
    } else if (name.includes('pirate') || name.includes('tpb')) {
      results = await searchTPB(`${searchTerm} season`, indexer.url);
    } else if (name.includes('1337')) {
      results = await search1337x(`${searchTerm} season`, indexer.url);
    } else {
      results = await searchTPB(`${searchTerm} season`, indexer.url);
    }
    
    allResults = [...allResults, ...results];
  }

  return filterAndSortResults(allResults, profile);
};

module.exports = {
  getIndexers,
  searchMovie,
  searchEpisode,
  searchShowPack,
  parseQuality
};
