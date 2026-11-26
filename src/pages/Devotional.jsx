import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { BIBLE_VERSIONS, parseAndFetchVerse } from '../utils/bibleHelper';
import { useBackHandler } from '../utils/backNavigation';
import './Devotional.css';

const DEVOTIONALS_CACHE_KEY = 'devotionals_offline_cache';
const APP_URL = 'https://faith-path.netlify.app';

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Parsea "YYYY-MM-DD" en hora local sin corrimiento UTC
const parseLocalDateKey = (key) => {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const readDevotionalsCache = () => {
  try {
    return JSON.parse(localStorage.getItem(DEVOTIONALS_CACHE_KEY)) || {};
  } catch {
    return {};
  }
};

const writeDevotionalsCache = (cacheObj) => {
  try {
    localStorage.setItem(DEVOTIONALS_CACHE_KEY, JSON.stringify(cacheObj));
  } catch (e) {
    console.error('No se pudo actualizar caché local de devocionales:', e);
  }
};

const createBlock = (type) => ({
  id: `dblk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

const createEmptyDevotional = (dateKey) => ({
  title: '',
  intro: '',
  blocks: [],
  conclusion: '',
  dateKey
});

// Normaliza devocionales nuevos (con blocks) y anteriores (formato plano) a una estructura única
const normalizeDevotional = (raw, fallbackDateKey = '') => {
  if (!raw) return null;

  if (Array.isArray(raw.blocks)) {
    return {
      title: raw.title || '',
      intro: raw.intro || '',
      blocks: raw.blocks.map((b, idx) => ({
        ...createBlock(b.type || 'paragraph'),
        ...b,
        id: b.id || `dblk_norm_${idx}`
      })),
      conclusion: raw.conclusion || '',
      dateKey: raw.dateKey || fallbackDateKey
    };
  }

  // Conversión transparente para devocionales antiguos ya guardados en Firestore
  const legacyBlocks = [];

  if (raw.verseText || raw.verseRef) {
    legacyBlocks.push({
      ...createBlock('verse'),
      id: 'dblk_legacy_verse',
      verseInput: raw.verseRef || '',
      version: raw.verseVersion || 'RVR1960',
      bookId: raw.bookId || null,
      bookName: '',
      chapterId: raw.chapterId || null,
      startVerse: raw.verseId || null,
      endVerse: raw.verseId || null,
      formattedRef: raw.formattedRef || raw.verseRef || '',
      verseText: raw.verseText || ''
    });
  }

  if (raw.bodyText) {
    raw.bodyText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((paragraph, idx) => {
        legacyBlocks.push({
          ...createBlock('paragraph'),
          id: `dblk_legacy_p_${idx}`,
          content: paragraph
        });
      });
  }

  return {
    title: raw.title || '',
    intro: raw.introText || '',
    blocks: legacyBlocks,
    conclusion: raw.conclusionText || '',
    dateKey: raw.dateKey || fallbackDateKey
  };
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

export default function Devotional({ navigateToBibleReference, initialDateKey = null }) {
  const [currentDate, setCurrentDate] = useState(
    () => parseLocalDateKey(initialDateKey) || new Date()
  );
  const [devotionalData, setDevotionalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Estado del editor por bloques
  const [draft, setDraft] = useState(() => createEmptyDevotional(formatDateKey(new Date())));
  const [introOpen, setIntroOpen] = useState(false);
  const [conclusionOpen, setConclusionOpen] = useState(false);

  const toastTimeoutRef = useRef(null);
  const containerRef = useRef(null);

  const dateKey = formatDateKey(currentDate);
  const displayDate = currentDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(''), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Vuelve arriba al cambiar de día o salir de edición
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [dateKey, isEditing]);

  // Manejo del botón/gesto "Atrás" al editar un devocional
  useBackHandler(() => {
    if (isEditing) {
      setIsEditing(false);
      return true;
    }
    return false;
  }, isEditing ? 1 : 0);

  // Escucha sesión de administrador
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Al montar con conexión, sincroniza toda la colección de devocionales para uso offline
  useEffect(() => {
    let isCancelled = false;

    const syncAllDevotionals = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'devotionals'));
        const synced = readDevotionalsCache();

        snapshot.forEach((docSnap) => {
          const { updatedAt, ...cleanData } = docSnap.data();
          synced[docSnap.id] = cleanData;
        });

        writeDevotionalsCache(synced);

        if (!isCancelled && synced[dateKey]) {
          setDevotionalData(normalizeDevotional(synced[dateKey], dateKey));
          setLoading(false);
        }
      } catch (error) {
        console.warn('Sin conexión para sincronizar todos los devocionales:', error);
      }
    };

    syncAllDevotionals();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Carga el devocional de la fecha actual (primero caché local, luego Firestore)
  useEffect(() => {
    let isCancelled = false;

    const fetchDevotional = async () => {
      const localCache = readDevotionalsCache();
      const cachedItem = localCache[dateKey] || null;

      if (cachedItem) {
        setDevotionalData(normalizeDevotional(cachedItem, dateKey));
        setLoading(false);
      } else {
        setDevotionalData(null);
        setLoading(true);
      }

      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'devotionals', dateKey);
        const docSnap = await getDoc(docRef);

        if (!isCancelled) {
          if (docSnap.exists()) {
            const { updatedAt, ...cleanData } = docSnap.data();
            setDevotionalData(normalizeDevotional(cleanData, dateKey));

            const updatedCache = readDevotionalsCache();
            updatedCache[dateKey] = cleanData;
            writeDevotionalsCache(updatedCache);
          } else if (!cachedItem) {
            setDevotionalData(null);
          }
        }
      } catch (error) {
        console.warn('Error leyendo Firestore, manteniendo copia local:', error);
        if (!isCancelled && !cachedItem) {
          setDevotionalData(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchDevotional();

    return () => {
      isCancelled = true;
    };
  }, [dateKey]);

  const changeDay = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + offset);
    setCurrentDate(newDate);
    setIsEditing(false);
  };

  // --- ACCIONES DEL EDITOR POR BLOQUES ---
  const handleCreateNew = () => {
    setDraft(createEmptyDevotional(dateKey));
    setIntroOpen(false);
    setConclusionOpen(false);
    setIsEditing(true);
  };

  const handleEditExisting = () => {
    const normalized = normalizeDevotional(devotionalData, dateKey) || createEmptyDevotional(dateKey);
    const cloned = JSON.parse(JSON.stringify(normalized));
    setDraft(cloned);
    setIntroOpen(Boolean(cloned.intro?.trim()));
    setConclusionOpen(Boolean(cloned.conclusion?.trim()));
    setIsEditing(true);
  };

  const addBlock = (type, scrollToNew = false) => {
    const created = createBlock(type);
    setDraft((prev) => ({
      ...prev,
      blocks: [...prev.blocks, created]
    }));

    if (scrollToNew) {
      setTimeout(() => {
        const el = document.getElementById(`devo-blk-${created.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const field = el.querySelector('input, textarea');
          if (field) field.focus();
        }
      }, 60);
    }
  };

  const updateBlock = (blockId, patch) => {
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b))
    }));
  };

  const moveBlock = (index, direction) => {
    setDraft((prev) => {
      const nextBlocks = [...prev.blocks];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= nextBlocks.length) return prev;
      [nextBlocks[index], nextBlocks[targetIndex]] = [nextBlocks[targetIndex], nextBlocks[index]];
      return { ...prev, blocks: nextBlocks };
    });
  };

  const removeBlock = (blockId) => {
    setDraft((prev) => ({
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
      return null;
    }

    const updated = {
      ...block,
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
    };

    updateBlock(block.id, updated);
    return updated;
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      showToast('Escribe un título principal antes de guardar');
      return;
    }

    // Valida y autocompleta cualquier bloque de versículo con cita escrita
    let hasVerseError = false;
    const resolvedBlocks = [];

    for (const block of draft.blocks) {
      if (block.type === 'verse') {
        const input = (block.verseInput || '').trim();
        if (!input && !block.verseText?.trim()) {
          continue; // Ignora bloques de versículo vacíos
        }

        if (input) {
          const result = parseAndFetchVerse(input, block.version || 'RVR1960');
          if (result.error) {
            hasVerseError = true;
            resolvedBlocks.push({ ...block, verseError: result.error });
            continue;
          }
          resolvedBlocks.push({
            id: block.id,
            type: 'verse',
            content: '',
            verseInput: result.verseRef,
            version: result.version,
            bookId: result.bookId,
            bookName: result.bookName,
            chapterId: result.chapterId,
            startVerse: result.startVerse,
            endVerse: result.endVerse,
            formattedRef: result.formattedRef,
            verseText: result.text
          });
        } else {
          const { verseError, ...cleanBlock } = block;
          resolvedBlocks.push(cleanBlock);
        }
      } else {
        if (!block.content?.trim()) continue; // Ignora bloques vacíos
        const { verseError, ...cleanBlock } = block;
        resolvedBlocks.push({ ...cleanBlock, content: block.content.trim() });
      }
    }

    if (hasVerseError) {
      setDraft((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          const match = resolvedBlocks.find((rb) => rb.id === b.id);
          return match || b;
        })
      }));
      showToast('Revisa las citas bíblicas marcadas con error');
      return;
    }

    if (!draft.intro.trim() && resolvedBlocks.length === 0 && !draft.conclusion.trim()) {
      showToast('Agrega al menos un bloque de contenido al devocional');
      return;
    }

    const finalData = {
      title: draft.title.trim(),
      intro: draft.intro.trim(),
      blocks: resolvedBlocks,
      conclusion: draft.conclusion.trim(),
      dateKey,
      updatedAtMs: Date.now()
    };

    setSaving(true);
    try {
      const updatedCache = readDevotionalsCache();
      updatedCache[dateKey] = finalData;
      writeDevotionalsCache(updatedCache);

      const docRef = doc(db, 'devotionals', dateKey);
      await setDoc(docRef, {
        ...finalData,
        updatedAt: serverTimestamp()
      });

      setDevotionalData(normalizeDevotional(finalData, dateKey));
      setIsEditing(false);
      showToast('Devocional guardado');
    } catch (error) {
      console.error('Error al guardar en Firestore:', error);
      showToast('No se pudo guardar en la nube. Verifica tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  // --- LECTURA, COMPARTIR Y COPIAR ---
  const handleVerseBlockClick = (block) => {
    if (block && block.bookId && navigateToBibleReference) {
      navigateToBibleReference(
        block.version || 'RVR1960',
        block.bookId,
        block.chapterId,
        block.startVerse || 1
      );
    }
  };

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

  const getDirectDevotionalUrl = () => {
    const targetKey = devotionalData?.dateKey || dateKey;
    return `${APP_URL}/?devotional=${targetKey}`;
  };

  // Compartir: envía solo el título y el enlace directo a este devocional
  const handleShare = async () => {
    if (!devotionalData) return;

    const directUrl = getDirectDevotionalUrl();
    const shareTitle = devotionalData.title?.trim() || 'Devocional diario';
    const shareText = `📖 ${shareTitle}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: directUrl
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    const copied = await copyTextToClipboard(`${shareText}\n${directUrl}`);
    showToast(copied ? 'Enlace del devocional copiado' : 'No se pudo compartir el enlace');
  };

  // Copiar: copia el texto completo del devocional estructurado + enlace directo
  const handleCopy = async () => {
    if (!devotionalData) return;

    const directUrl = getDirectDevotionalUrl();
    const sections = [];

    if (devotionalData.title?.trim()) {
      sections.push(`📌 ${devotionalData.title.trim()}`);
    }

    if (devotionalData.intro?.trim()) {
      sections.push(devotionalData.intro.trim());
    }

    let pointNum = 0;
    (devotionalData.blocks || []).forEach((block) => {
      if (block.type === 'subtitle' && block.content?.trim()) {
        pointNum += 1;
        sections.push(`${String(pointNum).padStart(2, '0')}. ${block.content.trim()}`);
      } else if (block.type === 'paragraph' && block.content?.trim()) {
        sections.push(block.content.trim());
      } else if (block.type === 'highlight' && block.content?.trim()) {
        sections.push(`💡 Ilustración:\n${block.content.trim()}`);
      } else if (block.type === 'verse' && block.verseText?.trim()) {
        const refLine = block.formattedRef ? `\n— ${block.formattedRef}` : '';
        sections.push(`“${block.verseText.trim()}”${refLine}`);
      }
    });

    if (devotionalData.conclusion?.trim()) {
      sections.push(devotionalData.conclusion.trim());
    }

    const appLink = `\n\n📲 Lee este devocional en FaithPath: ${directUrl}`;
    const textToCopy = `${sections.join('\n\n')}${appLink}`.trim();

    const copied = await copyTextToClipboard(textToCopy);
    showToast(copied ? 'Devocional copiado al portapapeles' : 'No se pudo copiar el devocional');
  };

  const DecorativeSeparator = () => (
    <div className="devotional-separator">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#cf666d">
        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
      </svg>
    </div>
  );

  // =========================================================================
  // VISTA EDITOR EDITORIAL POR BLOQUES (Misma dinámica que Modo Prédica)
  // =========================================================================
  if (isEditing) {
    const showIntro = introOpen || Boolean(draft.intro?.trim());
    const showConclusion = conclusionOpen || Boolean(draft.conclusion?.trim());
    let editPointCounter = 0;

    return (
      <div className="devo-editor-page">
        {/* Topbar fija */}
        <header className="devo-editor-topbar">
          <button
            type="button"
            className="devo-back-btn"
            onClick={() => setIsEditing(false)}
            disabled={saving}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Cancelar</span>
          </button>

          <span className="devo-editor-date-badge">{displayDate}</span>

          <button
            type="button"
            className="devo-primary-pill"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </header>

        {/* Lienzo principal scrolleable */}
        <main className="devo-canvas-scroll">
          {/* Título */}
          <section className="devo-hero-section">
            <AutoTextarea
              rows={1}
              className="devo-canvas-title"
              placeholder="Título del devocional..."
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
          </section>

          {/* Introducción opcional */}
          <section className="devo-optional-section">
            {!showIntro ? (
              <button
                type="button"
                className="devo-optional-expand-btn"
                onClick={() => setIntroOpen(true)}
              >
                <span className="devo-plus-coral">+</span>
                <span>Agregar introducción</span>
                <span className="devo-optional-tag">(opcional)</span>
              </button>
            ) : (
              <div className="devo-optional-box">
                <div className="devo-optional-head">
                  <span>Introducción</span>
                  {!draft.intro?.trim() && (
                    <button
                      type="button"
                      className="devo-optional-hide-btn"
                      onClick={() => setIntroOpen(false)}
                    >
                      Ocultar
                    </button>
                  )}
                </div>
                <AutoTextarea
                  rows={2}
                  className="devo-optional-textarea"
                  placeholder="Contexto inicial o idea disparadora..."
                  value={draft.intro}
                  onChange={(e) => setDraft((prev) => ({ ...prev, intro: e.target.value }))}
                />
              </div>
            )}
          </section>

          <div className="devo-editor-divider" />

          {/* Desarrollo por bloques */}
          <section className="devo-dev-section">
            <div className="devo-dev-header">
              <div className="devo-dev-title-group">
                <h2>Desarrollo</h2>
                {draft.blocks.length > 0 && (
                  <span className="devo-blocks-count">{draft.blocks.length}</span>
                )}
              </div>
            </div>

            {draft.blocks.length === 0 ? (
              <div className="devo-empty-blocks">
                <p className="devo-empty-subtitle">
                  Arma el devocional combinando puntos clave, párrafos, versículos e ilustraciones.
                </p>

                <div className="devo-empty-grid">
                  <button type="button" className="devo-picker-card" onClick={() => addBlock('subtitle', true)}>
                    <div className="devo-picker-icon devo-picker-coral">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="10" y1="6" x2="21" y2="6" />
                        <line x1="10" y1="12" x2="21" y2="12" />
                        <line x1="10" y1="18" x2="21" y2="18" />
                        <path d="M4 6h1v4" />
                        <path d="M4 10h2" />
                        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
                      </svg>
                    </div>
                    <div className="devo-picker-text">
                      <strong>+ Punto clave</strong>
                      <span>Idea numerada 01, 02</span>
                    </div>
                  </button>

                  <button type="button" className="devo-picker-card" onClick={() => addBlock('paragraph', true)}>
                    <div className="devo-picker-icon devo-picker-neutral">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="17" y1="10" x2="3" y2="10" />
                        <line x1="21" y1="6" x2="3" y2="6" />
                        <line x1="21" y1="14" x2="3" y2="14" />
                        <line x1="17" y1="18" x2="3" y2="18" />
                      </svg>
                    </div>
                    <div className="devo-picker-text">
                      <strong>+ Párrafo</strong>
                      <span>Desarrollo narrativo</span>
                    </div>
                  </button>

                  <button type="button" className="devo-picker-card" onClick={() => addBlock('verse', true)}>
                    <div className="devo-picker-icon devo-picker-gold">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                    <div className="devo-picker-text">
                      <strong>+ Versículo</strong>
                      <span>Cita bíblica automática</span>
                    </div>
                  </button>

                  <button type="button" className="devo-picker-card" onClick={() => addBlock('highlight', true)}>
                    <div className="devo-picker-icon devo-picker-purple">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18h6" />
                        <path d="M10 22h4" />
                        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
                      </svg>
                    </div>
                    <div className="devo-picker-text">
                      <strong>+ Ilustración</strong>
                      <span>Historia o ejemplo</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="devo-blocks-list">
                {draft.blocks.map((block, index) => {
                  if (block.type === 'subtitle') editPointCounter += 1;
                  const pointNum = String(editPointCounter).padStart(2, '0');

                  return (
                    <article
                      key={block.id}
                      id={`devo-blk-${block.id}`}
                      className={`devo-block-card devo-block-${block.type}`}
                    >
                      <div className="devo-block-toolbar">
                        <div className="devo-block-badge-wrap">
                          {block.type === 'subtitle' && (
                            <>
                              <span className="devo-point-num-badge">{pointNum}</span>
                              <span className="devo-block-badge-label">Punto clave</span>
                            </>
                          )}
                          {block.type === 'paragraph' && (
                            <span className="devo-block-badge-label">Párrafo</span>
                          )}
                          {block.type === 'verse' && (
                            <span className="devo-block-badge-label label-gold">Versículo</span>
                          )}
                          {block.type === 'highlight' && (
                            <span className="devo-block-badge-label label-purple">Ilustración</span>
                          )}
                        </div>

                        <div className="devo-block-controls">
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
                            disabled={index === draft.blocks.length - 1}
                            onClick={() => moveBlock(index, 1)}
                            title="Bajar bloque"
                            aria-label="Bajar bloque"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="devo-block-delete"
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
                          className="devo-input-point"
                          placeholder="Escribe la idea principal de este punto..."
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        />
                      )}

                      {block.type === 'paragraph' && (
                        <AutoTextarea
                          rows={2}
                          className="devo-input-paragraph"
                          placeholder="Desarrolla tu reflexión o enseñanza..."
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        />
                      )}

                      {block.type === 'highlight' && (
                        <AutoTextarea
                          rows={2}
                          className="devo-input-highlight"
                          placeholder="Comparte una historia, analogía o frase destacada..."
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        />
                      )}

                      {block.type === 'verse' && (
                        <div className="devo-verse-builder">
                          <div className="devo-verse-row">
                            <input
                              type="text"
                              className="devo-verse-ref-input"
                              placeholder="Cita (ej: Salmos 51:10-12)"
                              value={block.verseInput}
                              onChange={(e) =>
                                updateBlock(block.id, { verseInput: e.target.value, verseError: '' })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleFetchBlockVerse(block);
                                }
                              }}
                            />
                            <select
                              className="devo-verse-version-select"
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
                            className="devo-fetch-verse-btn"
                            onClick={() => handleFetchBlockVerse(block)}
                          >
                            {block.verseText ? 'Actualizar versículo' : 'Cargar texto del versículo'}
                          </button>

                          {block.verseError && (
                            <p className="devo-verse-error">{block.verseError}</p>
                          )}

                          {block.verseText && (
                            <div className="devo-verse-preview">
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

          <div className="devo-editor-divider" />

          {/* Conclusión opcional */}
          <section className="devo-optional-section devo-conclusion-pad">
            {!showConclusion ? (
              <button
                type="button"
                className="devo-optional-expand-btn"
                onClick={() => setConclusionOpen(true)}
              >
                <span className="devo-plus-coral">+</span>
                <span>Agregar conclusión</span>
                <span className="devo-optional-tag">(opcional)</span>
              </button>
            ) : (
              <div className="devo-optional-box">
                <div className="devo-optional-head">
                  <span>Conclusión</span>
                  {!draft.conclusion?.trim() && (
                    <button
                      type="button"
                      className="devo-optional-hide-btn"
                      onClick={() => setConclusionOpen(false)}
                    >
                      Ocultar
                    </button>
                  )}
                </div>
                <AutoTextarea
                  rows={2}
                  className="devo-optional-textarea"
                  placeholder="Oración final, cierre o aplicación práctica..."
                  value={draft.conclusion}
                  onChange={(e) => setDraft((prev) => ({ ...prev, conclusion: e.target.value }))}
                />
              </div>
            )}
          </section>
        </main>

        {/* Barra inferior rápida de bloques */}
        <footer className="devo-sticky-footer">
          <div className="devo-quick-add-strip">
            <button type="button" className="devo-quick-pill" onClick={() => addBlock('subtitle', true)}>
              <span className="dqa-coral">+</span> Punto
            </button>
            <button type="button" className="devo-quick-pill" onClick={() => addBlock('paragraph', true)}>
              <span className="dqa-neutral">+</span> Párrafo
            </button>
            <button type="button" className="devo-quick-pill" onClick={() => addBlock('verse', true)}>
              <span className="dqa-gold">+</span> Versículo
            </button>
            <button type="button" className="devo-quick-pill" onClick={() => addBlock('highlight', true)}>
              <span className="dqa-purple">+</span> Ilustración
            </button>
          </div>

          <button
            type="button"
            className="devo-save-cta"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando...' : 'Guardar devocional'}
          </button>
        </footer>

        {toastMsg && <div className="devotional-toast devo-editor-toast">{toastMsg}</div>}
      </div>
    );
  }

  // =========================================================================
  // VISTA LECTURA DE DEVOCIONAL
  // =========================================================================
  let readPointCounter = 0;

  return (
    <div className="devotional-container" ref={containerRef}>
      <div className="devotional-date-header">
        <button className="date-nav-btn" onClick={() => changeDay(-1)}>‹</button>
        <span className="date-display">{displayDate}</span>
        <button className="date-nav-btn" onClick={() => changeDay(1)}>›</button>
      </div>

      <p className="devotional-top-label">Devocional de hoy</p>

      {loading ? (
        <div className="devotional-empty">
          <p className="devotional-loading">Cargando devocional...</p>
        </div>
      ) : devotionalData ? (
        <div className="devotional-content">
          <h1 className="devotional-title">{devotionalData.title}</h1>
          <hr className="devotional-line" />

          {devotionalData.intro && (
            <div className="devotional-body devotional-intro-block">
              {devotionalData.intro.split('\n').map((line, i) =>
                line.trim() ? <p key={i}>{line}</p> : null
              )}
            </div>
          )}

          {/* Renderizado dinámico de bloques */}
          <div className="devotional-blocks-reader">
            {(devotionalData.blocks || []).map((block, index, allBlocks) => {
              const prevBlock = index > 0 ? allBlocks[index - 1] : null;
              const needsSeparatorBetweenParagraphs =
                block.type === 'paragraph' && prevBlock?.type === 'paragraph';

              if (block.type === 'subtitle' && block.content?.trim()) {
                readPointCounter += 1;
                const numLabel = String(readPointCounter).padStart(2, '0');
                return (
                  <div key={block.id || index} className="devotional-point-block">
                    <div className="devotional-point-head">
                      <span className="devotional-point-num">{numLabel}</span>
                      <span className="devotional-point-label">Punto clave</span>
                    </div>
                    <h2>{block.content}</h2>
                  </div>
                );
              }

              if (block.type === 'paragraph' && block.content?.trim()) {
                return (
                  <React.Fragment key={block.id || index}>
                    {needsSeparatorBetweenParagraphs && <DecorativeSeparator />}
                    <div className="devotional-body">
                      {block.content.split('\n').map((line, i) =>
                        line.trim() ? <p key={i}>{line}</p> : null
                      )}
                    </div>
                  </React.Fragment>
                );
              }

              if (block.type === 'highlight' && block.content?.trim()) {
                return (
                  <div key={block.id || index} className="devotional-highlight-card">
                    <span className="devotional-highlight-kicker">Ilustración</span>
                    {block.content.split('\n').map((line, i) =>
                      line.trim() ? <p key={i}>{line}</p> : null
                    )}
                  </div>
                );
              }

              if (block.type === 'verse' && block.verseText?.trim()) {
                return (
                  <div
                    key={block.id || index}
                    className={`devotional-verse-card ${block.bookId ? 'is-clickable' : ''}`}
                    onClick={() => handleVerseBlockClick(block)}
                  >
                    <p className="devotional-verse-ref">{block.formattedRef}</p>
                    <p className="devotional-verse-text">“{block.verseText}”</p>
                    {block.bookId && (
                      <div className="verse-card-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="19" cy="12" r="1" />
                          <circle cx="5" cy="12" r="1" />
                          <circle cx="12" cy="19" r="1" />
                          <circle cx="12" cy="5" r="1" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            })}
          </div>

          {devotionalData.conclusion && (
            <>
              <DecorativeSeparator />
              <div className="devotional-body conclusion">
                {devotionalData.conclusion.split('\n').map((line, i) =>
                  line.trim() ? <p key={i}>{line}</p> : null
                )}
              </div>
            </>
          )}

          <div className="devotional-bottom-actions">
            <button type="button" className="share-btn-ghost" onClick={handleShare}>
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" style={{ marginRight: '8px' }}>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Compartir
            </button>

            <button type="button" className="copy-btn-ghost" onClick={handleCopy}>
              <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copiar
            </button>

            {isAdmin && (
              <button type="button" className="edit-btn-ghost" onClick={handleEditExisting}>Editar</button>
            )}
          </div>
        </div>
      ) : (
        <div className="devotional-empty">
          <p>No hay devocional para esta fecha.</p>
          {isAdmin && (
            <button className="create-btn" onClick={handleCreateNew}>Crear Devocional</button>
          )}
        </div>
      )}

      {toastMsg && <div className="devotional-toast">{toastMsg}</div>}
    </div>
  );
}