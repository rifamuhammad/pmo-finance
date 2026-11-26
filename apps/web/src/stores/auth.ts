import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiFetch } from '../services/api';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  approvalLimit: number;
  businessUnitId: string | null;
  businessUnitName: string;
  businessUnitCode: string;
  isDemoData: boolean;
}

export type FinanceWorkspace = 'GATEWAY' | 'PENERIMAAN' | 'PENGELUARAN';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('pmo_erp_token'));
  const user = ref<UserProfile | null>(
    localStorage.getItem('pmo_erp_user') ? JSON.parse(localStorage.getItem('pmo_erp_user')!) : null
  );
  const activePeriod = ref<{ id: string; code: string; name: string; status?: string; isClosed: boolean } | null>(null);
  const unreadNotifications = ref<number>(0);
  const pendingApprovalsCount = ref<number>(0);
  const settings = ref<Record<string, string>>({});
  const selectedBusinessUnitId = ref<string>('');
  const theme = ref<'light'>('light');
  const accessDeniedAlert = ref<{ show: boolean; moduleName: string; roleName: string } | null>(null);

  const storedWorkspace = localStorage.getItem('pmo_active_workspace');
  const activeWorkspace = ref<FinanceWorkspace>(
    storedWorkspace === 'PENERIMAAN' || storedWorkspace === 'PENGELUARAN' ? storedWorkspace : 'GATEWAY'
  );

  // Clear any legacy simulation state from storage
  localStorage.removeItem('pmo_simulated_role');

  const effectiveRoleCode = computed(() => {
    return user.value?.roleCode || '';
  });

  const effectiveRoleName = computed(() => {
    return user.value?.roleName || user.value?.roleCode || 'Pengguna';
  });

  const effectivePermissions = computed<string[]>(() => {
    return user.value?.permissions || [];
  });

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function triggerAccessDenied(moduleName: string) {
    accessDeniedAlert.value = {
      show: true,
      moduleName,
      roleName: effectiveRoleName.value,
    };
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      if (accessDeniedAlert.value?.moduleName === moduleName) {
        accessDeniedAlert.value = null;
      }
    }, 4000);
  }

  function dismissAccessDenied() {
    accessDeniedAlert.value = null;
  }

  function applyTheme(_newTheme?: 'light' | 'dark') {
    theme.value = 'light';
    localStorage.setItem('pmo_erp_theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
  }

  function toggleTheme() {
    applyTheme();
  }

  function hasPermission(perm: string): boolean {
    if (!user.value) return false;
    const perms = effectivePermissions.value;
    const currentRole = effectiveRoleCode.value;
    if (currentRole === 'AUDITOR' && !perm.endsWith(':view')) return false;
    return perms.includes(perm) || perms.includes('*');
  }

  function hasAnyRole(...roles: string[]): boolean {
    if (!user.value) return false;
    return roles.includes(effectiveRoleCode.value);
  }

  const canAccessPenerimaan = computed<boolean>(() => {
    if (!user.value) return false;
    return (
      hasPermission('revenue:view') ||
      hasPermission('cashier:view') ||
      hasPermission('payment:view') ||
      hasPermission('reconciliation:view')
    );
  });

  const canAccessPengeluaran = computed<boolean>(() => {
    if (!user.value) return false;
    return (
      hasPermission('budget:view') ||
      hasPermission('procurement:view') ||
      hasPermission('expense:view') ||
      hasPermission('accounting:view') ||
      hasPermission('admin:view')
    );
  });

  function setWorkspace(ws: FinanceWorkspace): boolean {
    if (ws === 'PENERIMAAN' && !canAccessPenerimaan.value) {
      triggerAccessDenied('Ruang Kerja Penerimaan');
      return false;
    }
    if (ws === 'PENGELUARAN' && !canAccessPengeluaran.value) {
      triggerAccessDenied('Ruang Kerja Pengeluaran');
      return false;
    }
    activeWorkspace.value = ws;
    if (ws === 'GATEWAY') {
      localStorage.removeItem('pmo_active_workspace');
    } else {
      localStorage.setItem('pmo_active_workspace', ws);
    }
    return true;
  }

  function resetWorkspace() {
    activeWorkspace.value = 'GATEWAY';
    localStorage.removeItem('pmo_active_workspace');
  }

  function ensureValidWorkspace() {
    if (!user.value) return;
    if (activeWorkspace.value === 'PENERIMAAN' && canAccessPenerimaan.value) return;
    if (activeWorkspace.value === 'PENGELUARAN' && canAccessPengeluaran.value) return;
    if (canAccessPenerimaan.value) {
      setWorkspace('PENERIMAAN');
    } else if (canAccessPengeluaran.value) {
      setWorkspace('PENGELUARAN');
    }
  }

  async function login(email: string, password: string) {
    const res = await apiFetch<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('pmo_erp_token', res.data.token);
    localStorage.setItem('pmo_erp_user', JSON.stringify(res.data.user));
    resetWorkspace();
    if (res.data.user.businessUnitId) {
      selectedBusinessUnitId.value = res.data.user.businessUnitId;
    } else {
      selectedBusinessUnitId.value = '';
    }
    await fetchMe();
  }

  async function fetchMe() {
    if (!token.value) return;
    try {
      const res = await apiFetch<{
        user: UserProfile;
        activePeriod: { id: string; code: string; name: string; status?: string; isClosed: boolean } | null;
        unreadNotifications: number;
        pendingApprovalsCount?: number;
        settings: Record<string, string>;
      }>('/auth/me');
      user.value = res.data.user;
      activePeriod.value = res.data.activePeriod;
      unreadNotifications.value = res.data.unreadNotifications ?? 0;
      pendingApprovalsCount.value = res.data.pendingApprovalsCount ?? 0;
      settings.value = res.data.settings || {};
      localStorage.setItem('pmo_erp_user', JSON.stringify(res.data.user));
    } catch {
      logoutLocal();
    }
  }

  async function refreshCounters() {
    await fetchMe();
  }

  function logoutLocal() {
    token.value = null;
    user.value = null;
    activeWorkspace.value = 'GATEWAY';
    localStorage.removeItem('pmo_erp_token');
    localStorage.removeItem('pmo_erp_user');
    localStorage.removeItem('pmo_active_workspace');
  }

  async function logout() {
    try {
      if (token.value) {
        await apiFetch('/auth/logout', { method: 'POST' });
      }
    } finally {
      logoutLocal();
    }
  }

  return {
    token,
    user,
    activePeriod,
    unreadNotifications,
    pendingApprovalsCount,
    settings,
    selectedBusinessUnitId,
    theme,
    activeWorkspace,
    canAccessPenerimaan,
    canAccessPengeluaran,
    setWorkspace,
    resetWorkspace,
    ensureValidWorkspace,
    effectiveRoleCode,
    effectiveRoleName,
    effectivePermissions,
    accessDeniedAlert,
    triggerAccessDenied,
    dismissAccessDenied,
    isAuthenticated,
    applyTheme,
    toggleTheme,
    hasPermission,
    hasAnyRole,
    login,
    fetchMe,
    refreshCounters,
    logout,
    logoutLocal,
  };
});
