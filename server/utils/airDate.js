const { getSetting } = require('./settings');

// TMDB air dates are date-only and reflect US release timing. Episodes typically
// become available in European timezones the following calendar day. When a
// user timezone is configured (Settings → Security → Location), air dates are
// interpreted at primetime US Eastern and converted to that timezone.
const SOURCE_TZ = 'America/New_York';
const SOURCE_WALL_TIME = '20:00'; // typical US primetime slot

let cachedTz = null;

const getUserTimezone = () => {
  try {
    if (cachedTz === null) cachedTz = getSetting('timezone') || '';
  } catch { cachedTz = ''; }
  return cachedTz;
};

const invalidateTimezoneCache = () => { cachedTz = null; cachedShift = null; };

const _tzOffsetMinutes = (zone, utcMillis) => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcMillis))) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return (asUTC - utcMillis) / 60000;
};

const _wallTimeToUtc = (dateStr, timeStr, zone) => {
  const guess = Date.parse(`${dateStr}T${timeStr}:00Z`);
  let utc = guess - _tzOffsetMinutes(zone, guess) * 60000;
  utc = guess - _tzOffsetMinutes(zone, utc) * 60000;
  return utc;
};

/**
 * Converts a YYYY-MM-DD (or ISO timestamp) US air date into the calendar day
 * on which the episode becomes available in the configured user timezone.
 * Returns the input unchanged when no timezone is configured or parsing fails.
 */
const localizeAirDate = (dateStr) => {
  if (!dateStr) return dateStr;
  const tz = getUserTimezone();
  if (!tz || tz === SOURCE_TZ) return dateStr;
  try {
    const dateOnly = String(dateStr).split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateStr;
    const utcMillis = _wallTimeToUtc(dateOnly, SOURCE_WALL_TIME, SOURCE_TZ);
    const localized = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(utcMillis));
    return localized;
  } catch {
    return dateStr;
  }
};

/**
 * Number of days a US air date is pushed forward in the configured timezone.
 * 0 when no timezone is configured (or the zone shares US Eastern timing).
 */
let cachedShift = null;
const getAirDateShiftDays = () => {
  if (cachedShift !== null) return cachedShift;
  const tz = getUserTimezone();
  if (!tz || tz === SOURCE_TZ) return 0;
  // Fixed mid-January reference date avoids DST transition edge cases
  const ref = '2026-01-15';
  const localized = localizeAirDate(ref);
  const diff = Math.round((Date.parse(`${localized}T00:00:00Z`) - Date.parse(`${ref}T00:00:00Z`)) / 86400000);
  cachedShift = Math.max(0, diff);
  return cachedShift;
};

/**
 * SQL fragment for the "is this episode aired yet?" cutoff, matching the
 * localized calendar day. With a +1 shift, episodes become eligible for
 * auto-search one day later (e.g. early Friday for a Thursday US air date).
 */
const getAiredCutoffSql = () => {
  const shift = getAirDateShiftDays();
  return shift === 0 ? "date('now', 'localtime')" : `date('now', 'localtime', '-${shift} day')`;
};

module.exports = { localizeAirDate, getUserTimezone, invalidateTimezoneCache, getAiredCutoffSql };
