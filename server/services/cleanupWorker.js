const db = require('../config/database');
const tmdbService = require('./tmdbService');
const concurrency = require('../utils/concurrency');

class CleanupWorker {
  constructor() {
    this.cache = null;
    this.intervalId = null;
  }

  start() {
    if (this.intervalId) return;
    console.log('[CleanupWorker] Starting background worker for cleanup candidates.');
    
    // Run immediately on startup
    this.calculateDeletable();
    
    // Then every 12 hours (12 * 60 * 60 * 1000)
    this.intervalId = setInterval(() => this.calculateDeletable(), 43200000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async calculateDeletable() {
    try {
      console.log('[CleanupWorker] Calculating cleanup candidates...');
      const now = Date.now();
      const DAY = 86400000;

      const movies = db.prepare(`
        SELECT id, tmdb_id, title, year, file_size, added_at, file_path, watched, rating as db_rating
        FROM movies WHERE status = 'downloaded' AND tmdb_id IS NOT NULL AND COALESCE(ignore_cleanup, 0) = 0
        ORDER BY added_at DESC
      `).all();

      // ── Detect franchises: title-based grouping, collection matching & aliases ──
      const cleanTitle = (title) => {
        return (title || '')
          .replace(/\s*\(\d{4}\)\s*/g, '')
          .replace(/^((the|a|an|de|het|een)\s+)/i, '')
          .trim()
          .toLowerCase();
      };

      const getFranchiseRoot = (title) => {
        let base = cleanTitle(title);
        base = base.split(/\s*[:–—-]\s*/)[0];
        base = base
          .replace(/\bpart\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x|\d+)\b/gi, '')
          .replace(/\bvol(?:ume)?\.?\s*(?:ii|iii|iv|v|vi|vii|viii|ix|x|\d+)\b/gi, '')
          .replace(/\bchapter\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x|\d+)\b/gi, '')
          .replace(/\b(?:ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi, '')
          .replace(/\s+\d+\s*$/, '')
          .replace(/\b(reloaded|revolutions|resurrections|returns|forever|begins|rises|awakens|extinction|evolution|apocalypse|requiem|legacy|origins|bloodlines)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        return base;
      };

      const KNOWN_FRANCHISE_ALIASES = [
        ['hackers', 'takedown', 'takeover'],
        ['matrix', 'the matrix'],
        ['fast & furious', 'fast and furious', '2 fast 2 furious', 'fast five'],
        ['taken', 'taken 2', 'taken 3'],
        ['bourne', 'jason bourne']
      ];

      // Query all library movies (downloaded, monitored, missing) so franchise companions protect downloaded items
      const allLibraryMovies = db.prepare('SELECT id, tmdb_id, title, year FROM movies').all();
      const franchiseIds = new Set();
      const franchiseNames = new Map();

      // Check Atlas user collections (movie_collections table)
      try {
        const atlasCollections = db.prepare(`
          SELECT mc.movie_id, c.name as collection_name
          FROM movie_collections mc
          JOIN collections c ON mc.collection_id = c.id
        `).all();
        for (const row of atlasCollections) {
          franchiseIds.add(row.movie_id);
          const list = franchiseNames.get(row.movie_id) || [];
          if (!list.includes(row.collection_name)) list.push(row.collection_name);
          franchiseNames.set(row.movie_id, list);
        }
      } catch { /* ignore if tables missing */ }

      // Title-based union-find grouping
      const parent = new Map();
      const find = (id) => {
        if (!parent.has(id)) parent.set(id, id);
        if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
        return parent.get(id);
      };
      const union = (a, b) => { parent.set(find(a), find(b)); };

      for (let i = 0; i < allLibraryMovies.length; i++) {
        const m1 = allLibraryMovies[i];
        const r1 = getFranchiseRoot(m1.title);
        if (!r1 || r1.length < 3) continue;
        const c1 = cleanTitle(m1.title);

        for (let j = i + 1; j < allLibraryMovies.length; j++) {
          const m2 = allLibraryMovies[j];
          const r2 = getFranchiseRoot(m2.title);
          if (!r2 || r2.length < 3) continue;
          const c2 = cleanTitle(m2.title);

          // 1. Direct root match (e.g. 'matrix' === 'matrix', 'taken' === 'taken')
          if (r1 === r2) {
            union(m1.id, m2.id);
            continue;
          }

          // 2. Prefix match (e.g. 'matrix' is prefix of 'matrix resurrections')
          if (r1.length >= 4 && (c2.startsWith(r1 + ' ') || c2.startsWith(r1 + ':') || c2.startsWith(r1 + '-') || c2 === r1)) {
            union(m1.id, m2.id);
            continue;
          }
          if (r2.length >= 4 && (c1.startsWith(r2 + ' ') || c1.startsWith(r2 + ':') || c1.startsWith(r2 + '-') || c1 === r2)) {
            union(m1.id, m2.id);
            continue;
          }

          // 3. Known franchise aliases
          for (const group of KNOWN_FRANCHISE_ALIASES) {
            const match1 = group.some(alias => r1 === alias || c1.startsWith(alias) || (alias.length >= 5 && c1.includes(alias)));
            const match2 = group.some(alias => r2 === alias || c2.startsWith(alias) || (alias.length >= 5 && c2.includes(alias)));
            if (match1 && match2) {
              union(m1.id, m2.id);
            }
          }
        }
      }

      const franchiseGroups = new Map();
      for (const m of allLibraryMovies) {
        const root = find(m.id);
        if (!franchiseGroups.has(root)) franchiseGroups.set(root, new Set());
        franchiseGroups.get(root).add(m.id);
      }

      for (const [, ids] of franchiseGroups) {
        if (ids.size > 1) {
          for (const id of ids) {
            franchiseIds.add(id);
            const others = allLibraryMovies.filter(m => ids.has(m.id) && m.id !== id).map(m => m.title);
            franchiseNames.set(id, [...(franchiseNames.get(id) || []), ...others]);
          }
        }
      }

      // ── TMDB enrichment (ratings + collection-based grouping) ──
      const tmdbCache = new Map();

      await concurrency.runWithConcurrency(movies, 10, async (movie) => {
        try {
          const data = await tmdbService.getMovieById(movie.tmdb_id);
          if (data) {
            tmdbCache.set(movie.tmdb_id, {
              rating: data.vote_average ? Math.round(data.vote_average * 10) / 10 : null,
              collectionId: data.belongs_to_collection?.id || null,
              collectionName: data.belongs_to_collection?.name || null
            });
          }
        } catch { /* skip */ }
      });

      // Any movie with a TMDB collection belongs to a franchise by definition!
      for (const m of movies) {
        const cached = tmdbCache.get(m.tmdb_id);
        if (cached?.collectionId) {
          franchiseIds.add(m.id);
          const list = franchiseNames.get(m.id) || [];
          if (cached.collectionName && !list.includes(cached.collectionName)) list.push(cached.collectionName);
          franchiseNames.set(m.id, list);
        }
      }

      // Also link any movie whose title matches a known TMDB collection name in the library
      // (e.g. "The Matrix Collection" -> matches "The Matrix Resurrections" even if TMDB omitted belongs_to_collection on that single entry)
      for (const [, coll] of tmdbCache) {
        if (coll?.collectionName) {
          const collClean = cleanTitle(coll.collectionName.replace(/\s+Collection\s*$/i, ''));
          const collRoot = getFranchiseRoot(collClean);
          if (collRoot && collRoot.length >= 3) {
            for (const m of movies) {
              const mClean = cleanTitle(m.title);
              const mRoot = getFranchiseRoot(m.title);
              if (mClean.startsWith(collClean) || mClean.startsWith(collRoot + ' ') || mRoot === collRoot) {
                franchiseIds.add(m.id);
                const list = franchiseNames.get(m.id) || [];
                if (!list.includes(coll.collectionName)) list.push(coll.collectionName);
                franchiseNames.set(m.id, list);
              }
            }
          }
        }
      }

      // ── Score each movie ──
      const scored = [];

      for (const movie of movies) {
        const cached = tmdbCache.get(movie.tmdb_id);
        const tmdbRating = cached?.rating || null;
        const ageDays = (now - new Date(movie.added_at + 'Z').getTime()) / DAY;
        const isWatched = movie.watched === 1;
        const fileSizeGB = (movie.file_size || 0) / (1024 * 1024 * 1024);
        const hasSequelsInLibrary = franchiseIds.has(movie.id);

        let score = 0;
        const reasons = [];

        if (hasSequelsInLibrary) {
          continue;
        }

        score += 15;
        reasons.push('Standalone (no sequels in library)');

        if (tmdbRating !== null && tmdbRating >= 6.5) {
          continue;
        }

        if (tmdbRating !== null && tmdbRating < 5) {
          score += 25;
          reasons.push(`Low TMDB rating (${tmdbRating}/10)`);
        } else if (tmdbRating !== null && tmdbRating < 6) {
          score += 15;
          reasons.push(`Mediocre TMDB rating (${tmdbRating}/10)`);
        }

        if (!isWatched) {
          score += 15;
          reasons.push('Unwatched');

          if (ageDays > 90) {
            score += 20;
            reasons.push('Added 90+ days ago, still unwatched');
          } else if (ageDays > 30) {
            score += 10;
            reasons.push('Added 30+ days ago, still unwatched');
          }
        } else {
          score += 25;
          reasons.push('Watched');
        }

        if (fileSizeGB > 10) {
          score += 10;
          reasons.push(`Large file (${fileSizeGB.toFixed(1)} GB)`);
        } else if (fileSizeGB > 5) {
          score += 5;
          reasons.push(`Medium file (${fileSizeGB.toFixed(1)} GB)`);
        }

        scored.push({
          id: movie.id,
          tmdb_id: movie.tmdb_id,
          title: movie.title,
          year: movie.year,
          file_size: movie.file_size,
          added_at: movie.added_at,
          watched: isWatched,
          db_rating: movie.db_rating,
          tmdb_rating: tmdbRating,
          has_sequels_in_library: hasSequelsInLibrary,
          sequel_titles: [...new Set(franchiseNames.get(movie.id) || [])],
          score: Math.max(0, score),
          reasons
        });
      }

      scored.sort((a, b) => b.score - a.score);

      const highPriority = scored.filter(m => m.score >= 35);
      const mediumPriority = scored.filter(m => m.score >= 15 && m.score < 35);
      const lowPriority = scored.filter(m => m.score < 15);

      this.cache = {
        all: scored,
        highPriority,
        mediumPriority,
        lowPriority,
        total: scored.length,
        franchiseCount: franchiseIds.size,
        lastUpdated: Date.now(),
        lastError: null,
        lastErrorAt: null
      };

      console.log(`[CleanupWorker] Calculation complete. Found ${scored.length} candidates.`);
    } catch (err) {
      console.error('[CleanupWorker] Error calculating deletable:', err);
      // Keep stale candidates but surface the failure so the UI can show the cache is outdated.
      this.cache = {
        ...(this.cache || { all: [], highPriority: [], mediumPriority: [], lowPriority: [], total: 0, franchiseCount: 0 }),
        lastError: err.message,
        lastErrorAt: Date.now()
      };
    }
  }

  getCandidates() {
    return this.cache;
  }

  removeItem(id) {
    if (!this.cache) return;
    this.cache.highPriority = this.cache.highPriority?.filter(m => m.id !== id);
    this.cache.mediumPriority = this.cache.mediumPriority?.filter(m => m.id !== id);
    this.cache.lowPriority = this.cache.lowPriority?.filter(m => m.id !== id);
    this.cache.all = this.cache.all?.filter(m => m.id !== id);
    this.cache.total = this.cache.all?.length || 0;
  }
}

module.exports = new CleanupWorker();
