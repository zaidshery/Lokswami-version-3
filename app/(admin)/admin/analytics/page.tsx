import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileText,
  Globe2,
  Layers3,
  LineChart,
  MousePointerClick,
  Newspaper,
  RadioTower,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  type AnalyticsCenterData,
  type AnalyticsCompareMode,
  type AnalyticsDateRange,
  getAnalyticsCenterData,
} from '@/lib/admin/analyticsCenter';
import {
  buildAnalyticsLiveChartsSnapshot,
  type AnalyticsLiveChartsSnapshot,
} from '@/lib/admin/analyticsLiveCharts';
import {
  buildBusinessGrowthInsights,
  type BusinessGrowthInsights,
} from '@/lib/admin/businessGrowthInsights';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUiDate } from '@/lib/utils/dateFormat';
import formatNumber from '@/lib/utils/formatNumber';
import {
  AnalyticsDateControls,
  AnalyticsPageHeader,
  AnalyticsPanel,
  AnalyticsTabs,
  BarList,
  DataTable,
  EmptyAnalyticsState,
  KpiCard,
  type AnalyticsControlItem,
  type AnalyticsTabItem,
} from '@/components/admin/analytics/AnalyticsUi';

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type AnalyticsTab =
  | 'overview'
  | 'audience'
  | 'traffic'
  | 'content'
  | 'engagement'
  | 'conversions'
  | 'newsroom'
  | 'system';

type WorkflowItem = AnalyticsCenterData['currentPeriod']['reviewItems'][number];

const RANGE_OPTIONS: Array<{ label: string; value: AnalyticsDateRange }> = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

const COMPARE_OPTIONS: Array<{ label: string; value: AnalyticsCompareMode }> = [
  { label: 'Off', value: 'off' },
  { label: 'Previous period', value: 'previous' },
];

const TAB_DEFINITIONS: Array<{
  id: AnalyticsTab;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: 'overview', label: 'Overview', description: 'Executive summary', icon: BarChart3 },
  { id: 'audience', label: 'Audience', description: 'Users and devices', icon: Users },
  { id: 'traffic', label: 'Traffic', description: 'Acquisition sources', icon: Globe2 },
  { id: 'content', label: 'Content', description: 'Pages and inventory', icon: FileText },
  { id: 'engagement', label: 'Engagement', description: 'Events and clicks', icon: MousePointerClick },
  { id: 'conversions', label: 'Conversions', description: 'Funnels and paths', icon: TrendingUp },
  { id: 'newsroom', label: 'Newsroom', description: 'Workflow signals', icon: Newspaper },
  { id: 'system', label: 'System', description: 'Health and data', icon: ShieldCheck },
];

const BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-full border border-[color:var(--admin-shell-border)] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[color:var(--admin-shell-text)] transition hover:bg-[color:var(--admin-shell-surface-muted)]';

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseTab(value: string | undefined): AnalyticsTab {
  if (value === 'system_health') return 'system';
  if (value === 'newsroom_ops' || value === 'epaper_ops' || value === 'team') return 'newsroom';
  if (value === 'growth') return 'conversions';
  return TAB_DEFINITIONS.some((tab) => tab.id === value) ? (value as AnalyticsTab) : 'overview';
}

function parseRange(value: string | undefined): AnalyticsDateRange {
  if (value === 'today' || value === '7d' || value === '30d' || value === '90d') {
    return value;
  }
  return '30d';
}

function parseCompare(value: string | undefined): AnalyticsCompareMode {
  return value === 'previous' ? 'previous' : 'off';
}

