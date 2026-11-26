import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { verifyPassword, signAccessToken } from '../../shared/security.js';
import { recordAuditLog } from '../../shared/audit.js';
import { resolveOpenFiscalPeriodForDate } from '../../shared/accounting-engine.js';
import { AppError, requireAuth } from '../../middleware/auth.js';

export const authRouter = Router();

// In-memory rate limiting for login endpoint
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid.'),
  password: z.string().min(4, 'Password wajib diisi.'),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const emailKey = parsed.email.toLowerCase().trim();
    const now = Date.now();
    const attempt = loginAttempts.get(emailKey);

    if (attempt && attempt.resetAt > now && attempt.count >= 10) {
      throw new AppError(
        429,
        'TOO_MANY_LOGIN_ATTEMPTS',
        'Terlalu banyak percobaan login gagal. Silakan tunggu beberapa menit sebelum mencoba kembali.'
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: emailKey },
      include: {
        role: true,
        businessUnit: true,
      },
    });

    if (!user || !user.isActive || !verifyPassword(parsed.password, user.passwordHash)) {
      const currentCount = attempt && attempt.resetAt > now ? attempt.count + 1 : 1;
      loginAttempts.set(emailKey, { count: currentCount, resetAt: now + 5 * 60 * 1000 });

      await recordAuditLog({
        actorId: user?.id ?? null,
        actorName: user?.fullName ?? emailKey,
        actorRole: user?.roleCode ?? 'ANONYMOUS',
        action: 'AUTH_LOGIN_FAILED',
        module: 'AUTH',
        entityType: 'User',
        entityId: user?.id ?? 'unknown',
        entityCode: emailKey,
        summary: `Percobaan login gagal untuk akun ${emailKey}`,
        ipAddress: req.ip,
        requestId: req.requestId,
      });

      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau password tidak sesuai.');
    }

    loginAttempts.delete(emailKey);

    const token = signAccessToken({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      roleCode: user.roleCode,
      businessUnitId: user.businessUnitId,
    });

    await recordAuditLog({
      actorId: user.id,
      actorName: user.fullName,
      actorRole: user.roleCode,
      action: 'AUTH_LOGIN_SUCCESS',
      module: 'AUTH',
      entityType: 'User',
      entityId: user.id,
      entityCode: user.email,
      summary: `${user.fullName} (${user.role.name}) berhasil login`,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roleCode: user.roleCode,
          roleName: user.role.name,
          permissions: user.role.permissions,
          approvalLimit: Number(user.role.approvalLimit),
          businessUnitId: user.businessUnitId,
          businessUnitName: user.businessUnit?.name ?? 'Konsolidasi Semua Unit',
          businessUnitCode: user.businessUnit?.code ?? 'ALL',
          isDemoData: user.isDemoData,
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { role: true, businessUnit: true },
    });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Data pengguna tidak ditemukan.');
    }

    const approvalWhere: Record<string, unknown> = { status: 'PENDING' };
    if (user.roleCode === 'GM_PMO') {
      approvalWhere.requiredRoleCode = { in: ['GM_PMO', 'FINANCE_MANAGER'] };
      approvalWhere.requestedById = { not: user.id };
    } else if (user.roleCode === 'FINANCE_MANAGER') {
      approvalWhere.requiredRoleCode = 'FINANCE_MANAGER';
      approvalWhere.requestedById = { not: user.id };
    } else if (user.roleCode === 'UNIT_MANAGER') {
      approvalWhere.requiredRoleCode = 'UNIT_MANAGER';
      approvalWhere.requestedById = { not: user.id };
    } else if (user.roleCode === 'SUPER_ADMIN') {
      // Super admin can see all
    } else {
      approvalWhere.requiredRoleCode = user.roleCode;
      approvalWhere.requestedById = { not: user.id };
    }

    const canApproveFinance =
      user.role.permissions.includes('payment:approve') || user.role.permissions.includes('*');
    const notifOr: Array<Record<string, unknown>> = [
      { userId: user.id },
      { userId: null, roleCode: user.roleCode },
      { userId: null, roleCode: null },
    ];
    if (canApproveFinance && user.roleCode !== 'FINANCE_MANAGER') {
      notifOr.push({ userId: null, roleCode: 'FINANCE_MANAGER' });
    }

    const [activePeriod, unreadCount, pendingApprovalsCount, settings] = await Promise.all([
      resolveOpenFiscalPeriodForDate(prisma, new Date()),
      prisma.notification.count({
        where: {
          isRead: false,
          OR: notifOr,
        },
      }),
      prisma.approvalRequest.count({
        where: approvalWhere,
      }),
      prisma.systemSetting.findMany(),
    ]);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roleCode: user.roleCode,
          roleName: user.role.name,
          permissions: user.role.permissions,
          approvalLimit: Number(user.role.approvalLimit),
          businessUnitId: user.businessUnitId,
          businessUnitName: user.businessUnit?.name ?? 'Konsolidasi Semua Unit',
          businessUnitCode: user.businessUnit?.code ?? 'ALL',
          isDemoData: user.isDemoData,
        },
        activePeriod,
        unreadNotifications: unreadCount,
        pendingApprovalsCount,
        settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'AUTH_LOGOUT',
      module: 'AUTH',
      entityType: 'User',
      entityId: req.user!.userId,
      entityCode: req.user!.email,
      summary: `${req.user!.fullName} keluar dari sesi aplikasi`,
      ipAddress: req.ip,
      requestId: req.requestId,
    });
    res.json({
      success: true,
      data: { loggedOut: true },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Development-only demo account listing to assist verification across all 9 roles
authRouter.get('/demo-accounts', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.json({ success: true, data: [], meta: { requestId: req.requestId } });
      return;
    }
    const users = await prisma.user.findMany({
      where: { isActive: true },
      include: { role: true, businessUnit: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      success: true,
      data: users.map((u) => ({
        email: u.email,
        fullName: u.fullName,
        roleCode: u.roleCode,
        roleName: u.role.name,
        businessUnitName: u.businessUnit?.name ?? 'Semua Unit (Pusat)',
        demoPassword: 'DemoErp!2026',
      })),
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
