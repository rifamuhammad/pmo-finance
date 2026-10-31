<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { apiFetch } from '../services/api';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

const inputQuery = ref('');
const loading = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const activeModel = ref('Ollama / Qwen');

const messages = ref<Message[]>([
  {
    id: 'm-init',
    role: 'assistant',
    content:
      'Halo! Saya **AI Financial Assistant (PMO Finance Copilot)**.\n\nSaya dapat menganalisis data keuangan, memantau sisa plafon divisi, mengecek antrean approval, dan mendeteksi anomali anggaran secara real-time.\n\nApa yang ingin Anda tanyakan hari ini?',
    time: formatTime(new Date()),
  },
]);

const suggestions = ref<string[]>([
  'Berapa sisa anggaran unit saya saat ini?',
  'Apakah ada antrean approval yang pending?',
  'Tampilkan rekap klaim biaya (expenses) terbaru',
  'Cek status piutang dan invoice pelanggan',
  'Periksa deteksi risiko dan anomali anggaran',
]);

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
      activeModel.value = res.data.model;
    }

    if (Array.isArray(res.data?.suggestions) && res.data.suggestions.length > 0) {
      suggestions.value = res.data.suggestions;
    }
  } catch (err: any) {
    messages.value.push({
      id: 'err-' + Date.now(),
      role: 'assistant',
      content: `⚠️ Terjadi kendala saat menghubungkan ke AI Assistant: ${err.message || 'Koneksi gagal'}`,
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
      content: 'Riwayat percakapan telah dibersihkan. Silakan ajukan pertanyaan baru seputar ERP PMO UTama!',
      time: formatTime(new Date()),
    },
  ];
  suggestions.value = [
    'Berapa sisa anggaran unit saya saat ini?',
    'Apakah ada antrean approval yang pending?',
    'Tampilkan rekap klaim biaya (expenses) terbaru',
    'Cek status piutang dan invoice pelanggan',
  ];
}
</script>

<template>
  <div v-if="isOpen" class="ai-overlay" @click.self="emit('close')">
    <div class="ai-drawer" role="dialog" aria-modal="true" aria-label="AI Assistant ERP PMO">
      <!-- Drawer Header -->
      <div class="ai-header">
        <div class="ai-header-brand">
          <div class="ai-spark-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <h3 class="ai-title">Qwen AI Copilot</h3>
              <span class="qwen-badge">{{ activeModel }}</span>
            </div>
            <span class="ai-subtitle">Local Ollama & ERP Advisor</span>
          </div>
        </div>

        <div class="ai-header-actions">
          <button type="button" class="btn btn-sm btn-ghost" title="Bersihkan Percakapan" @click="clearChat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button type="button" class="btn btn-sm btn-ghost" aria-label="Tutup" @click="emit('close')">
            ✕
          </button>
        </div>
      </div>

      <!-- Quick Context Chips -->
      <div class="ai-quick-chips">
        <button
          v-for="s in suggestions"
          :key="s"
          type="button"
          class="ai-chip"
          :disabled="loading"
          @click="sendQuery(s)"
        >
          {{ s }}
        </button>
      </div>

      <!-- Chat Stream Body -->
      <div ref="chatContainer" class="ai-body">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="ai-msg-row"
          :class="{ 'user-row': msg.role === 'user', 'ai-row': msg.role === 'assistant' }"
        >
          <div class="msg-bubble" :class="{ 'user-bubble': msg.role === 'user', 'ai-bubble': msg.role === 'assistant' }">
            <div class="msg-header-meta">
              <span class="sender-name">{{ msg.role === 'user' ? 'Anda' : 'PMO AI Copilot' }}</span>
              <span class="msg-time">{{ msg.time }}</span>
            </div>
            <div class="msg-content" style="white-space: pre-wrap; font-size: 0.88rem; line-height: 1.5;">{{ msg.content }}</div>
          </div>
        </div>

        <div v-if="loading" class="ai-msg-row ai-row">
          <div class="msg-bubble ai-bubble loading-bubble">
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
            <span style="font-size: 0.8rem; color: var(--text-secondary, #6b7280); margin-left: 6px;">Menganalisis basis data ERP...</span>
          </div>
        </div>
      </div>

      <!-- Input Bar -->
      <form class="ai-input-form" @submit.prevent="sendQuery()">
        <input
          v-model="inputQuery"
          type="text"
          class="ai-input"
          placeholder="Tanyakan analisis anggaran, klaim, atau approval..."
          :disabled="loading"
        />
        <button type="submit" class="btn btn-primary ai-send-btn" :disabled="!inputQuery.trim() || loading">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.ai-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  z-index: 1050;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.2s ease;
}

.ai-drawer {
  width: 100%;
  max-width: 460px;
  height: 100%;
  background: var(--bg-surface, #ffffff);
  border-left: 1px solid var(--border-color, #e2e8f0);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  animation: slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.ai-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-subtle, #f8fafc);
}

.ai-header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-spark-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f46e5, #06b6d4);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
}

.ai-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}

.qwen-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  background: #ede9fe;
  color: #6d28d9;
  border: 1px solid #ddd6fe;
}

.ai-subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary, #64748b);
}

.ai-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-quick-chips {
  padding: 10px 16px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  white-space: nowrap;
  background: var(--bg-subtle, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.ai-chip {
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 14px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: var(--bg-surface, #ffffff);
  color: var(--text-primary, #334155);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ai-chip:hover:not(:disabled) {
  border-color: #4f46e5;
  color: #4f46e5;
  background: #f5f3ff;
}

.ai-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg-canvas, #f8fafc);
}

.ai-msg-row {
  display: flex;
  width: 100%;
}

.user-row {
  justify-content: flex-end;
}

.ai-row {
  justify-content: flex-start;
}

.msg-bubble {
  max-width: 88%;
  padding: 12px 14px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.user-bubble {
  background: #4f46e5;
  color: #ffffff;
  border-bottom-right-radius: 2px;
}

.user-bubble .msg-header-meta {
  color: rgba(255, 255, 255, 0.75);
}

.ai-bubble {
  background: var(--bg-surface, #ffffff);
  color: var(--text-primary, #0f172a);
  border: 1px solid var(--border-color, #e2e8f0);
  border-bottom-left-radius: 2px;
}

.msg-header-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.7rem;
  margin-bottom: 6px;
  color: var(--text-muted, #94a3b8);
}

.sender-name {
  font-weight: 600;
}

.loading-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 14px;
}

.spinner-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4f46e5;
  animation: bounceDot 1.4s infinite ease-in-out both;
}

.spinner-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.spinner-dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounceDot {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.ai-input-form {
  padding: 14px 16px;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-surface, #ffffff);
  display: flex;
  gap: 8px;
}

.ai-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 8px;
  font-size: 0.88rem;
  outline: none;
  background: var(--bg-surface, #ffffff);
  color: var(--text-primary, #0f172a);
}

.ai-input:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15);
}

.ai-send-btn {
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideLeft {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
</style>
