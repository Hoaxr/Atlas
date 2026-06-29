import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../lib/api';
import { Users, UserPlus, Trash2, Shield, User, Loader2, Edit, X, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { customConfirm } from '../../utils/alerts';

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
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
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await api.post('/users', newUser);
      toast.success(res.data.message);
      
      const provision = res.data.data.provisionResults;
      if (provision) {
        if (provision.plex === 'failed (email required)') {
          toast.error('User created, but Plex invite failed (Email is required)');
        } else if (provision.jellyfin === 'failed' || provision.emby === 'failed' || provision.plex === 'failed') {
          toast.error('User created, but failed to provision in some media servers');
        } else if (provision.jellyfin === 'success' || provision.emby === 'success' || provision.plex === 'success') {
          toast.success('Successfully provisioned/invited in media servers');
        }
      }

      setNewUser({ username: '', password: '', email: '', role: 'user', autoCreateMedia: false });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteUser = async (id, username) => {
    const confirm = await customConfirm(`Are you sure you want to delete ${username}?`);
    if (!confirm) return;

    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleImportUsers = async () => {
    setImporting(true);
    try {
      const res = await api.post('/users/import');
      const data = res.data.data;
      toast.success(`Import complete! Found ${data.totalDiscovered} users and imported ${data.importedCount} new users.`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to import users from media servers.');
    } finally {
      setImporting(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      // Create payload. Don't send empty password if not changing
      const payload = {
        username: editingUser.username,
        email: editingUser.email,
        role: editingUser.role
      };
      if (editingUser.password) {
        payload.password = editingUser.password;
      }

      const res = await api.put(`/users/${editingUser.id}`, payload);
      toast.success(res.data.message || 'User updated successfully');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      <div className="glass-panel p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <UserPlus className="w-5 h-5 text-cyan-400" /> Create User
        </h2>
        <form onSubmit={handleAddUser} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Username *</label>
              <input
                type="text"
                required
                value={newUser.username}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Password *</label>
              <input
                type="password"
                required
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center justify-between">
                <span>Email (Required for Plex invites)</span>
                <span className="text-xs text-slate-500">Make sure user has a Plex account</span>
              </label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="user">User (Request Portal Only)</option>
                <option value="admin">Admin (Full Access)</option>
              </select>
            </div>
          </div>
          
          <div className="bg-slate-900/50 p-1 rounded-xl border border-white/5">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:border-cyan-500/30 border border-transparent transition-colors group">
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={newUser.autoCreateMedia}
                  onChange={(e) => setNewUser({...newUser, autoCreateMedia: e.target.checked})}
                  className="sr-only"
                />
                {newUser.autoCreateMedia ? <CheckSquare className="w-5 h-5 text-cyan-500" /> : <Square className="w-5 h-5 text-slate-500" />}
              </div>
              <div>
                <span className="font-medium text-slate-300 group-hover:text-cyan-400 transition-colors">Auto-create user / invite in configured Media Servers (Jellyfin/Emby/Plex)</span>
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding || !newUser.username || !newUser.password}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {adding && <Loader2 className="w-4 h-4 animate-spin" />}
              {adding ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-rose-400" /> Administrators
        </h2>
        
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-3 px-4 font-medium">Username</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.filter(u => u.role === 'admin').map(user => (
                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-200">{user.username}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">{user.email || '-'}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingUser({ ...user, password: '' })}
                        className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                        title="Edit Admin"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                        title="Delete Admin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.filter(u => u.role === 'admin').length === 0 && (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-500">
                    No administrators found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" /> Managed Users
          </h2>
          <button
            onClick={handleImportUsers}
            disabled={importing}
            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            {importing ? 'Importing...' : 'Import from Media Servers'}
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-3 px-4 font-medium">Username</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.filter(u => u.role === 'user').map(user => (
                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-200">{user.username}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400">
                      <User className="w-3 h-3" /> User
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">{user.email || '-'}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingUser({ ...user, password: '' })}
                        className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                        title="Edit User"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.filter(u => u.role === 'user').length === 0 && (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-cyan-400" />
                Edit User: {editingUser.username}
              </h2>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateUser} className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Username *</label>
                  <input
                    type="text"
                    required
                    value={editingUser.username}
                    onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Password (Leave blank to keep current)</label>
                  <input
                    type="password"
                    value={editingUser.password}
                    onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                    placeholder="••••••••"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Email (Optional)</label>
                  <input
                    type="email"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Role</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="user">User (Request Portal Only)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating || !editingUser.username}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
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
