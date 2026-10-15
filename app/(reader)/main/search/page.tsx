import { Suspense } from 'react';
import SearchClient from './SearchClient';

export const metadata = { title: 'Search | Lokswami', robots: { index: false, follow: true } };

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchClient />
    </Suspense>
  );
}
