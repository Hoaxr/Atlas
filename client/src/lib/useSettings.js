import { useState, useEffect } from 'react';
import api from './api';

/**
 * Fetches settings, provider languages, and quality profiles.
 * Returns { providerLangs, profiles, loading }.
 */
export function useSettings() {
  const [providerLangs, setProviderLangs] = useState(['en']);
  const [profiles, setProfiles] = useState([]);
  const [defaultQualityProfileId, setDefaultQualityProfileId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/settings').then(res => {
      if (res.data.status === 'success') {
        const langs = res.data.data.providerLangs;
        setProviderLangs(Array.isArray(langs) && langs.length > 0 ? langs : ['en']);
        const parsedProfiles = (res.data.data.profiles || []).map(p => {
          let parsedQualities = ['1080p'];
          try { if (p.qualities) parsedQualities = JSON.parse(p.qualities); } catch { /* malformed JSON — use default */ }
          return { ...p, qualities: parsedQualities, upgrade_allowed: p.upgrade_allowed !== 0 };
        });
        setProfiles(parsedProfiles);
        setDefaultQualityProfileId(res.data.data.defaultQualityProfileId || null);
      }
    }).catch(() => { /* settings unavailable */ }).finally(() => setLoading(false));
  }, []);

  return { providerLangs, profiles, defaultQualityProfileId, loading };
}
