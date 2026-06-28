const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../config/database');

const getIndexers = () => {
  return db.prepare('SELECT * FROM indexers').all();
};

const fetchHtml = async (url) => {
  let fsUrl = null;
  try {
    const settingsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('flareSolverrUrl');
    fsUrl = settingsRow ? settingsRow.value : null;
  } catch (e) {
    // Ignore settings table error if it doesn't exist yet
  }

  if (fsUrl) {
    try {
      const res = await axios.post(`${fsUrl.replace(/\/$/, '')}/v1`, {
        cmd: 'request.get',
        url: url,
        maxTimeout: 15000
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
      
      if (res.data && res.data.solution && res.data.solution.response) {
        return res.data.solution.response;
      }
    } catch (e) {
      console.error('FlareSolverr request failed:', e.message);
    }
  }

  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000
  });
  return res.data;
};

const searchTorznab = async (title, indexer) => {
  try {
    const searchUrl = `${indexer.url}?t=search&q=${encodeURIComponent(title)}${indexer.api_key ? '&apikey=' + indexer.api_key : ''}`;
    const res = await axios.get(searchUrl, { timeout: 15000 });
    const $ = cheerio.load(res.data, { xmlMode: true });
    const results = [];
    
    $('item').each((i, el) => {
      const itemTitle = $(el).find('title').text();
      let link = $(el).find('enclosure').attr('url');
      if (!link) link = $(el).find('link').text();
      
      let size = 0;
      let seeders = 0;
      
      $(el).find('[name="size"]').each((j, attr) => { size = parseInt($(attr).attr('value')) || 0; });
      $(el).find('[name="seeders"]').each((j, attr) => { seeders = parseInt($(attr).attr('value')) || 0; });
      
      if (!size) size = parseInt($(el).find('size').text()) || parseInt($(el).find('enclosure').attr('length')) || 0;
      
      if (link && itemTitle) {
        results.push({
          title: itemTitle,
          size: size,
          seeders: seeders,
          link: link,
          indexer: indexer.name
        });
      }
    });
    return results;
  } catch (err) {
    console.error(`Torznab search failed for ${indexer.name}:`, err.message);
  }
  return [];
};

const searchNyaa = async (title, indexer) => {
  try {
    const baseUrl = indexer.url || 'https://nyaa.si';
    const searchUrl = `${baseUrl}/?page=rss&q=${encodeURIComponent(title)}&c=1_0&f=0`;
    const res = await axios.get(searchUrl, { timeout: 15000 });
    const $ = cheerio.load(res.data, { xmlMode: true });
    const results = [];
    
    $('item').each((i, el) => {
      const itemTitle = $(el).find('title').text();
      const link = $(el).find('link').text(); 
      let seeders = parseInt($(el).find('nyaa\\:seeders').text()) || 0;
      let sizeStr = $(el).find('nyaa\\:size').text() || '';
      let size = 0;
      if (sizeStr.includes('MiB') || sizeStr.includes('MB')) size = parseFloat(sizeStr) * 1024 * 1024;
      else if (sizeStr.includes('GiB') || sizeStr.includes('GB')) size = parseFloat(sizeStr) * 1024 * 1024 * 1024;
      else size = parseInt(sizeStr) || parseInt($(el).find('enclosure').attr('length')) || 0;
      
      if (link && itemTitle) {
        results.push({
          title: itemTitle,
          size: size,
          seeders: seeders,
          link: link,
          indexer: indexer.name || 'Nyaa'
        });
      }
    });
    return results;
  } catch (err) {
    console.error(`Nyaa search failed for ${indexer.name}:`, err.message);
  }
  return [];
};

const searchTorrentGalaxy = async (title, indexer) => {
  try {
    const baseUrl = indexer.url || 'https://torrentgalaxy.mx';
    const html = await fetchHtml(`${baseUrl}/torrents.php?search=${encodeURIComponent(title)}`);
    const $ = cheerio.load(html);
    const results = [];
    
    $('div.tgxtablerow').each((i, el) => {
      const titleText = $(el).find('div.tgxtablecell a.txlight').text();
      const magnet = $(el).find('a[href^="magnet:"]').attr('href');
      const seeders = parseInt($(el).find('font[color="green"]').first().text()) || 0;
      const sizeStr = $(el).find('span.badge').first().text();
      let size = 0;
      if (sizeStr.includes('MB')) size = parseFloat(sizeStr) * 1024 * 1024;
      else if (sizeStr.includes('GB')) size = parseFloat(sizeStr) * 1024 * 1024 * 1024;
      
      if (titleText && magnet) {
        results.push({
          title: titleText,
          size: size,
          seeders: seeders,
          link: magnet,
          indexer: indexer.name || 'TorrentGalaxy'
        });
      }
    });
    return results;
  } catch (err) {
    console.error(`TorrentGalaxy search failed for ${indexer.name}:`, err.message);
  }
  return [];
};

