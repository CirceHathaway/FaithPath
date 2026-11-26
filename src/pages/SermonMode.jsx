import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBackHandler } from '../utils/backNavigation';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  BIBLE_VERSIONS,
  parseAndFetchVerse,
  getVerseInVersion
} from '../utils/bibleHelper';
import './SermonMode.css';

const CACHE_KEY = 'sermons_offline_cache';
const TAG_OPTIONS = ['Culto', 'Jóvenes', 'Estudio', 'Oración', 'Especial'];
const PREACHER_OPTIONS = ['Pastor', 'Pastora'];

// Fecha local en formato "YYYY-MM-DD" sin corrimiento UTC
const getLocalDateString = (dateObj = new Date()) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getNextSundayString = () => {
  const d = new Date();
  const diff = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return getLocalDateString(d);
};

const getTomorrowString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return 'Sin fecha';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const localDate = new Date(y, m - 1, d);
  return localDate.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const createEmptySermon = () => ({
  id: `sermon_${Date.now()}`,
  title: '',
  tag: 'Culto',
  sermonDate: getLocalDateString(),
  preacher: 'Pastor', // Firma: 'Pastor' | 'Pastora'
  status: 'borrador', // Automático: 'borrador' al editar/autoguardar, 'lista' al confirmar Guardar
  intro: '',
  blocks: [],
  conclusion: '',
  createdAtMs: Date.now(),
  updatedAtMs: Date.now()
});

const createBlock = (type) => ({
  id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  type, // 'subtitle' | 'paragraph' | 'verse' | 'highlight'
  content: '',
  verseInput: '',
  version: 'RVR1960',
  bookId: null,
  bookName: '',
  chapterId: null,
  startVerse: null,
  endVerse: null,
  formattedRef: '',
  verseText: '',
  verseError: ''
});

const hasAnyContent = (sermon) => {
  if (!sermon) return false;
  if (sermon.title?.trim() || sermon.intro?.trim() || sermon.conclusion?.trim()) {
    return true;
  }
  return (sermon.blocks || []).some(
    (b) => b.content?.trim() || b.verseInput?.trim() || b.verseText?.trim()
  );
};

// Textarea con auto-crecimiento limpio (sin resize handle nativo)
function AutoTextarea({ value, onChange, className, placeholder, rows = 1, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      {...rest}
    />
  );
}

