import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, CheckSquare, Square, FileText, X, Tag, Save, Film, Tv, Music } from 'lucide-react';
import CustomSelect from '../../components/shared/CustomSelect';
import { SettingsSection, SettingsHeader, SettingsGroup, SettingsLabel, SettingsHelper } from '../../components/settings/layout';
import ToggleRow from '../../components/shared/ToggleRow';

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
          {tags.map((tag) => (
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

export default function NamingTab({ settings, setSettings }) {
  const [modalType, setModalType] = useState(null);

  const previewShow = 'Breaking Bad';

  // Fills both the server's vocabulary ({Show Title}/{Season}/{Episode}) and the newer
  // template style ({Series Title}/{season:00}/{episode:00}) so previews always render.
  const fillTvTags = (format, fallback) => (format || fallback)
    .replace(/{Show Title}/gi, previewShow)
    .replace(/{Series Title}/gi, previewShow)
    .replace(/{season:00}/gi, '01')
    .replace(/{Season}/gi, '01')
    .replace(/{Season Number}/gi, '1')
    .replace(/{episode:00}/gi, '01')
    .replace(/{Episode}/gi, '01')
    .replace(/{Episode Title}/gi, 'Pilot')
    .replace(/{Release Year}/gi, '2008');

  const showMovieHelp = () => {
    setModalType('movie');
  };

  const showTvHelp = () => {
    setModalType('episode');
  };

  const showAudioHelp = () => {
    setModalType('audio');
  };



  const previewMovieName = (settings?.standardMovieFormat || '{Movie Title} ({Release Year})')
    .replace(/{Movie Title}/gi, 'Inception')
    .replace(/{Release Year}/gi, '2010');
  const previewMoviePath = `/media/movies/${previewMovieName}/${previewMovieName}.mkv`;

  const previewSeasonFolder = fillTvTags(settings?.seasonFolderFormat, 'Season {Season Number}');
  const previewEpisodeFile = fillTvTags(settings?.standardEpisodeFormat, '{Show Title} - S{Season}E{Episode} - {Episode Title}');
  const previewSeriesFolder = fillTvTags(settings?.seriesFolderFormat, previewShow);
  const previewTvPath = `/media/tv/${previewSeriesFolder}/${previewSeasonFolder}/${previewEpisodeFile}.mkv`;

  const previewArtist = (settings?.musicArtistFolderFormat || '{Artist Name}').replace(/{Artist Name}/gi, 'Daft Punk');
  const previewAlbum = (settings?.musicAlbumFolderFormat || '{Album Title} ({Year})')
    .replace(/{Album Title}/gi, 'Random Access Memories')
    .replace(/{Year}/gi, '2013');
  const previewTrack = (settings?.musicTrackFileFormat || '{TrackNumber:00} - {Track Title}')
    .replace(/{TrackNumber:00}/gi, '01')
    .replace(/{TrackNumber}/gi, '1')
    .replace(/{Track Title}/gi, 'Give Life Back to Music') + '.flac';

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
          <FileText className="w-5 h-5 text-cyan-400 shrink-0" /> Media Naming
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Configure how Atlas renames and organizes your media files using custom format tags.
        </p>
      </div>

      {/* Movie Naming Section */}
      <SettingsSection>
        <SettingsHeader
          title="Movie Naming"
          icon={Film}
          description="Configure how Atlas renames your movie files using custom format tags."
        />
        
        <div className="space-y-4">
          <ToggleRow
            checked={settings.renameMovies}
            onChange={() => setSettings({...settings, renameMovies: !settings.renameMovies})}
            title="Rename Movies"
            description="Atlas will use the existing file name if renaming is disabled"
          />

          <ToggleRow
            checked={settings.replaceIllegalCharacters}
            onChange={() => setSettings({...settings, replaceIllegalCharacters: !settings.replaceIllegalCharacters})}
            title="Replace Illegal Characters"
            description="Replace illegal characters. If unchecked, Atlas will remove them instead"
          />

          <SettingsGroup>
            <div>
              <SettingsLabel title="Colon Replacement" />
              <CustomSelect 
                value={settings.colonReplacement}
                onChange={e => setSettings({...settings, colonReplacement: e.target.value})}
                options={[
                  { label: 'Delete', value: 'delete' },
                  { label: 'Replace with Dash', value: 'dash' },
                  { label: 'Replace with Space', value: 'space' }
                ]}
              />
              <SettingsHelper text="Change how Atlas handles colon replacement in titles" />
            </div>

            <div>
              <SettingsLabel title="Standard Movie Format" />
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-[#0c1624] border border-[#1c2d46] rounded-l-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-600 font-mono"
                  value={settings.standardMovieFormat || ''}
                  placeholder="{Movie Title} ({Release Year})"
                  onChange={e => setSettings({...settings, standardMovieFormat: e.target.value})}
                  disabled={!settings.renameMovies}
                />
                <button 
                  onClick={showMovieHelp}
                  className="bg-[#1c2d46] hover:bg-[#274063] text-slate-300 px-4 py-2.5 rounded-r-xl border border-[#1c2d46] border-l-0 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          </SettingsGroup>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Live Preview:</span>
            <p className="font-mono text-xs text-cyan-300 break-all">
              {previewMoviePath}
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* TV Naming Section */}
      <SettingsSection>
        <SettingsHeader
          title="Episode Naming"
          icon={Tv}
          description="Configure how Atlas renames your TV episode files using custom format tags."
        />
        
        <div className="space-y-4">
          <ToggleRow
            checked={settings.renameEpisodes}
            onChange={() => setSettings({...settings, renameEpisodes: !settings.renameEpisodes})}
            title="Rename Episodes"
            description="Atlas will use the existing file name if renaming is disabled"
          />

          <ToggleRow
            checked={settings.replaceIllegalCharacters}
            onChange={() => setSettings({...settings, replaceIllegalCharacters: !settings.replaceIllegalCharacters})}
            title="Replace Illegal Characters"
            description="Replace illegal characters. If unchecked, Atlas will remove them instead"
          />

          <SettingsGroup>
            <div>
              <SettingsLabel title="Colon Replacement" />
              <CustomSelect 
                value={settings.colonReplacement}
                onChange={e => setSettings({...settings, colonReplacement: e.target.value})}
                options={[
                  { label: 'Delete', value: 'delete' },
                  { label: 'Replace with Dash', value: 'dash' },
                  { label: 'Replace with Space', value: 'space' }
                ]}
              />
              <SettingsHelper text="Change how Atlas handles colon replacement in titles" />
            </div>

            <div>
              <SettingsLabel title="Standard Episode Format" />
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-[#0c1624] border border-[#1c2d46] rounded-l-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-600 font-mono"
                  value={settings.standardEpisodeFormat || ''}
                  placeholder="{Show Title} - S{Season}E{Episode} - {Episode Title}"
                  onChange={e => setSettings({...settings, standardEpisodeFormat: e.target.value})}
                  disabled={!settings.renameEpisodes}
                />
                <button 
                  onClick={showTvHelp}
                  className="bg-[#1c2d46] hover:bg-[#274063] text-slate-300 px-4 py-2.5 rounded-r-xl border border-[#1c2d46] border-l-0 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <SettingsLabel title="Series Folder Format" />
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-[#0c1624] border border-[#1c2d46] rounded-l-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                  value={settings.seriesFolderFormat || ''}
                  placeholder="{Show Title} ({Release Year})"
                  onChange={e => setSettings({...settings, seriesFolderFormat: e.target.value})}
                />
                <button 
                  onClick={showTvHelp}
                  className="bg-[#1c2d46] hover:bg-[#274063] text-slate-300 px-4 py-2.5 rounded-r-xl border border-[#1c2d46] border-l-0 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          </SettingsGroup>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Live Preview:</span>
            <p className="font-mono text-xs text-cyan-300 break-all">
              {previewTvPath}
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Audio Naming Section */}
      <SettingsSection>
        <SettingsHeader
          title="Audio Naming"
          icon={Music}
          description="Configure how Atlas formats and organizes your music library files."
        />
        
        <div className="space-y-4">
          <SettingsGroup>
            <div>
              <SettingsLabel title="Artist Folder Format" />
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-[#0c1624] border border-[#1c2d46] rounded-l-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                  value={settings.musicArtistFolderFormat || ''}
                  placeholder="{Artist Name}"
                  onChange={e => setSettings({...settings, musicArtistFolderFormat: e.target.value})}
                />
                <button 
                  onClick={showAudioHelp}
                  className="bg-[#1c2d46] hover:bg-[#274063] text-slate-300 px-4 py-2.5 rounded-r-xl border border-[#1c2d46] border-l-0 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <SettingsLabel title="Album Folder Format" />
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-[#0c1624] border border-[#1c2d46] rounded-l-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                  value={settings.musicAlbumFolderFormat || ''}
                  placeholder="{Album Title} ({Year})"
                  onChange={e => setSettings({...settings, musicAlbumFolderFormat: e.target.value})}
                />
                <button 
                  onClick={showAudioHelp}
                  className="bg-[#1c2d46] hover:bg-[#274063] text-slate-300 px-4 py-2.5 rounded-r-xl border border-[#1c2d46] border-l-0 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <SettingsLabel title="Track Format" />
              <div className="flex">
                <input 
                  type="text"
                  className="flex-1 bg-[#0c1624] border border-[#1c2d46] rounded-l-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                  value={settings.musicTrackFileFormat || ''}
                  placeholder="{TrackNumber:00} - {Track Title}"
                  onChange={e => setSettings({...settings, musicTrackFileFormat: e.target.value})}
                />
                <button 
                  onClick={showAudioHelp}
                  className="bg-[#1c2d46] hover:bg-[#274063] text-slate-300 px-4 py-2.5 rounded-r-xl border border-[#1c2d46] border-l-0 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          </SettingsGroup>

          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Live Preview:</span>
            <p className="font-mono text-xs text-cyan-300 break-all">
              /media/music/{previewArtist}/{previewAlbum}/{previewTrack}
            </p>
          </div>
        </div>
      </SettingsSection>



      {modalType === 'movie' && (
        <TagsModal 
          title="Movie Naming Tags" 
          tags={[
            { name: '{Movie Title}', desc: 'Title of the movie' },
            { name: '{Release Year}', desc: 'Release year' }
          ]}
          onClose={() => setModalType(null)}
        />
      )}

      {modalType === 'episode' && (
        <TagsModal
          title="Episode Naming Tags"
          tags={[
            { name: '{Show Title}', desc: 'Title of the show' },
            { name: '{Release Year}', desc: 'Release year of the show' },
            { name: '{Season}', desc: 'Padded (e.g. 02)' },
            { name: '{Season Number}', desc: 'Unpadded (e.g. 2)' },
            { name: '{Episode}', desc: 'Episode number' },
            { name: '{Episode Title}', desc: 'Title of the episode' }
          ]}
          onClose={() => setModalType(null)}
        />
      )}

      {modalType === 'audio' && (
        <TagsModal
          title="Audio Naming Tags"
          tags={[
            { name: '{Artist Name}', desc: 'Artist or band name' },
            { name: '{Album Title}', desc: 'Album release title' },
            { name: '{Year}', desc: 'Album release year' },
            { name: '{TrackNumber:00}', desc: 'Two-digit padded track number (e.g. 01)' },
            { name: '{TrackNumber}', desc: 'Unpadded track number (e.g. 1)' },
            { name: '{Track Title}', desc: 'Track / song title' }
          ]}
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  );
}
