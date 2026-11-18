/**
 * ============================================================================
 * CBT SMP NEGERI 71 BANDUNG — PWA INSTALLER, CACHE-BUSTER & OFFLINE SYNC QUEUE
 * Kompatibel dengan GitHub Pages (subpath), Vercel, dan IDwebhost (custom domain)
 * Mendukung Android, Windows, Chrome/Edge Desktop, Safari iOS/iPadOS, HarmonyOS
 * ============================================================================
 */
(function (window, document) {
  'use strict';

  const SW_URL = './sw.js?v=18';
  const IDB_NAME = 'cbt_sigma71_offline_db';
  const IDB_STORE = 'pending_answer_sync';
  const LS_QUEUE_KEY = 'cbt_pending_sync_queue_v1';

  let deferredInstallPrompt = null;
  let swRegStarted = false;
  let reloadingForUpdate = false;
  let flushingInProgress = false;

  function isStandaloneMode() {
    try {
      return Boolean(
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true ||
        document.referrer.startsWith('android-app://')
      );
    } catch (_) {
      return false;
    }
  }

  function isIosSafariDevice() {
    try {
      const ua = navigator.userAgent || '';
      const isIos = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
      return isIos && isSafari;
    } catch (_) {
      return false;
    }
  }

  function updatePwaInstallButtonsVisibility() {
    const standalone = isStandaloneMode();
    const iosSafari = isIosSafariDevice();

    const loginWrap = document.getElementById('btnLoginPwaInstallWrap');
    if (loginWrap) {
      if (standalone) {
        loginWrap.classList.add('hidden');
      } else {
        loginWrap.classList.remove('hidden');
      }
    }

    const iosGuideBox = document.getElementById('pwaIosGuideBox');
    if (iosGuideBox) {
      if (iosSafari) {
        iosGuideBox.classList.add('ring-2', 'ring-[#0069FF]', 'bg-sky-50/70');
      } else {
        iosGuideBox.classList.remove('ring-2', 'ring-[#0069FF]', 'bg-sky-50/70');
      }
    }

    const badge = document.getElementById('pwaStatusBadgeText');
    if (badge) {
      if (standalone) {
        badge.textContent = 'Aplikasi Berjalan dalam Mode Standalone (Terinstal)';
      } else if (deferredInstallPrompt || window.__deferredPwaPrompt) {
        badge.textContent = 'Siap Diinstal Langsung (Native Install Prompt Aktif)';
      } else if (iosSafari) {
        badge.textContent = 'Safari iOS Terdeteksi — Ikuti Panduan Add to Home Screen di Bawah';
      }
    }
  }

  // Tangkap prompt instalasi native browser (Chrome / Edge / Android / HarmonyOS)
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.__deferredPwaPrompt = event;
    updatePwaInstallButtonsVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    window.__deferredPwaPrompt = null;
    updatePwaInstallButtonsVisibility();
  });

  // Registrasi Service Worker dengan scope relatif ('./') & auto-reload jika versi UI baru aktif
  function registerCbtServiceWorker() {
    if (swRegStarted) return;
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
    swRegStarted = true;

    navigator.serviceWorker
      .register(SW_URL, { scope: './', updateViaCache: 'none' })
      .then((reg) => {
        window.__cbtSwRegistration = reg;
        reg.update().catch(() => { });

        if (reg && typeof reg.addEventListener === 'function') {
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                try {
                  installing.postMessage({ type: 'SKIP_WAITING' });
                } catch (_) { }
              }
            });
          });
        }
      })
      .catch(() => { });

    if (typeof navigator.serviceWorker.addEventListener === 'function') {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        // Auto-reload hanya bila pengguna sedang di layar login atau belum masuk ruang ujian aktif
        const wsEl = document.getElementById('studentExamWorkspace');
        const inActiveExam = wsEl && !wsEl.classList.contains('hidden');
        if (!inActiveExam) {
          window.location.reload();
        } else if (typeof window.syncLatestFromSupabaseSilently === 'function') {
          window.syncLatestFromSupabaseSilently();
        }
      });
    }
  }

  // IndexedDB + LocalStorage Fallback Queue untuk Auto-Sync Jawaban Siswa saat Offline/Online
  function openQueueDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB open error'));
    });
  }

  async function enqueuePendingSessionSync(sessionPayload) {
    if (!sessionPayload || !sessionPayload.studentId) return false;
    const key = `${sessionPayload.studentId}::${sessionPayload.subject || 'GENERAL'}`;
    const record = { key, payload: sessionPayload, updatedAt: Date.now() };

    try {
      const list = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '{}');
      list[key] = record;
      localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(list));
    } catch (_) { }

    try {
      const db = await openQueueDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (_) { }

    return true;
  }

  async function flushPendingSessionSync() {
    if (flushingInProgress) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    if (!window.CbtSupabase || typeof window.CbtSupabase.saveExamSessionResult !== 'function') return 0;
    if (!window.CbtSupabase.getClient || !window.CbtSupabase.getClient()) return 0;

    flushingInProgress = true;
    try {
      const collected = new Map();
      try {
        const lsMap = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '{}');
        Object.entries(lsMap).forEach(([k, v]) => {
          if (v && v.payload) collected.set(k, v);
        });
      } catch (_) { }

      try {
        const db = await openQueueDb();
        const idbItems = await new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const req = tx.objectStore(IDB_STORE).getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => resolve([]);
        });
        db.close();
        idbItems.forEach((item) => {
          if (item && item.key && item.payload) {
            const existing = collected.get(item.key);
            if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
              collected.set(item.key, item);
            }
          }
        });
      } catch (_) { }

      if (collected.size === 0) return 0;

      let syncedCount = 0;
      const remaining = {};
      for (const [key, item] of collected.entries()) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          remaining[key] = item;
          continue;
        }
        try {
          const ok = await Promise.race([
            window.CbtSupabase.saveExamSessionResult(item.payload),
            new Promise((res) => setTimeout(() => res(false), 7000))
          ]);
          if (ok) {
            syncedCount++;
          } else {
            remaining[key] = item;
          }
        } catch (_) {
          remaining[key] = item;
        }
        if (collected.size > 1) {
          await new Promise((res) => setTimeout(res, 180));
        }
      }

      try {
        // Pertahankan item baru yang mungkin masuk saat flush sedang berjalan
        const latestLsMap = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '{}');
        Object.entries(latestLsMap).forEach(([k, v]) => {
          const sentItem = collected.get(k);
          if (v && (!sentItem || (v.updatedAt || 0) > (sentItem.updatedAt || 0))) {
            remaining[k] = v;
          }
        });
        if (Object.keys(remaining).length === 0) {
          localStorage.removeItem(LS_QUEUE_KEY);
        } else {
          localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(remaining));
        }
      } catch (_) { }

      try {
        const db = await openQueueDb();
        await new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          for (const key of collected.keys()) {
            if (!remaining[key]) store.delete(key);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
        db.close();
      } catch (_) { }

      return syncedCount;
    } finally {
      flushingInProgress = false;
    }
  }

  function getPendingSyncCount() {
    try {
      const lsMap = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '{}');
      return Object.keys(lsMap).length;
    } catch (_) {
      return 0;
    }
  }

  window.addEventListener('online', () => {
    flushPendingSessionSync().then((cnt) => {
      if (cnt > 0 && typeof window.showToast === 'function') {
        window.showToast('Koneksi Pulih — Jawaban Tersinkron!', `${cnt} sesi jawaban tersimpan lokal berhasil dikirim ke Supabase.`, 'emerald');
      }
    }).catch(() => { });
  });

  function ensureSplashRunwayAnimation() {
    try {
      const overlay = document.getElementById('pwaFastSplashOverlay');
      if (!overlay || overlay.style.display === 'none' || window.__cbtSplashHidden) return;

      if (!document.getElementById('cbtSplashRunwayStyles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'cbtSplashRunwayStyles';
        styleEl.textContent =
          '@keyframes cbtRunwaySweep{0%{transform:translateX(-130%);opacity:.25}22%{opacity:1}78%{opacity:1}100%{transform:translateX(330%);opacity:.25}}' +
          '@keyframes cbtRunwayShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
          '@keyframes cbtRunwayTrackFlow{0%{background-position:0 0}100%{background-position:36px 0}}';
        (document.head || document.documentElement).appendChild(styleEl);
      }

      const fill = document.getElementById('splashProgressFill');
      if (fill) {
        if (!fill.style.animation) {
          fill.style.background = 'linear-gradient(90deg,#7DD3FC 0%,#E0F2FE 35%,#FFFFFF 50%,#BAE6FD 65%,#7DD3FC 100%)';
          fill.style.backgroundSize = '200% 100%';
          fill.style.animation = 'cbtRunwayShimmer 1.3s linear infinite';
        }
        requestAnimationFrame(() => {
          fill.style.width = '100%';
        });
      }

      const sweep = document.getElementById('splashRunwaySweep');
      if (sweep && !sweep.style.animation) {
        sweep.style.animation = 'cbtRunwaySweep 1.05s cubic-bezier(0.4,0,0.2,1) infinite';
      }
    } catch (_) { }
  }

  function hideFastSplashOverlay(immediate) {
    try {
      if (typeof window.__hidePwaFastSplashOverlay === 'function') {
        window.__hidePwaFastSplashOverlay(Boolean(immediate));
        return;
      }
      if (window.__cbtSplashHidden) return;
      window.__cbtSplashHidden = true;
      const overlay = document.getElementById('pwaFastSplashOverlay');
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      if (immediate) {
        overlay.style.display = 'none';
      } else {
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 360);
      }
    } catch (_) { }
  }

  function initPwaInstaller() {
    ensureSplashRunwayAnimation();
    updatePwaInstallButtonsVisibility();
    registerCbtServiceWorker();

    // Pengaman transisi otomatis menuju halaman Selamat Datang Login jika timer awal belum menutup overlay
    const shownAt = Number(window.__cbtSplashShownAt || Date.now());
    const remainingSplashMs = Math.max(0, 1850 - (Date.now() - shownAt));
    setTimeout(() => {
      hideFastSplashOverlay(false);
    }, remainingSplashMs);

    setTimeout(() => { flushPendingSessionSync().catch(() => { }); }, 2000);
    if (!window.__cbtBgSyncQueueInterval) {
      window.__cbtBgSyncQueueInterval = setInterval(() => {
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          if (getPendingSyncCount() > 0) {
            flushPendingSessionSync().catch(() => { });
          }
        }
      }, 12000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPwaInstaller);
  } else {
    initPwaInstaller();
  }

  let __lastDynamicManifestBlobUrl = null;
  window.syncDynamicPwaManifest = function (configObj) {
    try {
      const cfg = configObj || JSON.parse(localStorage.getItem('cbt_config') || '{}');
      const rawLogo = localStorage.getItem('cbt_logo_url') || cfg.logoUrl || './icon-192.png?v=3.0';
      const resolvedIconUrl = (String(rawLogo).startsWith('data:') || String(rawLogo).startsWith('blob:'))
        ? String(rawLogo)
        : new URL(rawLogo, window.location.href).href;
      const startUrl = new URL('./index.html', window.location.href).href;
      const scopeUrl = new URL('./', window.location.href).href;

      const manifestData = {
        id: startUrl,
        name: (cfg.appTitle || 'SMP NEGERI 71 BANDUNG').trim(),
        short_name: (cfg.appTitle || 'SMPN 71 CBT').trim().slice(0, 20),
        description: `${(cfg.appTitle || 'SMP NEGERI 71 BANDUNG').trim()} - ${(cfg.appSubtitle || 'CBT APPLICATION').trim()}`,
        start_url: startUrl,
        scope: scopeUrl,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#2B659B',
        theme_color: '#2B659B',
        icons: [
          { src: resolvedIconUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: resolvedIconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      };

      const blob = new Blob([JSON.stringify(manifestData)], { type: 'application/manifest+json' });
      const manifestBlobUrl = URL.createObjectURL(blob);
      const linkEl = document.getElementById('dynamicPwaManifestLink');
      if (linkEl) linkEl.setAttribute('href', manifestBlobUrl);
      if (__lastDynamicManifestBlobUrl && __lastDynamicManifestBlobUrl !== manifestBlobUrl) {
        try { URL.revokeObjectURL(__lastDynamicManifestBlobUrl); } catch (_) { }
      }
      __lastDynamicManifestBlobUrl = manifestBlobUrl;
    } catch (e) {
      console.warn('[PWA] Gagal sinkron manifest dinamis:', e);
    }
  };

  window.addEventListener('DOMContentLoaded', function () {
    window.syncDynamicPwaManifest();
  });

  window.CbtPwaInstaller = {
    isStandaloneMode,
    isIosSafariDevice,
    getDeferredPrompt: () => deferredInstallPrompt || window.__deferredPwaPrompt,
    clearDeferredPrompt: () => { deferredInstallPrompt = null; window.__deferredPwaPrompt = null; },
    updatePwaInstallButtonsVisibility,
    registerCbtServiceWorker,
    enqueuePendingSessionSync,
    flushPendingSessionSync,
    getPendingSyncCount,
    syncDynamicPwaManifest: window.syncDynamicPwaManifest,
    ensureSplashRunwayAnimation,
    hideFastSplashOverlay
  };
})(window, document);
