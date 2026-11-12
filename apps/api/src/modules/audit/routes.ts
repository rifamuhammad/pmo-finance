import { Router } from 'express';
import { prisma } from '../../shared/prisma.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';

export const auditRouter = Router();

auditRouter.use(requireAuth);

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
  changeType: 'ADDED' | 'REMOVED' | 'MODIFIED';
}

/**
 * Computes deep field-level differences between beforeData and afterData
 */
export function computeObjectDiff(before: any, after: any, prefix = ''): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  if (!before && !after) return diffs;

  const beforeObj = before && typeof before === 'object' ? before : {};
  const afterObj = after && typeof after === 'object' ? after : {};
  const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));

  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const hasBefore = key in beforeObj;
    const hasAfter = key in afterObj;
    const valBefore = beforeObj[key];
    const valAfter = afterObj[key];

    if (!hasBefore && hasAfter) {
      diffs.push({ field: fullKey, before: null, after: valAfter, changeType: 'ADDED' });
    } else if (hasBefore && !hasAfter) {
      diffs.push({ field: fullKey, before: valBefore, after: null, changeType: 'REMOVED' });
    } else if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
      if (
        valBefore &&
        valAfter &&
        typeof valBefore === 'object' &&
        typeof valAfter === 'object' &&
        !Array.isArray(valBefore) &&
        !Array.isArray(valAfter)
      ) {
        diffs.push(...computeObjectDiff(valBefore, valAfter, fullKey));
      } else {
        diffs.push({ field: fullKey, before: valBefore, after: valAfter, changeType: 'MODIFIED' });
      }
    }
  }

  return diffs;
}

/**
 * GET /api/v1/audit/logs
 * Forensic query endpoint with multi-parameter filtering, pagination, and date range
 */
