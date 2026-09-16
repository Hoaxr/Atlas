import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../lib/api';
import { Save, Plus, Trash2, Settings2, CheckCircle2, Star, Film, Music2, Edit } from 'lucide-react';
import { customAlert } from '../../utils/alerts';
import CustomSelect from '../../components/shared/CustomSelect';
import Button from '../../components/shared/Button';
import ToggleRow from '../../components/shared/ToggleRow';
import { SettingsSection, SettingsHeader } from '../../components/settings/layout';

const AUDIO_FORMAT_OPTIONS = ['FLAC', 'MP3', 'AAC', 'Opus', 'ALAC', 'OGG'];
const VIDEO_QUALITY_OPTIONS = ['SD', '720p', '1080p', '2160p', 'Unknown'];

// Visual tokens shared with the other settings tabs — keep in sync
const PANEL_CLASS = 'glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 shadow-sm';
const INPUT_CLASS = 'w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600';
const LABEL_CLASS = 'block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5';
const HELPER_CLASS = 'text-xs text-slate-400 mt-2';
const CHIP_BASE = 'px-4 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center gap-2';
const CHIP_ON = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40';
const CHIP_OFF = 'bg-[#0c1624] border-[#1c2d46] text-slate-400 hover:text-slate-200 hover:border-[#274063]';
const ROW_LIST_CLASS = 'rounded-xl border border-[#1c2d46] bg-[#0c1626]/90 overflow-hidden';
const EMPTY_CLASS = 'py-10 px-4 text-center text-xs sm:text-sm text-slate-400';
const TAG_CLASS = 'text-[11px] font-medium bg-[#101e31] border border-[#1c2d46] px-2 py-0.5 rounded-md text-slate-300';

