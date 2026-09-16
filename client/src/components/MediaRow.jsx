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
        <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-3">
          <span className="w-1.5 h-5 bg-sky-400 rounded-full shrink-0" />
          <span className="text-slate-100 font-bold font-display tracking-tight text-xl">
            {title}
          </span>
          {badgeText && (
            <span className="hidden sm:inline-flex items-center text-[11px] font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 rounded-full">
              {badgeText}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
           <button
             onClick={() => scroll('left')}
             className="w-8 h-8 rounded-full flex items-center justify-center bg-[#101e31] hover:bg-[#16273f] text-slate-100 hover:text-white transition-colors border border-[#1c2d46] hover:border-slate-600 shadow-sm"
             aria-label="Scroll left"
           >
             <ChevronLeft className="w-4 h-4" />
           </button>
           <button
             onClick={() => scroll('right')}
             className="w-8 h-8 rounded-full flex items-center justify-center bg-[#101e31] hover:bg-[#16273f] text-slate-100 hover:text-white transition-colors border border-[#1c2d46] hover:border-slate-600 shadow-sm"
             aria-label="Scroll right"
           >
             <ChevronRight className="w-4 h-4" />
           </button>
        </div>
      </div>
      
      <div ref={scrollContainerRef} className="flex overflow-x-auto gap-6 snap-x snap-mandatory pb-4 hide-scrollbar">
        {items.map(item => renderMediaCard(item, isTrending, false))}
      </div>
    </div>
  );
}
