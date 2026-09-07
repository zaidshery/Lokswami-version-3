'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  MessageSquare,
  Save,
  Trash2,
  UploadCloud,
  PencilRuler,
} from 'lucide-react';
import DateInputField from '@/components/ui/DateInputField';
import { getAuthHeader } from '@/lib/auth/clientToken';
import {
  canDeleteEpaper,
  canManageEpaperAssignments,
  canPublishEpaper,
} from '@/lib/auth/permissions';
import { normalizeAdminRole } from '@/lib/auth/roles';
import {
  uploadEpaperAssetDirect,
  uploadFileToSignedUrl,
} from '@/lib/utils/epaperDirectUploadClient';
import {
  buildEpaperLowResolutionWarning,
  normalizeEpaperPageImage,
} from '@/lib/utils/epaperPageImage';
import { CmsWorkflowActivityTimeline } from '@/components/admin/CmsWorkflowActivityTimeline';
import WorkflowRail from '@/components/admin/WorkflowRail';
import type {
  EPaperArticleRecord,
  EPaperRecord,
} from '@/lib/types/epaper';
import { formatUiDate, formatUiDateTime } from '@/lib/utils/dateFormat';
import {
  formatPublicationIssueLabel,
  getPublicationTypeLabels,
  normalizePublicationIssueDate,
  normalizePublicationIssueMonth,
  resolveEPaperPublicationType,
} from '@/lib/utils/epaperPublication';
import { buildEpaperEditionQualitySummary } from '@/lib/utils/epaperQualitySignals';
import { getAllowedEpaperProductionTransitions } from '@/lib/workflow/transitions';
import type { EPaperProductionStatus } from '@/lib/workflow/types';

type EpaperResponse = {
  success: boolean;
  error?: string;
  data?: EPaperRecord & { articleCount?: number };
};

type ArticlesResponse = {
  success: boolean;
  error?: string;
  data?: EPaperArticleRecord[];
};

type TeamOptionsResponse = {
  success?: boolean;
  error?: string;
  data?: AssignableUserOption[];
};

type ProductionActivityResponse = {
  success?: boolean;
  error?: string;
  data?: ProductionActivityItem[];
};

type ProcessingData = {
  job?: {
    status?: string;
    processedItems?: number;
    totalItems?: number;
    failedItems?: number;
    failedPageNumbers?: number[];
    lastError?: string;
    updatedAt?: string;
  } | null;
  pageCount?: number;
  pages?: EPaperRecord['pages'];
  productionStatus?: EPaperProductionStatus;
  stuckWarning?: string;
};

type ProcessingResponse = {
  success?: boolean;
  error?: string;
  data?: ProcessingData;
};

type PdfUploadTargetResponse = {
  success?: boolean;
  error?: string;
  data?: {
    mediaKey?: string;
    uploadUrl?: string;
    uploadHeaders?: Record<string, string>;
  };
};

type BasicResponse = {
  success?: boolean;
  error?: string;
  message?: string;
};

type TtsStatus = 'pending' | 'ready' | 'failed' | 'stale';

type TtsAssetRecord = {
  _id: string;
  sourceId: string;
  sourceParentId?: string;
  variant: 'epaper_story';
  status: TtsStatus;
  audioUrl?: string;
  lastError?: string;
};

type TtsAssetsResponse = {
  success?: boolean;
  data?: {
    assets?: TtsAssetRecord[];
  };
};

type AssignableUserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ProductionActivityItem = {
  id?: string;
  action?: string;
  message?: string;
  createdAt?: string | null;
  source?: 'audit' | 'derived';
  actor?: {
    name?: string;
    email?: string;
    role?: string | null;
  } | null;
  toStatus?: string | null;
};

type PageFilter = 'all' | 'needs-work' | 'missing-image' | 'missing-hotspots';

const PRODUCTION_ACTION_LABELS: Partial<Record<EPaperProductionStatus, string>> = {
  pages_ready: 'Mark Pages Ready',
  ocr_review: 'Start OCR Review',
  hotspot_mapping: 'Move To Hotspot Mapping',
  ready_to_publish: 'Mark Ready To Publish',
  published: 'Publish Edition',
  archived: 'Archive Edition',
};