function MediaTypeBadge({ mediaType }) {
  const styles = mediaType === 'movies'
    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    : mediaType === 'shows'
      ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
      : 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  const label = mediaType === 'movies' ? 'Movies' : mediaType === 'shows' ? 'TV Shows' : 'Both';
  return (
    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${styles}`}>
      {label}
    </span>
  );
}

function DefaultBadge() {
  return (
    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border bg-amber-500/15 text-amber-400 border-amber-500/30 inline-flex items-center gap-1 whitespace-nowrap">
      <Star className="w-2.5 h-2.5 fill-amber-400" /> Default
    </span>
  );
}

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
    } catch {
      customAlert('Failed to delete audio profile', 'error');
    }
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Header & Media Sub-tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
            <Settings2 className="w-5 h-5 text-cyan-400 shrink-0" /> Quality Profiles
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Choose which resolutions or audio formats automated searches are allowed to grab.
          </p>
        </div>
        <div className="relative flex items-center bg-[#101e31] p-1 rounded-xl border border-[#1c2d46] shadow-inner select-none shrink-0">
          <button
            type="button"
            onClick={() => setActiveType('video')}
            className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
              activeType === 'video' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
            }`}
          >
            {activeType === 'video' && (
              <motion.div
                layoutId="profile-type-slider"
                className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <Film className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${activeType === 'video' ? 'text-slate-950' : 'text-slate-100'}`} />
            <span className="relative z-10 hidden sm:inline">Video (Movies & TV)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveType('audio')}
            className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
              activeType === 'audio' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
            }`}
          >
            {activeType === 'audio' && (
              <motion.div
                layoutId="profile-type-slider"
                className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <Music2 className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${activeType === 'audio' ? 'text-slate-950' : 'text-slate-100'}`} />
            <span className="relative z-10 hidden sm:inline">Audio (Music)</span>
          </button>
        </div>
      </div>

      {/* ── VIDEO PROFILES ─────────────────────────────────────────────────── */}
      {activeType === 'video' && (
        <>
          <SettingsSection>
            <SettingsHeader
              title={editingProfile ? 'Edit Profile' : 'Add New Profile'}
              icon={Settings2}
              description="Quality profiles restrict automated searches to specific resolutions. Higher list position means higher preference."
            >
              {editingProfile && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setEditingProfile(null); setNewProfile({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true, media_type: 'both' }); }}
                >
                  Cancel Edit
                </Button>
              )}
            </SettingsHeader>
            
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>Profile Name</label>
                <input
                  type="text"
                  placeholder="e.g. Strict 1080p"
                  className={INPUT_CLASS}
                  value={editingProfile ? editingProfile.name : newProfile.name}
                  onChange={e => editingProfile ? setEditingProfile({...editingProfile, name: e.target.value}) : setNewProfile({...newProfile, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className={LABEL_CLASS}>Allowed Qualities</label>
                <div className="flex flex-wrap gap-3">
                  {VIDEO_QUALITY_OPTIONS.map(q => {
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
                        className={`${CHIP_BASE} ${isSelected ? CHIP_ON : CHIP_OFF}`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />} {q}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={LABEL_CLASS}>Cutoff Quality</label>
                  <CustomSelect 
                    options={VIDEO_QUALITY_OPTIONS.map(q => ({ label: q, value: q }))}
                    value={editingProfile ? editingProfile.cutoff : newProfile.cutoff} 
                    onChange={e => editingProfile ? setEditingProfile({...editingProfile, cutoff: e.target.value}) : setNewProfile({...newProfile, cutoff: e.target.value})} 
                  />
                  <p className={HELPER_CLASS}>Once this quality is met, downloading stops.</p>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Upgrades Allowed</label>
                  <ToggleRow
                    checked={editingProfile ? editingProfile.upgrade_allowed : newProfile.upgrade_allowed}
                    onChange={() => {
                      if (editingProfile) setEditingProfile({...editingProfile, upgrade_allowed: !editingProfile.upgrade_allowed});
                      else setNewProfile({...newProfile, upgrade_allowed: !newProfile.upgrade_allowed});
                    }}
                    title="Search for Upgrades"
                    description="Grab a better version when one becomes available."
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Applies To</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleRow
                    checked={(editingProfile ? editingProfile.media_type : newProfile.media_type) !== 'shows'}
                    onChange={() => {
                      const currentType = editingProfile ? editingProfile.media_type : newProfile.media_type;
                      const nextMovies = currentType === 'shows';
                      const nextShows = currentType !== 'movies';
                      if (!nextMovies && !nextShows) return;
                      const newType = nextMovies && nextShows ? 'both' : nextMovies ? 'movies' : 'shows';
                      if (editingProfile) setEditingProfile({...editingProfile, media_type: newType});
                      else setNewProfile({...newProfile, media_type: newType});
                    }}
                    title="Movies"
                    description="Apply this profile to movie searches."
                  />
                  <ToggleRow
                    checked={(editingProfile ? editingProfile.media_type : newProfile.media_type) !== 'movies'}
                    onChange={() => {
                      const currentType = editingProfile ? editingProfile.media_type : newProfile.media_type;
                      const nextShows = currentType === 'movies';
                      const nextMovies = currentType !== 'shows';
                      if (!nextMovies && !nextShows) return;
                      const newType = nextMovies && nextShows ? 'both' : nextMovies ? 'movies' : 'shows';
                      if (editingProfile) setEditingProfile({...editingProfile, media_type: newType});
                      else setNewProfile({...newProfile, media_type: newType});
                    }}
                    title="TV Shows"
                    description="Apply this profile to TV searches."
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  variant="primary"
                  icon={editingProfile ? Save : Plus}
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
                >
                  {editingProfile ? 'Save Changes' : 'Add Profile'}
                </Button>
              </div>
            </div>
          </SettingsSection>

          <div className={ROW_LIST_CLASS}>
            {profiles.length === 0 ? (
              <div className={EMPTY_CLASS}>No profiles configured yet.</div>
            ) : (
              <div className="divide-y divide-[#1c2d46]/70">
                {profiles.map(p => {
                  const isDefault = settings?.defaultQualityProfileId === p.id;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 hover:bg-[#101e31]/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100 truncate">{p.name}</span>
                          {isDefault && <DefaultBadge />}
                          <MediaTypeBadge mediaType={p.media_type} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {p.qualities.map(q => (
                            <span key={q} className={TAG_CLASS}>{q}</span>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          Cutoff: <strong className="text-slate-300 font-semibold">{p.cutoff}</strong> &bull; Upgrades: <strong className={`font-semibold ${p.upgrade_allowed ? 'text-emerald-400' : 'text-rose-400'}`}>{p.upgrade_allowed ? 'Yes' : 'No'}</strong>
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 ml-auto">
                        <Button
                          size="sm"
                          variant={isDefault ? 'primary' : 'secondary'}
                          icon={Star}
                          title={isDefault ? 'Remove as default' : 'Make this the default profile'}
                          onClick={async () => {
                            if (!setSettings) return;
                            const newId = isDefault ? null : p.id;
                            setSettings(prev => ({ ...prev, defaultQualityProfileId: newId }));
                            try {
                              await api.post('/settings', { ...settings, defaultQualityProfileId: newId });
                              customAlert('Default profile updated!', 'success');
                            } catch {
                              customAlert('Failed to update default profile.', 'error');
                            }
                          }}
                        >
                          {isDefault ? 'Default' : 'Make Default'}
                        </Button>
                        <Button size="sm" variant="secondary" icon={Edit} onClick={() => setEditingProfile(p)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDeleteEntity('profiles', p.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── AUDIO PROFILES ─────────────────────────────────────────────────── */}
      {activeType === 'audio' && (
        <>
          <SettingsSection>
            <SettingsHeader
              title={editingAudioProfile ? 'Edit Audio Profile' : 'Add New Audio Profile'}
              icon={Music2}
              description="Audio quality profiles restrict automated music searches and imports to specific audio formats."
            >
              {editingAudioProfile && (
                <Button variant="secondary" size="sm" onClick={() => setEditingAudioProfile(null)}>
                  Cancel Edit
                </Button>
              )}
            </SettingsHeader>

            <div className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>Profile Name</label>
                <input
                  type="text"
                  placeholder="e.g. Lossless (FLAC)"
                  className={INPUT_CLASS}
                  value={editingAudioProfile ? editingAudioProfile.name : newAudioProfile.name}
                  onChange={(e) => {
                    if (editingAudioProfile) setEditingAudioProfile({ ...editingAudioProfile, name: e.target.value });
                    else setNewAudioProfile({ ...newAudioProfile, name: e.target.value });
                  }}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Preferred Format</label>
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
                <label className={LABEL_CLASS}>Accepted Formats</label>
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
                        className={`${CHIP_BASE} ${isSelected ? CHIP_ON : CHIP_OFF}`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />} {fmt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={LABEL_CLASS}>Cutoff Format</label>
                  <CustomSelect
                    options={AUDIO_FORMAT_OPTIONS.map((f) => ({ label: f, value: f }))}
                    value={editingAudioProfile ? editingAudioProfile.cutoff_format : newAudioProfile.cutoff_format}
                    onChange={(e) => {
                      if (editingAudioProfile) setEditingAudioProfile({ ...editingAudioProfile, cutoff_format: e.target.value });
                      else setNewAudioProfile({ ...newAudioProfile, cutoff_format: e.target.value });
                    }}
                  />
                  <p className={HELPER_CLASS}>Once this format is met, upgrading stops.</p>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Upgrades Allowed</label>
                  <ToggleRow
                    checked={editingAudioProfile ? editingAudioProfile.upgrade_allowed : newAudioProfile.upgrade_allowed}
                    onChange={() => {
                      if (editingAudioProfile) {
                        setEditingAudioProfile({ ...editingAudioProfile, upgrade_allowed: !editingAudioProfile.upgrade_allowed });
                      } else {
                        setNewAudioProfile({ ...newAudioProfile, upgrade_allowed: !newAudioProfile.upgrade_allowed });
                      }
                    }}
                    title="Search for Upgrades"
                    description="Grab a better format when one becomes available."
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  icon={editingAudioProfile ? Save : Plus}
                  onClick={handleSaveAudioProfile}
                  disabled={!(editingAudioProfile ? editingAudioProfile.name : newAudioProfile.name)}
                >
                  {editingAudioProfile ? 'Save Changes' : 'Add Audio Profile'}
                </Button>
              </div>
            </div>
          </SettingsSection>

          <div className={ROW_LIST_CLASS}>
            {audioProfiles.length === 0 ? (
              <div className={EMPTY_CLASS}>No audio profiles configured yet.</div>
            ) : (
              <div className="divide-y divide-[#1c2d46]/70">
                {audioProfiles.map((p) => {
                  let accepted = [];
                  try {
                    accepted = typeof p.accepted_formats === 'string' ? JSON.parse(p.accepted_formats) : p.accepted_formats || [];
                  } catch {
                    accepted = p.accepted_formats || [];
                  }

                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 hover:bg-[#101e31]/60 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100 truncate">{p.name}</span>
                          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 whitespace-nowrap">
                            {p.preferred_format}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {accepted.map((fmt) => (
                            <span key={fmt} className={TAG_CLASS}>{fmt}</span>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          Cutoff: <strong className="text-slate-300 font-semibold">{p.cutoff_format || p.preferred_format}</strong> &bull; Upgrades: <strong className={`font-semibold ${p.upgrade_allowed ? 'text-emerald-400' : 'text-rose-400'}`}>{p.upgrade_allowed ? 'Yes' : 'No'}</strong>
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 ml-auto">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Edit}
                          title="Edit"
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
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDeleteAudioProfile(p.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