auditRouter.get('/logs', requirePermission('audit:view'), async (req, res, next) => {
  try {
    const {
      module,
      action,
      entityType,
      entityId,
      actorId,
      actorRole,
      search,
      startDate,
      endDate,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};

    if (typeof module === 'string' && module.trim()) {
      where.module = module.trim();
    }
    if (typeof action === 'string' && action.trim()) {
      where.action = action.trim();
    }
    if (typeof entityType === 'string' && entityType.trim()) {
      where.entityType = entityType.trim();
    }
    if (typeof entityId === 'string' && entityId.trim()) {
      where.entityId = entityId.trim();
    }
    if (typeof actorId === 'string' && actorId.trim()) {
      where.actorId = actorId.trim();
    }
    if (typeof actorRole === 'string' && actorRole.trim()) {
      where.actorRole = actorRole.trim();
    }

    // Date range filtering
    if (typeof startDate === 'string' && startDate.trim()) {
      where.createdAt = {
        ...(where.createdAt as Record<string, unknown> | undefined),
        gte: new Date(startDate.trim()),
      };
    }
    if (typeof endDate === 'string' && endDate.trim()) {
      const endD = new Date(endDate.trim());
      // If time not specified, bump to end of that day
      if (!endDate.includes('T')) {
        endD.setHours(23, 59, 59, 999);
      }
      where.createdAt = {
        ...(where.createdAt as Record<string, unknown> | undefined),
        lte: endD,
      };
    }

    // Search query across summary, entityCode, and actorName
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { summary: { contains: q, mode: 'insensitive' } },
        { entityCode: { contains: q, mode: 'insensitive' } },
        { actorName: { contains: q, mode: 'insensitive' } },
        { requestId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    res.json({
      success: true,
      data: logs,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        requestId: req.requestId,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/audit/logs/:id
 * Single log inspection with deep calculated before vs after differences
 */
auditRouter.get('/logs/:id', requirePermission('audit:view'), async (req, res, next) => {
  try {
    const log = await prisma.auditLog.findUnique({
      where: { id: req.params.id },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: { code: 'AUDIT_LOG_NOT_FOUND', message: 'Catatan jejak audit tidak ditemukan.' },
      });
    }

    const diffs = computeObjectDiff(log.beforeData, log.afterData);

    res.json({
      success: true,
      data: {
        ...log,
        diffs,
        hasChanges: diffs.length > 0,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/audit/entity/:entityType/:entityId
 * Retrieves full chronological audit lifecycle of a specific financial entity
 */
auditRouter.get('/entity/:entityType/:entityId', requirePermission('audit:view'), async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;

    const timeline = await prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: timeline,
      meta: {
        totalEvents: timeline.length,
        entityType,
        entityId,
        requestId: req.requestId,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/audit/stats
 * Forensic audit metrics & summary aggregations
 */
auditRouter.get('/stats', requirePermission('audit:view'), async (req, res, next) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalEvents, todayEvents, allLogs] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.auditLog.findMany({
        select: { module: true, action: true, actorName: true, actorRole: true },
        take: 1000,
      }),
    ]);

    const moduleCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    const actorCounts: Record<string, number> = {};

    for (const l of allLogs) {
      moduleCounts[l.module] = (moduleCounts[l.module] || 0) + 1;
      actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;
      actorCounts[l.actorName] = (actorCounts[l.actorName] || 0) + 1;
    }

    const topActors = Object.entries(actorCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalEvents,
        todayEvents,
        byModule: moduleCounts,
        byAction: actionCounts,
        topActors,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/audit/export/csv
 * Forensic audit CSV export for compliance and SPI verification
 */
auditRouter.get('/export/csv', requirePermission('audit:view'), async (req, res, next) => {
  try {
    const { module, action, search, startDate, endDate } = req.query;
    const where: Record<string, unknown> = {};

    if (typeof module === 'string' && module.trim()) where.module = module.trim();
    if (typeof action === 'string' && action.trim()) where.action = action.trim();
    if (typeof startDate === 'string' && startDate.trim()) {
      where.createdAt = { gte: new Date(startDate.trim()) };
    }
    if (typeof endDate === 'string' && endDate.trim()) {
      const endD = new Date(endDate.trim());
      if (!endDate.includes('T')) endD.setHours(23, 59, 59, 999);
      where.createdAt = {
        ...(where.createdAt as Record<string, unknown> | undefined),
        lte: endD,
      };
    }
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { summary: { contains: q, mode: 'insensitive' } },
        { entityCode: { contains: q, mode: 'insensitive' } },
        { actorName: { mode: 'insensitive', contains: q } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const escapeCsv = (str: unknown) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const header = [
      'ID Log',
      'Waktu Server (WIB)',
      'Aktor',
      'Peran (Role)',
      'Modul',
      'Aksi',
      'Tipe Entitas',
      'ID Entitas',
      'Kode Entitas',
      'Ringkasan Forensik',
      'IP Address',
      'Request ID',
    ].join(',');

    const rows = logs.map((l) =>
      [
        escapeCsv(l.id),
        escapeCsv(l.createdAt.toISOString()),
        escapeCsv(l.actorName),
        escapeCsv(l.actorRole),
        escapeCsv(l.module),
        escapeCsv(l.action),
        escapeCsv(l.entityType),
        escapeCsv(l.entityId),
        escapeCsv(l.entityCode || '-'),
        escapeCsv(l.summary),
        escapeCsv(l.ipAddress || '-'),
        escapeCsv(l.requestId || '-'),
      ].join(',')
    );

    const csvContent = '\uFEFF' + [header, ...rows].join('\r\n');
    const filename = `Forensic_Audit_Trail_PMO_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
});

/**
 * Strict Immutability Protection:
 * Any attempt to DELETE, PUT, or PATCH audit records is strictly rejected
 */
auditRouter.delete('/logs/:id', requirePermission('audit:view'), (_req, res) => {
  return res.status(403).json({
    success: false,
    error: {
      code: 'AUDIT_LOG_IMMUTABLE',
      message: 'Catatan jejak audit forensik bersifat permanen dan kebal mutasi atau penghapusan.',
    },
  });
});

auditRouter.patch('/logs/:id', requirePermission('audit:view'), (_req, res) => {
  return res.status(403).json({
    success: false,
    error: {
      code: 'AUDIT_LOG_IMMUTABLE',
      message: 'Catatan jejak audit forensik bersifat permanen dan kebal mutasi atau pembaruan.',
    },
  });
});

auditRouter.put('/logs/:id', requirePermission('audit:view'), (_req, res) => {
  return res.status(403).json({
    success: false,
    error: {
      code: 'AUDIT_LOG_IMMUTABLE',
      message: 'Catatan jejak audit forensik bersifat permanen dan kebal mutasi atau penggantian.',
    },
  });
});
