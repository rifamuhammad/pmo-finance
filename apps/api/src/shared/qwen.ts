import OpenAI from 'openai';

export interface QwenFinancialContext {
  user: {
    fullName: string;
    roleCode: string;
    roleName?: string;
    businessUnitId?: string | null;
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
  const modelName = process.env.QWEN_MODEL?.trim() || (isOllama ? 'qwen2.5:7b' : 'qwen-plus');

  const { query, history = [], context } = params;

  // Prepare system prompt with injected real-time ERP financial facts
  const systemPrompt = `Anda adalah Qwen AI Financial Copilot untuk sistem ERP Keuangan & Operasional PMO UTama.
Tugas Anda adalah membantu pimpinan dan staf keuangan (Unit Manager, GM PMO, Finance Manager, Kasir, Auditor) dalam menganalisis data, memberikan rekomendasi keputusan anggaran, serta memverifikasi kepatuhan transaksi.

DATA REAL-TIME BASIS DATA ERP PMO UTAMA SAAT INI:
- Pengguna: ${context.user.fullName} (Peran: ${context.user.roleCode})
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

PRINSIP TATA KELOLA KEUANGAN ERP PMO:
1. Pemisahan Tugas (Separation of Duties): Pembuat dokumen anggaran atau PR dilarang menyetujui dokumennya sendiri.
2. 3-Way Matching: Pembayaran tagihan vendor harus mencocokkan PO, Goods Receipt fisik, dan Faktur.
3. Kontrol Plafon: Tidak boleh ada pengeluaran yang melebihi plafon tanpa revisi anggaran resmi.

INSTRUKSI JAWABAN:
- Jawab secara profesional, lugas, santun dalam Bahasa Indonesia.
- Selalu sebutkan angka dan nominal dalam format Rupiah (contoh: Rp 50.000.000).
- Gunakan format Markdown yang rapi dengan bullet point dan penekanan tebal.
- Berikan saran tindak lanjut operasional yang konkret.`;

  // If QWEN_API_KEY is configured, call Qwen via OpenAI SDK
  if (apiKey) {
    try {
      const client = new OpenAI({
        apiKey,
        baseURL,
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
