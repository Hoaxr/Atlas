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

      // ── Detect franchises: title-based grouping (instant, no API calls) ──
      const stripSequels = (title) => {
        let base = title
          .replace(/\s*\(\d{4}\)\s*/g, '')
          .replace(/\bPart\s+(?:II|III|IV|V|VI|VII|VIII|IX|X|[2-9])\b/gi, '')
          .replace(/\b(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/g, '')
          .replace(/\s+\d+\s*$/, '')
          .replace(/\s*:\s*[^:]+$/, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (base.length < 3) base = title.replace(/\s*\(\d{4}\)\s*/g, '').trim().toLowerCase();
        return base;
      };

      const getBaseCandidates = (title) => {
        const base = stripSequels(title);
        const words = base.split(/\s+/);
        const candidates = [];
        const maxStrip = Math.max(0, words.length - 2);
        for (let i = 0; i <= maxStrip; i++) {
          const suffix = words.slice(i).join(' ');
          if (suffix.length >= 3) candidates.push(suffix);
        }
        return candidates;
      };

      const candidateMap = new Map();
      for (const m of movies) {
        for (const cand of getBaseCandidates(m.title)) {
          if (!candidateMap.has(cand)) candidateMap.set(cand, new Set());
          candidateMap.get(cand).add(m.id);
        }
      }

      const parent = new Map();
      const find = (id) => {
        if (!parent.has(id)) parent.set(id, id);
        if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
        return parent.get(id);
      };
      const union = (a, b) => { parent.set(find(a), find(b)); };

      for (const [, ids] of candidateMap) {
        if (ids.size > 1) {
          const arr = [...ids];
          for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
        }
      }

      const franchiseGroups = new Map();
      for (const m of movies) {
        const root = find(m.id);
        if (!franchiseGroups.has(root)) franchiseGroups.set(root, new Set());
        franchiseGroups.get(root).add(m.id);
      }

      const franchiseIds = new Set();
      const franchiseNames = new Map();

      for (const [, ids] of franchiseGroups) {
        if (ids.size > 1) {
          for (const id of ids) {
            franchiseIds.add(id);
            const others = movies.filter(m => ids.has(m.id) && m.id !== id).map(m => m.title);
            franchiseNames.set(id, others);
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

      const collectionGroups = new Map();
      for (const m of movies) {
        const cached = tmdbCache.get(m.tmdb_id);
        if (cached?.collectionId) {
          if (!collectionGroups.has(cached.collectionId)) collectionGroups.set(cached.collectionId, []);
          collectionGroups.get(cached.collectionId).push(m.id);
        }
      }

      for (const [, ids] of collectionGroups) {
        if (ids.length > 1) {
          for (const id of ids) {
            franchiseIds.add(id);
            const others = movies.filter(m => ids.includes(m.id) && m.id !== id).map(m => m.title);
            franchiseNames.set(id, [...(franchiseNames.get(id) || []), ...others]);
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
