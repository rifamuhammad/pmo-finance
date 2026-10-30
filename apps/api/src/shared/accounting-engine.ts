import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { toCents, fromCents } from './decimal.js';
import { AppError } from '../middleware/auth.js';

export interface JournalLineInput {
  accountCode: string;
  costCenterId?: string | null;
  description: string;
  debit: string | number;
  credit: string | number;
}

export interface CreateJournalInput {
  entryDate: Date;
  fiscalPeriodId?: string;
  businessUnitId: string;
  sourceType: string;
  sourceId?: string | null;
  sourceDocNumber?: string | null;
  idempotencyKey: string;
  description: string;
  createdById: string;
  createdByName: string;
  autoPost?: boolean;
  lines: JournalLineInput[];
}

export async function createOrGetBalancedJournal(
  input: CreateJournalInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  // Idempotency check: if already posted/created with the same key, return existing
  const existing = await tx.journalEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { lines: true },
  });
  if (existing) {
    return existing;
  }

  if (!input.lines || input.lines.length < 2) {
    throw new AppError(400, 'JOURNAL_MIN_LINES', 'Jurnal akuntansi wajib memiliki minimal 2 baris (debit dan kredit).');
  }

  let totalDebitCents = 0n;
  let totalCreditCents = 0n;

  for (const line of input.lines) {
    const d = toCents(line.debit);
    const c = toCents(line.credit);
    if (d < 0n || c < 0n) {
      throw new AppError(400, 'NEGATIVE_JOURNAL_AMOUNT', 'Nominal debit atau kredit pada baris jurnal tidak boleh negatif.');
    }
    if (d === 0n && c === 0n) {
      throw new AppError(400, 'ZERO_JOURNAL_LINE', 'Baris jurnal harus memiliki nilai debit atau kredit lebih besar dari nol.');
    }
    if (d > 0n && c > 0n) {
      throw new AppError(400, 'BOTH_DEBIT_AND_CREDIT', 'Satu baris jurnal tidak boleh mengisi debit dan kredit sekaligus.');
    }
    totalDebitCents += d;
    totalCreditCents += c;
  }

  if (totalDebitCents !== totalCreditCents) {
    throw new AppError(
      400,
      'UNBALANCED_JOURNAL',
      `Jurnal tidak seimbang: Total Debit (${fromCents(totalDebitCents)}) tidak sama dengan Total Kredit (${fromCents(totalCreditCents)}).`
    );
  }

  // Resolve fiscal period
  let period = input.fiscalPeriodId
    ? await tx.fiscalPeriod.findUnique({ where: { id: input.fiscalPeriodId } })
    : await tx.fiscalPeriod.findFirst({
        where: { isClosed: false },
        orderBy: { startDate: 'desc' },
      });

  if (!period) {
    throw new AppError(400, 'NO_OPEN_FISCAL_PERIOD', 'Tidak ditemukan periode fiskal aktif untuk memposting jurnal.');
  }

  if (period.isClosed) {
    throw new AppError(
      409,
      'FISCAL_PERIOD_CLOSED',
      `Periode akuntansi ${period.code} (${period.name}) telah ditutup. Buka kembali periode melalui prosedur otorisasi jika diperlukan koreksi.`
    );
  }

  const count = await tx.journalEntry.count();
  const journalNumber = `JRN-${period.code}-${String(count + 1).padStart(4, '0')}`;
  const shouldPost = input.autoPost !== false;

  const created = await tx.journalEntry.create({
    data: {
      journalNumber,
      entryDate: input.entryDate,
      fiscalPeriodId: period.id,
      businessUnitId: input.businessUnitId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceDocNumber: input.sourceDocNumber ?? null,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      totalDebit: fromCents(totalDebitCents),
      totalCredit: fromCents(totalCreditCents),
      status: shouldPost ? 'POSTED' : 'DRAFT',
      createdById: input.createdById,
      createdByName: input.createdByName,
      postedById: shouldPost ? input.createdById : null,
      postedAt: shouldPost ? new Date() : null,
      lines: {
        create: input.lines.map((l) => ({
          accountCode: l.accountCode,
          costCenterId: l.costCenterId ?? null,
          description: l.description,
          debit: fromCents(toCents(l.debit)),
          credit: fromCents(toCents(l.credit)),
        })),
      },
    },
    include: {
      lines: {
        include: { account: true },
      },
    },
  });

  return created;
}
