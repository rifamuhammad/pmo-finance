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
  };
  budgets: Array<{
    title: string;
    unitCode?: string;
    unitName?: string;
    allocated: number;
    committed: number;
    actual: number;
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

  // Prepare system prompt with injected real-time ERP financial facts & onboarding guides
  const systemPrompt = `Anda adalah PMO Copilot, asisten kecerdasan finansial, operasional, dan pemandu navigasi resmi untuk ERP PMO UTama.
PMO UTama adalah unit bisnis pengelola komersial di bawah naungan PTNBH Universitas Terbuka (UT).
Peran Anda adalah sebagai Senior Enterprise Advisor sekaligus Onboarding Mentor yang ramah, sangat cerdas, sistematis, dan sabar membimbing baik pimpinan maupun staf baru dalam memahami dan mengoperasikan sistem ERP PMO UTama.

STRUKTUR ORGANISASI & 4 DIVISI BISNIS PMO UTAMA (PTNBH UT):
1. General Manager (GM_PMO): Pimpinan eksekutif tertinggi PMO UTama. Menyetujui anggaran tahunan, revisi belanja unit, PR skala besar (> Rp 25 Juta), dan mengarahkan strategi bisnis.
2. 4 Divisi Bisnis (UNIT_MANAGER per divisi):
   - Divisi IT Solution: Lisensi software ERP, integrasi sistem, dan cloud managed services.
   - Divisi MICE (Meeting, Incentive, Convention, Exhibition): Wisma penginapan, sewa Ballroom pertemuan, dan banquet katering event.
   - Divisi TCI (Training, Certification & Innovation): Sertifikasi profesi, workshop eksekutif, dan diklat digital.
   - Divisi Klinik Pratama: MCU korporat, poli umum medis, dan instalasi farmasi.
   (Para Manager Unit bertugas mengajukan usulan RAB, belanja proyek unit / PR, dan mengejar target pendapatan).
3. Finance Manager (FINANCE_MANAGER): Penanggung jawab likuiditas kas & bank, pencairan belanja (< Rp 25 Juta), 3-way matching faktur vendor, perpajakan, dan laporan akuntansi PSAK.
4. Auditor Internal / SPI (AUDITOR): Satuan Pengawas Internal (SPI) PTNBH Universitas Terbuka yang mengawasi kepatuhan tata kelola, transparansi keuangan, realisasi anggaran, dan perkembangan bisnis PMO UTama secara independen (Read-Only).
5. Super Admin (SUPER_ADMIN): Pengelola sistem dan hak akses terpusat.
6. Kantor Pusat PMO: Cost center perbendaharaan, modal kerja RKAP, akuntansi, dan kebijakan pengadaan terpusat.

DATA REAL-TIME BASIS DATA ERP PMO UTAMA SAAT INI:
- Pengguna Aktif: ${context.user.fullName} (Peran: ${context.user.roleCode}, Unit: ${context.user.businessUnitName || 'Kantor Pusat PMO'})
- Total Plafon Anggaran Disetujui: ${formatRupiah(context.metrics.totalAllocated)}
- Dana Dicadangkan (Committed / PO Berjalan): ${formatRupiah(context.metrics.totalCommitted)}
- Realisasi Belanja Beban Aktual (Expense): ${formatRupiah(context.metrics.totalActualExpense)}
- Sisa Saldo Bebas Anggaran: ${formatRupiah(context.metrics.totalAvailable)} (Tingkat Serapan: ${context.metrics.serapanPercent}%)
- Antrean Dokumen Pending Approval: ${context.pendingApprovals.length} berkas
${context.pendingApprovals.map((a, i) => `  ${i + 1}. [${a.code}] ${a.title} - Pemohon: ${a.requestedBy} (Wewenang: ${a.requiredRole})`).join('\n')}
- Rekapitulasi Klaim Biaya (Expenses) Terkini: ${context.recentExpenses.length} transaksi
${context.recentExpenses.map((e, i) => `  ${i + 1}. [${e.docNumber}] ${e.title} - ${e.recipientName}: ${formatRupiah(e.amount)} (${e.status})`).join('\n')}
- Faktur Penjualan Belum Tertagih (Piutang): ${context.unpaidInvoices.length} faktur
${context.unpaidInvoices.map((inv, i) => `  ${i + 1}. [${inv.docNumber}] ${inv.customerName}: ${formatRupiah(inv.amount)} (${inv.status})`).join('\n')}
- Register Kasir Sedang Buka (Open Sessions): ${context.openCashierSessionsCount} register loket aktif.

PANDUAN ALUR SISTEM UNTUK PENGGUNA BARU:
- Pengadaan Barang/Jasa: Buat PR di menu Pengadaan ➔ Tunggu minimal 3 penawaran vendor ➔ Approval (Finance Manager jika < Rp 25 Juta, GM PMO jika >= Rp 25 Juta) ➔ Terbitkan PO ➔ Terima barang & terbitkan BAST (Goods Receipt) ➔ Catat Faktur Vendor ➔ Bayar (3-Way Matching).
- Klaim Biaya/Expense: Staf upload nota klaim ➔ Manager approve ➔ Finance cairkan via transfer bank.
- Kasir Loket: Buka shift harian ➔ Input penerimaan tunai/EDC/QRIS ➔ Cetak kuitansi ➔ Closeout shift fisik vs sistem (selisih > Rp 50.000 wajib approval Finance) ➔ Setor kas ke bank.
- Anggaran: Diajukan per unit ➔ Review Finance ➔ Disahkan GM PMO. Jika saldo habis, ajukan Revisi Anggaran.

ENAM PRINSIP TATA KELOLA KEUANGAN (GOLDEN RULES):
1. Separation of Duties: Pembuat dokumen DILARANG menyetujui dokumen buatannya sendiri.
2. Batas Approval PR: PR < Rp 25 Juta oleh Finance Manager; PR >= Rp 25 Juta wajib ke GM PMO.
3. Kuota Komparasi Vendor: Wajib minimal 3 penawaran vendor (Vendor Quotation) sebelum PO terbit.
4. 3-Way Matching: Validasi PO + BAST Fisik + Faktur Vendor sebelum pembayaran.
5. Toleransi Kasir: Selisih kas fisik > Rp 50.000 wajib ditinjau Finance Manager.
6. Kontrol Plafon Anggaran: Belanja dilarang melebihi sisa plafon aktif.

GAYA JAWABAN:
- Profesional, santun, runtut, dan mudah dipahami staf baru.
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
            'Berapa sisa plafon anggaran unit saya saat ini?',
            'Apakah ada antrean approval yang perlu disetujui?',
            'Tampilkan rekap klaim biaya operasional staf',
            'Bagaimana status kasir dan piutang pelanggan?',
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
  let suggestions = [
    'Berapa sisa anggaran divisi saya saat ini?',
    'Cek dokumen di antrean approval',
    'Tampilkan rekap klaim reimbursement',
    'Cek status kasir dan piutang',
  ];

  if (
    qLower.includes('anggaran') ||
    qLower.includes('plafon') ||
    qLower.includes('budget') ||
    qLower.includes('sisa') ||
    qLower.includes('serapan')
  ) {
    fallbackReply = `### 📊 Analisis Anggaran Terkini (Qwen Copilot Engine)\n\n` +
      `Berdasarkan data terkini sistem keuangan PMO UTama:\n\n` +
      `- **Total Plafon Disetujui**: ${formatRupiah(context.metrics.totalAllocated)}\n` +
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
    fallbackReply = `### 📬 Antrean Dokumen Approval (Qwen Copilot Engine)\n\n` +
      (context.pendingApprovals.length === 0
        ? `Saat ini **tidak ada dokumen pending** yang menunggu persetujuan.`
        : `Terdapat **${context.pendingApprovals.length} permohonan** yang menunggu persetujuan wewenang:\n\n` +
        context.pendingApprovals
          .slice(0, 5)
          .map((a, i) => `${i + 1}. **${a.code}** - ${a.title} (Diajukan: *${a.requestedBy}*, Wewenang: \`${a.requiredRole}\`)`)
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
    fallbackReply = `### 🧾 Rekapitulasi Klaim Beban & Reimbursement (Qwen Copilot Engine)\n\n` +
      `Tercatat **${context.recentExpenses.length} transaksi pengeluaran** dengan akumulasi nilai **${formatRupiah(totalExp)}**.\n\n` +
      context.recentExpenses
        .slice(0, 4)
        .map((e) => `- **${e.docNumber}** - ${e.title} (${e.recipientName}): ${formatRupiah(e.amount)} [\`${e.status}\`]`)
        .join('\n') +
      `\n\n💡 *Alur Sesuai Odoo Expenses:* Staf input nota ➔ Manager approve ➔ Finance cairkan via transfer bank.`;
  } else if (
    qLower.includes('pendapatan') ||
    qLower.includes('invoice') ||
    qLower.includes('kasir') ||
    qLower.includes('faktur') ||
    qLower.includes('piutang')
  ) {
    const totalUnpaid = context.unpaidInvoices.reduce((acc, i) => acc + i.amount, 0);
    fallbackReply = `### 💰 Status Loket Kasir & Piutang Pelanggan (Qwen Copilot Engine)\n\n` +
      `- **Shift Kasir Aktif**: ${context.openCashierSessionsCount} register kasir aktif melayani pembayaran loket.\n` +
      `- **Piutang Belum Lunas**: ${context.unpaidInvoices.length} faktur bernilai total **${formatRupiah(totalUnpaid)}**.\n\n` +
      context.unpaidInvoices
        .slice(0, 3)
        .map((inv) => `- **${inv.docNumber}** (${inv.customerName}): ${formatRupiah(inv.amount)} [\`${inv.status}\`]`)
        .join('\n');
  } else {
    fallbackReply = `Halo **${context.user.fullName}**! Saya adalah **Qwen AI Financial Copilot** untuk ERP PMO UTama.\n\n` +
      `Saya siap membantu Anda memantau:\n` +
      `- 📊 **Anggaran & Plafon**: Sisa dana ${formatRupiah(context.metrics.totalAvailable)} (Serapan: ${context.metrics.serapanPercent}%)\n` +
      `- 📬 **Approval Inbox**: ${context.pendingApprovals.length} dokumen menunggu keputusan\n` +
      `- 🧾 **Klaim Expenses**: ${context.recentExpenses.length} transaksi pengeluaran operasional\n` +
      `- 💰 **Kasir & Piutang**: ${context.openCashierSessionsCount} shift kasir aktif, ${context.unpaidInvoices.length} invoice belum lunas\n\n` +
      `Ketik pertanyaan Anda atau pilih pintasan topik di bawah!`;
  }

  return {
    reply: fallbackReply,
    provider: 'local-engine',
    model: 'qwen-copilot-engine',
    suggestions,
  };
}
