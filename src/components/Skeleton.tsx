'use client';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`skeleton-shimmer rounded-xl bg-navy-800/60 ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card p-4 flex items-center gap-3.5">
      <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32 rounded-lg" />
        <Skeleton className="h-3 w-20 rounded-lg" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="glass-card p-4 md:p-5">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="w-9 h-9 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-16 rounded-lg mb-2" />
      <Skeleton className="h-3 w-24 rounded-lg" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-9 w-56 rounded-xl mb-3" />
        <Skeleton className="h-4 w-36 rounded-lg" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Search */}
      <Skeleton className="h-10 w-full md:w-96 rounded-xl mb-6" />

      {/* Worker cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
