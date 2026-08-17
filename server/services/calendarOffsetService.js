const db = require('../config/database');
const fs = require('fs');

/**
 * Detects the download/release weekday offset for a TV show by comparing 
 * historical episode file creation/modification times with their TMDB air dates.
 * 
 * E.g., US primetime cable (HBO) shows air Sunday night US time -> downloaded Monday in Europe (+1 day).
 * Streaming releases (Paramount+, AMC+) drop early Sunday -> downloaded Sunday in Europe (0 days).
 */
function detectShowCalendarOffset(showId) {
  try {
    const eps = db.prepare(`
      SELECT e.air_date, e.file_path 
      FROM episodes e 
      WHERE e.show_id = ? AND e.file_path IS NOT NULL AND e.air_date IS NOT NULL
    `).all(showId);

    if (!eps || eps.length === 0) return 0;

    const offsets = [];
    for (const ep of eps) {
      if (!ep.file_path || !ep.air_date) continue;
      try {
        if (!fs.existsSync(ep.file_path)) continue;
        const stat = fs.statSync(ep.file_path);
        const airD = new Date(ep.air_date + 'T00:00:00Z');
        const fileD = stat.mtime;
        const diffDays = (fileD.getTime() - airD.getTime()) / (1000 * 3600 * 24);

        // Focus on episodes downloaded within 5 days of their broadcast air date
        if (diffDays >= -1 && diffDays <= 4) {
          const airDayOfWeek = (new Date(ep.air_date + 'T12:00:00')).getDay();
          const fileDayOfWeek = fileD.getDay();
          let dayDiff = fileDayOfWeek - airDayOfWeek;
          if (dayDiff < -3) dayDiff += 7;
          if (dayDiff > 3) dayDiff -= 7;
          offsets.push(dayDiff);
        }
      } catch {
        /* ignore invalid date parse */
      }
    }

    if (offsets.length === 0) return 0;

    const counts = {};
    for (const o of offsets) {
      counts[o] = (counts[o] || 0) + 1;
    }

    let bestOffset = 0;
    let maxCount = 0;
    for (const [offsetStr, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        bestOffset = parseInt(offsetStr, 10);
      }
    }

    // Only allow offsets within [-1, 2] days
    if (bestOffset < -1) bestOffset = -1;
    if (bestOffset > 2) bestOffset = 2;

    return bestOffset;
  } catch (err) {
    console.error(`[CalendarOffset] Error detecting offset for show ${showId}:`, err);
    return 0;
  }
}

/**
 * Recalculates and updates calendar_day_offset for all shows in the database based on historical downloads.
 */
function syncAllShowOffsets() {
  try {
    const shows = db.prepare('SELECT id, title, calendar_day_offset FROM shows').all();
    const updateStmt = db.prepare('UPDATE shows SET calendar_day_offset = ? WHERE id = ?');

    let updatedCount = 0;
    for (const show of shows) {
      const detected = detectShowCalendarOffset(show.id);
      if (detected !== show.calendar_day_offset) {
        updateStmt.run(detected, show.id);
        updatedCount++;
      }
    }
    return { total: shows.length, updated: updatedCount };
  } catch (err) {
    console.error('[CalendarOffset] Error syncing show offsets:', err);
    return { total: 0, updated: 0 };
  }
}

module.exports = {
  detectShowCalendarOffset,
  syncAllShowOffsets
};
