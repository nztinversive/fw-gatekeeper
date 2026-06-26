'use client';

interface WorkerCardProps {
  name: string;
  department: string;
  status: 'in' | 'out' | 'absent';
  clockInTime?: string;
  freshnessLabel?: string | null;
  isStale?: boolean;
}

export default function WorkerCard({ name, department, status, clockInTime, freshnessLabel, isStale = false }: WorkerCardProps) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2);

  const statusConfig = {
    in: {
      dot: 'bg-emerald-400',
      pulse: true,
      text: 'On Site',
      badge: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
      ring: 'ring-emerald-400/20',
      initialsColor: 'text-emerald-400',
      initialsBg: 'bg-emerald-400/10 border-emerald-400/20',
    },
    out: {
      dot: 'bg-amber-400',
      pulse: false,
      text: 'Clocked Out',
      badge: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
      ring: 'ring-amber-400/20',
      initialsColor: 'text-amber-400',
      initialsBg: 'bg-amber-400/10 border-amber-400/20',
    },
    absent: {
      dot: 'bg-slate-600',
      pulse: false,
      text: 'Not Arrived',
      badge: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
      ring: 'ring-slate-500/10',
      initialsColor: 'text-slate-500',
      initialsBg: 'bg-slate-500/5 border-slate-600/20',
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className="glass-card-hover p-4 flex items-center gap-3.5 group">
      <div className={`w-10 h-10 rounded-xl ${cfg.initialsBg} border flex items-center justify-center text-xs font-display font-bold ${cfg.initialsColor} shrink-0 transition-colors`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-medium text-sm text-slate-200 truncate">{name}</div>
        <div className="text-xs text-slate-500 font-mono">{department || 'Unassigned'}</div>
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-1">
        <span className={`badge text-[11px] border ${cfg.badge}`}>
          <span className={`status-dot ${cfg.dot} ${cfg.pulse ? 'animate-pulse-slow' : ''}`} />
          {cfg.text}
        </span>
        {isStale && (
          <span className="badge border border-amber-400/15 bg-amber-400/5 text-[10px] text-amber-300">Cached</span>
        )}
        {clockInTime && (
          <span className="text-[10px] font-mono text-slate-500 tabular-nums">{clockInTime}</span>
        )}
        {freshnessLabel && (
          <span className="max-w-32 truncate text-[10px] font-mono text-amber-300/80">{freshnessLabel}</span>
        )}
      </div>
    </div>
  );
}
