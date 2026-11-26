<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const displayName = computed(() => {
  const full = auth.user?.fullName || 'Pengguna';
  return full.split(',')[0].trim();
});

const roleLabel = computed(() => auth.effectiveRoleName || 'Pengguna ERP');

function enterModule(domain: 'PENERIMAAN' | 'PENGELUARAN') {
  const allowed = domain === 'PENERIMAAN' ? auth.canAccessPenerimaan : auth.canAccessPengeluaran;
  if (!allowed) {
    auth.triggerAccessDenied(domain === 'PENERIMAAN' ? 'Modul Penerimaan' : 'Modul Pengeluaran');
    return;
  }
  auth.setWorkspace(domain);
  router.push('/dashboard');
}
</script>

<template>
  <div class="module-picker-page">
    <div class="picker-wrap">
      <header class="picker-head">
        <h1 class="picker-title">Pilih Modul Keuangan</h1>
        <p class="picker-sub">{{ displayName }} · {{ roleLabel }}</p>
      </header>

      <section class="picker-grid" aria-label="Pilihan Modul Utama">
        <!-- MODUL PENERIMAAN -->
        <button
          type="button"
          class="picker-card"
          :class="{ 'is-locked': !auth.canAccessPenerimaan }"
          @click="enterModule('PENERIMAAN')"
        >
          <div class="picker-card-top">
            <span class="picker-icon icon-penerimaan" aria-hidden="true">
              <svg v-if="auth.canAccessPenerimaan" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v12" />
                <path d="m8 11 4 4 4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span class="picker-badge" :class="auth.canAccessPenerimaan ? 'badge-ok' : 'badge-muted'">
              {{ auth.canAccessPenerimaan ? 'Aktif' : 'Terkunci' }}
            </span>
          </div>

          <h2 class="picker-name">Penerimaan</h2>
          <p class="picker-meta">Bank Mandiri · 4 Unit Bisnis (MICE, Klinik, ITS, TCI)</p>

          <span class="picker-action" :class="{ 'action-primary': auth.canAccessPenerimaan }">
            {{ auth.canAccessPenerimaan ? 'Masuk Penerimaan' : 'Akses Dibatasi' }}
          </span>
        </button>

        <!-- MODUL PENGELUARAN -->
        <button
          type="button"
          class="picker-card"
          :class="{ 'is-locked': !auth.canAccessPengeluaran }"
          @click="enterModule('PENGELUARAN')"
        >
          <div class="picker-card-top">
            <span class="picker-icon icon-pengeluaran" aria-hidden="true">
              <svg v-if="auth.canAccessPengeluaran" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 21V9" />
                <path d="m16 13-4-4-4 4" />
                <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
              </svg>
              <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span class="picker-badge" :class="auth.canAccessPengeluaran ? 'badge-ok' : 'badge-muted'">
              {{ auth.canAccessPengeluaran ? 'Aktif' : 'Terkunci' }}
            </span>
          </div>

          <h2 class="picker-name">Pengeluaran</h2>
          <p class="picker-meta">Bank BTN · Anggaran, Pengadaan, Kas Kecil &amp; Akuntansi</p>

          <span class="picker-action" :class="{ 'action-emerald': auth.canAccessPengeluaran }">
            {{ auth.canAccessPengeluaran ? 'Masuk Pengeluaran' : 'Akses Dibatasi' }}
          </span>
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.module-picker-page {
  min-height: calc(100dvh - 69px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 20px 48px;
  background: #f9fafb;
}

.picker-wrap {
  width: 100%;
  max-width: 740px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.picker-head {
  text-align: center;
}

.picker-title {
  margin: 0;
  font-size: clamp(1.35rem, 2.2vw, 1.65rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  color: #111827;
}

.picker-sub {
  margin: 6px 0 0;
  font-size: 14px;
  color: #6b7280;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.picker-card {
  width: 100%;
  text-align: left;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
  transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.picker-card:hover:not(.is-locked) {
  border-color: #034693;
  transform: translateY(-2px);
  box-shadow: 0 10px 24px -8px rgba(17, 24, 39, 0.12);
}

.picker-card.is-locked {
  opacity: 0.65;
  cursor: not-allowed;
}

.picker-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.picker-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
}

.icon-penerimaan {
  background: linear-gradient(135deg, #0b2144 0%, #034693 100%);
}

.icon-pengeluaran {
  background: linear-gradient(135deg, #22c55e 0%, #10b981 55%, #059669 100%);
}

.picker-card.is-locked .picker-icon {
  background: #9ca3af;
}

.picker-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.badge-ok {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.badge-muted {
  background: #f3f4f6;
  color: #6b7280;
}

.picker-name {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  color: #111827;
  letter-spacing: -0.02em;
}

.picker-meta {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: #6b7280;
  flex: 1;
}

.picker-action {
  margin-top: 12px;
  width: 100%;
  min-height: 42px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13.5px;
  font-weight: 500;
  background: #f3f4f6;
  color: #6b7280;
  transition: background 150ms ease, color 150ms ease;
}

.picker-action.action-primary {
  background: #034693;
  color: #ffffff;
}

.picker-card:hover:not(.is-locked) .picker-action.action-primary {
  background: #023470;
}

.picker-action.action-emerald {
  background: #10b981;
  color: #ffffff;
}

.picker-card:hover:not(.is-locked) .picker-action.action-emerald {
  background: #059669;
}

@media (max-width: 640px) {
  .module-picker-page {
    min-height: auto;
    padding: 20px 16px 36px;
  }
  .picker-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .picker-card {
    padding: 20px;
  }
  .picker-action {
    min-height: 44px;
  }
}
</style>
