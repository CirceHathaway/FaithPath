import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import './Devotional.css';
import { rv1960 } from '../data/rv1960';
import { rvc } from '../data/rvc';
import { nvi } from '../data/nvi';

const DEVOTIONALS_CACHE_KEY = 'devotionals_offline_cache';

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export default function Devotional({ navigateToBibleReference }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [devotionalData, setDevotionalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [editForm, setEditForm] = useState({
    title: '',
    introText: '',
    verseRef: '',
    verseVersion: 'RVR1960',
    bodyText: '',
    conclusionText: ''
  });

  const dateKey = formatDateKey(currentDate);
  const displayDate = currentDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

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
          setDevotionalData(synced[dateKey]);
          setLoading(false);
        }
      } catch (error) {
        // Sin conexión: se usa el caché existente sin romper la vista
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
        setDevotionalData(cachedItem);
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
            setDevotionalData(cleanData);

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

  const handleCreateNew = () => {
    setEditForm({
      title: '',
      introText: '',
      verseRef: '',
      verseVersion: 'RVR1960',
      bodyText: '',
      conclusionText: ''
    });
    setIsEditing(true);
  };

  const handleEditExisting = () => {
    setEditForm({
      title: devotionalData.title || '',
      introText: devotionalData.introText || '',
      verseRef: devotionalData.verseRef || '',
      verseVersion: devotionalData.verseVersion || 'RVR1960',
      bodyText: devotionalData.bodyText || '',
      conclusionText: devotionalData.conclusionText || ''
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editForm.title.trim() || !editForm.verseRef.trim() || !editForm.bodyText.trim()) {
      alert('Completa al menos el título, la cita bíblica y el desarrollo.');
      return;
    }

    let finalData;
    try {
      const refParts = editForm.verseRef.trim().split(/\s+/);
      const chapterVerse = refParts.pop();
      const bookName = refParts.join(' ');
      const [chapterStr, verseStr] = chapterVerse.split(':');

      if (!chapterStr || !verseStr) {
        throw new Error('Formato inválido');
      }

      const chapterId = parseInt(chapterStr, 10);

      let startVerse, endVerse;
      if (verseStr.includes('-')) {
        const [start, end] = verseStr.split('-');
        startVerse = parseInt(start, 10);
        endVerse = parseInt(end, 10);
      } else {
        startVerse = parseInt(verseStr, 10);
        endVerse = startVerse;
      }

      if (isNaN(chapterId) || isNaN(startVerse) || isNaN(endVerse) || startVerse > endVerse) {
        throw new Error('Números inválidos');
      }

      let bibleData = rv1960;
      if (editForm.verseVersion === 'RVC') bibleData = rvc;
      if (editForm.verseVersion === 'NVI') bibleData = nvi;

      const book = bibleData.books.find((b) => b.name.toLowerCase() === bookName.toLowerCase());
      if (!book) {
        alert('No se encontró el libro. Revisa la ortografía.');
        return;
      }

      const chapter = book.chapters.find((c) => c.chapterNumber === chapterId);
      if (!chapter) {
        alert('No se encontró el capítulo indicado.');
        return;
      }

      let combinedVerseText = '';
      for (let i = startVerse; i <= endVerse; i++) {
        const verse = chapter.verses.find((v) => v.number === i);
        if (!verse) {
          alert(`No se encontró el versículo ${i}.`);
          return;
        }
        combinedVerseText += (i === startVerse ? '' : ' ') + verse.text;
      }

      const formattedRef = `${book.name} ${chapterId}:${verseStr} ${editForm.verseVersion}`;

      finalData = {
        ...editForm,
        verseText: combinedVerseText,
        formattedRef,
        bookId: book.id,
        chapterId,
        verseId: startVerse,
        dateKey
      };
    } catch (error) {
      alert("Formato de cita incorrecto. Usa el formato 'Libro Capítulo:Versículo' o 'Libro Capítulo:Inicio-Fin' (Ej: Salmos 51:10-12)");
      return;
    }

    setSaving(true);
    try {
      // Actualiza caché local primero
      const updatedCache = readDevotionalsCache();
      updatedCache[dateKey] = finalData;
      writeDevotionalsCache(updatedCache);

      const docRef = doc(db, 'devotionals', dateKey);
      await setDoc(docRef, {
        ...finalData,
        updatedAt: serverTimestamp()
      });

      setDevotionalData(finalData);
      setIsEditing(false);
    } catch (error) {
      console.error('Error al guardar en Firestore:', error);
      alert('No se pudo guardar en la nube. Verifica tu conexión o los permisos de administrador.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerseClick = () => {
    if (devotionalData && devotionalData.bookId) {
      navigateToBibleReference(
        devotionalData.verseVersion,
        devotionalData.bookId,
        devotionalData.chapterId,
        devotionalData.verseId
      );
    }
  };

  const handleShare = () => {
    if (!devotionalData) return;

    const appLink = '\n\n📲 Lee más devocionales y la Biblia interactiva en FaithPath: https://tu-app-url.com';

    const textToShare = `${devotionalData.title}\n\n${devotionalData.introText ? devotionalData.introText + '\n\n' : ''}"${devotionalData.verseText}"\n- ${devotionalData.formattedRef}\n\n${devotionalData.bodyText}\n\n${devotionalData.conclusionText ? devotionalData.conclusionText : ''}${appLink}`.trim();

    if (navigator.share) {
      navigator.share({ title: devotionalData.title, text: textToShare }).catch(console.error);
    } else {
      navigator.clipboard.writeText(textToShare);
      alert('Devocional copiado al portapapeles.');
    }
  };

  const DecorativeSeparator = () => (
    <div className="devotional-separator">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#cf666d">
        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
      </svg>
    </div>
  );

  return (
    <div className="devotional-container">
      <div className="devotional-date-header">
        <button className="date-nav-btn" onClick={() => changeDay(-1)}>‹</button>
        <span className="date-display">{displayDate}</span>
        <button className="date-nav-btn" onClick={() => changeDay(1)}>›</button>
      </div>

      <p className="devotional-top-label">Devocional de hoy</p>

      {isEditing ? (
        <div className="devotional-editor">
          <input
            type="text"
            placeholder="Título principal"
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
          />
          <textarea
            placeholder="Introducción (Opcional)"
            rows="3"
            value={editForm.introText}
            onChange={(e) => setEditForm({ ...editForm, introText: e.target.value })}
          />
          <div className="verse-input-group">
            <input
              type="text"
              placeholder="Cita (Ej: Salmos 51:10-12)"
              value={editForm.verseRef}
              onChange={(e) => setEditForm({ ...editForm, verseRef: e.target.value })}
            />
            <select
              value={editForm.verseVersion}
              onChange={(e) => setEditForm({ ...editForm, verseVersion: e.target.value })}
            >
              <option value="RVR1960">RV 1960</option>
              <option value="RVC">RVC</option>
              <option value="NVI">NVI</option>
            </select>
          </div>
          <textarea
            placeholder="Desarrollo del devocional (Separa los párrafos con Enter)"
            rows="6"
            value={editForm.bodyText}
            onChange={(e) => setEditForm({ ...editForm, bodyText: e.target.value })}
          />
          <textarea
            placeholder="Conclusión (Opcional)"
            rows="3"
            value={editForm.conclusionText}
            onChange={(e) => setEditForm({ ...editForm, conclusionText: e.target.value })}
          />
          <div className="editor-actions">
            <button onClick={() => setIsEditing(false)} disabled={saving}>Cancelar</button>
            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="devotional-empty">
          <p className="devotional-loading">Cargando devocional...</p>
        </div>
      ) : devotionalData ? (
        <div className="devotional-content">
          <h1 className="devotional-title">{devotionalData.title}</h1>
          <hr className="devotional-line" />

          {devotionalData.introText && (
            <div className="devotional-body">
              <p>{devotionalData.introText}</p>
            </div>
          )}

          <div className="devotional-verse-card" style={{ marginTop: '30px' }} onClick={handleVerseClick}>
            <p className="devotional-verse-ref">{devotionalData.formattedRef}</p>
            <p className="devotional-verse-text">“{devotionalData.verseText}”</p>
            <div className="verse-card-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
                <circle cx="12" cy="5" r="1" />
              </svg>
            </div>
          </div>

          <DecorativeSeparator />

          <div className="devotional-body">
            {devotionalData.bodyText.split('\n').map((paragraph, index, array) => {
              if (!paragraph.trim()) return null;
              return (
                <React.Fragment key={index}>
                  <p>{paragraph}</p>
                  {index < array.length - 1 && <DecorativeSeparator />}
                </React.Fragment>
              );
            })}
          </div>

          {devotionalData.conclusionText && (
            <>
              <DecorativeSeparator />
              <div className="devotional-body conclusion">
                <p>{devotionalData.conclusionText}</p>
              </div>
            </>
          )}

          <div className="devotional-bottom-actions">
            <button className="share-btn-ghost" onClick={handleShare}>
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" style={{ marginRight: '8px' }}>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Compartir
            </button>
            {isAdmin && (
              <button className="edit-btn-ghost" onClick={handleEditExisting}>Editar</button>
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
    </div>
  );
}