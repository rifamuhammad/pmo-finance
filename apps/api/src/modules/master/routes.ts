import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { hashPassword } from '../../shared/security.js';
import { recordAuditLog } from '../../shared/audit.js';
import { AppError, requireAuth, requirePermission, requireRoles } from '../../middleware/auth.js';

export const masterRouter = Router();

masterRouter.use(requireAuth);

masterRouter.get('/overview', async (req, res, next) => {
  try {
    const [
      businessUnits,
      costCenters,
      fundSources,
      fiscalPeriods,
      roles,
      approvalPolicies,
      taxConfigurations,
      systemSettings,
      chartOfAccounts,
    ] = await Promise.all([
      prisma.businessUnit.findMany({ orderBy: { code: 'asc' } }),
      prisma.costCenter.findMany({ include: { businessUnit: true }, orderBy: { code: 'asc' } }),
      prisma.fundSource.findMany({ orderBy: { code: 'asc' } }),
      prisma.fiscalPeriod.findMany({ orderBy: { startDate: 'desc' } }),
      prisma.role.findMany({ orderBy: { code: 'asc' } }),
      prisma.approvalPolicy.findMany({ orderBy: { module: 'asc' } }),
      prisma.taxConfiguration.findMany({ orderBy: { taxCode: 'asc' } }),
      prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
      prisma.chartOfAccount.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    ]);

    res.json({
      success: true,
      data: {
        businessUnits,
        costCenters,
        fundSources,
        fiscalPeriods,
        roles,
        approvalPolicies,
        taxConfigurations,
        systemSettings,
        chartOfAccounts,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createUnitSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(3),
  type: z.string().default('OPERATIONAL'),
  managerName: z.string().min(2),
});

masterRouter.post('/business-units', requirePermission('admin:manage'), async (req, res, next) => {
  try {
    const parsed = createUnitSchema.parse(req.body);
    const created = await prisma.businessUnit.create({
      data: {
        code: parsed.code.toUpperCase().trim(),
        name: parsed.name.trim(),
        type: parsed.type,
        managerName: parsed.managerName.trim(),
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'BUSINESS_UNIT_CREATED',
      module: 'ADMIN',
      entityType: 'BusinessUnit',
      entityId: created.id,
      entityCode: created.code,
      summary: `Menambahkan unit bisnis baru ${created.code} (${created.name})`,
      afterData: created,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

masterRouter.post(
  '/fiscal-periods/:id/close',
  requireRoles('ACCOUNTING', 'FINANCE_MANAGER', 'GM_PMO'),
  async (req, res, next) => {
    try {
      const period = await prisma.fiscalPeriod.findUnique({ where: { id: req.params.id } });
      if (!period) throw new AppError(404, 'NOT_FOUND', 'Periode fiskal tidak ditemukan.');
      if (period.isClosed) throw new AppError(409, 'ALREADY_CLOSED', 'Periode fiskal sudah dalam keadaan tertutup.');

      const updated = await prisma.fiscalPeriod.update({
        where: { id: period.id },
        data: {
          status: 'CLOSED',
          isClosed: true,
          closedAt: new Date(),
          closedById: req.user!.userId,
        },
      });

      await recordAuditLog({
        actorId: req.user!.userId,
        actorName: req.user!.fullName,
        actorRole: req.user!.roleCode,
        action: 'FISCAL_PERIOD_CLOSED',
        module: 'ACCOUNTING',
        entityType: 'FiscalPeriod',
        entityId: updated.id,
        entityCode: updated.code,
        summary: `Menutup buku periode fiskal ${updated.code} (${updated.name})`,
        beforeData: period,
        afterData: updated,
        requestId: req.requestId,
      });

      res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  }
);

masterRouter.post(
  '/fiscal-periods/:id/lock',
  requireRoles('ACCOUNTING', 'FINANCE_MANAGER', 'GM_PMO'),
  async (req, res, next) => {
    try {
      const period = await prisma.fiscalPeriod.findUnique({ where: { id: req.params.id } });
      if (!period) throw new AppError(404, 'NOT_FOUND', 'Periode fiskal tidak ditemukan.');
      if (period.isClosed || period.status === 'CLOSED') throw new AppError(409, 'ALREADY_CLOSED', 'Periode fiskal sudah ditutup permanen.');
      if (period.status === 'LOCKED') throw new AppError(409, 'ALREADY_LOCKED', 'Periode fiskal sudah dalam status terkunci.');

      const updated = await prisma.fiscalPeriod.update({
        where: { id: period.id },
        data: {
          status: 'LOCKED',
        },
      });

      await recordAuditLog({
        actorId: req.user!.userId,
        actorName: req.user!.fullName,
        actorRole: req.user!.roleCode,
        action: 'FISCAL_PERIOD_LOCKED',
        module: 'ACCOUNTING',
        entityType: 'FiscalPeriod',
        entityId: updated.id,
        entityCode: updated.code,
        summary: `Mengunci sementara (LOCKED) periode fiskal ${updated.code} (${updated.name}) untuk rekonsiliasi tutup buku`,
        beforeData: period,
        afterData: updated,
        requestId: req.requestId,
      });

      res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  }
);

const reopenSchema = z.object({
  reason: z.string().min(5, 'Alasan pembukaan kembali periode wajib diisi minimal 5 karakter.'),
});

masterRouter.post('/fiscal-periods/:id/reopen', requireRoles('GM_PMO', 'FINANCE_MANAGER'), async (req, res, next) => {
  try {
    const { reason } = reopenSchema.parse(req.body);
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: req.params.id } });
    if (!period) throw new AppError(404, 'NOT_FOUND', 'Periode fiskal tidak ditemukan.');

    const updated = await prisma.fiscalPeriod.update({
      where: { id: period.id },
      data: {
        status: 'OPEN',
        isClosed: false,
        reopenReason: reason.trim(),
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'FISCAL_PERIOD_REOPENED',
      module: 'ACCOUNTING',
      entityType: 'FiscalPeriod',
      entityId: updated.id,
      entityCode: updated.code,
      summary: `Membuka kembali periode fiskal ${updated.code}. Alasan: ${reason}`,
      beforeData: period,
      afterData: updated,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const updateSettingSchema = z.object({
  key: z.string().min(2),
  value: z.string(),
});

masterRouter.put('/settings', requireRoles('SUPER_ADMIN', 'GM_PMO', 'FINANCE_MANAGER'), async (req, res, next) => {
  try {
    const parsed = updateSettingSchema.parse(req.body);
    const existing = await prisma.systemSetting.findUnique({ where: { key: parsed.key } });
    const updated = await prisma.systemSetting.upsert({
      where: { key: parsed.key },
      update: {
        value: parsed.value,
        updatedById: req.user!.userId,
      },
      create: {
        key: parsed.key,
        value: parsed.value,
        category: 'GENERAL',
        description: `Konfigurasi ${parsed.key}`,
        updatedById: req.user!.userId,
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'SYSTEM_SETTING_UPDATED',
      module: 'ADMIN',
      entityType: 'SystemSetting',
      entityId: updated.id,
      entityCode: updated.key,
      summary: `Mengubah pengaturan sistem ${updated.key} menjadi "${updated.value}"`,
      beforeData: existing,
      afterData: updated,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

masterRouter.get('/users', requirePermission('admin:view'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: { role: true, businessUnit: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        roleCode: u.roleCode,
        roleName: u.role.name,
        businessUnitId: u.businessUnitId,
        businessUnitName: u.businessUnit?.name ?? 'Semua Unit (Pusat)',
        isActive: u.isActive,
        isDemoData: u.isDemoData,
        createdAt: u.createdAt,
      })),
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(3),
  password: z.string().min(8),
  roleCode: z.string(),
  businessUnitId: z.string().nullable().optional(),
});

masterRouter.post('/users', requirePermission('admin:manage'), async (req, res, next) => {
  try {
    const parsed = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: parsed.email.toLowerCase().trim() } });
    if (existing) {
      throw new AppError(409, 'USER_EXISTS', `Pengguna dengan email "${parsed.email}" sudah terdaftar.`);
    }

    const created = await prisma.user.create({
      data: {
        email: parsed.email.toLowerCase().trim(),
        fullName: parsed.fullName.trim(),
        passwordHash: hashPassword(parsed.password),
        roleCode: parsed.roleCode,
        businessUnitId: parsed.businessUnitId || null,
        isDemoData: false,
      },
      include: { role: true, businessUnit: true },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'USER_CREATED',
      module: 'ADMIN',
      entityType: 'User',
      entityId: created.id,
      entityCode: created.email,
      summary: `Membuat pengguna ${created.fullName} dengan peran ${created.roleCode}`,
      afterData: { id: created.id, email: created.email, roleCode: created.roleCode },
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        roleCode: created.roleCode,
        roleName: created.role.name,
        businessUnitName: created.businessUnit?.name ?? 'Semua Unit (Pusat)',
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const updateUserSchema = z.object({
  fullName: z.string().min(3),
  roleCode: z.string(),
  businessUnitId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

masterRouter.put('/users/:id', requirePermission('admin:manage'), async (req, res, next) => {
  try {
    const parsed = updateUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan.');

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: parsed.fullName.trim(),
        roleCode: parsed.roleCode,
        businessUnitId: parsed.businessUnitId || null,
        isActive: parsed.isActive,
      },
      include: { role: true, businessUnit: true },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'USER_UPDATED',
      module: 'ADMIN',
      entityType: 'User',
      entityId: updated.id,
      entityCode: updated.email,
      summary: `Memperbarui akun pengguna ${updated.fullName} (Peran: ${updated.roleCode}, Status: ${updated.isActive ? 'AKTIF' : 'NONAKTIF'})`,
      beforeData: existing,
      afterData: updated,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const resetPassSchema = z.object({
  newPassword: z.string().min(8, 'Kata sandi minimal 8 karakter.'),
});

masterRouter.put('/users/:id/reset-password', requirePermission('admin:manage'), async (req, res, next) => {
  try {
    const { newPassword } = resetPassSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan.');

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'USER_PASSWORD_RESET',
      module: 'ADMIN',
      entityType: 'User',
      entityId: user.id,
      entityCode: user.email,
      summary: `Mereset kata sandi akun ${user.fullName} (${user.email})`,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message: `Kata sandi untuk ${user.email} berhasil direset.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// MASTER DATA ROLES & MENU AUTHORIZATION (RBAC)
// ==========================================

masterRouter.get('/roles', requirePermission('admin:view'), async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { code: 'asc' },
    });

    res.json({
      success: true,
      data: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        approvalLimit: Number(r.approvalLimit),
        permissions: r.permissions,
        userCount: r._count.users,
        createdAt: r.createdAt,
      })),
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createRoleSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2),
  description: z.string().min(3),
  approvalLimit: z.number().min(0).default(0),
  permissions: z.array(z.string()).default([]),
});

masterRouter.post('/roles', requirePermission('admin:manage'), async (req, res, next) => {
  try {
    const parsed = createRoleSchema.parse(req.body);
    const normalizedCode = parsed.code.toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_');
    const existing = await prisma.role.findUnique({ where: { code: normalizedCode } });
    if (existing) {
      throw new AppError(409, 'ROLE_ALREADY_EXISTS', `Role dengan kode "${normalizedCode}" sudah ada.`);
    }

    const created = await prisma.role.create({
      data: {
        code: normalizedCode,
        name: parsed.name.trim(),
        description: parsed.description.trim(),
        approvalLimit: parsed.approvalLimit,
        permissions: parsed.permissions,
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'ROLE_CREATED',
      module: 'ADMIN',
      entityType: 'Role',
      entityId: created.id,
      entityCode: created.code,
      summary: `Membuat master role baru "${created.name}" (${created.code}) dengan ${created.permissions.length} izin menu`,
      afterData: created,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const updateRoleSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(3),
  approvalLimit: z.number().min(0).optional(),
  permissions: z.array(z.string()),
});

masterRouter.put('/roles/:id', requirePermission('admin:manage'), async (req, res, next) => {
  try {
    const parsed = updateRoleSchema.parse(req.body);
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) throw new AppError(404, 'NOT_FOUND', 'Peran/Role tidak ditemukan.');

    // Protect SUPER_ADMIN from accidentally dropping full admin access
    let perms = parsed.permissions;
    if (role.code === 'SUPER_ADMIN' && !perms.includes('*')) {
      perms = ['*', ...perms];
    }

    const updated = await prisma.role.update({
      where: { id: role.id },
      data: {
        name: parsed.name.trim(),
        description: parsed.description.trim(),
        ...(parsed.approvalLimit !== undefined ? { approvalLimit: parsed.approvalLimit } : {}),
        permissions: perms,
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'ROLE_UPDATED',
      module: 'ADMIN',
      entityType: 'Role',
      entityId: updated.id,
      entityCode: updated.code,
      summary: `Memperbarui hak akses dan izin role "${updated.name}" (${updated.code}). Total izin aktif: ${updated.permissions.length}`,
      beforeData: role,
      afterData: updated,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

masterRouter.delete('/roles/:id', requirePermission('admin:manage'), async (req, res, next) => {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new AppError(404, 'NOT_FOUND', 'Role tidak ditemukan.');

    const protectedRoles = [
      'SUPER_ADMIN',
      'GM_PMO',
      'FINANCE_MANAGER',
      'UNIT_MANAGER',
      'ACCOUNTING',
      'PROCUREMENT',
      'REVENUE_OPERATOR',
      'CASHIER',
      'AUDITOR',
      'TAX_OFFICER',
    ];
    if (protectedRoles.includes(role.code)) {
      throw new AppError(400, 'PROTECTED_ROLE', `Role inti sistem "${role.code}" tidak dapat dihapus.`);
    }

    if (role._count.users > 0) {
      throw new AppError(400, 'ROLE_IN_USE', `Role "${role.name}" tidak dapat dihapus karena masih digunakan oleh ${role._count.users} pengguna.`);
    }

    await prisma.role.delete({ where: { id: role.id } });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'ROLE_DELETED',
      module: 'ADMIN',
      entityType: 'Role',
      entityId: role.id,
      entityCode: role.code,
      summary: `Menghapus master role ${role.code} (${role.name})`,
      beforeData: role,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message: `Role "${role.name}" (${role.code}) berhasil dihapus.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Master Menu & Permission Registry for Authorization Matrix UI
masterRouter.get('/menus-permissions', requirePermission('admin:view'), async (req, res) => {
  const menusRegistry = [
    {
      id: 'dashboard',
      code: 'DASHBOARD',
      name: 'Dashboard Eksekutif',
      route: '/',
      description: 'Ringkasan KPI keuangan, pendapatan, beban, dan serapan anggaran divisi',
      permissions: [
        { code: 'dashboard:view', label: 'Buka Dashboard', description: 'Melihat ringkasan metrik dan grafik eksekutif' },
      ],
    },
    {
      id: 'approvals',
      code: 'APPROVALS',
      name: 'Kotak Masuk Persetujuan',
      route: '/approvals',
      description: 'Persetujuan berjenjang anggaran, purchase request, dan pengeluaran',
      permissions: [
        { code: 'approval:view', label: 'Buka Approval Inbox', description: 'Melihat antrean persetujuan dokumen' },
        { code: 'approval:action', label: 'Setujui / Tolak Dokumen', description: 'Melakukan eksekusi otorisasi keputusan berjenjang' },
      ],
    },
    {
      id: 'budgets',
      code: 'BUDGETS',
      name: 'Perencanaan Anggaran',
      route: '/budgets',
      description: 'Penyusunan plafon RKAP, alokasi per kategori, dan revisi anggaran',
      permissions: [
        { code: 'budget:view', label: 'Buka Menu Anggaran', description: 'Melihat plafon dan serapan anggaran' },
        { code: 'budget:create', label: 'Buat Draf Anggaran', description: 'Membuat usulan anggaran unit bisnis' },
        { code: 'budget:submit', label: 'Ajukan Anggaran', description: 'Mengajukan anggaran untuk verifikasi manajerial' },
        { code: 'budget:approve', label: 'Setujui Anggaran', description: 'Memberikan persetujuan plafon anggaran RKAP' },
      ],
    },
    {
      id: 'procurement',
      code: 'PROCUREMENT',
      name: 'Pengadaan & Beban Operasional',
      route: '/procurement',
      description: 'Purchase Request, Quotation 3 Vendor, Purchase Order, Goods Receipt, & Beban Kas',
      permissions: [
        { code: 'procurement:view', label: 'Buka Menu Pengadaan', description: 'Melihat daftar PR, PO, dan pengeluaran' },
        { code: 'procurement:create', label: 'Buat Purchase Request & PO', description: 'Membuat dokumen pengadaan' },
        { code: 'procurement:approve', label: 'Setujui Pengadaan', description: 'Menyetujui PR & penerbitan PO' },
        { code: 'expense:view', label: 'Lihat Beban Operasional', description: 'Melihat riwayat beban dan biaya' },
        { code: 'expense:create', label: 'Ajukan Beban', description: 'Membuat pengajuan pengeluaran biaya' },
        { code: 'expense:approve', label: 'Setujui Beban', description: 'Otorisasi pencairan beban biaya' },
        { code: 'expense:pay', label: 'Cairkan Pembayaran', description: 'Eksekusi pembayaran kas/transfer ke vendor' },
      ],
    },
    {
      id: 'revenue',
      code: 'REVENUE',
      name: 'Pendapatan & Kasir (POS)',
      route: '/revenue',
      description: 'Point of Sales kasir, faktur penjualan, penerimaan kas, & katalog produk',
      permissions: [
        { code: 'revenue:view', label: 'Buka Menu Pendapatan', description: 'Melihat faktur pelanggan dan POS' },
        { code: 'revenue:create', label: 'Buat Faktur & Sales Order', description: 'Menerbitkan tagihan ke pelanggan/mitra' },
        { code: 'payment:view', label: 'Lihat Penerimaan Kas', description: 'Melihat riwayat pembayaran pelanggan' },
        { code: 'payment:create', label: 'Catat Pembayaran', description: 'Menerima pembayaran tunai/transfer/QRIS' },
        { code: 'payment:approve', label: 'Setujui Pengembalian & Selisih Kasir', description: 'Otorisasi persetujuan selisih register kasir dan refund pembayaran' },
        { code: 'cashier:view', label: 'Buka POS Kasir', description: 'Melihat register kasir unit' },
        { code: 'cashier:operate', label: 'Operasikan Sesi Kasir', description: 'Buka register, transaksi POS, & closeout fisik' },
      ],
    },
    {
      id: 'reconciliation',
      code: 'RECONCILIATION',
      name: 'Kas & Rekonsiliasi Bank',
      route: '/reconciliation',
      description: 'Rekening koran bank, pencocokan otomatis saldo buku vs bank, & selisih mutasi',
      permissions: [
        { code: 'reconciliation:view', label: 'Buka Rekonsiliasi Bank', description: 'Melihat mutasi rekening koran dan status match' },
        { code: 'reconciliation:manage', label: 'Kelola Rekonsiliasi', description: 'Import rekening koran & eksekusi matching' },
      ],
    },
    {
      id: 'accounting',
      code: 'ACCOUNTING',
      name: 'Akuntansi & Jurnal Umum',
      route: '/accounting',
      description: 'Bagan akun (COA), jurnal umum double-entry, buku besar, penutupan periode fiskal',
      permissions: [
        { code: 'accounting:view', label: 'Buka Menu Akuntansi', description: 'Melihat COA dan daftar jurnal umum' },
        { code: 'accounting:manage', label: 'Kelola COA & Buku Besar', description: 'Mengatur bagan akun dan konfigurasi akuntansi' },
        { code: 'accounting:post', label: 'Posting Jurnal Manual', description: 'Membuat jurnal penyesuaian double-entry seimbang' },
      ],
    },
    {
      id: 'reports',
      code: 'REPORTS',
      name: 'Laporan & Strategi Bisnis',
      route: '/reports',
      description: 'Laba Rugi USALI, Neraca, Arus Kas, Evaluasi portofolio bisnis, dan ekspor PDF/Excel',
      permissions: [
        { code: 'report:view', label: 'Buka Laporan Keuangan', description: 'Melihat neraca, laba rugi USALI, dan arus kas' },
        { code: 'report:export', label: 'Ekspor Laporan (PDF/Excel)', description: 'Mengunduh laporan keuangan' },
        { code: 'strategy:view', label: 'Buka Evaluasi Strategis', description: 'Melihat analisis portofolio & strategi unit' },
        { code: 'strategy:manage', label: 'Kelola Keputusan Strategis', description: 'Menyimpan evaluasi dan rekomendasi divisi' },
      ],
    },
    {
      id: 'admin',
      code: 'ADMIN',
      name: 'Administrasi, Role & Audit',
      route: '/admin',
      description: 'Master data role RBAC, otorisasi menu, manajemen pengguna, kebijakan sistem, & audit trail',
      permissions: [
        { code: 'admin:view', label: 'Buka Menu Administrasi', description: 'Melihat pengguna, role, dan konfigurasi sistem' },
        { code: 'admin:manage', label: 'Kelola Master Role & Menu', description: 'Membuat/mengedit role, matriks menu, dan pengguna' },
        { code: 'audit:view', label: 'Lihat Jejak Audit Trail', description: 'Melihat log server-side permanen seluruh transaksi' },
      ],
    },
  ];

  res.json({ success: true, data: menusRegistry });
});

// REAL OMNISEARCH API: Search across 8 Domains (Assets, SPJ, PO, PR, Budgets, Journals, COA Pertor 310, HRIS)
masterRouter.get('/omnisearch', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const scope = String(req.query.scope || 'ALL').toUpperCase();
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: [],
        meta: {
          query: q,
          scope,
          total: 0,
          countsByScope: { ALL: 0, ASSET: 0, FINANCE: 0, HRIS: 0, COA: 0 },
          requestId: req.requestId,
        },
      });
    }

    const isUnitScoped = req.user?.roleCode === 'UNIT_MANAGER' && !!req.user?.businessUnitId;
    const unitScopeFilter = isUnitScoped ? { businessUnitId: req.user!.businessUnitId! } : {};

    const [
      budgets,
      coaAccounts,
      journals,
      purchaseRequests,
      purchaseOrders,
      pettyCash,
      assets,
      employees,
    ] = await Promise.all([
      prisma.budget
        .findMany({
          where: {
            ...unitScopeFilter,
            OR: [
              { docNumber: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
            ],
          },
          include: { businessUnit: { select: { code: true, name: true } } },
          take: 5,
          orderBy: { updatedAt: 'desc' },
        })
        .catch(() => []),
      prisma.chartOfAccount
        .findMany({
          where: {
            isActive: true,
            code: { not: { contains: '-' } },
            name: { not: { startsWith: '[LEGACY]' } },
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { type: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 6,
          orderBy: { code: 'asc' },
        })
        .catch(() => []),
      prisma.journalEntry
        .findMany({
          where: {
            ...unitScopeFilter,
            OR: [
              { journalNumber: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { sourceDocNumber: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 5,
          orderBy: { entryDate: 'desc' },
        })
        .catch(() => []),
      prisma.purchaseRequest
        .findMany({
          where: {
            ...unitScopeFilter,
            OR: [
              { docNumber: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { purpose: { contains: q, mode: 'insensitive' } },
              { requestedByName: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 4,
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => []),
      prisma.purchaseOrder
        .findMany({
          where: {
            ...unitScopeFilter,
            OR: [
              { docNumber: { contains: q, mode: 'insensitive' } },
              { selectionJustification: { contains: q, mode: 'insensitive' } },
              { vendor: { name: { contains: q, mode: 'insensitive' } } },
            ],
          },
          include: { vendor: { select: { name: true } } },
          take: 4,
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => []),
      prisma.pettyCashSubmission
        .findMany({
          where: {
            OR: [
              { submissionNo: { contains: q, mode: 'insensitive' } },
              { activityDescription: { contains: q, mode: 'insensitive' } },
              { applicantName: { contains: q, mode: 'insensitive' } },
              { vendorName: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 4,
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => []),
      prisma.fixedAsset
        .findMany({
          where: {
            ...unitScopeFilter,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { assetCode: { contains: q, mode: 'insensitive' } },
              { location: { contains: q, mode: 'insensitive' } },
              { brandModel: { contains: q, mode: 'insensitive' } },
              { picPerson: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 6,
          orderBy: { updatedAt: 'desc' },
        })
        .catch(() => []),
      prisma.employee
        .findMany({
          where: {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { nik: { contains: q, mode: 'insensitive' } },
              { position: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 5,
          orderBy: { fullName: 'asc' },
        })
        .catch(() => []),
    ]);

    const allResults: any[] = [];

    // 1. Budgets (RKAP Semula-Menjadi)
    for (const b of budgets) {
      allResults.push({
        id: `bdg-${b.id}`,
        entityId: b.id,
        entityType: 'BUDGET',
        scopeGroup: 'FINANCE',
        category: 'Anggaran & RKAP',
        icon: 'pi pi-chart-line',
        title: `${b.docNumber} — ${b.title}`,
        subtitle: `Unit: ${b.businessUnit?.code || 'PMO'} (${b.businessUnit?.name || '-'}) • Versi ${b.version}`,
        badge: b.status,
        badgeColor: b.status === 'APPROVED' || b.status === 'REVISED' ? 'emerald' : 'amber',
        route: `/budgets?q=${encodeURIComponent(b.docNumber)}`,
      });
    }

    // 2. COA Pertor 310 (70 Akun Resmi)
    for (const c of coaAccounts) {
      allResults.push({
        id: `coa-${c.id}`,
        entityId: c.id,
        entityType: 'COA',
        scopeGroup: 'COA',
        category: 'Bagan Akun (COA Pertor 310)',
        icon: 'pi pi-book',
        title: `${c.code} — ${c.name}`,
        subtitle: `Tipe: ${c.type} • Saldo Normal: ${c.normalBalance}`,
        badge: c.type,
        badgeColor: 'blue',
        route: `/accounting?q=${encodeURIComponent(c.code)}`,
      });
    }

    // 3. General Ledger Journals
    for (const j of journals) {
      allResults.push({
        id: `jrn-${j.id}`,
        entityId: j.id,
        entityType: 'JOURNAL',
        scopeGroup: 'FINANCE',
        category: 'Jurnal & Buku Besar (GL)',
        icon: 'pi pi-file-edit',
        title: `Jurnal: ${j.journalNumber}`,
        subtitle: `${j.description} • Ref: ${j.sourceDocNumber || 'Manual'}`,
        badge: j.status,
        badgeColor: j.status === 'POSTED' ? 'emerald' : 'amber',
        route: `/accounting?q=${encodeURIComponent(j.journalNumber)}`,
      });
    }

    // 4. Purchase Requests (PR)
    for (const pr of purchaseRequests) {
      allResults.push({
        id: `pr-${pr.id}`,
        entityId: pr.id,
        entityType: 'PURCHASE_REQUEST',
        scopeGroup: 'FINANCE',
        category: 'Pengadaan & PO',
        icon: 'pi pi-shopping-cart',
        title: `PR: ${pr.docNumber} — ${pr.title}`,
        subtitle: `Pemohon: ${pr.requestedByName} • Status: ${pr.status}`,
        badge: pr.status,
        badgeColor: pr.status === 'APPROVED' ? 'emerald' : 'blue',
        route: `/procurement?q=${encodeURIComponent(pr.docNumber)}`,
      });
    }

    // 5. Purchase Orders (PO)
    for (const po of purchaseOrders) {
      allResults.push({
        id: `po-${po.id}`,
        entityId: po.id,
        entityType: 'PURCHASE_ORDER',
        scopeGroup: 'FINANCE',
        category: 'Pengadaan & PO',
        icon: 'pi pi-box',
        title: `PO: ${po.docNumber}`,
        subtitle: `Vendor: ${po.vendor?.name || 'Rekanan'} • Status: ${po.status}`,
        badge: po.status,
        badgeColor: 'emerald',
        route: `/procurement?q=${encodeURIComponent(po.docNumber)}`,
      });
    }

    // 6. Petty Cash / SPJ (GUP/TUP)
    for (const p of pettyCash) {
      allResults.push({
        id: `pc-${p.id}`,
        entityId: p.id,
        entityType: 'PETTY_CASH',
        scopeGroup: 'FINANCE',
        category: 'SPJ Kas Kecil (GUP/TUP)',
        icon: 'pi pi-bolt',
        title: `SPJ: ${p.submissionNo}`,
        subtitle: `${p.activityDescription || 'Pengajuan Uang Persediaan'} • Pemohon: ${p.applicantName}`,
        badge: p.status,
        badgeColor: 'purple',
        route: `/petty-cash?q=${encodeURIComponent(p.submissionNo)}`,
      });
    }

    // 7. Assets & Inventory
    for (const a of assets) {
      const isPbi = a.ownershipStatus === 'PBI_UT_LOAN';
      allResults.push({
        id: `asset-${a.id}`,
        entityId: a.id,
        entityType: 'ASSET',
        scopeGroup: 'ASSET',
        category: 'Aset & Inventaris',
        icon: 'pi pi-building',
        title: a.name,
        subtitle: `${a.assetCode} • ${a.location || 'UT/PBI'} • PIC: ${a.picPerson || 'Mas Wildan'}`,
        badge: isPbi ? 'PBI UT (Pinjaman)' : 'Milik PMO',
        badgeColor: isPbi ? 'amber' : 'blue',
        route: `/assets?q=${encodeURIComponent(a.name)}`,
      });
    }

    // 8. Employees / SDM
    for (const e of employees) {
      allResults.push({
        id: `emp-${e.id}`,
        entityId: e.id,
        entityType: 'EMPLOYEE',
        scopeGroup: 'HRIS',
        category: 'SDM & Payroll',
        icon: 'pi pi-user',
        title: e.fullName,
        subtitle: `NIK: ${e.nik} • ${e.position} • Divisi: ${e.department}`,
        badge: e.employmentStatus || 'AKTIF',
        badgeColor: 'cyan',
        route: `/hris?q=${encodeURIComponent(e.fullName)}`,
      });
    }

    const countsByScope = {
      ALL: allResults.length,
      ASSET: allResults.filter((r) => r.scopeGroup === 'ASSET').length,
      FINANCE: allResults.filter((r) => r.scopeGroup === 'FINANCE' || r.scopeGroup === 'COA').length,
      COA: allResults.filter((r) => r.scopeGroup === 'COA').length,
      HRIS: allResults.filter((r) => r.scopeGroup === 'HRIS').length,
    };

    let filteredResults = allResults;
    if (scope === 'ASSET') {
      filteredResults = allResults.filter((r) => r.scopeGroup === 'ASSET');
    } else if (scope === 'FINANCE') {
      filteredResults = allResults.filter((r) => r.scopeGroup === 'FINANCE' || r.scopeGroup === 'COA');
    } else if (scope === 'COA') {
      filteredResults = allResults.filter((r) => r.scopeGroup === 'COA');
    } else if (scope === 'HRIS') {
      filteredResults = allResults.filter((r) => r.scopeGroup === 'HRIS');
    }

    res.json({
      success: true,
      data: filteredResults,
      meta: {
        query: q,
        scope,
        total: filteredResults.length,
        countsByScope,
        requestId: req.requestId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// APP LAUNCHER METADATA API: Dynamic module catalog with role-aware access status and live counters
masterRouter.get('/app-launcher', async (req, res, next) => {
  try {
    const userPerms = req.user?.permissions || [];
    const hasPerm = (perm?: string) => {
      if (!perm) return true;
      return userPerms.includes('*') || userPerms.includes(perm);
    };

    const [pendingApprovalsCount, activeBudgetsCount, totalCoaCount, totalAssetsCount] = await Promise.all([
      prisma.approvalRequest.count({ where: { status: 'PENDING' } }).catch(() => 0),
      prisma.budget.count({ where: { status: { in: ['APPROVED', 'REVISED'] } } }).catch(() => 0),
      prisma.chartOfAccount.count({ where: { isActive: true, code: { not: { contains: '-' } } } }).catch(() => 70),
      prisma.fixedAsset.count().catch(() => 0),
    ]);

    const modules = [
      { id: 'dashboard', title: 'Executive Dashboard', category: 'Ikhtisar', route: '/dashboard', icon: 'dashboard', locked: false },
      { id: 'approvals', title: 'Approval Inbox', category: 'Otorisasi', route: '/approvals', icon: 'approvals', permission: 'approval:view', locked: !hasPerm('approval:view'), badge: pendingApprovalsCount > 0 ? `${pendingApprovalsCount} Pending` : undefined },
      { id: 'budgets', title: 'Perencanaan Anggaran', category: 'Perencanaan', route: '/budgets', icon: 'budgets', permission: 'budget:view', locked: !hasPerm('budget:view'), badge: `${activeBudgetsCount} Aktif` },
      { id: 'procurement', title: 'Pengadaan Lab & PO', category: 'Pengadaan', route: '/procurement', icon: 'procurement', permission: 'procurement:view', locked: !hasPerm('procurement:view') },
      { id: 'expenses', title: 'Expenses & Klaim Biaya', category: 'Beban', route: '/procurement?tab=expenses', icon: 'expenses', permission: 'expense:view', locked: !hasPerm('expense:view') },
      { id: 'revenue', title: 'Pendapatan & Kasir POS', category: 'Pendapatan', route: '/revenue', icon: 'revenue', permission: 'revenue:view', locked: !hasPerm('revenue:view') },
      { id: 'reconciliation', title: 'Kas & Rekonsiliasi Bank', category: 'Perbankan', route: '/reconciliation', icon: 'reconciliation', permission: 'reconciliation:view', locked: !hasPerm('reconciliation:view') },
      { id: 'accounting', title: 'Akuntansi & Buku Besar', category: 'Akuntansi', route: '/accounting', icon: 'accounting', permission: 'accounting:view', locked: !hasPerm('accounting:view'), badge: `${totalCoaCount} COA` },
      { id: 'petty-cash', title: 'Uang Persediaan & SPJ', category: 'Perbendaharaan', route: '/petty-cash', icon: 'petty-cash', permission: 'procurement:view', locked: !hasPerm('procurement:view'), badge: 'GUP / TUP' },
      { id: 'assets', title: 'Inventaris & Aset PMO', category: 'Logistik', route: '/assets', icon: 'assets', permission: 'accounting:view', locked: !hasPerm('accounting:view'), badge: `${totalAssetsCount} Item` },
      { id: 'hris', title: 'SDM & Payroll PMO', category: 'Kepegawaian', route: '/hris', icon: 'hris', permission: 'admin:view', locked: !hasPerm('admin:view'), badge: 'HRIS' },
      { id: 'reports', title: 'Laporan Keuangan ISAK 335', category: 'Laporan', route: '/reports', icon: 'reports', permission: 'report:view', locked: !hasPerm('report:view') },
      { id: 'admin', title: 'Pengaturan & Audit Forensik', category: 'Tata Kelola', route: '/admin', icon: 'admin', permission: 'audit:view', locked: !hasPerm('audit:view') },
      { id: 'ai-assistant', title: 'AI Financial Assistant', category: 'Peralatan Cerdas', action: 'ai', icon: 'ai', locked: false, badge: 'Copilot' },
    ];

    res.json({
      success: true,
      data: {
        modules,
        summary: {
          totalModules: modules.length,
          unlockedCount: modules.filter((m) => !m.locked).length,
          lockedCount: modules.filter((m) => m.locked).length,
          pendingApprovalsCount,
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
