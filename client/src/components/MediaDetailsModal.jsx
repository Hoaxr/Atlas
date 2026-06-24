import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Star, Calendar, Clock, Plus, ExternalLink, PlayCircle } from 'lucide-react';
import { customAlert } from '../utils/alerts';
import TrailerModal from './TrailerModal';

export default function MediaDetailsModal({ isOpen, onClose, mediaId, mediaType }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  useEffect(() => {
    if (isOpen && mediaId) {
      fetchDetails();
      fetchProfiles();
    } else {
      setDetails(null);
    }
  }, [isOpen, mediaId]);

  const fetchProfiles = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/settings');
      if (res.data.status === 'success' && res.data.data.profiles) {
        setProfiles(res.data.data.profiles);
        if (res.data.data.profiles.length > 0) {
          setSelectedProfile(res.data.data.profiles[0].id);
        }
      }
    } catch(e) {}
  };

  const fetchDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`http://localhost:3000/api/tmdb/${mediaType}/${mediaId}?_t=${Date.now()}`);
      if (res.data.status === 'success') {
        setDetails(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative shadow-2xl">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 bg-slate-950/50 hover:bg-slate-800 text-slate-300 hover:text-white p-2 rounded-full backdrop-blur transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

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
          <div className="relative">
            {/* Backdrop Image */}
            <div className="w-full h-64 md:h-80 relative bg-slate-800">
              {details.backdrop_path ? (
                <>
                  <img 
                    src={`https://image.tmdb.org/t/p/original${details.backdrop_path}`} 
                    alt="Backdrop" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>
                </>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
              )}
            </div>

            <div className="px-6 pb-8 -mt-20 relative z-10 flex flex-col md:flex-row gap-6">
              {/* Poster */}
              <div className="w-40 md:w-56 shrink-0 mx-auto md:mx-0 shadow-2xl rounded-xl overflow-hidden border border-white/10 bg-slate-800 aspect-[2/3]">
                {details.poster_path ? (
                  <img 
                    src={`https://image.tmdb.org/t/p/w500${details.poster_path}`} 
                    alt="Poster" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500">No Image</div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 mt-4 md:mt-16 text-center md:text-left">
                <h2 className="text-3xl md:text-4xl font-black text-white mb-2">
                  {details.title || details.name}
                </h2>
                
                <p className="text-slate-400 italic text-lg mb-4">
                  {details.tagline}
                </p>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-6 text-sm text-slate-300 font-medium">
                  {details.vote_average > 0 && (
                    <div className="flex items-center gap-1 bg-slate-800/80 px-3 py-1 rounded-lg border border-white/5">
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span>{details.vote_average.toFixed(1)}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1 bg-slate-800/80 px-3 py-1 rounded-lg border border-white/5">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    <span>{(details.release_date || details.first_air_date || '').split('-')[0]}</span>
                  </div>

                  {(details.runtime || (details.episode_run_time && details.episode_run_time[0])) && (
                    <div className="flex items-center gap-1 bg-slate-800/80 px-3 py-1 rounded-lg border border-white/5">
                      <Clock className="w-4 h-4 text-purple-400" />
                      <span>{details.runtime || details.episode_run_time[0]} min</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {details.genres?.slice(0, 3).map(g => (
                      <span key={g.id} className="bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                        {g.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-bold text-slate-200 mb-2 border-b border-white/10 pb-2">Overview</h3>
                  <p className="text-slate-400 leading-relaxed text-sm md:text-base">
                    {details.overview || 'No overview available.'}
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Quality Profile</label>
                    <select 
                      className="glass-input w-full md:w-64" 
                      value={selectedProfile} 
                      onChange={e => setSelectedProfile(e.target.value)}
                    >
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={async () => {
                        try {
                          const endpoint = mediaType === 'movie' ? '/api/library/movies' : '/api/library/shows';
                          const payload = { tmdbId: details.id, qualityProfileId: parseInt(selectedProfile) || null };
                          await axios.post(`http://localhost:3000${endpoint}`, payload);
                          onClose();
                          customAlert(`${mediaType === 'movie' ? 'Movie' : 'TV Show'} added to library successfully!`);
                        } catch (err) {
                          console.error('Add to library error:', err.response?.data || err);
                          customAlert(err.response?.data?.message || 'Failed to add to library');
                        }
                      }}
                      className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 hover:scale-105"
                    >
                      <Plus className="w-5 h-5" />
                      Add {mediaType === 'movie' ? 'Movie' : 'TV Show'} to Library
                  </button>
                  {(() => {
                    const trailer = details.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer');
                    return trailer ? (
                      <button 
                        onClick={() => {
                          setTrailerKey(trailer.key);
                          setIsTrailerOpen(true);
                        }}
                        className="bg-red-500/20 hover:bg-red-500/30 text-red-500 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] border border-red-500/30"
                      >
                        <PlayCircle className="w-5 h-5" /> Trailer
                      </button>
                    ) : null;
                  })()}
                  {details.homepage && (
                    <a 
                      href={details.homepage} 
                      target="_blank" 
                      rel="noreferrer"
                      className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] border border-white/5"
                    >
                      <ExternalLink className="w-5 h-5" /> Website
                    </a>
                  )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isTrailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setIsTrailerOpen(false)} />
      )}
    </div>
  );
}
