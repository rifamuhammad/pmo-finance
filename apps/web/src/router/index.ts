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
import PenerimaanPembukuanView from '../modules/PenerimaanPembukuanView.vue';
import PenerimaanLaporanView from '../modules/PenerimaanLaporanView.vue';
import ReconciliationView from '../modules/ReconciliationView.vue';
import AccountingView from '../modules/AccountingView.vue';
import ReportsStrategyView from '../modules/ReportsStrategyView.vue';
import AdminAuditView from '../modules/AdminAuditView.vue';
import PettyCashView from '../modules/PettyCashView.vue';
import AssetsView from '../modules/AssetsView.vue';
import HrisView from '../modules/HrisView.vue';

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
          meta: { title: 'Kotak Masuk Persetujuan (Approvals)', permission: 'approval:view' },
        },
        {
          path: 'budgets',
          name: 'budgets',
          component: BudgetsView,
          meta: { title: 'Perencanaan Modal & Anggaran', permission: 'budget:view' },
        },
        {
          path: 'procurement',
          name: 'procurement',
          component: ProcurementView,
          meta: { title: 'Pengadaan, PO, Penerimaan & Beban', permission: 'procurement:view' },
        },
        {
          path: 'revenue',
          name: 'revenue',
          component: RevenueCashierView,
          meta: { title: 'Buku Harian Penerimaan (Invoice, Kwitansi & Tanda Terima)', permission: 'revenue:view' },
        },
        {
          path: 'penerimaan/pembukuan',
          name: 'penerimaan-pembukuan',
          component: PenerimaanPembukuanView,
          meta: { title: 'Pembukuan Penerimaan (Umum & Pajak)', permission: 'revenue:view' },
        },
        {
          path: 'penerimaan/laporan',
          name: 'penerimaan-laporan',
          component: PenerimaanLaporanView,
          meta: { title: 'Laporan Penerimaan & Aging Piutang', permission: 'revenue:view' },
        },
        {
          path: 'cashier',
          redirect: '/revenue',
        },
        {
          path: 'reconciliation',
          name: 'reconciliation',
          component: ReconciliationView,
          meta: { title: 'Manajemen Kas, Bank & Rekonsiliasi', permission: 'reconciliation:view' },
        },
        {
          path: 'accounting',
          name: 'accounting',
          component: AccountingView,
          meta: { title: 'Akuntansi, Buku Besar, Pajak & Aset', permission: 'accounting:view' },
        },
        {
          path: 'petty-cash',
          name: 'petty-cash',
          component: PettyCashView,
          meta: { title: 'Uang Persediaan & SPJ (GUP/TUP)', permission: 'procurement:view' },
        },
        {
          path: 'assets',
          name: 'assets',
          component: AssetsView,
          meta: { title: 'Inventaris & Aset PMO (Milik & Pinjaman PBI UT)', permission: 'accounting:view' },
        },
        {
          path: 'inventaris',
          redirect: '/assets',
        },
        {
          path: 'fixed-assets',
          redirect: '/assets',
        },
        {
          path: 'hris',
          name: 'hris',
          component: HrisView,
          meta: { title: 'Database SDM, Presensi & Payroll PMO', permission: 'admin:view' },
        },
        {
          path: 'payroll',
          redirect: '/hris',
        },
        {
          path: 'sdm',
          redirect: '/hris',
        },
        {
          path: 'tax-submission',
          redirect: '/petty-cash',
        },
        {
          path: 'uang-persediaan',
          redirect: '/petty-cash',
        },
        {
          path: 'gup',
          redirect: '/petty-cash',
        },
        {
          path: 'reports',
          name: 'reports',
          component: ReportsStrategyView,
          meta: { title: 'Laporan Keuangan & Evaluasi Strategis', permission: 'report:view' },
        },
        {
          path: 'admin',
          name: 'admin',
          component: AdminAuditView,
          meta: { title: 'Administrasi, Kebijakan & Audit Trail', permission: 'admin:view' },
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

  const requiredPerm = to.meta.permission as string | undefined;
  if (requiredPerm && !auth.hasPermission(requiredPerm)) {
    auth.triggerAccessDenied(String(to.meta.title || 'Modul'));
    return { path: '/' };
  }

  return true;
});
