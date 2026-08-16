import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { Trash2, ArrowLeft, Loader2, ShieldAlert, AlertTriangle, ShieldCheck, Eye, AlertCircle } from 'lucide-react';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';
import DeletableCard from '../components/shared/DeletableCard';
import ModalShell from '../components/shared/ModalShell';
import { customAlert } from '../utils/alerts';

export default function CleanupCandidates() {
  const navigate = useNavigate();
  const { headerRef, stickyVisible } = useStickyBar();
  const [data, setData] = useState({
    all: [],
    highPriority: [],
    mediumPriority: [],
    lowPriority: [],
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [unignoring, setUnignoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      const res = await api.get('/library/cleanup-candidates');
      if (res.data.status === 'success') {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch cleanup candidates', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleted = (id) => {
    setData(prev => {
      const filterItem = (arr) => arr.filter(m => m.id !== id);
      const newAll = filterItem(prev.all || []);
      return {
        ...prev,
        all: newAll,
        highPriority: filterItem(prev.highPriority || []),
        mediumPriority: filterItem(prev.mediumPriority || []),
        lowPriority: filterItem(prev.lowPriority || []),
        total: newAll.length
      };
    });
  };

  const handleUnignoreAll = async () => {
    setConfirmOpen(false);
    setUnignoring(true);
    try {
      const res = await api.post('/library/cleanup-candidates/unignore-all');
      if (res.data.status === 'success') {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to unignore all', err);
      customAlert('Unignore failed');
    } finally {
      setUnignoring(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  const { highPriority = [], mediumPriority = [], lowPriority = [], total = 0 } = data;
  const totalSize = (data.all || []).reduce((acc, item) => acc + (item.file_size || 0), 0);

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-12">
      <StickyBar isVisible={stickyVisible}>
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-cyan-400" />
          <h1 className="font-semibold text-slate-200">Cleanup Candidates</h1>
        </div>
      </StickyBar>
      <div ref={headerRef} className="pt-2">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Trash2 className="w-6 h-6 text-cyan-400" />
          Cleanup Candidates
        </h1>
        <p className="text-slate-400 mt-1">Review movies scored by our point system to free up space safely.</p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/stats')} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-sm font-medium px-3 py-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
          Potential Savings: {formatSize(totalSize)}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={unignoring}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors disabled:opacity-50"
        >
          {unignoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 text-cyan-400" />}
          Unignore All
        </button>
      </div>

      {total === 0 ? (
        <div className="glass-panel p-12 text-center rounded-2xl border-dashed border-slate-700">
          <Trash2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300">No candidates found</h3>
          <p className="text-slate-500 mt-2">You don't have any movies that need cleaning up right now.</p>
        </div>
      ) : (
        <div className="space-y-8">
          
          {highPriority.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-rose-400 mb-2 border-b border-slate-800 pb-2">
                <ShieldAlert className="w-5 h-5" />
                <h2 className="text-lg font-bold">High Priority ({highPriority.length})</h2>
                <span className="text-sm text-slate-500 ml-2">Safe to delete</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {highPriority.map(m => (
                  <DeletableCard key={m.id} movie={m} priority="high" onDeleted={handleDeleted} />
                ))}
              </div>
            </div>
          )}

          {mediumPriority.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400 mb-2 border-b border-slate-800 pb-2">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="text-lg font-bold">Medium Priority ({mediumPriority.length})</h2>
                <span className="text-sm text-slate-500 ml-2">Consider deleting</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {mediumPriority.map(m => (
                  <DeletableCard key={m.id} movie={m} priority="medium" onDeleted={handleDeleted} />
                ))}
              </div>
            </div>
          )}

          {lowPriority.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-cyan-400 mb-2 border-b border-slate-800 pb-2">
                <ShieldCheck className="w-5 h-5" />
                <h2 className="text-lg font-bold">Low Priority ({lowPriority.length})</h2>
                <span className="text-sm text-slate-500 ml-2">Keep unless low on space</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {lowPriority.map(m => (
                  <DeletableCard key={m.id} movie={m} priority="low" onDeleted={handleDeleted} />
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      <ModalShell
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Unignore All"
        icon={<AlertCircle className="w-5 h-5 text-cyan-400" />}
        size="md"
        footer={
          <>
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUnignoreAll}
              className="px-4 py-2 rounded-lg font-medium bg-cyan-500 hover:bg-cyan-600 text-white transition-colors"
            >
              Unignore
            </button>
          </>
        }
      >
        <p className="text-slate-300">
          Are you sure you want to un-ignore all previously ignored movies? They will reappear on this list if they still meet the cleanup criteria.
        </p>
      </ModalShell>
    </div>
  );
}
