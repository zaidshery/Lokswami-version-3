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

    // Password change handling
    if (newPassword) {
      if (String(newPassword).length < 6) {
        return NextResponse.json(
          { success: false, error: 'New password must be at least 6 characters.' },
          { status: 400 }
        );
      }

      await connectDB();
      const existingUser = await User.findOne({ email });

      // If user already has a password, verify currentPassword
      if (existingUser?.passwordHash) {
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
    }

    try {
      await connectDB();
      const updatedUser = await User.findOneAndUpdate(
        { email },
        { $set: updates },
        { new: true }
      ).lean();

      if (updatedUser) {
        // Sync to file store
        void upsertStoredUser({
          _id: updatedUser._id.toString(),
          name: updatedUser.name,
          email: updatedUser.email,
          whatsappNumber: updatedUser.whatsappNumber,
          optInDailyEpaper: updatedUser.optInDailyEpaper !== false,
          preferredLanguage: updatedUser.preferredLanguage,
          preferredCategories: updatedUser.preferredCategories,
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
      console.warn('[Profile API PATCH] MongoDB write fallback:', mongoError);
    }

    // File store fallback
    const fileUser = await findStoredUserByEmail(email);
    if (fileUser) {
      const updated = await upsertStoredUser({
        ...fileUser,
        ...updates,
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
