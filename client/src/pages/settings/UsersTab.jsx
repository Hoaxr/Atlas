import { useState, useEffect, useMemo } from 'react';
import api from '../../lib/api';
import useWebSocket from '../../lib/useWebSocket';
import {
  Users, UserPlus, Trash2, Shield, User, Edit,
  Search, Mail, Download,
  UserCog, ShieldAlert, Clock
} from 'lucide-react';
import { customAlert, customConfirm } from '../../utils/alerts';
import CustomSelect from '../../components/shared/CustomSelect';
import PasswordInput from '../../components/shared/PasswordInput';
import Button from '../../components/shared/Button';
import ModalShell from '../../components/shared/ModalShell';
import ToggleRow from '../../components/shared/ToggleRow';
import { SettingsSection, SettingsHeader, SettingsLabel, SettingsHelper } from '../../components/settings/layout';

// Visual tokens shared with the other settings tabs — keep in sync
const PANEL_CLASS = 'glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 shadow-sm';
const INPUT_CLASS = 'w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600';
const LABEL_CLASS = 'block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5';
const CARD_CLASS = 'rounded-xl bg-[#101e31] border border-[#1c2d46] hover:border-[#274063] transition-colors';
const BADGE_CLASS = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border whitespace-nowrap shrink-0';

