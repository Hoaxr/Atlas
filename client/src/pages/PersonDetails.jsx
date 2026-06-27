import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Film, Tv, Star, User, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import api from '../lib/api';

const IMG_BASE = 'https://image.tmdb.org/t/p/';

export default function PersonDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('acting'); // 'acting' | 'directing'
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/tmdb/person/${id}`)
      .then(res => { if (res.data.status === 'success') setPerson(res.data.data); })
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="text-center py-24 text-slate-500">
        <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p>Person not found or TMDB key not configured.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-cyan-400 hover:underline text-sm">← Go back</button>
      </div>
    );
  }

  const credits = person.combined_credits || {};
  const castCredits = (credits.cast || [])
    .filter(c => c.media_type === 'movie' || c.media_type === 'tv')
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

  const directorCredits = (credits.crew || [])
    .filter(c => c.job === 'Director')
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

  const displayed = tab === 'acting' ? castCredits : directorCredits;
  const bio = person.biography || '';
  const bioLines = bio.split('\n\n').filter(Boolean);
  const bioPreview = bioLines.slice(0, 2).join('\n\n');
  const hasBioMore = bioLines.length > 2;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Hero */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {person.profile_path ? (
          <img
            src={`${IMG_BASE}w342${person.profile_path}`}
            alt={person.name}
            className="w-36 h-52 object-cover rounded-2xl shrink-0 shadow-2xl ring-1 ring-white/10"
          />
        ) : (
          <div className="w-36 h-52 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0">
            <User className="w-12 h-12 text-slate-600" />
          </div>
        )}

        <div className="space-y-3 flex-1">
          <h1 className="text-3xl font-black text-white">{person.name}</h1>

          <div className="flex flex-wrap gap-2 text-sm">
            {person.known_for_department && (
              <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-0.5 rounded-full font-medium">
                {person.known_for_department}
              </span>
            )}
            {person.birthday && (
              <span className="text-slate-400">Born {new Date(person.birthday).getFullYear()}</span>
            )}
            {person.place_of_birth && (
              <span className="text-slate-500">· {person.place_of_birth}</span>
            )}
          </div>

          {bio && (
            <div className="text-slate-400 text-sm leading-relaxed max-w-2xl">
              {expanded ? bio : bioPreview}
              {hasBioMore && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="ml-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          <a
            href={`https://www.themoviedb.org/person/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> View on TMDB
          </a>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        {[
          { key: 'acting',    label: `Acting (${castCredits.length})`,     icon: Film },
          { key: 'directing', label: `Directing (${directorCredits.length})`, icon: Star },
        ].map(({ key, label, icon: Icon }) => (
          directorCredits.length > 0 || key === 'acting' ? (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === key
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-white/10'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ) : null
        ))}
      </div>

      {/* Credits grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {displayed.map((credit) => {
          const isMovie = credit.media_type === 'movie';
          const title = isMovie ? credit.title : credit.name;
          const year = (isMovie ? credit.release_date : credit.first_air_date || '').slice(0, 4);
          const detailPath = isMovie ? `/movies/${credit.id}` : `/shows/${credit.id}`;

          return (
            <Link
              key={`${credit.id}-${credit.credit_id}`}
              to={detailPath}
              className="group block rounded-xl overflow-hidden bg-slate-900/60 border border-white/5 hover:border-white/15 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="relative aspect-[2/3] bg-slate-800">
                {credit.poster_path ? (
                  <img
                    src={`${IMG_BASE}w342${credit.poster_path}`}
                    alt={title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isMovie ? <Film className="w-8 h-8 text-slate-600" /> : <Tv className="w-8 h-8 text-slate-600" />}
                  </div>
                )}

                {/* In library badge */}
                {credit.inLibrary && (
                  <div className="absolute top-1.5 right-1.5 bg-emerald-500 rounded-full p-0.5 shadow-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                {/* Type indicator */}
                <div className="absolute bottom-1.5 left-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isMovie ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'}`}>
                    {isMovie ? 'Movie' : 'Show'}
                  </span>
                </div>
              </div>

              <div className="p-2.5">
                <p className="text-xs font-semibold text-slate-200 truncate leading-tight">{title}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-slate-500">{year || '—'}</span>
                  {credit.vote_average > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-amber-400">
                      <Star className="w-2.5 h-2.5 fill-amber-400" />
                      {credit.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>
                {credit.character && (
                  <p className="text-[11px] text-slate-600 truncate mt-0.5">as {credit.character}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {displayed.length === 0 && (
        <div className="text-center py-12 text-slate-500">No credits available.</div>
      )}
    </div>
  );
}
