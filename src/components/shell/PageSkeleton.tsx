// Instant-feedback skeleton shown while a page's data streams in. Keeping it
// abstract (title bar + rows) lets one component serve every route.
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-4 mt-2 h-7 w-36 animate-pulse rounded-lg bg-fill-2" />
      <div className="card overflow-hidden rounded-xl bg-card">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="h-4 w-4 animate-pulse rounded-full bg-fill-2" />
            <div className="h-4 animate-pulse rounded bg-fill-2" style={{ width: `${45 + ((i * 17) % 40)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
