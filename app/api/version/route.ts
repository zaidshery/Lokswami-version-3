import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    commit: process.env.LOKSWAMI_BUILD_COMMIT || 'unknown',
    dirty: process.env.LOKSWAMI_BUILD_DIRTY || 'unknown',
    nodeMajor: Number(process.versions.node.split('.')[0]),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
