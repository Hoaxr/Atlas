import { useState } from 'react';
import api from '../../lib/api';
import { Download, RefreshCw, FileText } from 'lucide-react';
import { customAlert, customConfirm } from '../../utils/alerts';

export default function BackupTab() {
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);

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
      console.error('Backup failed', err);
      customAlert('Failed to download backup', 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      customAlert('Please select a backup file first', 'error');
      return;
    }

    const confirmed = await customConfirm(
      'Restoring will replace ALL current data with the backup. This cannot be undone. Continue?'
    );
    if (!confirmed) return;

    setRestoring(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        await api.post('/settings/restore', { data: base64, filename: restoreFile.name });
        customAlert('Database restored successfully. Please refresh the page.');
        setRestoreFile(null);
      };
      reader.readAsDataURL(restoreFile);
    } catch (err) {
      console.error('Restore failed', err);
      customAlert('Failed to restore database', 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-300 mb-2">Database Backup & Restore</h2>

      <div className="glass-panel rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" /> Backup Database
          </h2>
          <p className="text-xs text-slate-500 mt-1">Download a complete snapshot of your Atlas database for safekeeping.</p>
        </div>
        <button
          onClick={handleBackup}
          disabled={backingUp}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-white font-bold hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20 disabled:opacity-50"
        >
          {backingUp ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {backingUp ? 'Downloading...' : 'Download Backup'}
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-400" /> Restore Database
          </h2>
          <p className="text-xs text-slate-500 mt-1">Restore from a previous backup. This will replace all current data. A backup of the current database will be saved automatically.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex-1">
              <div className="glass-input cursor-pointer flex items-center gap-3 py-3 px-4">
                <FileText className="w-5 h-5 text-slate-500" />
                <span className={restoreFile ? 'text-slate-200' : 'text-slate-500'}>
                  {restoreFile ? restoreFile.name : 'Choose a .sqlite backup file...'}
                </span>
              </div>
              <input
                type="file"
                accept=".sqlite,.db"
                className="hidden"
                onChange={(e) => setRestoreFile(e.target.files[0])}
              />
            </label>
          </div>

          <button
            onClick={handleRestore}
            disabled={!restoreFile || restoring}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {restoring ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {restoring ? 'Restoring...' : 'Restore Backup'}
          </button>
        </div>
      </div>
    </div>
  );
}
