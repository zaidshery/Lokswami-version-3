import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { verifyPassword } from '@/lib/auth/jwt';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';

export async function authorizeReaderCredentials(input: {
  loginId?: string;
  password?: string;
}) {
  const identifier = (input.loginId || '').trim();
  const password = String(input.password || '');

  if (!identifier || !password) {
    return null;
  }

  const normalizedPhone = normalizeWhatsAppNumber(identifier);
  const normalizedEmail = identifier.toLowerCase();

  try {
    await connectDB();

    const query: Record<string, unknown> = {
      $or: [
        { email: normalizedEmail },
        ...(normalizedPhone ? [{ whatsappNumber: normalizedPhone }] : []),
        { whatsappNumber: identifier },
        { loginId: normalizedEmail },
      ],
    };

    const user = await User.findOne(query);

    if (user) {
      if (user.isActive === false) {
        return null;
      }

      if (!user.passwordHash) {
        return null;
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (isValid) {
        try {
          user.lastLoginAt = new Date();
          await user.save();
        } catch (saveError) {
          console.warn('[Auth] Failed to update reader lastLoginAt in MongoDB:', saveError);
        }

        return {
          id: user._id.toString(),
          userId: user._id.toString(),
          name: user.name,
          email: user.email,
          image: user.image || '',
          role: user.role || 'reader',
          isActive: Boolean(user.isActive),
          whatsappNumber: user.whatsappNumber,
          optInDailyEpaper: user.optInDailyEpaper !== false,
          createdAt: user.createdAt?.toISOString(),
          savedArticles: Array.isArray(user.savedArticles)
            ? user.savedArticles.map((id: unknown) => String(id))
            : [],
        };
      }

      // Authoritative Mongo user exists, but password was invalid.
      // Strict Invariant: A password mismatch against an existing authoritative Mongo user
      // must NEVER fall through to file-store credentials (prevents reverse split-brain).
      return null;
    }

    // CASE C: Mongo reachable, but no user matched query.
    // MongoDB is the sole credential authority for Phase 1.
    // Reject without falling back to file-store credential verification.
    return null;
  } catch (mongoError) {
    // CASE B: MongoDB is unavailable during reader authentication.
    // Security Invariant: Fail closed. Do NOT fall back to file-store passwords.
    // This guarantees that a stale or divergent file password can NEVER authenticate
    // during a Mongo outage (eliminates credential split-brain).
    console.warn('[Auth] MongoDB unavailable during reader auth, failing closed:', mongoError);
    return null;
  }
}
