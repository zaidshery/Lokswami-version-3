import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { hashPassword, verifyPassword } from '@/lib/auth/jwt';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';
import { findStoredUserByEmail, upsertStoredUser } from '@/lib/storage/usersFile';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const email = session.user.email.toLowerCase();

    try {
      await connectDB();
      const user = await User.findOne({ email }).lean();

      if (user) {
        return NextResponse.json({
          success: true,
          data: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            whatsappNumber: user.whatsappNumber || null,
            image: user.image || null,
            role: user.role,
            optInDailyEpaper: user.optInDailyEpaper !== false,
            preferredLanguage: user.preferredLanguage || 'hi',
            preferredCategories: user.preferredCategories || [],
            readCount: user.readCount || 0,
            savedArticlesCount: Array.isArray(user.savedArticles) ? user.savedArticles.length : 0,
            createdAt: user.createdAt,
            hasPassword: Boolean(user.passwordHash),
          },
        });
      }
    } catch (mongoError) {
      console.warn('[Profile API] MongoDB read fallback:', mongoError);
    }

    // File store fallback
    const fileUser = await findStoredUserByEmail(email);
    if (fileUser) {
      return NextResponse.json({
        success: true,
        data: {
          id: fileUser._id,
          name: fileUser.name,
          email: fileUser.email,
          whatsappNumber: fileUser.whatsappNumber || null,
          image: fileUser.image || null,
          role: fileUser.role,
          optInDailyEpaper: fileUser.optInDailyEpaper !== false,
          preferredLanguage: fileUser.preferredLanguage || 'hi',
          preferredCategories: fileUser.preferredCategories || [],
          readCount: fileUser.readCount || 0,
          savedArticlesCount: fileUser.savedArticles?.length || 0,
          createdAt: fileUser.createdAt,
          hasPassword: Boolean(fileUser.passwordHash),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: session.user.id,
        name: session.user.name || 'Reader',
        email: session.user.email,
        whatsappNumber: session.user.whatsappNumber || null,
        image: session.user.image || null,
        role: session.user.role || 'reader',
        optInDailyEpaper: session.user.optInDailyEpaper !== false,
        preferredLanguage: 'hi',
        preferredCategories: [],
        readCount: 0,
        savedArticlesCount: session.user.savedArticles?.length || 0,
        createdAt: session.user.createdAt,
        hasPassword: false,
      },
    });
  } catch (error) {
    console.error('[Profile API GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load profile.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const email = session.user.email.toLowerCase();
    const body = await req.json();
    const {
      name,
      whatsappNumber,
      optInDailyEpaper,
      preferredLanguage,
      preferredCategories,
      currentPassword,
      newPassword,
    } = body;

    const updates: Record<string, unknown> = {};

    if (typeof name === 'string' && name.trim().length >= 2) {
      updates.name = name.trim();
    }

    if (whatsappNumber !== undefined) {
      if (whatsappNumber === '' || whatsappNumber === null) {
        updates.whatsappNumber = '';
      } else {
        const normalized = normalizeWhatsAppNumber(whatsappNumber);
        if (!normalized) {
          return NextResponse.json(
            { success: false, error: 'Invalid WhatsApp number format. Must be 10 digits.' },
            { status: 400 }
          );
        }
        updates.whatsappNumber = normalized;
      }
    }

    if (typeof optInDailyEpaper === 'boolean') {
      updates.optInDailyEpaper = optInDailyEpaper;
    }

    if (preferredLanguage === 'hi' || preferredLanguage === 'en') {
      updates.preferredLanguage = preferredLanguage;
    }

    if (Array.isArray(preferredCategories)) {
      updates.preferredCategories = preferredCategories.map(String);
    }

    // Password change handling: strictly fail-closed if MongoDB is unavailable.
    // Invariant: Password changes must only succeed when the authoritative Mongo credential
    // can be verified and updated in the same request flow, preventing split-brain.
    if (newPassword) {
      if (String(newPassword).length < 6) {
        return NextResponse.json(
          { success: false, error: 'New password must be at least 6 characters.' },
          { status: 400 }
        );
      }

      let existingUser: any;
      try {
        await connectDB();
        existingUser = await User.findOne({ email }).lean();
      } catch (mongoReadError) {
        console.warn('[Profile API PATCH] MongoDB unavailable for password change verification:', mongoReadError);
        return NextResponse.json(
          { success: false, error: 'Password changes are temporarily unavailable. Please try again shortly.' },
          { status: 503 }
        );
      }

      if (!existingUser) {
        return NextResponse.json(
          { success: false, error: 'User profile not found.' },
          { status: 404 }
        );
      }

      // If user already has a password, verify currentPassword against Mongo passwordHash
      if (existingUser.passwordHash) {
        if (!currentPassword) {
          return NextResponse.json(
            { success: false, error: 'Current password is required to set a new password.' },
            { status: 400 }
          );
        }

        const isCurrentValid = await verifyPassword(currentPassword, existingUser.passwordHash);
        if (!isCurrentValid) {
          return NextResponse.json(
            { success: false, error: 'Current password does not match.' },
            { status: 400 }
          );
        }
      }

      updates.passwordHash = await hashPassword(String(newPassword));
      updates.passwordSetAt = new Date();

      // Write path for password change: MUST update MongoDB authoritatively
      let updatedUser: any;
      try {
        await connectDB();
        updatedUser = await User.findOneAndUpdate(
          { email },
          { $set: updates },
          { new: true }
        ).lean();
      } catch (mongoWriteError) {
        console.warn('[Profile API PATCH] MongoDB write failed during password change:', mongoWriteError);
        return NextResponse.json(
          { success: false, error: 'Password changes are temporarily unavailable. Please try again shortly.' },
          { status: 503 }
        );
      }

      if (!updatedUser) {
        return NextResponse.json(
          { success: false, error: 'User profile not found.' },
          { status: 404 }
        );
      }

      // Sync updated credentials to file-store fallback
      try {
        await upsertStoredUser({
          _id: updatedUser._id.toString(),
          name: updatedUser.name,
          email: updatedUser.email,
          whatsappNumber: updatedUser.whatsappNumber,
          optInDailyEpaper: updatedUser.optInDailyEpaper !== false,
          preferredLanguage: updatedUser.preferredLanguage,
          preferredCategories: updatedUser.preferredCategories,
          passwordHash: updatedUser.passwordHash,
          passwordSetAt: updatedUser.passwordSetAt ? new Date(updatedUser.passwordSetAt).toISOString() : undefined,
        });
      } catch (fileError) {
        console.warn('[Profile API PATCH] File store sync warning:', fileError);
      }

      return NextResponse.json({
        success: true,
        message: 'Profile updated successfully.',
        data: {
          name: updatedUser.name,
          email: updatedUser.email,
          whatsappNumber: updatedUser.whatsappNumber,
          optInDailyEpaper: updatedUser.optInDailyEpaper,
          preferredLanguage: updatedUser.preferredLanguage,
        },
      });
    }

    // Non-password profile update: retains resilient Mongo/file-store fallback behavior
    try {
      await connectDB();
      const updatedUser = await User.findOneAndUpdate(
        { email },
        { $set: updates },
        { new: true }
      ).lean();

      if (updatedUser) {
        // Sync non-password updates to file store
        void upsertStoredUser({
          _id: updatedUser._id.toString(),
          name: updatedUser.name,
          email: updatedUser.email,
          whatsappNumber: updatedUser.whatsappNumber,
          optInDailyEpaper: updatedUser.optInDailyEpaper !== false,
          preferredLanguage: updatedUser.preferredLanguage,
          preferredCategories: updatedUser.preferredCategories,
          passwordHash: updatedUser.passwordHash,
          passwordSetAt: updatedUser.passwordSetAt ? new Date(updatedUser.passwordSetAt).toISOString() : undefined,
        });

        return NextResponse.json({
          success: true,
          message: 'Profile updated successfully.',
          data: {
            name: updatedUser.name,
            email: updatedUser.email,
            whatsappNumber: updatedUser.whatsappNumber,
            optInDailyEpaper: updatedUser.optInDailyEpaper,
            preferredLanguage: updatedUser.preferredLanguage,
          },
        });
      }
    } catch (mongoError) {
      console.warn('[Profile API PATCH] MongoDB write fallback for non-password updates:', mongoError);
    }

    // File store fallback for non-password profile updates
    const fileUser = await findStoredUserByEmail(email);
    if (fileUser) {
      const updated = await upsertStoredUser({
        ...fileUser,
        ...updates,
        passwordHash: fileUser.passwordHash,
        passwordSetAt: fileUser.passwordSetAt,
      });

      return NextResponse.json({
        success: true,
        message: 'Profile updated successfully.',
        data: {
          name: updated.name,
          email: updated.email,
          whatsappNumber: updated.whatsappNumber,
          optInDailyEpaper: updated.optInDailyEpaper,
          preferredLanguage: updated.preferredLanguage,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'User profile not found.' },
      { status: 404 }
    );
  } catch (error) {
    console.error('[Profile API PATCH] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile.' },
      { status: 500 }
    );
  }
}
