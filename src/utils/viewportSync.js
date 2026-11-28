// Sincroniza el alto real visible en móviles/tablets y evita que .app-nav quede desplazado tras recargas PWA

export function syncViewportHeight() {
  const realHeight = window.innerHeight;
  if (!realHeight) return;

  document.documentElement.style.setProperty('--app-height', `${realHeight}px`);

  // Fuerza al navegador móvil a recalcular el layout flex de #root y .app-nav
  const rootEl = document.getElementById('root');
  const navEl = document.querySelector('.app-nav');

  if (rootEl) {
    void rootEl.offsetHeight;
  }

  if (navEl) {
    navEl.style.transform = 'translate3d(0, 0, 0)';
    void navEl.offsetHeight;
  }
}

export function initViewportSync() {
  const runSettledSync = () => {
    syncViewportHeight();
    setTimeout(syncViewportHeight, 80);
    setTimeout(syncViewportHeight, 250);
    setTimeout(syncViewportHeight, 600);
    setTimeout(syncViewportHeight, 1200);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      runSettledSync();
    }
  };

  runSettledSync();

  window.addEventListener('resize', syncViewportHeight);
  window.addEventListener('orientationchange', runSettledSync);
  window.addEventListener('pageshow', runSettledSync);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportHeight);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', runSettledSync);
  }

  return () => {
    window.removeEventListener('resize', syncViewportHeight);
    window.removeEventListener('orientationchange', runSettledSync);
    window.removeEventListener('pageshow', runSettledSync);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', syncViewportHeight);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('controllerchange', runSettledSync);
    }
  };
}