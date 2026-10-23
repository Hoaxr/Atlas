import { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldAlert, KeyRound, Copy, Check,
  ArrowRight, Download, AlertTriangle
} from 'lucide-react';
import api from '../lib/api';
import { customAlert } from '../utils/alerts';
import ModalShell from './shared/ModalShell';
import PasswordInput from './shared/PasswordInput';
import Button from './shared/Button';

export default function TwoFactorAuthModal({ isOpen, onClose, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  
  // Setup flow state: 'idle' | 'scanning' | 'verified'
  const [step, setStep] = useState('idle');
  const [setupData, setSetupData] = useState(null); // { secret, qr_code, otpauth_url }
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // Disable flow state
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  // Fetch status on open
  useEffect(() => {
    if (!isOpen) {
      setStep('idle');
      setSetupData(null);
      setVerifyCode('');
      setBackupCodes([]);
      setDisablePassword('');
      setDisableCode('');
      return;
    }

    setStatusLoading(true);
    api.get('/auth/2fa/status')
      .then(res => {
        if (res.data?.status === 'success') {
          setIsEnabled(!!res.data.data?.enabled);
        }
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, [isOpen]);

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/setup');
      if (res.data?.status === 'success') {
        setSetupData(res.data.data);
        setStep('scanning');
      } else {
        customAlert(res.data?.message || 'Failed to initialize 2FA setup');
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async (e) => {
    e.preventDefault();
    if (!verifyCode.trim()) {
      customAlert('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/enable', { code: verifyCode.trim() });
      if (res.data?.status === 'success') {
        setBackupCodes(res.data.data?.backup_codes || []);
        setIsEnabled(true);
        setStep('verified');
        if (onStatusChange) onStatusChange(true);
      } else {
        customAlert(res.data?.message || 'Failed to enable 2FA');
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    if (!disablePassword || !disableCode.trim()) {
      customAlert('Password and verification code are required');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/disable', {
        password: disablePassword,
        code: disableCode.trim()
      });
      if (res.data?.status === 'success') {
        customAlert('Two-factor authentication disabled');
        setIsEnabled(false);
        setDisablePassword('');
        setDisableCode('');
        if (onStatusChange) onStatusChange(false);
        onClose();
      } else {
        customAlert(res.data?.message || 'Failed to disable 2FA');
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Invalid password or verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleCopyBackupCodes = () => {
    if (!backupCodes.length) return;
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  const handleDownloadBackupCodes = () => {
    if (!backupCodes.length) return;
    const blob = new Blob(
      [
        `ATLAS MEDIA MANAGER - EMERGENCY RECOVERY BACKUP CODES\n`,
        `Generated: ${new Date().toISOString()}\n\n`,
        `Each backup code can be used once if you lose access to your authenticator device.\n`,
        `Keep these codes in a safe, secure place.\n\n`,
        backupCodes.map((code, idx) => `${idx + 1}. ${code}`).join('\n'),
        `\n`
      ],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atlas-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      size="md"
      icon={<ShieldCheck className="w-5 h-5 text-cyan-400" />}
      title="Two-Factor Authentication (2FA)"
      noScroll={step === 'idle'}
    >
      <div className="space-y-5">
        {statusLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading 2FA status...</p>
          </div>
        ) : isEnabled && step !== 'verified' ? (
          /* ── 2FA Currently Enabled View ── */
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-6 h-6 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-300">Two-Factor Authentication is Active</p>
                <p className="text-xs text-emerald-400/80 mt-0.5">
                  Your account requires a 6-digit TOTP code or emergency backup code at every sign-in.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0c1624] border border-[#1c2d46] space-y-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider">Disable 2FA Protection</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                To turn off two-factor authentication, confirm your current password and a valid code from your authenticator app.
              </p>

              <form onSubmit={handleDisable2FA} className="space-y-3.5 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Current Password</label>
                  <PasswordInput
                    value={disablePassword}
                    onChange={e => setDisablePassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Authenticator Code or Backup Code</label>
                  <input
                    type="text"
                    value={disableCode}
                    onChange={e => setDisableCode(e.target.value)}
                    placeholder="6-digit code or recovery code"
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Close
                  </Button>
                  <Button type="submit" variant="danger" disabled={loading}>
                    {loading ? 'Disabling...' : 'Disable Two-Factor Auth'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : step === 'idle' ? (
          /* ── 2FA Disabled Initial View ── */
          <div className="space-y-5 animate-fade-in text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/10">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 max-w-sm mx-auto">
              <h3 className="text-base font-bold text-slate-100">Protect Your Administrator Account</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add an extra layer of defense using time-based one-time passwords (TOTP) compatible with Google Authenticator, Authy, 1Password, or Bitwarden.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleStartSetup} disabled={loading}>
                {loading ? 'Generating...' : 'Configure Two-Factor Auth'} <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        ) : step === 'scanning' ? (
          /* ── Setup Step: Scan QR Code & Enter Code ── */
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Step 1 of 2</p>
              <h4 className="text-sm font-bold text-slate-100">Scan QR Code in Authenticator App</h4>
              <p className="text-xs text-slate-400">
                Open your authenticator app (Google Authenticator, Authy, Apple Passwords) and scan the QR code below.
              </p>
            </div>

            {/* QR Code */}
            {setupData?.qr_code && (
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl w-fit mx-auto shadow-xl">
                <img
                  src={setupData.qr_code}
                  alt="2FA TOTP QR Code"
                  className="w-44 h-44 object-contain rounded-lg"
                />
              </div>
            )}

            {/* Manual Secret Key */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400">Unable to scan? Enter manual secret:</label>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-cyan-300">
                <span className="flex-1 break-all select-all">{setupData?.secret}</span>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors shrink-0"
                  title="Copy secret to clipboard"
                >
                  {copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Step 2 Form */}
            <form onSubmit={handleVerifyAndEnable} className="space-y-3.5 pt-2 border-t border-slate-800">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Step 2 of 2</p>
                <label className="text-xs font-medium text-slate-200">Enter the 6-digit verification code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono tracking-widest text-slate-100 placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button type="button" variant="ghost" onClick={() => setStep('idle')}>
                  Back
                </Button>
                <Button type="submit" variant="primary" disabled={loading || verifyCode.length !== 6}>
                  {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          /* ── Success & Emergency Backup Codes View ── */
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-6 h-6 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-300">2FA Successfully Enabled!</p>
                <p className="text-xs text-emerald-400/80 mt-0.5">
                  Save your emergency backup recovery codes now.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-1.5 text-xs">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Important Recovery Warning
              </p>
              <p className="text-amber-400/90 leading-relaxed">
                If you ever lose your phone or authenticator app, these single-use recovery codes are the only way to sign in without database access. Each code can only be used once.
              </p>
            </div>

            {/* Backup Codes Grid */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="grid grid-cols-2 gap-2 text-center font-mono text-xs text-cyan-300 select-all">
                {backupCodes.map((code, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 tracking-wider">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCopyBackupCodes}>
                  {copiedBackup ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedBackup ? 'Copied' : 'Copy Codes'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadBackupCodes}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Download .txt
                </Button>
              </div>

              <Button type="button" variant="primary" onClick={onClose}>
                Done & Saved
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
