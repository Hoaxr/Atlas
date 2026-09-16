import { useState, useRef } from 'react';
import api from '../../lib/api';
import { Download, RefreshCw, FileUp, X, Database } from 'lucide-react';
import { customAlert, customConfirm } from '../../utils/alerts';

export default function BackupTab() {
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const fileInputRef = useRef(null);

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

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
            <Database className="w-5 h-5 text-cyan-400 shrink-0" /> Backup & Restore
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Export snapshots of your library and settings or restore from a previous point in time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Backup Action */}
          <div className="flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-200 flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-400 shrink-0" /> Backup Database
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Download a complete snapshot of your Atlas database for safekeeping.
              </p>
            </div>
            <div>
              <button
                onClick={handleBackup}
                disabled={backingUp}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-b from-[#38a7f4] to-[#2291ea] text-slate-950 font-bold hover:brightness-110 transition-all shadow-md disabled:opacity-50 text-sm"
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
          <div className="flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-200 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" /> Restore Database
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Restore from a previous backup. A backup of the current database will be saved automatically.
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
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#101e31] hover:bg-[#16273d] text-slate-200 border border-[#1c2d46] hover:border-slate-500 font-semibold transition-all text-sm w-fit shadow-sm"
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
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50 text-sm w-fit"
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
                      className="p-0.5 text-slate-400 hover:text-rose-400 transition-colors rounded"
                      title="Clear selected file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
