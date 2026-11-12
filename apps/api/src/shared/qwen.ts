import OpenAI from 'openai';

export interface QwenFinancialContext {
  user: {
    fullName: string;
    email?: string;
    roleCode: string;
    roleName?: string;
    businessUnitId?: string | null;
    businessUnitName?: string | null;
  };
  metrics: {
    totalAllocated: number;
    totalCommitted: number;
    totalActualExpense: number;
    totalAvailable: number;
    serapanPercent: number;
    totalSemulaAmount?: number;
    totalPergeseranAmount?: number;
    totalMenjadiAmount?: number;
    totalRgaTargetRevenue?: number;
    totalRealizedRevenue?: number;
    rgaAchievementPercent?: number;
    glTotalDebit?: number;
    glTotalCredit?: number;
    glIsBalanced?: boolean;
    activePettyCashCount?: number;
    fixedAssetsCount?: number;
    employeesCount?: number;
  };
  budgets: Array<{
    title: string;
    unitCode?: string;
    unitName?: string;
    allocated: number;
    committed: number;
    actual: number;
    semula?: number;
    pergeseran?: number;
    menjadi?: number;
    revenueTarget?: number;
  }>;
  rgaUnits?: Array<{
    unitCode: string;
    unitName: string;
    targetRevenue: number;
    realizedRevenue: number;
    achievementPercent: number;
  }>;
  pendingApprovals: Array<{
    code: string;
    module: string;
    title: string;
    requestedBy: string;
    requiredRole: string;
  }>;
  recentExpenses: Array<{
    docNumber: string;
    title: string;
    recipientName: string;
    amount: number;
    status: string;
  }>;
  pettyCashSubmissions?: Array<{
    submissionNo: string;
    type: string;
    activityDescription: string;
    applicantName: string;
    amount: number;
    status: string;
  }>;
  unpaidInvoices: Array<{
    docNumber: string;
    customerName: string;
    amount: number;
    status: string;
  }>;
  openCashierSessionsCount: number;
}

export interface QwenAssistantParams {
  query: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: QwenFinancialContext;
}

export interface QwenAssistantResult {
  reply: string;
  provider: 'qwen' | 'local-engine';
  model: string;
  suggestions: string[];
}

