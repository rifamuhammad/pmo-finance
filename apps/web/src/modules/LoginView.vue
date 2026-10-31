<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import logoPmoEmblem from '../assets/logo-pmo-emblem.png';

const auth = useAuthStore();
const router = useRouter();

// Default kredensial (terisi otomatis di balik layar untuk kemudahan dev)
const email = ref('finance@pmoutama.demo.id');
const password = ref('DemoErp!2026');
const showPassword = ref(false);
const rememberMe = ref(true);
const loading = ref(false);
const errorMsg = ref('');

// State untuk micro-motion interaktif & cinematic zoom portal transition
const isPasswordFocused = ref(false);
const isTransitioning = ref(false);

async function handleLogin() {
  errorMsg.value = '';
  if (!email.value.trim() || !password.value) {
    errorMsg.value = 'Email dan kata sandi wajib diisi.';
    return;
  }

  loading.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    
    // Trigger Cinematic Logo Zoom Portal Transition (Smooth & Silky)!
    isTransitioning.value = true;
    setTimeout(() => {
      router.push('/');
    }, 850);
  } catch (err: any) {
    errorMsg.value = err.message || 'Kredensial tidak valid. Silakan periksa email dan kata sandi Anda.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page-light">
    <!-- Cinematic Logo Zoom Splash Portal (Muncul pas Login Sukses) -->
    <Transition name="splash-fade">
      <div v-if="isTransitioning" class="splash-portal-overlay">
        <div class="splash-logo-container">
          <div class="splash-light-burst"></div>
          <img :src="logoPmoEmblem" alt="PMO UTama" class="splash-logo-img" />
        </div>
      </div>
    </Transition>

    <!-- Pilihan 2: Flowing Cashflow Streamlines Background (Pita Aliran Likuiditas) -->
    <div class="streamlines-bg-canvas" aria-hidden="true">
      <!-- Ambient Fluid Color Blurs -->
      <div class="stream-ambient-orb orb-blue"></div>
      <div class="stream-ambient-orb orb-gold"></div>

      <!-- Multi-Layered Flowing Streamline Ribbons SVG -->
      <svg class="streamlines-svg" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
        <defs>
          <!-- Streamline Gradient 1: Deep PMO Navy -->
          <linearGradient id="streamBlueGrad" x1="0%" y1="20%" x2="100%" y2="80%">
            <stop offset="0%" stop-color="#034693" stop-opacity="0.12" />
            <stop offset="45%" stop-color="#0284c7" stop-opacity="0.09" />
            <stop offset="100%" stop-color="#034693" stop-opacity="0.02" />
          </linearGradient>

          <!-- Streamline Gradient 2: Golden Amber Wealth -->
          <linearGradient id="streamGoldGrad" x1="10%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.10" />
            <stop offset="60%" stop-color="#d97706" stop-opacity="0.06" />
            <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.01" />
          </linearGradient>

          <!-- Streamline Gradient 3: Marine Flow -->
          <linearGradient id="streamCyanGrad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stop-color="#0284c7" stop-opacity="0.09" />
            <stop offset="50%" stop-color="#059669" stop-opacity="0.07" />
            <stop offset="100%" stop-color="#0284c7" stop-opacity="0.01" />
          </linearGradient>

          <!-- Stroke Edge Gradient -->
          <linearGradient id="streamStrokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#034693" stop-opacity="0.22" />
            <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#0284c7" stop-opacity="0.15" />
          </linearGradient>
        </defs>

        <!-- Ribbon Layer 1: Navy Flow -->
        <path
          class="ribbon-layer ribbon-1"
          d="M-100,220 C280,140 580,360 880,260 C1180,160 1340,320 1550,280 L1550,680 C1320,720 1120,540 820,620 C520,700 240,520 -100,600 Z"
          fill="url(#streamBlueGrad)"
        />

        <!-- Ribbon Layer 2: Golden Amber Stream -->
        <path
          class="ribbon-layer ribbon-2"
          d="M-50,480 C260,420 540,620 860,540 C1160,460 1350,600 1520,530 L1520,840 C1280,890 1080,720 760,790 C460,860 200,720 -50,780 Z"
          fill="url(#streamGoldGrad)"
        />

        <!-- Ribbon Layer 3: Cyan Fluid Stream -->
        <path
          class="ribbon-layer ribbon-3"
          d="M-80,80 C240,160 600,-40 920,80 C1240,200 1380,40 1540,120 L1540,420 C1320,380 1140,500 840,420 C540,340 220,460 -80,380 Z"
          fill="url(#streamCyanGrad)"
        />

        <!-- Elegant Edge Contour Lines -->
        <path
          class="ribbon-contour contour-1"
          d="M-100,220 C280,140 580,360 880,260 C1180,160 1340,320 1550,280"
          stroke="url(#streamStrokeGrad)"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <path
          class="ribbon-contour contour-2"
          d="M-50,480 C260,420 540,620 860,540 C1160,460 1350,600 1520,530"
          stroke="rgba(245, 158, 11, 0.2)"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </div>

    <!-- Main Login Card Container -->
    <main class="login-card-container">
      <div class="login-card">
        <!-- Interactive Card Top Accent Border (Shimmering PMO Gradient) -->
        <div class="card-accent-bar"></div>

        <!-- Brand Identity Section with Shimmering Emblem Aura -->
        <header class="brand-section">
          <div class="emblem-container">
            <div class="emblem-shimmer"></div>
            <img :src="logoPmoEmblem" alt="PMO UTama" class="emblem-img" />
          </div>
          <div class="brand-headings">
            <h1 class="brand-title">PMO UTama</h1>
            <p class="brand-subtitle">Financial & Operational ERP System</p>
          </div>
        </header>

        <!-- Error Alert -->
        <div v-if="errorMsg" class="error-alert" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="error-icon">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{{ errorMsg }}</span>
        </div>

        <!-- Login Form with Focus Micro-Animations -->
        <form class="login-form" @submit.prevent="handleLogin">
          <!-- Email Field -->
          <div class="form-item">
            <label for="login-email" class="item-label">
              <span>Email Pengguna</span>
              <span class="required-mark">*</span>
            </label>
            <div class="input-container">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="field-icon icon-mail">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input
                id="login-email"
                v-model="email"
                type="email"
                class="field-input"
                placeholder="nama@pmoutama.id"
                autocomplete="username"
                required
              />
            </div>
          </div>

          <!-- Password Field with Tactile Lock Micro-Motion -->
          <div class="form-item">
            <div class="label-header">
              <label for="login-password" class="item-label">
                <span>Kata Sandi</span>
                <span class="required-mark">*</span>
              </label>
              <a href="mailto:admin@pmoutama.id?subject=Bantuan%20Akses%20ERP" class="forgot-link" tabindex="-1">
                Lupa sandi?
              </a>
            </div>
            <div class="input-container" :class="{ 'is-lock-active': isPasswordFocused }">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="field-icon icon-lock"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" class="lock-shackle"></path>
              </svg>
              <input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="field-input"
                placeholder="Masukkan kata sandi"
                autocomplete="current-password"
                required
                @focus="isPasswordFocused = true"
                @blur="isPasswordFocused = false"
              />
              <button
                type="button"
                class="password-toggle"
                :title="showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'"
                :aria-label="showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'"
                @click="showPassword = !showPassword"
              >
                <svg v-if="!showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Options -->
          <div class="form-options">
            <label class="checkbox-label">
              <input v-model="rememberMe" type="checkbox" class="styled-checkbox" />
              <span>Simpan sesi login di perangkat ini</span>
            </label>
          </div>

          <!-- Submit Button with Shimmer Wave & Arrow Glide -->
          <button type="submit" class="login-submit-btn" :disabled="loading">
            <div class="btn-shimmer-sweep"></div>
            <span v-if="loading" class="spinner-circle"></span>
            <span v-else class="btn-text-row">
              <span>Masuk ke Sistem ERP</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="submit-arrow">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </span>
          </button>
        </form>

        <!-- Corporate Footer (PMO UTama Resmi) -->
        <footer class="card-footer">
          <p class="copyright-text">
            Sistem Informasi Keuangan & Operasional PMO UTama
          </p>
          <div class="security-badges">
            <span class="security-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              TLS 1.3 Terenkripsi
            </span>
            <span class="security-pill">Sistem Terotentikasi</span>
          </div>
        </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Pure Bright Executive Canvas */
.login-page-light {
  position: relative;
  min-height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 50% 0%, #ffffff 0%, #f8fafc 55%, #edf2f7 100%);
  padding: 32px 16px;
  box-sizing: border-box;
  overflow: hidden;
}

/* ===================================================
   CINEMATIC LOGO ZOOM SPLASH PORTAL (SILKY & SMOOTH)
   =================================================== */
.splash-portal-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
  animation: portalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.splash-logo-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: logoSilkyZoom 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.splash-logo-img {
  width: 110px;
  height: 110px;
  object-fit: contain;
  filter: drop-shadow(0 12px 28px rgba(3, 70, 147, 0.22));
  position: relative;
  z-index: 2;
}

.splash-light-burst {
  position: absolute;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(3, 70, 147, 0.22) 0%, rgba(245, 158, 11, 0.14) 45%, transparent 70%);
  filter: blur(24px);
  pointer-events: none;
  animation: burstExpand 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Silky Optical Deceleration Zoom (Zero Motion Sickness) */
@keyframes logoSilkyZoom {
  0% {
    transform: scale(0.92);
    opacity: 0;
  }
  20% {
    transform: scale(1.02);
    opacity: 1;
  }
  65% {
    transform: scale(1.4);
    opacity: 0.95;
  }
  100% {
    transform: scale(2.3);
    opacity: 0;
  }
}

@keyframes burstExpand {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  35% {
    opacity: 0.7;
  }
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}

@keyframes portalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.splash-fade-enter-active,
.splash-fade-leave-active {
  transition: opacity 0.35s ease;
}

/* ===================================================
   FLOWING CASHFLOW STREAMLINES (CALM & TRANQUIL DRIFT)
   =================================================== */
.streamlines-bg-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}

