import React, { useState, useRef } from 'react';
import { useBible } from '../context/BibleContext';
import './Favoritos.css';
import { rv1960 } from '../data/rv1960';
import { rvc } from '../data/rvc';       
import { nvi } from '../data/nvi'; 

const bibleDataMap = { 'RVR1960': rv1960, 'RVC': rvc, 'NVI': nvi };

export default function Favoritos({ navigateToBibleReference }) {
  const { highlightedVerses, removeFavorite } = useBible();

  // Estado para saber qué tarjeta está en "modo selección/opciones"
  const [activeOptionsId, setActiveOptionsId] = useState(null);
  
  // Ref para el temporizador del long press
  const pressTimer = useRef(null);

  const getVerseDetails = (highlightString) => {
    const parts = highlightString.split('-');
    if (parts.length < 4) return null;
    
    const version = parts[0];
    const bookId = parseInt(parts[1]);
    const chapterId = parseInt(parts[2]);
    const verseNumber = parseInt(parts[3]);

    const bibleData = bibleDataMap[version];
    if (!bibleData) return null;

    const book = bibleData.books.find(b => b.id === bookId);
    if (!book) return null;

    const chapter = book.chapters.find(c => c.chapterNumber === chapterId);
    if (!chapter) return null;

    const verse = chapter.verses.find(v => v.number === verseNumber);
    if (!verse) return null;

    return {
      id: highlightString,
      version: version,
      bookName: book.name,
      bookId: book.id,
      chapterId: chapter.chapterNumber,
      verseNumber: verse.number,
      text: verse.text,
      testament: book.testament
    };
  };

  const favoriteItems = highlightedVerses.map(getVerseDetails).filter(Boolean);

  // --- LÓGICA LONG PRESS ---
  const handlePressStart = (id) => {
    pressTimer.current = setTimeout(() => {
      setActiveOptionsId(id);
    }, 600); // 600ms = Mantener apretado
  };

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  // --- ACCIONES ---
  const handleCardClick = (fav) => {
    // Si hay unas opciones abiertas y tocas otra parte, las cierra
    if (activeOptionsId) {
      setActiveOptionsId(null);
      return;
    }
    // CORRECCIÓN: Agregamos el cuarto parámetro (fav.verseNumber)
    navigateToBibleReference(fav.version, fav.bookId, fav.chapterId, fav.verseNumber);
  };

  const handleDelete = (e, id) => {
    e.stopPropagation(); // Evita que se abra el modo lectura
    removeFavorite(id);
    setActiveOptionsId(null);
  };

  const handleShare = (e, fav) => {
    e.stopPropagation();
    const textToShare = `${fav.bookName} ${fav.chapterId}:${fav.verseNumber} (${fav.version})\n"${fav.text}"`;
    if (navigator.share) {
      navigator.share({ title: 'Compartir Versículo', text: textToShare }).catch(console.error);
    } else {
      navigator.clipboard.writeText(textToShare);
      alert("Versículo copiado al portapapeles.");
    }
    setActiveOptionsId(null);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Tus Favoritos</h1>
      
      {favoriteItems.length === 0 ? (
        <div style={styles.emptyState}>
          <svg viewBox="0 0 24 24" width="48" height="48" stroke="#444" strokeWidth="1" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          <p style={styles.emptyText}>Aún no has resaltado ningún versículo.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {favoriteItems.map((fav) => {
            const isNT = fav.testament === 'Nuevo Testamento';
            const isOptionsActive = activeOptionsId === fav.id;

            return (
              <div 
                key={fav.id} 
                className={`fav-card ${isOptionsActive ? 'active-options' : ''}`}
                style={styles.favCard}
                onClick={() => handleCardClick(fav)}
                onMouseDown={() => handlePressStart(fav.id)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={() => handlePressStart(fav.id)}
                onTouchEnd={handlePressEnd}
              >
                <div style={{...styles.favHeader, color: isNT ? '#4ade80' : '#cf666d'}}>
                  {fav.bookName} {fav.chapterId}:{fav.verseNumber} <span style={styles.versionTag}>({fav.version})</span>
                </div>
                <p style={styles.favText}>"{fav.text}"</p>

                {/* Capa oscura y botones si se mantuvo apretado */}
                {isOptionsActive && (
                  <div style={styles.optionsOverlay}>
                    <button style={styles.optionBtn} onClick={(e) => handleShare(e, fav)}>
                      <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      Compartir
                    </button>
                    <button style={{...styles.optionBtn, color: '#ff4d4d'}} onClick={(e) => handleDelete(e, fav.id)}>
                      <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { height: '100%', backgroundColor: '#050505', color: '#fff', display: 'flex', flexDirection: 'column' },
  header: { padding: '30px 20px 20px', fontSize: '28px', fontWeight: 'bold', borderBottom: '1px solid #1a1a1a' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '15px' },
  emptyText: { color: '#666', fontSize: '16px' },
  list: { padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', paddingBottom: '100px' },
  favCard: { backgroundColor: '#111', border: '1px solid #222', borderRadius: '15px', padding: '20px', cursor: 'pointer', position: 'relative', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' },
  favHeader: { fontSize: '14px', fontWeight: '600', marginBottom: '10px' },
  versionTag: { color: '#666', fontSize: '12px', fontWeight: 'normal' },
  favText: { color: '#eee', fontSize: '16px', lineHeight: '1.5' },
  optionsOverlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', backdropFilter: 'blur(2px)' },
  optionBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#fff', fontSize: '12px', cursor: 'pointer', outline: 'none' }
};