import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestIdMiddleware, errorHandler } from './middleware/auth.js';
import { authRouter } from './modules/auth/routes.js';
import { masterRouter } from './modules/master/routes.js';
import { budgetRouter } from './modules/budget/routes.js';
import { procurementRouter } from './modules/procurement/routes.js';
import { revenueRouter } from './modules/revenue/routes.js';
import { reconciliationRouter } from './modules/reconciliation/routes.js';
import { accountingRouter } from './modules/accounting/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { pettyCashRouter } from './modules/pettycash/routes.js';
import { assetRouter } from './modules/assets/routes.js';
import { hrisRouter } from './modules/hris/routes.js';
import { approvalsRouter } from './modules/approvals/routes.js';
import { auditRouter } from './modules/audit/routes.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(requestIdMiddleware);

// Health Check
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'pmo-utama-erp-api',
      status: 'healthy',
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
      demoMode: true,
      timestamp: new Date().toISOString(),
    },
    meta: { requestId: req.requestId },
  });
});

// OpenAPI 3.0 Specification
app.get('/api/v1/docs.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'ERP Keuangan & Operasional PMO UTama API',
      version: '1.0.0',
      description:
        'API spesifikasi lengkap untuk siklus perencanaan anggaran, pengadaan, pengeluaran, pesanan pelanggan, pembayaran, kasir, rekonsiliasi bank, akuntansi buku besar, laporan, dan evaluasi strategis.',
    },
    servers: [{ url: '/api/v1', description: 'API v1 Base Path' }],
    paths: {
      '/auth/login': { post: { summary: 'Autentikasi pengguna dan penerbitan JWT' } },
      '/auth/me': { get: { summary: 'Profil pengguna aktif, hak akses, dan periode fiskal' } },
      '/budgets': {
        get: { summary: 'Daftar anggaran sesuai unit bisnis dan filter' },
        post: { summary: 'Buat draft anggaran baru beserta baris mata anggaran' },
      },
      '/budgets/{id}/submit': { post: { summary: 'Ajukan anggaran untuk persetujuan' } },
      '/budgets/{id}/approve': { post: { summary: 'Setujui anggaran (dengan kontrol Separation of Duties)' } },
      '/budgets/{id}/revise': { post: { summary: 'Revisi anggaran dengan menyimpan snapshot versi sebelumnya' } },
      '/procurement/vendors': { get: { summary: 'Daftar vendor' }, post: { summary: 'Tambah vendor dengan cek duplikasi NPWP' } },
      '/procurement/purchase-requests': {
        get: { summary: 'Daftar Purchase Request (PR)' },
        post: { summary: 'Buat PR dengan validasi sisa plafon anggaran' },
      },
      '/procurement/purchase-orders': {
        get: { summary: 'Daftar Purchase Order (PO)' },
        post: { summary: 'Terbitkan PO dari PR yang disetujui & evaluasi minimal 3 penawaran' },
      },
      '/procurement/vendor-invoices': {
        get: { summary: 'Daftar tagihan vendor' },
        post: { summary: 'Catat tagihan vendor dengan 3-way matching (PO vs Goods Receipt vs Invoice)' },
      },
      '/procurement/expenses': {
        get: { summary: 'Daftar pengeluaran biaya' },
        post: { summary: 'Catat pengeluaran operasional atau pencairan tagihan PO' },
      },
      '/revenue/sales-orders': {
        get: { summary: 'Daftar pesanan pelanggan' },
        post: { summary: 'Buat pesanan pelanggan dan terbitkan invoice' },
      },
      '/revenue/payments': {
        get: { summary: 'Daftar pembayaran pelanggan' },
        post: { summary: 'Catat pembayaran penuh/parsial secara idempotent beserta potongan fee' },
      },
      '/revenue/payments/webhook': {
        post: { summary: 'Endpoint callback payment gateway dengan verifikasi HMAC-SHA256' },
      },
      '/revenue/cashier/sessions': {
        get: { summary: 'Daftar sesi kasir dan setoran kas' },
      },
      '/reconciliation/preview': {
        post: { summary: 'Pratinjau mutasi bank, deteksi duplikat fingerprint, dan saran pencocokan' },
      },
      '/reconciliation/import': {
        post: { summary: 'Impor mutasi bank tervalidasi' },
      },
      '/accounting/coa': { get: { summary: 'Chart of Accounts & pemetaan akun' } },
      '/accounting/journals': {
        get: { summary: 'Daftar jurnal umum' },
        post: { summary: 'Posting jurnal berpasangan yang wajib seimbang (Debit == Kredit)' },
      },
      '/accounting/ledger': { get: { summary: 'Buku Besar (General Ledger) & Neraca Saldo (Trial Balance)' } },
      '/reports/dashboard': { get: { summary: 'KPI eksekutif dan operasional real-time sesuai filter' } },
      '/reports/financial': { get: { summary: 'Laporan Laba Rugi, Neraca, Arus Kas, dan Anggaran vs Aktual' } },
      '/reports/export': { get: { summary: 'Ekspor laporan CSV ber-metadata (memerlukan izin report:export)' } },
      '/reports/strategy/evaluations': {
        get: { summary: 'Evaluasi strategis akhir periode & rekomendasi plafon periode berikutnya' },
      },
    },
  });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/master', masterRouter);
app.use('/api/v1/budgets', budgetRouter);
app.use('/api/v1/procurement', procurementRouter);
app.use('/api/v1/revenue', revenueRouter);
app.use('/api/v1/reconciliation', reconciliationRouter);
app.use('/api/v1/accounting', accountingRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/petty-cash', pettyCashRouter);
app.use('/api/v1/assets', assetRouter);
app.use('/api/v1/hris', hrisRouter);
app.use('/api/v1/approvals', approvalsRouter);
app.use('/api/v1/audit', auditRouter);

app.use(errorHandler);
