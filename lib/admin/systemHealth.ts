import connectDB from '@/lib/db/mongoose';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import { sanitizeDiagnosticsText } from '@/lib/admin/diagnosticsSanitizer';
import TtsAsset from '@/lib/models/TtsAsset';
import TtsAuditEvent from '@/lib/models/TtsAuditEvent';
import { getTtsStorageConfig } from '@/lib/utils/ttsStorage';

export type SystemHealthStatus = 'healthy' | 'watch' | 'critical' | 'inactive';

export type SystemHealthService = {
  id: string;
  label: string;
  status: SystemHealthStatus;
  summary: string;
  detail: string;
  href?: string;
};

export type SystemHealthSignal = {
  label: string;
  value: string;
  tone: 'neutral' | 'good' | 'warning' | 'critical';
};

export type SystemHealthFailure = {
  id: string;
  message: string;
  action: string;
  sourceType: string;
  variant: string;
  createdAt: string;
};

export type SystemHealthSummary = {
  dataSource: 'mongodb' | 'file' | 'hybrid';
  services: SystemHealthService[];
  runtimeSignals: SystemHealthSignal[];
  recentFailures: SystemHealthFailure[];
  risks: string[];
  metrics: {
    serviceRisks: number;
    recentFailures: number;
    failedAssets: number;
    staleAssets: number;
    enabledSurfaces: number;
    writableStorage: boolean;
  };
};

type SystemHealthOptions = {
  start?: Date;
  end?: Date;
  dataSource: 'mongodb' | 'file' | 'hybrid';
  blockedEditions?: number;
  qualityAlerts?: number;
  queuePressure?: number;
  inboxEscalations?: number;
  teamAlerts?: number;
};

function createDateRangeFilter(start?: Date, end?: Date) {
  if (!start || !end) return {};
  return { createdAt: { $gte: start, $lte: end } };
}

function mapDataSourceStatus(
  source: 'mongodb' | 'file' | 'hybrid'
): Pick<SystemHealthService, 'status' | 'summary' | 'detail'> {
  if (source === 'mongodb') {
    return {
      status: 'healthy',
      summary: 'MongoDB is serving live analytics and workflow data.',
      detail: 'Primary database connectivity is healthy and the leadership dashboard is using live records.',
    };
  }

  if (source === 'hybrid') {
    return {
      status: 'watch',
      summary: 'MongoDB is available with file-store fallback still in play.',
      detail: 'The platform is working, but some analytics or content reads may still rely on local fallback storage.',
    };
  }

  return {
    status: 'critical',
    summary: 'The platform is running on file fallback mode.',
    detail: 'Leadership analytics are working, but MongoDB is unavailable and operations are relying on local fallback storage.',
  };
}

function toneForStatus(status: SystemHealthStatus): SystemHealthSignal['tone'] {
  switch (status) {
    case 'healthy':
      return 'good';
    case 'watch':
      return 'warning';
    case 'critical':
      return 'critical';
    case 'inactive':
    default:
      return 'neutral';
  }
}

