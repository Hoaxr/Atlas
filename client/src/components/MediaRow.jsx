import { useRef, useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export default function MediaRow({ title, items, badgeText, isTrending = false, renderMediaCard }) {
  const scrollContainerRef = useRef(null);
  const firstIdRef = useRef(null);

  // Auto-scroll to start when new items are prepended
  useEffect(() => {
    if (items && items.length > 0 && items[0].id !== firstIdRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
    firstIdRef.current = items && items.length > 0 ? items[0].id : null;
  }, [items]);

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = window.innerWidth > 768 ? 800 : 300;
      scrollContainerRef.current.scrollBy({ left: direction === 'right' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
    }
  };

  if (!items || items.length === 0) return null;
  return (
    <div className="mb-10 group/row relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-200 flex items-center space-x-2">
          <span className="bg-gradient-to-r from-orange-400 to-pink-500 text-transparent bg-clip-text">
            {title}
          </span>
          {badgeText && (
            <span className="hidden sm:inline text-xs font-normal text-slate-500 bg-slate-900 px-2 py-1 rounded-md ml-4 border border-white/5">
              {badgeText}
            </span>
          )}
        </h2>
        <div className="flex gap-2">
           <button onClick={() => scroll('left')} className="p-2 bg-slate-900/50 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors border border-white/5 backdrop-blur-sm">
             <ChevronLeft className="w-5 h-5" />
           </button>
           <button onClick={() => scroll('right')} className="p-2 bg-slate-900/50 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors border border-white/5 backdrop-blur-sm">
             <ChevronRight className="w-5 h-5" />
           </button>
        </div>
      </div>
      
      <div ref={scrollContainerRef} className="flex overflow-x-auto gap-6 snap-x snap-mandatory pb-4 hide-scrollbar">
        {items.map(item => renderMediaCard(item, isTrending, false))}
      </div>
    </div>
  );
}
