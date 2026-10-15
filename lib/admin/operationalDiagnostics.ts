import 'server-only';

import { getEpaperInsights, type EpaperInsights } from '@/lib/admin/epaperInsights';
import {
  buildLeadershipReportEscalations,
  buildLeadershipReportHealthAlerts,
  getLeadershipReportRuntimeSnapshot,
  type LeadershipReportEscalation,
  type LeadershipReportHealthAlert,
  type LeadershipReportRuntimeSnapshot,
} from '@/lib/admin/leadershipReportHealth';
import {
  getSystemHealthSummary,
  type SystemHealthService,
  type SystemHealthSignal,
  type SystemHealthFailure,
  type SystemHealthStatus,
  type SystemHealthSummary,
} from '@/lib/admin/systemHealth';
import { sanitizeDiagnosticsText } from '@/lib/admin/diagnosticsSanitizer';
import { listLeadershipReportRunHistory } from '@/lib/storage/leadershipReportRunHistoryFile';
import { listLeadershipReportSchedules } from '@/lib/storage/leadershipReportSchedulesFile';

export type OperationalDiagnosticsLane = {
  id: string;
  label: string;
  status: SystemHealthStatus;
  summary: string;
  detail: string;
  href?: string;
};

export type OperationalDiagnosticsAlert = {
  id: string;
  tone: 'neutral' | 'good' | 'warning' | 'critical';
  title: string;
  detail: string;
  href?: string;
  actionLabel?: string;
};

export type OperationalDiagnosticsSnapshot = {
  dataSource: 'mongodb' | 'file' | 'hybrid';
  summary: {
    servicesAtRisk: number;
    uploadAlerts: number;
    reportingRisks: number;
    blockedEditions: number;
  };
  lanes: OperationalDiagnosticsLane[];
  runtimeSignals: SystemHealthSignal[];
  alerts: OperationalDiagnosticsAlert[];
  reportEscalations: LeadershipReportEscalation[];
  blockedEditions: EpaperInsights['blockedEditions'];
  lowQualityPages: EpaperInsights['lowQualityPages'];
  recentFailures: SystemHealthFailure[];
};

export type UploadRuntimeSummary = {
  status: SystemHealthStatus;
  summary: string;
  detail: string;
  signals: SystemHealthSignal[];
};

export type OcrRuntimeSummary = {
  status: SystemHealthStatus;
  summary: string;
  detail: string;
  signals: SystemHealthSignal[];
};

function readBooleanEnv(value: string | undefined) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function deriveDataSource(source: EpaperInsights['source']): OperationalDiagnosticsSnapshot['dataSource'] {
  if (!process.env.MONGODB_URI?.trim()) {
    return 'file';
  }

  return source === 'mongodb' ? 'mongodb' : 'hybrid';
}

function buildSignal(
  label: string,
  value: string,
  tone: SystemHealthSignal['tone']
): SystemHealthSignal {
  return { label: sanitizeDiagnosticsText(label), value: sanitizeDiagnosticsText(value), tone };
}

