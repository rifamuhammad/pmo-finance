import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AuthTokenPayload } from '../shared/security.js';
import { prisma } from '../shared/prisma.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthTokenPayload & { permissions: string[] };
    }
  }
}

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.trim() ? incoming.trim() : `req-${crypto.randomUUID()}`;
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Sesi autentikasi tidak ditemukan. Silakan login kembali.');
    }
    const token = authHeader.slice(7).trim();
    const payload = verifyAccessToken(token);
    const role = await prisma.role.findUnique({ where: { code: payload.roleCode } });
    if (!role) {
      throw new AppError(401, 'INVALID_ROLE', 'Peran pengguna tidak valid atau telah dinonaktifkan.');
    }
    req.user = {
      ...payload,
      permissions: role.permissions,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, 'TOKEN_EXPIRED', 'Token akses tidak valid atau telah kedaluwarsa.'));
  }
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Autentikasi diperlukan.'));
      return;
    }
    if (!allowedRoles.includes(req.user.roleCode)) {
      next(
        new AppError(
          403,
          'FORBIDDEN_ROLE',
          `Akses ditolak. Operasi ini memerlukan salah satu peran: ${allowedRoles.join(', ')}.`
        )
      );
      return;
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Autentikasi diperlukan.'));
      return;
    }
    if (req.user.roleCode === 'AUDITOR' && !permission.endsWith(':view')) {
      next(new AppError(403, 'AUDITOR_READ_ONLY', 'Peran Auditor hanya memiliki akses baca (read-only).'));
      return;
    }
    if (!req.user.permissions.includes(permission) && !req.user.permissions.includes('*')) {
      next(
        new AppError(
          403,
          'FORBIDDEN_PERMISSION',
          `Akses ditolak. Izin "${permission}" tidak dimiliki oleh peran ${req.user.roleCode}.`
        )
      );
      return;
    }
    next();
  };
}

/**
 * Ensures unit-scoped roles (such as UNIT_MANAGER or CASHIER) cannot read or mutate
 * data belonging to another BusinessUnit.
 */
export function enforceUnitScope(user: Express.Request['user'], targetBusinessUnitId: string | null | undefined): void {
  if (!user || !targetBusinessUnitId) return;
  const globalRoles = ['SUPER_ADMIN', 'GM_PMO', 'FINANCE_MANAGER', 'ACCOUNTING', 'PROCUREMENT', 'TAX_OFFICER', 'AUDITOR'];
  if (globalRoles.includes(user.roleCode)) return;
  if (user.businessUnitId && user.businessUnitId !== targetBusinessUnitId) {
    throw new AppError(
      403,
      'CROSS_UNIT_FORBIDDEN',
      'Akses lintas unit bisnis ditolak. Anda hanya berwenang mengakses unit bisnis tempat Anda ditugaskan.'
    );
  }
}

/**
 * Enforces Separation of Duties (SoD): a user cannot approve a transaction they created themselves.
 * In development or non-production test mode, self-approval is permitted to allow end-to-end testing with a single user account.
 */
export function enforceSeparationOfDuties(creatorUserId: string, approverUserId: string, allowSelfOverride = false): void {
  const allowSelf = process.env.ALLOW_SELF_APPROVAL === 'true';
  if (!allowSelfOverride && !allowSelf && creatorUserId === approverUserId) {
    throw new AppError(
      403,
      'SEPARATION_OF_DUTIES_VIOLATION',
      'Pemisahan kewenangan (Separation of Duties): Pembuat pengajuan tidak diperbolehkan menyetujui transaksinya sendiri.'
    );
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
        requestId: req.requestId,
      },
    });
    return;
  }

  // Handle Zod errors cleanly
  if (err && typeof err === 'object' && 'issues' in err) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Data input tidak memenuhi syarat validasi.',
        details: (err as { issues: unknown }).issues,
        requestId: req.requestId,
      },
    });
    return;
  }

  console.error(`[Error ${req.requestId}]`, err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kesalahan internal pada server. Gunakan ID permintaan untuk pelacakan.',
      requestId: req.requestId,
    },
  });
}