function buildAnalyticsHref(args: {
  tab: AnalyticsTab;
  range: AnalyticsDateRange;
  compare: AnalyticsCompareMode;
  next?: Partial<{
    tab: AnalyticsTab;
    range: AnalyticsDateRange;
    compare: AnalyticsCompareMode;
  }>;
}) {
  const params = new URLSearchParams({
    tab: args.next?.tab || args.tab,
    range: args.next?.range || args.range,
    compare: args.next?.compare || args.compare,
  });
  return `/admin/analytics?${params.toString()}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeLabel(value: string) {
  return value || 'Unknown';
}

function kpiGrid(children: React.ReactNode) {
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{children}</section>;
}

function panelGrid(children: React.ReactNode) {
  return <section className="grid gap-4 xl:grid-cols-2">{children}</section>;
}

function TimelineChart({ snapshot }: { snapshot: AnalyticsLiveChartsSnapshot }) {
  const maxValue = Math.max(
    1,
    ...snapshot.timeline.map(
      (point) =>
        point.reviewVolume +
        point.readyDecisions +
        point.qualityAlerts +
        point.blockedEditions
    )
  );

  if (!snapshot.timeline.length) {
    return <EmptyAnalyticsState message="No timeline data is available for this window." />;
  }

  return (
    <div>
      <div className="flex h-72 items-end gap-2 rounded-[22px] bg-[color:var(--admin-shell-surface-muted)] p-4">
        {snapshot.timeline.map((point) => {
          const reviewHeight = Math.max(4, (point.reviewVolume / maxValue) * 100);
          const readyHeight = Math.max(4, (point.readyDecisions / maxValue) * 100);
          const alertHeight = Math.max(4, ((point.qualityAlerts + point.blockedEditions) / maxValue) * 100);
          return (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-56 w-full items-end justify-center gap-1">
                <span
                  className="w-full max-w-4 rounded-t bg-blue-500"
                  style={{ height: `${reviewHeight}%` }}
                  title={`${point.reviewVolume} review item(s)`}
                />
                <span
                  className="w-full max-w-4 rounded-t bg-emerald-500"
                  style={{ height: `${readyHeight}%` }}
                  title={`${point.readyDecisions} ready decision(s)`}
                />
                <span
                  className="w-full max-w-4 rounded-t bg-red-500"
                  style={{ height: `${alertHeight}%` }}
                  title={`${point.qualityAlerts + point.blockedEditions} alert(s)`}
                />
              </div>
              <span className="truncate text-[10px] font-semibold text-[color:var(--admin-shell-text-muted)]">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--admin-shell-text-muted)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Review
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Ready
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Alerts
        </span>
      </div>
    </div>
  );
}

function WorkflowTable({ items }: { items: WorkflowItem[] }) {
  return (
    <DataTable
      columns={['Title', 'Type', 'Owner', 'Updated', 'Status']}
      rows={items.slice(0, 8).map((item) => [
        <Link key="title" href={item.deskHref} className="font-bold hover:underline">
          {item.title}
        </Link>,
        formatStatus(item.contentType),
        item.assignedToName || item.createdByName || item.author || 'Unassigned',
        formatUiDate(item.updatedAt, 'No date'),
        <span
          key="status"
          className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600"
        >
          {formatStatus(item.status)}
        </span>,
      ])}
      emptyMessage="No workflow items are active in this report window."
    />
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={BUTTON_CLASS}>
      {children}
    </Link>
  );
}

function buildGrowthInsights(analytics: AnalyticsCenterData): BusinessGrowthInsights {
  const current = analytics.audienceAnalytics.current;
  return buildBusinessGrowthInsights({
    sectionBreakdown: current.sectionBreakdown,
    sectionTrends: current.sectionTrends,
    sectionConversionBreakdown: current.sectionConversionBreakdown,
    sectionConversionTrends: current.sectionConversionTrends,
    channelBreakdown: current.channelBreakdown,
    channelTrends: current.channelTrends,
    channelConversionBreakdown: current.channelConversionBreakdown,
    channelConversionTrends: current.channelConversionTrends,
    pathConversionLeaders: current.pathConversionLeaders,
    pathConversionLaggards: current.pathConversionLaggards,
  });
}

function OverviewTab({
  analytics,
  snapshot,
}: {
  analytics: AnalyticsCenterData;
  snapshot: AnalyticsLiveChartsSnapshot;
}) {
  const audience = analytics.audienceAnalytics.current;
  const metrics = audience.metrics;
  const queue = analytics.currentPeriod.queueMetrics;

  return (
    <div className="space-y-4">
      {kpiGrid(
        <>
          <KpiCard label="Page views" value={metrics.pageViews} detail="Public page views in this window." icon={LineChart} />
          <KpiCard label="Sessions" value={metrics.sessions} detail="Unique reader sessions captured." icon={Users} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Audience events" value={metrics.events} detail="Reader interactions and analytics events." icon={Activity} tone="bg-blue-500/10 text-blue-600" />
          <KpiCard label="Contact conversions" value={metrics.contactSuccesses} detail={`${formatPercent(audience.conversion.sessionToContactRate)} session-to-contact rate.`} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Popup conversions" value={metrics.popupSuccesses} detail={`${formatPercent(audience.conversion.popupViewToSubmitRate)} popup submit rate.`} icon={MousePointerClick} tone="bg-purple-500/10 text-purple-600" />
          <KpiCard label="Ready decisions" value={queue.readyDecisions} detail="Newsroom items ready for decision." icon={Newspaper} tone="bg-amber-500/10 text-amber-600" />
        </>
      )}

      <AnalyticsPanel title="Performance Timeline" description={`A clean activity view for ${analytics.timeWindow.label.toLowerCase()}.`}>
        <TimelineChart snapshot={snapshot} />
      </AnalyticsPanel>

      {panelGrid(
        <>
          <AnalyticsPanel title="Top Traffic Sources" description="Where readers are coming from.">
            <BarList
              items={analytics.audienceAnalytics.current.sourceBreakdown.slice(0, 6).map((source) => ({
                label: normalizeLabel(source.source),
                value: source.sessions,
                detail: `${formatNumber(source.events)} event(s)`,
              }))}
              emptyMessage="No traffic source data has been captured yet."
            />
          </AnalyticsPanel>
          <AnalyticsPanel title="Top Content" description="Pages with the strongest reader activity.">
            <DataTable
              columns={['Page', 'Events', 'Sessions', 'Last seen']}
              rows={analytics.audienceAnalytics.current.topPages.slice(0, 6).map((page) => [
                <span key="page" className="font-bold">{page.page}</span>,
                formatNumber(page.events),
                formatNumber(page.sessions),
                formatUiDate(page.lastSeenAt, 'No date'),
              ])}
              emptyMessage="No page performance data has been captured yet."
            />
          </AnalyticsPanel>
        </>
      )}

      <AnalyticsPanel
        title="Key Alerts Summary"
        description="Only the operational signals that should interrupt the dashboard."
        action={<SectionLink href="/admin/operations">Open Operations Center</SectionLink>}
      >
        <BarList
          items={[
            { label: 'Blocked editions', value: analytics.currentPeriod.blockedEditions.length, detail: 'Editions waiting on release blockers.' },
            { label: 'Quality alerts', value: analytics.currentPeriod.lowQualityPages.length, detail: 'Pages needing OCR, hotspot, or QA cleanup.' },
            { label: 'Queue backlog', value: queue.queuePressure, detail: 'Active workflow items still moving.' },
            { label: 'System risks', value: analytics.systemHealth.metrics.serviceRisks, detail: 'Services marked watch or critical.' },
          ]}
        />
      </AnalyticsPanel>
    </div>
  );
}

function AudienceTab({ analytics }: { analytics: AnalyticsCenterData }) {
  const audience = analytics.audienceAnalytics.current;
  const metrics = audience.metrics;

  return (
    <div className="space-y-4">
      {kpiGrid(
        <>
          <KpiCard label="Users" value={metrics.sessions} detail="Session-based audience count." icon={Users} />
          <KpiCard label="Events" value={metrics.events} detail="Audience interactions recorded." icon={Activity} tone="bg-blue-500/10 text-blue-600" />
          <KpiCard label="Page views" value={metrics.pageViews} detail="Reader page view events." icon={LineChart} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Contact rate" value={formatPercent(audience.conversion.sessionToContactRate)} detail="Sessions that completed contact." icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Popup rate" value={formatPercent(audience.conversion.popupViewToSubmitRate)} detail="Popup views that converted." icon={MousePointerClick} tone="bg-purple-500/10 text-purple-600" />
          <KpiCard label="Countries" value={audience.countryBreakdown.length} detail="Country segments detected." icon={Globe2} tone="bg-amber-500/10 text-amber-600" />
        </>
      )}

      {panelGrid(
        <>
          <AnalyticsPanel title="Device Breakdown" description="Sessions by reader device type.">
            <BarList items={audience.deviceBreakdown.map((row) => ({ label: normalizeLabel(row.device), value: row.sessions, detail: `${formatNumber(row.events)} event(s)` }))} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Country Breakdown" description="Audience geography where available.">
            <BarList items={audience.countryBreakdown.slice(0, 8).map((row) => ({ label: normalizeLabel(row.country), value: row.sessions, detail: `${formatNumber(row.events)} event(s)` }))} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Language Breakdown" description="Browser language signals from audience events.">
            <BarList items={audience.languageBreakdown.slice(0, 8).map((row) => ({ label: normalizeLabel(row.language), value: row.sessions, detail: `${formatNumber(row.events)} event(s)` }))} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Audience Segments" description="Top sections by audience sessions.">
            <DataTable
              columns={['Section', 'Page views', 'Sessions']}
              rows={audience.sectionBreakdown.slice(0, 8).map((section) => [
                <span key="section" className="font-bold">{normalizeLabel(section.section)}</span>,
                formatNumber(section.pageViews),
                formatNumber(section.sessions),
              ])}
            />
          </AnalyticsPanel>
        </>
      )}
    </div>
  );
}

function TrafficTab({ analytics }: { analytics: AnalyticsCenterData }) {
  const audience = analytics.audienceAnalytics.current;

  return (
    <div className="space-y-4">
      {panelGrid(
        <>
          <AnalyticsPanel title="Channel Acquisition" description="Google Analytics style channel grouping.">
            <BarList items={audience.channelBreakdown.map((row) => ({ label: normalizeLabel(row.channel), value: row.sessions, detail: `${formatNumber(row.events)} event(s)` }))} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Source Breakdown" description="Source-level traffic movement.">
            <DataTable
              columns={['Source', 'Events', 'Sessions']}
              rows={audience.sourceBreakdown.slice(0, 10).map((source) => [
                <span key="source" className="font-bold">{normalizeLabel(source.source)}</span>,
                formatNumber(source.events),
                formatNumber(source.sessions),
              ])}
            />
          </AnalyticsPanel>
        </>
      )}

      <AnalyticsPanel title="Campaign Performance" description="UTM campaigns, sources, and mediums in one compact table.">
        <DataTable
          columns={['Campaign', 'Source', 'Medium', 'Events', 'Sessions']}
          rows={audience.campaignBreakdown.slice(0, 12).map((campaign) => [
            <span key="campaign" className="font-bold">{normalizeLabel(campaign.label)}</span>,
            normalizeLabel(campaign.source),
            normalizeLabel(campaign.medium),
            formatNumber(campaign.events),
            formatNumber(campaign.sessions),
          ])}
          emptyMessage="No campaign traffic has been captured for this report window."
        />
      </AnalyticsPanel>
    </div>
  );
}

function ContentTab({ analytics, snapshot }: { analytics: AnalyticsCenterData; snapshot: AnalyticsLiveChartsSnapshot }) {
  const audience = analytics.audienceAnalytics.current;
  const inventory = analytics.contentInventory;

  return (
    <div className="space-y-4">
      {kpiGrid(
        <>
          <KpiCard label="Total inventory" value={inventory.total} detail="All managed content inventory." icon={Layers3} />
          <KpiCard label="Articles" value={inventory.articles} detail="Published and managed articles." icon={FileText} tone="bg-blue-500/10 text-blue-600" />
          <KpiCard label="Stories" value={inventory.stories} detail="Story inventory." icon={Activity} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Videos" value={inventory.videos} detail="Video inventory." icon={RadioTower} tone="bg-purple-500/10 text-purple-600" />
          <KpiCard label="E-Papers" value={inventory.epapers} detail="Edition inventory." icon={Newspaper} tone="bg-amber-500/10 text-amber-600" />
          <KpiCard label="Top pages" value={audience.topPages.length} detail="Tracked page rows." icon={LineChart} tone="bg-red-500/10 text-red-600" />
        </>
      )}

      {panelGrid(
        <>
          <AnalyticsPanel title="Content Inventory" description="Managed content counts by type.">
            <BarList items={snapshot.contentInventory} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Views By Page Type" description="Reader activity grouped by page type.">
            <BarList items={audience.pageTypeBreakdown.map((row) => ({ label: `${normalizeLabel(row.pageType)} / ${normalizeLabel(row.section)}`, value: row.sessions, detail: `${formatNumber(row.events)} event(s)` }))} />
          </AnalyticsPanel>
        </>
      )}

      <AnalyticsPanel title="Top Pages" description="Desktop uses a table; mobile collapses into readable cards.">
        <DataTable
          columns={['Page', 'Events', 'Sessions', 'Last seen']}
          rows={audience.topPages.slice(0, 12).map((page) => [
            <span key="page" className="font-bold">{page.page}</span>,
            formatNumber(page.events),
            formatNumber(page.sessions),
            formatUiDate(page.lastSeenAt, 'No date'),
          ])}
        />
      </AnalyticsPanel>
    </div>
  );
}

function EngagementTab({ analytics }: { analytics: AnalyticsCenterData }) {
  const audience = analytics.audienceAnalytics.current;
  const metrics = audience.metrics;

  return (
    <div className="space-y-4">
      {kpiGrid(
        <>
          <KpiCard label="Events" value={metrics.events} detail="All captured reader events." icon={Activity} />
          <KpiCard label="Contact starts" value={metrics.contactStarts} detail="Readers who began contact flow." icon={MousePointerClick} tone="bg-blue-500/10 text-blue-600" />
          <KpiCard label="Contact submits" value={metrics.contactSuccesses} detail="Completed contact actions." icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Popup views" value={metrics.popupViews} detail="Popup impressions captured." icon={RadioTower} tone="bg-purple-500/10 text-purple-600" />
          <KpiCard label="Popup success" value={metrics.popupSuccesses} detail="Popup conversions captured." icon={TrendingUp} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Event types" value={audience.eventBreakdown.length} detail="Unique event names." icon={Layers3} tone="bg-amber-500/10 text-amber-600" />
        </>
      )}

      {panelGrid(
        <>
          <AnalyticsPanel title="Event Breakdown" description="Most common audience actions.">
            <BarList items={audience.eventBreakdown.map((event) => ({ label: formatStatus(event.event), value: event.count }))} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Engagement Funnel" description="Contact and popup activity side by side.">
            <DataTable
              columns={['Funnel', 'Start or view', 'Success', 'Rate']}
              rows={[
                ['Contact', formatNumber(metrics.contactStarts), formatNumber(metrics.contactSuccesses), formatPercent(audience.conversion.contactStartToSubmitRate)],
                ['Popup', formatNumber(metrics.popupViews), formatNumber(metrics.popupSuccesses), formatPercent(audience.conversion.popupViewToSubmitRate)],
                ['Session to contact', formatNumber(metrics.sessions), formatNumber(metrics.contactSuccesses), formatPercent(audience.conversion.sessionToContactRate)],
              ]}
            />
          </AnalyticsPanel>
        </>
      )}
    </div>
  );
}

function ConversionsTab({ analytics }: { analytics: AnalyticsCenterData }) {
  const audience = analytics.audienceAnalytics.current;
  const conversion = audience.conversion;
  const growth = buildGrowthInsights(analytics);

  return (
    <div className="space-y-4">
      {kpiGrid(
        <>
          <KpiCard label="Contact rate" value={formatPercent(conversion.contactStartToSubmitRate)} detail="Contact starts to submits." icon={CheckCircle2} />
          <KpiCard label="Popup rate" value={formatPercent(conversion.popupViewToSubmitRate)} detail="Popup views to submits." icon={MousePointerClick} tone="bg-purple-500/10 text-purple-600" />
          <KpiCard label="Session to contact" value={formatPercent(conversion.sessionToContactRate)} detail="Sessions ending in contact." icon={Users} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Session to popup" value={formatPercent(conversion.sessionToPopupRate)} detail="Sessions reaching popup flow." icon={RadioTower} tone="bg-blue-500/10 text-blue-600" />
          <KpiCard label="Best paths" value={audience.pathConversionLeaders.length} detail="High-performing conversion paths." icon={TrendingUp} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Weak paths" value={audience.pathConversionLaggards.length} detail="Paths needing improvement." icon={AlertTriangle} tone="bg-red-500/10 text-red-600" />
        </>
      )}

      {panelGrid(
        <>
          <AnalyticsPanel title="Section Conversion" description="Sections ranked by conversion sessions.">
            <BarList items={audience.sectionConversionBreakdown.map((row) => ({ label: normalizeLabel(row.label), value: row.conversionSessions, detail: `${formatPercent(row.overallConversionRate)} overall conversion` }))} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Growth Watch" description="Best and weak paths from the growth model.">
            <BarList items={growth.watchlist.map((item) => ({ label: item.title, value: item.tone === 'good' ? 3 : item.tone === 'watch' ? 2 : 1, detail: item.detail }))} emptyMessage="No growth watch items are available for this window." />
          </AnalyticsPanel>
        </>
      )}

      <AnalyticsPanel title="Conversion Paths" description="Leaders and laggards presented as compact tables.">
        <div className="grid gap-4 xl:grid-cols-2">
          <DataTable
            columns={['Best path', 'Sessions', 'Conversions', 'Rate']}
            rows={audience.pathConversionLeaders.slice(0, 6).map((path) => [
              <span key="path" className="font-bold">{path.label}</span>,
              formatNumber(path.sessions),
              formatNumber(path.conversionSessions),
              formatPercent(path.overallConversionRate),
            ])}
          />
          <DataTable
            columns={['Weak path', 'Sessions', 'Conversions', 'Rate']}
            rows={audience.pathConversionLaggards.slice(0, 6).map((path) => [
              <span key="path" className="font-bold">{path.label}</span>,
              formatNumber(path.sessions),
              formatNumber(path.conversionSessions),
              formatPercent(path.overallConversionRate),
            ])}
          />
        </div>
      </AnalyticsPanel>
    </div>
  );
}

function NewsroomTab({ analytics, snapshot }: { analytics: AnalyticsCenterData; snapshot: AnalyticsLiveChartsSnapshot }) {
  const queue = analytics.currentPeriod.queueMetrics;

  return (
    <div className="space-y-4">
      {kpiGrid(
        <>
          <KpiCard label="Review volume" value={queue.reviewVolume} detail="All newsroom workflow items." icon={Newspaper} />
          <KpiCard label="Ready decisions" value={queue.readyDecisions} detail="Items awaiting release decisions." icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Queue pressure" value={queue.queuePressure} detail="Active review and production work." icon={Activity} tone="bg-blue-500/10 text-blue-600" />
          <KpiCard label="Blocked editions" value={analytics.currentPeriod.blockedEditions.length} detail="Editions still blocked." icon={AlertTriangle} tone="bg-red-500/10 text-red-600" />
          <KpiCard label="Quality alerts" value={analytics.currentPeriod.lowQualityPages.length} detail="Pages needing cleanup." icon={Layers3} tone="bg-amber-500/10 text-amber-600" />
          <KpiCard label="Active editions" value={queue.activeEditionCount} detail="Edition items still in workflow." icon={FileText} tone="bg-purple-500/10 text-purple-600" />
        </>
      )}

      {panelGrid(
        <>
          <AnalyticsPanel title="Queue By Type" description="Article, story, video, and e-paper workflow split.">
            <BarList items={snapshot.queueByType} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Workflow Stages" description="Current editorial stage distribution.">
            <BarList items={snapshot.queueStages} />
          </AnalyticsPanel>
        </>
      )}

      <AnalyticsPanel
        title="Live Review Queue"
        description="A professional desktop table that becomes cards on phone."
        action={<SectionLink href="/admin/review-queue">Open Review Queue</SectionLink>}
      >
        <WorkflowTable items={analytics.currentPeriod.reviewItems} />
      </AnalyticsPanel>

      <AnalyticsPanel title="E-Paper Quality" description="Production quality signals for editions.">
        <BarList items={snapshot.epaperQuality} />
      </AnalyticsPanel>
    </div>
  );
}

function SystemTab({
  analytics,
  snapshot,
  canViewDiagnostics,
}: {
  analytics: AnalyticsCenterData;
  snapshot: AnalyticsLiveChartsSnapshot;
  canViewDiagnostics: boolean;
}) {
  return (
    <div className="space-y-4">
      {kpiGrid(
        <>
          <KpiCard label="Service risks" value={analytics.systemHealth.metrics.serviceRisks} detail="Services needing attention." icon={AlertTriangle} />
          <KpiCard label="Recent failures" value={analytics.systemHealth.metrics.recentFailures} detail="Failures in this window." icon={Activity} tone="bg-red-500/10 text-red-600" />
          <KpiCard label="Failed assets" value={analytics.systemHealth.metrics.failedAssets} detail="TTS assets in failed state." icon={FileText} tone="bg-amber-500/10 text-amber-600" />
          <KpiCard label="Enabled surfaces" value={analytics.systemHealth.metrics.enabledSurfaces} detail="Active audio surfaces." icon={RadioTower} tone="bg-blue-500/10 text-blue-600" />
          <KpiCard label="Active team" value={analytics.teamHealth.totals.active} detail="Active admin-side users." icon={Users} tone="bg-emerald-500/10 text-emerald-600" />
          <KpiCard label="Storage writable" value={analytics.systemHealth.metrics.writableStorage ? 'Yes' : 'No'} detail="Shared storage write status." icon={ShieldCheck} tone="bg-purple-500/10 text-purple-600" />
        </>
      )}

      {panelGrid(
        <>
          <AnalyticsPanel title="System Metrics" description="Operational health in compact form.">
            <BarList items={snapshot.systemMetrics} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Service States" description="Current service readiness.">
            <BarList items={snapshot.serviceStates} />
          </AnalyticsPanel>
          <AnalyticsPanel title="Team Status" description="Access and staff readiness signals.">
            <BarList items={snapshot.teamStatus} />
          </AnalyticsPanel>
          <AnalyticsPanel
            title="Diagnostics"
            description="Advanced system tools stay behind dedicated pages."
            action={<SectionLink href="/admin/operations">Operations Center</SectionLink>}
          >
            <div className="flex flex-wrap gap-2">
              <SectionLink href="/admin/settings/newsroom">Newsroom Settings</SectionLink>
              {canViewDiagnostics ? (
                <SectionLink href="/admin/operations-diagnostics">System Diagnostics</SectionLink>
              ) : null}
            </div>
          </AnalyticsPanel>
        </>
      )}
    </div>
  );
}

function renderActiveTab(args: {
  activeTab: AnalyticsTab;
  analytics: AnalyticsCenterData;
  snapshot: AnalyticsLiveChartsSnapshot;
  canViewDiagnostics: boolean;
}) {
  switch (args.activeTab) {
    case 'audience':
      return <AudienceTab analytics={args.analytics} />;
    case 'traffic':
      return <TrafficTab analytics={args.analytics} />;
    case 'content':
      return <ContentTab analytics={args.analytics} snapshot={args.snapshot} />;
    case 'engagement':
      return <EngagementTab analytics={args.analytics} />;
    case 'conversions':
      return <ConversionsTab analytics={args.analytics} />;
    case 'newsroom':
      return <NewsroomTab analytics={args.analytics} snapshot={args.snapshot} />;
    case 'system':
      return (
        <SystemTab
          analytics={args.analytics}
          snapshot={args.snapshot}
          canViewDiagnostics={args.canViewDiagnostics}
        />
      );
    case 'overview':
    default:
      return <OverviewTab analytics={args.analytics} snapshot={args.snapshot} />;
  }
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/analytics');
  }

  if (!canViewPage(admin.role, 'analytics')) {
    redirect('/admin/work?access=denied');
  }

  const params = await searchParams;
  const activeTab = parseTab(getParam(params, 'tab'));
  const range = parseRange(getParam(params, 'range'));
  const compare = parseCompare(getParam(params, 'compare'));

  const analytics = await getAnalyticsCenterData({ range, compare });
  const snapshot = buildAnalyticsLiveChartsSnapshot(analytics);
  const canViewDiagnostics = canViewPage(admin.role, 'operations_diagnostics');
  const rangeControls: AnalyticsControlItem[] = RANGE_OPTIONS.map((option) => ({
    label: option.label,
    href: buildAnalyticsHref({ tab: activeTab, range, compare, next: { range: option.value } }),
    active: option.value === range,
  }));
  const compareControls: AnalyticsControlItem[] = COMPARE_OPTIONS.map((option) => ({
    label: option.label,
    href: buildAnalyticsHref({ tab: activeTab, range, compare, next: { compare: option.value } }),
    active: option.value === compare,
  }));
  const tabs: AnalyticsTabItem[] = TAB_DEFINITIONS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    description: tab.description,
    icon: tab.icon,
    active: tab.id === activeTab,
    href: buildAnalyticsHref({ tab: activeTab, range, compare, next: { tab: tab.id } }),
  }));

  return (
    <div className="space-y-4">
      <AnalyticsPageHeader
        eyebrow="Analytics"
        title="Analytics Command Center"
        description="A focused Google Analytics-style dashboard for audience performance, traffic, content, conversions, newsroom workflow, and system health."
        actions={
          <>
            <span className="rounded-full bg-[color:var(--admin-shell-surface-muted)] px-4 py-2 text-xs font-semibold text-[color:var(--admin-shell-text-muted)]">
              {analytics.timeWindow.label}
            </span>
            <SectionLink href="/admin/operations">Operations Center</SectionLink>
          </>
        }
      />

      <AnalyticsDateControls rangeControls={rangeControls} compareControls={compareControls} />
      <AnalyticsTabs tabs={tabs} />

      {renderActiveTab({ activeTab, analytics, snapshot, canViewDiagnostics })}

      <p className="text-center text-xs text-[color:var(--admin-shell-text-muted)]">
        Data source: {analytics.dashboard.source}. Last refreshed for {analytics.timeWindow.label.toLowerCase()}.
      </p>
    </div>
  );
}
