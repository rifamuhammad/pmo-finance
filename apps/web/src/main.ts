import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import 'primeicons/primeicons.css';
import App from './App.vue';
import { router } from './router';
import './assets/main.css';

// Guard against commercial banner injection
if (typeof document !== 'undefined' && !document.getElementById('p-license-host')) {
  const host = document.createElement('div');
  host.id = 'p-license-host';
  host.style.cssText = 'display:none!important;width:0!important;height:0!important;visibility:hidden!important;pointer-events:none!important;';
  document.body.prepend(host);
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(PrimeVue, {
  zIndex: {
    modal: 100100,
    overlay: 100200,
    menu: 100200,
    tooltip: 100300,
  },
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '[data-theme="dark"]',
    },
  },
});
app.mount('#app');
