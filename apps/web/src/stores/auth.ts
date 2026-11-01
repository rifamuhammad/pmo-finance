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

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('pmo_erp_token'));
  const user = ref<UserProfile | null>(
    localStorage.getItem('pmo_erp_user') ? JSON.parse(localStorage.getItem('pmo_erp_user')!) : null
  );
  const activePeriod = ref<{ id: string; code: string; name: string; isClosed: boolean } | null>(null);
  const unreadNotifications = ref<number>(0);
  const settings = ref<Record<string, string>>({});
  const selectedBusinessUnitId = ref<string>('');
  const theme = ref<'light'>('light');
  const simulatedRole = ref<string | null>(localStorage.getItem('pmo_simulated_role'));
  const accessDeniedAlert = ref<{ show: boolean; moduleName: string; roleName: string } | null>(null);

  const roleProfilesMap: Record<string, { roleName: string; permissions: string[] }> = {
    SUPER_ADMIN: {
      roleName: 'Super Admin (Pusat)',
      permissions: ['*'],
    },
    GM_PMO: {
      roleName: 'General Manager PMO',
      permissions: [
        'dashboard:view', 'approval:view', 'approval:action', 'budget:view', 'budget:create', 'budget:approve',
        'budget:submit', 'procurement:view', 'procurement:create', 'procurement:approve', 'expense:view',
        'expense:approve', 'revenue:view', 'payment:view', 'cashier:view', 'reconciliation:view',
        'accounting:view', 'report:view', 'report:export', 'strategy:view', 'strategy:manage', 'audit:view', 'admin:view'
      ],
    },
    UNIT_MANAGER: {
      roleName: 'Manager Unit Bisnis (Divisi)',
      permissions: [
        'dashboard:view', 'approval:view', 'budget:view', 'budget:create', 'budget:submit',
        'procurement:view', 'procurement:create', 'expense:view', 'expense:create', 'revenue:view',
        'revenue:create', 'payment:view', 'report:view'
      ],
    },
    FINANCE_MANAGER: {
      roleName: 'Finance Manager / Keuangan PMO',
      permissions: [
        'dashboard:view', 'approval:view', 'approval:action', 'budget:view', 'budget:create', 'budget:submit',
        'procurement:view', 'procurement:create', 'procurement:approve', 'expense:view', 'expense:create',
        'expense:approve', 'expense:pay', 'revenue:view', 'revenue:create', 'payment:view', 'payment:create',
        'payment:approve', 'cashier:view', 'cashier:operate', 'reconciliation:view', 'reconciliation:manage',
        'accounting:view', 'accounting:manage', 'accounting:post', 'report:view', 'report:export',
        'strategy:view', 'audit:view'
      ],
    },
    CASHIER: {
      roleName: 'Kasir / Petugas Loket Layanan',
      permissions: [
        'dashboard:view', 'revenue:view', 'payment:view', 'payment:create', 'cashier:view', 'cashier:operate'
      ],
    },
    AUDITOR: {
      roleName: 'Auditor Internal / SPI PTNBH UT',
      permissions: [
        'dashboard:view', 'approval:view', 'budget:view', 'procurement:view', 'expense:view', 'revenue:view',
        'payment:view', 'cashier:view', 'reconciliation:view', 'accounting:view', 'report:view',
        'report:export', 'strategy:view', 'audit:view'
      ],
    },
  };

  const effectiveRoleCode = computed(() => {
    return simulatedRole.value || user.value?.roleCode || '';
  });

  const effectiveRoleName = computed(() => {
    if (simulatedRole.value && roleProfilesMap[simulatedRole.value]) {
      return roleProfilesMap[simulatedRole.value].roleName;
    }
    return user.value?.roleName || user.value?.roleCode || 'Pengguna';
  });

  const effectivePermissions = computed<string[]>(() => {
    if (simulatedRole.value && roleProfilesMap[simulatedRole.value]) {
      return roleProfilesMap[simulatedRole.value].permissions;
    }
    return user.value?.permissions || [];
  });

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function setSimulatedRole(roleCode: string | null) {
    simulatedRole.value = roleCode;
    if (roleCode) {
      localStorage.setItem('pmo_simulated_role', roleCode);
    } else {
      localStorage.removeItem('pmo_simulated_role');
    }
  }

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

  async function login(email: string, password: string) {
    const res = await apiFetch<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('pmo_erp_token', res.data.token);
    localStorage.setItem('pmo_erp_user', JSON.stringify(res.data.user));
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
        activePeriod: { id: string; code: string; name: string; isClosed: boolean } | null;
        unreadNotifications: number;
        settings: Record<string, string>;
      }>('/auth/me');
      user.value = res.data.user;
      activePeriod.value = res.data.activePeriod;
      unreadNotifications.value = res.data.unreadNotifications;
      settings.value = res.data.settings || {};
      localStorage.setItem('pmo_erp_user', JSON.stringify(res.data.user));
    } catch {
      logoutLocal();
    }
  }

  function logoutLocal() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('pmo_erp_token');
    localStorage.removeItem('pmo_erp_user');
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
    settings,
    selectedBusinessUnitId,
    theme,
    simulatedRole,
    effectiveRoleCode,
    effectiveRoleName,
    effectivePermissions,
    roleProfilesMap,
    accessDeniedAlert,
    setSimulatedRole,
    triggerAccessDenied,
    dismissAccessDenied,
    isAuthenticated,
    applyTheme,
    toggleTheme,
    hasPermission,
    hasAnyRole,
    login,
    fetchMe,
    logout,
    logoutLocal,
  };
});
