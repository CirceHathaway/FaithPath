import React, { useState, useEffect, useRef, useCallback } from 'react';
import VersionSelector from '../components/VersionSelector';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { generateVerseImage, getRandomBackgroundUrl } from '../utils/verseImageGenerator';
import { useBackHandler, popNavStateSilently } from '../utils/backNavigation';
import { getReadingHistory, formatHistoryTime } from '../utils/readingHistory';
import './Home.css';

const DAILY_VERSES_CACHE_KEY = 'daily_verses_offline_cache';

const backgroundImages = [
  'url("https://images.unsplash.com/photo-1504052434569-70ad5836ab65?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80")',
  'url("https://images.unsplash.com/photo-1448375240586-882707db888b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80")'
];

const FALLBACK_VERSES = [
  {
    text: 'Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.',
    ref: 'Salmos 119:105 (RVR1960)'
  },
  {
    text: 'El cielo y la tierra pasarán, pero mis palabras no pasarán.',
    ref: 'Mateo 24:35 (NVI)'
  }
];

const getInitialVerses = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(DAILY_VERSES_CACHE_KEY));
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch {
    // Si el caché falla, usa los versículos de respaldo
  }
  return FALLBACK_VERSES;
};

const extractVerseMeta = (verse) => {
  if (verse.verseRef && verse.version) {
    return {
      reference: verse.verseRef,
      version: verse.version,
      displayRef: verse.ref || `${verse.verseRef} (${verse.version})`
    };
  }

  const rawRef = (verse.ref || verse.reference || '').trim();
  const match = rawRef.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (match) {
    return {
      reference: match[1].trim(),
      version: match[2].trim(),
      displayRef: rawRef
    };
  }

  const version = verse.version || 'RVR1960';
  return {
    reference: rawRef,
    version,
    displayRef: rawRef ? `${rawRef} (${version})` : version
  };
};

