import { NextRequest } from 'next/server';
import { serveStoryAsset } from '@/lib/server/media/storyAssetDelivery';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return serveStoryAsset(req, context);
}