const STAT_ACCENTS = {
  cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

function StatCard({ icon: Icon, accent = 'cyan', value, label }) {
  return (
    <div className={`flex items-center gap-3 p-3.5 ${CARD_CLASS}`}>
      <div className={`p-2 rounded-lg border shrink-0 ${STAT_ACCENTS[accent] || STAT_ACCENTS.cyan}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold font-display text-slate-100 leading-none">{value}</p>
        <p className="text-xs text-slate-400 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

const roleOptions = [
  { label: 'User (Request Portal Only)', value: 'user' },
  { label: 'Admin (Full Access)', value: 'admin' }
];

const ORIGIN_STYLES = {
  plex:     { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25', label: 'Plex' },
  jellyfin: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/25', label: 'Jellyfin' },
  emby:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', label: 'Emby' },
  atlas:    { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/25', label: 'Atlas' },
};

function getOriginStyle(origin) {
  return ORIGIN_STYLES[origin] || ORIGIN_STYLES.atlas;
}

function getInitials(name) {
  if (!name) return '?';
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name) {
  if (!name) return 'bg-slate-700';
  const colors = [
    'bg-cyan-600', 'bg-blue-600', 'bg-indigo-600', 'bg-violet-600',
    'bg-purple-600', 'bg-fuchsia-600', 'bg-pink-600', 'bg-rose-600',
    'bg-emerald-600', 'bg-teal-600', 'bg-amber-600', 'bg-orange-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');

  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    role: 'user',
    autoCreateMedia: false,
    request_limit: '',
    can_request: true,
    can_download: true
  });

  const [editingUser, setEditingUser] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data);
    } catch {
      customAlert('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Listen for presence events via WebSocket
  const { onEvent } = useWebSocket();
  useEffect(() => {
    return onEvent((data) => {
      if (data.type === 'userOnline') {
        setUsers(prev => prev.map(u => u.id === data.userId ? { ...u, online: true } : u));
      } else if (data.type === 'userOffline') {
        setUsers(prev => prev.map(u => u.id === data.userId ? { ...u, online: false } : u));
      }
    });
  }, [onEvent]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.origin && u.origin.toLowerCase().includes(q))
    );
  }, [users, search]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    users: users.filter(u => u.role === 'user').length,
    imported: users.filter(u => u.origin && u.origin !== 'atlas').length,
  }), [users]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const payload = {
        username: newUser.username,
        password: newUser.password,
        email: newUser.email,
        role: newUser.role,
        autoCreateMedia: newUser.autoCreateMedia,
        request_limit: newUser.request_limit !== '' ? parseInt(newUser.request_limit, 10) : null,
        permissions: {
          can_request: newUser.can_request,
          can_download: newUser.can_download
        }
      };
      const res = await api.post('/users', payload);
      customAlert(res.data.message);

      const provision = res.data.data.provisionResults;
      if (provision) {
        if (provision.plex === 'failed (email required)') {
          customAlert('User created, but Plex invite failed (Email is required)');
        } else if (provision.jellyfin === 'failed' || provision.emby === 'failed' || provision.plex === 'failed') {
          customAlert('User created, but failed to provision in some media servers');
        } else if (provision.jellyfin === 'success' || provision.emby === 'success' || provision.plex === 'success') {
          customAlert('Successfully provisioned/invited in media servers');
        }
      }

      setNewUser({
        username: '', password: '', email: '', role: 'user', autoCreateMedia: false,
        request_limit: '', can_request: true, can_download: true
      });
      fetchUsers();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to create user');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteUser = async (id, username) => {
    const confirm = await customConfirm(`Are you sure you want to delete "${username}"?`);
    if (!confirm) return;

    try {
      await api.delete(`/users/${id}`);
      customAlert('User deleted');
      fetchUsers();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleImportUsers = async () => {
    setImporting(true);
    try {
      const res = await api.post('/users/import');
      const data = res.data.data;
      customAlert(`Import complete! Found ${data.totalDiscovered} users and imported ${data.importedCount} new users.`);
      fetchUsers();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to import users from media servers.');
    } finally {
      setImporting(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const payload = {
        username: editingUser.username,
        email: editingUser.email,
        role: editingUser.role,
        request_limit: editingUser.request_limit !== '' && editingUser.request_limit !== null
          ? parseInt(editingUser.request_limit, 10)
          : null,
        permissions: {
          can_request: editingUser.can_request !== false,
          can_download: editingUser.can_download !== false
        }
      };
      if (editingUser.password) {
        payload.password = editingUser.password;
      }

      const res = await api.put(`/users/${editingUser.id}`, payload);
      customAlert(res.data.message || 'User updated successfully');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to update user');
    } finally {
      setUpdating(false);
    }
  };

  function UserRow({ user }) {
    const originStyle = getOriginStyle(user.origin);
    const avatarColor = getAvatarColor(user.username);
    const createdDate = user.created_at ? formatDate(user.created_at) : null;
    const lastLogin = user.last_login ? formatDate(user.last_login) : null;
    const isAdmin = user.role === 'admin';

    return (
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#101e31]/60 transition-colors">
        {/* User */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`relative shrink-0 w-9 h-9 rounded-lg ${avatarColor} flex items-center justify-center shadow-sm`}>
            <span className="text-xs font-bold text-white">{getInitials(user.username)}</span>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c1626] ${user.online ? 'bg-emerald-500' : 'bg-slate-600'}`} title={user.online ? 'Online' : 'Offline'} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{user.username}</p>
            {user.email ? (
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            ) : (
              <p className="text-xs italic text-slate-500">No email</p>
            )}
          </div>
        </div>

        {/* Role + origin */}
        <div className="hidden sm:flex flex-wrap items-center gap-1.5 w-44 shrink-0">
          {isAdmin ? (
            <span className={`${BADGE_CLASS} bg-rose-500/10 text-rose-400 border-rose-500/20`}>
              <Shield className="w-2.5 h-2.5" /> Admin
            </span>
          ) : (
            <span className={`${BADGE_CLASS} bg-cyan-500/10 text-cyan-400 border-cyan-500/20`}>
              <User className="w-2.5 h-2.5" /> User
            </span>
          )}
          <div className={`${BADGE_CLASS} ${originStyle.bg} ${originStyle.text} ${originStyle.border}`}>
            {originStyle.label}
          </div>
          {!isAdmin && user.permissions?.can_request === false && (
            <span className={`${BADGE_CLASS} bg-rose-500/10 text-rose-400 border-rose-500/20`}>
              No Requests
            </span>
          )}
          {!isAdmin && user.request_limit !== null && user.request_limit !== undefined && (
            <span className={`${BADGE_CLASS} bg-cyan-500/10 text-cyan-400 border-cyan-500/20`}>
              {user.request_limit} req/wk
            </span>
          )}
        </div>

        {/* Created */}
        <div className="hidden md:block w-28 shrink-0 text-xs text-slate-400 truncate">{createdDate || '—'}</div>

        {/* Last login */}
        <div className="hidden lg:block w-28 shrink-0 text-xs text-slate-400 truncate">{lastLogin || '—'}</div>

        {/* Actions */}
        <div className="shrink-0 flex items-center justify-end gap-2 sm:w-[150px]">
          <Button
            size="sm"
            variant="secondary"
            icon={Edit}
            onClick={() => setEditingUser({
              ...user,
              password: '',
              request_limit: user.request_limit !== null && user.request_limit !== undefined ? String(user.request_limit) : '',
              can_request: user.permissions?.can_request !== false,
              can_download: user.permissions?.can_download !== false
            })}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={Trash2}
            onClick={() => handleDeleteUser(user.id, user.username)}
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  function UserListHeader() {
    return (
      <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 bg-[#15243b] border-b border-[#1c2d46] text-[11px] font-bold uppercase tracking-wider text-slate-300">
        <span className="flex-1">User</span>
        <span className="w-44 shrink-0">Role</span>
        <span className="hidden md:block w-28 shrink-0">Created</span>
        <span className="hidden lg:block w-28 shrink-0">Last Login</span>
        <span className="w-[150px] shrink-0 text-right">Actions</span>
      </div>
    );
  }

  if (loading) return null;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Users} accent="cyan" value={stats.total} label="Total Users" />
        <StatCard icon={Shield} accent="rose" value={stats.admins} label="Admins" />
        <StatCard icon={User} accent="indigo" value={stats.users} label="Regular Users" />
        <StatCard icon={Download} accent="amber" value={stats.imported} label="Imported" />
      </div>

      {/* Create User Panel */}
      <SettingsSection>
        <SettingsHeader
          title="Create User"
          icon={UserPlus}
          description="Create new users with role-based access. Users can be provisioned in connected media servers automatically."
        />
        <form onSubmit={handleAddUser} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <SettingsLabel title={<span className="flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5 text-cyan-400" /> Username</span>} required />
              <input
                type="text"
                required
                value={newUser.username}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                className={INPUT_CLASS}
                placeholder="Enter username"
              />
            </div>
            <div>
              <SettingsLabel title={<span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-cyan-400" /> Password</span>} required />
              <PasswordInput
                required
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                className={INPUT_CLASS}
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <SettingsLabel title={<span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-cyan-400" /> Email</span>} />
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                className={INPUT_CLASS}
                placeholder="Required for Plex invites"
              />
              <SettingsHelper text="Make sure the user has a Plex account" />
            </div>
            <div>
              <SettingsLabel title={<span className="flex items-center gap-1.5"><UserCog className="w-3.5 h-3.5 text-cyan-400" /> Role</span>} />
              <CustomSelect
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                options={roleOptions}
              />
            </div>
            {newUser.role !== 'admin' && (
              <div>
                <SettingsLabel title={<span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-cyan-400" /> Weekly Request Quota</span>} />
                <input
                  type="number"
                  min="0"
                  value={newUser.request_limit}
                  onChange={(e) => setNewUser({...newUser, request_limit: e.target.value})}
                  className={INPUT_CLASS}
                  placeholder="Leave blank for unlimited"
                />
                <SettingsHelper text="Max requests per rolling 7 days" />
              </div>
            )}
          </div>

          {/* Permission toggles */}
          <div className={`grid grid-cols-1 gap-3 ${newUser.role === 'admin' ? '' : 'md:grid-cols-3'}`}>
            {newUser.role !== 'admin' && (
              <>
                <ToggleRow
                  checked={newUser.can_request}
                  onChange={() => setNewUser({...newUser, can_request: !newUser.can_request})}
                  title="Allow Requests"
                  description="Let this user submit new movie and show requests."
                />
                <ToggleRow
                  checked={newUser.can_download}
                  onChange={() => setNewUser({...newUser, can_download: !newUser.can_download})}
                  title="Allow Downloads"
                  description="Let this user send approved requests to your download clients."
                />
              </>
            )}
            <ToggleRow
              checked={newUser.autoCreateMedia}
              onChange={() => setNewUser({...newUser, autoCreateMedia: !newUser.autoCreateMedia})}
              title="Auto-create in Media Servers"
              description="Automatically create/invite this user in Jellyfin, Emby, and/or Plex."
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              icon={UserPlus}
              loading={adding}
              disabled={!newUser.username || !newUser.password}
            >
              {adding ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </form>
      </SettingsSection>

      {/* User List Panel */}
      <SettingsSection>
        <SettingsHeader
          title="All Users"
          icon={Users}
          description={`${filteredUsers.length} of ${users.length} user${users.length !== 1 ? 's' : ''}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            {/* Search */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className={`${INPUT_CLASS} pl-10`}
              />
            </div>
            <Button
              variant="secondary"
              icon={Download}
              loading={importing}
              onClick={handleImportUsers}
              className="shrink-0 w-fit"
            >
              {importing ? 'Importing...' : 'Import from Media Servers'}
            </Button>
          </div>
        </SettingsHeader>

        {/* Users list */}
        <div className="rounded-xl border border-[#1c2d46] bg-[#0c1626]/90 overflow-hidden">
          <UserListHeader />
          {filteredUsers.length === 0 ? (
            <div className="py-10 px-4 text-center text-xs sm:text-sm text-slate-400">
              {search ? 'No users match your search.' : 'No users yet. Create one above or import from your media servers.'}
            </div>
          ) : (
            <div className="divide-y divide-[#1c2d46]/70">
              {filteredUsers.map(user => (
                <UserRow key={user.id} user={user} />
              ))}
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Edit User Modal */}
      <ModalShell
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        size="lg"
        icon={<Edit className="w-5 h-5 text-cyan-400" />}
        title="Edit User"
      >
        {editingUser && (
          <form onSubmit={handleUpdateUser} className="space-y-5">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-[#101e31] border border-[#1c2d46]">
              <div className={`w-12 h-12 rounded-xl shrink-0 ${getAvatarColor(editingUser.username)} flex items-center justify-center shadow-sm`}>
                <span className="text-lg font-bold text-white">{getInitials(editingUser.username)}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">{editingUser.username}</p>
                <p className="text-xs text-slate-400 truncate">
                  {editingUser.role === 'admin' ? 'Administrator' : 'User'}
                  {editingUser.email ? ` · ${editingUser.email}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <SettingsLabel title="Username" required />
                <input
                  type="text"
                  required
                  value={editingUser.username}
                  onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <SettingsLabel title="Password" />
                <PasswordInput
                  value={editingUser.password}
                  onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                  className={INPUT_CLASS}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div>
                <SettingsLabel title="Email" />
                <input
                  type="email"
                  value={editingUser.email || ''}
                  onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                  className={INPUT_CLASS}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <SettingsLabel title="Role" />
                <CustomSelect
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                  options={roleOptions}
                />
              </div>

              {editingUser.role !== 'admin' && (
                <>
                  <div>
                    <SettingsLabel title={<span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-cyan-400" /> Weekly Request Quota</span>} />
                    <input
                      type="number"
                      min="0"
                      value={editingUser.request_limit ?? ''}
                      onChange={(e) => setEditingUser({...editingUser, request_limit: e.target.value})}
                      className={INPUT_CLASS}
                      placeholder="Leave blank for unlimited"
                    />
                    <SettingsHelper text="Max requests per rolling 7 days" />
                  </div>
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ToggleRow
                      checked={editingUser.can_request !== false}
                      onChange={() => setEditingUser({...editingUser, can_request: editingUser.can_request === false})}
                      title="Allow Requests"
                      description="Let this user submit new movie and show requests."
                    />
                    <ToggleRow
                      checked={editingUser.can_download !== false}
                      onChange={() => setEditingUser({...editingUser, can_download: editingUser.can_download === false})}
                      title="Allow Downloads"
                      description="Let this user send approved requests to your download clients."
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!editingUser.username}
                loading={updating}
              >
                {updating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </ModalShell>
    </div>
  );
}
