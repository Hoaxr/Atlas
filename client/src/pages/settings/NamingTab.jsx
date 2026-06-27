import { HelpCircle, CheckSquare, Square } from 'lucide-react';
import { customAlert } from '../../utils/alerts';

export default function NamingTab({ settings, setSettings, handleSave }) {
  const showMovieHelp = () => {
    customAlert('Available tags: {Movie Title}, {Release Year}, {Quality Title}, {MediaInfo VideoCodec}, {MediaInfo AudioCodec}, {MediaInfo Resolution}', 'info');
  };

  const showEpisodeHelp = () => {
    customAlert('Available tags: {Show Title}, {Season}, {Episode}, {Episode Title}, {Quality Title}, {MediaInfo VideoCodec}, {MediaInfo AudioCodec}, {MediaInfo Resolution}', 'info');
  };

  const generateMovieExample = (format) => {
    if (!format) return 'Example: ';
    let result = format;
    result = result.replace(/{Movie Title}/gi, 'The Movie Title');
    result = result.replace(/{Release Year}/gi, '2010');
    result = result.replace(/{Quality Title}/gi, '1080p WEBRip');
    result = result.replace(/{MediaInfo VideoCodec}/gi, 'x264');
    result = result.replace(/{MediaInfo AudioCodec}/gi, 'AAC');
    result = result.replace(/{MediaInfo Resolution}/gi, '1080p');
    return `Example: ${result}`;
  };

  const generateEpisodeExample = (format) => {
    if (!format) return 'Example: ';
    let result = format;
    result = result.replace(/{Show Title}/gi, 'The Show Title');
    result = result.replace(/{Season}/gi, '01');
    result = result.replace(/{Episode}/gi, '01');
    result = result.replace(/{Episode Title}/gi, 'Episode Title');
    result = result.replace(/{Quality Title}/gi, '1080p WEBRip');
    result = result.replace(/{MediaInfo VideoCodec}/gi, 'x264');
    result = result.replace(/{MediaInfo AudioCodec}/gi, 'AAC');
    result = result.replace(/{MediaInfo Resolution}/gi, '1080p');
    return `Example: ${result}`;
  };

  return (
    <div className="space-y-8">
      {/* Movie Naming Section */}
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          Movie Naming
        </h3>
        
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-1/3">
              <label className="text-sm font-medium text-slate-300">Rename Movies</label>
            </div>
            <div className="w-2/3">
              <div 
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setSettings({...settings, renameMovies: !settings.renameMovies})}
              >
                <div className="text-cyan-500">
                  {settings.renameMovies ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6 text-slate-500" />}
                </div>
                <span className="text-sm text-slate-400">Atlas will use the existing file name if renaming is disabled</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-1/3">
              <label className="text-sm font-medium text-slate-300">Replace Illegal Characters</label>
            </div>
            <div className="w-2/3">
              <div 
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setSettings({...settings, replaceIllegalCharacters: !settings.replaceIllegalCharacters})}
              >
                <div className="text-cyan-500">
                  {settings.replaceIllegalCharacters ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6 text-slate-500" />}
                </div>
                <span className="text-sm text-slate-400">Replace illegal characters. If unchecked, Atlas will remove them instead</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-1/3">
              <label className="text-sm font-medium text-slate-300">Colon Replacement</label>
            </div>
            <div className="w-2/3">
              <select 
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                value={settings.colonReplacement}
                onChange={e => setSettings({...settings, colonReplacement: e.target.value})}
              >
                <option value="delete">Delete</option>
                <option value="dash">Replace with Dash</option>
                <option value="space">Replace with Space</option>
              </select>
              <p className="text-xs text-slate-500 mt-2">Change how Atlas handles colon replacement in titles</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-1/3">
              <label className="text-sm font-medium text-slate-300">Standard Movie Format</label>
            </div>
            <div className="w-2/3">
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-slate-900/50 border border-slate-700 rounded-l-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  value={settings.standardMovieFormat || ''}
                  placeholder="{Movie Title} ({Release Year})"
                  onChange={e => setSettings({...settings, standardMovieFormat: e.target.value})}
                  disabled={!settings.renameMovies}
                />
                <button 
                  onClick={showMovieHelp}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-2 rounded-r-lg border border-cyan-500 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">{generateMovieExample(settings.standardMovieFormat)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Episode Naming Section */}
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          Episode Naming
        </h3>
        
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-1/3">
              <label className="text-sm font-medium text-slate-300">Rename Episodes</label>
            </div>
            <div className="w-2/3">
              <div 
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setSettings({...settings, renameEpisodes: !settings.renameEpisodes})}
              >
                <div className="text-cyan-500">
                  {settings.renameEpisodes ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6 text-slate-500" />}
                </div>
                <span className="text-sm text-slate-400">Atlas will use the existing file name if renaming is disabled</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-1/3">
              <label className="text-sm font-medium text-slate-300">Standard Episode Format</label>
            </div>
            <div className="w-2/3">
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-slate-900/50 border border-slate-700 rounded-l-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  value={settings.standardEpisodeFormat || ''}
                  placeholder="{Show Title} - S{Season}E{Episode} - {Episode Title}"
                  onChange={e => setSettings({...settings, standardEpisodeFormat: e.target.value})}
                  disabled={!settings.renameEpisodes}
                />
                <button 
                  onClick={showEpisodeHelp}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-2 rounded-r-lg border border-cyan-500 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">{generateEpisodeExample(settings.standardEpisodeFormat)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleSave}
          className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
        >
          Save Naming Settings
        </button>
      </div>
    </div>
  );
}
