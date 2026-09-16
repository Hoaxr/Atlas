import { useState } from 'react';
import { Shield, Save, CheckSquare, Square, Globe, Sliders, Users, ArrowRight } from 'lucide-react';
import CustomSelect from '../../components/shared/CustomSelect';
import ToggleRow from '../../components/shared/ToggleRow';
import BackupTab from './BackupTab';
import { SettingsSection, SettingsHeader, SettingsGroup, SettingsLabel, SettingsHelper } from '../../components/settings/layout';

const TIMEZONE_OPTIONS = [
  { value: '', label: 'No adjustment (show US air dates as-is)' },
  ...['Europe/Amsterdam', 'Europe/London', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Warsaw', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Lisbon', 'Europe/Dublin', 'Europe/Athens', 'Europe/Istanbul'].map(tz => ({
    value: tz,
    label: tz.replace('Europe/', '').replace(/_/g, ' '),
    group: 'Europe'
  })),
  ...['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires'].map(tz => ({
    value: tz,
    label: tz.replace('America/', '').replace(/_/g, ' '),
    group: 'Americas'
  })),
  ...['Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Dubai', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland'].map(tz => ({
    value: tz,
    label: tz.split('/').slice(1).join('/').replace(/_/g, ' '),
    group: 'Asia & Oceania'
  }))
];

const LANDING_PAGE_OPTIONS = [
  { value: '/tracker', label: 'Tracker (Default)' },
  { value: '/movies', label: 'Movies' },
  { value: '/shows', label: 'TV Shows' },
  { value: '/music', label: 'Music' },
  { value: '/discover', label: 'Discover' },
  { value: '/downloads', label: 'Activity / Downloads' }
];

export default function GeneralTab({ settings, setSettings, onNavigateTab }) {
  const [landingPage, setLandingPage] = useState(() => localStorage.getItem('atlas_landing_page') || '/tracker');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="space-y-6 w-full animate-fade-in">
      {/* Top Header & Save Button */}
      <SettingsHeader 
        title="General Settings" 
        icon={Sliders}
        description="Configure authentication, regional timing, application preferences, and database backups."
      />

      {/* Authentication */}
      <SettingsSection>
        <SettingsHeader 
          title="Authentication" 
          icon={Shield}
          description="Control whether Atlas requires authentication. Recommended if exposed to your local network or the internet."
        />

        <div className="space-y-4">
          <ToggleRow
            checked={settings.authEnabled}
            onChange={(e) => handleChange({ target: { name: 'authEnabled', type: 'checkbox', checked: e.target.checked } })}
            title="Enable Authentication"
            description="Require login to access the dashboard and API"
          />

          {settings.authEnabled && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 rounded-xl bg-[#0c1624] border border-[#1c2d46]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">User Accounts & Roles</p>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    User credentials, admin roles, and password management are handled in the Users tab.
                  </p>
                </div>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('users')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors shrink-0 w-fit"
                >
                  Manage Users <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Preferences */}
      <SettingsSection>
        <SettingsHeader 
          title="Preferences" 
          icon={Sliders}
          description="Customize regional timezone timing and default navigation options for your Atlas workstation."
        />

        <SettingsGroup>
          <div>
            <SettingsLabel title="Timezone" icon={Globe} />
            <CustomSelect
              name="timezone"
              value={settings.timezone}
              onChange={handleChange}
              options={TIMEZONE_OPTIONS}
              searchable={true}
              placeholder="No adjustment (show US air dates as-is)"
            />
            <SettingsHelper text="Converts TMDB release dates to your local calendar day." />
          </div>

          <div>
            <SettingsLabel title="Default Landing Page" icon={Sliders} />
            <CustomSelect
              value={landingPage}
              onChange={(e) => {
                setLandingPage(e.target.value);
                localStorage.setItem('atlas_landing_page', e.target.value);
              }}
              options={LANDING_PAGE_OPTIONS}
              searchable={false}
            />
            <SettingsHelper text="The page loaded automatically when navigating to the root URL." />
          </div>
        </SettingsGroup>
      </SettingsSection>

      {/* Backup & Restore */}
      <BackupTab />
    </div>
  );
}
