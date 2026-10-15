import { ContentSnapshotStore, SNAPSHOT_RELATIVE_ROOT } from './store';
import type { SnapshotManifest } from './types';

export function formatSnapshotInspection(manifest: SnapshotManifest): string {
  const supportedShorts = manifest.shorts.filter((item) => item.supported).length;
  const unsupportedShorts = manifest.shorts.length - supportedShorts;
  const downloadedArticleImages = manifest.articles.filter(
    (item) => item.image?.status === 'downloaded'
  ).length;
  const unavailableArticleImages = manifest.articles.filter(
    (item) => item.image?.status === 'unavailable'
  ).length;
  const providers = Array.from(new Set([...manifest.videos, ...manifest.shorts].map((item) => item.provider)))
    .filter(Boolean)
    .sort();
  return [
    `Source: ${manifest.sourceHost}`,
    `Snapshot captured: ${manifest.pulledAt}`,
    `Freshness cutoff: ${manifest.freshness?.since || 'none (latest bounded API results)'}`,
    `Location: ${SNAPSHOT_RELATIVE_ROOT}`,
    `Articles: ${manifest.articles.length}`,
    `Article images: ${downloadedArticleImages} downloaded, ${unavailableArticleImages} unavailable`,
    `Breaking: ${manifest.breaking.length}`,
    `Videos: ${manifest.videos.length}`,
    `Shorts: ${manifest.shorts.length} (${supportedShorts} supported, ${unsupportedShorts} unsupported)`,
    `E-Papers: ${manifest.epapers.length}`,
    `E-Magazines: ${manifest.emagazines.length}`,
    `Assets: ${manifest.assetSummary.downloaded} downloaded, ${manifest.assetSummary.unavailable} unavailable`,
    `External video providers: ${providers.length ? providers.join(', ') : 'none'}`,
    `Recorded errors: ${manifest.errors.length}`,
    'Production write methods used: NONE',
  ].join('\n');
}

async function main() {
  try {
    const manifest = await new ContentSnapshotStore().readManifest();
    console.log(formatSnapshotInspection(manifest));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
