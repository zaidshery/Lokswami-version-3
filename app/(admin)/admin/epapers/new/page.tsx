'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { ArrowLeft, Link2, Loader2, UploadCloud } from 'lucide-react';
import DateInputField from '@/components/ui/DateInputField';
import { getAuthHeader } from '@/lib/auth/clientToken';
import {
  EPAPER_CITY_OPTIONS,
  type EPaperCitySlug,
} from '@/lib/constants/epaperCities';
import { uploadFileToSignedUrl } from '@/lib/utils/epaperDirectUploadClient';
import {
  getPublicationTypeLabels,
  normalizePublicationIssueDate,
  normalizePublicationIssueMonth,
  resolveEPaperPublicationType,
} from '@/lib/utils/epaperPublication';

type UploadTarget = {
  mediaKey: string;
  uploadUrl: string;
  uploadHeaders?: Record<string, string>;
};

type InitializeUploadResponse = {
  success?: boolean;
  error?: string;
  data?: {
    epaperId?: string;
    uploadTarget?: UploadTarget;
  };
};

type BasicResponse = {
  success?: boolean;
  error?: string;
  warning?: string | null;
  data?: { _id?: string; epaperId?: string };
};

export default function NewEPaperPage() {
  const router = useRouter();
  const pathname = usePathname();
  const publicationType = resolveEPaperPublicationType(
    pathname.startsWith('/admin/emagazines') ? 'emagazine' : 'epaper'
  );
  const labels = useMemo(
    () => getPublicationTypeLabels(publicationType),
    [publicationType]
  );
  const isMonthlyPublication = publicationType === 'emagazine';
  const [createMode, setCreateMode] = useState<'upload' | 'import'>('upload');
  const [citySlugs, setCitySlugs] = useState<EPaperCitySlug[]>([
    EPAPER_CITY_OPTIONS[0].slug
  ]);
  const [title, setTitle] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [pageImageUrlInput, setPageImageUrlInput] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submitDirectUpload = async (slug: string) => {
    if (!pdfFile) {
      throw new Error('Choose a PDF to upload.');
    }

    const authHeaders = getAuthHeader();
    const issueDate = normalizePublicationIssueDate(publishDate, publicationType);
    setNotice(
      isMonthlyPublication
        ? `Creating the draft ${labels.lowercase} issue...`
        : `Creating the draft ${labels.lowercase} for ${slug}...`
    );
    const initializeResponse = await fetch('/api/admin/epapers/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        publicationType,
        citySlug: isMonthlyPublication ? undefined : slug,
        title: title.trim(),
        publishDate: issueDate,
        fileName: pdfFile.name,
        fileType: pdfFile.type || 'application/pdf',
        fileSize: pdfFile.size,
      }),
    });
    const initializePayload =
      (await initializeResponse.json().catch(() => ({}))) as InitializeUploadResponse;
    const epaperId = initializePayload.data?.epaperId;
    const target = initializePayload.data?.uploadTarget;
    if (
      !initializeResponse.ok ||
      !initializePayload.success ||
      !epaperId ||
      !target?.mediaKey ||
      !target.uploadUrl
    ) {
      throw new Error(
        initializePayload.error || `Failed to initialize the ${labels.lowercase} upload.`
      );
    }

    setNotice('Uploading the PDF to DigitalOcean Spaces...');
    await uploadFileToSignedUrl({
      file: pdfFile,
      uploadUrl: target.uploadUrl,
      uploadHeaders: target.uploadHeaders || {
        'Content-Type': pdfFile.type || 'application/pdf',
      },
    });

    setNotice('Verifying the PDF and queuing background conversion...');
    const finalizeResponse = await fetch(
      `/api/admin/epapers/${encodeURIComponent(epaperId)}/uploads/finalize`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          mediaKey: target.mediaKey,
          expectedSize: pdfFile.size,
          expectedFileType: pdfFile.type || 'application/pdf',
          expectedFileName: pdfFile.name,
          uploadReceipt: (target as { uploadReceipt?: string }).uploadReceipt,
        }),
      }
    );
    const finalizePayload =
      (await finalizeResponse.json().catch(() => ({}))) as BasicResponse;
    if (!finalizeResponse.ok || !finalizePayload.success) {
      throw new Error(
        finalizePayload.error || 'Failed to queue PDF conversion.'
      );
    }

    return epaperId;
  };

  const submitRemoteImport = async (slug: string) => {
    if (!pdfUrl.trim()) {
      throw new Error('A PDF link is required for URL import.');
    }

    const issueDate = normalizePublicationIssueDate(publishDate, publicationType);
    setNotice(
      isMonthlyPublication
        ? `Downloading and validating the remote ${labels.lowercase} assets...`
        : `Downloading and validating the remote ${labels.lowercase} assets for ${slug}...`
    );
    const resolvedCityName = EPAPER_CITY_OPTIONS.find((item) => item.slug === slug)?.name || '';
    const response = await fetch('/api/admin/epapers/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        publicationType,
        citySlug: isMonthlyPublication ? undefined : slug,
        cityName: isMonthlyPublication ? undefined : resolvedCityName,
        title: title.trim(),
        publishDate: issueDate,
        pdfUrl: pdfUrl.trim(),
        thumbnailUrl: thumbnailUrl.trim(),
        pageImageUrls: pageImageUrlInput
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean),
        sourceLabel: sourceLabel.trim(),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as BasicResponse;
    const epaperId = payload.data?._id;
    if (!response.ok || !payload.success || !epaperId) {
      throw new Error(payload.error || `Failed to import the ${labels.lowercase}.`);
    }
    if (payload.warning) {
      setNotice(payload.warning);
    }
    return epaperId;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const issueDate = normalizePublicationIssueDate(publishDate, publicationType);
    const targetCitySlugs = isMonthlyPublication ? [''] : citySlugs;
    if ((!isMonthlyPublication && citySlugs.length === 0) || !title.trim() || !issueDate) {
      setError(
        isMonthlyPublication
          ? `Title and ${labels.issueLabel.toLowerCase()} are required.`
          : `At least one city, title, and ${labels.issueLabel.toLowerCase()} are required.`
      );
      return;
    }

    setLoading(true);
    try {
      let lastEpaperId = '';
      for (const slug of targetCitySlugs) {
        lastEpaperId =
          createMode === 'upload'
            ? await submitDirectUpload(slug)
            : await submitRemoteImport(slug);
      }
      
      if (targetCitySlugs.length === 1 && lastEpaperId) {
        router.push(`${labels.adminBasePath}/${lastEpaperId}`);
      } else {
        router.push(labels.adminBasePath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to create ${labels.lowercase}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Link
        href={labels.adminBasePath}
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {labels.plural}
      </Link>

      <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Upload {labels.singular}</h1>
        <p className="mt-1 text-sm text-gray-600">
          New {isMonthlyPublication ? 'monthly issues' : 'editions'} are always created as drafts. PDF pages are converted in
          the background at 3000px width, and page one becomes the cover.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {notice}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-5 space-y-5">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setCreateMode('upload')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                createMode === 'upload'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              Direct upload
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('import')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                createMode === 'import'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              Google Drive / URL import
            </button>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${isMonthlyPublication ? '' : 'md:grid-cols-2'}`}>
            {!isMonthlyPublication ? (
              <div className="flex flex-col">
                <span className="mb-1 block text-xs font-semibold text-gray-600">
                  Cities
                </span>
                <div className="flex flex-wrap gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={citySlugs.length === EPAPER_CITY_OPTIONS.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCitySlugs(EPAPER_CITY_OPTIONS.map((c) => c.slug));
                        } else {
                          setCitySlugs([]);
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                    />
                    <span className="font-medium text-gray-900">All Cities</span>
                  </label>
                  {EPAPER_CITY_OPTIONS.map((city) => (
                    <label
                      key={city.slug}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={citySlugs.includes(city.slug)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCitySlugs([...citySlugs, city.slug]);
                          } else {
                            setCitySlugs(citySlugs.filter((s) => s !== city.slug));
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                      />
                      <span className="text-gray-700">{city.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <label>
              <span className="mb-1 block text-xs font-semibold text-gray-600">
                {labels.issueLabel}
              </span>
              {isMonthlyPublication ? (
                <input
                  type="month"
                  value={normalizePublicationIssueMonth(publishDate)}
                  onChange={(event) => setPublishDate(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              ) : (
                <DateInputField
                  value={publishDate}
                  onChange={setPublishDate}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              )}
              <p className="mt-1 text-xs text-gray-500">{labels.issueHelp}</p>
            </label>
          </div>

          <label>
            <span className="mb-1 block text-xs font-semibold text-gray-600">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`${labels.singular} - ${isMonthlyPublication ? 'May 2026' : '16 Feb 2026'}`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>

          {createMode === 'upload' ? (
            <label>
              <span className="mb-1 block text-xs font-semibold text-gray-600">
                PDF (required, max 25MB)
              </span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <p className="mt-1 text-xs text-gray-600">
                Conversion continues on the server after you leave this page.
              </p>
            </label>
          ) : (
            <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">
                  PDF URL
                </span>
                <input
                  type="url"
                  value={pdfUrl}
                  onChange={(event) => setPdfUrl(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">
                  Thumbnail URL (optional)
                </span>
                <input
                  type="url"
                  value={thumbnailUrl}
                  onChange={(event) => setThumbnailUrl(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-600">
                  When omitted, rendered page one becomes the cover.
                </p>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">
                  Source Label (optional)
                </span>
                <input
                  type="text"
                  value={sourceLabel}
                  onChange={(event) => setSourceLabel(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">
                  Optional Page Image URLs (one per line)
                </span>
                <textarea
                  value={pageImageUrlInput}
                  onChange={(event) => setPageImageUrlInput(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-70"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : createMode === 'upload' ? (
              <UploadCloud className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {loading
              ? 'Processing...'
              : createMode === 'upload'
                ? 'Upload and Queue PDF'
                : `Import ${labels.singular}`}
          </button>
        </form>
      </div>
    </div>
  );
}