.stream-ambient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(150px);
  pointer-events: none;
}

.orb-blue {
  top: -160px;
  left: 20%;
  width: 580px;
  height: 440px;
  background: radial-gradient(circle, rgba(3, 70, 147, 0.07), transparent 70%);
  animation: driftStreamOrbA 32s ease-in-out infinite alternate;
}

.orb-gold {
  bottom: -140px;
  right: 18%;
  width: 520px;
  height: 400px;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.05), transparent 70%);
  animation: driftStreamOrbB 36s ease-in-out infinite alternate;
}

@keyframes driftStreamOrbA {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(25px, 20px) scale(1.05); }
}

@keyframes driftStreamOrbB {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-20px, -15px) scale(1.04); }
}

/* Multi-Layer Flowing Streamlines SVG */
.streamlines-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.9;
}

.ribbon-layer {
  transform-origin: center center;
}

.ribbon-1 {
  animation: streamFlowA 32s ease-in-out infinite alternate;
}

.ribbon-2 {
  animation: streamFlowB 38s ease-in-out infinite alternate;
}

.ribbon-3 {
  animation: streamFlowC 44s ease-in-out infinite alternate;
}

.contour-1 {
  animation: streamContourA 32s ease-in-out infinite alternate;
}

.contour-2 {
  animation: streamContourB 38s ease-in-out infinite alternate;
}

