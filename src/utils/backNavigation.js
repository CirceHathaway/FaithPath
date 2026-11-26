import { useEffect, useRef } from 'react';

let activeHandlers = [];
let nextHandlerId = 1;
let silentPopCount = 0;
let silentResetTimer = null;
let initialized = false;
let rootFallbackHandler = null;

const scheduleSilentReset = () => {
  if (silentResetTimer) clearTimeout(silentResetTimer);
  silentResetTimer = setTimeout(() => {
    silentPopCount = 0;
    silentResetTimer = null;
  }, 350);
};

export function initBackNavigation(onRootFallback) {
  rootFallbackHandler = onRootFallback;

  if (!window.history.state || typeof window.history.state.fpDepth !== 'number') {
    window.history.replaceState({ fpDepth: 0 }, '');
  }

  if (initialized) return;
  initialized = true;

  window.addEventListener('popstate', (event) => {
    if (silentPopCount > 0) {
      silentPopCount -= 1;
      if (silentPopCount === 0 && silentResetTimer) {
        clearTimeout(silentResetTimer);
        silentResetTimer = null;
      }
      return;
    }

    // Ejecuta desde el componente más profundo montado hacia arriba
    for (let i = activeHandlers.length - 1; i >= 0; i--) {
      if (activeHandlers[i].handler()) {
        return;
      }
    }

    // Si ninguna subvista lo consumió, consulta al nivel raíz (App.jsx)
    if (rootFallbackHandler && rootFallbackHandler()) {
      return;
    }

    // Si ya estamos en la raíz (Inicio) y quedaban estados viejos, limpia hasta fpDepth 0
    const depth = event.state?.fpDepth ?? 0;
    if (depth > 0) {
      silentPopCount += 1;
      scheduleSilentReset();
      window.history.go(-depth);
    }
  });
}

export function pushNavState() {
  const currentDepth = window.history.state?.fpDepth ?? 0;
  window.history.pushState({ fpDepth: currentDepth + 1 }, '');
}

export function popNavStateSilently() {
  const currentDepth = window.history.state?.fpDepth ?? 0;
  if (currentDepth <= 0) return;
  silentPopCount += 1;
  scheduleSilentReset();
  window.history.back();
}

export function resetNavToRoot() {
  const currentDepth = window.history.state?.fpDepth ?? 0;
  if (currentDepth <= 0) return;
  silentPopCount += 1;
  scheduleSilentReset();
  window.history.go(-currentDepth);
}

/**
 * Registra el comportamiento del botón/gesto "Atrás" para una pantalla
 * y agrega entradas al historial automáticamente cada vez que sube su profundidad (depth).
 */
export function useBackHandler(handler, depth = 0) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const prevDepthRef = useRef(0);

  useEffect(() => {
    const id = nextHandlerId++;
    activeHandlers.push({
      id,
      handler: () => handlerRef.current()
    });

    return () => {
      activeHandlers = activeHandlers.filter((item) => item.id !== id);
    };
  }, []);

  useEffect(() => {
    if (depth > prevDepthRef.current) {
      const stepsToPush = depth - prevDepthRef.current;
      for (let i = 0; i < stepsToPush; i++) {
        pushNavState();
      }
    }
    prevDepthRef.current = depth;
  }, [depth]);
}