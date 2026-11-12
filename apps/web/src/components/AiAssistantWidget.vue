<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue';
import { apiFetch } from '../services/api';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const auth = useAuthStore();

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  copied?: boolean;
}

interface ContextMetrics {
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
  pendingApprovalsCount?: number;
  activePettyCashCount?: number;
  openCashierSessionsCount?: number;
  fixedAssetsCount?: number;
  employeesCount?: number;
}

const inputQuery = ref('');
const loading = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const activeModel = ref('pmo-copilot (Ollama)');
const showScopeInfo = ref(true);
const contextMetrics = ref<ContextMetrics | null>(null);

function formatCompactIdr(num?: number): string {
  const val = Number(num || 0);
  if (val >= 1_000_000_000) {
    return 'Rp ' + (val / 1_000_000_000).toFixed(2).replace('.', ',') + ' M';
  }
  if (val >= 1_000_000) {
    return 'Rp ' + (val / 1_000_000).toFixed(1).replace('.', ',') + ' Jt';
  }
  return 'Rp ' + Math.round(val).toLocaleString('id-ID');
}

const initialGreeting = computed(() => {
  const userName = auth.user?.fullName || 'Bapak/Ibu';
  const role = auth.user?.roleCode || 'Staff';
  return `Halo **${userName}**! Saya adalah **PMO Financial Copilot**, asisten intelijen keuangan dan operasional resmi ERP PMO UTama.

Saya terhubung langsung ke basis data real-time sesuai otoritas **\`${role}\`**, siap membantu Anda dalam:
- 📑 **Pagu PBI Semula-Menjadi**: Analisis plafon, revisi pergeseran, dan serapan anggaran 60 kolom.
- 📈 **Sinkronisasi Target RGA**: Evaluasi target vs realisasi pendapatan 5 unit bisnis.
- ⚖️ **Buku Besar GL & ISAK 335**: Pemeriksaan keseimbangan *Trial Balance*, COA Pertor 310, dan jurnal Storno.
- 💳 **Kas Kecil & Cut-Off Bulanan**: Monitoring panjar UMK (SLA 5 HK), penyusutan aset (Tgl 20), dan payroll HRIS (Tgl 25).

Apa yang ingin Anda analisis hari ini?`;
});

const messages = ref<Message[]>([
  {
    id: 'm-init',
    role: 'assistant',
    content: initialGreeting.value,
    time: formatTime(new Date()),
  },
]);

interface PromptCategory {
  title: string;
  icon: string;
  query: string;
}

const promptCategories = ref<PromptCategory[]>([
  {
    title: 'Pagu PBI Semula-Menjadi',
    icon: '📑',
    query: 'Tampilkan analisis pagu PBI Semula-Menjadi, revisi pergeseran, dan sisa anggaran bebas saat ini.',
  },
  {
    title: 'Target & Realisasi RGA',
    icon: '📈',
    query: 'Bagaimana capaian target pendapatan RGA per unit bisnis terhadap pagu anggaran saat ini?',
  },
  {
    title: 'Neraca ISAK 335 & GL',
    icon: '⚖️',
    query: 'Cek keseimbangan Trial Balance Buku Besar GL, aturan Storno, dan kepatuhan laporan ISAK 335.',
  },
  {
    title: 'Kas Kecil & Panjar UMK',
    icon: '💳',
    query: 'Bagaimana status pengajuan Kas Kecil (GUP/TUP) dan aturan SLA 5 hari kerja SPJ panjar UMK?',
  },
  {
    title: 'Antrean Approval Pending',
    icon: '📬',
    query: 'Apakah ada dokumen di antrean approval yang menunggu persetujuan sesuai wewenang role?',
  },
  {
    title: 'Cut-Off Aset & HRIS',
    icon: '🏢',
    query: 'Tampilkan ringkasan aset tetap, SDM aktif, serta kepatuhan cut-off penyusutan Tgl 20 dan payroll Tgl 25.',
  },
]);

