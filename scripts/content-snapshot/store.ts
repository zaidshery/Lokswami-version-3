import fs from 'fs/promises';
import path from 'path';
import { resolveWithinRoot, safeAssetFilename } from './safety';
import type { DownloadedAsset } from './safety';
import type { SnapshotManifest, SnapshotMediaKind } from './types';

export const SNAPSHOT_RELATIVE_ROOT = '.local/content-snapshots/lokswami';

export function defaultSnapshotRoot(cwd = process.cwd()): string {
  return path.resolve(cwd, SNAPSHOT_RELATIVE_ROOT);
}

export class ContentSnapshotStore {
  readonly root: string;

  constructor(root = defaultSnapshotRoot()) {
    this.root = path.resolve(root);
  }

  get manifestPath(): string {
    return resolveWithinRoot(this.root, 'manifest.json');
  }

  async writeAsset(
    sourceUrl: string,
    kind: SnapshotMediaKind,
    asset: DownloadedAsset
  ): Promise<string> {
    const directory = kind === 'pdf' ? 'pdf' : 'images';
    const filename = safeAssetFilename(sourceUrl, asset.contentType);
    const absolutePath = resolveWithinRoot(this.root, 'media', directory, filename);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, asset.bytes, { flag: 'w' });
    return path.relative(this.root, absolutePath).split(path.sep).join('/');
  }

  async writeManifest(manifest: SnapshotManifest): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'w',
    });
  }

  async readManifest(): Promise<SnapshotManifest> {
    const raw = await fs.readFile(this.manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as SnapshotManifest;
    if (parsed.schemaVersion !== 1 || parsed.sourceHost !== 'lokswami.com') {
      throw new Error('Unsupported or invalid LokSwami content snapshot manifest.');
    }
    return parsed;
  }
}
