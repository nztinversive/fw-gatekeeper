'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { Worker } from '@/lib/types';

export default function WorkersPage() {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch('/api/workers');
      if (!res.ok) throw new Error('Failed to fetch workers');
      setWorkers(await res.json());
    } catch (err) {
      console.error('Failed to fetch workers', err);
    }
  }, []);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  const resetEdit = () => {
    setEditId(null);
    setName('');
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
        body: JSON.stringify({ id: editId, name, department }),
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
    setDepartment(w.department);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Worker <span className="text-gold">Management</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{workers.length} registered workers</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/onboarding" className="btn-secondary flex items-center gap-2">
            Onboarding Guide
          </Link>
          <Link href="/enroll" className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Enroll Face
          </Link>
        </div>
      </div>

      <div className="glass-card p-5 mb-8 border-l-4 border-gold/70">
        <h2 className="font-display font-semibold text-gold mb-2">Adding a new person?</h2>
        <p className="text-sm text-slate-400 leading-6">
          Use <span className="text-slate-200 font-semibold">Enroll Face</span> for all new facial-recognition enrollments.
          The Workers page is for reviewing enrolled people, editing names/departments, and deactivating workers.
        </p>
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
              <input
                placeholder="e.g. John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="section-label mb-1.5 block">Department</label>
              <input
                placeholder="e.g. Production, QC, Electrical"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              <button onClick={handleSubmit} className="btn-primary">
                Save Changes
              </button>
              <button onClick={resetEdit} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {workers.map((w, i) => (
          <div
            key={w.id}
            className={`glass-card-hover p-4 flex items-center gap-4 animate-fade-in stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/15 flex items-center justify-center text-sm font-display font-bold text-gold shrink-0">
              {w.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-medium text-sm text-slate-200">{w.name}</div>
              <div className="text-xs font-mono text-slate-500">{w.department || 'No department'}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(w)} className="btn-ghost text-xs">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
              <button onClick={() => deactivate(w.id)} className="px-3 py-1.5 text-xs rounded-xl bg-red-400/5 border border-red-400/10 text-red-400 hover:bg-red-400/10 transition-all">
                Deactivate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