export default function SermonMode({
  onBack,
  navigateToBibleReference,
  setIsPulpitMode
}) {
  // Vistas: 'library' | 'editor' | 'pulpit'
  const [mode, setMode] = useState('library');

  // Biblioteca
  const [sermons, setSermons] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState('Todas');
  const [filterPreacher, setFilterPreacher] = useState('Todos');
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  // Prédica activa
  const [activeSermon, setActiveSermon] = useState(null);
  // 'saved' | 'draft_saved' | 'saving' | 'dirty' | 'offline'
  const [saveStatus, setSaveStatus] = useState('saved');
  const [toastMsg, setToastMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Editor: secciones opcionales y modales de metadatos
  const [introOpen, setIntroOpen] = useState(false);
  const [conclusionOpen, setConclusionOpen] = useState(false);
  const [activeMetaModal, setActiveMetaModal] = useState(null); // 'tag' | 'date' | 'preacher' | null

  // Modo Púlpito
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(1.7);
  const [highContrast, setHighContrast] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported] = useState(() => 'wakeLock' in navigator);
  const [doneIds, setDoneIds] = useState([]);
  const [openVerseControlId, setOpenVerseControlId] = useState(null);
  const [verseOverrides, setVerseOverrides] = useState({});
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showIndexModal, setShowIndexModal] = useState(false);

  const wakeLockRef = useRef(null);
  const autosaveTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const pulpitScrollRef = useRef(null);

  // Asegura que al cambiar de vista la pantalla arranque siempre arriba
  useEffect(() => {
    if (mode === 'pulpit' && pulpitScrollRef.current) {
      pulpitScrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [mode, activeSermon?.id]);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(''), 2600);
  }, []);

  // Oculta BottomNav en Editor (para barra contextual fija) y en Modo Púlpito
  useEffect(() => {
    if (setIsPulpitMode) {
      setIsPulpitMode(mode === 'pulpit' || mode === 'editor');
    }
    return () => {
      if (setIsPulpitMode) setIsPulpitMode(false);
    };
  }, [mode, setIsPulpitMode]);

  // Carga inicial desde caché local + Firestore
  const loadSermons = useCallback(async () => {
    setLoadingList(true);

    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      try {
        const cachedParsed = JSON.parse(cachedRaw);
        if (Array.isArray(cachedParsed)) {
          setSermons(cachedParsed);
        }
      } catch (e) {
        console.error('Error leyendo caché local:', e);
      }
    }

    try {
      const snapshot = await getDocs(collection(db, 'sermons'));
      const remoteList = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            tag: data.tag === 'Domingo' ? 'Culto' : (data.tag || 'Culto'),
            preacher: data.preacher || '',
            sermonDate:
              data.sermonDate ||
              (data.updatedAtMs ? getLocalDateString(new Date(data.updatedAtMs)) : getLocalDateString())
          };
        })
        .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));

      setSermons(remoteList);
      localStorage.setItem(CACHE_KEY, JSON.stringify(remoteList));
      setIsOfflineFallback(false);
    } catch (error) {
      console.error('Error conectando a Firestore, usando copia offline:', error);
      setIsOfflineFallback(true);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadSermons();
  }, [loadSermons]);

  // Persiste en Firestore + localStorage con el estado indicado ('borrador' | 'lista')
  const persistSermon = useCallback(
    async (sermonToSave, targetStatus, silent = false) => {
      if (!sermonToSave || !hasAnyContent(sermonToSave)) return null;

      setSaveStatus('saving');

      const cleanedBlocks = (sermonToSave.blocks || []).map(({ verseError, ...rest }) => rest);
      const now = Date.now();
      const payload = {
        ...sermonToSave,
        status: targetStatus,
        blocks: cleanedBlocks,
        updatedAtMs: now
      };

      setSermons((prev) => {
        const exists = prev.some((s) => s.id === payload.id);
        const updated = exists
          ? prev.map((s) => (s.id === payload.id ? payload : s))
          : [payload, ...prev];
        updated.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
        localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
        return updated;
      });

      try {
        await setDoc(doc(db, 'sermons', payload.id), {
          ...payload,
          updatedAt: serverTimestamp()
        });
        setSaveStatus(targetStatus === 'lista' ? 'saved' : 'draft_saved');
        if (!silent) {
          showToast(
            targetStatus === 'lista'
              ? 'Prédica guardada como terminada'
              : 'Borrador guardado'
          );
        }
        return payload;
      } catch (error) {
        console.error('Error guardando en Firestore:', error);
        setSaveStatus('offline');
        if (!silent) showToast('Sin conexión: guardada en este dispositivo');
        return payload;
      }
    },
    [showToast]
  );

  // Helper central de edición: marca borrador y programa autoguardado
  const scheduleDraftAutosave = useCallback(
    (nextSermon) => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);

      if (!hasAnyContent(nextSermon)) {
        setSaveStatus('dirty');
        return;
      }

      setSaveStatus('dirty');
      autosaveTimeoutRef.current = setTimeout(() => {
        persistSermon(nextSermon, 'borrador', true);
      }, 1800);
    },
    [persistSermon]
  );

  const updateActiveDraft = useCallback(
    (updater) => {
      setActiveSermon((prev) => {
        if (!prev) return prev;
        const base = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        const next = { ...base, status: 'borrador' };
        scheduleDraftAutosave(next);
        return next;
      });
    },
    [scheduleDraftAutosave]
  );

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, []);

  // Screen Wake Lock API para Modo Púlpito
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener('release', () => {
        setWakeLockActive(false);
      });
    } catch (err) {
      console.error('No se pudo activar Wake Lock:', err);
      setWakeLockActive(false);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.error('Error liberando Wake Lock:', err);
      }
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'pulpit') {
      requestWakeLock();
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          requestWakeLock();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        releaseWakeLock();
      };
    } else {
      releaseWakeLock();
    }
  }, [mode, requestWakeLock, releaseWakeLock]);

  // --- ACCIONES DE BIBLIOTECA ---
  const handleCreateNew = () => {
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    const fresh = createEmptySermon();
    setActiveSermon(fresh);
    setIntroOpen(false);
    setConclusionOpen(false);
    setActiveMetaModal(null);
    setSaveStatus('dirty');
    setMode('editor');
  };

  const handleOpenEditor = (sermon) => {
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    const normalized = {
      ...createEmptySermon(),
      ...JSON.parse(JSON.stringify(sermon)),
      tag: sermon.tag === 'Domingo' ? 'Culto' : (sermon.tag || 'Culto'),
      preacher: sermon.preacher || '',
      sermonDate: sermon.sermonDate || getLocalDateString()
    };
    setActiveSermon(normalized);
    setIntroOpen(Boolean(normalized.intro?.trim()));
    setConclusionOpen(Boolean(normalized.conclusion?.trim()));
    setActiveMetaModal(null);
    setSaveStatus(normalized.status === 'lista' ? 'saved' : 'draft_saved');
    setMode('editor');
  };

  const handleOpenPulpit = (sermon) => {
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    setActiveSermon(sermon);
    setDoneIds([]);
    setVerseOverrides({});
    setOpenVerseControlId(null);
    setShowIndexModal(false);
    setShowSettingsModal(false);
    setMode('pulpit');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;

    setSermons((prev) => {
      const updated = prev.filter((s) => s.id !== targetId);
      localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
      return updated;
    });

    try {
      await deleteDoc(doc(db, 'sermons', targetId));
      showToast('Prédica eliminada');
    } catch (error) {
      console.error('Error eliminando en Firestore:', error);
      showToast('Eliminada localmente (verifica conexión)');
    } finally {
      setDeleteTarget(null);
    }
  };

  // --- PORTAPAPELES CON FALLBACK ---
  const copyTextToClipboard = useCallback(async (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Continúa con el fallback
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }, []);

  // --- COPIAR CITAS PARA PROYECCIÓN ---
  const handleCopyCitations = useCallback(
    async (sermon) => {
      if (!sermon) return;
      const verseBlocks = (sermon.blocks || []).filter(
        (b) => b.type === 'verse' && (b.formattedRef || b.verseInput?.trim())
      );

      if (verseBlocks.length === 0) {
        showToast('Esta prédica todavía no tiene citas cargadas');
        return;
      }

      const lines = verseBlocks.map((b, i) => `${i + 1}. ${b.formattedRef || b.verseInput.trim()}`);
      const text = `PRÉDICA: ${sermon.title || 'Sin título'}\nCitas para proyección:\n${lines.join('\n')}`;

      const ok = await copyTextToClipboard(text);
      if (ok) {
        const msg =
          verseBlocks.length === 1
            ? '1 cita copiada para proyección'
            : `${verseBlocks.length} citas copiadas para proyección`;
        showToast(msg);
      } else {
        showToast('No se pudieron copiar las citas');
      }
    },
    [copyTextToClipboard, showToast]
  );

  // --- COMPARTIR PRÉDICA COMPLETA (COPIA ORDENADA PARA WHATSAPP / FACEBOOK) ---
  const handleShareSermon = useCallback(
    async (sermon, overrides = {}) => {
      if (!sermon || !hasAnyContent(sermon)) {
        showToast('Escribe contenido en la prédica antes de compartir');
        return;
      }

      const sections = [];

      // Cabecera: título, fecha, etiqueta y firma
      const headerLines = [`📌 ${(sermon.title || 'Sin título').trim()}`];
      const metaParts = [];
      if (sermon.sermonDate) metaParts.push(`📅 ${formatDisplayDate(sermon.sermonDate)}`);
      if (sermon.tag) metaParts.push(`🏷️ ${sermon.tag}`);
      if (sermon.preacher) metaParts.push(`✍️ ${sermon.preacher}`);
      if (metaParts.length > 0) headerLines.push(metaParts.join('  |  '));
      sections.push(headerLines.join('\n'));

      // Introducción
      if (sermon.intro?.trim()) {
        sections.push(`── INTRODUCCIÓN ──\n${sermon.intro.trim()}`);
      }

      // Desarrollo (bloques ordenados)
      const devParts = [];
      let pointNum = 0;

      (sermon.blocks || []).forEach((block) => {
        if (block.type === 'subtitle' && block.content?.trim()) {
          pointNum += 1;
          const numStr = String(pointNum).padStart(2, '0');
          devParts.push(`${numStr}. ${block.content.trim()}`);
        } else if (block.type === 'paragraph' && block.content?.trim()) {
          devParts.push(block.content.trim());
        } else if (block.type === 'highlight' && block.content?.trim()) {
          devParts.push(`💡 Ilustración:\n${block.content.trim()}`);
        } else if (block.type === 'verse') {
          const override = overrides[block.id] || {};
          const activeVer = override.version || block.version || 'RVR1960';
          const rangeStr =
            block.startVerse && block.endVerse
              ? block.startVerse === block.endVerse
                ? `${block.startVerse}`
                : `${block.startVerse}-${block.endVerse}`
              : '';

          const refLabel =
            block.bookName && block.chapterId && rangeStr
              ? `${block.bookName} ${block.chapterId}:${rangeStr} (${activeVer})`
              : block.formattedRef || block.verseInput?.trim();

          const textBody = block.bookId
            ? getVerseInVersion(
                block.bookId,
                block.bookName,
                block.chapterId,
                block.startVerse,
                block.endVerse,
                activeVer
              )
            : block.verseText?.trim();

          if (refLabel || textBody) {
            const verseLines = [];
            if (refLabel) verseLines.push(`📖 ${refLabel}`);
            if (textBody) verseLines.push(`“${textBody}”`);
            devParts.push(verseLines.join('\n'));
          }
        }
      });

      if (devParts.length > 0) {
        sections.push(`── DESARROLLO ──\n\n${devParts.join('\n\n')}`);
      }

      // Conclusión
      if (sermon.conclusion?.trim()) {
        sections.push(`── CONCLUSIÓN ──\n${sermon.conclusion.trim()}`);
      }

      const ok = await copyTextToClipboard(sections.join('\n\n'));
      showToast(ok ? 'Prédica copiada lista para pegar' : 'No se pudo copiar la prédica');
    },
    [copyTextToClipboard, showToast]
  );

  // --- ACCIONES DEL EDITOR POR BLOQUES ---
  const addBlock = (type, scrollToNew = false) => {
    const created = createBlock(type);
    updateActiveDraft((prev) => ({
      ...prev,
      blocks: [...prev.blocks, created]
    }));

    if (scrollToNew) {
      setTimeout(() => {
        const el = document.getElementById(`editor-blk-${created.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const field = el.querySelector('input, textarea');
          if (field) field.focus();
        }
      }, 60);
    }
  };

  const updateBlock = (blockId, patch) => {
    updateActiveDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b))
    }));
  };

  const moveBlock = (index, direction) => {
    updateActiveDraft((prev) => {
      const nextBlocks = [...prev.blocks];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= nextBlocks.length) return prev;
      [nextBlocks[index], nextBlocks[targetIndex]] = [nextBlocks[targetIndex], nextBlocks[index]];
      return { ...prev, blocks: nextBlocks };
    });
  };

  const removeBlock = (blockId) => {
    updateActiveDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId)
    }));
    showToast('Bloque eliminado');
  };

  const handleFetchBlockVerse = (block, forcedVersion = null) => {
    const versionToUse = forcedVersion || block.version || 'RVR1960';
    const result = parseAndFetchVerse(block.verseInput, versionToUse);

    if (result.error) {
      updateBlock(block.id, {
        version: versionToUse,
        verseError: result.error
      });
      return;
    }

    updateBlock(block.id, {
      version: result.version,
      verseInput: result.verseRef,
      bookId: result.bookId,
      bookName: result.bookName,
      chapterId: result.chapterId,
      startVerse: result.startVerse,
      endVerse: result.endVerse,
      formattedRef: result.formattedRef,
      verseText: result.text,
      verseError: ''
    });
  };

  // Guardar explícito = marca automáticamente como 'lista' (terminado)
  const handleFinalSave = async (goToPulpit = false) => {
    if (!activeSermon?.title?.trim()) {
      showToast('Escribe un título principal antes de guardar');
      return;
    }
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);

    const saved = await persistSermon(activeSermon, 'lista', goToPulpit);
    if (saved) {
      setActiveSermon(saved);
      if (goToPulpit) {
        handleOpenPulpit(saved);
      }
    }
  };

  const handleBackToLibraryFromEditor = async () => {
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    if (activeSermon && hasAnyContent(activeSermon) && saveStatus === 'dirty') {
      await persistSermon(activeSermon, 'borrador', true);
    }
    setActiveMetaModal(null);
    setMode('library');
  };

  const sermonNavDepth =
    1 +
    (mode === 'editor' || mode === 'pulpit' ? 1 : 0) +
    (activeMetaModal ? 1 : 0) +
    (showSettingsModal ? 1 : 0) +
    (showIndexModal ? 1 : 0) +
    (deleteTarget ? 1 : 0);

  useBackHandler(() => {
    if (deleteTarget) {
      setDeleteTarget(null);
      return true;
    }
    if (activeMetaModal) {
      setActiveMetaModal(null);
      return true;
    }
    if (showSettingsModal) {
      setShowSettingsModal(false);
      return true;
    }
    if (showIndexModal) {
      setShowIndexModal(false);
      return true;
    }
    if (mode === 'pulpit') {
      setMode('library');
      return true;
    }
    if (mode === 'editor') {
      handleBackToLibraryFromEditor();
      return true;
    }
    if (mode === 'library') {
      onBack();
      return true;
    }
    return false;
  }, sermonNavDepth);

  // --- ACCIONES DEL MODO PÚLPITO ---
  const toggleDone = (id) => {
    setDoneIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const setVerseDisplayVersion = (blockId, version) => {
    setVerseOverrides((prev) => ({
      ...prev,
      [blockId]: {
        ...(prev[blockId] || {}),
        version,
        parallel: prev[blockId]?.parallel === version ? 'OFF' : (prev[blockId]?.parallel || 'OFF')
      }
    }));
  };

  const setVerseParallelVersion = (blockId, parallel) => {
    setVerseOverrides((prev) => ({
      ...prev,
      [blockId]: {
        ...(prev[blockId] || {}),
        parallel
      }
    }));
  };

  const handleJumpToBible = (block, displayVersion) => {
    if (!block.bookId || !navigateToBibleReference) return;
    if (setIsPulpitMode) setIsPulpitMode(false);
    releaseWakeLock();
    navigateToBibleReference(
      displayVersion || block.version || 'RVR1960',
      block.bookId,
      block.chapterId,
      block.startVerse
    );
  };

  const scrollToSection = (elementId) => {
    setShowIndexModal(false);
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  // =========================================================================
  // VISTA 1: BIBLIOTECA DE PRÉDICAS
  // =========================================================================
  if (mode === 'library') {
    const filteredSermons = sermons.filter((s) => {
      const q = searchQuery.toLowerCase();
      const matchesQuery =
        (s.title || '').toLowerCase().includes(q) ||
        (s.tag || '').toLowerCase().includes(q) ||
        (s.preacher || '').toLowerCase().includes(q);
      const matchesTag = filterTag === 'Todas' || s.tag === filterTag;
      const matchesPreacher = filterPreacher === 'Todos' || s.preacher === filterPreacher;
      return matchesQuery && matchesTag && matchesPreacher;
    });

    return (
      <div key="view-library" className="sermon-page">
        <header className="sermon-topbar">
          <button type="button" className="sermon-back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Volver</span>
          </button>

          <h1 className="sermon-topbar-title">Modo Prédica</h1>

          <button type="button" className="sermon-primary-pill" onClick={handleCreateNew}>
            + Nueva
          </button>
        </header>

        {isOfflineFallback && (
          <div className="sermon-offline-banner">
            Sin conexión: mostrando copia local guardada.
          </div>
        )}

        <div className="sermon-search-wrap">
          <div className="sermon-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="sermon-search-input"
              placeholder="Buscar por título, etiqueta o firma..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="sermon-tag-filters">
            {['Todas', ...TAG_OPTIONS].map((tag) => (
              <button
                key={tag}
                type="button"
                className={`sermon-tag-chip ${filterTag === tag ? 'active' : ''}`}
                onClick={() => setFilterTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Filtro por firma (Pastor / Pastora) */}
          <div className="sermon-preacher-filters">
            {['Todos', ...PREACHER_OPTIONS].map((preacher) => (
              <button
                key={preacher}
                type="button"
                className={`sermon-preacher-chip ${filterPreacher === preacher ? 'active' : ''}`}
                onClick={() => setFilterPreacher(preacher)}
              >
                {preacher === 'Todos' ? 'Todos' : preacher}
              </button>
            ))}
          </div>
        </div>

        <div className="sermon-library-list">
          {loadingList && sermons.length === 0 ? (
            <p className="sermon-empty-msg">Cargando prédicas...</p>
          ) : filteredSermons.length === 0 ? (
            <div className="sermon-empty-box">
              <div className="sermon-empty-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <h3>Todavía no hay prédicas</h3>
              <p>Arma tu próximo bosquejo con bloques ordenados y citas bíblicas listas para el púlpito.</p>
              <button type="button" className="sermon-create-big-btn" onClick={handleCreateNew}>
                Crear mi primera prédica
              </button>
            </div>
          ) : (
            filteredSermons.map((sermon) => {
              const versesCount = (sermon.blocks || []).filter((b) => b.type === 'verse').length;
              const dateLabel = formatDisplayDate(sermon.sermonDate);

              return (
                <article key={sermon.id} className="sermon-card">
                  <div className="sermon-card-top">
                    <div className="sermon-card-badges">
                      <span className="sermon-badge-tag">{sermon.tag || 'Culto'}</span>
                      {sermon.preacher && (
                        <span className="sermon-badge-preacher">{sermon.preacher}</span>
                      )}
                    </div>
                    <span className={`sermon-badge-status ${sermon.status === 'lista' ? 'ready' : 'draft'}`}>
                      <span className="status-dot" />
                      {sermon.status === 'lista' ? 'Lista' : 'Borrador'}
                    </span>
                  </div>

                  <h2 className="sermon-card-title">{sermon.title || 'Sin título'}</h2>

                  <div className="sermon-card-meta">
                    <span>{dateLabel}</span>
                    <span className="meta-sep">•</span>
                    <span>
                      {versesCount} {versesCount === 1 ? 'cita' : 'citas'}
                    </span>
                  </div>

                  <div className="sermon-card-actions">
                    <button
                      type="button"
                      className="sermon-btn-pulpit"
                      onClick={() => handleOpenPulpit(sermon)}
                    >
                      Modo Púlpito
                    </button>
                    <button
                      type="button"
                      className="sermon-btn-secondary"
                      onClick={() => handleOpenEditor(sermon)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="sermon-btn-icon"
                      title="Copiar citas para proyección"
                      onClick={() => handleCopyCitations(sermon)}
                    >
                      Citas
                    </button>
                    <button
                      type="button"
                      className="sermon-btn-share"
                      title="Copiar prédica completa para compartir"
                      onClick={() => handleShareSermon(sermon)}
                    >
                      Compartir
                    </button>
                    <button
                      type="button"
                      className="sermon-btn-danger"
                      title="Eliminar prédica"
                      onClick={() => setDeleteTarget(sermon)}
                    >
                      ✕
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Modal confirmación de borrado (cierre exclusivo con botones) */}
        {deleteTarget && (
          <div className="sermon-modal-backdrop">
            <div className="sermon-modal-box">
              <div className="modal-header-row">
                <h3>Eliminar prédica</h3>
                <button
                  type="button"
                  className="modal-close-x"
                  onClick={() => setDeleteTarget(null)}
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <p className="modal-desc-text">
                ¿Seguro que quieres eliminar “{deleteTarget.title || 'Sin título'}”? Esta acción no se puede deshacer.
              </p>
              <div className="sermon-modal-actions">
                <button
                  type="button"
                  className="sermon-btn-secondary"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="sermon-btn-danger-solid"
                  onClick={handleConfirmDelete}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {toastMsg && <div className="sermon-toast">{toastMsg}</div>}
      </div>
    );
  }

  // =========================================================================
  // VISTA 2: EDITOR DE BOSQUEJOS (Diseño editorial tipo lienzo)
  // =========================================================================
  if (mode === 'editor' && activeSermon) {
    const verseCount = (activeSermon.blocks || []).filter((b) => b.type === 'verse').length;
    const showIntro = introOpen || Boolean(activeSermon.intro?.trim());
    const showConclusion = conclusionOpen || Boolean(activeSermon.conclusion?.trim());
    let pointCounter = 0;

    return (
      <div key={`view-editor-${activeSermon.id}`} className="sermon-page">
        {/* Header fijo minimalista */}
        <header className="sermon-topbar">
          <button
            type="button"
            className="sermon-back-btn"
            onClick={handleBackToLibraryFromEditor}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Biblioteca</span>
          </button>

          <div className="topbar-right-group">
            <span className={`sermon-save-pill ${saveStatus}`}>
              {saveStatus === 'saving' && 'Guardando...'}
              {saveStatus === 'saved' && '✓ Guardado'}
              {saveStatus === 'draft_saved' && '• Borrador'}
              {saveStatus === 'dirty' && '• Borrador'}
              {saveStatus === 'offline' && 'Copia local'}
            </span>

            <button
              type="button"
              className="sermon-primary-pill"
              onClick={() => handleFinalSave(false)}
            >
              Guardar
            </button>
          </div>
        </header>

        {/* Lienzo principal scrolleable */}
        <main className="editor-canvas-scroll">
          {/* Encabezado tipo lienzo */}
          <section className="editor-hero-section">
            <AutoTextarea
              rows={1}
              className="editor-canvas-title"
              placeholder="Ej: La fe que vence el temor"
              value={activeSermon.title}
              onChange={(e) => updateActiveDraft({ title: e.target.value })}
            />

            {/* Chips de metadatos: Etiqueta, Fecha y Firma (Pastor / Pastora) */}
            <div className="editor-meta-chips">
              <button
                type="button"
                className="meta-chip-btn"
                onClick={() => setActiveMetaModal('tag')}
              >
                <svg className="chip-icon-coral" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                <span>{activeSermon.tag || 'Culto'}</span>
                <span className="chip-chevron">▾</span>
              </button>

              <button
                type="button"
                className="meta-chip-btn"
                onClick={() => setActiveMetaModal('date')}
              >
                <svg className="chip-icon-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{formatDisplayDate(activeSermon.sermonDate)}</span>
                <span className="chip-chevron">▾</span>
              </button>

              <button
                type="button"
                className="meta-chip-btn"
                onClick={() => setActiveMetaModal('preacher')}
              >
                <svg className="chip-icon-gold" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>{activeSermon.preacher || 'Firma'}</span>
                <span className="chip-chevron">▾</span>
              </button>
            </div>
          </section>

          {/* Introducción opcional (Progressive Disclosure) */}
          <section className="editor-optional-section">
            {!showIntro ? (
              <button
                type="button"
                className="optional-expand-btn"
                onClick={() => setIntroOpen(true)}
              >
                <span className="plus-coral">+</span>
                <span>Agregar introducción</span>
                <span className="optional-tag">(opcional)</span>
              </button>
            ) : (
              <div className="optional-editor-box">
                <div className="optional-editor-head">
                  <span>Introducción</span>
                  {!activeSermon.intro?.trim() && (
                    <button
                      type="button"
                      className="optional-hide-btn"
                      onClick={() => setIntroOpen(false)}
                    >
                      Ocultar
                    </button>
                  )}
                </div>
                <AutoTextarea
                  rows={2}
                  className="optional-textarea"
                  placeholder="Contexto inicial, saludo o idea disparadora..."
                  value={activeSermon.intro}
                  onChange={(e) => updateActiveDraft({ intro: e.target.value })}
                />
              </div>
            )}
          </section>

          <div className="editor-divider" />

          {/* Desarrollo por bloques */}
          <section className="editor-dev-section">
            <div className="editor-dev-header">
              <div className="editor-dev-title-group">
                <h2>Desarrollo</h2>
                {activeSermon.blocks.length > 0 && (
                  <span className="blocks-count-pill">{activeSermon.blocks.length}</span>
                )}
              </div>

              <div className="editor-dev-actions">
                <button
                  type="button"
                  className="copy-verses-pill-btn"
                  disabled={verseCount === 0}
                  onClick={() => handleCopyCitations(activeSermon)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>{verseCount > 0 ? `Citas (${verseCount})` : 'Citas'}</span>
                </button>

                <button
                  type="button"
                  className="share-sermon-pill-btn"
                  disabled={!hasAnyContent(activeSermon)}
                  onClick={() => handleShareSermon(activeSermon)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  <span>Compartir</span>
                </button>
              </div>
            </div>

            {activeSermon.blocks.length === 0 ? (
              <div className="empty-blocks-container">
                <p className="empty-blocks-subtitle">
                  Estructura tu mensaje combinando puntos clave, párrafos, versículos e ilustraciones.
                </p>

                <div className="empty-blocks-grid">
                  <button type="button" className="block-picker-card" onClick={() => addBlock('subtitle', true)}>
                    <div className="picker-icon picker-coral">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="10" y1="6" x2="21" y2="6" />
                        <line x1="10" y1="12" x2="21" y2="12" />
                        <line x1="10" y1="18" x2="21" y2="18" />
                        <path d="M4 6h1v4" />
                        <path d="M4 10h2" />
                        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
                      </svg>
                    </div>
                    <div className="picker-text">
                      <strong>+ Punto clave</strong>
                      <span>Idea numerada 01, 02</span>
                    </div>
                  </button>

                  <button type="button" className="block-picker-card" onClick={() => addBlock('paragraph', true)}>
                    <div className="picker-icon picker-neutral">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="17" y1="10" x2="3" y2="10" />
                        <line x1="21" y1="6" x2="3" y2="6" />
                        <line x1="21" y1="14" x2="3" y2="14" />
                        <line x1="17" y1="18" x2="3" y2="18" />
                      </svg>
                    </div>
                    <div className="picker-text">
                      <strong>+ Párrafo</strong>
                      <span>Desarrollo narrativo</span>
                    </div>
                  </button>

                  <button type="button" className="block-picker-card picker-card-gold" onClick={() => addBlock('verse', true)}>
                    <div className="picker-icon picker-gold">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                    <div className="picker-text">
                      <strong>+ Versículo</strong>
                      <span>Cita bíblica automática</span>
                    </div>
                  </button>

                  <button type="button" className="block-picker-card" onClick={() => addBlock('highlight', true)}>
                    <div className="picker-icon picker-purple">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18h6" />
                        <path d="M10 22h4" />
                        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
                      </svg>
                    </div>
                    <div className="picker-text">
                      <strong>+ Ilustración</strong>
                      <span>Historia o ejemplo</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="editor-blocks-list">
                {activeSermon.blocks.map((block, index) => {
                  if (block.type === 'subtitle') pointCounter += 1;
                  const pointNum = String(pointCounter).padStart(2, '0');

                  return (
                    <article
                      key={block.id}
                      id={`editor-blk-${block.id}`}
                      className={`editor-block-card block-type-${block.type}`}
                    >
                      <div className="editor-block-toolbar">
                        <div className="block-badge-wrap">
                          {block.type === 'subtitle' && (
                            <>
                              <span className="point-num-badge">{pointNum}</span>
                              <span className="block-badge-label">Punto clave</span>
                            </>
                          )}
                          {block.type === 'paragraph' && (
                            <span className="block-badge-label">Párrafo</span>
                          )}
                          {block.type === 'verse' && (
                            <span className="block-badge-label label-gold">Versículo</span>
                          )}
                          {block.type === 'highlight' && (
                            <span className="block-badge-label label-purple">Ilustración</span>
                          )}
                        </div>

                        <div className="block-controls">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveBlock(index, -1)}
                            title="Subir bloque"
                            aria-label="Subir bloque"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === activeSermon.blocks.length - 1}
                            onClick={() => moveBlock(index, 1)}
                            title="Bajar bloque"
                            aria-label="Bajar bloque"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="block-delete-btn"
                            onClick={() => removeBlock(block.id)}
                            title="Eliminar bloque"
                            aria-label="Eliminar bloque"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {block.type === 'subtitle' && (
                        <AutoTextarea
                          rows={1}
                          className="block-input-point"
                          placeholder="Escribe la idea principal de este punto..."
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        />
                      )}

                      {block.type === 'paragraph' && (
                        <AutoTextarea
                          rows={2}
                          className="block-input-paragraph"
                          placeholder="Desarrolla tu explicación, contexto o reflexión..."
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        />
                      )}

                      {block.type === 'highlight' && (
                        <AutoTextarea
                          rows={2}
                          className="block-input-highlight"
                          placeholder="Comparte una historia, analogía o frase destacada..."
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        />
                      )}

                      {block.type === 'verse' && (
                        <div className="editor-verse-builder">
                          <div className="editor-verse-row">
                            <input
                              type="text"
                              className="verse-ref-input"
                              placeholder="Cita (ej: Salmos 51:10-12)"
                              value={block.verseInput}
                              onChange={(e) => updateBlock(block.id, { verseInput: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleFetchBlockVerse(block);
                                }
                              }}
                            />
                            <select
                              className="verse-version-select"
                              value={block.version || 'RVR1960'}
                              onChange={(e) => {
                                const nextVer = e.target.value;
                                if (block.verseInput.trim()) {
                                  handleFetchBlockVerse(block, nextVer);
                                } else {
                                  updateBlock(block.id, { version: nextVer });
                                }
                              }}
                            >
                              {BIBLE_VERSIONS.map((v) => (
                                <option key={v.id} value={v.id}>{v.label}</option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            className="editor-fetch-verse-btn"
                            onClick={() => handleFetchBlockVerse(block)}
                          >
                            {block.verseText ? 'Actualizar versículo' : 'Cargar texto del versículo'}
                          </button>

                          {block.verseError && (
                            <p className="editor-verse-error">{block.verseError}</p>
                          )}

                          {block.verseText && (
                            <div className="editor-verse-preview">
                              <strong>{block.formattedRef}</strong>
                              <p>“{block.verseText}”</p>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="editor-divider" />

          {/* Conclusión opcional (Progressive Disclosure) */}
          <section className="editor-optional-section conclusion-pad">
            {!showConclusion ? (
              <button
                type="button"
                className="optional-expand-btn"
                onClick={() => setConclusionOpen(true)}
              >
                <span className="plus-coral">+</span>
                <span>Agregar conclusión</span>
                <span className="optional-tag">(opcional)</span>
              </button>
            ) : (
              <div className="optional-editor-box">
                <div className="optional-editor-head">
                  <span>Conclusión</span>
                  {!activeSermon.conclusion?.trim() && (
                    <button
                      type="button"
                      className="optional-hide-btn"
                      onClick={() => setConclusionOpen(false)}
                    >
                      Ocultar
                    </button>
                  )}
                </div>
                <AutoTextarea
                  rows={2}
                  className="optional-textarea"
                  placeholder="Cierre, llamado o aplicación práctica final..."
                  value={activeSermon.conclusion}
                  onChange={(e) => updateActiveDraft({ conclusion: e.target.value })}
                />
              </div>
            )}
          </section>
        </main>

        {/* Barra inferior contextual fija (reemplaza BottomNav en edición) */}
        <footer className="editor-sticky-footer">
          <div className="quick-add-strip">
            <button type="button" className="quick-add-pill" onClick={() => addBlock('subtitle', true)}>
              <span className="qa-coral">+</span> Punto
            </button>
            <button type="button" className="quick-add-pill" onClick={() => addBlock('paragraph', true)}>
              <span className="qa-neutral">+</span> Párrafo
            </button>
            <button type="button" className="quick-add-pill" onClick={() => addBlock('verse', true)}>
              <span className="qa-gold">+</span> Versículo
            </button>
            <button type="button" className="quick-add-pill" onClick={() => addBlock('highlight', true)}>
              <span className="qa-purple">+</span> Ilustración
            </button>
          </div>

          <button
            type="button"
            className="editor-pulpit-cta"
            onClick={() => handleFinalSave(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span>Guardar y abrir en Modo Púlpito</span>
          </button>
        </footer>

        {/* Modales de selección (Etiqueta / Fecha / Firma) - Cierre EXCLUSIVO con botones */}
        {activeMetaModal && (
          <div className="sermon-modal-backdrop sheet-bottom">
            <div className="sermon-modal-box sheet-card">
              <div className="modal-header-row">
                <h3>
                  {activeMetaModal === 'tag' && 'Etiqueta del mensaje'}
                  {activeMetaModal === 'date' && 'Fecha de la prédica'}
                  {activeMetaModal === 'preacher' && 'Firma de la prédica'}
                </h3>
                <button
                  type="button"
                  className="modal-close-x"
                  onClick={() => setActiveMetaModal(null)}
                  aria-label="Cerrar selector"
                >
                  ✕
                </button>
              </div>

              {activeMetaModal === 'tag' && (
                <div className="tag-modal-grid">
                  {TAG_OPTIONS.map((tag) => {
                    const isSelected = activeSermon.tag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`tag-option-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => updateActiveDraft({ tag })}
                      >
                        <span>{tag}</span>
                        {isSelected && <span className="check-mark">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeMetaModal === 'date' && (
                <div className="date-modal-body">
                  <input
                    type="date"
                    className="date-picker-input"
                    value={activeSermon.sermonDate || getLocalDateString()}
                    onChange={(e) => updateActiveDraft({ sermonDate: e.target.value })}
                  />
                  <div className="date-presets-row">
                    <button
                      type="button"
                      className={`date-preset-chip ${
                        activeSermon.sermonDate === getLocalDateString() ? 'active' : ''
                      }`}
                      onClick={() => updateActiveDraft({ sermonDate: getLocalDateString() })}
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      className={`date-preset-chip ${
                        activeSermon.sermonDate === getTomorrowString() ? 'active' : ''
                      }`}
                      onClick={() => updateActiveDraft({ sermonDate: getTomorrowString() })}
                    >
                      Mañana
                    </button>
                    <button
                      type="button"
                      className={`date-preset-chip ${
                        activeSermon.sermonDate === getNextSundayString() ? 'active' : ''
                      }`}
                      onClick={() => updateActiveDraft({ sermonDate: getNextSundayString() })}
                    >
                      Próx. domingo
                    </button>
                  </div>
                </div>
              )}

              {activeMetaModal === 'preacher' && (
                <div className="tag-modal-grid">
                  {PREACHER_OPTIONS.map((preacher) => {
                    const isSelected = activeSermon.preacher === preacher;
                    return (
                      <button
                        key={preacher}
                        type="button"
                        className={`tag-option-btn preacher-option-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => updateActiveDraft({ preacher })}
                      >
                        <span>{preacher}</span>
                        {isSelected && <span className="check-mark-gold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                className="modal-done-btn"
                onClick={() => setActiveMetaModal(null)}
              >
                Listo
              </button>
            </div>
          </div>
        )}

        {toastMsg && <div className="sermon-toast editor-toast">{toastMsg}</div>}
      </div>
    );
  }

  // =========================================================================
  // VISTA 3: MODO PÚLPITO (LECTURA EN VIVO SIN CRONÓMETRO)
  // =========================================================================
  if (mode === 'pulpit' && activeSermon) {
    const indexItems = [];
    if (activeSermon.intro && activeSermon.intro.trim()) {
      indexItems.push({ id: 'pulpit-intro', label: 'Introducción' });
    }
    let idxPointCount = 0;
    (activeSermon.blocks || []).forEach((b) => {
      if (b.type === 'subtitle' && b.content.trim()) {
        idxPointCount += 1;
        indexItems.push({
          id: `pulpit-block-${b.id}`,
          label: `${String(idxPointCount).padStart(2, '0')} · ${b.content}`
        });
      } else if (b.type === 'verse' && b.formattedRef) {
        indexItems.push({
          id: `pulpit-block-${b.id}`,
          label: b.formattedRef,
          isVerse: true
        });
      }
    });
    if (activeSermon.conclusion && activeSermon.conclusion.trim()) {
      indexItems.push({ id: 'pulpit-conclusion', label: 'Conclusión' });
    }

    let pulpitPointCounter = 0;

    return (
      <div
        key={`view-pulpit-${activeSermon.id}`}
        className={`pulpit-page ${highContrast ? 'pulpit-light' : ''}`}
      >
        {/* Barra superior limpia */}
        <header className="pulpit-topbar">
          <button
            type="button"
            className="pulpit-top-btn"
            onClick={() => setMode('library')}
          >
            ‹ Salir
          </button>

          <div className="pulpit-topbar-badge">
            <span className="pulpit-live-dot" />
            <span>Modo Púlpito</span>
          </div>

          <div className="pulpit-top-right">
            {wakeLockSupported && (
              <button
                type="button"
                className={`pulpit-top-btn icon-only ${wakeLockActive ? 'wake-on' : ''}`}
                onClick={() => (wakeLockActive ? releaseWakeLock() : requestWakeLock())}
                title={wakeLockActive ? 'Pantalla encendida activa' : 'Mantener pantalla encendida'}
                aria-label="Mantener pantalla encendida"
              >
                ☀
              </button>
            )}
            <button
              type="button"
              className="pulpit-top-btn"
              onClick={() => setShowSettingsModal(true)}
              title="Ajustes de lectura"
            >
              Aa
            </button>
          </div>
        </header>

        {/* Cuerpo de lectura */}
        <main
          ref={pulpitScrollRef}
          className="pulpit-content"
          style={{ fontSize: `${fontSize}px`, lineHeight }}
        >
          <div className="pulpit-title-block">
            <div className="pulpit-meta-line">
              <span className="pulpit-tag-pill">{activeSermon.tag || 'Culto'}</span>
              {activeSermon.preacher && (
                <span className="pulpit-preacher-pill">{activeSermon.preacher}</span>
              )}
              {activeSermon.sermonDate && (
                <span className="pulpit-date-text">
                  {formatDisplayDate(activeSermon.sermonDate)}
                </span>
              )}
            </div>
            <h1 className="pulpit-title">{activeSermon.title || 'Sin título'}</h1>
            <p className="pulpit-hint">
              Toca un bloque para marcarlo como ya dicho · Toca un versículo para cambiar de versión
            </p>
          </div>

          {/* Introducción */}
          {activeSermon.intro && activeSermon.intro.trim() && (
            <div
              id="pulpit-intro"
              className={`pulpit-block pulpit-intro ${doneIds.includes('intro') ? 'is-done' : ''}`}
              onClick={() => toggleDone('intro')}
            >
              <span className="pulpit-section-kicker">Introducción</span>
              <p>{activeSermon.intro}</p>
            </div>
          )}

          {/* Bloques de desarrollo */}
          {(activeSermon.blocks || []).map((block) => {
            const isDone = doneIds.includes(block.id);

            if (block.type === 'subtitle') {
              pulpitPointCounter += 1;
              const numLabel = String(pulpitPointCounter).padStart(2, '0');
              return (
                <div
                  key={block.id}
                  id={`pulpit-block-${block.id}`}
                  className={`pulpit-block pulpit-subtitle-block ${isDone ? 'is-done' : ''}`}
                  onClick={() => toggleDone(block.id)}
                >
                  <div className="pulpit-point-head">
                    <span className="pulpit-point-num">{numLabel}</span>
                    <span className="pulpit-point-label">Punto clave</span>
                  </div>
                  <h2>{block.content}</h2>
                </div>
              );
            }

            if (block.type === 'paragraph') {
              return (
                <div
                  key={block.id}
                  id={`pulpit-block-${block.id}`}
                  className={`pulpit-block pulpit-paragraph ${isDone ? 'is-done' : ''}`}
                  onClick={() => toggleDone(block.id)}
                >
                  {block.content.split('\n').map((line, i) =>
                    line.trim() ? <p key={i}>{line}</p> : null
                  )}
                </div>
              );
            }

            if (block.type === 'highlight') {
              return (
                <div
                  key={block.id}
                  id={`pulpit-block-${block.id}`}
                  className={`pulpit-block pulpit-highlight ${isDone ? 'is-done' : ''}`}
                  onClick={() => toggleDone(block.id)}
                >
                  <span className="pulpit-section-kicker kicker-purple">Ilustración</span>
                  <p>{block.content}</p>
                </div>
              );
            }

            if (block.type === 'verse') {
              const override = verseOverrides[block.id] || {};
              const activeVer = override.version || block.version || 'RVR1960';
              const parallelVer = override.parallel || 'OFF';
              const isControlOpen = openVerseControlId === block.id;

              const liveText = block.bookId
                ? getVerseInVersion(
                    block.bookId,
                    block.bookName,
                    block.chapterId,
                    block.startVerse,
                    block.endVerse,
                    activeVer
                  )
                : block.verseText;

              const parallelText =
                parallelVer !== 'OFF' && block.bookId
                  ? getVerseInVersion(
                      block.bookId,
                      block.bookName,
                      block.chapterId,
                      block.startVerse,
                      block.endVerse,
                      parallelVer
                    )
                  : null;

              const rangeStr =
                block.startVerse === block.endVerse
                  ? `${block.startVerse}`
                  : `${block.startVerse}-${block.endVerse}`;
              const displayRef = block.bookName
                ? `${block.bookName} ${block.chapterId}:${rangeStr} (${activeVer})`
                : block.formattedRef;

              return (
                <div
                  key={block.id}
                  id={`pulpit-block-${block.id}`}
                  className={`pulpit-verse-card ${isDone ? 'is-done' : ''}`}
                >
                  <div className="pulpit-verse-header">
                    <span
                      className="pulpit-verse-ref"
                      onClick={() =>
                        setOpenVerseControlId(isControlOpen ? null : block.id)
                      }
                    >
                      {displayRef} ▾
                    </span>
                    <button
                      type="button"
                      className={`pulpit-verse-check ${isDone ? 'checked' : ''}`}
                      onClick={() => toggleDone(block.id)}
                      title="Marcar como leído"
                      aria-label="Marcar como leído"
                    >
                      ✓
                    </button>
                  </div>

                  <div
                    className="pulpit-verse-body"
                    onClick={() =>
                      setOpenVerseControlId(isControlOpen ? null : block.id)
                    }
                  >
                    <p className="pulpit-verse-text">“{liveText}”</p>
                    {parallelText && (
                      <div className="pulpit-parallel-box">
                        <span className="pulpit-parallel-label">{parallelVer}</span>
                        <p>{parallelText}</p>
                      </div>
                    )}
                  </div>

                  {isControlOpen && (
                    <div className="pulpit-verse-controls">
                      <div className="verse-ctrl-stack">
                        <span className="verse-ctrl-label">Versión</span>
                        <div className="verse-ctrl-pills">
                          {BIBLE_VERSIONS.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className={`verse-pill ${activeVer === v.id ? 'active' : ''}`}
                              onClick={() => setVerseDisplayVersion(block.id, v.id)}
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="verse-ctrl-stack">
                        <span className="verse-ctrl-label">Versión paralela</span>
                        <div className="verse-ctrl-pills">
                          <button
                            type="button"
                            className={`verse-pill ${parallelVer === 'OFF' ? 'active' : ''}`}
                            onClick={() => setVerseParallelVersion(block.id, 'OFF')}
                          >
                            No
                          </button>
                          {BIBLE_VERSIONS.filter((v) => v.id !== activeVer).map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className={`verse-pill ${parallelVer === v.id ? 'active' : ''}`}
                              onClick={() => setVerseParallelVersion(block.id, v.id)}
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="verse-ctrl-footer">
                        {block.bookId && (
                          <button
                            type="button"
                            className="verse-jump-btn"
                            onClick={() => handleJumpToBible(block, activeVer)}
                          >
                            Ir al capítulo en Biblia
                          </button>
                        )}
                        <button
                          type="button"
                          className="verse-close-btn"
                          onClick={() => setOpenVerseControlId(null)}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}

          {/* Conclusión */}
          {activeSermon.conclusion && activeSermon.conclusion.trim() && (
            <div
              id="pulpit-conclusion"
              className={`pulpit-block pulpit-conclusion ${doneIds.includes('conclusion') ? 'is-done' : ''}`}
              onClick={() => toggleDone('conclusion')}
            >
              <span className="pulpit-section-kicker">Conclusión</span>
              <p>{activeSermon.conclusion}</p>
            </div>
          )}

          {/* Acciones al pie */}
          <div className="pulpit-bottom-actions">
            <button
              type="button"
              className="sermon-btn-share"
              onClick={() => handleShareSermon(activeSermon, verseOverrides)}
            >
              Compartir prédica
            </button>
            <button
              type="button"
              className="sermon-btn-secondary"
              onClick={() => handleCopyCitations(activeSermon)}
            >
              Copiar citas
            </button>
            <button
              type="button"
              className="sermon-btn-secondary"
              onClick={() => handleOpenEditor(activeSermon)}
            >
              Editar bosquejo
            </button>
          </div>
        </main>

        {/* Botón flotante de Índice */}
        {indexItems.length > 0 && (
          <button
            type="button"
            className="pulpit-index-fab"
            onClick={() => setShowIndexModal(true)}
            title="Índice rápido"
          >
            ☰ Índice
          </button>
        )}

        {/* Modal Ajustes de Púlpito (diseño apilado sin desbordamiento en 360px) */}
        {showSettingsModal && (
          <div className="sermon-modal-backdrop sheet-bottom">
            <div className={`sermon-modal-box sheet-card ${highContrast ? 'modal-light' : ''}`}>
              <div className="modal-header-row">
                <h3>Ajustes de Púlpito</h3>
                <button
                  type="button"
                  className="modal-close-x"
                  onClick={() => setShowSettingsModal(false)}
                  aria-label="Cerrar ajustes"
                >
                  ✕
                </button>
              </div>

              <div className="setting-group">
                <span className="setting-label">Tamaño de letra</span>
                <div className="setting-grid-3">
                  <button
                    type="button"
                    className="setting-btn"
                    onClick={() => setFontSize((f) => Math.max(14, f - 2))}
                  >
                    A-
                  </button>
                  <div className="setting-value-box">{fontSize}px</div>
                  <button
                    type="button"
                    className="setting-btn"
                    onClick={() => setFontSize((f) => Math.min(34, f + 2))}
                  >
                    A+
                  </button>
                </div>
              </div>

              <div className="setting-group">
                <span className="setting-label">Interlineado</span>
                <div className="setting-grid-3">
                  {[
                    { label: 'Compacto', val: 1.45 },
                    { label: 'Normal', val: 1.7 },
                    { label: 'Amplio', val: 2.05 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      className={`setting-btn ${lineHeight === opt.val ? 'active' : ''}`}
                      onClick={() => setLineHeight(opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <span className="setting-label">Contraste</span>
                <div className="setting-grid-2">
                  <button
                    type="button"
                    className={`setting-btn ${!highContrast ? 'active' : ''}`}
                    onClick={() => setHighContrast(false)}
                  >
                    Oscuro
                  </button>
                  <button
                    type="button"
                    className={`setting-btn ${highContrast ? 'active' : ''}`}
                    onClick={() => setHighContrast(true)}
                  >
                    Claro alto
                  </button>
                </div>
              </div>

              <div className="setting-group">
                <span className="setting-label">Marcas de lectura</span>
                <button
                  type="button"
                  className="setting-btn full-width"
                  onClick={() => {
                    setDoneIds([]);
                    showToast('Marcas reiniciadas');
                  }}
                >
                  Limpiar bloques marcados ({doneIds.length})
                </button>
              </div>

              <button
                type="button"
                className="modal-done-btn"
                onClick={() => setShowSettingsModal(false)}
              >
                Listo
              </button>
            </div>
          </div>
        )}

        {/* Modal Índice Rápido */}
        {showIndexModal && (
          <div className="sermon-modal-backdrop sheet-bottom">
            <div className={`sermon-modal-box sheet-card ${highContrast ? 'modal-light' : ''}`}>
              <div className="modal-header-row">
                <h3>Índice de la prédica</h3>
                <button
                  type="button"
                  className="modal-close-x"
                  onClick={() => setShowIndexModal(false)}
                  aria-label="Cerrar índice"
                >
                  ✕
                </button>
              </div>
              <div className="pulpit-index-list">
                {indexItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`pulpit-index-item ${item.isVerse ? 'is-verse' : ''}`}
                    onClick={() => scrollToSection(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="modal-done-btn"
                onClick={() => setShowIndexModal(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {toastMsg && <div className="sermon-toast">{toastMsg}</div>}
      </div>
    );
  }

  return null;
}