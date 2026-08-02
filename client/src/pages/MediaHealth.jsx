import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Activity, ShieldCheck, ArrowLeft, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useStickyBar } from '../lib/useStickyBar';
import StickyBar from '../components/shared/StickyBar';

export default function MediaHealth() {
  const navigate = useNavigate();
  const { headerRef, stickyVisible } = useStickyBar();
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Expanded sections state
  const [expandedSection, setExpandedSection] = useState(null); // 'movies-missing', 'movies-unmet', etc.

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await api.get('/library/health');
      if (res.data.status === 'success') {
        setHealthData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch media health', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const { movies, episodes } = healthData || { movies: {}, episodes: {} };
  
  const movieCounts = {
    missing: (movies.missing || []).length,
    cutoffUnmet: (movies.cutoffUnmet || []).length,
    cutoffMet: (movies.cutoffMet || []).length
  };
  const epCounts = {
    missing: (episodes.missing || []).length,
    cutoffUnmet: (episodes.cutoffUnmet || []).length,
    cutoffMet: (episodes.cutoffMet || []).length
  };

  const totalMovies = movieCounts.cutoffMet + movieCounts.cutoffUnmet + movieCounts.missing;
  const totalEps = epCounts.cutoffMet + epCounts.cutoffUnmet + epCounts.missing;

  const movieHealthScore = totalMovies > 0 ? Math.round((movieCounts.cutoffMet / totalMovies) * 100) : 0;
  const epHealthScore = totalEps > 0 ? Math.round((epCounts.cutoffMet / totalEps) * 100) : 0;

  const HealthList = ({ items, emptyMessage, type, color }) => {
    if (items.length === 0) {
      return (
        <div className="p-4 text-center text-slate-500 text-sm border-t border-slate-700/50 bg-slate-900/30 rounded-b-xl">
          {emptyMessage}
        </div>
      );
    }

    const colorClasses = {
      emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      slate: 'bg-slate-800 text-slate-300 border-slate-700'
    };

    return (
      <div className="border-t border-slate-700/50 bg-slate-900/50 rounded-b-xl overflow-hidden">
        <ul className="divide-y divide-slate-800/50 max-h-96 overflow-y-auto">
          {items.map(item => (
            <li key={item.id} className="p-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
              <div className="min-w-0 flex-1 pr-4">
                <button 
                  onClick={() => navigate(type === 'movie' ? `/movies/${item.id}` : `/shows/${item.show_id}`)}
                  className="font-medium text-slate-200 truncate hover:text-emerald-400 hover:underline text-left block w-full transition-colors" 
                  title={item.title}
                >
                  {item.title}
                </button>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  {item.currentQuality && (
                    <span className={`px-2 py-0.5 rounded border ${colorClasses.slate}`}>
                      Current: {item.currentQuality}
                    </span>
                  )}
                  {item.cutoff && (
                    <span className={`px-2 py-0.5 rounded border ${colorClasses[color]}`}>
                      Wanted: {item.cutoff}
                    </span>
                  )}
                </div>
              </div>
              <button 
                onClick={() => navigate(type === 'movie' ? `/movies/${item.id}` : `/shows/${item.show_id}`)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors shrink-0"
                title="View details"
              >
                <Search className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-12">
      <StickyBar isVisible={stickyVisible}>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h1 className="font-semibold text-slate-200">Media Health</h1>
        </div>
      </StickyBar>
      <div ref={headerRef} className="pt-2">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Activity className="w-6 h-6 text-emerald-400" />
          Media Health Dashboard
        </h1>
        <p className="text-slate-400 mt-1">Self-healing status and library completeness</p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/stats')} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Movies */}
        <div className="glass-panel rounded-2xl p-6 border border-emerald-500/10">
          <h2 className="text-xl font-bold text-slate-200 mb-6 flex items-center gap-2">
            Movies Health
          </h2>
          
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-1">
              <div className="text-4xl font-black text-emerald-400">{movieHealthScore}%</div>
              <div className="text-sm text-slate-400 uppercase tracking-widest font-semibold">Perfect Score</div>
            </div>
            <ShieldCheck className="w-12 h-12 text-emerald-500/30" />
          </div>

          <div className="space-y-3">
            {/* Cutoff Met */}
            <div className="bg-slate-800/40 rounded-xl border border-white/5">
              <button 
                onClick={() => toggleSection('movies-met')}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <span className="text-slate-300 font-medium flex items-center gap-2">
                    Cutoff Met
                    {movieCounts.cutoffMet > 0 && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">{movieCounts.cutoffMet}</span>}
                  </span>
                </div>
                {expandedSection === 'movies-met' ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {expandedSection === 'movies-met' && (
                <HealthList items={movies.cutoffMet || []} emptyMessage="No movies have met their cutoff profile." type="movie" color="emerald" />
              )}
            </div>
            
            {/* Upgradable */}
            <div className="bg-slate-800/40 rounded-xl border border-white/5">
              <button 
                onClick={() => toggleSection('movies-unmet')}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  <span className="text-slate-300 font-medium flex items-center gap-2">
                    Upgradable (Cutoff Unmet)
                    {movieCounts.cutoffUnmet > 0 && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">{movieCounts.cutoffUnmet}</span>}
                  </span>
                </div>
                {expandedSection === 'movies-unmet' ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {expandedSection === 'movies-unmet' && (
                <HealthList items={movies.cutoffUnmet || []} emptyMessage="All downloaded movies meet their cutoff!" type="movie" color="amber" />
              )}
            </div>

            {/* Missing */}
            <div className="bg-slate-800/40 rounded-xl border border-white/5">
              <button 
                onClick={() => toggleSection('movies-missing')}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-rose-400"></div>
                  <span className="text-slate-300 font-medium flex items-center gap-2">
                    Missing Files
                    {movieCounts.missing > 0 && <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">{movieCounts.missing}</span>}
                  </span>
                </div>
                {expandedSection === 'movies-missing' ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {expandedSection === 'movies-missing' && (
                <HealthList items={movies.missing || []} emptyMessage="No movies are missing files." type="movie" color="rose" />
              )}
            </div>
          </div>
        </div>

        {/* TV Shows */}
        <div className="glass-panel rounded-2xl p-6 border border-purple-500/10">
          <h2 className="text-xl font-bold text-slate-200 mb-6 flex items-center gap-2">
            TV Shows Health (Episodes)
          </h2>
          
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-1">
              <div className="text-4xl font-black text-purple-400">{epHealthScore}%</div>
              <div className="text-sm text-slate-400 uppercase tracking-widest font-semibold">Perfect Score</div>
            </div>
            <ShieldCheck className="w-12 h-12 text-purple-500/30" />
          </div>

          <div className="space-y-3">
            {/* Cutoff Met */}
            <div className="bg-slate-800/40 rounded-xl border border-white/5">
              <button 
                onClick={() => toggleSection('eps-met')}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                  <span className="text-slate-300 font-medium flex items-center gap-2">
                    Cutoff Met
                    {epCounts.cutoffMet > 0 && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">{epCounts.cutoffMet}</span>}
                  </span>
                </div>
                {expandedSection === 'eps-met' ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {expandedSection === 'eps-met' && (
                <HealthList items={episodes.cutoffMet || []} emptyMessage="No episodes have met their cutoff profile." type="episode" color="purple" />
              )}
            </div>
            
            {/* Upgradable */}
            <div className="bg-slate-800/40 rounded-xl border border-white/5">
              <button 
                onClick={() => toggleSection('eps-unmet')}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  <span className="text-slate-300 font-medium flex items-center gap-2">
                    Upgradable (Cutoff Unmet)
                    {epCounts.cutoffUnmet > 0 && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">{epCounts.cutoffUnmet}</span>}
                  </span>
                </div>
                {expandedSection === 'eps-unmet' ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {expandedSection === 'eps-unmet' && (
                <HealthList items={episodes.cutoffUnmet || []} emptyMessage="All downloaded episodes meet their cutoff!" type="episode" color="amber" />
              )}
            </div>

            {/* Missing */}
            <div className="bg-slate-800/40 rounded-xl border border-white/5">
              <button 
                onClick={() => toggleSection('eps-missing')}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-rose-400"></div>
                  <span className="text-slate-300 font-medium flex items-center gap-2">
                    Missing Files
                    {epCounts.missing > 0 && <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">{epCounts.missing}</span>}
                  </span>
                </div>
                {expandedSection === 'eps-missing' ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {expandedSection === 'eps-missing' && (
                <HealthList items={episodes.missing || []} emptyMessage="No episodes are missing files." type="episode" color="rose" />
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
