import { useState, useEffect } from 'react';
import {
  Music2, Folder, Plus, Trash2, ShieldCheck, Check, Edit2,
  FolderTree, Save, Loader2, Sparkles, Disc, RefreshCw, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import ModalShell from '../../components/shared/ModalShell';
import ServerFolderBrowserModal from '../../components/shared/ServerFolderBrowserModal';

const FORMAT_OPTIONS = ['FLAC', 'MP3', 'AAC', 'Opus', 'ALAC', 'OGG'];

export default function MusicTab({ settings, setSettings, handleSave }) {
  // Paths
  const [musicPaths, setMusicPaths] = useState([]);
  const [newPath, setNewPath] = useState('');
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [addingPath, setAddingPath] = useState(false);

  // Quality Profiles
  const [profiles, setProfiles] = useState([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    preferred_format: 'FLAC',
    accepted_formats: ['FLAC', 'MP3'],
    min_bitrate: 0,
    cutoff_format: 'FLAC',
    upgrade_allowed: true,
  });

  // Naming preview formats
  const artistFolder = settings?.musicArtistFolderFormat || '{Artist Name}';
  const albumFolder = settings?.musicAlbumFolderFormat || '{Album Title} ({Year})';
  const trackFormat = settings?.musicTrackFileFormat || '{TrackNumber:00} - {Track Title}';
  const writeTags = settings?.writeMusicMetadata !== 'false';
  const importMode = settings?.musicImportMode || 'copy';
  const monitorNew = settings?.musicMonitorNewReleases !== 'false';

  const [savingSettings, setSavingSettings] = useState(false);

  const fetchMusicData = async () => {
    try {
      const [pathsRes, profRes] = await Promise.allSettled([
        api.get('/library/paths'),
        api.get('/library/music/quality-profiles'),
      ]);

      if (pathsRes.status === 'fulfilled' && pathsRes.value.data.status === 'success') {
        const allPaths = pathsRes.value.data.data || [];
        setMusicPaths(allPaths.filter((p) => p.type === 'music'));
      }
      if (profRes.status === 'fulfilled' && profRes.value.data.status === 'success') {
        setProfiles(profRes.value.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load music settings data:', err);
    }
  };

  useEffect(() => {
    fetchMusicData();
  }, []);

  // ── Path Handlers ─────────────────────────────────────────────────────────

  const handleAddPath = async () => {
    if (!newPath.trim()) return;
    setAddingPath(true);
    try {
      const res = await api.post('/library/paths', { path: newPath.trim(), type: 'music' });
      if (res.data.status === 'success') {
        toast.success('Music root folder added');
        setNewPath('');
        fetchMusicData();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add folder');
    } finally {
      setAddingPath(false);
    }
  };

  const handleDeletePath = async (id) => {
    try {
      await api.delete(`/library/paths/${id}`);
      toast.success('Root folder removed');
      fetchMusicData();
    } catch (err) {
      toast.error('Failed to delete path');
    }
  };

  // ── Quality Profile Handlers ──────────────────────────────────────────────

  const openNewProfileModal = () => {
    setEditingProfile(null);
    setProfileForm({
      name: '',
      preferred_format: 'FLAC',
      accepted_formats: ['FLAC', 'MP3'],
      min_bitrate: 0,
      cutoff_format: 'FLAC',
      upgrade_allowed: true,
    });
    setProfileModalOpen(true);
  };

  const openEditProfileModal = (p) => {
    setEditingProfile(p);
    let accepted = ['FLAC', 'MP3'];
    try {
      accepted = typeof p.accepted_formats === 'string' ? JSON.parse(p.accepted_formats) : p.accepted_formats;
    } catch { /* ignore */ }

    setProfileForm({
      name: p.name,
      preferred_format: p.preferred_format || 'FLAC',
      accepted_formats: accepted || ['FLAC'],
      min_bitrate: p.min_bitrate || 0,
      cutoff_format: p.cutoff_format || 'FLAC',
      upgrade_allowed: !!p.upgrade_allowed,
    });
    setProfileModalOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim()) {
      toast.error('Profile name is required');
      return;
    }

    try {
      if (editingProfile) {
        await api.put(`/library/music/quality-profiles/${editingProfile.id}`, profileForm);
        toast.success('Quality profile updated');
      } else {
        await api.post('/library/music/quality-profiles', profileForm);
        toast.success('Quality profile created');
      }
      setProfileModalOpen(false);
      fetchMusicData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save profile');
    }
  };

  const handleDeleteProfile = async (id) => {
    try {
      await api.delete(`/library/music/quality-profiles/${id}`);
      toast.success('Quality profile deleted');
      fetchMusicData();
    } catch (err) {
      toast.error('Failed to delete profile');
    }
  };

  // ── Save General Music Settings ───────────────────────────────────────────

  const saveMusicPreferences = async () => {
    setSavingSettings(true);
    try {
      const res = await api.post('/settings', {
        musicArtistFolderFormat: artistFolder,
        musicAlbumFolderFormat: albumFolder,
        musicTrackFileFormat: trackFormat,
        writeMusicMetadata: String(writeTags),
        musicImportMode: importMode,
        musicMonitorNewReleases: String(monitorNew),
      });
      if (res.data.status === 'success') {
        toast.success('Music preferences saved');
      }
    } catch (err) {
      toast.error('Failed to save preferences');
    } finally {
      setSavingSettings(false);
    }
  };

  // Live preview string
  const previewArtist = artistFolder.replace('{Artist Name}', 'Daft Punk');
  const previewAlbum = albumFolder.replace('{Album Title}', 'Random Access Memories').replace('{Year}', '2013');
  const previewTrack = trackFormat.replace('{TrackNumber:00}', '01').replace('{Track Title}', 'Give Life Back to Music') + '.flac';

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <Music2 className="w-7 h-7" /> Music Management Settings
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure root folders, audio quality profiles, file naming, and import options.
        </p>
      </div>

      {/* ── Section 1: Music Root Folders ──────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-cyan-400" /> Music Root Folders
        </h3>

        <div className="grid grid-cols-1 gap-2">
          {musicPaths.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5"
            >
              <div className="flex items-center gap-3">
                <Folder className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-mono text-slate-200">{p.path}</span>
              </div>
              <button
                onClick={() => handleDeletePath(p.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Remove root folder"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {musicPaths.length === 0 && (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-700/60 text-center text-xs text-slate-400">
              No dedicated music root folder configured. Add one below so imports know where to place audio files.
            </div>
          )}
        </div>

        {/* Add path input bar */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="/media/music"
            className="flex-1 px-4 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80"
          />
          <button
            onClick={() => setFolderBrowserOpen(true)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/5"
          >
            <Folder className="w-3.5 h-3.5" /> Browse
          </button>
          <button
            onClick={handleAddPath}
            disabled={addingPath || !newPath.trim()}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] disabled:opacity-50"
          >
            {addingPath ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Folder
          </button>
        </div>
      </div>

      <hr className="border-white/5" />

      {/* ── Section 2: Music Quality Profiles ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" /> Audio Quality Profiles
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Specify preferred audio formats (FLAC, MP3 320, etc.) and upgrade behavior.
            </p>
          </div>
          <button
            onClick={openNewProfileModal}
            className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Profile
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {profiles.map((p) => {
            let accepted = [];
            try {
              accepted = typeof p.accepted_formats === 'string' ? JSON.parse(p.accepted_formats) : p.accepted_formats;
            } catch { /* ignore */ }

            return (
              <div
                key={p.id}
                className="p-4 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-100">{p.name}</h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      {p.preferred_format}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {accepted.map((fmt) => (
                      <span key={fmt} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-slate-400">
                  <span>{p.upgrade_allowed ? 'Upgrades enabled' : 'No upgrades'}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditProfileModal(p)}
                      className="p-1 rounded text-slate-400 hover:text-cyan-400"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(p.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <hr className="border-white/5" />

      {/* ── Section 3: File & Folder Naming ────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" /> Audio Naming Templates
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Tokens: <code>{'{Artist Name}'}</code>, <code>{'{Album Title}'}</code>, <code>{'{Year}'}</code>, <code>{'{TrackNumber:00}'}</code>, <code>{'{Track Title}'}</code>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Artist Folder Format
            </label>
            <input
              type="text"
              value={artistFolder}
              onChange={(e) => setSettings((s) => ({ ...s, musicArtistFolderFormat: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500/80"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Album Folder Format
            </label>
            <input
              type="text"
              value={albumFolder}
              onChange={(e) => setSettings((s) => ({ ...s, musicAlbumFolderFormat: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500/80"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Track Filename Format
            </label>
            <input
              type="text"
              value={trackFormat}
              onChange={(e) => setSettings((s) => ({ ...s, musicTrackFileFormat: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500/80"
            />
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="p-3.5 rounded-xl bg-slate-900/40 border border-white/5 space-y-1">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Live Preview:</span>
          <p className="font-mono text-xs text-cyan-300 break-all">
            /media/music/{previewArtist}/{previewAlbum}/{previewTrack}
          </p>
        </div>
      </div>

      <hr className="border-white/5" />

      {/* ── Section 4: Import & Tagging Options ────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
          <Disc className="w-4 h-4 text-cyan-400" /> Import & Tagging Options
        </h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={writeTags}
              onChange={(e) => setSettings((s) => ({ ...s, writeMusicMetadata: String(e.target.checked) }))}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/30"
            />
            <div>
              <span className="text-xs font-semibold text-slate-200">Embed metadata tags into audio files</span>
              <p className="text-[11px] text-slate-400">Write artist, album, track, year, and cover art tags directly into FLAC / MP3 files during import.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={monitorNew}
              onChange={(e) => setSettings((s) => ({ ...s, musicMonitorNewReleases: String(e.target.checked) }))}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/30"
            />
            <div>
              <span className="text-xs font-semibold text-slate-200">Automatically monitor new releases</span>
              <p className="text-[11px] text-slate-400">When MusicBrainz detects newly released albums from your tracked artists, automatically flag them for search.</p>
            </div>
          </label>

          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Torrent Import Mode
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="radio"
                  name="musicImportMode"
                  value="copy"
                  checked={importMode === 'copy'}
                  onChange={(e) => setSettings((s) => ({ ...s, musicImportMode: e.target.value }))}
                  className="text-cyan-500 focus:ring-cyan-500/30"
                />
                Copy (recommended — preserves completed torrent seeding)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="radio"
                  name="musicImportMode"
                  value="move"
                  checked={importMode === 'move'}
                  onChange={(e) => setSettings((s) => ({ ...s, musicImportMode: e.target.value }))}
                  className="text-cyan-500 focus:ring-cyan-500/30"
                />
                Move (saves disk space, stops torrent)
              </label>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="pt-4 flex justify-end">
          <button
            onClick={saveMusicPreferences}
            disabled={savingSettings}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50"
          >
            {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Music Preferences
          </button>
        </div>
      </div>


      {/* ── Quality Profile Modal ──────────────────────────────────────────── */}
      <ModalShell
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        size="md"
        title={editingProfile ? 'Edit Audio Quality Profile' : 'New Audio Quality Profile'}
        icon={<ShieldCheck className="w-5 h-5 text-cyan-400" />}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Profile Name</label>
            <input
              type="text"
              value={profileForm.name}
              onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Lossless (FLAC)"
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Preferred Format</label>
            <select
              value={profileForm.preferred_format}
              onChange={(e) => setProfileForm((f) => ({ ...f, preferred_format: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              {FORMAT_OPTIONS.map((fmt) => (
                <option key={fmt} value={fmt}>{fmt}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">Accepted Formats</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map((fmt) => {
                const checked = profileForm.accepted_formats.includes(fmt);
                return (
                  <label
                    key={fmt}
                    onClick={() => {
                      setProfileForm((f) => ({
                        ...f,
                        accepted_formats: checked
                          ? f.accepted_formats.filter((x) => x !== fmt)
                          : [...f.accepted_formats, fmt],
                      }));
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                      checked
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                        : 'bg-slate-800/40 border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${checked ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-600'}`}>
                      {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    {fmt}
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={profileForm.upgrade_allowed}
              onChange={(e) => setProfileForm((f) => ({ ...f, upgrade_allowed: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/30"
            />
            <span className="text-xs text-slate-200">Allow automatic upgrades until cutoff is reached</span>
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setProfileModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProfile}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
            >
              Save Profile
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Server Folder Browser */}
      <ServerFolderBrowserModal
        open={folderBrowserOpen}
        onClose={() => setFolderBrowserOpen(false)}
        initialPath={newPath || '/mnt'}
        onSelect={(p) => setNewPath(p)}
      />
    </div>
  );
}
