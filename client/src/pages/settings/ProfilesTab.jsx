import api from '../../lib/api';
import { Save, Plus, Trash2, Settings2, CheckCircle2, Star } from 'lucide-react';
import { customAlert } from '../../utils/alerts';
import CustomSelect from '../../components/shared/CustomSelect';

export default function ProfilesTab({ profiles, newProfile, setNewProfile, editingProfile, setEditingProfile, handleAddEntity, handleDeleteEntity, fetchSettings, settings, setSettings, handleSave }) {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-amber-400 flex items-center gap-2">
        <Settings2 className="w-7 h-7" /> Quality Profiles
      </h2>
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative overflow-hidden">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-200">{editingProfile ? 'Edit Profile' : 'Add New Profile'}</h3>
          {editingProfile && (
            <button onClick={() => { setEditingProfile(null); setNewProfile({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true }); }} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-700">Cancel Edit</button>
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

          <div className="pt-2">
            <button 
              onClick={async () => {
                if (editingProfile) {
                  try {
                    await api.put(`/settings/profiles/${editingProfile.id}`, editingProfile);
                    setEditingProfile(null);
                    fetchSettings();
                    customAlert('Profile updated!', 'success');
                  } catch { /* profile update failed silently */ }
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
                    } catch (e) {
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
    </div>
  );
}
