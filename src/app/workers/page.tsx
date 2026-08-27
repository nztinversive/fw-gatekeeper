'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { Worker } from '@/lib/types';

type PortalRole = 'admin' | 'enrollment' | 'viewer' | string;

function getEncodingStatus(worker: Worker) {
  if (worker.encoding_status) return worker.encoding_status;
  return worker.has_face_encoding ? 'valid' : 'missing';
}

function hasFaceEncoding(worker: Worker) {
  return getEncodingStatus(worker) === 'valid';
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function WorkersPage() {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [currentRole, setCurrentRole] = useState<PortalRole | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canEdit = currentRole === 'admin';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal-role', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled && typeof payload?.role === 'string') {
          setCurrentRole(payload.role);
        }
      })
      .catch(() => {
        if (!cancelled) setCurrentRole(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workers');
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Your account does not have access to the worker list.' : 'Failed to load workers');
      }
      setWorkers(await res.json());
    } catch (err) {
      setWorkers([]);
      setError(err instanceof Error ? err.message : 'Failed to load workers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  const resetEdit = () => {
    setEditId(null);
    setName('');
    setEmployeeId('');
    setDepartment('');
  };

  const handleSubmit = async () => {
    if (!editId) return;
    if (!name.trim()) {
      toast('Name is required', 'error');
      return;
    }

    try {
      const res = await fetch('/api/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name, employee_id: employeeId, department }),
      });
      if (!res.ok) throw new Error('Failed to update worker');
      toast(`${name} updated successfully`);
      resetEdit();
      fetchWorkers();
    } catch {
      toast('Failed to save worker', 'error');
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this worker?')) return;
    try {
      const res = await fetch(`/api/workers?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to deactivate worker');
      toast('Worker deactivated');
      fetchWorkers();
    } catch {
      toast('Failed to deactivate worker', 'error');
    }
  };

  const startEdit = (w: Worker) => {
    setEditId(w.id);
    setName(w.name);
    setEmployeeId(w.employee_id || '');
    setDepartment(w.department);
  };

  const enrolledCount = workers.filter(hasFaceEncoding).length;
  const invalidFaceCount = workers.filter((worker) => getEncodingStatus(worker) === 'invalid').length;
  const missingFaceCount = workers.filter((worker) => getEncodingStatus(worker) === 'missing').length;

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Worker <span className="text-gold">Management</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">
            {workers.length} registered workers · {enrolledCount} face enrolled · {missingFaceCount} needs enrollment · {invalidFaceCount} invalid
          </p>
          {!canEdit && (
            <p className="mt-2 flex items-center gap-2">
              <span className="badge border border-slate-400/15 bg-slate-400/5 text-[10px] text-slate-300">Review-only</span>
              <span className="text-xs text-slate-500">Editing worker records requires an admin account.</span>
            </p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/enroll" className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Enroll Face
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <div className="glass-card p-4">
          <p className="section-label">Recognition ready</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-3xl font-display font-bold text-emerald-400">{enrolledCount}</span>
            <span className="pb-1 text-sm text-slate-500">workers</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Face enrolled and ready for kiosk recognition.</p>
        </div>
        <div className="glass-card p-4">
          <p className="section-label">Needs enrollment</p>
          <div className="mt-2 flex items-end gap-2">
            <span className={`text-3xl font-display font-bold ${missingFaceCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{missingFaceCount}</span>
            <span className="pb-1 text-sm text-slate-500">workers</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Missing face data; use Enroll Face before kiosk use.</p>
        </div>
        <div className="glass-card p-4">
          <p className="section-label">Invalid face data</p>
          <div className="mt-2 flex items-end gap-2">
            <span className={`text-3xl font-display font-bold ${invalidFaceCount > 0 ? 'text-red-400' : 'text-slate-500'}`}>{invalidFaceCount}</span>
            <span className="pb-1 text-sm text-slate-500">workers</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Needs re-enrollment before kiosk recognition is reliable.</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-gold/70">
          <p className="section-label">Canonical workflow</p>
          <h2 className="mt-2 font-display font-semibold text-gold">Adding a new person?</h2>
          <p className="mt-2 text-xs text-slate-400 leading-5">
            Use <span className="text-slate-200 font-semibold">Enroll Face</span> for all new facial-recognition enrollments.
          </p>
        </div>
      </div>

      {editId && (
        <div className="glass-card p-6 mb-8 animate-slide-up">
          <h2 className="font-display font-semibold text-gold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Edit Worker Details
          </h2>
          <div className="space-y-4">
            <div>
              <label className="section-label mb-1.5 block">Full Name</label>
              <input placeholder="e.g. John Smith" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="section-label mb-1.5 block">Employee ID Number</label>
              <input placeholder="e.g. 1042" inputMode="numeric" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="section-label mb-1.5 block">Department</label>
              <input placeholder="e.g. Production, QC, Electrical" value={department} onChange={(e) => setDepartment(e.target.value)} className="input-field" />
            </div>
            <div className="flex gap-3 flex-wrap">
              <button onClick={handleSubmit} className="btn-primary">Save Changes</button>
              <button onClick={resetEdit} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-6 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card p-6 text-sm text-slate-400">Loading workers...</div>
      ) : !error && workers.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-slate-400 font-display">No workers registered yet</p>
          <p className="text-xs text-slate-600 mt-1">Use Enroll Face to add the first worker.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {workers.map((w, i) => {
          const encodingStatus = getEncodingStatus(w);
          const faceReady = encodingStatus === 'valid';
          const faceInvalid = encodingStatus === 'invalid';
          const statusLabel = faceReady ? 'Face enrolled' : faceInvalid ? 'Invalid face data' : 'Missing face';
          const readinessLabel = faceReady ? 'Ready for kiosk recognition' : faceInvalid ? 'Needs re-enrollment' : 'Needs enrollment';
          const readinessDetail = faceReady
            ? 'This worker has valid face data and will sync to kiosks.'
            : faceInvalid
              ? 'This worker has face data, but it is not a supported kiosk vector. Re-enroll from photos.'
              : 'Capture photos in Enroll Face before this person can be recognized.';
          return (
            <div key={w.id} className={`glass-card-hover p-4 flex flex-col gap-4 animate-fade-in stagger-${Math.min(i + 1, 6)}`}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-sm font-display font-bold shrink-0 ${faceReady ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : faceInvalid ? 'bg-red-400/10 border-red-400/20 text-red-400' : 'bg-amber-400/10 border-amber-400/20 text-amber-400'}`}>
                  {getInitials(w.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-sm text-slate-200 truncate">{w.name}</div>
                  <div className="text-xs font-mono text-slate-500 truncate">ID: {w.employee_id || 'Not set'}</div>
                  <div className="text-xs font-mono text-slate-500 truncate">{w.department || 'No department'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="badge border bg-emerald-400/10 text-emerald-400 border-emerald-400/20">Active</span>
                    <span className={`badge border ${faceReady ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : faceInvalid ? 'bg-red-400/10 text-red-400 border-red-400/20' : 'bg-amber-400/10 text-amber-400 border-amber-400/20'}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-navy-600/40 bg-navy-900/45 px-3 py-2">
                <p className="text-xs font-medium text-slate-300">{readinessLabel}</p>
                <p className="mt-1 text-[11px] text-slate-500 leading-4">
                  {readinessDetail}
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                {canEdit ? (
                  <>
                    <button onClick={() => startEdit(w)} className="btn-secondary flex-1 text-xs">Edit</button>
                    <Link href={`/enroll?worker_id=${encodeURIComponent(w.id)}`} className={`flex-1 text-center text-xs ${faceReady ? 'btn-ghost' : 'btn-primary'}`}>
                      {faceReady ? 'Re-enroll' : faceInvalid ? 'Re-enroll' : 'Enroll now'}
                    </Link>
                    <button onClick={() => deactivate(w.id)} className="px-3 py-2 text-xs rounded-xl bg-red-400/5 border border-red-400/10 text-red-400 hover:bg-red-400/10 transition-all">
                      Deactivate
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-secondary flex-1 text-xs" disabled>
                    Review-only
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