export default function Home({ navigateToBibleReference }) {
  const [verses, setVerses] = useState(getInitialVerses);
  const [activeIndex, setActiveIndex] = useState(0);
  const [toastMsg, setToastMsg] = useState('');

  // Modal de imagen del versículo diario
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [verseImageData, setVerseImageData] = useState(null);
  const [activeVerseForImage, setActiveVerseForImage] = useState(null);
  const [imageFeedback, setImageFeedback] = useState('');

  // Modal de historial de lectura
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [readingHistory, setReadingHistory] = useState([]);

  const scrollRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const closeImageModalState = () => {
    setImageModalOpen(false);
    setImageFeedback('');
    setVerseImageData(null);
    setActiveVerseForImage(null);
  };

  // Gesto/botón atrás cierra los modales del Home sin salir de la app
  const modalDepth = (imageModalOpen ? 1 : 0) + (historyModalOpen ? 1 : 0);

  useBackHandler(() => {
    if (historyModalOpen) {
      setHistoryModalOpen(false);
      return true;
    }
    if (imageModalOpen) {
      closeImageModalState();
      return true;
    }
    return false;
  }, modalDepth);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(''), 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (verseImageData?.previewUrl) {
        URL.revokeObjectURL(verseImageData.previewUrl);
      }
    };
  }, [verseImageData]);

  useEffect(() => {
    let isCancelled = false;

    const loadDailyVerses = async () => {
      try {
        const snap = await getDoc(doc(db, 'dailyVerses', 'current'));
        if (!isCancelled && snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.verses) && data.verses.length > 0) {
            setVerses(data.verses);
            localStorage.setItem(DAILY_VERSES_CACHE_KEY, JSON.stringify(data.verses));
          }
        }
      } catch (error) {
        console.warn('Sin conexión para actualizar versículos diarios, usando copia local:', error);
      }
    };

    loadDailyVerses();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleOpenHistoryModal = () => {
    setReadingHistory(getReadingHistory());
    setHistoryModalOpen(true);
  };

  const handleCloseHistoryModal = () => {
    setHistoryModalOpen(false);
    popNavStateSilently();
  };

  const handleSelectHistoryItem = (item) => {
    setHistoryModalOpen(false);
    if (navigateToBibleReference) {
      navigateToBibleReference(item.version, item.bookId, item.chapterId);
    }
  };

  const handleScroll = (e) => {
    const width = e.target.offsetWidth;
    if (!width) return;
    const newIndex = Math.round(e.target.scrollLeft / width);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  const goToSlide = (targetIndex) => {
    if (!scrollRef.current) return;
    const clamped = Math.max(0, Math.min(verses.length - 1, targetIndex));
    scrollRef.current.scrollTo({
      left: clamped * scrollRef.current.offsetWidth,
      behavior: 'smooth'
    });
    setActiveIndex(clamped);
  };

  const handleCopyVerse = async (verse) => {
    const { displayRef } = extractVerseMeta(verse);
    const textToCopy = `“${verse.text}”\n— ${displayRef}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        showToast('Versículo copiado');
        return;
      } catch {
        // Continúa con el fallback
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(copied ? 'Versículo copiado' : 'No se pudo copiar el versículo');
    } catch {
      showToast('No se pudo copiar el versículo');
    }
  };

  const renderDailyVerseImage = async (verse, forcedBgUrl = null) => {
    const { reference, version } = extractVerseMeta(verse);
    const safeFileName =
      `FaithPath-${reference || 'versiculo'}`.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';

    setGeneratingImage(true);
    setImageFeedback('');

    try {
      const { blob, previewUrl, backgroundUrl } = await generateVerseImage({
        verseText: verse.text,
        reference,
        version,
        isNewTestament: false,
        backgroundUrl: forcedBgUrl
      });

      setVerseImageData({
        blob,
        previewUrl,
        backgroundUrl,
        reference,
        fileName: safeFileName
      });
    } catch (err) {
      console.error('Error al generar la imagen del versículo diario:', err);
      setImageFeedback('No se pudo generar la imagen. Intenta nuevamente.');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleOpenImageModal = (verse) => {
    setActiveVerseForImage(verse);
    setImageModalOpen(true);
    renderDailyVerseImage(verse);
  };

  const handleChangeBackground = () => {
    if (!activeVerseForImage || generatingImage) return;
    const nextBg = getRandomBackgroundUrl(verseImageData?.backgroundUrl);
    renderDailyVerseImage(activeVerseForImage, nextBg);
  };

  const handleCloseImageModal = () => {
    closeImageModalState();
    popNavStateSilently();
  };

  const handleDownloadVerseImage = () => {
    if (!verseImageData?.previewUrl) return;
    const link = document.createElement('a');
    link.href = verseImageData.previewUrl;
    link.download = verseImageData.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setImageFeedback('Imagen descargada.');
  };

  const handleShareVerseImage = async () => {
    if (!verseImageData?.blob) return;

    const file = new File([verseImageData.blob], verseImageData.fileName, {
      type: 'image/png'
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: verseImageData.reference
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Error al compartir imagen:', err);
      }
    }

    handleDownloadVerseImage();
    setImageFeedback('Tu navegador no admite envío directo: imagen descargada.');
  };

  return (
    <div className="home-container">
      <div
        className="home-background"
        style={{ backgroundImage: backgroundImages[0], opacity: activeIndex === 0 ? 1 : 0 }}
      />
      <div
        className="home-background"
        style={{ backgroundImage: backgroundImages[1], opacity: activeIndex === 1 ? 1 : 0 }}
      />

      {/* Columna principal: separa título y versículo para evitar superposiciones */}
      <div className="home-foreground">
        <div className="home-top-bar">
          <button
            type="button"
            className="home-history-btn"
            onClick={handleOpenHistoryModal}
            title="Historial de lectura"
            aria-label="Historial de lectura"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </button>

          <VersionSelector />
        </div>

        <div className="home-title-container">
          <h1 className="home-logo">
            <span className="logo-faith">Faith</span>
            <span className="logo-path">Path</span>
          </h1>
          <p className="home-subtitle">Biblia Interactiva</p>
        </div>

        {/* Zona deslizable inferior con scroll interno seguro si el texto es largo */}
        <div className="home-swipe-stage">
          <div className="home-swipe-area" ref={scrollRef} onScroll={handleScroll}>
            {verses.map((verse, index) => {
              const { displayRef } = extractVerseMeta(verse);
              const charLen = verse.text?.length || 0;
              const lengthClass =
                charLen > 300 ? 'is-very-long' : charLen > 170 ? 'is-long' : '';

              return (
                <div key={index} className="home-verse-slide">
                  <div className={`home-verse-content ${lengthClass}`}>
                    <p className="home-verse-text">“{verse.text}”</p>
                    <p className="home-verse-ref">{displayRef}</p>

                    <div className="home-verse-actions">
                      <button
                        type="button"
                        className="home-action-btn"
                        onClick={() => handleCopyVerse(verse)}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copiar</span>
                      </button>

                      <button
                        type="button"
                        className="home-action-btn"
                        onClick={() => handleOpenImageModal(verse)}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>Imagen</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Flechas laterales de navegación (solo visibles en PC) */}
          {verses.length > 1 && (
            <>
              <button
                type="button"
                className="home-nav-arrow prev"
                onClick={() => goToSlide(activeIndex - 1)}
                disabled={activeIndex <= 0}
                aria-label="Versículo anterior"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <button
                type="button"
                className="home-nav-arrow next"
                onClick={() => goToSlide(activeIndex + 1)}
                disabled={activeIndex >= verses.length - 1}
                aria-label="Versículo siguiente"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Indicadores en la parte inferior */}
        <div className="home-indicators-wrapper">
          <div className="home-indicators">
            {verses.map((_, i) => (
              <div key={i} className={`home-dot ${activeIndex === i ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Modal de historial reciente (cierre exclusivo con botón) */}
      {historyModalOpen && (
        <div className="home-image-modal-backdrop">
          <div className="home-image-modal-box home-history-modal-box">
            <div className="home-image-modal-header">
              <h3>Historial reciente</h3>
              <button
                type="button"
                className="home-image-close-btn"
                onClick={handleCloseHistoryModal}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {readingHistory.length === 0 ? (
              <div className="home-history-empty">
                <p>Todavía no hay lecturas registradas.</p>
                <span>Los últimos 10 capítulos que abras en la Biblia aparecerán aquí.</span>
              </div>
            ) : (
              <div className="home-history-list">
                {readingHistory.map((item) => (
                  <button
                    key={`${item.bookId}-${item.chapterId}`}
                    type="button"
                    className="home-history-item"
                    onClick={() => handleSelectHistoryItem(item)}
                  >
                    <span
                      className={`home-history-dot ${item.isNewTestament ? 'is-nt' : ''}`}
                    />
                    <div className="home-history-info">
                      <strong>
                        {item.bookName} {item.chapterId}
                      </strong>
                      <span>
                        {item.version} · {formatHistoryTime(item.readAt)}
                      </span>
                    </div>
                    <span className="home-history-arrow">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de vista previa de imagen (cierre exclusivo con botón) */}
      {imageModalOpen && (
        <div className="home-image-modal-backdrop">
          <div className="home-image-modal-box">
            <div className="home-image-modal-header">
              <h3>Versículo del día</h3>
              <button
                type="button"
                className="home-image-close-btn"
                onClick={handleCloseImageModal}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="home-image-preview-wrap">
              {generatingImage ? (
                <p className="home-image-loading">Generando imagen...</p>
              ) : verseImageData?.previewUrl ? (
                <img
                  src={verseImageData.previewUrl}
                  alt={verseImageData.reference}
                  className="home-image-preview"
                />
              ) : (
                <p className="home-image-loading">No se pudo cargar la vista previa.</p>
              )}
            </div>

            <button
              type="button"
              className="home-image-reroll-btn"
              disabled={generatingImage}
              onClick={handleChangeBackground}
            >
              Otro fondo
            </button>

            {imageFeedback && <p className="home-image-feedback">{imageFeedback}</p>}

            <div className="home-image-modal-actions">
              <button
                type="button"
                className="home-image-btn-primary"
                disabled={generatingImage || !verseImageData}
                onClick={handleShareVerseImage}
              >
                Compartir
              </button>
              <button
                type="button"
                className="home-image-btn-secondary"
                disabled={generatingImage || !verseImageData}
                onClick={handleDownloadVerseImage}
              >
                Descargar
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="home-toast">{toastMsg}</div>}
    </div>
  );
}