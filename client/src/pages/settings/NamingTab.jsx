import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, CheckSquare, Square, FileText, X, Tag, Save } from 'lucide-react';
import CustomSelect from '../../components/shared/CustomSelect';

const TagsModal = ({ title, tags, onClose }) => {
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      <div
        className="relative z-10 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Tag className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {tags.map((tag, idx) => (
            <li key={tag.name} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm bg-slate-800/50 border border-white/5 rounded-lg p-3">
              <span className="text-cyan-400 font-mono">{tag.name}</span>
              {tag.desc && <span className="text-slate-400 sm:ml-auto">{tag.desc}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
};

export default function NamingTab({ settings, setSettings, handleSave }) {
  const [modalType, setModalType] = useState(null);

  const showMovieHelp = () => {
    setModalType('movie');
  };

  const showEpisodeHelp = () => {
    setModalType('episode');
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

  const generateSeasonFolderExample = (format) => {
    if (!format) return 'Example: ';
    let result = format;
    result = result.replace(/{Show Title}/gi, 'The Show Title');
    result = result.replace(/{Season}/gi, '02');
    result = result.replace(/{Season Number}/gi, '2');
    return `Example: ${result}`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-orange-400 flex items-center gap-2">
          <FileText className="w-7 h-7" /> Media Naming
        </h2>
      </div>

      {/* Movie Naming Section */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-6 shadow-xl relative overflow-hidden">
        <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          Movie Naming
        </h3>
        <p className="text-xs text-slate-500">Configure how Atlas renames your movie files using custom format tags.</p>
        
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
              <CustomSelect 
                value={settings.colonReplacement}
                onChange={e => setSettings({...settings, colonReplacement: e.target.value})}
                options={[
                  { label: 'Delete', value: 'delete' },
                  { label: 'Replace with Dash', value: 'dash' },
                  { label: 'Replace with Space', value: 'space' }
                ]}
              />
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

      {/* TV Naming Section */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-6 shadow-xl relative overflow-hidden mt-8">
        <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          Episode Naming
        </h3>
        <p className="text-xs text-slate-500">Configure how Atlas renames your TV episode files using custom format tags.</p>
        
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

          <div className="flex items-start gap-4">
            <div className="w-1/3">
              <label className="text-sm font-medium text-slate-300">Season Folder Format</label>
            </div>
            <div className="w-2/3">
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-slate-900/50 border border-slate-700 rounded-l-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  value={settings.seasonFolderFormat || ''}
                  placeholder="Season {Season Number}"
                  onChange={e => setSettings({...settings, seasonFolderFormat: e.target.value})}
                />
                <button 
                  onClick={showEpisodeHelp}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-2 rounded-r-lg border border-cyan-500 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">{generateSeasonFolderExample(settings.seasonFolderFormat || 'Season {Season Number}')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all">
          <Save className="w-5 h-5" /> Save Changes
        </button>
      </div>

      {modalType === 'movie' && (
        <TagsModal 
          title="Movie Naming Tags" 
          tags={[
            { name: '{Movie Title}', desc: 'Title of the movie' },
            { name: '{Release Year}', desc: 'Release year' },
            { name: '{Quality Title}', desc: 'e.g. 1080p WEBRip' },
            { name: '{MediaInfo VideoCodec}', desc: 'e.g. x264' },
            { name: '{MediaInfo AudioCodec}', desc: 'e.g. AAC' },
            { name: '{MediaInfo Resolution}', desc: 'e.g. 1080p' }
          ]}
          onClose={() => setModalType(null)}
        />
      )}

      {modalType === 'episode' && (
        <TagsModal 
          title="Episode Naming Tags" 
          tags={[
            { name: '{Show Title}', desc: 'Title of the show' },
            { name: '{Season}', desc: 'Padded (e.g. 02)' },
            { name: '{Season Number}', desc: 'Unpadded (e.g. 2)' },
            { name: '{Episode}', desc: 'Episode number' },
            { name: '{Episode Title}', desc: 'Title of the episode' },
            { name: '{Quality Title}', desc: 'e.g. 1080p WEBRip' },
            { name: '{MediaInfo VideoCodec}', desc: 'e.g. x264' },
            { name: '{MediaInfo AudioCodec}', desc: 'e.g. AAC' },
            { name: '{MediaInfo Resolution}', desc: 'e.g. 1080p' }
          ]}
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  );
}
