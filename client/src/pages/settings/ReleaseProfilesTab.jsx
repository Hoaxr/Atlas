import { useState } from 'react';
import { Save, Plus, Trash2, ShieldAlert, CheckSquare, Square, X, Edit2 } from 'lucide-react';
import CustomSelect from '../../components/shared/CustomSelect';

const TagInput = ({ tags, setTags, placeholder, colorClass }) => {
  const [input, setInput] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      addCurrentInput();
    }
  };

  const handleBlur = () => {
    if (input.trim()) {
      addCurrentInput();
    }
  };

  const addCurrentInput = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      setTags([...tags, val]);
    }
    setInput('');
  };

  const removeTag = (indexToRemove) => {
    setTags(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag, index) => (
          <div key={tag || index} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium ${colorClass}`}>
            <span>{tag}</span>
            <button onClick={() => removeTag(index)} className="hover:opacity-75 focus:outline-none">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <input
        type="text"
        className="glass-input w-full"
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <p className="text-xs text-slate-500 mt-1">Press enter to add</p>
    </div>
  );
};

export default function ReleaseProfilesTab({ releaseProfiles, indexers, newProfile, setNewProfile, editingProfile, setEditingProfile, handleAddProfile, handleUpdateProfile, handleDeleteProfile }) {
  const activeObj = editingProfile || newProfile;
  const updateObj = (updates) => {
    if (editingProfile) setEditingProfile({ ...editingProfile, ...updates });
    else setNewProfile({ ...newProfile, ...updates });
  };

  const indexerOptions = [
    { label: '(Any)', value: '' },
    ...indexers.map(i => ({ label: i.name, value: i.id }))
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-indigo-400 flex items-center gap-2">
          <ShieldAlert className="w-7 h-7" /> Release Profiles
        </h2>
      </div>
      <div className="glass-panel p-8 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative overflow-hidden">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-200">{editingProfile ? 'Edit Profile' : 'Add New Profile'}</h3>
          {editingProfile && (
            <button onClick={() => setEditingProfile(null)} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-700">Cancel Edit</button>
          )}
        </div>
        <p className="text-xs text-slate-500">Release profiles globally accept or reject releases based on their names. Require specific terms or block unwanted ones.</p>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
              <input 
                type="text" 
                placeholder="e.g. Block CAM/TS" 
                className="glass-input w-full" 
                value={activeObj.name || ''} 
                onChange={e => updateObj({ name: e.target.value })} 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Enable Profile</label>
              <button 
                className="flex items-center gap-3 cursor-pointer p-3 w-full rounded-xl bg-slate-900/50 border border-white/5 hover:border-indigo-500/30 transition-colors group mt-1"
                onClick={() => updateObj({ enabled: !activeObj.enabled })}
              >
                <div className="mt-0.5">
                  {activeObj.enabled ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5 text-slate-500" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">Check to enable release profile</p>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Must Contain</label>
            <TagInput 
              tags={activeObj.must_contain || []} 
              setTags={(tags) => updateObj({ must_contain: tags })}
              placeholder="Add new restriction..."
              colorClass="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            />
            <p className="text-xs text-slate-500 mt-1">The release must contain ALL of these terms (case insensitive).</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Must Not Contain</label>
            <TagInput 
              tags={activeObj.must_not_contain || []} 
              setTags={(tags) => updateObj({ must_not_contain: tags })}
              placeholder="Add new restriction..."
              colorClass="bg-red-500/20 text-red-400 border border-red-500/30"
            />
            <p className="text-xs text-slate-500 mt-1">The release will be rejected if it contains one or more of terms (case insensitive).</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Apply To</label>
            <CustomSelect 
              options={[
                { label: 'All', value: 'all' },
                { label: 'Movies', value: 'movies' },
                { label: 'TV Shows', value: 'shows' }
              ]}
              value={activeObj.apply_to || 'all'} 
              onChange={e => updateObj({ apply_to: e.target.value })} 
            />
            <p className="text-xs text-slate-500 mt-1">
              Select whether this release profile should apply globally, or only to movies or TV shows.
            </p>
          </div>

          <div className="pt-2">
            <button 
              onClick={() => {
                if (editingProfile) {
                  handleUpdateProfile(editingProfile);
                } else {
                  handleAddProfile(newProfile);
                }
              }} 
              disabled={!activeObj.name}
              className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold py-3 px-6 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
            >
              {editingProfile ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingProfile ? 'Save Changes' : 'Add Profile'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {(!releaseProfiles || releaseProfiles.length === 0) ? <p className="text-slate-500 italic p-4 text-center">No release profiles configured yet.</p> : releaseProfiles.map(p => {
          return (
            <div key={p.id} className={`flex justify-between items-center glass-panel p-5 rounded-2xl border hover:border-indigo-500/30 transition-colors group shadow-lg ${!p.enabled ? 'opacity-50 border-white/5' : 'border-indigo-500/20'}`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-slate-200">{p.name}</p>
                  {p.enabled ? (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">Enabled</span>
                  ) : (
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-white/10">Disabled</span>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2 mt-3">
                  {p.must_contain?.map(t => (
                    <span key={t} className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                      <span className="font-bold">+</span> {t}
                    </span>
                  ))}
                  {p.must_not_contain?.map(t => (
                    <span key={t} className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                      <span className="font-bold">-</span> {t}
                    </span>
                  ))}
                </div>
                
                {p.apply_to && p.apply_to !== 'all' && (
                  <p className="text-xs text-slate-500 mt-3">
                    Applies to: <strong className="text-indigo-400">{p.apply_to === 'movies' ? 'Movies' : 'TV Shows'}</strong>
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setEditingProfile(p)} className="text-slate-400 hover:text-indigo-400 p-2 bg-slate-900 rounded-lg border border-white/5"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDeleteProfile(p.id)} className="text-red-400 hover:text-red-300 p-2 bg-slate-900 rounded-lg border border-white/5"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
