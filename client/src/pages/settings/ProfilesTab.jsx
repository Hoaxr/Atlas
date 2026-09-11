import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Save, Plus, Trash2, Settings2, CheckCircle2, Star, CheckSquare, Square, Film, Music2 } from 'lucide-react';
import { customAlert } from '../../utils/alerts';
import CustomSelect from '../../components/shared/CustomSelect';

const AUDIO_FORMAT_OPTIONS = ['FLAC', 'MP3', 'AAC', 'Opus', 'ALAC', 'OGG'];

export default function ProfilesTab({ profiles, newProfile, setNewProfile, editingProfile, setEditingProfile, handleAddEntity, handleDeleteEntity, fetchSettings, settings, setSettings, _handleSave }) {
  const [activeType, setActiveType] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('type') === 'audio' || params.get('media') === 'audio') return 'audio';
    }
    return 'video';
  });

  // Audio Profiles State
  const [audioProfiles, setAudioProfiles] = useState([]);
  const [editingAudioProfile, setEditingAudioProfile] = useState(null);
  const [newAudioProfile, setNewAudioProfile] = useState({
    name: '',
    preferred_format: 'FLAC',
    accepted_formats: ['FLAC', 'MP3'],
    min_bitrate: 0,
    cutoff_format: 'FLAC',
    upgrade_allowed: true
  });

  const fetchAudioProfiles = async () => {
    try {
      const res = await api.get('/library/music/quality-profiles');
      if (res.data.status === 'success') {
        setAudioProfiles(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load audio profiles:', err);
    }
  };

  useEffect(() => {
    fetchAudioProfiles();
  }, []);

  const handleSaveAudioProfile = async () => {
    const profileData = editingAudioProfile || newAudioProfile;
    if (!profileData.name.trim()) {
      customAlert('Profile name is required', 'error');
      return;
    }

    try {
      if (editingAudioProfile) {
        await api.put(`/library/music/quality-profiles/${editingAudioProfile.id}`, editingAudioProfile);
        setEditingAudioProfile(null);
        customAlert('Audio quality profile updated!', 'success');
      } else {
        await api.post('/library/music/quality-profiles', newAudioProfile);
        setNewAudioProfile({
          name: '',
          preferred_format: 'FLAC',
          accepted_formats: ['FLAC', 'MP3'],
          min_bitrate: 0,
          cutoff_format: 'FLAC',
          upgrade_allowed: true
        });
        customAlert('Audio quality profile created!', 'success');
      }
      fetchAudioProfiles();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to save audio profile', 'error');
    }
  };

  const handleDeleteAudioProfile = async (id) => {
    try {
      await api.delete(`/library/music/quality-profiles/${id}`);
      customAlert('Audio quality profile deleted!', 'success');
      fetchAudioProfiles();
    } catch (err) {
      customAlert('Failed to delete audio profile', 'error');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header & Media Sub-tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className={`text-2xl font-bold flex items-center gap-2 transition-colors ${activeType === 'video' ? 'text-amber-400' : 'text-cyan-400'}`}>
          <Settings2 className="w-7 h-7" /> Quality Profiles
        </h2>
        <div className="flex gap-1 bg-slate-900/60 border border-white/10 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveType('video')}
            className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeType === 'video'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-4 h-4" /> Video (Movies & TV)
          </button>
          <button
            onClick={() => setActiveType('audio')}
            className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeType === 'audio'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Music2 className="w-4 h-4" /> Audio (Music)
          </button>
        </div>
      </div>

      {/* ── VIDEO PROFILES ─────────────────────────────────────────────────── */}
      {activeType === 'video' && (
        <>
          <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-200">{editingProfile ? 'Edit Profile' : 'Add New Profile'}</h3>
              {editingProfile && (
                <button onClick={() => { setEditingProfile(null); setNewProfile({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true, media_type: 'both' }); }} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-700">Cancel Edit</button>
              )}
            </div>
            <p className="text-xs text-slate-500">Quality profiles restrict automated searches to specific resolutions. Higher list position means higher preference.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Profile Name</label>
                <input type="text" placeholder="e.g. Strict 1080p" className="glass-input w-full" value={editingProfile ? editingProfile.name : newProfile.name} onChange={e => editingProfile ? setEditingProfile({...editingProfile, name: e.target.value}) : setNewProfile({...newProfile, name: e.target.value})} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Allowed Qualities</label>
                <div className="flex flex-wrap gap-3">
                  {['SD', '720p', '1080p', '2160p', 'Unknown'].map(q => {
                    const activeObj = editingProfile ? editingProfile : newProfile;
                    const isSelected = activeObj.qualities.includes(q);
                    return (
                      <button
                        key={q}
                        onClick={() => {
                          const newQualities = isSelected 
                            ? activeObj.qualities.filter(i => i !== q)
                            : [...activeObj.qualities, q];
                          if (editingProfile) setEditingProfile({...editingProfile, qualities: newQualities});
                          else setNewProfile({...newProfile, qualities: newQualities});
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center gap-2 ${isSelected ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'bg-slate-950 border-white/10 text-slate-500 hover:text-slate-300'}`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />} {q}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Cutoff Quality</label>
                  <CustomSelect 
                    options={['SD', '720p', '1080p', '2160p', 'Unknown'].map(q => ({ label: q, value: q }))}
                    value={editingProfile ? editingProfile.cutoff : newProfile.cutoff} 
                    onChange={e => editingProfile ? setEditingProfile({...editingProfile, cutoff: e.target.value}) : setNewProfile({...newProfile, cutoff: e.target.value})} 
                  />
                  <p className="text-xs text-slate-500 mt-1">Once this quality is met, downloading stops.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Upgrades Allowed</label>
                  <button 
                    onClick={() => {
                      if (editingProfile) setEditingProfile({...editingProfile, upgrade_allowed: !editingProfile.upgrade_allowed});
                      else setNewProfile({...newProfile, upgrade_allowed: !newProfile.upgrade_allowed});
                    }}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium border flex justify-center items-center gap-2 transition-colors ${
                      (editingProfile ? editingProfile.upgrade_allowed : newProfile.upgrade_allowed) 
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                    }`}
                  >
                    {(editingProfile ? editingProfile.upgrade_allowed : newProfile.upgrade_allowed) ? <CheckCircle2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                    {(editingProfile ? editingProfile.upgrade_allowed : newProfile.upgrade_allowed) ? 'Yes, search for upgrades' : 'No, keep what I have'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Applies To</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                    const currentType = editingProfile ? editingProfile.media_type : newProfile.media_type;
                    const isMovieChecked = currentType !== 'shows';
                    const newChecked = !isMovieChecked;
                    const otherChecked = currentType === 'shows' ? newChecked : (currentType !== 'movies');
                    const newType = newChecked && otherChecked ? 'both' : newChecked ? 'movies' : 'shows';
                    if (editingProfile) setEditingProfile({...editingProfile, media_type: newType});
                    else setNewProfile({...newProfile, media_type: newType});
                  }}>
                    {(editingProfile ? editingProfile.media_type : newProfile.media_type) !== 'shows' ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5 text-slate-500 group-hover:text-cyan-400" />}
                    <span className="text-sm text-slate-300">Movies</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                    const currentType = editingProfile ? editingProfile.media_type : newProfile.media_type;
                    const isShowChecked = currentType !== 'movies';
                    const newChecked = !isShowChecked;
                    const otherChecked = currentType === 'movies' ? newChecked : (currentType !== 'shows');
                    const newType = newChecked && otherChecked ? 'both' : newChecked ? 'shows' : 'movies';
                    if (editingProfile) setEditingProfile({...editingProfile, media_type: newType});
                    else setNewProfile({...newProfile, media_type: newType});
                  }}>
                    {(editingProfile ? editingProfile.media_type : newProfile.media_type) !== 'movies' ? <CheckSquare className="w-5 h-5 text-purple-400" /> : <Square className="w-5 h-5 text-slate-500 group-hover:text-purple-400" />}
                    <span className="text-sm text-slate-300">TV Shows</span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  onClick={async () => {
                    if (editingProfile) {
                      try {
                        await api.put(`/settings/profiles/${editingProfile.id}`, editingProfile);
                        setEditingProfile(null);
                        fetchSettings();
                        customAlert('Profile updated!', 'success');
                      } catch (err) {
                        customAlert(err.response?.data?.message || 'Failed to update profile', 'error');
                      }
                    } else {
                      handleAddEntity('profiles', newProfile);
                      setNewProfile({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true });
                    }
                  }} 
                  disabled={!(editingProfile ? editingProfile.name : newProfile.name)}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-6 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {editingProfile ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {editingProfile ? 'Save Changes' : 'Add Profile'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {profiles.length === 0 ? <p className="text-slate-500 italic p-4 text-center">No profiles configured yet.</p> : profiles.map(p => {
              const isDefault = settings?.defaultQualityProfileId === p.id;
              return (
              <div key={p.id} className={`flex justify-between items-center glass-panel p-5 rounded-2xl border hover:border-amber-500/30 transition-colors group shadow-lg ${isDefault ? 'border-amber-500/50 bg-amber-500/5' : 'border-white/5'}`}>
                <div>
                  <div className="flex items-center gap-3">
                    <p className="text-base font-bold text-slate-200">{p.name}</p>
                    {isDefault && <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400" /> Default</span>}
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                      p.media_type === 'movies' ? 'bg-cyan-500/20 text-cyan-400' :
                      p.media_type === 'shows' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {p.media_type === 'movies' ? 'Movies' : p.media_type === 'shows' ? 'TV Shows' : 'Both'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {p.qualities.map(q => <span key={q} className="text-xs bg-white/10 px-2 py-0.5 rounded text-amber-400">{q}</span>)}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Cutoff: <strong className="text-slate-300">{p.cutoff}</strong> &bull; Upgrades: <strong className={p.upgrade_allowed ? 'text-emerald-400' : 'text-red-400'}>{p.upgrade_allowed ? 'Yes' : 'No'}</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={async () => {
                      if (setSettings) {
                        const newId = isDefault ? null : p.id;
                        setSettings(prev => ({ ...prev, defaultQualityProfileId: newId }));
                        try {
                          await api.post('/settings', { ...settings, defaultQualityProfileId: newId });
                          customAlert('Default profile updated!', 'success');
                        } catch {
                          customAlert('Failed to update default profile.', 'error');
                        }
                      }
                    }} 
                    className={`p-2 bg-slate-900 rounded-lg border border-white/5 transition-colors ${
                      isDefault 
                        ? 'text-amber-400 hover:text-slate-400 hover:bg-slate-800' 
                        : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                    }`}
                    title={isDefault ? "Remove Default" : "Make Default"}
                  >
                    <Star className={`w-4 h-4 ${isDefault ? 'fill-amber-400' : ''}`} />
                  </button>
                  <button onClick={() => setEditingProfile(p)} className="text-slate-400 hover:text-amber-400 p-2 bg-slate-900 rounded-lg border border-white/5"><Settings2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteEntity('profiles', p.id)} className="text-red-400 hover:text-red-300 p-2 bg-slate-900 rounded-lg border border-white/5"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── AUDIO PROFILES ─────────────────────────────────────────────────── */}
      {activeType === 'audio' && (
        <>
          <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-200">
                {editingAudioProfile ? 'Edit Audio Profile' : 'Add New Audio Profile'}
              </h3>
              {editingAudioProfile && (
                <button
                  onClick={() => setEditingAudioProfile(null)}
                  className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-700"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Audio quality profiles restrict automated music searches and imports to specific audio formats.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Profile Name</label>
                <input
                  type="text"
                  placeholder="e.g. Lossless (FLAC)"
                  className="glass-input w-full"
                  value={editingAudioProfile ? editingAudioProfile.name : newAudioProfile.name}
                  onChange={(e) => {
                    if (editingAudioProfile) setEditingAudioProfile({ ...editingAudioProfile, name: e.target.value });
                    else setNewAudioProfile({ ...newAudioProfile, name: e.target.value });
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Preferred Format</label>
                <CustomSelect
                  options={AUDIO_FORMAT_OPTIONS.map((f) => ({ label: f, value: f }))}
                  value={editingAudioProfile ? editingAudioProfile.preferred_format : newAudioProfile.preferred_format}
                  onChange={(e) => {
                    if (editingAudioProfile) setEditingAudioProfile({ ...editingAudioProfile, preferred_format: e.target.value });
                    else setNewAudioProfile({ ...newAudioProfile, preferred_format: e.target.value });
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Accepted Formats</label>
                <div className="flex flex-wrap gap-3">
                  {AUDIO_FORMAT_OPTIONS.map((fmt) => {
                    const activeObj = editingAudioProfile || newAudioProfile;
                    let accepted = [];
                    try {
                      accepted = typeof activeObj.accepted_formats === 'string'
                        ? JSON.parse(activeObj.accepted_formats)
                        : activeObj.accepted_formats || [];
                    } catch {
                      accepted = activeObj.accepted_formats || [];
                    }
                    const isSelected = accepted.includes(fmt);

                    return (
                      <button
                        key={fmt}
                        onClick={() => {
                          const newAccepted = isSelected
                            ? accepted.filter((f) => f !== fmt)
                            : [...accepted, fmt];
                          if (editingAudioProfile) {
                            setEditingAudioProfile({ ...editingAudioProfile, accepted_formats: newAccepted });
                          } else {
                            setNewAudioProfile({ ...newAudioProfile, accepted_formats: newAccepted });
                          }
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center gap-2 ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                            : 'bg-slate-950 border-white/10 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />} {fmt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Cutoff Format</label>
                  <CustomSelect
                    options={AUDIO_FORMAT_OPTIONS.map((f) => ({ label: f, value: f }))}
                    value={editingAudioProfile ? editingAudioProfile.cutoff_format : newAudioProfile.cutoff_format}
                    onChange={(e) => {
                      if (editingAudioProfile) setEditingAudioProfile({ ...editingAudioProfile, cutoff_format: e.target.value });
                      else setNewAudioProfile({ ...newAudioProfile, cutoff_format: e.target.value });
                    }}
                  />
                  <p className="text-xs text-slate-500 mt-1">Once this format is met, upgrading stops.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Upgrades Allowed</label>
                  <button
                    onClick={() => {
                      if (editingAudioProfile) {
                        setEditingAudioProfile({ ...editingAudioProfile, upgrade_allowed: !editingAudioProfile.upgrade_allowed });
                      } else {
                        setNewAudioProfile({ ...newAudioProfile, upgrade_allowed: !newAudioProfile.upgrade_allowed });
                      }
                    }}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium border flex justify-center items-center gap-2 transition-colors ${
                      (editingAudioProfile ? editingAudioProfile.upgrade_allowed : newAudioProfile.upgrade_allowed)
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border-red-500/30'
                    }`}
                  >
                    {(editingAudioProfile ? editingAudioProfile.upgrade_allowed : newAudioProfile.upgrade_allowed) ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    {(editingAudioProfile ? editingAudioProfile.upgrade_allowed : newAudioProfile.upgrade_allowed)
                      ? 'Yes, search for format upgrades'
                      : 'No, keep current format'}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSaveAudioProfile}
                  disabled={!(editingAudioProfile ? editingAudioProfile.name : newAudioProfile.name)}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-6 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
                >
                  {editingAudioProfile ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {editingAudioProfile ? 'Save Changes' : 'Add Audio Profile'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {audioProfiles.length === 0 ? (
              <p className="text-slate-500 italic p-4 text-center">No audio profiles configured yet.</p>
            ) : (
              audioProfiles.map((p) => {
                let accepted = [];
                try {
                  accepted = typeof p.accepted_formats === 'string' ? JSON.parse(p.accepted_formats) : p.accepted_formats || [];
                } catch {
                  accepted = p.accepted_formats || [];
                }

                return (
                  <div
                    key={p.id}
                    className="flex justify-between items-center glass-panel p-5 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-colors group shadow-lg"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="text-base font-bold text-slate-200">{p.name}</p>
                        <span className="text-[10px] uppercase tracking-wider font-mono font-bold bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
                          {p.preferred_format}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {accepted.map((fmt) => (
                          <span key={fmt} className="text-xs bg-white/10 px-2 py-0.5 rounded text-cyan-300">
                            {fmt}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Cutoff: <strong className="text-slate-300">{p.cutoff_format || p.preferred_format}</strong> &bull; Upgrades: <strong className={p.upgrade_allowed ? 'text-emerald-400' : 'text-red-400'}>{p.upgrade_allowed ? 'Yes' : 'No'}</strong>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          let acc = ['FLAC', 'MP3'];
                          try {
                            acc = typeof p.accepted_formats === 'string' ? JSON.parse(p.accepted_formats) : p.accepted_formats || [];
                          } catch {
                            acc = p.accepted_formats || [];
                          }
                          setEditingAudioProfile({
                            id: p.id,
                            name: p.name,
                            preferred_format: p.preferred_format || 'FLAC',
                            accepted_formats: acc,
                            min_bitrate: p.min_bitrate || 0,
                            cutoff_format: p.cutoff_format || 'FLAC',
                            upgrade_allowed: !!p.upgrade_allowed
                          });
                        }}
                        className="text-slate-400 hover:text-cyan-400 p-2 bg-slate-900 rounded-lg border border-white/5"
                        title="Edit"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAudioProfile(p.id)}
                        className="text-red-400 hover:text-red-300 p-2 bg-slate-900 rounded-lg border border-white/5"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
