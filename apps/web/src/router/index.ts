import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import AppShell from '../layouts/AppShell.vue';
import LoginView from '../modules/LoginView.vue';
import AppsLauncherView from '../modules/AppsLauncherView.vue';
import DashboardView from '../modules/DashboardView.vue';
import ApprovalsView from '../modules/ApprovalsView.vue';
import BudgetsView from '../modules/BudgetsView.vue';
import ProcurementView from '../modules/ProcurementView.vue';
import RevenueCashierView from '../modules/RevenueCashierView.vue';
import ReconciliationView from '../modules/ReconciliationView.vue';
import AccountingView from '../modules/AccountingView.vue';
import ReportsStrategyView from '../modules/ReportsStrategyView.vue';
import AdminAuditView from '../modules/AdminAuditView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true, title: 'Login Pengguna' },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        {
          path: '',
          name: 'apps-launcher',
          component: AppsLauncherView,
          meta: { title: 'Menu Aplikasi ERP' },
        },
        {
          path: 'apps',
          redirect: '/',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
          meta: { title: 'Dashboard Eksekutif & Operasional' },
        },
        {
          path: 'approvals',
          name: 'approvals',
          component: ApprovalsView,
          meta: { title: 'Kotak Masuk Persetujuan (Approvals)' },
        },
        {
          path: 'budgets',
          name: 'budgets',
          component: BudgetsView,
          meta: { title: 'Perencanaan Modal & Anggaran' },
        },
        {
          path: 'procurement',
          name: 'procurement',
          component: ProcurementView,
          meta: { title: 'Pengadaan, PO, Penerimaan & Beban' },
        },
        {
          path: 'revenue',
          name: 'revenue',
          component: RevenueCashierView,
          meta: { title: 'Pelanggan, Pesanan, Invoice & Kasir' },
        },
        {
          path: 'cashier',
          redirect: '/revenue',
        },
        {
          path: 'reconciliation',
          name: 'reconciliation',
          component: ReconciliationView,
          meta: { title: 'Manajemen Kas, Bank & Rekonsiliasi' },
        },
        {
          path: 'accounting',
          name: 'accounting',
          component: AccountingView,
          meta: { title: 'Akuntansi, Buku Besar, Pajak & Aset' },
        },
        {
          path: 'reports',
          name: 'reports',
          component: ReportsStrategyView,
          meta: { title: 'Laporan Keuangan & Evaluasi Strategis' },
        },
        {
          path: 'admin',
          name: 'admin',
          component: AdminAuditView,
          meta: { title: 'Administrasi, Kebijakan & Audit Trail' },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (auth.isAuthenticated) {
      return { path: '/' };
    }
    return true;
  }

  if (!auth.token) {
    return { path: '/login' };
  }

  if (!auth.user) {
    await auth.fetchMe();
    if (!auth.user) {
      return { path: '/login' };
    }
  }

  return true;
});