const EPAPER_WORKFLOW_STEPS: EPaperProductionStatus[] = [
  'draft_upload',
  'pages_ready',
  'ocr_review',
  'hotspot_mapping',
  'ready_to_publish',
  'published',
];

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatProductionStatusLabel(status: string | null | undefined) {
  return String(status || 'draft_upload')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function productionTone(status: string | null | undefined) {
  switch (status) {
    case 'published':
      return 'bg-emerald-100 text-emerald-700';
    case 'ready_to_publish':
      return 'bg-blue-100 text-blue-700';
    case 'hotspot_mapping':
    case 'ocr_review':
    case 'pages_ready':
      return 'bg-amber-100 text-amber-700';
    case 'archived':
      return 'bg-zinc-200 text-zinc-700';
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
}

function editionStatusTone(status: string | null | undefined) {
  return status === 'published'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-slate-100 text-slate-700';
}

function pageChipTone(kind: 'good' | 'warn' | 'danger' | 'neutral' | 'publish') {
  switch (kind) {
    case 'good':
      return 'bg-emerald-100 text-emerald-700';
    case 'warn':
      return 'bg-amber-100 text-amber-700';
    case 'danger':
      return 'bg-red-100 text-red-700';
    case 'publish':
      return 'bg-blue-100 text-blue-700';
    case 'neutral':
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function AdminEPaperDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const role = normalizeAdminRole(session?.user?.role);
  const canManageAssignments = canManageEpaperAssignments(role);
  const canPublishPublication = canPublishEpaper(role);
  const canDeletePublication = canDeleteEpaper(role);
  const epaperId = String(params.id || '');
  const publicationType = resolveEPaperPublicationType(
    pathname.startsWith('/admin/emagazines') ? 'emagazine' : 'epaper'
  );
  const labels = useMemo(
    () => getPublicationTypeLabels(publicationType),
    [publicationType]
  );
  const isMonthlyPublication = publicationType === 'emagazine';
  const workspaceNoun = isMonthlyPublication ? 'Issue' : 'Edition';
  const productionActionLabels = useMemo<Partial<Record<EPaperProductionStatus, string>>>(
    () => ({
      ...PRODUCTION_ACTION_LABELS,
      published: `Publish ${workspaceNoun}`,
      archived: `Archive ${workspaceNoun}`,
    }),
    [workspaceNoun]
  );

  const [epaper, setEpaper] = useState<EPaperRecord | null>(null);
  const [articles, setArticles] = useState<EPaperArticleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pageImageWarning, setPageImageWarning] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingPage, setUploadingPage] = useState<number | null>(null);
  const [generatingPages, setGeneratingPages] = useState(false);
  const [runningOcrAutomation, setRunningOcrAutomation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingRevision, setCreatingRevision] = useState(false);
  const [epaperTtsByStoryId, setEpaperTtsByStoryId] = useState<Record<string, TtsAssetRecord>>({});
  const [processingData, setProcessingData] = useState<ProcessingData | null>(null);

  const [title, setTitle] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [productionStatus, setProductionStatus] =
    useState<EPaperProductionStatus>('draft_upload');
  const [productionAssigneeId, setProductionAssigneeId] = useState('');
  const [productionNote, setProductionNote] = useState('');
  const [productionActivity, setProductionActivity] = useState<ProductionActivityItem[]>([]);
  const [isUpdatingProduction, setIsUpdatingProduction] = useState(false);
  const [isLoadingProductionActivity, setIsLoadingProductionActivity] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUserOption[]>([]);
  const [isLoadingAssignableUsers, setIsLoadingAssignableUsers] = useState(false);
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);
  const [pageFilter, setPageFilter] = useState<PageFilter>('all');

  const loadProcessing = useCallback(async () => {
    if (!epaperId) return null;
    try {
      const response = await fetch(`/api/admin/epapers/${epaperId}/processing`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as ProcessingResponse;
      if (!response.ok || !payload.success || !payload.data) return null;
      setProcessingData(payload.data);
      const status = payload.data.job?.status;
      const isTerminal =
        status === 'completed' ||
        status === 'completed_with_errors' ||
        status === 'failed' ||
        status === 'cancelled';

      if (isTerminal) {
        const editionResponse = await fetch(
          `/api/admin/epapers/${epaperId}?publicationType=${publicationType}`,
          {
            headers: { ...getAuthHeader() },
            cache: 'no-store',
          }
        );
        const editionPayload = (await editionResponse
          .json()
          .catch(() => ({}))) as EpaperResponse;
        if (editionResponse.ok && editionPayload.success && editionPayload.data) {
          setEpaper(editionPayload.data);
          setProductionStatus(
            editionPayload.data.productionStatus || 'draft_upload'
          );
        }
      } else {
        setEpaper((current) =>
          current
            ? {
                ...current,
                pageCount: payload.data?.pageCount || current.pageCount,
                pages: payload.data?.pages || current.pages,
                productionStatus:
                  payload.data?.productionStatus || current.productionStatus,
              }
            : current
        );
      }
      return payload.data;
    } catch {
      return null;
    }
  }, [epaperId, publicationType]);

  const loadEpaperTtsAssets = useCallback(async () => {
    if (!epaperId) {
      setEpaperTtsByStoryId({});
      return;
    }

    try {
      const params = new URLSearchParams({
        sourceType: 'epaperArticle',
        sourceParentId: epaperId,
        variant: 'epaper_story',
        limit: 'all',
      });
      const response = await fetch(`/api/admin/tts/assets?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as TtsAssetsResponse;
      if (!response.ok || !data.success || !Array.isArray(data.data?.assets)) {
        return;
      }

      const nextMap: Record<string, TtsAssetRecord> = {};
      for (const asset of data.data.assets) {
        if (!nextMap[asset.sourceId]) {
          nextMap[asset.sourceId] = asset;
        }
      }
      setEpaperTtsByStoryId(nextMap);
    } catch {
      // Keep e-paper admin usable even if TTS overview fails to load.
    }
  }, [epaperId]);

  const loadAssignableUsers = useCallback(async () => {
    if (!epaperId || !canManageAssignments) {
      setAssignableUsers([]);
      return;
    }

    setIsLoadingAssignableUsers(true);
    try {
      const response = await fetch('/api/admin/team/options', {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as TeamOptionsResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error || 'Failed to load assignable team members');
      }

      setAssignableUsers(payload.data);
    } catch {
      setAssignableUsers([]);
    } finally {
      setIsLoadingAssignableUsers(false);
    }
  }, [canManageAssignments, epaperId]);

  const loadProductionActivity = useCallback(async () => {
    if (!epaperId) {
      setProductionActivity([]);
      return;
    }

    setIsLoadingProductionActivity(true);
    try {
      const response = await fetch(`/api/admin/epapers/${epaperId}/activity`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as ProductionActivityResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error || 'Failed to load e-paper activity');
      }

      setProductionActivity(payload.data);
    } catch {
      setProductionActivity([]);
    } finally {
      setIsLoadingProductionActivity(false);
    }
  }, [epaperId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [epaperRes, articlesRes] = await Promise.all([
        fetch(`/api/admin/epapers/${epaperId}?publicationType=${publicationType}`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`/api/admin/epapers/${epaperId}/articles`, {
          headers: { ...getAuthHeader() },
        }),
      ]);

      const epaperPayload = (await epaperRes.json()) as EpaperResponse;
      const articlesPayload = (await articlesRes.json()) as ArticlesResponse;

      if (!epaperRes.ok || !epaperPayload.success || !epaperPayload.data) {
        throw new Error(epaperPayload.error || 'Failed to load e-paper');
      }

      setEpaper(epaperPayload.data);
      setArticles(Array.isArray(articlesPayload.data) ? articlesPayload.data : []);
      setTitle(epaperPayload.data.title || '');
      setPublishDate(epaperPayload.data.publishDate || '');
      setProductionStatus(epaperPayload.data.productionStatus || 'draft_upload');
      setProductionAssigneeId(epaperPayload.data.productionAssignee?.id || '');
      await Promise.all([
        loadEpaperTtsAssets(),
        loadProductionActivity(),
        loadProcessing(),
      ]);
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to load e-paper'));
      setEpaper(null);
      setArticles([]);
      setEpaperTtsByStoryId({});
      setProductionActivity([]);
    } finally {
      setLoading(false);
    }
  }, [epaperId, loadEpaperTtsAssets, loadProcessing, loadProductionActivity, publicationType]);

  useEffect(() => {
    if (!epaperId) return;
    void fetchData();
  }, [epaperId, fetchData]);

  useEffect(() => {
    if (!epaperId) return;
    void loadAssignableUsers();
  }, [epaperId, loadAssignableUsers]);

  useEffect(() => {
    const status = processingData?.job?.status;
    if (status !== 'queued' && status !== 'processing') return;
    const timer = window.setInterval(() => {
      void loadProcessing();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadProcessing, processingData?.job?.status]);

  useEffect(() => {
    if (!epaper) {
      setSelectedPageNumbers([]);
      return;
    }

    const validPages = new Set(
      Array.from({ length: Math.max(1, epaper.pageCount) }, (_, index) => index + 1)
    );
    setSelectedPageNumbers((current) =>
      current.filter((pageNumber) => validPages.has(pageNumber))
    );
  }, [epaper]);

  const hotspotsByPage = useMemo(() => {
    const map = new Map<number, number>();
    for (const article of articles) {
      const page = Number(article.pageNumber || 0);
      if (!page) continue;
      map.set(page, (map.get(page) || 0) + 1);
    }
    return map;
  }, [articles]);

  const ttsSummary = useMemo(() => {
    let eligible = 0;
    let ready = 0;
    let stale = 0;
    let failed = 0;

    for (const article of articles) {
      const hasReadableText = Boolean(
        String(article.contentHtml || '').trim() || String(article.excerpt || '').trim()
      );
      if (!hasReadableText) continue;

      eligible += 1;
      const asset = epaperTtsByStoryId[article._id];
      if (asset?.status === 'ready' && asset.audioUrl) {
        ready += 1;
      } else if (asset?.status === 'stale') {
        stale += 1;
      } else if (asset?.status === 'failed') {
        failed += 1;
      }
    }

    return {
      eligible,
      ready,
      stale,
      failed,
      missing: Math.max(0, eligible - ready - stale - failed),
    };
  }, [articles, epaperTtsByStoryId]);

  const ttsByPage = useMemo(() => {
    const map = new Map<number, { eligible: number; ready: number }>();
    for (const article of articles) {
      const page = Number(article.pageNumber || 0);
      if (!page) continue;

      const hasReadableText = Boolean(
        String(article.contentHtml || '').trim() || String(article.excerpt || '').trim()
      );
      const current = map.get(page) || { eligible: 0, ready: 0 };
      if (hasReadableText) {
        current.eligible += 1;
        const asset = epaperTtsByStoryId[article._id];
        if (asset?.status === 'ready' && asset.audioUrl) {
          current.ready += 1;
        }
      }
      map.set(page, current);
    }
    return map;
  }, [articles, epaperTtsByStoryId]);

  const editionQualitySummary = useMemo(() => {
    if (!epaper) {
      return buildEpaperEditionQualitySummary({
        pageCount: 1,
        pages: [],
        articles: [],
      });
    }

    return buildEpaperEditionQualitySummary({
      pageCount: epaper.pageCount,
      pages: epaper.pages,
      articles,
    });
  }, [articles, epaper]);

  const saveMeta = async () => {
    if (!epaper) return;
    setSavingMeta(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(`/api/admin/epapers/${epaper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          title: title.trim(),
          publishDate: normalizePublicationIssueDate(publishDate, publicationType),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save metadata');
      }

      setNotice(`${labels.singular} metadata updated`);
      await fetchData();
    } catch (err: unknown) {
      setError(toErrorMessage(err, `Failed to save ${labels.lowercase} metadata`));
    } finally {
      setSavingMeta(false);
    }
  };

  const onPageImageUpload = async (pageNumber: number, file: File | null) => {
    if (!epaper || !file) return;

    setUploadingPage(pageNumber);
    setError('');
    setNotice('');
    setPageImageWarning('');

    try {
      const authHeaders = getAuthHeader();
      const normalized = await normalizeEpaperPageImage(file);
      const uploaded = await uploadEpaperAssetDirect({
        kind: 'epaper_page_image',
        file: normalized.file,
        authHeaders,
        publicationType,
        citySlug: epaper.citySlug,
        publishDate: epaper.publishDate,
        pageNumber,
      });

      const response = await fetch(`/api/admin/epapers/${epaper._id}/pages`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          pages: [
            {
              pageNumber,
              imagePath: uploaded.asset.mediaUrl,
              mediaKey: uploaded.asset.mediaKey,
              width: normalized.width,
              height: normalized.height,
            },
          ],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to upload page image');
      }

      setNotice(`Page ${pageNumber} image updated`);
      if (normalized.isLowResolution) {
        setPageImageWarning(
          buildEpaperLowResolutionWarning(pageNumber, normalized.width)
        );
      }
      await fetchData();
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to upload page image'));
    } finally {
      setUploadingPage(null);
    }
  };

  const onPdfUpload = async (file: File | null) => {
    if (!epaper || !file) return;

    setUploadingPdf(true);
    setError('');
    setNotice('');
    setPageImageWarning('');

    try {
      const authHeaders = getAuthHeader();
      const initResponse = await fetch('/api/admin/uploads/epaper-asset/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          kind: 'epaper_pdf',
          publicationType,
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          citySlug: epaper.citySlug,
          publishDate: normalizePublicationIssueDate(
            epaper.publishDate,
            publicationType
          ),
        }),
      });
      const initPayload =
        (await initResponse.json().catch(() => ({}))) as PdfUploadTargetResponse;
      const target = initPayload.data;

      if (
        !initResponse.ok ||
        !initPayload.success ||
        !target?.mediaKey ||
        !target.uploadUrl
      ) {
        throw new Error(initPayload.error || 'Failed to initialize PDF upload.');
      }

      setNotice('Uploading the PDF to DigitalOcean Spaces...');
      await uploadFileToSignedUrl({
        file,
        uploadUrl: target.uploadUrl,
        uploadHeaders: target.uploadHeaders || {
          'Content-Type': file.type || 'application/pdf',
        },
      });

      setNotice('Verifying the PDF and queuing background conversion...');
      const finalizeResponse = await fetch(
        `/api/admin/epapers/${encodeURIComponent(epaper._id)}/uploads/finalize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            mediaKey: target.mediaKey,
            expectedSize: file.size,
            expectedFileType: file.type || 'application/pdf',
            expectedFileName: file.name,
          }),
        }
      );
      const finalizePayload =
        (await finalizeResponse.json().catch(() => ({}))) as BasicResponse;

      if (!finalizeResponse.ok || !finalizePayload.success) {
        throw new Error(finalizePayload.error || 'Failed to queue PDF conversion.');
      }

      setNotice(
        finalizePayload.message ||
          'PDF verified and queued for background conversion.'
      );
      await fetchData();
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to upload PDF.'));
    } finally {
      setUploadingPdf(false);
    }
  };

  const deletePaper = async () => {
    if (!epaper) return;
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/epapers/${epaper._id}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to delete ${labels.lowercase}`);
      }
      router.push(labels.adminBasePath);
    } catch (err: unknown) {
      setError(toErrorMessage(err, `Failed to delete ${labels.lowercase}`));
      setDeleting(false);
    }
  };

  const generatePageImages = async () => {
    if (!epaper) return;
    setGeneratingPages(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/admin/epapers/${epaper._id}/processing/retry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({}),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to queue missing pages');
      }

      if (payload?.warning) {
        setNotice(String(payload.warning));
      } else {
        setNotice('Missing or failed pages were queued for background conversion.');
      }
      await loadProcessing();
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to queue missing pages'));
    } finally {
      setGeneratingPages(false);
    }
  };

  const createDraftRevision = async () => {
    if (!epaper) return;
    setCreatingRevision(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/epapers/${epaper._id}/revisions`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
      });
      const payload = await response.json().catch(() => ({}));
      const revisionId = payload?.data?.revisionId;
      if ((!response.ok && response.status !== 409) || !revisionId) {
        throw new Error(payload?.error || 'Failed to create draft revision.');
      }
      router.push(`${labels.adminBasePath}/${revisionId}`);
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to create draft revision.'));
      setCreatingRevision(false);
    }
  };

  const runOcrAutomation = async (pageNumbersToProcess: number[] = []) => {
    if (!epaper) return;

    setRunningOcrAutomation(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(`/api/admin/epapers/${epaper._id}/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          pageNumbers: pageNumbersToProcess,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        data?: {
          suggestionsCreated?: number;
          pagesFailed?: number;
        };
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to run OCR automation');
      }

      setNotice(
        `${
          payload.message || 'OCR queued. Suggestions will appear after processing.'
        }${
          payload.data?.pagesFailed
            ? ` ${payload.data.pagesFailed} page(s) need manual OCR review.`
            : ''
        }`.trim()
      );
      await fetchData();
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to run OCR automation'));
    } finally {
      setRunningOcrAutomation(false);
    }
  };

  const updateProductionDesk = async (nextStatus?: EPaperProductionStatus) => {
    if (!epaper) return;
    const note = productionNote.trim();

    setIsUpdatingProduction(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(`/api/admin/epapers/${epaper._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          ...(nextStatus ? { productionStatus: nextStatus } : {}),
          ...(canManageAssignments ? { assignedToId: productionAssigneeId } : {}),
          note,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as EpaperResponse & {
        message?: string;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to update e-paper production');
      }

      setEpaper(payload.data);
      setProductionStatus(payload.data.productionStatus || 'draft_upload');
      setProductionAssigneeId(payload.data.productionAssignee?.id || '');
      setProductionNote('');
      setNotice(payload.message || 'E-paper production updated');
      await loadProductionActivity();
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to update e-paper production'));
    } finally {
      setIsUpdatingProduction(false);
    }
  };

  const toggleSelectedPage = (pageNumber: number) => {
    setSelectedPageNumbers((current) =>
      current.includes(pageNumber)
        ? current.filter((value) => value !== pageNumber)
        : [...current, pageNumber].sort((left, right) => left - right)
    );
  };

  const toggleSelectAllPages = (pageNumbers: number[]) => {
    setSelectedPageNumbers((current) =>
      current.length === pageNumbers.length ? [] : pageNumbers
    );
  };

  const updatePageType = async (
    pageNumber: number,
    pageType: NonNullable<EPaperRecord['pages'][number]['pageType']>
  ) => {
    if (!epaper) return;
    let classificationNote = '';
    if (pageType === 'blank') {
      classificationNote =
        window.prompt('Why is this page intentionally blank?')?.trim() || '';
      if (!classificationNote) {
        setError('A classification note is required for blank pages.');
        return;
      }
    }

    setError('');
    try {
      const response = await fetch(`/api/admin/epapers/${epaper._id}/pages`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          pages: [{ pageNumber, pageType, classificationNote }],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update page type.');
      }
      setNotice(`Page ${pageNumber} marked as ${pageType}.`);
      await fetchData();
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to update page type.'));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!epaper) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Link
          href={labels.adminBasePath}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {labels.plural}
        </Link>
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || `${labels.singular} not found`}
        </div>
      </div>
    );
  }

  const pages = editionQualitySummary.pageSignals.map(({ pageNumber, page, quality }) => ({
    pageNumber,
    page,
    quality,
    hotspotCount: hotspotsByPage.get(pageNumber) || 0,
    tts: ttsByPage.get(pageNumber) || { eligible: 0, ready: 0 },
  }));
  const pageQualitySummary = {
    good: editionQualitySummary.counts.good,
    watch: editionQualitySummary.counts.watch,
    critical: editionQualitySummary.counts.critical,
    lowTextPages: editionQualitySummary.counts.lowTextPages,
  };
  const readiness = epaper.readiness;
  const automation = epaper.automation;
  const activeProductionStatus = productionStatus || epaper.productionStatus || 'draft_upload';
  const hasPdf = Boolean(String(epaper.pdfPath || '').trim());
  const canUploadPdf = epaper.status !== 'published';
  const allowedProductionTransitions = getAllowedEpaperProductionTransitions(
    activeProductionStatus
  ).filter(
    (nextStatus) =>
      canPublishPublication || (nextStatus !== 'published' && nextStatus !== 'archived')
  );
  const publishBlockers = Array.from(
    new Set([...(readiness?.blockers || []), ...editionQualitySummary.publishBlockers])
  );
  const hasDeskChanges =
    productionNote.trim().length > 0 ||
    (canManageAssignments &&
      productionAssigneeId !== String(epaper.productionAssignee?.id || ''));
  const pageCoverage = readiness?.pageImageCoveragePercent ?? 0;
  const hotspotCoverage = readiness?.hotspotCoveragePercent ?? 0;
  const textCoverage = readiness?.textCoveragePercent ?? 0;
  const pageNumbers = pages.map((entry) => entry.pageNumber);
  const convertedPageCount = pages.filter(({ page }) => Boolean(page?.imagePath)).length;
  const allPagesSelected = pageNumbers.length > 0 && selectedPageNumbers.length === pageNumbers.length;
  const missingImagePages = new Set(readiness?.missingImagePages || []);
  const missingHotspotPages = new Set(readiness?.missingHotspotPages || []);
  const visiblePages = pages.filter(({ pageNumber, quality }) => {
    if (pageFilter === 'missing-image') return missingImagePages.has(pageNumber);
    if (pageFilter === 'missing-hotspots') return missingHotspotPages.has(pageNumber);
    if (pageFilter === 'needs-work') {
      return (
        quality.level !== 'good' ||
        missingImagePages.has(pageNumber) ||
        missingHotspotPages.has(pageNumber)
      );
    }
    return true;
  });
  const pageFilterOptions: Array<{
    value: PageFilter;
    label: string;
    count: number;
  }> = [
    { value: 'all', label: 'All', count: pages.length },
    {
      value: 'needs-work',
      label: 'Needs Work',
      count: pages.filter(
        ({ pageNumber, quality }) =>
          quality.level !== 'good' ||
          missingImagePages.has(pageNumber) ||
          missingHotspotPages.has(pageNumber)
      ).length,
    },
    { value: 'missing-image', label: 'Missing Image', count: missingImagePages.size },
    { value: 'missing-hotspots', label: 'No Hotspots', count: missingHotspotPages.size },
  ];

  return (
    <div className="epaper-production-desk min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px]">
        <WorkflowRail
          status={activeProductionStatus}
          assignee={epaper.productionAssignee?.name || epaper.productionAssignee?.email}
          dueAt={null}
          hasUnsavedChanges={hasDeskChanges || savingMeta}
          blockerCount={publishBlockers.length}
          primaryAction={allowedProductionTransitions[0] ? (productionActionLabels[allowedProductionTransitions[0]] || formatProductionStatusLabel(allowedProductionTransitions[0])) : `Review ${workspaceNoun}`}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link
            href={labels.adminBasePath}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {labels.plural}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {epaper.status === 'published' ? (
              <button
                type="button"
                onClick={() => void createDraftRevision()}
                disabled={creatingRevision}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-70"
              >
                {creatingRevision ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PencilRuler className="h-3.5 w-3.5" />
                )}
                Create Draft Revision
              </button>
            ) : null}
            {canUploadPdf ? (
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100">
                {uploadingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                {hasPdf ? 'Replace PDF' : 'Upload PDF'}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.target.files?.[0] || null;
                    void onPdfUpload(file);
                    event.target.value = '';
                  }}
                  disabled={uploadingPdf}
                />
              </label>
            ) : null}
            {hasPdf ? (
              <a
                href={`/api/public/epapers/${encodeURIComponent(String(epaper._id || ''))}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Open PDF
              </a>
            ) : (
              <span className="inline-flex min-h-10 items-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                PDF Missing
              </span>
            )}
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {pageImageWarning ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {pageImageWarning}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
          <main className="order-2 min-w-0 space-y-4 xl:order-1">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {workspaceNoun} workspace
                  </p>
                  <h1 className="mt-2 break-words text-2xl font-bold text-gray-900">
                    {epaper.title}
                  </h1>
                  <p className="mt-1 text-sm text-gray-600">
                    {isMonthlyPublication
                      ? formatPublicationIssueLabel(epaper.publishDate, publicationType, epaper.publishDate)
                      : `${epaper.cityName} (${epaper.citySlug}) | ${formatPublicationIssueLabel(epaper.publishDate, publicationType, epaper.publishDate)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${editionStatusTone(
                      epaper.status
                    )}`}
                  >
                    {epaper.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${productionTone(
                      activeProductionStatus
                    )}`}
                  >
                    {formatProductionStatusLabel(activeProductionStatus)}
                  </span>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto pb-1">
                <div className="flex min-w-max items-center gap-2">
                  {EPAPER_WORKFLOW_STEPS.map((step, index) => {
                    const activeIndex = EPAPER_WORKFLOW_STEPS.indexOf(activeProductionStatus);
                    const isCurrent = step === activeProductionStatus;
                    const isComplete =
                      activeIndex >= 0 && index < activeIndex && activeProductionStatus !== 'archived';
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
                            isCurrent
                              ? 'border-primary-200 bg-primary-50 text-primary-700'
                              : isComplete
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 bg-gray-50 text-gray-600'
                          }`}
                        >
                          {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                          {formatProductionStatusLabel(step)}
                        </div>
                        {index < EPAPER_WORKFLOW_STEPS.length - 1 ? (
                          <div className="h-px w-5 bg-gray-200" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {!hasPdf && canUploadPdf ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      PDF upload pending
                    </p>
                    <p className="mt-1 text-sm text-amber-900">
                      Attach the issue PDF to start page conversion and continue the workflow.
                    </p>
                  </div>
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                    {uploadingPdf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="h-3.5 w-3.5" />
                    )}
                    Upload PDF
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const file = event.target.files?.[0] || null;
                        void onPdfUpload(file);
                        event.target.value = '';
                      }}
                      disabled={uploadingPdf}
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {processingData?.job ? (
              <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      PDF processing
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-blue-950">
                      {formatProductionStatusLabel(processingData.job.status)}
                    </h2>
                    <p className="mt-1 text-sm text-blue-800">
                      PDF uploaded. Page conversion progress:{' '}
                      {processingData.job.processedItems || convertedPageCount}/
                      {processingData.job.totalItems || epaper.pageCount} pages converted
                      {processingData.job.failedItems
                        ? `, ${processingData.job.failedItems} failed`
                        : ''}
                    </p>
                  </div>
                  {processingData.job.status !== 'queued' &&
                  processingData.job.status !== 'processing' ? (
                    <button
                      type="button"
                      onClick={() => void generatePageImages()}
                      disabled={generatingPages}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-70"
                    >
                      {generatingPages ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UploadCloud className="h-3.5 w-3.5" />
                      )}
                      Retry Missing Pages
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((processingData.job.processedItems || 0) /
                            Math.max(
                              1,
                              processingData.job.totalItems || epaper.pageCount
                            )) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
                {processingData.job.failedPageNumbers?.length ? (
                  <p className="mt-2 text-xs text-red-700">
                    Failed pages: {processingData.job.failedPageNumbers.join(', ')}
                  </p>
                ) : null}
                {processingData.job.lastError ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-red-700">
                    {processingData.job.lastError}
                  </p>
                ) : null}
                {processingData.stuckWarning ? (
                  <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    {processingData.stuckWarning}
                  </p>
                ) : null}
              </section>
            ) : null}

            {hasPdf && !processingData?.job ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      PDF uploaded
                    </p>
                    <p className="mt-1 text-sm text-emerald-900">
                      Page conversion progress: {convertedPageCount}/{epaper.pageCount} pages converted.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadProcessing()}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Refresh Status
                  </button>
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Batch actions
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Manage conversion retries, OCR, and page selection from one place.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void generatePageImages()}
                    disabled={generatingPages || automation?.pageImageGenerationAvailable === false}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
                    title={
                      automation?.pageImageGenerationReason ||
                      'Requires EPAPER_ENABLE_PAGE_IMAGE_GENERATION=1 and server converter binary'
                    }
                  >
                    {generatingPages ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="h-3.5 w-3.5" />
                    )}
                    Retry Missing Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => void runOcrAutomation()}
                    disabled={runningOcrAutomation}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {runningOcrAutomation ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PencilRuler className="h-3.5 w-3.5" />
                    )}
                    Run OCR
                  </button>
                  <button
                    type="button"
                    onClick={() => void runOcrAutomation(selectedPageNumbers)}
                    disabled={runningOcrAutomation || selectedPageNumbers.length === 0}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {runningOcrAutomation ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PencilRuler className="h-3.5 w-3.5" />
                    )}
                    OCR Selected
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSelectAllPages(pageNumbers)}
                    className="inline-flex min-h-10 items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    {allPagesSelected ? 'Clear Selection' : 'Select All'}
                  </button>
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Selected pages:{' '}
                {selectedPageNumbers.length > 0 ? selectedPageNumbers.join(', ') : 'none'}
              </p>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {workspaceNoun} pages
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-gray-900">
                    {epaper.pageCount} pages
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Click any page card to open page editing and OCR/hotspot review.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="font-bold text-emerald-700">{pageQualitySummary.good}</p>
                    <p className="text-gray-500">Healthy</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="font-bold text-amber-700">{pageQualitySummary.watch}</p>
                    <p className="text-gray-500">Watch</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="font-bold text-red-700">{pageQualitySummary.critical}</p>
                    <p className="text-gray-500">Recheck</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {pageFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPageFilter(option.value)}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      pageFilter === option.value
                        ? 'border-primary-200 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                      {option.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visiblePages.map(({ pageNumber, page, hotspotCount, tts, quality }) => {
                  const hasImage = Boolean(page?.imagePath);
                  const isUploading = uploadingPage === pageNumber;
                  const isSelected = selectedPageNumbers.includes(pageNumber);
                  const editHref = `${labels.adminBasePath}/${epaper._id}/page/${pageNumber}`;
                    const statusChips = [
                    {
                      label: hasImage ? 'Uploaded' : 'Image Missing',
                      tone: hasImage ? 'good' : 'danger',
                    },
                    quality.mappedStories > 0 && quality.unreadableStories === 0
                      ? { label: 'OCR Ready', tone: 'good' }
                      : { label: 'Needs Review', tone: quality.level === 'critical' ? 'danger' : 'warn' },
                    {
                      label: formatProductionStatusLabel(page?.pageType || 'editorial'),
                      tone: 'neutral',
                    },
                    epaper.status === 'published'
                      ? { label: 'Published', tone: 'publish' }
                      : null,
                  ].filter(Boolean) as Array<{
                    label: string;
                    tone: 'good' | 'warn' | 'danger' | 'neutral' | 'publish';
                  }>;

                  return (
                    <article
                      key={pageNumber}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (hasImage) {
                          router.push(editHref);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (hasImage && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          router.push(editHref);
                        }
                      }}
                      className={`group flex min-h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                        isSelected
                          ? 'border-primary-300 ring-2 ring-primary-100'
                          : 'border-gray-200'
                      } ${!hasImage ? 'cursor-default' : ''}`}
                    >
                      <div className="relative aspect-[3/4] bg-gray-100">
                        {page?.imagePath ? (
                          <Image
                            src={page.imagePath}
                            alt={`Page ${pageNumber}`}
                            fill
                            unoptimized
                            className="object-contain"
                            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 45vw, 22vw"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center px-5 text-center text-sm text-gray-500">
                            <UploadCloud className="mb-2 h-7 w-7 text-gray-400" />
                            Page image missing
                          </div>
                        )}
                        <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-gray-900 shadow-sm">
                          Page {pageNumber}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <label
                            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectedPage(pageNumber)}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            Select
                          </label>

                          <details
                            className="relative"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <summary className="flex min-h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Page actions</span>
                            </summary>
                            <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-lg">
                              <Link
                                href={editHref}
                                className={`block rounded-md px-3 py-2 font-semibold hover:bg-gray-100 ${
                                  hasImage ? 'text-gray-700' : 'pointer-events-none text-gray-400'
                                }`}
                                aria-disabled={!hasImage}
                              >
                                View / Edit page
                              </Link>
                              <Link
                                href={editHref}
                                className={`block rounded-md px-3 py-2 font-semibold hover:bg-gray-100 ${
                                  hasImage ? 'text-gray-700' : 'pointer-events-none text-gray-400'
                                }`}
                                aria-disabled={!hasImage}
                              >
                                OCR / hotspot review
                              </Link>
                              <label className="block cursor-pointer rounded-md px-3 py-2 font-semibold text-gray-700 hover:bg-gray-100">
                                {isUploading ? 'Uploading...' : 'Replace image'}
                                <input
                                  type="file"
                                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                    const file = event.target.files?.[0] || null;
                                    void onPageImageUpload(pageNumber, file);
                                    event.target.value = '';
                                  }}
                                  disabled={isUploading}
                                />
                              </label>
                            </div>
                          </details>
                        </div>

                        <label
                          className="mt-3 block text-xs font-semibold text-gray-600"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Page type
                          <select
                            value={page?.pageType || 'editorial'}
                            onChange={(event) =>
                              void updatePageType(
                                pageNumber,
                                event.target.value as NonNullable<
                                  EPaperRecord['pages'][number]['pageType']
                                >
                              )
                            }
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
                          >
                            <option value="editorial">Editorial</option>
                            <option value="advertisement">Advertisement</option>
                            <option value="classified">Classified</option>
                            <option value="photo">Photo</option>
                            <option value="blank">Blank</option>
                          </select>
                        </label>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {statusChips.map((chip) => (
                            <span
                              key={`${pageNumber}-${chip.label}`}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${pageChipTone(
                                chip.tone
                              )}`}
                            >
                              {chip.label}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-600">
                          <div>
                            <p className="font-semibold text-gray-900">{hotspotCount}</p>
                            <p>Hotspots</p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {quality.textCoveragePercent}%
                            </p>
                            <p>Text</p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {tts.ready}/{tts.eligible}
                            </p>
                            <p>Audio</p>
                          </div>
                        </div>

                        {quality.issues[0] ? (
                          <p className="mt-3 line-clamp-2 text-xs text-gray-600">
                            {quality.issues[0]}
                          </p>
                        ) : (
                          <p className="mt-3 text-xs text-gray-500">
                            Page is clear enough for the next desk check.
                          </p>
                        )}

                        {page?.reviewNote ? (
                          <p className="mt-2 line-clamp-2 text-xs text-gray-500">
                            Note: {page.reviewNote}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {visiblePages.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                  No pages match this filter.
                </div>
              ) : null}
            </section>
          </main>

          <aside id="workflow-actions" className="order-1 min-w-0 space-y-4 xl:order-2">
            <div className="xl:sticky xl:top-6 xl:space-y-4">
              <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="bg-gray-50">
                  {epaper.thumbnailPath ? (
                    <div className="relative aspect-[3/4] max-h-[520px] w-full">
                      <Image
                        src={epaper.thumbnailPath}
                        alt={epaper.title}
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="(max-width: 1280px) 100vw, 25vw"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center text-sm text-gray-500">
                      No cover preview
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Cover preview
                  </p>
                  <h2 className="mt-2 break-words text-lg font-bold text-gray-900">
                    {epaper.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {formatPublicationIssueLabel(epaper.publishDate, publicationType, epaper.publishDate)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${editionStatusTone(
                        epaper.status
                      )}`}
                    >
                      {epaper.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${productionTone(
                        activeProductionStatus
                      )}`}
                    >
                      {formatProductionStatusLabel(activeProductionStatus)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="font-bold text-gray-900">{epaper.pageCount}</p>
                      <p className="text-gray-500">Pages</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="font-bold text-gray-900">{articles.length}</p>
                      <p className="text-gray-500">Stories</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {allowedProductionTransitions.map((nextStatus) => {
                      const isBlockedReadyToPublish =
                        (nextStatus === 'ready_to_publish' ||
                          nextStatus === 'published') &&
                        publishBlockers.length > 0;
                      return (
                        <button
                          key={nextStatus}
                          type="button"
                          onClick={() => void updateProductionDesk(nextStatus)}
                          disabled={isUpdatingProduction || isBlockedReadyToPublish}
                          className={`inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${
                            nextStatus === 'published'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : nextStatus === 'ready_to_publish'
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-primary-600 text-white hover:bg-primary-700'
                          }`}
                        >
                          {isUpdatingProduction ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : nextStatus === 'published' ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <PencilRuler className="h-3.5 w-3.5" />
                          )}
                          {productionActionLabels[nextStatus] ||
                            formatProductionStatusLabel(nextStatus)}
                        </button>
                      );
                    })}
                    {allowedProductionTransitions.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                        No workflow action available.
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:mt-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Quick checks
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    ['Page images', pageCoverage, `${readiness?.pagesWithImage || 0}/${epaper.pageCount}`],
                    ['Hotspots', hotspotCoverage, `${readiness?.pagesWithHotspots || 0}/${epaper.pageCount}`],
                    [
                      'Readable text',
                      textCoverage,
                      `${readiness?.articlesWithReadableText || 0}/${readiness?.mappedArticles || 0}`,
                    ],
                    [
                      'Story audio',
                      ttsSummary.eligible > 0 ? Math.round((ttsSummary.ready / ttsSummary.eligible) * 100) : 0,
                      `${ttsSummary.ready}/${ttsSummary.eligible}`,
                    ],
                  ].map(([label, value, caption]) => (
                    <div key={String(label)}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-700">{label}</span>
                        <span className="text-gray-500">{caption}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-primary-600"
                          style={{ width: `${Number(value)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {publishBlockers.length ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <p className="font-semibold">Publish blockers</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {publishBlockers.slice(0, 3).map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                    {readiness?.missingImagePages?.length ? (
                      <button
                        type="button"
                        onClick={() => setPageFilter('missing-image')}
                        className="mt-3 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Missing image pages: {readiness.missingImagePages.join(', ')}
                      </button>
                    ) : null}
                    {readiness?.missingHotspotPages?.length ? (
                      <button
                        type="button"
                        onClick={() => setPageFilter('missing-hotspots')}
                        className="mt-2 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Missing hotspot pages: {readiness.missingHotspotPages.join(', ')}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                    <p className="font-semibold">No critical blockers</p>
                    <p className="mt-1">{workspaceNoun} checks are clear for the current stage.</p>
                  </div>
                )}

              </section>

              <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:mt-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Workflow actions
                </p>
                <div className="mt-3 space-y-3">
                  {canManageAssignments ? (
                    <label>
                      <span className="mb-1 block text-xs font-semibold text-gray-600">
                        Production assignee
                      </span>
                      <select
                        value={productionAssigneeId}
                        onChange={(event) => setProductionAssigneeId(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
                        disabled={isLoadingAssignableUsers || isUpdatingProduction}
                      >
                        <option value="">Unassigned</option>
                        {assignableUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.role})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                      <p className="font-semibold">Desk preparation role</p>
                      <p className="mt-1">
                        You can add production notes and move work to ready-to-publish. Admin owns
                        assignment, publication, archiving, and deletion.
                      </p>
                      {epaper.productionAssignee?.name ? (
                        <p className="mt-2 font-semibold">
                          Current owner: {epaper.productionAssignee.name}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <label>
                    <span className="mb-1 block text-xs font-semibold text-gray-600">
                      Production note
                    </span>
                    <textarea
                      value={productionNote}
                      onChange={(event) => setProductionNote(event.target.value)}
                      rows={4}
                      placeholder="Capture OCR issues, missing pages, hotspot QA notes, or publish blockers."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void updateProductionDesk()}
                    disabled={isUpdatingProduction || !hasDeskChanges}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isUpdatingProduction ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                    Save Desk Update
                  </button>
                </div>
              </section>

              <details className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:mt-0">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Metadata
                </summary>
                <div className="mt-3 space-y-3">
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-gray-600">Title</span>
                    <input
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-gray-600">
                      {labels.issueLabel}
                    </span>
                    {isMonthlyPublication ? (
                      <input
                        type="month"
                        value={normalizePublicationIssueMonth(publishDate)}
                        onChange={(event) => setPublishDate(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
                      />
                    ) : (
                      <DateInputField
                        value={publishDate}
                        onChange={setPublishDate}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
                      />
                    )}
                    <p className="mt-1 text-xs text-gray-500">{labels.issueHelp}</p>
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveMeta()}
                    disabled={savingMeta}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {savingMeta ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Metadata
                  </button>
                </div>
              </details>

              <details className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:mt-0">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Diagnostics and activity
                </summary>
                <div className="mt-3 space-y-3">
                  {automation ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                      <p>
                        Source:{' '}
                        <span className="font-semibold text-gray-900">
                          {automation.sourceLabel || automation.sourceType}
                        </span>
                      </p>
                      {automation.sourceHost ? <p className="mt-1">Host: {automation.sourceHost}</p> : null}
                      <p className="mt-1">
                        Auto page images:{' '}
                        <span className="font-semibold text-gray-900">
                          {automation.pageImageGenerationAvailable ? 'Available' : 'Manual / blocked'}
                        </span>
                      </p>
                      {automation.pageImageGenerationReason ? (
                        <p className="mt-2">{automation.pageImageGenerationReason}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {readiness?.warnings?.length ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Review notes
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">
                        {readiness.warnings.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {publishBlockers.length > 1 ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        All blockers
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-red-700">
                        {publishBlockers.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <CmsWorkflowActivityTimeline
                    title="Activity timeline"
                    description="Production moves, page work, and notes land here."
                    items={productionActivity}
                    isLoading={isLoadingProductionActivity}
                    onRefresh={loadProductionActivity}
                    emptyMessage="No production activity yet."
                    fallbackMessage={`${labels.singular} activity recorded.`}
                    actionLabel={(action) => formatProductionStatusLabel(action)}
                    formatTimestamp={(value) =>
                      formatUiDateTime(value, formatUiDate(value, '')) || 'Unknown time'
                    }
                    formatStatusLabel={formatProductionStatusLabel}
                    listClassName="max-h-[360px]"
                    itemClassName="bg-gray-50"
                  />

                  {canDeletePublication ? (
                    <button
                      type="button"
                      onClick={() => void deletePaper()}
                      disabled={deleting}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {deleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete {labels.singular}
                    </button>
                  ) : null}
                </div>
              </details>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
