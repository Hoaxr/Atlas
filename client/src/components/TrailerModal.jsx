import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function TrailerModal({ trailerKey, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!trailerKey) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md" onClick={onClose}>
      <div className="relative w-full max-w-5xl" role="dialog" aria-modal="true" aria-label="Movie trailer" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-4">
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors bg-slate-900/50 p-2 rounded-full border border-white/10 hover:bg-slate-800"
            aria-label="Close trailer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10">
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          ></iframe>
        </div>
      </div>
    </div>,
    document.body
  );
}
