export default function ReviewQueueLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-[1600px] space-y-5 px-3 pb-10 sm:px-5 lg:px-6"
    >
      <span className="sr-only">
        रिव्यू कतार लोड हो रही है… / Loading review queue…
      </span>

      {/* Hero Header Skeleton */}
      <div
        aria-hidden="true"
        className="admin-shell-surface-strong rounded-[24px] p-5 sm:p-6 motion-safe:animate-pulse"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-rose-500/20" />
            <div className="h-8 w-64 rounded-lg bg-zinc-300 dark:bg-zinc-700" />
            <div className="h-4 w-96 max-w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:min-w-[620px]">
            {[1, 2, 3, 4, 5, 6].map((tab) => (
              <div
                key={tab}
                className="h-16 rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)]"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Filters Skeleton */}
      <div
        aria-hidden="true"
        className="admin-shell-surface rounded-[22px] p-4 sm:p-5 motion-safe:animate-pulse"
      >
        <div className="h-11 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>

      {/* Queue Items Skeleton */}
      <div
        aria-hidden="true"
        className="admin-shell-surface overflow-hidden rounded-[22px] motion-safe:animate-pulse"
      >
        <div className="border-b border-[color:var(--admin-shell-border)] p-4">
          <div className="h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="divide-y divide-[color:var(--admin-shell-border)]">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between p-4">
              <div className="space-y-2">
                <div className="h-4 w-60 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-3 w-40 rounded bg-zinc-100 dark:bg-zinc-900" />
              </div>
              <div className="h-8 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
