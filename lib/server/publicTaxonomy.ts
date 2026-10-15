import 'server-only';

export type {
  PublicCategoryItem,
  PublicCityItem,
} from './content/articleTypes';

import { publicTaxonomyService } from './content/publicTaxonomyService';
import type {
  PublicCategoryItem,
  PublicCityItem,
} from './content/articleTypes';

export function listPublicCategories(): PublicCategoryItem[] {
  return publicTaxonomyService.listPublicCategories();
}

export function listPublicCities(): PublicCityItem[] {
  return publicTaxonomyService.listPublicCities();
}