export async function getSystemHealthSummary(
  options: SystemHealthOptions
): Promise<SystemHealthSummary> {
  let isDbAlive = false;
  let effectiveDataSource = options.dataSource;

  if (effectiveDataSource !== 'file') {
    isDbAlive = await isMongoAvailable({
      label: 'System health probe',
      timeoutMs: 2000,
      unavailableTtlMs: 5000,
    });
    if (!isDbAlive && effectiveDataSource === 'mongodb') {
      effectiveDataSource = 'hybrid';
    }
  }

  const dataSourceStatus = mapDataSourceStatus(effectiveDataSource);
  if (!isDbAlive && effectiveDataSource !== 'file') {
    dataSourceStatus.status = 'critical';
    dataSourceStatus.summary = 'MongoDB connection probe failed.';
    dataSourceStatus.detail = 'MongoDB is currently unreachable; operational features are using file storage fallback.';
  }

  let writableStorage = false;
  let storageMode: 'public' | 'proxy' | 'spaces' | null = null;
  let storageError = '';

  try {
    const storage = await getTtsStorageConfig();
    writableStorage = true;
    storageMode = storage.mode;
  } catch (error) {
    storageError = sanitizeDiagnosticsText(
      error instanceof Error ? error.message : 'Shared TTS storage is unavailable.'
    );
  }

  let failedAssets = 0;
  let staleAssets = 0;
  let recentFailures: SystemHealthFailure[] = [];

  if (isDbAlive) {
    try {
      await connectDB();

      const [failedAssetsCount, staleAssetsCount, recentFailureDocs] = await Promise.all([
        TtsAsset.countDocuments({ status: 'failed' }),
        TtsAsset.countDocuments({ status: 'stale' }),
        TtsAuditEvent.find({
          result: 'failure',
          ...createDateRangeFilter(options.start, options.end),
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean<Array<{
            _id?: unknown;
            message?: string;
            action?: string;
            sourceType?: string;
            variant?: string;
            createdAt?: Date | string;
          }>>()
      ]);

      failedAssets = failedAssetsCount;
      staleAssets = staleAssetsCount;
      recentFailures = recentFailureDocs.map((event) => ({
        id: typeof event._id?.toString === 'function' ? event._id.toString() : String(event._id || ''),
        message: sanitizeDiagnosticsText(String(event.message || 'Audio operation failed.')),
        action: sanitizeDiagnosticsText(String(event.action || 'unknown')),
        sourceType: sanitizeDiagnosticsText(String(event.sourceType || 'unknown')),
        variant: sanitizeDiagnosticsText(String(event.variant || 'unknown')),
        createdAt:
          event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : String(event.createdAt || new Date(0).toISOString()),
      }));
    } catch (error) {
      console.error('Failed to load system health signals from MongoDB.', error);
    }
  }

  const services: SystemHealthService[] = [
    {
      id: 'database',
      label: 'Database',
      status: dataSourceStatus.status,
      summary: dataSourceStatus.summary,
      detail: dataSourceStatus.detail,
    },
    {
      id: 'paid-ai',
      label: 'Paid AI APIs',
      status: 'inactive',
      summary: 'OpenAI and Gemini API usage is disabled.',
      detail: 'Use ChatGPT Plus manually in the browser; runtime features use local/manual fallbacks.',
      href: '/admin/settings',
    },
    {
      id: 'manual-audio',
      label: 'Manual Audio',
      status: !writableStorage
        ? 'watch'
        : recentFailures.length > 0 || failedAssets > 0
          ? 'watch'
          : 'healthy',
      summary: writableStorage
        ? `Manual audio storage is accessible in ${storageMode} mode.`
        : 'Audio storage may be limited — DigitalOcean Spaces handles primary uploads.',
      detail: writableStorage
        ? `${failedAssets} failed asset(s), ${staleAssets} stale asset(s).`
        : storageError || 'Audio is uploaded directly to DigitalOcean Spaces.',
      href: '/admin/settings',
    },
    {
      id: 'workflow-ops',
      label: 'Workflow Ops',
      status:
        (options.blockedEditions || 0) > 0 ||
        (options.qualityAlerts || 0) > 0 ||
        (options.inboxEscalations || 0) > 0
          ? 'watch'
          : 'healthy',
      summary:
        (options.blockedEditions || 0) > 0 || (options.qualityAlerts || 0) > 0
          ? 'The newsroom still has active blockers or quality alerts.'
          : 'No major workflow blockers are active right now.',
      detail: `${options.blockedEditions || 0} blocked edition(s), ${options.qualityAlerts || 0} quality alert(s), ${options.queuePressure || 0} queue item(s), and ${options.inboxEscalations || 0} inbox escalation(s) are active in the selected view.`,
      href: '/admin/review-queue',
    },
  ];

  const risks: string[] = [];

  if (options.dataSource !== 'mongodb') {
    risks.push('Primary database mode is not fully live.');
  }
  if (!writableStorage) {
    risks.push('Fallback audio storage directory is not writable (DigitalOcean Spaces primary).');
  }
  if ((options.blockedEditions || 0) > 0) {
    risks.push(`${options.blockedEditions} blocked edition(s) still need attention.`);
  }
  if ((options.qualityAlerts || 0) > 0) {
    risks.push(`${options.qualityAlerts} low-quality page alert(s) are still active.`);
  }
  if ((options.inboxEscalations || 0) > 0) {
    risks.push(`${options.inboxEscalations} inbox escalation(s) still need response.`);
  }
  if ((options.teamAlerts || 0) > 0) {
    risks.push(`${options.teamAlerts} team coverage alert(s) are active.`);
  }
  if (recentFailures.length > 0) {
    risks.push(`${recentFailures.length} audio operation failure event(s) were recorded in the selected time window.`);
  }

  return {
    dataSource: options.dataSource,
    services,
    runtimeSignals: [
      {
        label: 'Data Source',
        value: options.dataSource === 'hybrid' ? 'MongoDB + fallback' : options.dataSource,
        tone: toneForStatus(dataSourceStatus.status),
      },
      {
        label: 'Paid AI',
        value: 'Disabled',
        tone: 'neutral',
      },
      {
        label: 'Audio Mode',
        value: 'Manual Upload (DigitalOcean Spaces)',
        tone: 'good',
      },
      {
        label: 'Audio Storage',
        value: writableStorage ? `${storageMode} mode` : 'DO Spaces primary',
        tone: writableStorage ? 'good' : 'neutral',
      },
      {
        label: 'Failed Assets',
        value: String(failedAssets),
        tone: failedAssets > 0 ? 'warning' : 'good',
      },
      {
        label: 'Stale Assets',
        value: String(staleAssets),
        tone: staleAssets > 0 ? 'warning' : 'good',
      },
    ],
    recentFailures,
    risks,
    metrics: {
      serviceRisks: services.filter((service) => service.status !== 'healthy').length,
      recentFailures: recentFailures.length,
      failedAssets,
      staleAssets,
      enabledSurfaces: 0,
      writableStorage,
    },
  };
}