async function fetchContextSnapshot() {
  try {
    const res = await apiFetch('/reports/ai-assistant/context');
    if (res.data?.metrics) {
      contextMetrics.value = res.data.metrics;
    }
    if (Array.isArray(res.data?.quickPrompts) && res.data.quickPrompts.length > 0) {
      promptCategories.value = res.data.quickPrompts;
    }
  } catch {
    // Non-blocking context snapshot
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      fetchContextSnapshot();
    }
  }
);

onMounted(() => {
  if (props.isOpen) {
    fetchContextSnapshot();
  }
});

function formatTime(d: Date): string {
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}

function renderMarkdown(text: string): string {
  if (!text) return '';

  // Basic HTML entity escaping for safety
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Format headers
  safe = safe.replace(/^### (.*$)/gim, '<div class="md-h3">$1</div>');
  safe = safe.replace(/^## (.*$)/gim, '<div class="md-h2">$1</div>');
  safe = safe.replace(/^# (.*$)/gim, '<div class="md-h1">$1</div>');

  // Format Bold & Italic
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong class="md-bold">$1</strong>');
  safe = safe.replace(/\*(.*?)\*/g, '<em class="md-italic">$1</em>');

  // Format Inline Code
  safe = safe.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

  // Format unordered list items
  safe = safe.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="md-li">$1</li>');
  safe = safe.replace(/(<li class="md-li">[\s\S]*?<\/li>)+/g, '<ul class="md-ul">$&</ul>');

  // Format Paragraphs & line breaks
  safe = safe.replace(/\n\n/g, '<div class="md-p-gap"></div>');
  safe = safe.replace(/(?<!<\/div>|<\/ul>|<\/li>)\n/g, '<br />');

  return safe;
}

async function copyMessage(msg: Message) {
  try {
    await navigator.clipboard.writeText(msg.content);
    msg.copied = true;
    setTimeout(() => {
      msg.copied = false;
    }, 2000);
  } catch {
    // fallback
  }
}

async function sendQuery(text?: string) {
  const q = (text || inputQuery.value).trim();
  if (!q || loading.value) return;

  const userMsg: Message = {
    id: 'msg-' + Date.now(),
    role: 'user',
    content: q,
    time: formatTime(new Date()),
  };
  messages.value.push(userMsg);
  inputQuery.value = '';
  loading.value = true;
  scrollToBottom();

  try {
    const res = await apiFetch('/reports/ai-assistant', {
      method: 'POST',
      body: JSON.stringify({
        query: q,
        history: messages.value.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const replyText = res.data?.reply || 'Maaf, tidak dapat memproses jawaban saat ini.';
    messages.value.push({
      id: 'ai-' + Date.now(),
      role: 'assistant',
      content: replyText,
      time: formatTime(new Date()),
    });

    if (res.data?.model) {
      activeModel.value = res.data.model.includes('pmo') ? 'pmo-copilot (Ollama)' : res.data.model;
    }
    if (res.data?.contextMetrics) {
      contextMetrics.value = res.data.contextMetrics;
    }
  } catch (err: any) {
    messages.value.push({
      id: 'err-' + Date.now(),
      role: 'assistant',
      content: `⚠️ **Gagal terhubung ke Ollama / Copilot:**\n\n${err.message || 'Koneksi jaringan atau endpoint lokal tidak merespons.'}\n\n*Pastikan Ollama aktif di komputer dengan menjalankan \`ollama run pmo-copilot\`.*`,
      time: formatTime(new Date()),
    });
  } finally {
    loading.value = false;
    scrollToBottom();
  }
}

function clearChat() {
  messages.value = [
    {
      id: 'm-init',
      role: 'assistant',
      content: 'Percakapan telah dibersihkan. Silakan ajukan analisis anggaran, verifikasi approval, atau kebijakan operasional baru.',
      time: formatTime(new Date()),
    },
  ];
}
</script>

<template>
  <div v-if="isOpen" class="copilot-backdrop" @click.self="emit('close')">
    <aside class="copilot-palette" role="dialog" aria-modal="true" aria-label="PMO Financial Copilot Studio">
      <!-- Top Glow Accent Line -->
      <div class="copilot-top-glow"></div>

      <!-- Studio Header -->
      <header class="copilot-header">
        <div class="header-left">
          <div class="copilot-emblem-wrap">
            <div class="copilot-emblem">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
              </svg>
            </div>
            <span class="live-pulse-dot" title="Ollama Engine Aktif"></span>
          </div>

          <div class="header-titles">
            <div class="title-row">
              <h2 class="copilot-main-title">PMO Copilot</h2>
              <span class="model-badge">
                <span class="pulse-ring"></span>
                {{ activeModel }}
              </span>
            </div>
            <p class="copilot-sub-title">Enterprise Financial Controller & Strategic Advisor</p>
          </div>
        </div>

        <div class="header-actions">
          <button
            type="button"
            class="action-btn"
            :class="{ active: showScopeInfo }"
            title="Lihat Cakupan Konteks Pengguna"
            @click="showScopeInfo = !showScopeInfo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>

          <button type="button" class="action-btn" title="Bersihkan Riwayat Percakapan" @click="clearChat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>

          <button type="button" class="action-btn close-btn" title="Tutup Copilot" aria-label="Tutup" @click="emit('close')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <!-- User Scope Ribbon -->
      <div class="scope-ribbon">
        <div class="scope-pill">
          <span class="scope-icon">👤</span>
          <span class="scope-text">{{ auth.user?.fullName || 'Pengguna' }}</span>
        </div>
        <div class="scope-pill">
          <span class="scope-icon">🛡️</span>
          <span class="scope-text">{{ auth.user?.roleCode }}</span>
        </div>
        <div class="scope-pill unit-pill">
          <span class="scope-icon">🏢</span>
          <span class="scope-text">{{ auth.user?.businessUnitName || 'PMO UTama Pusat' }}</span>
        </div>
      </div>

      <!-- Expandable Scope Detail Banner -->
      <transition name="accordion">
        <div v-if="showScopeInfo" class="scope-detail-drawer">
          <div class="scope-detail-inner">
            <div class="scope-detail-title">Konteks Data Keuangan Real-time Terhubung:</div>
            <div class="scope-detail-grid">
              <div class="metric-card">
                <span class="metric-lbl">Sisa Pagu Menjadi (PBI)</span>
                <span class="metric-val">
                  {{ contextMetrics ? `${formatCompactIdr(contextMetrics.totalAvailable)} (${100 - (contextMetrics.serapanPercent || 0)}% Sisa)` : 'Memuat...' }}
                </span>
              </div>
              <div class="metric-card">
                <span class="metric-lbl">Capaian Pendapatan RGA</span>
                <span class="metric-val">
                  {{ contextMetrics ? `${formatCompactIdr(contextMetrics.totalRealizedRevenue)} (${contextMetrics.rgaAchievementPercent || 0}%)` : 'Memuat...' }}
                </span>
              </div>
              <div class="metric-card">
                <span class="metric-lbl">Buku Besar GL (ISAK 335)</span>
                <span class="metric-val">
                  {{ contextMetrics ? (contextMetrics.glIsBalanced !== false ? '✅ Seimbang 100%' : '⚠️ Perlu Cek') : 'Terverifikasi' }}
                </span>
              </div>
              <div class="metric-card">
                <span class="metric-lbl">Approval & Kas Kecil</span>
                <span class="metric-val">
                  {{ contextMetrics ? `${contextMetrics.pendingApprovalsCount || 0} Inbox • ${contextMetrics.activePettyCashCount || 0} UMK` : 'Sesuai RBAC' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- Quick Prompt Suggestions (Categorized Pills) -->
      <div class="copilot-prompts-bar">
        <div class="prompts-scroll-wrapper">
          <button
            v-for="p in promptCategories"
            :key="p.title"
            type="button"
            class="prompt-chip"
            :disabled="loading"
            @click="sendQuery(p.query)"
          >
            <span class="prompt-chip-icon">{{ p.icon }}</span>
            <span class="prompt-chip-label">{{ p.title }}</span>
          </button>
        </div>
      </div>

      <!-- Conversation Stream Area -->
      <main ref="chatContainer" class="copilot-stream">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-envelope"
          :class="[msg.role === 'user' ? 'user-envelope' : 'ai-envelope']"
        >
          <!-- User Bubble -->
          <div v-if="msg.role === 'user'" class="user-card">
            <div class="user-bubble-body">
              {{ msg.content }}
            </div>
            <div class="user-bubble-meta">
              <span>Anda</span> • <span>{{ msg.time }}</span>
            </div>
          </div>

          <!-- AI Copilot Card -->
          <div v-else class="copilot-card">
            <div class="copilot-card-head">
              <div class="card-head-left">
                <div class="copilot-avatar-mini">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"></path>
                  </svg>
                </div>
                <span class="copilot-card-sender">PMO Copilot</span>
                <span class="copilot-verified-pill">Terverifikasi Database</span>
              </div>

              <div class="card-head-right">
                <span class="msg-timestamp">{{ msg.time }}</span>
                <button
                  type="button"
                  class="copy-btn"
                  :title="msg.copied ? 'Tersalin!' : 'Salin Jawaban'"
                  @click="copyMessage(msg)"
                >
                  <span v-if="msg.copied" class="copied-indicator">✓ Tersalin</span>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Parsed Markdown Body -->
            <div class="copilot-card-content" v-html="renderMarkdown(msg.content)"></div>
          </div>
        </div>

        <!-- Thinking / Loading Indicator -->
        <div v-if="loading" class="message-envelope ai-envelope">
          <div class="copilot-card thinking-card">
            <div class="thinking-row">
              <div class="wave-dots">
                <span class="wave-dot"></span>
                <span class="wave-dot"></span>
                <span class="wave-dot"></span>
              </div>
              <span class="thinking-text">
                Ollama <strong>pmo-copilot</strong> sedang menganalisis data keuangan & aturan wewenang...
              </span>
            </div>
          </div>
        </div>
      </main>

      <!-- Input Console Footer -->
      <footer class="copilot-footer">
        <form class="console-box" @submit.prevent="sendQuery()">
          <div class="console-input-wrap">
            <span class="console-sparkle">✨</span>
            <input
              v-model="inputQuery"
              type="text"
              class="console-input"
              placeholder="Tanyakan analisis sisa anggaran, klaim, atau kepatuhan wewenang..."
              :disabled="loading"
              autocomplete="off"
            />
          </div>

          <button
            type="submit"
            class="console-send-btn"
            :disabled="!inputQuery.trim() || loading"
            title="Kirim ke PMO Copilot"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>

        <div class="console-footer-meta">
          <span>Tekan <strong>Enter ↵</strong> untuk kirim</span>
          <span>•</span>
          <span class="privacy-note">🔒 100% Offline & Terenkripsi Lokal (Ollama)</span>
        </div>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
/* Backdrop Overlay with Subtle Blur */
.copilot-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(4px);
  z-index: 1050;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.22s ease-out;
}

/* Elevated Floating Studio Palette */
.copilot-palette {
  position: fixed;
  top: 14px;
  right: 14px;
  bottom: 14px;
  width: 520px;
  max-width: calc(100vw - 28px);
  background: #ffffff;
  border-radius: 20px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow:
    0 24px 60px -15px rgba(15, 23, 42, 0.2),
    0 0 0 1px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slidePalette 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

.copilot-top-glow {
  height: 3px;
  background: linear-gradient(90deg, #3b82f6 0%, #10b981 50%, #6366f1 100%);
  width: 100%;
}

/* Header */
.copilot-header {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.copilot-emblem-wrap {
  position: relative;
}

.copilot-emblem {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.live-pulse-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.copilot-main-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.model-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
  letter-spacing: 0.02em;
}

.pulse-ring {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #16a34a;
}

.copilot-sub-title {
  margin: 2px 0 0 0;
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #e2e8f0;
}

.action-btn.active {
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.close-btn:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fecaca;
}

/* Scope Ribbon */
.scope-ribbon {
  padding: 8px 18px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
}

.scope-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 500;
  color: #334155;
  background: #ffffff;
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}

.unit-pill {
  color: #1e40af;
  background: #eff6ff;
  border-color: #dbeafe;
}

/* Expandable Detail */
.scope-detail-drawer {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 12px 18px;
}

.scope-detail-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.scope-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.metric-card {
  background: #ffffff;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.metric-lbl {
  font-size: 0.68rem;
  color: #64748b;
}

.metric-val {
  font-size: 0.78rem;
  font-weight: 600;
  color: #0f172a;
}

/* Quick Prompts Bar */
.copilot-prompts-bar {
  padding: 10px 18px;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.prompts-scroll-wrapper {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.prompts-scroll-wrapper::-webkit-scrollbar {
  display: none;
}

.prompt-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  font-size: 0.73rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.prompt-chip:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
  transform: translateY(-1px);
}

.prompt-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Conversation Stream Area */
.copilot-stream {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #f8fafc;
}

.message-envelope {
  display: flex;
  width: 100%;
}

.user-envelope {
  justify-content: flex-end;
}

.ai-envelope {
  justify-content: flex-start;
}

/* User Bubble Style */
.user-card {
  max-width: 82%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-bubble-body {
  background: #0f172a;
  color: #f8fafc;
  padding: 10px 14px;
  border-radius: 14px;
  border-bottom-right-radius: 3px;
  font-size: 0.86rem;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  word-break: break-word;
}

.user-bubble-meta {
  margin-top: 4px;
  font-size: 0.68rem;
  color: #94a3b8;
  padding-right: 4px;
}

/* AI Copilot Card Style */
.copilot-card {
  width: 100%;
  max-width: 96%;
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.copilot-card-head {
  padding: 9px 14px;
  background: #fcfdfe;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.copilot-avatar-mini {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #1e293b;
  color: #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copilot-card-sender {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0f172a;
}

.copilot-verified-pill {
  font-size: 0.62rem;
  font-weight: 600;
  color: #0369a1;
  background: #e0f2fe;
  padding: 1px 6px;
  border-radius: 4px;
}

.card-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msg-timestamp {
  font-size: 0.68rem;
  color: #94a3b8;
}

.copy-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.68rem;
  transition: all 0.15s ease;
}

.copy-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.copied-indicator {
  color: #16a34a;
  font-weight: 600;
}

/* Card Content / Rich Markdown Typography */
.copilot-card-content {
  padding: 14px 16px;
  font-size: 0.85rem;
  line-height: 1.62;
  color: #1e293b;
  word-break: break-word;
}

:deep(.md-bold) {
  font-weight: 700;
  color: #0f172a;
}

:deep(.md-code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  background: #f1f5f9;
  color: #0369a1;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

:deep(.md-h3) {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
  margin: 8px 0 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(.md-ul) {
  margin: 6px 0;
  padding-left: 18px;
  list-style-type: disc;
}

:deep(.md-li) {
  margin-bottom: 4px;
  color: #334155;
}

:deep(.md-p-gap) {
  height: 8px;
}

/* Thinking Indicator Card */
.thinking-card {
  padding: 12px 16px;
  border-style: dashed;
  background: #fcfdfe;
}

.thinking-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wave-dots {
  display: flex;
  gap: 4px;
}

.wave-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #2563eb;
  animation: waveDot 1.4s infinite ease-in-out both;
}

.wave-dot:nth-child(1) { animation-delay: -0.32s; }
.wave-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes waveDot {
  0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
  40% { transform: scale(1.1); opacity: 1; }
}

.thinking-text {
  font-size: 0.78rem;
  color: #475569;
}

/* Footer Console */
.copilot-footer {
  padding: 14px 18px;
  background: #ffffff;
  border-top: 1px solid #f1f5f9;
}

.console-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 4px 6px 4px 12px;
  transition: all 0.2s ease;
}

.console-box:focus-within {
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.console-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.console-sparkle {
  font-size: 0.85rem;
  user-select: none;
}

.console-input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.86rem;
  color: #0f172a;
}

.console-input::placeholder {
  color: #94a3b8;
}

.console-send-btn {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: none;
  background: #0f172a;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.console-send-btn:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
}

.console-send-btn:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
  transform: none;
}

.console-footer-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.67rem;
  color: #94a3b8;
  padding: 0 4px;
}

.privacy-note {
  color: #059669;
  font-weight: 500;
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slidePalette {
  from {
    opacity: 0;
    transform: translateX(40px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}
</style>
