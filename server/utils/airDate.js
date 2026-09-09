const { getSetting } = require('./settings');

let cachedTz = null;

const getUserTimezone = () => {
  try {
    if (cachedTz === null) cachedTz = getSetting('timezone') || '';
  } catch { cachedTz = ''; }
  return cachedTz;
};

const invalidateTimezoneCache = () => { cachedTz = null; };

/**
 * Returns the air date string unchanged.
 * Air dates from TMDB represent official broadcast/streaming release dates.
 * Artificially shifting them pushes episodes and movies to the wrong day in the calendar.
 */
const localizeAirDate = (dateStr) => {
  return dateStr;
};

/**
 * Air dates are no longer shifted forward to keep calendar and downloads in sync
 * with official release dates.
 */
const getAirDateShiftDays = () => {
  return 0;
};

/**
 * SQL fragment for the "is this episode aired yet?" cutoff.
 * An episode is eligible once the current local date reaches or exceeds its air date.
 */
const getAiredCutoffSql = () => {
  return "date('now', 'localtime')";
};

module.exports = { localizeAirDate, getUserTimezone, invalidateTimezoneCache, getAiredCutoffSql, getAirDateShiftDays };

