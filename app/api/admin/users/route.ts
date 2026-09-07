import { NextRequest, NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/api/adminRoute';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { normalizeUserRole } from '@/lib/auth/roles';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';
import { readUsersFile, upsertStoredUser } from '@/lib/storage/usersFile';

export const GET = withAdminApi(
  async (req: NextRequest) => {
    try {
      const { searchParams } = new URL(req.url);
      const query = (searchParams.get('query') || '').trim().toLowerCase();
      const roleFilter = searchParams.get('role') || 'all';
      const statusFilter = searchParams.get('status') || 'all';
      const epaperFilter = searchParams.get('epaper') || 'all';
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));

      const mongoFilter: Record<string, unknown> = {};

      if (query) {
        mongoFilter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { whatsappNumber: { $regex: query, $options: 'i' } },
          { loginId: { $regex: query, $options: 'i' } },
        ];
      }

      if (roleFilter !== 'all') {
        mongoFilter.role = roleFilter;
      }

      if (statusFilter === 'active') {
        mongoFilter.isActive = true;
      } else if (statusFilter === 'inactive') {
        mongoFilter.isActive = false;
      }

      if (epaperFilter === 'opted_in') {
        mongoFilter.optInDailyEpaper = true;
      } else if (epaperFilter === 'not_opted_in') {
        mongoFilter.optInDailyEpaper = false;
      }

      try {
        await connectDB();
        const total = await User.countDocuments(mongoFilter);
        const rawUsers = await User.find(mongoFilter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();

        const users = rawUsers.map((u) => ({
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          whatsappNumber: u.whatsappNumber || null,
          role: u.role || 'reader',
          isActive: u.isActive !== false,
          optInDailyEpaper: u.optInDailyEpaper !== false,
          preferredLanguage: u.preferredLanguage || 'hi',
          readCount: u.readCount || 0,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt || null,
        }));

        return NextResponse.json({
          success: true,
          data: {
            users,
            pagination: {
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit),
            },
          },
        });
      } catch (mongoError) {
        console.warn('[Admin Users API] MongoDB read fallback:', mongoError);

        // Fallback to JSON file storage
        const allFileUsers = await readUsersFile();
        let filtered = allFileUsers;

        if (query) {
          filtered = filtered.filter(
            (u) =>
              u.name.toLowerCase().includes(query) ||
              u.email.toLowerCase().includes(query) ||
              (u.whatsappNumber && u.whatsappNumber.includes(query))
          );
        }

        if (roleFilter !== 'all') {
          filtered = filtered.filter((u) => u.role === roleFilter);
        }

        if (statusFilter === 'active') {
          filtered = filtered.filter((u) => u.isActive !== false);
        } else if (statusFilter === 'inactive') {
          filtered = filtered.filter((u) => u.isActive === false);
        }

        if (epaperFilter === 'opted_in') {
          filtered = filtered.filter((u) => u.optInDailyEpaper !== false);
        } else if (epaperFilter === 'not_opted_in') {
          filtered = filtered.filter((u) => u.optInDailyEpaper === false);
        }

        const total = filtered.length;
        const users = filtered.slice((page - 1) * limit, page * limit).map((u) => ({
          id: u._id,
          name: u.name,
          email: u.email,
          whatsappNumber: u.whatsappNumber || null,
          role: u.role,
          isActive: u.isActive !== false,
          optInDailyEpaper: u.optInDailyEpaper !== false,
          preferredLanguage: u.preferredLanguage,
          readCount: u.readCount,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt || null,
        }));

        return NextResponse.json({
          success: true,
          data: {
            users,
            pagination: {
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit),
            },
          },
        });
      }
    } catch (error) {
      console.error('[Admin Users API GET] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch users list.' },
        { status: 500 }
      );
    }
  }
);

export const PATCH = withAdminApi(
  async (req: NextRequest, _context: Record<string, never>, { admin }) => {
    try {
      const body = await req.json();
      const { userId, isActive, role, whatsappNumber, optInDailyEpaper } = body;

      if (!userId) {
        return NextResponse.json(
          { success: false, error: 'Missing userId parameter.' },
          { status: 400 }
        );
      }

      const updates: Record<string, unknown> = {};

      if (typeof isActive === 'boolean') {
        updates.isActive = isActive;
      }

      if (role) {
        const normalizedRole = normalizeUserRole(role);
        if (!normalizedRole) {
          return NextResponse.json(
            { success: false, error: 'Invalid user role specified.' },
            { status: 400 }
          );
        }

        // Only super_admin can assign super_admin
        if (normalizedRole === 'super_admin' && admin.role !== 'super_admin') {
          return NextResponse.json(
            { success: false, error: 'Only super admin can assign the super admin role.' },
            { status: 403 }
          );
        }

        updates.role = normalizedRole;
      }

      if (whatsappNumber !== undefined) {
        if (!whatsappNumber) {
          updates.whatsappNumber = '';
        } else {
          const normalized = normalizeWhatsAppNumber(whatsappNumber);
          if (!normalized) {
            return NextResponse.json(
              { success: false, error: 'Invalid WhatsApp phone number format.' },
              { status: 400 }
            );
          }
          updates.whatsappNumber = normalized;
        }
      }

      if (typeof optInDailyEpaper === 'boolean') {
        updates.optInDailyEpaper = optInDailyEpaper;
      }

      try {
        await connectDB();
        const updated = await User.findByIdAndUpdate(
          userId,
          { $set: updates },
          { new: true }
        ).lean();

        if (updated) {
          void upsertStoredUser({
            _id: updated._id.toString(),
            name: updated.name,
            email: updated.email,
            role: updated.role,
            isActive: updated.isActive !== false,
            whatsappNumber: updated.whatsappNumber,
            optInDailyEpaper: updated.optInDailyEpaper !== false,
          });

          return NextResponse.json({
            success: true,
            message: 'User updated successfully.',
            data: {
              id: updated._id.toString(),
              name: updated.name,
              email: updated.email,
              role: updated.role,
              isActive: updated.isActive !== false,
              whatsappNumber: updated.whatsappNumber || null,
              optInDailyEpaper: updated.optInDailyEpaper !== false,
            },
          });
        }
      } catch (mongoError) {
        console.warn('[Admin Users PATCH] MongoDB fallback:', mongoError);
      }

      // File store fallback
      const fileUser = await upsertStoredUser({
        _id: userId,
        email: body.email || `${userId}@lokswami.reader`,
        ...updates,
      });

      return NextResponse.json({
        success: true,
        message: 'User updated successfully.',
        data: {
          id: fileUser._id,
          name: fileUser.name,
          email: fileUser.email,
          role: fileUser.role,
          isActive: fileUser.isActive !== false,
          whatsappNumber: fileUser.whatsappNumber || null,
          optInDailyEpaper: fileUser.optInDailyEpaper !== false,
        },
      });
    } catch (error) {
      console.error('[Admin Users API PATCH] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update user.' },
        { status: 500 }
      );
    }
  }
);
