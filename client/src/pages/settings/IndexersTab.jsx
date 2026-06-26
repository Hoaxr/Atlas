import { Plus, Trash2, FileText } from 'lucide-react';

export default function IndexersTab({ indexers, newIndexer, setNewIndexer, handleAddEntity, handleDeleteEntity }) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-purple-400 mb-2">Indexers</h2>
      <div className="bg-purple-500/10 border border-purple-500/20 text-purple-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
        <FileText className="w-5 h-5 shrink-0" />
        <p>Indexers are platforms (like ThePirateBay, 1337x, YTS) that host torrent files. Add your preferred indexers here to allow Atlas to scrape them directly.</p>
      </div>
      
      <div className="glass-panel p-8 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative overflow-hidden">
        <h3 className="font-bold text-lg text-slate-200">Add New Indexer</h3>
        
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium text-slate-400 flex items-center mr-2">Popular presets:</span>
          {['1337x', 'YTS', 'ThePirateBay', 'EZTV'].map(name => (
            <button 
              key={name}
              onClick={() => {
                let url = '';
                if (name === '1337x') url = 'https://1337x.to';
                if (name === 'YTS') url = 'https://yts.mx';
                if (name === 'ThePirateBay') url = 'https://apibay.org';
                if (name === 'EZTV') url = 'https://eztvx.to';
                setNewIndexer({...newIndexer, name, url});
              }}
              className="text-sm bg-slate-800/80 hover:bg-purple-500/20 text-slate-300 hover:text-purple-400 border border-white/5 hover:border-purple-500/30 px-4 py-1.5 rounded-full transition-all"
            >
              {name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
          <div className="md:col-span-5">
            <label className="block text-sm font-medium text-slate-400 mb-2">Name</label>
            <input type="text" placeholder="e.g. 1337x" className="glass-input w-full" value={newIndexer.name} onChange={e => setNewIndexer({...newIndexer, name: e.target.value})} />
          </div>
          <div className="md:col-span-5">
            <label className="block text-sm font-medium text-slate-400 mb-2">Base URL</label>
            <input type="text" placeholder="e.g. https://1337x.to" className="glass-input w-full" value={newIndexer.url} onChange={e => setNewIndexer({...newIndexer, url: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <button onClick={() => handleAddEntity('indexers', newIndexer)} className="w-full bg-purple-500 hover:bg-purple-400 text-white font-bold py-3 px-4 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-purple-500/20 transition-all">
              <Plus className="w-5 h-5" /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {indexers.length === 0 ? <p className="text-slate-500 italic p-4 text-center">No indexers configured yet.</p> : indexers.map(idx => (
          <div key={idx.id} className="flex justify-between items-center glass-panel p-5 rounded-2xl border border-white/5 hover:border-purple-500/30 transition-colors group shadow-lg">
            <div>
              <p className="text-base font-bold text-slate-200">{idx.name}</p>
              <p className="text-sm text-slate-500 mt-1">{idx.url}</p>
            </div>
            <button onClick={() => handleDeleteEntity('indexers', idx.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-5 h-5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
