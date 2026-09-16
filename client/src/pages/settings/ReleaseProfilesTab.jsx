import { useState } from 'react';
import { Save, Plus, Trash2, ShieldAlert, X, Edit } from 'lucide-react';
import CustomSelect from '../../components/shared/CustomSelect';
import Button from '../../components/shared/Button';
import ToggleRow from '../../components/shared/ToggleRow';
import { SettingsSection, SettingsHeader, SettingsGroup, SettingsLabel, SettingsHelper } from '../../components/settings/layout';

// Visual tokens shared with the other settings tabs — keep in sync
const PANEL_CLASS = 'glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 shadow-sm';
const INPUT_CLASS = 'w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600';
const LABEL_CLASS = 'block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5';
const HELPER_CLASS = 'text-xs text-slate-400 mt-2';
const ROW_LIST_CLASS = 'rounded-xl border border-[#1c2d46] bg-[#0c1626]/90 overflow-hidden';
const EMPTY_CLASS = 'py-10 px-4 text-center text-xs sm:text-sm text-slate-400';
const INCLUDE_TAG = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
const EXCLUDE_TAG = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
const BADGE_BASE = 'text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border whitespace-nowrap';
const LIST_TAG = 'text-[11px] font-medium px-2 py-0.5 rounded-md border flex items-center gap-1';

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
          <div key={tag || index} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border ${colorClass}`}>
            <span>{tag}</span>
            <button type="button" onClick={() => removeTag(index)} className="hover:opacity-75 focus:outline-none" title="Remove">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <input
        type="text"
        className={INPUT_CLASS}
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <p className={HELPER_CLASS}>Press enter to add</p>
    </div>
  );
};

export default function ReleaseProfilesTab({ releaseProfiles, _indexers, newProfile, setNewProfile, editingProfile, setEditingProfile, handleAddProfile, handleUpdateProfile, handleDeleteProfile }) {
  const activeObj = editingProfile || newProfile;
  const updateObj = (updates) => {
    if (editingProfile) setEditingProfile({ ...editingProfile, ...updates });
    else setNewProfile({ ...newProfile, ...updates });
  };


  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
          <ShieldAlert className="w-5 h-5 text-cyan-400 shrink-0" /> Release Profiles
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Accept or reject releases by name — require terms, block unwanted ones, or scope a profile to movies or TV.
        </p>
      </div>
      <SettingsSection>
        <SettingsHeader
          title={editingProfile ? 'Edit Profile' : 'Add New Profile'}
          icon={ShieldAlert}
          description="Release profiles globally accept or reject releases based on their names. Require specific terms or block unwanted ones."
        >
          {editingProfile && (
            <Button variant="secondary" size="sm" onClick={() => setEditingProfile(null)}>
              Cancel Edit
            </Button>
          )}
        </SettingsHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <SettingsLabel title="Name" />
              <input
                type="text"
                placeholder="e.g. Block CAM/TS"
                className={INPUT_CLASS}
                value={activeObj.name || ''}
                onChange={e => updateObj({ name: e.target.value })}
              />
            </div>
            
            <div>
              <SettingsLabel title="Enable Profile" />
              <ToggleRow
                checked={!!activeObj.enabled}
                onChange={() => updateObj({ enabled: !activeObj.enabled })}
                title="Enable this release profile"
                description="Disabled profiles are not applied to searches."
              />
            </div>
          </div>

          <div>
            <SettingsLabel title="Must Contain" />
            <TagInput 
              tags={activeObj.must_contain || []} 
              setTags={(tags) => updateObj({ must_contain: tags })}
              placeholder="Add new restriction..."
              colorClass={INCLUDE_TAG}
            />
            <SettingsHelper text="The release must contain ALL of these terms (case insensitive)." />
          </div>

          <div>
            <SettingsLabel title="Must Not Contain" />
            <TagInput 
              tags={activeObj.must_not_contain || []} 
              setTags={(tags) => updateObj({ must_not_contain: tags })}
              placeholder="Add new restriction..."
              colorClass={EXCLUDE_TAG}
            />
            <SettingsHelper text="The release will be rejected if it contains one or more of these terms (case insensitive)." />
          </div>

          <div>
            <SettingsLabel title="Apply To" />
            <CustomSelect 
              options={[
                { label: 'All', value: 'all' },
                { label: 'Movies', value: 'movies' },
                { label: 'TV Shows', value: 'shows' }
              ]}
              value={activeObj.apply_to || 'all'} 
              onChange={e => updateObj({ apply_to: e.target.value })} 
            />
            <SettingsHelper text="Select whether this release profile should apply globally, or only to movies or TV shows." />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              icon={editingProfile ? Save : Plus}
              disabled={!activeObj.name}
              onClick={() => {
                if (editingProfile) {
                  handleUpdateProfile(editingProfile);
                } else {
                  handleAddProfile(newProfile);
                }
              }}
            >
              {editingProfile ? 'Save Changes' : 'Add Profile'}
            </Button>
          </div>
        </div>
      </SettingsSection>

      <div className={ROW_LIST_CLASS}>
        {(!releaseProfiles || releaseProfiles.length === 0) ? (
          <div className={EMPTY_CLASS}>No release profiles configured yet.</div>
        ) : (
          <div className="divide-y divide-[#1c2d46]/70">
            {releaseProfiles.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 hover:bg-[#101e31]/60 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100 truncate">{p.name}</span>
                    {p.enabled ? (
                      <span className={`${BADGE_BASE} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>Enabled</span>
                    ) : (
                      <span className={`${BADGE_BASE} bg-slate-500/10 text-slate-400 border-slate-500/20`}>Disabled</span>
                    )}
                    {p.apply_to && p.apply_to !== 'all' && (
                      <span className={`${BADGE_BASE} ${p.apply_to === 'movies' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                        {p.apply_to === 'movies' ? 'Movies' : 'TV Shows'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {p.must_contain?.map(t => (
                      <span key={t} className={`${LIST_TAG} ${INCLUDE_TAG}`}>
                        <span className="font-bold">+</span> {t}
                      </span>
                    ))}
                    {p.must_not_contain?.map(t => (
                      <span key={t} className={`${LIST_TAG} ${EXCLUDE_TAG}`}>
                        <span className="font-bold">-</span> {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 ml-auto">
                  <Button size="sm" variant="secondary" icon={Edit} onClick={() => setEditingProfile(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDeleteProfile(p.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