const searchYTS = async (title, indexer) => {
  try {
    const baseUrl = indexer.url || 'https://yts.lu';
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

const searchTPB = async (title, indexer) => {
  try {
    const baseUrl = indexer.url || 'https://apibay.org';
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

const search1337x = async (title, indexer) => {
  try {
    const baseUrl = indexer.url || 'https://1337x.to';
    const html = await fetchHtml(`${baseUrl}/search/${encodeURIComponent(title)}/1/`);
    const $ = cheerio.load(html);
    const results = [];
    
    // Parse search results
    const rows = $('table.table-list tbody tr').toArray().slice(0, 5); // Limit to top 5 to avoid too many requests
    
    for (const row of rows) {
      const titleNode = $(row).find('.coll-1.name a:nth-child(2)');
      const titleText = titleNode.text();
      const href = titleNode.attr('href');
      const seeders = parseInt($(row).find('.coll-2.seeds').text()) || 0;
      
      const sizeStr = $(row).find('.coll-4.size').text().split('B')[0] + 'B';
      let size = 0;
      if (sizeStr.includes('MB')) size = parseFloat(sizeStr) * 1024 * 1024;
      else if (sizeStr.includes('GB')) size = parseFloat(sizeStr) * 1024 * 1024 * 1024;

      if (href) {
        // We must fetch the magnet link from the individual page
        try {
          const html = await fetchHtml(`${baseUrl}${href}`);
          const detail$ = cheerio.load(html);
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

const searchEZTV = async (title, indexer) => {
  try {
    const baseUrl = indexer.url || 'https://eztvx.to';
    // EZTV search format is usually /search/show-name
    const searchUrl = `${baseUrl}/search/${encodeURIComponent(title.replace(/ /g, '-').toLowerCase())}`;
    const html = await fetchHtml(searchUrl);
    const $ = cheerio.load(html);
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

const filterAndSortResults = (results, profile, currentQuality = null) => {
  if (!profile || !profile.qualities) return results.sort((a, b) => b.seeders - a.seeders);
  
  let qualities = ['1080p'];
  try {
    qualities = JSON.parse(profile.qualities);
  } catch(e) {}
  
  let filtered = results.filter(r => qualities.includes(parseQuality(r.title)));
  
  if (currentQuality) {
    const currentIdx = qualities.indexOf(currentQuality);
    if (currentIdx !== -1) {
      filtered = filtered.filter(r => qualities.indexOf(parseQuality(r.title)) < currentIdx);
    }
  }
  
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

const getSearchFn = (indexer) => {
  if (indexer.type === 'torznab') return searchTorznab;
  const name = indexer.name.toLowerCase();
  if (name.includes('eztv')) return searchEZTV;
  if (name.includes('yts')) return searchYTS;
  if (name.includes('pirate') || name.includes('tpb')) return searchTPB;
  if (name.includes('1337')) return search1337x;
  if (name.includes('nyaa')) return searchNyaa;
  if (name.includes('galaxy') || name.includes('tgx')) return searchTorrentGalaxy;
  return searchTPB;
};

const searchMovie = async (title, year, profile = null, currentQuality = null) => {
  const indexers = getIndexers();
  const searchTerm = `${cleanTitle(title)} ${year}`;

  const results = await Promise.allSettled(
    indexers.map(indexer =>
      getSearchFn(indexer)(searchTerm, indexer)
    )
  );

  const allResults = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  return filterAndSortResults(allResults, profile, currentQuality);
};

const searchEpisode = async (showTitle, season, episode, profile = null, currentQuality = null) => {
  const indexers = getIndexers();
  
  const s = season.toString().padStart(2, '0');
  const e = episode.toString().padStart(2, '0');
  const searchTerm = `${cleanTitle(showTitle)} S${s}E${e}`;

  const results = await Promise.allSettled(
    indexers.map(indexer =>
      getSearchFn(indexer)(searchTerm, indexer)
    )
  );

  const allResults = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  return filterAndSortResults(allResults, profile, currentQuality);
};

const searchShowPack = async (showTitle, profile = null, currentQuality = null) => {
  const indexers = getIndexers();
  
  // Searching just the clean title usually works best for season packs on 1337x / TPB
  const searchTerm = cleanTitle(showTitle);

  const results = await Promise.allSettled(
    indexers.map(indexer => {
      const fn = getSearchFn(indexer);
      // TPB and 1337x are better for packs — append "season" for those
      const term = indexer.name.toLowerCase().includes('eztv') ? searchTerm : `${searchTerm} season`;
      return fn(term, indexer);
    })
  );

  const allResults = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  return filterAndSortResults(allResults, profile, currentQuality);
};

module.exports = {
  getIndexers,
  searchMovie,
  searchEpisode,
  searchShowPack,
  parseQuality
};