export function buildUploadRuntimeSummary(): UploadRuntimeSummary {
  const accessKey = String(process.env.DIGITALOCEAN_SPACES_ACCESS_KEY || '').trim();
  const secretKey = String(process.env.DIGITALOCEAN_SPACES_SECRET_KEY || '').trim();
  const bucket = String(process.env.DIGITALOCEAN_SPACES_BUCKET || '').trim();
  const region = String(process.env.DIGITALOCEAN_SPACES_REGION || '').trim();
  const cdnBaseUrl = String(process.env.DIGITALOCEAN_SPACES_CDN_BASE_URL || '').trim();
  const configuredCount = [accessKey, secretKey, bucket, region].filter(Boolean).length;
  const coreReady = configuredCount === 4;

  const status: SystemHealthStatus =
    coreReady && cdnBaseUrl ? 'healthy' : coreReady ? 'watch' : 'critical';

  return {
    status,
    summary:
      status === 'healthy'
        ? 'DigitalOcean Spaces upload delivery is configured for newsroom assets.'
        : status === 'watch'
          ? 'DigitalOcean Spaces is configured, but the CDN URL is not pinned.'
          : configuredCount > 0
            ? 'DigitalOcean Spaces upload configuration is only partially set.'
            : 'DigitalOcean Spaces upload configuration is missing.',
    detail:
      status === 'healthy'
        ? 'Admin uploads, story images, thumbnails, and e-paper assets can use the shared DigitalOcean Spaces pipeline.'
        : status === 'watch'
          ? 'Uploads can run with the derived Spaces CDN URL, but setting DIGITALOCEAN_SPACES_CDN_BASE_URL keeps public media URLs explicit.'
          : 'Uploads depend on DigitalOcean Spaces. Set access key, secret key, bucket, and region before relying on admin upload flows.',
    signals: [
      buildSignal('Upload Provider', coreReady ? 'DigitalOcean Spaces ready' : 'DigitalOcean Spaces not ready', coreReady ? 'good' : configuredCount > 0 ? 'warning' : 'critical'),
      buildSignal('Spaces Bucket', bucket || 'Missing', bucket ? 'good' : 'critical'),
      buildSignal('Spaces Region', region || 'Missing', region ? 'good' : 'critical'),
      buildSignal('Spaces CDN', cdnBaseUrl ? 'Configured' : coreReady ? 'Derived URL' : 'Missing', cdnBaseUrl ? 'good' : coreReady ? 'warning' : 'critical'),
      buildSignal('Image Limit', '5 MB', 'neutral'),
      buildSignal('Thumb Limit', '10 MB', 'neutral'),
      buildSignal('E-Paper PDF Limit', '25 MB', 'neutral'),
    ],
  };
}

export function buildOcrRuntimeSummary(): OcrRuntimeSummary {
  const localOnly = readBooleanEnv(process.env.NEXT_PUBLIC_EPAPER_LOCAL_OCR_ONLY);
  const remoteFallback = readBooleanEnv(process.env.NEXT_PUBLIC_EPAPER_REMOTE_OCR_FALLBACK);
  const customApiUrl = String(process.env.OCR_CUSTOM_API_URL || '').trim();
  const customApiKey = String(process.env.OCR_CUSTOM_API_KEY || '').trim();
  const ocrSpaceKey = String(process.env.OCR_SPACE_API_KEY || '').trim();
  const preferredLanguage = String(process.env.OCR_SPACE_LANGUAGE || 'hin').trim() || 'hin';
  const remoteReady = Boolean(customApiUrl || ocrSpaceKey);

  let status: SystemHealthStatus = 'watch';
  if (localOnly) {
    status = 'healthy';
  } else if (remoteFallback && remoteReady) {
    status = 'healthy';
  } else if (remoteFallback && !remoteReady) {
    status = 'critical';
  } else if (!remoteFallback && remoteReady) {
    status = 'watch';
  }

  return {
    status,
    summary:
      status === 'healthy'
        ? 'OCR assist has at least one reliable operating mode configured.'
        : status === 'critical'
          ? 'Server OCR fallback is enabled, but no remote OCR provider is configured.'
          : 'OCR can still run locally, but fallback coverage is limited.',
    detail:
      localOnly
        ? 'The desk is locked to local OCR only. That is stable when browser OCR works, but it removes server-side rescue paths.'
        : remoteFallback
          ? remoteReady
            ? 'The desk can fall back to server OCR if local OCR fails, using either a custom OCR API or OCR.Space.'
            : 'Remote fallback is enabled, but no OCR provider credentials are ready yet.'
          : remoteReady
            ? 'A remote OCR provider is configured, but the browser client is not currently allowed to use fallback automatically.'
            : 'Only local OCR is effectively available right now, so difficult pages may still fail detection.',
    signals: [
      buildSignal('OCR Mode', localOnly ? 'Local only' : remoteFallback ? 'Local + remote fallback' : 'Local preferred', status === 'healthy' ? 'good' : status === 'critical' ? 'critical' : 'warning'),
      buildSignal('Remote OCR', remoteReady ? 'Configured' : 'Not configured', remoteReady ? 'good' : remoteFallback ? 'critical' : 'warning'),
      buildSignal('Custom OCR', customApiUrl ? customApiKey ? 'Configured' : 'URL without key' : 'Off', customApiUrl ? customApiKey ? 'good' : 'warning' : 'neutral'),
      buildSignal('OCR.Space', ocrSpaceKey ? preferredLanguage : 'Off', ocrSpaceKey ? 'good' : 'neutral'),
    ],
  };
}

