import { readerIdentityService } from '@/lib/server/reader/readerIdentityService';

/** Stable NextAuth integration facade for Reader credential authentication. */
export function authorizeReaderCredentials(input: { loginId?: string; password?: string }) {
  return readerIdentityService.authorize(input);
}
