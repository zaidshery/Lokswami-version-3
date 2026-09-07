import { AlertCircle, CheckCircle } from 'lucide-react';

type SwipeReadinessChecklistProps = {
  slug: string;
  articleId: string;
  posterReady: boolean;
  mediaReady: boolean;
  aspectRatio: string;
  processingStatus?: string;
};

export default function SwipeReadinessChecklist({
  slug,
  articleId,
  posterReady,
  mediaReady,
  aspectRatio,
  processingStatus = 'ready',
}: SwipeReadinessChecklistProps) {
  const checks = [
    { label: 'Unique Swipe slug provided', ready: Boolean(slug.trim()) },
    {
      label: 'Related article reference provided; publication is verified by the server',
      ready: Boolean(articleId.trim()),
    },
    { label: 'Poster provided', ready: posterReady },
    { label: 'Video source provided', ready: mediaReady },
    { label: 'Media processing status is Ready', ready: processingStatus === 'ready' },
    { label: 'Aspect ratio is 9:16 vertical', ready: aspectRatio === '9:16' },
  ];
  const readyCount = checks.filter((check) => check.ready).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-900">Publish readiness</p>
        <span className="text-xs font-medium text-gray-600">
          {readyCount}/{checks.length} ready
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2 text-xs leading-5 text-gray-700">
            {check.ready ? (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            )}
            <span>{check.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
