import { Star } from 'lucide-react';
import { formatSize, parseResolution, parseCodec, parseAudio } from '../../lib/format';

/* ─── Individual cell renderers for Dashboard table columns ─────────── */

export const YearCell = ({ item }) => (
  <td className="py-2.5 px-4 text-slate-300 text-sm">
    {item.year || <span className="text-slate-600">—</span>}
  </td>
);

export const RatingCell = ({ item }) => (
  <td className="py-2.5 px-4 text-slate-300 text-sm font-medium">
    {item.rating > 0 ? (
      <div className="flex items-center gap-1.5 w-fit bg-slate-950/50 px-2.5 py-0.5 rounded-lg border border-white/5 shadow-inner">
        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
        <span className="text-sm font-bold text-slate-600 dark:text-slate-200">{Number(item.rating).toFixed(1)}</span>
      </div>
    ) : <span className="text-slate-600">—</span>}
  </td>
);

export const ResolutionCell = ({ item }) => {
  const resVal = parseResolution(item.scene_name || item.sample_episode_path || item.file_path);
  return (
    <td className="py-2.5 px-4 text-slate-300">
      {resVal !== 'Unknown' ? (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
          {resVal}
        </span>
      ) : <span className="text-slate-600">—</span>}
    </td>
  );
};

export const CodecCell = ({ item }) => {
  const codecVal = item.codec || parseCodec(item.scene_name || item.sample_episode_path || item.file_path);
  return (
    <td className="py-2.5 px-4 text-slate-300">
      {codecVal !== 'Unknown' ? (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap uppercase">
          {codecVal}
        </span>
      ) : <span className="text-slate-600">—</span>}
    </td>
  );
};

export const AudioCell = ({ item }) => {
  const audioVal = item.audio || parseAudio(item.scene_name || item.sample_episode_path || item.file_path);
  return (
    <td className="py-2.5 px-4 text-slate-300">
      {audioVal !== 'Unknown' ? (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 whitespace-nowrap uppercase">
          {audioVal}
        </span>
      ) : <span className="text-slate-600">—</span>}
    </td>
  );
};

export const SizeCell = ({ item }) => (
  <td className="py-2.5 px-4 text-slate-400 text-sm">
    {formatSize(item.file_size || item.folder_size || 0)}
  </td>
);

export const SubtitlesCell = ({ item, providerLangs }) => {
  const subsList = Array.isArray(item.subtitles)
    ? item.subtitles
    : (() => { try { return JSON.parse(item.subtitles || '[]'); } catch { return []; } })();
  const existingLangs = subsList.map(s => typeof s === 'string' ? s.toLowerCase() : (s.lang || '').toLowerCase()).filter(Boolean);

  return (
    <td className="py-2.5 px-4">
      {providerLangs && providerLangs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {providerLangs.map(code => {
            const exists = existingLangs.includes(code.toLowerCase());
            return (
              <span key={code} className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                exists
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/20'
              }`}>
                {code}
              </span>
            );
          })}
        </div>
      ) : subsList.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {subsList.map((sub, i) => (
            <span key={i} className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" title={sub.file || sub}>
              {typeof sub === 'string' ? sub : (sub.lang || '??')}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-slate-600 text-xs">—</span>
      )}
    </td>
  );
};

export const SeasonsCell = ({ item }) => (
  <td className="py-2.5 px-4 text-slate-300 text-sm font-medium">{item.season_count || 0}</td>
);

export const EpisodesCell = ({ item }) => {
  const total = item.episode_count || 0;
  const missing = item.missing_episodes || 0;
  return (
    <td className="py-2.5 px-4 text-slate-300 text-sm font-medium">
      {total}<span className="text-slate-500 mx-1">/</span>
      <span className={missing > 0 ? 'text-rose-400' : 'text-emerald-400'}>{missing}</span>
    </td>
  );
};

export const StatusCell = ({ item }) => {
  const isNotReleased = item.release_date && new Date(item.release_date) > new Date();
  const label = (item.status === 'monitored' && isNotReleased) ? 'not released' : item.status;
  const color = (item.status === 'monitored' && isNotReleased)
    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    : item.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    : item.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    : item.status === 'monitored' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
  return (
    <td className="py-2.5 px-4">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap ${color}`}>
          {label}
        </span>
      </div>
    </td>
  );
};

/* ─── Render dispatcher ────────────────────────────────────────────── */

const CELL_RENDERERS = {
  year:       YearCell,
  rating:     RatingCell,
  resolution: ResolutionCell,
  codec:      CodecCell,
  audio:      AudioCell,
  size:       SizeCell,
  subtitles:  SubtitlesCell,
  seasons:    SeasonsCell,
  episodes:   EpisodesCell,
  status:     StatusCell,
};

/**
 * Render a dashboard table cell by column key.
 * @param {string} colKey - Column key from COLUMN_DEFS
 * @param {object} item - Media item (movie or show)
 * @param {Array} providerLangs - Configured subtitle language codes
 * @returns {JSX.Element|null}
 */
export const renderColumnCell = (colKey, item, providerLangs) => {
  const Renderer = CELL_RENDERERS[colKey];
  if (!Renderer) return null;
  return <Renderer key={colKey} item={item} providerLangs={providerLangs} />;
};
