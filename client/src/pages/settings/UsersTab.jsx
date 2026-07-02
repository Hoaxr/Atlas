import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../lib/api';
import {
  Users, UserPlus, Trash2, Shield, User, Loader2, Edit, X,
  CheckSquare, Square, Search, Mail, Download,
  UserCog, ShieldAlert, Clock
} from 'lucide-react';
import { customAlert, customConfirm } from '../../utils/alerts';
import CustomSelect from '../../components/shared/CustomSelect';

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
    autoCreateMedia: false
  });

  const [editingUser, setEditingUser] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data);
    } catch (err) {
      customAlert('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.origin && u.origin.toLowerCase().includes(q))
    );
  }, [users, search]);

  const admins = useMemo(() => filteredUsers.filter(u => u.role === 'admin'), [filteredUsers]);
  const regularUsers = useMemo(() => filteredUsers.filter(u => u.role === 'user'), [filteredUsers]);

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
      const res = await api.post('/users', newUser);
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

      setNewUser({ username: '', password: '', email: '', role: 'user', autoCreateMedia: false });
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
        role: editingUser.role
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

  function UserCard({ user, isAdmin }) {
    const originStyle = getOriginStyle(user.origin);
    const avatarColor = getAvatarColor(user.username);
    const createdDate = user.created_at ? formatDate(user.created_at) : null;

    return (
      <div className="group flex items-center gap-4 p-4 rounded-xl bg-slate-900/30 border border-white/5 hover:border-white/10 hover:bg-slate-900/50 transition-all duration-200">
        {/* Avatar */}
        <div className={`relative shrink-0 w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center shadow-lg shadow-black/20`}>
          <span className="text-sm font-bold text-white">{getInitials(user.username)}</span>
          {/* Online dot placeholder */}
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 bg-emerald-500" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-slate-200 truncate">{user.username}</span>
            {isAdmin ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20 uppercase tracking-wider">
                <Shield className="w-2.5 h-2.5" /> Admin
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                <User className="w-2.5 h-2.5" /> User
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {user.email ? (
              <span className="flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 shrink-0" /> {user.email}
              </span>
            ) : (
              <span className="italic text-slate-600">No email</span>
            )}
            {createdDate && (
              <span className="flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3" /> {createdDate}
              </span>
            )}
          </div>
        </div>

        {/* Origin badge */}
        <div className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-md border ${originStyle.bg} ${originStyle.text} ${originStyle.border} uppercase tracking-wider`}>
          {originStyle.label}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditingUser({ ...user, password: '' })}
            className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-all"
            title="Edit user"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDeleteUser(user.id, user.username)}
            className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all"
            title="Delete user"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  function UserListSection({ title, icon, iconColor, users, isAdmin, emptyMessage }) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className={`p-1.5 rounded-lg ${iconColor}/10`}>
            {icon}
          </div>
          <h3 className="text-lg font-bold text-slate-200">{title}</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${iconColor}/15 ${iconColor} border border-white/5`}>
            {users.length}
          </span>
        </div>
        {users.length > 0 ? (
          <div className="space-y-2">
            {users.map(user => (
              <UserCard key={user.id} user={user} isAdmin={isAdmin} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className={`p-3 rounded-full ${iconColor}/10 mb-3`}>
              {icon}
            </div>
            <p className="text-sm text-slate-500">{emptyMessage}</p>
          </div>
        )}
      </div>
    );
  }

  if (loading) return null;

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-200">{stats.total}</p>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Total Users</p>
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10">
              <Shield className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-200">{stats.admins}</p>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Admins</p>
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <User className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-200">{stats.users}</p>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Regular Users</p>
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Download className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-200">{stats.imported}</p>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Imported</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create User Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-cyan-400" /> Create User
            </h2>
            <p className="text-xs text-slate-500 mt-1">Create new users with role-based access. Users can be provisioned in connected media servers automatically.</p>
          </div>
        </div>
        <form onSubmit={handleAddUser} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-cyan-400" /> Username <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={newUser.username}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                placeholder="Enter username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" /> Password <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                required
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" /> Email
              </label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                placeholder="Required for Plex invites"
              />
              <p className="text-[11px] text-slate-600">Make sure the user has a Plex account</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                <UserCog className="w-3.5 h-3.5 text-cyan-400" /> Role
              </label>
              <CustomSelect
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                options={roleOptions}
              />
            </div>
          </div>

          <div className="bg-slate-900/30 rounded-xl border border-white/5 p-1">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-800/30 transition-colors group">
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={newUser.autoCreateMedia}
                  onChange={(e) => setNewUser({...newUser, autoCreateMedia: e.target.checked})}
                  className="sr-only"
                />
                {newUser.autoCreateMedia
                  ? <CheckSquare className="w-5 h-5 text-cyan-400" />
                  : <Square className="w-5 h-5 text-slate-600 group-hover:text-slate-500 transition-colors" />}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 group-hover:text-cyan-400 transition-colors">Auto-create in Media Servers</p>
                <p className="text-xs text-slate-600 mt-0.5">Automatically create/invite this user in Jellyfin, Emby, and/or Plex</p>
              </div>
            </label>
          </div>

          <div className="flex justify-end border-t border-white/5 pt-5">
            <button
              type="submit"
              disabled={adding || !newUser.username || !newUser.password}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-6 py-2.5 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              {adding && <Loader2 className="w-4 h-4 animate-spin" />}
              {adding ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* User List Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" /> All Users
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full sm:w-52 bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
              />
            </div>
            <button
              onClick={handleImportUsers}
              disabled={importing}
              className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm border border-indigo-500/10 hover:border-indigo-500/20"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>

        {/* Admins section */}
        <div className="mb-8">
          <UserListSection
            title="Administrators"
            icon={<Shield className="w-4 h-4 text-rose-400" />}
            iconColor="text-rose-400"
            users={admins}
            isAdmin={true}
            emptyMessage="No administrators found."
          />
        </div>

        {/* Divider */}
        {admins.length > 0 && regularUsers.length > 0 && (
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-800 px-3 text-xs text-slate-600">Users</span>
            </div>
          </div>
        )}

        {/* Regular users section */}
        <UserListSection
          title="Managed Users"
          icon={<User className="w-4 h-4 text-indigo-400" />}
          iconColor="text-indigo-400"
          users={regularUsers}
          isAdmin={false}
          emptyMessage={search ? 'No users match your search.' : 'No users yet. Create one above or import from your media servers.'}
        />
      </div>

      {/* Edit User Modal */}
      {editingUser && createPortal(
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setEditingUser(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-gradient-to-r from-slate-900 to-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/10">
                  <Edit className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Edit User</h2>
                  <p className="text-xs text-slate-500">{editingUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-5">
              <div className="flex items-center gap-4 mb-4 p-4 rounded-xl bg-slate-800/30 border border-white/5">
                <div className={`w-12 h-12 rounded-full ${getAvatarColor(editingUser.username)} flex items-center justify-center shadow-lg shadow-black/20`}>
                  <span className="text-lg font-bold text-white">{getInitials(editingUser.username)}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">{editingUser.username}</p>
                  <p className="text-xs text-slate-500">
                    {editingUser.role === 'admin' ? 'Administrator' : 'User'}
                    {editingUser.email ? ` · ${editingUser.email}` : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Username <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    required
                    value={editingUser.username}
                    onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Password</label>
                  <input
                    type="password"
                    value={editingUser.password}
                    onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Email</label>
                  <input
                    type="email"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Role</label>
                  <CustomSelect
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                    options={roleOptions}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-5 py-2.5 rounded-xl font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating || !editingUser.username}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-6 py-2.5 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-cyan-500/20"
                >
                  {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
