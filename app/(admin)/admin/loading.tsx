export default function NewsroomLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-[1500px] space-y-5 px-3 pb-10 sm:px-5"
    >
      <span className="sr-only">
        न्यूज़रूम लोड हो रहा है… / Loading newsroom dashboard…
      </span>

      {/* Hero Banner Skeleton */}
      <div
        aria-hidden="true"
        className="admin-shell-surface-strong rounded-[24px] p-5 sm:p-7 motion-safe:animate-pulse"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="h-4 w-40 rounded-md bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-8 w-72 rounded-lg bg-zinc-300 dark:bg-zinc-700 sm:w-96" />
            <div className="h-4 w-full max-w-xl rounded-md bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="flex gap-3">
            <div className="h-11 w-36 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-11 w-32 rounded-xl bg-zinc-300 dark:bg-zinc-700" />
          </div>
        </div>
      </div>

      {/* 4 Action Lanes Grid Skeleton */}
      <div
        aria-hidden="true"
        className="grid gap-5 xl:grid-cols-2 motion-safe:animate-pulse"
      >
        {[1, 2, 3, 4].map((lane) => (
          <div
            key={lane}
            className="admin-shell-surface overflow-hidden rounded-[22px]"
          >
            <div className="flex items-center justify-between border-b border-[color:var(--admin-shell-border)] p-4 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                <div className="space-y-2">
                  <div className="h-5 w-44 rounded-md bg-zinc-300 dark:bg-zinc-700" />
                  <div className="h-3 w-60 rounded-md bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
              <div className="h-7 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="divide-y divide-[color:var(--admin-shell-border)]">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex items-center justify-between px-4 py-3 sm:px-5"
                >
                  <div className="space-y-1.5">
                    <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-900" />
                  </div>
                  <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Metric Cards Skeleton */}
      <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
        <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((card) => (
            <div
              key={card}
              className="admin-shell-surface rounded-[18px] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-4 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-7 w-8 rounded bg-zinc-300 dark:bg-zinc-700" />
              </div>
              <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