function mapHealthAlert(alert: LeadershipReportHealthAlert): OperationalDiagnosticsAlert {
  return {
    id: `report-${alert.id}`,
    tone:
      alert.severity === 'critical'
        ? 'critical'
        : alert.severity === 'warning'
          ? 'warning'
          : 'neutral',
    title: sanitizeDiagnosticsText(alert.title),
    detail: sanitizeDiagnosticsText(alert.detail),
    href: alert.actionHref ? sanitizeDiagnosticsText(alert.actionHref) : undefined,
    actionLabel: alert.actionLabel ? sanitizeDiagnosticsText(alert.actionLabel) : undefined,
  };
}

export function sanitizeOperationalDiagnosticsSnapshot(
  snapshot: OperationalDiagnosticsSnapshot
): OperationalDiagnosticsSnapshot {
  return {
    dataSource: snapshot.dataSource,
    summary: { ...snapshot.summary },
    lanes: snapshot.lanes.map((lane) => ({
      ...lane,
      label: sanitizeDiagnosticsText(lane.label),
      summary: sanitizeDiagnosticsText(lane.summary),
      detail: sanitizeDiagnosticsText(lane.detail),
      href: lane.href ? sanitizeDiagnosticsText(lane.href) : undefined,
    })),
    runtimeSignals: snapshot.runtimeSignals.map((signal) => ({
      ...signal,
      label: sanitizeDiagnosticsText(signal.label),
      value: sanitizeDiagnosticsText(signal.value),
    })),
    alerts: snapshot.alerts.map((alert) => ({
      ...alert,
      title: sanitizeDiagnosticsText(alert.title),
      detail: sanitizeDiagnosticsText(alert.detail),
      href: alert.href ? sanitizeDiagnosticsText(alert.href) : undefined,
      actionLabel: alert.actionLabel ? sanitizeDiagnosticsText(alert.actionLabel) : undefined,
    })),
    reportEscalations: snapshot.reportEscalations.map((esc) => ({
      ...esc,
      label: sanitizeDiagnosticsText(esc.label),
      reason: sanitizeDiagnosticsText(esc.reason),
      actionHref: sanitizeDiagnosticsText(esc.actionHref),
      actionLabel: sanitizeDiagnosticsText(esc.actionLabel),
    })),
    blockedEditions: snapshot.blockedEditions.map((ed) => ({
      ...ed,
      title: sanitizeDiagnosticsText(ed.title),
      cityName: sanitizeDiagnosticsText(ed.cityName),
      blockers: ed.blockers.map(sanitizeDiagnosticsText),
    })),
    lowQualityPages: snapshot.lowQualityPages.map((pg) => ({
      ...pg,
      epaperTitle: sanitizeDiagnosticsText(pg.epaperTitle),
      cityName: sanitizeDiagnosticsText(pg.cityName),
      qualityLabel: sanitizeDiagnosticsText(pg.qualityLabel),
      issueSummary: sanitizeDiagnosticsText(pg.issueSummary),
      reviewedByName: sanitizeDiagnosticsText(pg.reviewedByName),
    })),
    recentFailures: snapshot.recentFailures.map((rf) => ({
      ...rf,
      message: sanitizeDiagnosticsText(rf.message),
      action: sanitizeDiagnosticsText(rf.action),
      sourceType: sanitizeDiagnosticsText(rf.sourceType),
      variant: sanitizeDiagnosticsText(rf.variant),
    })),
  };
}

