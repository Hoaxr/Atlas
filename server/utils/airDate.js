const { getSetting } = require('./settings');

let cachedTz = null;

const getUserTimezone = () => {
  try {
    if (cachedTz === null) cachedTz = getSetting('timezone') || '';
  } catch { cachedTz = ''; }
  return cachedTz;
};

const invalidateTimezoneCache = () => {
  cachedTz = null;
  try {
    const { invalidateSettingsCache } = require('./settings');
    invalidateSettingsCache();
  } catch { /* ignore */ }
};

/**
 * Returns the air date string unchanged.
 * Air dates from TMDB represent official release dates.
 * Artificially shifting them pushes streaming and broadcast releases to the wrong day
 * in the calendar (e.g. MobLand released & downloadable on Friday appearing on Saturday).
 */
const localizeAirDate = (dateStr) => {
  return dateStr;
};

/**
 * Air dates are not shifted forward to keep calendar and downloads in sync
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
