import { Link } from 'react-router-dom';

export default function ShowCastList({ credits }) {
  const castList = credits?.cast?.slice(0, 5) || [];
  if (castList.length === 0) return null;

  return (
    <div className="py-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2.5">Cast</span>
      <div className="flex gap-6 overflow-x-auto pb-1">
        {castList.map((person) => (
          <Link
            key={person.credit_id}
            to={`/person/${person.id}`}
            className="shrink-0 flex flex-col items-center gap-2 group"
          >
            <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-700 ring-2 ring-white/10 group-hover:ring-purple-500/40 transition-all shadow-md">
              {person.profile_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                  alt={person.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-300 group-hover:text-purple-400 text-center leading-tight whitespace-nowrap transition-colors">
              {person.name}
            </p>
            {person.character && (
              <p className="text-[11px] text-slate-500 text-center leading-tight truncate max-w-[96px]">
                {person.character}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