function formatRupiah(num: number): string {
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

/**
 * Service to interact with Qwen AI (Alibaba Cloud DashScope / OpenAI-compatible endpoint).
 * Falls back gracefully to the built-in deterministic financial engine if QWEN_API_KEY is not set or network fails.
 */
export async function queryQwenAiAssistant(params: QwenAssistantParams): Promise<QwenAssistantResult> {
  const baseURL =
    process.env.QWEN_BASE_URL?.trim() || 'http://localhost:11434/v1';
  const isOllama = baseURL.includes('11434');
  const apiKey = process.env.QWEN_API_KEY?.trim() || (isOllama ? 'ollama' : '');
  const modelName = process.env.QWEN_MODEL?.trim() || (isOllama ? 'pmo-copilot' : 'qwen-plus');

  const { query, history = [], context } = params;

  const totalSemula = context.metrics.totalSemulaAmount ?? context.metrics.totalAllocated;
  const totalPergeseran = context.metrics.totalPergeseranAmount ?? 0;
  const totalMenjadi = context.metrics.totalMenjadiAmount ?? context.metrics.totalAllocated;
  const totalRgaTarget = context.metrics.totalRgaTargetRevenue ?? 0;
  const totalRealizedRev = context.metrics.totalRealizedRevenue ?? 0;
  const rgaAch = context.metrics.rgaAchievementPercent ?? 0;
  const glDebit = context.metrics.glTotalDebit ?? 0;
  const glCredit = context.metrics.glTotalCredit ?? 0;
  const glBalanced = context.metrics.glIsBalanced ?? true;

  // Prepare system prompt with injected real-time ERP financial facts & onboarding guides
  const systemPrompt = `Anda adalah PMO Copilot, asisten kecerdasan finansial, operasional, dan pemandu navigasi resmi untuk ERP PMO UTama.
PMO UTama adalah unit bisnis pengelola komersial di bawah naungan PTNBH Universitas Terbuka (UT).
Peran Anda adalah sebagai Senior Enterprise Advisor sekaligus Onboarding Mentor yang ramah, sangat cerdas, sistematis, dan sabar membimbing baik pimpinan maupun staf baru dalam memahami dan mengoperasikan sistem ERP PMO UTama.

STRUKTUR ORGANISASI & 5 UNIT BISNIS PMO UTAMA (PTNBH UT):
1. General Manager (GM_PMO): Pimpinan eksekutif tertinggi PMO UTama. Menyetujui anggaran tahunan, revisi belanja Semula-Menjadi, PR skala besar (> Rp 25 Juta), dan mengarahkan strategi bisnis.
2. 5 Unit Bisnis (UNIT_MANAGER per divisi):
   - Kantor Pusat PMO (PMO-HQ): Cost center perbendaharaan, modal kerja RKAP, akuntansi, dan kebijakan pengadaan terpusat.
   - Divisi IT Solution (ITS): Lisensi software ERP, integrasi sistem, dan cloud managed services.
   - Divisi MICE (MICE): Wisma penginapan, sewa Ballroom pertemuan, dan banquet katering event.
   - Divisi TCI (TCI): Sertifikasi profesi, workshop eksekutif, dan diklat digital.
   - Divisi Klinik Pratama (KLN): MCU korporat, poli umum medis, dan instalasi farmasi.
3. Finance Manager (FINANCE_MANAGER): Penanggung jawab likuiditas kas & bank, pencairan belanja (< Rp 25 Juta), 3-way matching faktur vendor, perpajakan, dan laporan akuntansi ISAK 335 & Pertor 310.
4. Auditor Internal / SPI (AUDITOR): Satuan Pengawas Internal (SPI) PTNBH Universitas Terbuka yang mengawasi kepatuhan tata kelola, jejak audit forensik, transparansi keuangan, dan realisasi anggaran secara independen (Read-Only).
5. Super Admin (SUPER_ADMIN): Pengelola sistem dan hak akses terpusat.

DATA REAL-TIME BASIS DATA ERP PMO UTAMA SAAT INI:
- Pengguna Aktif: ${context.user.fullName} (Peran: ${context.user.roleCode}, Unit: ${context.user.businessUnitName || 'Kantor Pusat PMO'})
- Pagu Semula PBI: ${formatRupiah(totalSemula)} | Pergeseran Revisi: ${formatRupiah(totalPergeseran)} | Pagu Menjadi Aktif: ${formatRupiah(totalMenjadi)}
- Total Plafon Anggaran Disetujui: ${formatRupiah(context.metrics.totalAllocated)}
- Dana Dicadangkan (Committed / PO Berjalan): ${formatRupiah(context.metrics.totalCommitted)}
- Realisasi Belanja Beban Aktual (Expense): ${formatRupiah(context.metrics.totalActualExpense)}
- Sisa Saldo Bebas Anggaran: ${formatRupiah(context.metrics.totalAvailable)} (Tingkat Serapan: ${context.metrics.serapanPercent}%)
- Target Pendapatan RGA: ${formatRupiah(totalRgaTarget)} | Realisasi Pendapatan: ${formatRupiah(totalRealizedRev)} (Capaian RGA: ${rgaAch}%)
- Buku Besar GL & Neraca ISAK 335: Total Debit ${formatRupiah(glDebit)} vs Total Kredit ${formatRupiah(glCredit)} (${glBalanced ? 'SEIMBANG / BALANCED' : 'SELISIH'})
- Pengajuan Kas Kecil (GUP/TUP/UMK): ${context.metrics.activePettyCashCount ?? 0} dokumen aktif | Aset Tetap: ${context.metrics.fixedAssetsCount ?? 0} unit | SDM Aktif: ${context.metrics.employeesCount ?? 0} pegawai
- Antrean Dokumen Pending Approval: ${context.pendingApprovals.length} berkas
${context.pendingApprovals.map((a, i) => `  ${i + 1}. [${a.code}] ${a.title} - Pemohon: ${a.requestedBy} (Wewenang: ${a.requiredRole})`).join('\n')}
- Rekapitulasi Klaim Biaya (Expenses) Terkini: ${context.recentExpenses.length} transaksi
${context.recentExpenses.map((e, i) => `  ${i + 1}. [${e.docNumber}] ${e.title} - ${e.recipientName}: ${formatRupiah(e.amount)} (${e.status})`).join('\n')}
- Faktur Penjualan Belum Tertagih (Piutang): ${context.unpaidInvoices.length} faktur
${context.unpaidInvoices.map((inv, i) => `  ${i + 1}. [${inv.docNumber}] ${inv.customerName}: ${formatRupiah(inv.amount)} (${inv.status})`).join('\n')}
- Register Kasir Sedang Buka (Open Sessions): ${context.openCashierSessionsCount} register loket aktif.

ATURAN TATA KELOLA KEUANGAN & REGULASI PTNBH UT:
1. Format PBI 60 Kolom (Semula-Menjadi): Mendukung perhitungan multi-volume 4 dimensi (Vol 1 x Vol 2 x Vol 3 x Vol 4) dan revisi pergeseran anggaran tanpa ketik ulang.
2. Hierarki 5 Level COA Pertor 310 & Laporan ISAK 335: Akun 12 digit terhubung ke Laporan Posisi Keuangan (Aset Neto Tanpa/Dengan Pembatasan), Laporan Aktivitas, dan Arus Kas.
3. Jurnal Umum & Storno: Jurnal yang sudah POSTED bersifat immutable; koreksi wajib melalui Jurnal Pembalik (Storno).
4. Kas Kecil (GUP/TUP) & Panjar UMK: SLA pertanggungjawaban SPJ maksimal 5 Hari Kerja sebelum akun pemohon terkunci otomatis.
5. Cut-off Tanggal 20 (Penyusutan Aset Tetap): Aset yang diperoleh pada/sebelum tanggal 20 disusutkan penuh bulan berjalan; di atas tanggal 20 mulai bulan berikutnya.
6. Cut-off Tanggal 25 (HRIS & Payroll): Kunci absensi dan perhitungan gaji prorata otomatis dilakukan setiap tanggal 25 pukul 23:59:59.

GAYA JAWABAN:
- Profesional, santun, runtut, dan mudah dipahami staf maupun pimpinan.
- Selalu format uang dalam format Rupiah rapi (contoh: Rp 25.000.000).
- Gunakan format Markdown yang indah (bold untuk status/angka penting, bullet points untuk tahapan).
- Berikan saran langkah konkret berikutnya (Next Steps) di akhir jawaban.`;

  // If QWEN_API_KEY is configured, call Qwen via OpenAI SDK
  if (apiKey) {
    try {
      const client = new OpenAI({
        apiKey,
        baseURL,
        timeout: 2500,
        maxRetries: 0,
      });

      const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6).map((h) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        { role: 'user', content: query },
      ];

      const completion = await client.chat.completions.create({
        model: modelName,
        messages: chatMessages,
        temperature: 0.3,
        max_tokens: 1200,
      });

      const reply = completion.choices[0]?.message?.content?.trim();
      if (reply) {
        return {
          reply,
          provider: 'qwen',
          model: modelName,
          suggestions: [
            'Analisis pagu Semula-Menjadi & sisa anggaran PBI',
            'Bagaimana capaian target pendapatan RGA per unit?',
            'Cek keseimbangan Buku Besar GL & Neraca ISAK 335',
            'Apakah ada antrean approval atau panjar UMK aktif?',
          ],
        };
      }
    } catch (err: any) {
      console.warn(`[Qwen AI] Fallback to local engine due to API error: ${err.message}`);
    }
  }

  // Graceful local engine fallback (100% deterministic, offline-capable)
  const qLower = query.toLowerCase();
  let fallbackReply = '';
  const suggestions = [
    'Analisis pagu Semula-Menjadi & sisa anggaran PBI',
    'Bagaimana capaian target pendapatan RGA per unit?',
    'Cek keseimbangan Buku Besar GL & Neraca ISAK 335',
    'Cek dokumen di antrean approval & panjar kas kecil',
  ];

  if (
    qLower.includes('semula') ||
    qLower.includes('menjadi') ||
    qLower.includes('pergeseran') ||
    qLower.includes('pbi') ||
    qLower.includes('60 kolom') ||
    qLower.includes('revisi')
  ) {
    fallbackReply =
      `### 📑 Analisis Pagu PBI Semula-Menjadi & Pergeseran Anggaran (Qwen Copilot Engine)\n\n` +
      `Berikut status **Rencana Bisnis & Anggaran (Format PBI 60 Kolom)** untuk lingkup **${context.user.businessUnitName || 'Kantor Pusat PMO'}**:\n\n` +
      `- **Total Pagu Semula**: ${formatRupiah(totalSemula)}\n` +
      `- **Net Pergeseran / Revisi**: ${totalPergeseran >= 0 ? '+' : ''}${formatRupiah(totalPergeseran)}\n` +
      `- **Total Pagu Menjadi (Aktif)**: **${formatRupiah(totalMenjadi)}**\n` +
      `- **Komitmen Berjalan (PO/PR)**: ${formatRupiah(context.metrics.totalCommitted)}\n` +
      `- **Realisasi Aktual (Disbursed)**: ${formatRupiah(context.metrics.totalActualExpense)}\n` +
      `- **Sisa Saldo Bebas Tersedia**: **${formatRupiah(context.metrics.totalAvailable)}** (Serapan: ${context.metrics.serapanPercent}%)\n\n` +
      (context.budgets.length > 0
        ? `**Rincian Dokumen Anggaran Aktif:**\n` +
          context.budgets
            .slice(0, 5)
            .map(
              (b) =>
                `- **${b.unitCode || 'UNIT'}** (${b.title}): Pagu Menjadi ${formatRupiah(b.menjadi ?? b.allocated)} | Aktual ${formatRupiah(b.actual)}`
            )
            .join('\n') +
          `\n\n`
        : '') +
      `💡 *Langkah Berikutnya:* Anda dapat mengekspor tabel penuh **60 Kolom Standar PBI (.xlsx)** langsung dari modul **Anggaran & Revisi** tanpa ketik ulang.`;
  } else if (
    qLower.includes('rga') ||
    qLower.includes('target') ||
    qLower.includes('capaian') ||
    qLower.includes('sinkronisasi')
  ) {
    const rgaList = context.rgaUnits || [];
    fallbackReply =
      `### 📈 Evaluasi Target RGA & Capaian Pendapatan Unit Bisnis (Qwen Copilot Engine)\n\n` +
      `Berdasarkan sinkronisasi **Revenue Generation Activity (RGA)** dengan anggaran berjalan:\n\n` +
      `- **Total Target Pendapatan RGA**: **${formatRupiah(totalRgaTarget)}**\n` +
      `- **Realisasi Pendapatan Terbukukan**: **${formatRupiah(totalRealizedRev)}** (**${rgaAch}%** dari target)\n` +
      `- **Total Pagu Belanja Menjadi**: ${formatRupiah(totalMenjadi)}\n` +
      `- **Surplus / Margin Anggaran (Target - Pagu)**: ${formatRupiah(totalRgaTarget - totalMenjadi)}\n\n` +
      (rgaList.length > 0
        ? `**Capaian per Unit Bisnis:**\n` +
          rgaList
            .map(
              (u) =>
                `- **${u.unitCode} (${u.unitName})**: Target ${formatRupiah(u.targetRevenue)} | Realisasi ${formatRupiah(u.realizedRevenue)} (**${u.achievementPercent}%**)`
            )
            .join('\n') +
          `\n\n`
        : '') +
      `💡 *Rekomendasi:* Pastikan tagihan piutang pelanggan (${context.unpaidInvoices.length} invoice belum lunas) segera ditindaklanjuti untuk mendongkrak realisasi RGA.`;
  } else if (
    qLower.includes('isak') ||
    qLower.includes('335') ||
    qLower.includes('neraca') ||
    qLower.includes('buku besar') ||
    qLower.includes('gl') ||
    qLower.includes('jurnal') ||
    qLower.includes('storno') ||
    qLower.includes('pertor') ||
    qLower.includes('coa')
  ) {
    fallbackReply =
      `### ⚖️ Keseimbangan Buku Besar (GL) & Kepatuhan ISAK 335 / Pertor 310 (Qwen Copilot Engine)\n\n` +
      `Status integritas akuntansi *Double-Entry* pada Buku Besar saat ini:\n\n` +
      `- **Total Mutasi Debit (POSTED)**: **${formatRupiah(glDebit)}**\n` +
      `- **Total Mutasi Kredit (POSTED)**: **${formatRupiah(glCredit)}**\n` +
      `- **Status Trial Balance**: **${glBalanced ? '✅ SEIMBANG (BALANCED 100%)' : '⚠️ PERLU REKONSILIASI'}**\n` +
      `- **Standar Pelaporan**: ISAK 335 (Aset Neto Tanpa Pembatasan & Dengan Pembatasan) & 5 Level COA Pertor 310 (12 Digit)\n\n` +
      `💡 *Kepatuhan Audit:* Setiap jurnal yang telah berstatus \`POSTED\` dikunci secara permanen (*immutable*). Koreksi nilai hanya diizinkan melalui fitur **Jurnal Pembalik (Storno)** di modul Buku Besar.`;
  } else if (
    qLower.includes('kas kecil') ||
    qLower.includes('petty cash') ||
    qLower.includes('umk') ||
    qLower.includes('panjar') ||
    qLower.includes('gup') ||
    qLower.includes('tup') ||
    qLower.includes('spj')
  ) {
    const pcList = context.pettyCashSubmissions || [];
    fallbackReply =
      `### 💳 Status Kas Kecil (GUP / TUP Nihil) & Panjar UMK (Qwen Copilot Engine)\n\n` +
      `Tercatat **${context.metrics.activePettyCashCount ?? pcList.length} dokumen pengajuan Kas Kecil** pada lingkup aktif:\n\n` +
      (pcList.length > 0
        ? pcList
            .slice(0, 5)
            .map(
              (p) =>
                `- **${p.submissionNo}** [${p.type}] - ${p.activityDescription} (*${p.applicantName}*): **${formatRupiah(p.amount)}** [\`${p.status}\`]`
            )
            .join('\n') + `\n\n`
        : `- Belum ada pengajuan kas kecil baru pada periode ini.\n\n`) +
      `💡 *Aturan SLA 5 Hari Kerja:* Setiap pencairan Uang Muka Kerja (UMK) wajib dipertanggungjawabkan (SPJ) maksimal **5 hari kerja** agar akun pemohon tidak terkunci otomatis.`;
  } else if (
    qLower.includes('aset') ||
    qLower.includes('penyusutan') ||
    qLower.includes('depresiasi') ||
    qLower.includes('hris') ||
    qLower.includes('pegawai') ||
    qLower.includes('gaji') ||
    qLower.includes('cut-off') ||
    qLower.includes('cutoff')
  ) {
    fallbackReply =
      `### 🏢 Status Aset Tetap, SDM (HRIS) & Kepatuhan Cut-Off Bulanan (Qwen Copilot Engine)\n\n` +
      `- **Aset Tetap & Inventaris Aktif**: **${context.metrics.fixedAssetsCount ?? 0} unit** terdaftar (Metode Garis Lurus / *Straight-Line*)\n` +
      `- **Pegawai & Tenaga Ahli Aktif**: **${context.metrics.employeesCount ?? 0} personel** (PUT-PK, PKWT, Konsultan)\n` +
      `- **Aturan Cut-Off Aset (Tanggal 20)**: Perolehan aset pada/sebelum tanggal 20 disusutkan penuh bulan berjalan; di atas tanggal 20 mulai bulan berikutnya.\n` +
      `- **Aturan Cut-Off HRIS & Payroll (Tanggal 25)**: Absensi dan komponen gaji prorata dikunci otomatis setiap tanggal 25 pukul 23:59:59.\n\n` +
      `💡 *Catatan:* Kapitalisasi pemeliharaan aset berlaku otomatis apabila nilai perbaikan memenuhi ambang batas masa manfaat pada modul Aset & Inventaris.`;
  } else if (
    qLower.includes('anggaran') ||
    qLower.includes('plafon') ||
    qLower.includes('budget') ||
    qLower.includes('sisa') ||
    qLower.includes('serapan')
  ) {
    fallbackReply =
      `### 📊 Analisis Anggaran Terkini (Qwen Copilot Engine)\n\n` +
      `Berdasarkan data terkini sistem keuangan PMO UTama (${context.user.businessUnitName || 'Konsolidasi'}):\n\n` +
      `- **Pagu Semula PBI**: ${formatRupiah(totalSemula)} (Pergeseran: ${formatRupiah(totalPergeseran)})\n` +
      `- **Total Plafon Disetujui (Menjadi)**: ${formatRupiah(context.metrics.totalAllocated)}\n` +
      `- **Dana Dicadangkan (Committed)**: ${formatRupiah(context.metrics.totalCommitted)}\n` +
      `- **Realisasi Belanja Aktual (Expense)**: ${formatRupiah(context.metrics.totalActualExpense)}\n` +
      `- **Sisa Saldo Bebas**: **${formatRupiah(context.metrics.totalAvailable)}** (Serapan: ${context.metrics.serapanPercent}%)\n\n` +
      `💡 *Rekomendasi:* Pengajuan Purchase Request baru hanya boleh dilakukan jika nilainya di bawah sisa saldo bebas.`;
  } else if (
    qLower.includes('approval') ||
    qLower.includes('setuju') ||
    qLower.includes('antrean') ||
    qLower.includes('inbox')
  ) {
    fallbackReply =
      `### 📬 Antrean Dokumen Approval (Qwen Copilot Engine)\n\n` +
      (context.pendingApprovals.length === 0
        ? `Saat ini **tidak ada dokumen pending** yang menunggu persetujuan.`
        : `Terdapat **${context.pendingApprovals.length} permohonan** yang menunggu persetujuan wewenang:\n\n` +
          context.pendingApprovals
            .slice(0, 5)
            .map(
              (a, i) =>
                `${i + 1}. **${a.code}** - ${a.title} (Diajukan: *${a.requestedBy}*, Wewenang: \`${a.requiredRole}\`)`
            )
            .join('\n') +
          `\n\n💡 *Catatan:* Prinsip Pemisahan Tugas (*Separation of Duties*) mencegah persetujuan dokumen oleh pembuat sendiri.`);
  } else if (
    qLower.includes('expense') ||
    qLower.includes('reimburse') ||
    qLower.includes('biaya') ||
    qLower.includes('klaim') ||
    qLower.includes('nota')
  ) {
    const totalExp = context.recentExpenses.reduce((acc, e) => acc + e.amount, 0);
    fallbackReply =
      `### 🧾 Rekapitulasi Klaim Beban & Reimbursement (Qwen Copilot Engine)\n\n` +
      `Tercatat **${context.recentExpenses.length} transaksi pengeluaran** dengan akumulasi nilai **${formatRupiah(totalExp)}**.\n\n` +
      context.recentExpenses
        .slice(0, 4)
        .map(
          (e) =>
            `- **${e.docNumber}** - ${e.title} (${e.recipientName}): ${formatRupiah(e.amount)} [\`${e.status}\`]`
        )
        .join('\n') +
      `\n\n💡 *Alur Sesuai Standar PMO:* Staf input nota ➔ Manager approve ➔ Finance verifikasi pajak & cairkan via transfer bank.`;
  } else if (
    qLower.includes('pendapatan') ||
    qLower.includes('invoice') ||
    qLower.includes('kasir') ||
    qLower.includes('faktur') ||
    qLower.includes('piutang')
  ) {
    const totalUnpaid = context.unpaidInvoices.reduce((acc, i) => acc + i.amount, 0);
    fallbackReply =
      `### 💰 Status Loket Kasir, Piutang & Capaian Pendapatan (Qwen Copilot Engine)\n\n` +
      `- **Target Pendapatan RGA**: ${formatRupiah(totalRgaTarget)} (Realisasi: **${formatRupiah(totalRealizedRev)}** / **${rgaAch}%**)\n` +
      `- **Shift Kasir Aktif**: ${context.openCashierSessionsCount} register kasir aktif melayani pembayaran loket.\n` +
      `- **Piutang Belum Lunas**: ${context.unpaidInvoices.length} faktur bernilai total **${formatRupiah(totalUnpaid)}**.\n\n` +
      context.unpaidInvoices
        .slice(0, 3)
        .map(
          (inv) =>
            `- **${inv.docNumber}** (${inv.customerName}): ${formatRupiah(inv.amount)} [\`${inv.status}\`]`
        )
        .join('\n');
  } else {
    fallbackReply =
      `Halo **${context.user.fullName}**! Saya adalah **PMO Financial Copilot** untuk ERP PMO UTama (${context.user.businessUnitName || 'Konsolidasi'}).\n\n` +
      `Ringkasan eksekutif real-time basis data Anda saat ini:\n` +
      `- 📊 **Pagu PBI (Menjadi)**: ${formatRupiah(totalMenjadi)} | Sisa Bebas: **${formatRupiah(context.metrics.totalAvailable)}** (Serapan: ${context.metrics.serapanPercent}%)\n` +
      `- 📈 **Target RGA vs Realisasi**: ${formatRupiah(totalRgaTarget)} vs **${formatRupiah(totalRealizedRev)}** (${rgaAch}%)\n` +
      `- ⚖️ **Buku Besar GL (ISAK 335)**: Debit ${formatRupiah(glDebit)} / Kredit ${formatRupiah(glCredit)} (${glBalanced ? 'Seimbang' : 'Selisih'})\n` +
      `- 📬 **Approval & Operasional**: ${context.pendingApprovals.length} antrean approval, ${context.metrics.activePettyCashCount ?? 0} pengajuan kas kecil, ${context.openCashierSessionsCount} shift kasir aktif\n\n` +
      `Silakan ketik pertanyaan spesifik atau klik salah satu topik cepat di atas!`;
  }

  return {
    reply: fallbackReply,
    provider: 'local-engine',
    model: 'qwen-copilot-engine',
    suggestions,
  };
}
