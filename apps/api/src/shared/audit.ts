import { prisma } from './prisma.js';

export interface AuditLogInput {
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  entityCode?: string | null;
  summary: string;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
  requestId?: string | null;
}

export async function recordAuditLog(input: AuditLogInput, tx: typeof prisma = prisma): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      entityCode: input.entityCode ?? null,
      summary: input.summary,
      beforeData: input.beforeData ? JSON.parse(JSON.stringify(input.beforeData)) : undefined,
      afterData: input.afterData ? JSON.parse(JSON.stringify(input.afterData)) : undefined,
      ipAddress: input.ipAddress ?? null,
      requestId: input.requestId ?? null,
    },
  });
}
