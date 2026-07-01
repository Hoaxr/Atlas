import { useState, useEffect } from 'react';
import { Clock, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { customAlert, customConfirm } from '../utils/alerts';
import MediaDetailsModal from '../components/MediaDetailsModal';

export default function Requests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [currentRequestId, setCurrentRequestId] = useState(null);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/requests');
      setRequests(res.data.data);
    } catch (err) {
      customAlert('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApproveInit = (req) => {
    setCurrentRequestId(req.id);
    setSelectedMedia({ id: req.tmdb_id, type: req.type });
  };

  const handleAddedToLibrary = async () => {
    // Media was successfully added to library via the modal
    setSelectedMedia(null);
    try {
      await api.put(`/requests/${currentRequestId}/approve`);
      customAlert('Request marked as approved');
      fetchRequests();
    } catch (err) {
      customAlert('Failed to update request status');
    }
  };

  const handleDeny = async (id) => {
    const confirm = await customConfirm('Are you sure you want to deny this request?');
    if (!confirm) return;

    try {
      await api.put(`/requests/${id}/deny`);
      customAlert('Request denied');
      fetchRequests();
    } catch (err) {
      customAlert('Failed to deny request');
    }
  };

  const handleDelete = async (id) => {
    const confirm = await customConfirm('Are you sure you want to delete this request permanently?');
    if (!confirm) return;

    try {
      await api.delete(`/requests/${id}`);
      customAlert('Request deleted');
      fetchRequests();
    } catch (err) {
      customAlert('Failed to delete request');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'denied': return <XCircle className="w-5 h-5 text-rose-400" />;
      default: return <Clock className="w-5 h-5 text-amber-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Requests</h1>
        <p className="text-slate-400 mt-2">Manage user requests for movies and TV shows.</p>
      </div>

      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 bg-slate-900/50">
                <th className="py-4 px-6 font-medium">Title</th>
                <th className="py-4 px-6 font-medium">Type</th>
                <th className="py-4 px-6 font-medium">Requested By</th>
                <th className="py-4 px-6 font-medium">Status</th>
                <th className="py-4 px-6 font-medium">Date</th>
                <th className="py-4 px-6 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {requests.map(req => (
                <tr key={req.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-slate-200">{req.title}</td>
                  <td className="py-4 px-6 text-slate-400 uppercase text-xs tracking-wider">{req.type}</td>
                  <td className="py-4 px-6 text-slate-300">{req.requested_by}</td>
                  <td className="py-4 px-6">
                    <span className="flex items-center gap-2 capitalize text-slate-300">
                      {getStatusIcon(req.status)}
                      {req.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-400">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end gap-2">
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApproveInit(req)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium transition-colors text-xs"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDeny(req.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-medium transition-colors text-xs"
                          >
                            Deny
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(req.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition-colors ml-2"
                        title="Delete Request"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">
                    No requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMedia && (
        <MediaDetailsModal
          isOpen={true}
          onClose={() => setSelectedMedia(null)}
          mediaId={selectedMedia.id}
          mediaType={selectedMedia.type}
          isInLibrary={false}
          onAdded={handleAddedToLibrary}
          mode="add"
        />
      )}
    </div>
  );
}
