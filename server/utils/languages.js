const ISO_639_2_TO_1 = {
  // English
  eng: 'en', english: 'en',
  // Dutch
  dut: 'nl', nld: 'nl', dutch: 'nl',
  // French
  fre: 'fr', fra: 'fr', french: 'fr',
  // German
  ger: 'de', deu: 'de', german: 'de',
  // Spanish
  spa: 'es', spanish: 'es',
  // Italian
  ita: 'it', italian: 'it',
  // Portuguese
  por: 'pt', portuguese: 'pt',
  // Russian
  rus: 'ru', russian: 'ru',
  // Japanese
  jpn: 'ja', japanese: 'ja',
  // Chinese
  chi: 'zh', zho: 'zh', chinese: 'zh',
  // Swedish
  swe: 'sv', swedish: 'sv',
  // Danish
  dan: 'da', danish: 'da',
  // Norwegian
  nor: 'no', nob: 'no', nno: 'no', norwegian: 'no',
  // Finnish
  fin: 'fi', finnish: 'fi',
  // Polish
  pol: 'pl', polish: 'pl',
  // Turkish
  tur: 'tr', turkish: 'tr',
  // Arabic
  ara: 'ar', arabic: 'ar',
  // Hindi
  hin: 'hi', hindi: 'hi',
  // Korean
  kor: 'ko', korean: 'ko',
  // Vietnamese
  vie: 'vi', vietnamese: 'vi',
  // Thai
  tha: 'th', thai: 'th',
  // Czech
  cze: 'cs', ces: 'cs', czech: 'cs',
  // Greek
  gre: 'el', ell: 'el', greek: 'el',
  // Hebrew
  heb: 'he', hebrew: 'he',
  // Hungarian
  hun: 'hu', hungarian: 'hu',
  // Indonesian
  ind: 'id', indonesian: 'id',
  // Romanian
  rum: 'ro', ron: 'ro', romanian: 'ro',
  // Ukrainian
  ukr: 'uk', ukrainian: 'uk',
  // Bulgarian
  bul: 'bg', bulgarian: 'bg',
  // Croatian
  hrv: 'hr', croatian: 'hr',
  // Serbian
  srp: 'sr', serbian: 'sr',
  // Slovak
  slk: 'sk', slo: 'sk', slovak: 'sk',
  // Slovenian
  slv: 'sl', slovenian: 'sl',
  // Catalan
  cat: 'ca', catalan: 'ca',
  // Basque
  baq: 'eu', eus: 'eu', basque: 'eu',
  // Galician
  glg: 'gl', galician: 'gl',
  // Persian / Farsi
  per: 'fa', fas: 'fa', persian: 'fa', farsi: 'fa',
};

const LANGUAGE_NAMES = {
  en: 'English',
  nl: 'Dutch',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  pl: 'Polish',
  tr: 'Turkish',
  ar: 'Arabic',
  hi: 'Hindi',
  ko: 'Korean',
  vi: 'Vietnamese',
  th: 'Thai',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  hu: 'Hungarian',
  id: 'Indonesian',
  ro: 'Romanian',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  ca: 'Catalan',
  eu: 'Basque',
  gl: 'Galician',
  fa: 'Persian',
};

const VALID_LANGUAGES = new Set([
  'ab','aa','af','ak','sq','am','ar','an','hy','as','av','ae','ay','az','bm','ba','eu','be','bn','bh','bi','bs','br','bg','my','ca','ch','ce','ny','zh','cv','kw','co','cr','hr','cs','da','dv','nl','dz','en','eo','et','ee','fo','fj','fi','fr','ff','gl','ka','de','el','gn','gu','ht','ha','he','hz','hi','ho','hu','ia','id','ie','ga','ig','ik','io','is','it','iu','ja','jv','kl','kn','kr','ks','kk','km','ki','rw','ky','kv','kg','ko','ku','kj','la','lb','lg','li','ln','lo','lt','lu','lv','gv','mk','mg','ms','ml','mt','mi','mr','mh','mn','na','nv','nd','ne','ng','nb','nn','no','ii','nr','oc','oj','cu','om','or','os','pa','pi','fa','pl','ps','pt','qu','rm','rn','ro','ru','sa','sc','sd','se','sm','sg','sr','gd','sn','si','sk','sl','so','st','es','su','sw','ss','sv','ta','te','tg','th','ti','bo','tk','tl','tn','to','tr','ts','tt','tw','ty','ug','uk','ur','uz','ve','vi','vo','wa','cy','wo','fy','xh','yi','yo','za','zu',
  'eng', 'fre', 'fra', 'ger', 'deu', 'dut', 'nld', 'spa', 'ita', 'por', 'rus', 'jpn', 'chi', 'zho', 'swe', 'dan', 'nor', 'fin', 'pol', 'tur', 'ara', 'hin', 'kor', 'vie', 'tha'
]);

/**
 * Normalizes any language code or name (2-letter, 3-letter, or full name)
 * to a standard 2-letter ISO 639-1 code.
 * @param {string} code
 * @returns {string|null} 2-letter lowercase language code, or null if unknown
 */
const normalizeLanguageCode = (code) => {
  if (!code) return null;
  const c = String(code).toLowerCase().trim().split(/[-_]/)[0];
  if (ISO_639_2_TO_1[c]) return ISO_639_2_TO_1[c];
  if (VALID_LANGUAGES.has(c)) {
    return ISO_639_2_TO_1[c] || (c.length === 2 ? c : null);
  }
  return /^[a-z]{2}$/.test(c) ? c : null;
};

module.exports = {
  VALID_LANGUAGES,
  ISO_639_2_TO_1,
  LANGUAGE_NAMES,
  normalizeLanguageCode,
};