export async function getOperationalDiagnosticsSnapshot(): Promise<OperationalDiagnosticsSnapshot> {
  const [epaperInsightsResult, schedulesResult, runHistoryResult] = await Promise.allSettled([
    getEpaperInsights({ maxLowQualityPages: 10, maxBlockedEditions: 8 }),
    listLeadershipReportSchedules(),
    listLeadershipReportRunHistory(120),
  ]);

  const epaperInsights: EpaperInsights =
    epaperInsightsResult.status === 'fulfilled'
      ? epaperInsightsResult.value
      : {
          source: 'file',
          editionCounts: { total: 0, inProduction: 0, readyToPublish: 0, published: 0 },
          pageQualityCounts: { good: 0, watch: 0, critical: 0, lowTextPages: 0, pendingQa: 0, needsAttentionQa: 0, readyQa: 0 },
          lowQualityPages: [],
          blockedEditions: [],
        };

  const schedules =
    schedulesResult.status === 'fulfilled' ? schedulesResult.value : [];
  const runHistory =
    runHistoryResult.status === 'fulfilled' ? runHistoryResult.value : [];

  const dataSource = deriveDataSource(epaperInsights.source);

  let runtime: LeadershipReportRuntimeSnapshot;
  try {
    runtime = await getLeadershipReportRuntimeSnapshot(schedules);
  } catch (err) {
    console.warn('Failed to retrieve leadership report runtime snapshot:', err);
    runtime = {
      cronSecretConfigured: false,
      emailDeliveryConfigured: false,
      resendConfigured: false,
      fromEmailConfigured: false,
      dueNowCount: 0,
      dueNowIds: [],
    };
  }

  let reportAlerts: LeadershipReportHealthAlert[] = [];
  try {
    reportAlerts = buildLeadershipReportHealthAlerts({
      schedules,
      history: runHistory,
      runtime,
    });
  } catch (err) {
    console.warn('Failed to build leadership report health alerts:', err);
  }

  let reportEscalations: LeadershipReportEscalation[] = [];
  try {
    reportEscalations = buildLeadershipReportEscalations({
      schedules,
      history: runHistory,
      runtime,
    });
  } catch (err) {
    console.warn('Failed to build leadership report escalations:', err);
  }

  const uploadRuntime = buildUploadRuntimeSummary();
  const ocrRuntime = buildOcrRuntimeSummary();

  let systemHealth: SystemHealthSummary;
  try {
    systemHealth = await getSystemHealthSummary({
      dataSource,
      blockedEditions: epaperInsights.blockedEditions.length,
      qualityAlerts: epaperInsights.lowQualityPages.length,
      queuePressure: epaperInsights.editionCounts.inProduction,
      inboxEscalations: 0,
      teamAlerts: 0,
    });
  } catch (err) {
    console.warn('Failed to get system health summary for operational diagnostics:', err);
    systemHealth = {
      dataSource,
      services: [
        {
          id: 'database',
          label: 'Database',
          status: 'critical',
          summary: 'Database connectivity probe failed.',
          detail: 'Database connectivity probe threw an exception.',
        },
      ],
      runtimeSignals: [],
      recentFailures: [],
      risks: ['System health summary degraded'],
      metrics: {
        serviceRisks: 1,
        recentFailures: 0,
        failedAssets: 0,
        staleAssets: 0,
        enabledSurfaces: 0,
        writableStorage: false,
      },
    };
  }

  const serviceMap = new Map<string, SystemHealthService>(
    systemHealth.services.map((service) => [service.id, service])
  );

  const lanes: OperationalDiagnosticsLane[] = [
    serviceMap.get('database'),
    {
      id: 'upload-pipeline',
      label: 'Upload Pipeline',
      status: uploadRuntime.status,
      summary: uploadRuntime.summary,
      detail: uploadRuntime.detail,
      href: '/admin/settings',
    },
    {
      id: 'ocr-assist',
      label: 'OCR Assist',
      status: ocrRuntime.status,
      summary: ocrRuntime.summary,
      detail: ocrRuntime.detail,
      href: '/admin/epapers',
    },
    serviceMap.get('shared-tts'),
    {
      id: 'reporting-jobs',
      label: 'Reporting Jobs',
      status:
        reportEscalations.some((entry) => entry.severity === 'critical') ||
        reportAlerts.some((entry) => entry.severity === 'critical' && entry.id !== 'healthy')
          ? 'critical'
          : reportEscalations.length || reportAlerts.some((entry) => entry.severity === 'warning')
            ? 'watch'
            : 'healthy',
      summary:
        reportEscalations.length || reportAlerts.some((entry) => entry.severity !== 'info')
          ? 'Leadership reporting still has active runtime or delivery risks.'
          : 'Leadership reporting schedules look stable right now.',
      detail: `${reportAlerts.filter((entry) => entry.severity !== 'info').length} health alert(s), ${reportEscalations.length} escalated schedule(s), and ${runtime.dueNowCount} due schedule(s) are visible in the reporting lane.`,
      href: '/admin/analytics',
    },
    {
      id: 'epaper-desk',
      label: 'E-Paper Desk',
      status:
        epaperInsights.blockedEditions.length > 0
          ? 'critical'
          : epaperInsights.lowQualityPages.length > 0
            ? 'watch'
            : 'healthy',
      summary:
        epaperInsights.blockedEditions.length > 0
          ? 'Some editions are still blocked from publish readiness.'
          : epaperInsights.lowQualityPages.length > 0
            ? 'The desk has quality alerts, but no hard publish blockers.'
            : 'No major edition blockers are visible right now.',
      detail: `${epaperInsights.blockedEditions.length} blocked edition(s), ${epaperInsights.lowQualityPages.length} low-quality page(s), and ${epaperInsights.editionCounts.inProduction} edition(s) currently in production.`,
      href: '/admin/epapers',
    },
  ].filter((lane): lane is OperationalDiagnosticsLane => Boolean(lane));

  const alerts: OperationalDiagnosticsAlert[] = [
    ...(uploadRuntime.status !== 'healthy'
      ? [
          {
            id: 'upload-runtime',
            tone: uploadRuntime.status === 'critical' ? 'critical' : 'warning',
            title: 'Upload pipeline needs attention',
            detail: uploadRuntime.detail,
            href: '/admin/settings',
            actionLabel: 'Review upload config',
          } satisfies OperationalDiagnosticsAlert,
        ]
      : []),
    ...(ocrRuntime.status !== 'healthy'
      ? [
          {
            id: 'ocr-runtime',
            tone: ocrRuntime.status === 'critical' ? 'critical' : 'warning',
            title: 'OCR assist coverage is limited',
            detail: ocrRuntime.detail,
            href: '/admin/epapers',
            actionLabel: 'Open e-paper desk',
          } satisfies OperationalDiagnosticsAlert,
        ]
      : []),
    ...reportAlerts
      .filter((alert) => alert.id !== 'healthy')
      .slice(0, 4)
      .map(mapHealthAlert),
    ...(epaperInsights.blockedEditions.length > 0
      ? [
          {
            id: 'blocked-editions',
            tone: 'critical',
            title: 'Blocked editions are still active',
            detail: `${epaperInsights.blockedEditions.length} e-paper edition(s) still have publish blockers.`,
            href: '/admin/epapers',
            actionLabel: 'Open blocked editions',
          } satisfies OperationalDiagnosticsAlert,
        ]
      : []),
    ...(epaperInsights.lowQualityPages.length > 0
      ? [
          {
            id: 'quality-pages',
            tone: 'warning',
            title: 'Low-quality pages still need desk cleanup',
            detail: `${epaperInsights.lowQualityPages.length} page(s) still show OCR, hotspot, or QA issues.`,
            href: '/admin/review-queue',
            actionLabel: 'Open review queue',
          } satisfies OperationalDiagnosticsAlert,
        ]
      : []),
  ];

  const runtimeSignals = [
    ...uploadRuntime.signals,
    ...ocrRuntime.signals,
    ...systemHealth.runtimeSignals,
    buildSignal(
      'Report Cron',
      runtime.cronSecretConfigured ? 'Configured' : 'Missing',
      runtime.cronSecretConfigured ? 'good' : 'warning'
    ),
    buildSignal(
      'Report Email',
      runtime.emailDeliveryConfigured ? 'Ready' : 'Not configured',
      runtime.emailDeliveryConfigured ? 'good' : 'warning'
    ),
    buildSignal(
      'Due Right Now',
      String(runtime.dueNowCount),
      runtime.dueNowCount > 0 ? 'warning' : 'good'
    ),
  ];

  return sanitizeOperationalDiagnosticsSnapshot({
    dataSource,
    summary: {
      servicesAtRisk: lanes.filter((lane) => lane.status !== 'healthy').length,
      uploadAlerts: alerts.filter((alert) => alert.id === 'upload-runtime' || alert.id === 'ocr-runtime').length,
      reportingRisks:
        reportEscalations.length +
        reportAlerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'warning').length,
      blockedEditions: epaperInsights.blockedEditions.length,
    },
    lanes,
    runtimeSignals,
    alerts,
    reportEscalations,
    blockedEditions: epaperInsights.blockedEditions,
    lowQualityPages: epaperInsights.lowQualityPages,
    recentFailures: systemHealth.recentFailures,
  });
}
