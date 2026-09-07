import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { verifyPassword } from '@/lib/auth/jwt';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';
import { findStoredUserByIdentifier, upsertStoredUser } from '@/lib/storage/usersFile';

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

    if (user && user.passwordHash) {
      if (user.isActive === false) {
        return null;
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (isValid) {
        user.lastLoginAt = new Date();
        await user.save();

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
    }
  } catch (mongoError) {
    console.warn('[Auth] MongoDB reader auth fallback to file store:', mongoError);
  }

  // Fallback to JSON file storage
  try {
    const fileUser = await findStoredUserByIdentifier(identifier);
    if (fileUser && fileUser.passwordHash) {
      if (fileUser.isActive === false) {
        return null;
      }

      const isValid = await verifyPassword(password, fileUser.passwordHash);
      if (isValid) {
        await upsertStoredUser({
          ...fileUser,
          lastLoginAt: new Date().toISOString(),
        });

        return {
          id: fileUser._id,
          userId: fileUser._id,
          name: fileUser.name,
          email: fileUser.email,
          image: fileUser.image || '',
          role: fileUser.role || 'reader',
          isActive: Boolean(fileUser.isActive),
          whatsappNumber: fileUser.whatsappNumber,
          optInDailyEpaper: fileUser.optInDailyEpaper !== false,
          createdAt: fileUser.createdAt,
          savedArticles: fileUser.savedArticles || [],
        };
      }
    }
  } catch (fileError) {
    console.error('[Auth] File storage reader auth error:', fileError);
  }

  return null;
}
