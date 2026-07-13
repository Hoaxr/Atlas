/**
 * Shared constants — single source of truth for magic values
 * used across routes, services, and utilities.
 */

// HTTP User-Agent sent to external APIs (OpenSubtitles, SubDL, SubSource, Prowlarr)
const USER_AGENT = 'Atlas/1.0';

// Default target language for subtitle translation/download
const DEFAULT_TARGET_LANG = 'Dutch';

// Language name → ISO 639-1 code mapping (used across subtitle routes & services)
const LANG_TO_CODE = {
  'Dutch': 'nl', 'French': 'fr', 'German': 'de',
  'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt',
  'English': 'en',
};

// ISO 639-1 → language name mapping (for provider search queries)
const CODE_TO_LANG = {
  'en': 'english', 'nl': 'dutch', 'fr': 'french',
  'de': 'german', 'es': 'spanish', 'it': 'italian',
  'pt': 'portuguese',
};

// Broadcast intervals (milliseconds) — server → client push
const LAYOUT_PUSH_INTERVAL = 3_000;
const TORRENTS_PUSH_INTERVAL = 5_000;

module.exports = {
  USER_AGENT,
  DEFAULT_TARGET_LANG,
  LANG_TO_CODE,
  CODE_TO_LANG,
  LAYOUT_PUSH_INTERVAL,
  TORRENTS_PUSH_INTERVAL,
};
