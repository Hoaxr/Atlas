import { parseResolution, parseCodec } from '../lib/format';

/**
 * Sort media items by a given field and direction.
 * Used by the Dashboard to consolidate the 30-line sort logic.
 */
const RESOLUTION_ORDER = { '2160p': 4, '1080p': 3, '720p': 2, 'SD': 1, 'Unknown': 0 };

export const sortItems = (items, sort) => {
  const sorted = [...items];

  sorted.sort((a, b) => {
    switch (sort) {
      case 'added_desc': return new Date(b.added_at) - new Date(a.added_at);
      case 'rating_desc': return (b.rating || 0) - (a.rating || 0);
      case 'rating_asc':  return (a.rating || 0) - (b.rating || 0);
      case 'size_desc':   return (b.file_size || b.folder_size || 0) - (a.file_size || a.folder_size || 0);
      case 'size_asc':    return (a.file_size || a.folder_size || 0) - (b.file_size || b.folder_size || 0);
      case 'title_asc':   return (a.title || '').localeCompare(b.title || '');
      case 'title_desc':  return (b.title || '').localeCompare(a.title || '');
      case 'year_desc':   return (b.year || 0) - (a.year || 0);
      case 'year_asc':    return (a.year || 0) - (b.year || 0);
      case 'status_asc':  return (a.status || '').localeCompare(b.status || '');
      case 'status_desc': return (b.status || '').localeCompare(a.status || '');
      case 'season_count_desc':       return (b.season_count || 0) - (a.season_count || 0);
      case 'season_count_asc':        return (a.season_count || 0) - (b.season_count || 0);
      case 'missing_episodes_desc':   return (b.missing_episodes || 0) - (a.missing_episodes || 0);
      case 'missing_episodes_asc':    return (a.missing_episodes || 0) - (b.missing_episodes || 0);
      case 'resolution_asc':
      case 'resolution_desc': {
        const resA = RESOLUTION_ORDER[parseResolution(a.scene_name || a.sample_episode_path || a.file_path)] || 0;
        const resB = RESOLUTION_ORDER[parseResolution(b.scene_name || b.sample_episode_path || b.file_path)] || 0;
        return sort === 'resolution_asc' ? resA - resB : resB - resA;
      }
      case 'codec_asc':
      case 'codec_desc': {
        const codecA = a.codec || parseCodec(a.scene_name || a.sample_episode_path || a.file_path) || '';
        const codecB = b.codec || parseCodec(b.scene_name || b.sample_episode_path || b.file_path) || '';
        return sort === 'codec_asc' ? codecA.localeCompare(codecB) : codecB.localeCompare(codecA);
      }
      default: return 0;
    }
  });

  return sorted;
};
