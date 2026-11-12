const API_BASE = '/api/v1';

export class ApiClientError extends Error {
  status: number;
  code: string;
  requestId?: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, requestId?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; meta?: Record<string, any> }> {
  const token = localStorage.getItem('pmo_erp_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json || json.success === false) {
    const errObj = json?.error || {};
    throw new ApiClientError(
      response.status,
      errObj.code || `HTTP_${response.status}`,
      errObj.message || `Permintaan gagal dengan kode status ${response.status}.`,
      errObj.requestId,
      errObj.details
    );
  }

  return { data: json.data as T, meta: json.meta };
}

export const api = {
  get: <T = any>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = any>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T = any>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export async function downloadCsvReport(type: string): Promise<void> {
  const token = localStorage.getItem('pmo_erp_token');
  const response = await fetch(`${API_BASE}/reports/export?type=${encodeURIComponent(type)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error?.message || 'Gagal mengunduh file ekspor laporan.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `laporan-pmo-utama-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadPbiExcel(budgetId?: string, docNumber?: string): Promise<void> {
  const token = localStorage.getItem('pmo_erp_token');
  const path = budgetId
    ? `${API_BASE}/budgets/${encodeURIComponent(budgetId)}/export/pbi-excel`
    : `${API_BASE}/budgets/export/pbi-excel`;
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error?.message || 'Gagal mengunduh file format resmi PBI Excel.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const fileName = docNumber
    ? `Format_Resmi_PBI_60_Kolom_${docNumber}_${new Date().toISOString().slice(0, 10)}.xlsx`
    : `Format_Resmi_PBI_60_Kolom_Semula_Menjadi_${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


export async function downloadAuditCsv(params: Record<string, string> = {}): Promise<void> {
  const token = localStorage.getItem('pmo_erp_token');
  const searchParams = new URLSearchParams(params);
  const path = `${API_BASE}/audit/export/csv?${searchParams.toString()}`;
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error?.message || 'Gagal mengunduh jejak audit forensik CSV.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Forensic_Audit_Trail_PMO_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
