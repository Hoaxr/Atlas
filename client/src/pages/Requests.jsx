import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, XCircle, Loader2, Trash2, Inbox, CalendarClock, Music2, Film, Tv } from 'lucide-react';
import api from '../lib/api';
import { customAlert, customConfirm } from '../utils/alerts';
import MediaDetailsModal from '../components/MediaDetailsModal';
import StickyBar from '../components/shared/StickyBar';
import LoadingState from '../components/shared/LoadingState';
import { useStickyBar } from '../lib/useStickyBar';

export default function Requests() {
  const navigate = useNavigate();
  const { headerRef, stickyVisible } = useStickyBar();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [currentRequestId, setCurrentRequestId] = useState(null);
  const [actionBusy, setActionBusy] = useState(null); // e.g. "12:deny"

  const fetchRequests = async () => {
    try {
      const res = await api.get('/requests');
      setRequests(res.data.data);
    } catch {
      customAlert('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApproveInit = async (req) => {
    setCurrentRequestId(req.id);
    if (req.type === 'music' || req.type === 'artist') {
      try {
        await api.post('/library/music/artists', { mbid: req.tmdb_id });
        await api.put(`/requests/${req.id}/approve`);
        customAlert('Music artist approved and added to library');
        fetchRequests();
      } catch (err) {
        customAlert(err.response?.data?.message || 'Failed to approve request');
      }
      return;
    }
    if (req.type === 'album') {
      try {
        await api.post('/library/music/albums', { mbid: req.tmdb_id });
        await api.put(`/requests/${req.id}/approve`);
        customAlert('Album approved and added to library');
        fetchRequests();
      } catch (err) {
        customAlert(err.response?.data?.message || 'Failed to approve request');
      }
      return;
    }
    setSelectedMedia({ id: req.tmdb_id, type: req.type });
  };

  const handleAddedToLibrary = async () => {
    // Media was successfully added to library via the modal
    setSelectedMedia(null);
    try {
      await api.put(`/requests/${currentRequestId}/approve`);
      customAlert('Request marked as approved');
      fetchRequests();
    } catch {
      customAlert('Failed to update request status');
    }
  };

  const handleDeny = async (id) => {
    const confirm = await customConfirm('Are you sure you want to deny this request?');
    if (!confirm || actionBusy) return;
    setActionBusy(`${id}:deny`);

    try {
      await api.put(`/requests/${id}/deny`);
      customAlert('Request denied');
      fetchRequests();
    } catch {
      customAlert('Failed to deny request');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDelete = async (id) => {
    const confirm = await customConfirm('Are you sure you want to delete this request permanently?');
    if (!confirm || actionBusy) return;
    setActionBusy(`${id}:delete`);

    try {
      await api.delete(`/requests/${id}`);
      customAlert('Request deleted');
      fetchRequests();
    } catch {
      customAlert('Failed to delete request');
    } finally {
      setActionBusy(null);
    }
  };

  const isNotYetReleased = (releaseDate) => {
    if (!releaseDate) return false;
    return new Date(releaseDate) > new Date();
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Approved
          </span>
        );
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5 shrink-0" /> Denied
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5 shrink-0" /> Pending
          </span>
        );
    }
  };

  const renderMediaIcon = (type) => {
    if (type === 'movie') {
      return (
        <div className="p-2.5 rounded-xl bg-[#101e31] border border-[#1c2d46] text-sky-400 group-hover:border-cyan-500/40 group-hover:text-cyan-300 transition-colors shrink-0">
          <Film className="w-4 h-4" />
        </div>
      );
    }
    if (type === 'tv' || type === 'show') {
      return (
        <div className="p-2.5 rounded-xl bg-[#101e31] border border-[#1c2d46] text-cyan-400 group-hover:border-cyan-500/40 group-hover:text-cyan-300 transition-colors shrink-0">
          <Tv className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="p-2.5 rounded-xl bg-[#101e31] border border-[#1c2d46] text-indigo-400 group-hover:border-cyan-500/40 group-hover:text-cyan-300 transition-colors shrink-0">
        <Music2 className="w-4 h-4" />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 sm:gap-3 !mb-0">
            <Inbox className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Requests</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Manage user requests for movies and TV shows.</p>
        </div>
        <LoadingState className="min-h-[40vh] py-16" />
      </div>
    );
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;

  return (
    <div className="space-y-4">
      <div ref={headerRef} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 sm:gap-3 !mb-0">
            <Inbox className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Requests</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Manage user requests for movies and TV shows.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="px-3 py-1 rounded-xl text-xs font-bold bg-[#101e31] text-amber-400 border border-[#1c2d46]">
              {pendingCount} Pending
            </span>
          )}
          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-[#101e31] text-emerald-400 border border-[#1c2d46]">
            {approvedCount} Approved
          </span>
        </div>
      </div>

      <StickyBar visible={stickyVisible}>
        <div className="flex items-center gap-2 ml-auto sm:hidden text-xs">
          <span className="text-amber-400">{pendingCount} open</span>
          <span className="text-emerald-400">{approvedCount} approved</span>
        </div>
      </StickyBar>

      <div className="rounded-xl border border-[#1c2d46] bg-[#0c1626]/90 overflow-hidden backdrop-blur-sm shadow-md">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#15243b] border-b border-[#1c2d46]">
                <th className="py-3 px-6 font-bold text-xs uppercase tracking-wider text-slate-300">Title</th>
                <th className="py-3 px-6 font-bold text-xs uppercase tracking-wider text-slate-300">Requested By</th>
                <th className="py-3 px-6 font-bold text-xs uppercase tracking-wider text-slate-300">Status</th>
                <th className="py-3 px-6 font-bold text-xs uppercase tracking-wider text-slate-300">Date</th>
                <th className="py-3 px-6 font-bold text-xs uppercase tracking-wider text-slate-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c2d46]/70">
              {requests.map(req => {
                const unreleased = req.status === 'approved' && isNotYetReleased(req.release_date);
                return (
                <tr key={req.id} className="hover:bg-[#101e31]/60 transition-colors group">
                  <td className="py-3.5 px-6 font-medium text-slate-200">
                    <div className="flex items-center gap-3.5">
                      {renderMediaIcon(req.type)}
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (req.type === 'album') navigate(`/music/albums/${req.tmdb_id}`);
                            else if (req.type === 'music' || req.type === 'artist') navigate(`/music/artists/${req.tmdb_id}`);
                            else navigate(`/${req.type === 'movie' ? 'movies' : 'shows'}/${req.tmdb_id}`);
                          }}
                          className="text-left font-semibold text-slate-100 hover:text-cyan-400 transition-colors cursor-pointer block truncate"
                        >
                          {req.title}
                        </button>
                        {unreleased && req.release_date && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                              <CalendarClock className="w-3 h-3" />
                              Coming Soon · {new Date(req.release_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-slate-300 font-medium">{req.requested_by}</td>
                  <td className="py-4 px-6">
                    {renderStatusBadge(req.status)}
                  </td>
                  <td className="py-4 px-6 text-slate-400 text-xs">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end gap-2">
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApproveInit(req)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold transition-colors text-xs shadow-xs"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDeny(req.id)}
                            disabled={actionBusy === `${req.id}:deny`}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-semibold transition-colors text-xs shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                          >
                            Deny
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(req.id)}
                        disabled={!!actionBusy}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#101e31] border border-transparent hover:border-[#1c2d46] transition-colors ml-1 disabled:opacity-50 disabled:pointer-events-none"
                        title="Delete Request"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
              {requests.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-slate-500">
                    No requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-[#1c2d46]/70">
          {requests.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No requests found.</div>
          ) : (
            requests.map(req => {
              const unreleased = req.status === 'approved' && isNotYetReleased(req.release_date);
              return (
              <div key={req.id} className="p-4 space-y-3 hover:bg-[#101e31]/40 transition-colors">
                <div className="flex items-start gap-3">
                  {renderMediaIcon(req.type)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (req.type === 'album') navigate(`/music/albums/${req.tmdb_id}`);
                          else if (req.type === 'music' || req.type === 'artist') navigate(`/music/artists/${req.tmdb_id}`);
                          else navigate(`/${req.type === 'movie' ? 'movies' : 'shows'}/${req.tmdb_id}`);
                        }}
                        className="font-bold text-slate-100 text-sm truncate text-left hover:text-cyan-400 transition-colors cursor-pointer block"
                      >
                        {req.title}
                      </button>
                      <div className="shrink-0">
                        {renderStatusBadge(req.status)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(req.created_at).toLocaleDateString()}
                      </span>
                      {unreleased && (
                        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          <CalendarClock className="w-3 h-3" />
                          Coming Soon
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">
                    by <span className="text-slate-200 font-semibold">{req.requested_by}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {req.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApproveInit(req)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold transition-colors text-xs shadow-xs"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeny(req.id)}
                          disabled={actionBusy === `${req.id}:deny`}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-semibold transition-colors text-xs shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Deny
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(req.id)}
                      disabled={!!actionBusy}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#101e31] border border-transparent hover:border-[#1c2d46] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      title="Delete Request"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Icon Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-slate-400 font-medium pt-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#101e31] border border-[#1c2d46] text-sky-400">
            <Film className="w-3.5 h-3.5" />
          </div>
          <span className="text-slate-300">Movies</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#101e31] border border-[#1c2d46] text-cyan-400">
            <Tv className="w-3.5 h-3.5" />
          </div>
          <span className="text-slate-300">TV Shows</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#101e31] border border-[#1c2d46] text-indigo-400">
            <Music2 className="w-3.5 h-3.5" />
          </div>
          <span className="text-slate-300">Music</span>
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
