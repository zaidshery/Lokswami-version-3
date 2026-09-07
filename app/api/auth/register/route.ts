import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { hashPassword } from '@/lib/auth/jwt';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from '@/lib/utils/phone';
import { findStoredUserByEmail, findStoredUserByWhatsApp, upsertStoredUser } from '@/lib/storage/usersFile';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fullName,
      email,
      whatsappNumber,
      password,
      optInDailyEpaper = true,
      languagePreference = 'hi',
    } = body;

    const trimmedName = String(fullName || '').trim();
    if (!trimmedName || trimmedName.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Full name must be at least 2 characters long.' },
        { status: 400 }
      );
    }

    const trimmedEmail = email ? String(email).trim().toLowerCase() : '';
    const normalizedPhone = whatsappNumber ? normalizeWhatsAppNumber(whatsappNumber) : null;

    if (!trimmedEmail && !normalizedPhone) {
      return NextResponse.json(
        { success: false, error: 'Please provide either a valid email address or WhatsApp number.' },
        { status: 400 }
      );
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    if (whatsappNumber && !normalizedPhone) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 10-digit mobile or WhatsApp number.' },
        { status: 400 }
      );
    }

    const trimmedPassword = String(password || '');
    if (trimmedPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // Check duplicate and save in MongoDB
    const passwordHash = await hashPassword(trimmedPassword);
    const safeEmail = trimmedEmail || `${normalizedPhone?.replace('+', '')}@lokswami.reader`;

    try {
      await connectDB();

      // Check duplicate
      const duplicateQuery: Record<string, unknown>[] = [{ email: safeEmail }];
      if (normalizedPhone) {
        duplicateQuery.push({ whatsappNumber: normalizedPhone });
      }

      const existingUser = await User.findOne({ $or: duplicateQuery });
      if (existingUser) {
        return NextResponse.json(
          {
            success: false,
            error:
              existingUser.email === safeEmail
                ? 'An account with this email already exists.'
                : 'An account with this WhatsApp number already exists.',
          },
          { status: 409 }
        );
      }

      const newUser = await User.create({
        name: trimmedName,
        email: safeEmail,
        whatsappNumber: normalizedPhone || undefined,
        passwordHash,
        passwordSetAt: new Date(),
        role: 'reader',
        optInDailyEpaper: Boolean(optInDailyEpaper),
        preferredLanguage: languagePreference === 'en' ? 'en' : 'hi',
        isActive: true,
        lastLoginAt: new Date(),
      });

      // Also sync to file store for resilience
      void upsertStoredUser({
        _id: newUser._id.toString(),
        name: trimmedName,
        email: safeEmail,
        whatsappNumber: normalizedPhone || undefined,
        passwordHash,
        passwordSetAt: new Date().toISOString(),
        role: 'reader',
        optInDailyEpaper: Boolean(optInDailyEpaper),
        preferredLanguage: languagePreference === 'en' ? 'en' : 'hi',
        isActive: true,
      });

      return NextResponse.json(
        {
          success: true,
          user: {
            id: newUser._id.toString(),
            name: newUser.name,
            email: newUser.email,
            whatsappNumber: newUser.whatsappNumber,
            role: newUser.role,
          },
        },
        { status: 201 }
      );
    } catch (dbError) {
      console.warn('[Register] MongoDB fallback to file store:', dbError);

      // File store fallback
      const existingFileUser =
        (await findStoredUserByEmail(safeEmail)) ||
        (normalizedPhone ? await findStoredUserByWhatsApp(normalizedPhone) : null);

      if (existingFileUser) {
        return NextResponse.json(
          { success: false, error: 'An account with this email or WhatsApp number already exists.' },
          { status: 409 }
        );
      }

      const fileUser = await upsertStoredUser({
        name: trimmedName,
        email: safeEmail,
        whatsappNumber: normalizedPhone || undefined,
        passwordHash,
        passwordSetAt: new Date().toISOString(),
        role: 'reader',
        optInDailyEpaper: Boolean(optInDailyEpaper),
        preferredLanguage: languagePreference === 'en' ? 'en' : 'hi',
        isActive: true,
      });

      return NextResponse.json(
        {
          success: true,
          user: {
            id: fileUser._id,
            name: fileUser.name,
            email: fileUser.email,
            whatsappNumber: fileUser.whatsappNumber,
            role: fileUser.role,
          },
        },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error('[Register API] Error creating user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error while creating your account.' },
      { status: 500 }
    );
  }
}
