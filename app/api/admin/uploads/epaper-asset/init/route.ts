import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canEditEpaper } from '@/lib/auth/permissions';
import {
  createEpaperAssetUploadTarget,
  type EpaperAssetKind,
  EPAPER_ASSET_KINDS,
  parseEpaperAssetSize,
  validateEpaperAssetSelection,
} from '@/lib/storage/epaperAssetUpload';
import { normalizeEPaperPublicationType } from '@/lib/types/epaper';
import { normalizePublicationIssueDate } from '@/lib/utils/epaperPublication';

export const runtime = 'nodejs';

function parseKind(value: unknown): EpaperAssetKind | null {
  const normalized = String(value || '').trim();
  return EPAPER_ASSET_KINDS.includes(normalized as EpaperAssetKind)
    ? (normalized as EpaperAssetKind)
    : null;
}

async function POSTHandler(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canEditEpaper(admin.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = parseKind(body.kind);
    if (!kind) {
      return NextResponse.json({ success: false, error: 'Invalid e-paper asset kind.' }, { status: 400 });
    }

    const publicationType = normalizeEPaperPublicationType(body.publicationType);
    const input = {
      kind,
      publicationType,
      fileName: String(body.fileName || '').trim(),
      fileType: String(body.fileType || '').trim().toLowerCase(),
      fileSize: parseEpaperAssetSize(body.fileSize),
      citySlug: typeof body.citySlug === 'string' ? body.citySlug.trim() : '',
      publishDate: normalizePublicationIssueDate(body.publishDate, publicationType),
      pageNumber: parseEpaperAssetSize(body.pageNumber),
      articleId: typeof body.articleId === 'string' ? body.articleId.trim() : '',
    };

    const validationError = validateEpaperAssetSelection(input);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const target = createEpaperAssetUploadTarget(input);
    return NextResponse.json(
      {
        success: true,
        message: 'E-paper asset upload initialized successfully',
        data: target,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error initializing e-paper asset upload:', error);
    const message = error instanceof Error ? error.message : 'Failed to initialize e-paper asset upload';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
