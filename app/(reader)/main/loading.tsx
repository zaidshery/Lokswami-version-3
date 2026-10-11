export default function ReaderLoading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <div aria-hidden="true" className="h-8 w-8 rounded-full border-4 border-zinc-200 border-t-brand-500 motion-safe:animate-spin dark:border-zinc-700 dark:border-t-brand-500" />
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        समाचार लोड हो रहे हैं… / Loading news…
      </p>
    </div>
  );
}
