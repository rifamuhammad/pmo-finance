export function formatRupiah(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : value ?? 0;
  if (Number.isNaN(num)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export const formatIdr = formatRupiah;

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export interface StatusVisual {
  label: string;
  symbol: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function getStatusVisual(status: string | null | undefined): StatusVisual {
  const s = (status || 'UNKNOWN').toUpperCase();
  switch (s) {
    case 'APPROVED':
    case 'PAID':
    case 'POSTED':
    case 'MATCHED':
    case 'MATCHED_3WAY':
    case 'CONFIRMED':
    case 'RECEIVED':
    case 'COMPLETE':
    case 'DELIVERED':
    case 'VERIFIED':
    case 'ACTIVE':
    case 'FINALIZED':
      return { label: s, symbol: 'OK', tone: 'success' };
    case 'SUBMITTED':
    case 'PENDING':
    case 'PARTIALLY_PAID':
    case 'PARTIALLY_RECEIVED':
    case 'PARTIAL':
    case 'IN_PROGRESS':
    case 'QUOTATION_REVIEW':
    case 'CLOSING_SUBMITTED':
    case 'RECONCILING':
    case 'NEEDS_REVIEW':
    case 'EXCEPTION_REVIEW':
    case 'UNDER_REVIEW':
    case 'REVISION_REQUIRED':
    case 'ISSUED':
    case 'ORDERED':
      return { label: s, symbol: '!', tone: 'warning' };
    case 'REJECTED':
    case 'OVERDUE':
    case 'UNMATCHED':
    case 'EXCEPTION':
    case 'FAILED':
    case 'BLOCKED':
    case 'CANCELLED':
    case 'VOID':
    case 'REVERSED':
    case 'REFUNDED':
      return { label: s, symbol: 'X', tone: 'danger' };
    case 'OPEN':
    case 'REVISED':
      return { label: s, symbol: '*', tone: 'info' };
    default:
      return { label: s, symbol: '-', tone: 'neutral' };
  }
}
