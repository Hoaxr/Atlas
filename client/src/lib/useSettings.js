import { useState, useEffect } from 'react';
import api from './api';

/**
 * Module-level cache — shared across all component instances.
 * Populated on first call, reused by every subsequent mount.
 * Call invalidateSettingsCache() after saving settings to force a refresh.
 */
let settingsCache = null;
let inflightPromise = null; // deduplicates concurrent first-call fetches

export const invalidateSettingsCache = () => {
  settingsCache = null;
  inflightPromise = null;
};

const parseSettings = (data) => {
  const langs = data.providerLangs;
  const providerLangs = Array.isArray(langs) && langs.length > 0 ? langs : ['en'];
  const profiles = (data.profiles || []).map(p => {
    let parsedQualities = ['1080p'];
    try { if (p.qualities) parsedQualities = JSON.parse(p.qualities); } catch { /* malformed JSON */ }
    return { ...p, qualities: parsedQualities, upgrade_allowed: p.upgrade_allowed !== 0 };
  });
  return {
    providerLangs,
    profiles,
    defaultQualityProfileId: data.defaultQualityProfileId || null,
  };
};

/**
 * Fetches settings, provider languages, and quality profiles.
 * Results are cached at the module level — only one API call per session.
 * Returns { providerLangs, profiles, defaultQualityProfileId, loading }.
 */
export function useSettings() {
  const [providerLangs, setProviderLangs] = useState(settingsCache?.providerLangs || ['en']);
  const [profiles, setProfiles] = useState(settingsCache?.profiles || []);
  const [defaultQualityProfileId, setDefaultQualityProfileId] = useState(settingsCache?.defaultQualityProfileId || null);
  const [loading, setLoading] = useState(!settingsCache);

  useEffect(() => {
    // Cache hit — state already initialised from module-level cache, nothing to do
    if (settingsCache) return;

    // Deduplicate: if another component is already fetching, reuse the same promise
    if (!inflightPromise) {
      inflightPromise = api.get('/settings');
    }

    inflightPromise
      .then(res => {
        if (res.data.status === 'success') {
          const parsed = parseSettings(res.data.data);
          settingsCache = parsed;
          setProviderLangs(parsed.providerLangs);
          setProfiles(parsed.profiles);
          setDefaultQualityProfileId(parsed.defaultQualityProfileId);
        }
      })
      .catch(() => { /* settings unavailable */ })
      .finally(() => {
        inflightPromise = null;
        setLoading(false);
      });
  }, []);

  return { providerLangs, profiles, defaultQualityProfileId, loading };
}
