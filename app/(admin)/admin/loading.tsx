export default function NewsroomLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5 p-4 sm:p-6">
      <p className="text-sm font-medium text-[color:var(--admin-shell-text-muted)]">
        न्यूजरूम लोड हो रहा है… / Loading newsroom…
      </p>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-8 w-2/3 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-12 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        ))}
      </div>
    </div>
  );
}
