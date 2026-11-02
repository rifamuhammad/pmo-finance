import { PrismaClient } from '@prisma/client';

export const CORE_ROLES_PERMISSIONS: Record<
  string,
  { name: string; description: string; approvalLimit: string; permissions: string[] }
> = {
  SUPER_ADMIN: {
    name: 'Super Admin / System Administrator',
    description: 'Pengelola penuh master data, role RBAC, otorisasi menu, dan akun pengguna dengan hak akses penuh (*).',
    approvalLimit: '0.00',
    permissions: ['*'],
  },
  GM_PMO: {
    name: 'General Manager PMO UTama',
    description:
      'Pimpinan tertinggi operasional bisnis PMO UTama PTNBH Universitas Terbuka. Menyetujui anggaran tahunan, revisi belanja unit, PR skala besar (> Rp 25 Juta), otorisasi pengeluaran strategis, dan evaluasi strategi ekspansi bisnis.',
    approvalLimit: '5000000000.00',
    permissions: [
      'dashboard:view',
      'approval:view',
      'approval:action',
      'budget:view',
      'budget:create',
      'budget:submit',
      'budget:approve',
      'procurement:view',
      'procurement:create',
      'procurement:approve',
      'expense:view',
      'expense:create',
      'expense:approve',
      'expense:pay',
      'revenue:view',
      'revenue:create',
      'payment:view',
      'payment:create',
      'payment:approve',
      'cashier:view',
      'cashier:operate',
      'reconciliation:view',
      'reconciliation:manage',
      'accounting:view',
      'accounting:manage',
      'accounting:post',
      'report:view',
      'report:export',
      'strategy:view',
      'strategy:manage',
      'audit:view',
      'admin:view',
    ],
  },
  FINANCE_MANAGER: {
    name: 'Finance Manager / Kepala Keuangan PMO',
    description:
      'Pengelola perbendaharaan, likuiditas rekening kas/bank, otorisasi pencairan belanja (< Rp 25 Juta), validasi 3-way matching faktur vendor (AP), kepatuhan perpajakan, dan pelaporan akuntansi PSAK.',
    approvalLimit: '250000000.00',
    permissions: [
      'dashboard:view',
      'approval:view',
      'approval:action',
      'budget:view',
      'budget:create',
      'budget:submit',
      'budget:approve',
      'procurement:view',
      'procurement:create',
      'procurement:approve',
      'expense:view',
      'expense:create',
      'expense:approve',
      'expense:pay',
      'revenue:view',
      'revenue:create',
      'payment:view',
      'payment:create',
      'payment:approve',
      'cashier:view',
      'cashier:operate',
      'reconciliation:view',
      'reconciliation:manage',
      'accounting:view',
      'accounting:manage',
      'accounting:post',
      'report:view',
      'report:export',
      'strategy:view',
      'strategy:manage',
      'audit:view',
      'admin:view',
    ],
  },
  UNIT_MANAGER: {
    name: 'Manager Unit Bisnis',
    description:
      'Kepala Unit Pelaksana Bisnis PMO (Divisi IT Solution, Divisi MICE, Divisi TCI, Divisi Klinik Pratama). Bertanggung jawab atas pencapaian pendapatan unit, usulan Rencana Anggaran (RAB), dan belanja kegiatan proyek unit.',
    approvalLimit: '10000000.00',
    permissions: [
      'dashboard:view',
      'approval:view',
      'budget:view',
      'budget:create',
      'budget:submit',
      'procurement:view',
      'procurement:create',
      'expense:view',
      'expense:create',
      'revenue:view',
      'revenue:create',
      'payment:view',
      'report:view',
    ],
  },
  PROCUREMENT: {
    name: 'Procurement / Staf Pengadaan',
    description:
      'Pengelola komparasi 3 vendor penawaran, evaluasi kelayakan vendor, penerbitan PO, penerimaan barang/jasa (BAST), dan pencatatan tagihan vendor (AP).',
    approvalLimit: '15000000.00',
    permissions: [
      'dashboard:view',
      'budget:view',
      'procurement:view',
      'procurement:create',
      'expense:view',
      'report:view',
    ],
  },
  ACCOUNTING: {
    name: 'Accounting / Staf Akuntansi',
    description:
      'Pencatatan faktur vendor (AP), buku besar (GL), jurnal penyesuaian double-entry, analisis umur piutang & utang (AR/AP Aging), penyusutan aset tetap, dan penutupan buku.',
    approvalLimit: '0.00',
    permissions: [
      'dashboard:view',
      'budget:view',
      'procurement:view',
      'expense:view',
      'revenue:view',
      'payment:view',
      'reconciliation:view',
      'reconciliation:manage',
      'accounting:view',
      'accounting:manage',
      'accounting:post',
      'report:view',
      'report:export',
      'audit:view',
    ],
  },
  TAX_OFFICER: {
    name: 'Staf Pajak / Tax Compliance',
    description:
      'Pengecekan faktur PPN masukan (AP) & keluaran (AR), bukti potong PPh 21/23/Final, pembukuan akun kewajiban pajak, dan SPT masa.',
    approvalLimit: '0.00',
    permissions: [
      'dashboard:view',
      'procurement:view',
      'expense:view',
      'revenue:view',
      'accounting:view',
      'accounting:manage',
      'report:view',
      'report:export',
    ],
  },
  CASHIER: {
    name: 'Petugas Kasir / Loket Layanan',
    description:
      'Operasional buka/tutup loket per shift, penerimaan tunai/EDC/QRIS, cetak kuitansi, dan setoran kas ke bank.',
    approvalLimit: '0.00',
    permissions: [
      'dashboard:view',
      'revenue:view',
      'payment:view',
      'payment:create',
      'cashier:view',
      'cashier:operate',
    ],
  },
  AUDITOR: {
    name: 'Internal Auditor / SPI PTNBH UT',
    description:
      'Pengawas independen Satuan Pengawas Internal (SPI) PTNBH Universitas Terbuka. Akses 100% Read-Only untuk memantau transparansi keuangan dan kepatuhan SOP lintas role.',
    approvalLimit: '0.00',
    permissions: [
      'dashboard:view',
      'approval:view',
      'budget:view',
      'procurement:view',
      'expense:view',
      'revenue:view',
      'payment:view',
      'cashier:view',
      'reconciliation:view',
      'accounting:view',
      'report:view',
      'report:export',
      'strategy:view',
      'audit:view',
      'admin:view',
    ],
  },
};

export async function syncCoreRoles(prismaClient: PrismaClient): Promise<void> {
  try {
    for (const [code, meta] of Object.entries(CORE_ROLES_PERMISSIONS)) {
      const existing = await prismaClient.role.findUnique({ where: { code } });
      if (!existing) {
        await prismaClient.role.create({
          data: {
            code,
            name: meta.name,
            description: meta.description,
            approvalLimit: meta.approvalLimit,
            permissions: meta.permissions,
          },
        });
      } else {
        const mergedPermissions =
          code === 'SUPER_ADMIN'
            ? ['*']
            : Array.from(new Set([...existing.permissions, ...meta.permissions]));
        await prismaClient.role.update({
          where: { code },
          data: {
            permissions: mergedPermissions,
          },
        });
      }
    }
  } catch (err: any) {
    // Log warning without failing server startup if DB is offline during build
    console.warn('[RBAC Sync] Core roles auto-sync deferred:', err.message);
  }
}
