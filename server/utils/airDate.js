const { getSetting } = require('./settings');

const SOURCE_TZ = 'America/New_York';
const SOURCE_WALL_TIME = '20:00'; // US evening primetime slot

let cachedTz = null;
let cachedShift = null;

const getUserTimezone = () => {
  try {
    if (cachedTz === null) cachedTz = getSetting('timezone') || '';
  } catch { cachedTz = ''; }
  return cachedTz;
};

const invalidateTimezoneCache = () => {
  cachedTz = null;
  cachedShift = null;
  try {
    const { invalidateSettingsCache } = require('./settings');
    invalidateSettingsCache();
  } catch { /* ignore */ }
};

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
 * Number of days a US evening primetime broadcast pushes forward into local calendar day
 * (e.g. +1 for European/Asian timezones where US 8 PM ET is early morning the next day).
 */
const getAirDateShiftDays = () => {
  if (cachedShift !== null) return cachedShift;
  const tz = getUserTimezone();
  if (!tz || tz === SOURCE_TZ) return 0;
  try {
    const ref = '2026-01-15';
    const utcMillis = _wallTimeToUtc(ref, SOURCE_WALL_TIME, SOURCE_TZ);
    const localized = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(utcMillis));
    const diff = Math.round((Date.parse(`${localized}T00:00:00Z`) - Date.parse(`${ref}T00:00:00Z`)) / 86400000);
    cachedShift = Math.max(0, diff);
  } catch {
    cachedShift = 0;
  }
  return cachedShift;
};

const STREAMING_NETWORKS = [
  'netflix',
  'paramount+',
  'apple tv',
  'amazon',
  'prime video',
  'disney+',
  'max',
  'hulu',
  'peacock',
  'discovery+',
  'amc+',
  'shudder',
  'mubi',
  'crunchyroll',
  'hidive',
  'britbox',
  'itvx'
];

/**
 * Checks if a show is released during daytime/streaming hours (drops 00:00 PT / 03:00 ET = morning in Europe),
 * or is a non-US production (e.g. UK, Europe, Australia) that airs on local time,
 * meaning it is available to download on the same calendar day in the user's timezone.
 */
const isSameDayRelease = (network, originCountry) => {
  if (originCountry) {
    const countries = originCountry.toUpperCase().split(',').map(c => c.trim()).filter(Boolean);
    // If produced in UK, Europe, Japan, Australia, etc. (and not exclusively US), it airs locally
    if (countries.length > 0 && !countries.every(c => c === 'US')) {
      return true;
    }
  }

  if (network) {
    const netLower = network.toLowerCase();
    for (const s of STREAMING_NETWORKS) {
      if (netLower.includes(s)) return true;
    }
  }

  return false;
};

/**
 * Converts air date to the local calendar day when it becomes downloadable in the user's timezone.
 * Streaming platforms and non-US shows are downloadable on the official release day (e.g. Friday morning).
 * US evening broadcast shows (e.g. HBO 9 PM ET) become downloadable early next morning (+1 day).
 */
const localizeAirDate = (dateStr, network = null, originCountry = null) => {
  if (!dateStr) return dateStr;
  const shift = getAirDateShiftDays();
  if (shift === 0) return dateStr;

  // If streaming or non-US production, it's downloadable on the same day
  if (isSameDayRelease(network, originCountry)) {
    return dateStr;
  }

  // US evening broadcast: shift by +shift days
  try {
    const dateOnly = String(dateStr).split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateStr;
    const parts = dateOnly.split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + shift));
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

/**
 * SQL expression for air_date with smart timezone shift.
 * Shifts US evening broadcast shows by +${shift} days, while keeping streaming & non-US shows on their release day.
 */
const getAirDateShiftSql = (column = 'e.air_date') => {
  const shift = getAirDateShiftDays();
  if (shift === 0) return column;

  const streamingConditions = STREAMING_NETWORKS.map(s => `LOWER(s.network) LIKE '%${s}%'`).join(' OR ');

  return `
    CASE 
      WHEN ${shift} > 0 AND (
        (s.network IS NOT NULL AND s.network != '' AND NOT (${streamingConditions}))
        AND (s.origin_country IS NULL OR s.origin_country = '' OR s.origin_country = 'US')
      ) THEN date(${column}, '+${shift} days')
      ELSE ${column}
    END
  `;
};

/**
 * SQL fragment for the "is this episode aired yet?" cutoff.
 * An episode is eligible once the current local date reaches or exceeds its air date.
 */
const getAiredCutoffSql = () => {
  return "date('now', 'localtime')";
};

module.exports = {
  localizeAirDate,
  getUserTimezone,
  invalidateTimezoneCache,
  getAiredCutoffSql,
  getAirDateShiftDays,
  isSameDayRelease,
  getAirDateShiftSql
};
