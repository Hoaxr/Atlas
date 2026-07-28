const { getSetting } = require('../utils/settings');

const getSchedulerConfig = () => ({
  moviePreReleaseDays: parseInt(getSetting('scheduler_movie_pre_release_days') || '7', 10),
  maxRetries: parseInt(getSetting('scheduler_max_retries') || '25', 10),
  expirationDays: parseInt(getSetting('scheduler_expiration_days') || '30', 10),
  backoffMultiplier: parseFloat(getSetting('scheduler_backoff_multiplier') || '1.5')
});

/**
 * Calculates priority score to determine search order
 */
const calculatePriority = (item, type, currentDate = new Date()) => {
  let score = 50; // base score

  const releaseDateStr = type === 'movie' ? item.release_date : item.air_date;
  if (releaseDateStr) {
    const releaseDate = new Date(releaseDateStr);
    const diffDays = (currentDate - releaseDate) / (1000 * 60 * 60 * 24);
    
    // Very high priority for recent releases (within 3 days)
    if (diffDays >= -1 && diffDays <= 3) {
      score += 100;
    }
    // High priority for releases within last week
    else if (diffDays > 3 && diffDays <= 7) {
      score += 50;
    }
    // Lower priority as it gets older
    else if (diffDays > 7) {
      score -= Math.min(diffDays, 40); 
    }
  }

  // Deduct points based on retry count (deprioritize items that fail constantly)
  if (item.retry_count > 0) {
    score -= (item.retry_count * 2);
  }

  return Math.max(0, Math.floor(score));
};

/**
 * Calculates the next search time
 */
const calculateNextSearchAt = (item, type, options = {}, currentDate = new Date()) => {
  const config = getSchedulerConfig();
  const { providerResponse = null, isCutoffMet = false, isDownloaded = false } = options;
  
  if (isDownloaded && isCutoffMet) {
    return { state: 'EXPIRED', nextSearch: null };
  }

  // Hard limits
  if (item.retry_count >= config.maxRetries) {
    // If it's downloaded but needs an upgrade, we should still search occasionally, just very slowly.
    if (isDownloaded && !isCutoffMet) {
      return { state: 'UPGRADING', nextSearch: new Date(currentDate.getTime() + 48 * 3600000) }; // Every 48 hours
    }
    return { state: 'EXPIRED', nextSearch: null };
  }

  const releaseDateStr = type === 'movie' ? item.release_date : item.air_date;
  
  if (!releaseDateStr) {
    // No release date known: fallback to simple exponential backoff
    return fallbackSchedule(item.retry_count, config, currentDate);
  }

  const releaseDate = new Date(releaseDateStr);
  const diffHours = (currentDate - releaseDate) / (1000 * 60 * 60);
  
  if (type === 'movie') {
    return scheduleMovie(item.retry_count, diffHours, config, currentDate, isDownloaded);
  } else {
    return scheduleEpisode(item.retry_count, diffHours, config, currentDate, isDownloaded);
  }
};

const fallbackSchedule = (retryCount, config, currentDate) => {
  const baseMinutes = 60; // 1 hour
  const nextMs = currentDate.getTime() + (baseMinutes * Math.pow(config.backoffMultiplier, retryCount) * 60000);
  return { state: 'SEARCHING', nextSearch: new Date(nextMs) };
};

const scheduleMovie = (retryCount, diffHours, config, currentDate, isDownloaded = false) => {
  let state = 'PENDING';
  let nextMs = currentDate.getTime();
  const preReleaseHours = config.moviePreReleaseDays * -24;

  if (diffHours < preReleaseHours) {
    // Too early to even start looking
    state = 'PENDING';
    nextMs += (Math.abs(diffHours) - Math.abs(preReleaseHours)) * 3600000; 
  } else if (diffHours >= preReleaseHours && diffHours < -24) {
    // PRE_RELEASE window (e.g. -7 days to -1 day) -> 12 hours
    state = isDownloaded ? 'UPGRADING' : 'PRE_RELEASE';
    nextMs += (isDownloaded ? 24 : 12) * 3600000;
  } else if (diffHours >= -24 && diffHours <= 72) {
    // RELEASE_WINDOW (-1 day to +3 days) -> highly active
    state = isDownloaded ? 'UPGRADING' : 'RELEASE_WINDOW';
    // Base 30 mins, backoff with retries to avoid spam
    const mins = Math.min(30 * Math.pow(config.backoffMultiplier, retryCount), isDownloaded ? 720 : 180);
    nextMs += mins * 60000;
  } else if (diffHours > 72 && diffHours <= (config.expirationDays * 24)) {
    // Post-release, still active
    state = isDownloaded ? 'UPGRADING' : 'SEARCHING';
    const hrs = Math.min(3 * Math.pow(config.backoffMultiplier, retryCount), isDownloaded ? 48 : 24);
    nextMs += hrs * 3600000;
  } else {
    if (isDownloaded) {
      state = 'UPGRADING';
      nextMs += 48 * 3600000; // 48 hours for long-term upgrades
    } else {
      state = 'EXPIRED';
      nextMs = null;
    }
  }

  return { state, nextSearch: nextMs ? new Date(nextMs) : null };
};

const scheduleEpisode = (retryCount, diffHours, config, currentDate, isDownloaded = false) => {
  let state = 'PENDING';
  let nextMs = currentDate.getTime();

  // Give a 1-day buffer for TV episodes because TMDB usually gives local broadcast dates
  // which might be tomorrow in UTC time
  const effectiveDiffHours = diffHours - 24; 

  if (effectiveDiffHours < 0) {
    // Not aired yet
    state = 'PENDING';
    nextMs += Math.abs(effectiveDiffHours) * 3600000;
  } else if (effectiveDiffHours >= 0 && effectiveDiffHours <= 72) {
    state = isDownloaded ? 'UPGRADING' : 'RELEASE_WINDOW';
    const mins = Math.min(30 * Math.pow(config.backoffMultiplier, retryCount), isDownloaded ? 720 : 240);
    nextMs += mins * 60000;
  } else if (effectiveDiffHours > 72 && effectiveDiffHours <= (config.expirationDays * 24)) {
    state = isDownloaded ? 'UPGRADING' : 'SEARCHING';
    const hrs = Math.min(6 * Math.pow(config.backoffMultiplier, retryCount), isDownloaded ? 48 : 48);
    nextMs += hrs * 3600000;
  } else {
    if (isDownloaded) {
      state = 'UPGRADING';
      nextMs += 48 * 3600000; // 48 hours for long-term upgrades
    } else {
      state = 'EXPIRED';
      nextMs = null;
    }
  }

  return { state, nextSearch: nextMs ? new Date(nextMs) : null };
};

module.exports = {
  calculatePriority,
  calculateNextSearchAt,
  getSchedulerConfig
};
