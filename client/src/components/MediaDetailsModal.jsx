import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { X, Star, Calendar, Clock, Plus, ExternalLink, PlayCircle, CheckCircle2, ArrowRight, CheckSquare, Square } from 'lucide-react';
import { customAlert } from '../utils/alerts';
import TrailerModal from './TrailerModal';

export default function MediaDetailsModal({ isOpen, onClose, mediaId, mediaType, isInLibrary, libraryId, onAdded, mode = 'add' }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [libraryPaths, setLibraryPaths] = useState([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [autoSearch, setAutoSearch] = useState(true);
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        const data = res.data.data;
        if (data.profiles) {
          setProfiles(data.profiles);
          const defaultProfileId = data.defaultQualityProfileId;
          const defaultIdStr = defaultProfileId ? String(defaultProfileId) : null;
          const profileIdStrs = data.profiles.map(p => String(p.id));
          if (defaultIdStr && profileIdStrs.includes(defaultIdStr)) {
            setSelectedProfile(defaultIdStr);
          } else if (data.profiles.length > 0) {
            setSelectedProfile(String(data.profiles[0].id));
          }
        }
        if (data.libraryPaths) {
          setLibraryPaths(data.libraryPaths);
          
          // Try to select a smart default based on media type
          const preferredPath = data.libraryPaths.find(p => 
            p.path.toLowerCase().includes(mediaType === 'movie' ? 'movie' : (mediaType === 'tv' || mediaType === 'show' ? 'tv' : 'show'))
          );
          if (preferredPath) {
            setSelectedPath(preferredPath.path);
          } else if (data.libraryPaths.length > 0) {
            setSelectedPath(data.libraryPaths[0].path);
          }
        }
      }
    } catch {
      // Settings unavailable — profiles will remain empty
    }
  };

  const fetchDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/tmdb/${mediaType}/${mediaId}?_t=${Date.now()}`);
      if (res.data.status === 'success') {
        setDetails(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && mediaId) {
      fetchDetails();
      fetchSettings();
    } else {
      setDetails(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mediaId]);


  if (!isOpen) return null;

  const trailer = details?.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer');

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-800/50">
          <h2 className="text-xl md:text-2xl font-bold text-slate-200">
            {details ? `${details.title || details.name} ${details.release_date || details.first_air_date ? `(${(details.release_date || details.first_air_date).split('-')[0]})` : ''}` : 'Loading...'}
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mr-3"></div>
            Loading details...
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-red-400">
            <p>{error}</p>
          </div>
        )}

        {details && !loading && (
          <div className="flex flex-col h-full">
            <div className="flex flex-col md:flex-row gap-6 p-6">
              {/* Poster */}
              <div className="w-40 md:w-56 shrink-0 mx-auto md:mx-0 shadow-xl overflow-hidden bg-slate-900 aspect-[2/3] border border-white/5 rounded-sm relative group">
                {details.poster_path ? (
                  <img 
                    src={`https://image.tmdb.org/t/p/w500${details.poster_path}`} 
                    alt="Poster" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">No Image</div>
                )}
                {trailer && (
                  <div 
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center cursor-pointer"
                    onClick={() => {
                      setTrailerKey(trailer.key);
                      setIsTrailerOpen(true);
                    }}
                  >
                    <PlayCircle className="w-16 h-16 text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.8)] transition-transform duration-300 transform scale-90 group-hover:scale-110" strokeWidth={1.5} />
                  </div>
                )}
              </div>

              {/* Info & Form */}
              <div className="flex-1 text-sm md:text-base">
                <div className="mb-6 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {details.vote_average ? (
                    <div className="flex items-center gap-1 text-yellow-400">
                      <Star className="w-4 h-4 fill-current" />
                      {details.vote_average.toFixed(1)}
                    </div>
                  ) : null}
                  {(details.release_date || details.first_air_date) ? (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {(details.release_date || details.first_air_date).split('-')[0]}
                    </div>
                  ) : null}
                  {(details.runtime || (details.episode_run_time && details.episode_run_time[0])) ? (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {details.runtime || details.episode_run_time[0]} min
                    </div>
                  ) : null}
                  {details.genres && details.genres.length > 0 ? (
                    <div className="text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      {details.genres.map(g => g.name).join(', ')}
                    </div>
                  ) : null}
                </div>

                <p className="text-slate-300 leading-relaxed mb-8">
                  {details.overview || 'No overview available.'}
                </p>

                {!isInLibrary && mode === 'add' && (
                  <div className="grid grid-cols-[140px_1fr] items-center gap-y-5 gap-x-4">
                    {/* Root Folder */}
                    <div className="text-right font-bold text-slate-300 text-sm">Root Folder</div>
                    <div>
                      <select 
                        className="w-full bg-slate-800 border border-slate-600 rounded-md text-slate-200 px-3 py-1.5 focus:outline-none focus:border-cyan-500 text-sm"
                        value={selectedPath}
                        onChange={e => setSelectedPath(e.target.value)}
                      >
                        {libraryPaths.length > 0 ? (
                          libraryPaths.map(lp => (
                            <option key={lp.id} value={lp.path}>{lp.path}</option>
                          ))
                        ) : (
                          <option value="">No library paths configured</option>
                        )}
                      </select>
                      <div className="text-xs text-slate-500 mt-1">
                        '{details.title || details.name} ({(details.release_date || details.first_air_date || '').split('-')[0]})' subfolder will be created automatically
                      </div>
                    </div>

                    {/* Monitor */}
                    <div className="text-right font-bold text-slate-300 text-sm">Monitor</div>
                    <select className="w-full bg-slate-800 border border-slate-600 rounded-md text-slate-200 px-3 py-1.5 focus:outline-none focus:border-cyan-500 text-sm">
                      <option>{mediaType === 'movie' ? 'Movie Only' : 'All Episodes'}</option>
                    </select>

                    {/* Minimum Availability */}
                    <div className="text-right font-bold text-slate-300 text-sm">Minimum Availability</div>
                    <select className="w-full bg-slate-800 border border-slate-600 rounded-md text-slate-200 px-3 py-1.5 focus:outline-none focus:border-cyan-500 text-sm">
                      <option>Released</option>
                      <option>PreDB</option>
                      <option>Physical</option>
                    </select>

                    {/* Quality Profile */}
                    <div className="text-right font-bold text-slate-300 text-sm">Quality Profile</div>
                    <select 
                      className="w-full bg-slate-800 border border-slate-600 rounded-md text-slate-200 px-3 py-1.5 focus:outline-none focus:border-cyan-500 text-sm" 
                      value={selectedProfile} 
                      onChange={e => setSelectedProfile(e.target.value)}
                    >
                      {profiles.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.name}</option>
                      ))}
                    </select>

                    {/* Tags */}
                    <div className="text-right font-bold text-slate-300 text-sm">Tags</div>
                    <input 
                      type="text" 
                      className="w-full bg-slate-800 border border-slate-600 rounded-md text-slate-200 px-3 py-1.5 focus:outline-none focus:border-cyan-500 text-sm" 
                      placeholder=""
                    />
                  </div>
                )}
                
                {/* Extra Actions */}
                <div className="mt-8 flex gap-4">
                  {isInLibrary && (
                    <button
                      onClick={() => {
                        onClose();
                        const path = mediaType === 'movie' ? `/movies/${libraryId}` : `/shows/${libraryId}`;
                        navigate(path);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer text-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      View in Library
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            {!isInLibrary && mode === 'add' && (
              <div className="p-4 border-t border-white/10 bg-slate-900 flex justify-end items-center gap-6 mt-auto">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors select-none">
                  <div className="mt-0.5">
                    <input type="checkbox" className="sr-only" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} />
                    {autoSearch ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5 text-slate-500" />}
                  </div>
                  <span className="text-sm">Start search for missing {mediaType === 'movie' ? 'movie' : 'show'}</span>
                </label>
                <button 
                  onClick={async () => {
                    try {
                      const endpoint = mediaType === 'movie' ? '/library/movies' : '/library/shows';
                      const payload = { 
                        tmdbId: details.id, 
                        qualityProfileId: parseInt(selectedProfile) || null,
                        rootFolderPath: selectedPath,
                        autoSearch 
                      };
                      const res = await api.post(endpoint, payload);
                      if (onAdded) onAdded(details.id, details);
                      onClose();
                      customAlert(`${mediaType === 'movie' ? 'Movie' : 'TV Show'} added to library successfully!`);
                      // Trigger auto-search from client side so it runs in its own request context
                      if (autoSearch && res.data?.data?.id) {
                        const searchEndpoint = mediaType === 'movie'
                          ? `/library/movies/${res.data.data.id}/auto-search`
                          : `/library/shows/${res.data.data.id}/auto-search`;
                        api.post(searchEndpoint).catch(() => {});
                      }
                    } catch (err) {
                      console.error('Add to library error:', err.response?.data || err);
                      customAlert(err.response?.data?.message || 'Failed to add to library');
                    }
                  }}
                  className="bg-green-500 hover:bg-green-400 text-slate-950 font-semibold py-2 px-6 rounded-md transition-all flex items-center justify-center text-sm shadow-sm"
                >
                  Add {mediaType === 'movie' ? 'Movie' : 'Show'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isTrailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setIsTrailerOpen(false)} />
      )}
    </div>,
    document.body
  );
}