/* Gentle, tranquil breathing - No Wobble */
@keyframes streamFlowA {
  0% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
  100% { transform: translateY(3px); }
}

@keyframes streamFlowB {
  0% { transform: translateY(0); }
  50% { transform: translateY(4px); }
  100% { transform: translateY(-3px); }
}

@keyframes streamFlowC {
  0% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
  100% { transform: translateY(4px); }
}

@keyframes streamContourA {
  0% { transform: translateY(0); }
  100% { transform: translateY(-4px); }
}

@keyframes streamContourB {
  0% { transform: translateY(0); }
  100% { transform: translateY(4px); }
}

/* ===================================================
   MAIN LOGIN CARD CONTAINER & CARD STYLING
   =================================================== */
.login-card-container {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 440px;
  display: flex;
  justify-content: center;
}

/* White Corporate Card with Subtle Top Accent Bar */
.login-card {
  position: relative;
  width: 100%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 20px;
  padding: 40px 36px 32px;
  box-shadow:
    0 20px 40px -15px rgba(15, 23, 42, 0.08),
    0 0 1px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 26px;
  overflow: hidden;
}

/* Top Accent Shimmer Bar */
.card-accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #034693 0%, #0284c7 45%, #f59e0b 80%, #059669 100%);
  opacity: 0.9;
}

/* Brand Section */
.brand-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

