import 'server-only';

import {
  epaperMetadataService,
  type PublicEpaperMetadataQuery,
  type PublicEpaperStoryMetadataQuery,
} from '@/lib/server/epaper/epaperMetadataService';

export type {
  PublicEpaperMetadata,
  PublicEpaperStoryMetadata,
} from '@/lib/server/epaper/epaperMetadataService';

export function getPublicEpaperForMetadata(query: PublicEpaperMetadataQuery) {
  return epaperMetadataService.getEdition(query);
}

export function getPublicEpaperStoryForMetadata(query: PublicEpaperStoryMetadataQuery) {
  return epaperMetadataService.getStory(query);
}
