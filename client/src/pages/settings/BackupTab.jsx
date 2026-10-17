import { useState, useRef } from 'react';
import api from '../../lib/api';
import { Download, RefreshCw, FileUp, X, Database, Trash2, AlertTriangle, ShieldAlert, Check } from 'lucide-react';
import { customAlert, customConfirm } from '../../utils/alerts';
import ModalShell from '../../components/shared/ModalShell';

export default function BackupTab() {
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const fileInputRef = useRef(null);

  // Purge state
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeMode, setPurgeMode] = useState('library'); // 'library' | 'full'
  const [confirmText, setConfirmText] = useState('');

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await api.get('/settings/backup', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.setAttribute('download', `atlas-backup-${timestamp}.sqlite`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      customAlert('Database backup downloaded successfully');
    } catch (err) {
      console.error('Backup failed:', err);
      customAlert('Failed to create database backup', 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      customAlert('Please select a backup file first', 'warning');
      return;
    }

    const confirmed = await customConfirm(
      'This will replace the current database with the backup file. A safety copy of your current database will be saved. Continue?',
      { title: 'Restore Database', confirmText: 'Restore', cancelText: 'Cancel', type: 'warning' }
    );
    if (!confirmed) return;

    setRestoring(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const res = await api.post('/settings/restore', { data: base64, filename: restoreFile.name });
        await customAlert(res.data.message || 'Database restored successfully.', 'success');
        setRestoreFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        window.location.reload();
      } catch (err) {
        console.error('Restore failed', err);
        customAlert(err.response?.data?.message || 'Failed to restore database', 'error');
      } finally {
        setRestoring(false);
      }
    };
    reader.onerror = () => {
      customAlert('Failed to read the selected file', 'error');
      setRestoring(false);
    };
    reader.readAsDataURL(restoreFile);
  };

  const handlePurge = async () => {
    if (purgeMode === 'full' && confirmText !== 'PURGE') {
      customAlert('Please type PURGE to confirm full database reset', 'warning');
      return;
    }

    setPurging(true);
    try {
      const res = await api.post('/settings/database/purge', { mode: purgeMode });
      if (res.data.status === 'success') {
        setPurgeModalOpen(false);
        await customAlert(res.data.message || 'Database purged successfully.', 'success');

        if (purgeMode === 'full') {
          // Clear session and redirect to setup
          localStorage.removeItem('atlas_token');
          localStorage.removeItem('atlas_user');
          window.location.href = '/setup';
        } else {
          // Reload page to reflect empty library
          window.location.reload();
        }
      }
    } catch (err) {
      console.error('Purge failed:', err);
      customAlert(err.response?.data?.message || 'Failed to purge database', 'error');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 shadow-sm space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
          <Database className="w-5 h-5 text-cyan-400 shrink-0" /> Database
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Export snapshots of your library and settings, restore from a previous point, or purge database records.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Backup Action */}
        <div className="flex flex-col justify-between space-y-4 p-4 rounded-xl bg-[#090f1d] border border-[#1c2d46]">
          <div>
            <h3 className="text-sm sm:text-base font-bold font-display text-slate-200 flex items-center gap-2">
              <Download className="w-4 h-4 text-cyan-400 shrink-0" /> Backup
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Download a complete snapshot of your Atlas database for safekeeping.
            </p>
          </div>
          <div>
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-b from-[#38a7f4] to-[#2291ea] text-slate-950 font-bold hover:brightness-110 transition-all shadow-md disabled:opacity-50 text-sm cursor-pointer"
            >
              {backingUp ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {backingUp ? 'Downloading...' : 'Download Backup'}
            </button>
          </div>
        </div>

        {/* Restore Action */}
        <div className="flex flex-col justify-between space-y-4 p-4 rounded-xl bg-[#090f1d] border border-[#1c2d46]">
          <div>
            <h3 className="text-sm sm:text-base font-bold font-display text-slate-200 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" /> Restore
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Restore from a previous backup. A safety backup of the current database will be saved automatically.
            </p>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sqlite,.db"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setRestoreFile(e.target.files[0]);
                }
              }}
            />

            {!restoreFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#101e31] hover:bg-[#16273d] text-slate-200 border border-[#1c2d46] hover:border-slate-500 font-semibold transition-all text-sm w-fit shadow-sm cursor-pointer"
              >
                <FileUp className="w-4 h-4 text-amber-400" />
                Select Restore File
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoring}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50 text-sm w-fit cursor-pointer"
                >
                  {restoring ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {restoring ? 'Restoring...' : 'Restore Backup'}
                </button>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0c1624] border border-[#1c2d46] text-xs text-slate-300 w-fit max-w-full">
                  <span className="truncate max-w-[180px] text-amber-300 font-medium" title={restoreFile.name}>
                    {restoreFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRestoreFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-0.5 text-slate-400 hover:text-rose-400 transition-colors rounded cursor-pointer"
                    title="Clear selected file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Purge Action */}
        <div className="flex flex-col justify-between space-y-4 p-4 rounded-xl bg-[#090f1d] border border-[#1c2d46]">
          <div>
            <h3 className="text-sm sm:text-base font-bold font-display text-slate-200 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400 shrink-0" /> Purge
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Purge all media items and history, or perform a complete reset to initial setup.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                setConfirmText('');
                setPurgeMode('library');
                setPurgeModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 hover:border-rose-500/50 font-semibold transition-all text-sm w-fit shadow-sm cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Purge Database
            </button>
          </div>
        </div>
      </div>

      {/* Purge Confirmation Modal */}
      {purgeModalOpen && (
        <ModalShell
          open={purgeModalOpen}
          onClose={() => setPurgeModalOpen(false)}
          size="md"
          title="Purge Database"
          icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <button
                type="button"
                onClick={() => setPurgeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurge}
                disabled={purging || (purgeMode === 'full' && confirmText !== 'PURGE')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-rose-950/40"
              >
                {purging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{purging ? 'Purging...' : purgeMode === 'full' ? 'Confirm Factory Reset' : 'Purge Library'}</span>
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <strong>Safety Notice:</strong> A complete backup snapshot of your current database will be saved automatically before purging.
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Select Purge Scope
              </label>

              {/* Mode Option 1: Library & History */}
              <div 
                onClick={() => setPurgeMode('library')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  purgeMode === 'library' 
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-slate-200' 
                    : 'bg-[#090f1d] border-[#1c2d46] text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {purgeMode === 'library' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    Purge Library & History Only
                  </span>
                  <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/15 px-2 py-0.5 rounded">Recommended</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Removes movies, shows, music, episodes, requests, watch history, and logs. Preserves user accounts, server settings, indexers, and quality profiles.
                </p>
              </div>

              {/* Mode Option 2: Full Factory Reset */}
              <div 
                onClick={() => setPurgeMode('full')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  purgeMode === 'full' 
                    ? 'bg-rose-500/10 border-rose-500/50 text-slate-200' 
                    : 'bg-[#090f1d] border-[#1c2d46] text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    {purgeMode === 'full' && <Check className="w-3.5 h-3.5 text-rose-400" />}
                    Full Factory Reset (Purge All)
                  </span>
                  <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded">Wipes All</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Completely wipes all database records including users and settings. Atlas will restart into the first-time setup wizard.
                </p>
              </div>
            </div>

            {/* Type PURGE confirmation for Full Factory Reset */}
            {purgeMode === 'full' && (
              <div className="pt-2 animate-fade-in">
                <label className="block text-xs font-bold text-rose-400 uppercase tracking-wider mb-1.5">
                  Type <span className="underline">PURGE</span> to confirm factory reset:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="PURGE"
                  className="w-full bg-[#0c1624] border border-rose-500/40 rounded-xl px-3.5 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 uppercase font-mono"
                />
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
}
