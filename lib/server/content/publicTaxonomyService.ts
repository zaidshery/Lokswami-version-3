import 'server-only';

import {
  NEWS_CATEGORIES,
  getNewsCategoryHref,
} from '@/lib/constants/newsCategories';
import { EPAPER_CITY_OPTIONS } from '@/lib/constants/epaperCities';
import type { PublicCategoryItem, PublicCityItem } from './articleTypes';

export class PublicTaxonomyService {
  listPublicCategories(): PublicCategoryItem[] {
    return NEWS_CATEGORIES.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      nameEn: category.nameEn,
      icon: category.icon,
      color: category.color,
      href: getNewsCategoryHref(category.slug),
    }));
  }

  listPublicCities(): PublicCityItem[] {
    return EPAPER_CITY_OPTIONS.map((city) => ({
      slug: city.slug,
      name: city.name,
      href: `/main/epaper?city=${encodeURIComponent(city.slug)}`,
    }));
  }
}

export const publicTaxonomyService = new PublicTaxonomyService();
