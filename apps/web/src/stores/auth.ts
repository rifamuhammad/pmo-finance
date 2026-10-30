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
  const theme = ref<'light' | 'dark'>((localStorage.getItem('pmo_erp_theme') as 'light' | 'dark') || 'dark');

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function applyTheme(newTheme: 'light' | 'dark') {
    theme.value = newTheme;
    localStorage.setItem('pmo_erp_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }

  function toggleTheme() {
    applyTheme(theme.value === 'light' ? 'dark' : 'light');
  }

  function hasPermission(perm: string): boolean {
    if (!user.value) return false;
    if (user.value.roleCode === 'AUDITOR' && !perm.endsWith(':view')) return false;
    return user.value.permissions.includes(perm) || user.value.permissions.includes('*');
  }

  function hasAnyRole(...roles: string[]): boolean {
    if (!user.value) return false;
    return roles.includes(user.value.roleCode);
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