/* Shimmering Emblem Aura */
.emblem-container {
  position: relative;
  width: 66px;
  height: 66px;
  border-radius: 18px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  box-shadow:
    0 8px 18px -4px rgba(3, 70, 147, 0.12),
    0 2px 6px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.emblem-container:hover {
  transform: translateY(-2px) scale(1.04);
}

/* Diagonal Light Sweep across Emblem */
.emblem-shimmer {
  position: absolute;
  inset: -100%;
  background: linear-gradient(
    115deg,
    transparent 0%,
    transparent 42%,
    rgba(255, 255, 255, 0.8) 50%,
    rgba(245, 158, 11, 0.25) 55%,
    transparent 65%,
    transparent 100%
  );
  animation: emblemSheen 5.5s infinite;
  pointer-events: none;
}

@keyframes emblemSheen {
  0% { transform: translateX(-100%) translateY(-100%); }
  25% { transform: translateX(100%) translateY(100%); }
  100% { transform: translateX(100%) translateY(100%); }
}

.emblem-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: relative;
  z-index: 1;
}

.brand-headings {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-title {
  margin: 0;
  font-size: 1.55rem;
  font-weight: 750;
  color: #034693;
  letter-spacing: -0.02em;
}

.brand-subtitle {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* Error Alert */
.error-alert {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #b91c1c;
  font-size: 0.82rem;
  line-height: 1.4;
}

.error-icon {
  flex-shrink: 0;
  color: #dc2626;
}

/* Form Styles */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.label-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.item-label {
  font-size: 0.83rem;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.required-mark {
  color: #dc2626;
}

.forgot-link {
  font-size: 0.78rem;
  color: #034693;
  text-decoration: none;
  font-weight: 550;
  transition: opacity 0.15s ease;
}

.forgot-link:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.input-container:focus-within {
  transform: translateY(-1px);
}

.field-icon {
  position: absolute;
  left: 14px;
  color: #94a3b8;
  pointer-events: none;
  transition: color 0.2s ease, transform 0.2s ease;
}

.field-input {
  width: 100%;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 11px 40px 11px 40px;
  font-family: inherit;
  font-size: 0.90rem;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  box-sizing: border-box;
}

.field-input::placeholder {
  color: #94a3b8;
}

.field-input:focus {
  border-color: #034693;
  box-shadow: 0 0 0 3px rgba(3, 70, 147, 0.14);
}

.input-container:focus-within .field-icon {
  color: #034693;
}

/* Tactile Lock Snap Animation on Password Focus */
.input-container.is-lock-active .icon-lock {
  color: #034693;
}

.input-container.is-lock-active .lock-shackle {
  animation: lockClick 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: bottom center;
}

@keyframes lockClick {
  0% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
  100% { transform: translateY(0); }
}

.password-toggle {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: color 0.15s ease, transform 0.15s ease;
}

.password-toggle:hover {
  color: #334155;
  transform: scale(1.08);
}

/* Options */
.form-options {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: #475569;
  cursor: pointer;
  user-select: none;
}

.styled-checkbox {
  accent-color: #034693;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

/* Submit Button with Shimmer Sweep */
.login-submit-btn {
  position: relative;
  width: 100%;
  margin-top: 4px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #034693 0%, #022b5c 100%);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(3, 70, 147, 0.32);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  overflow: hidden;
}

/* Subtle Shimmer Sweep on Hover */
.btn-shimmer-sweep {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.25) 50%,
    transparent 100%
  );
  transform: skewX(-20deg);
  transition: left 0.6s ease;
  pointer-events: none;
}

.login-submit-btn:hover:not(:disabled) .btn-shimmer-sweep {
  left: 150%;
}

.login-submit-btn:hover:not(:disabled) {
  transform: translateY(-1.5px);
  box-shadow: 0 6px 20px rgba(3, 70, 147, 0.42);
}

.login-submit-btn:active:not(:disabled) {
  transform: scale(0.985);
}

.login-submit-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn-text-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.submit-arrow {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.login-submit-btn:hover:not(:disabled) .submit-arrow {
  transform: translateX(4px);
}

.spinner-circle {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Footer Section */
.card-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  border-top: 1px solid #f1f5f9;
  padding-top: 18px;
}

.copyright-text {
  margin: 0;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.4;
}

.security-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.security-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.68rem;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 3px 8px;
  border-radius: 6px;
}

@media (max-width: 480px) {
  .login-card {
    padding: 30px 20px 24px;
  }
}
</style>
