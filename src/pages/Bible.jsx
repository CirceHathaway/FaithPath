import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useBible } from '../context/BibleContext';
import './Bible.css';
import { rv1960 } from '../data/rv1960';
import { rvc } from '../data/rvc';
import { nvi } from '../data/nvi';

const bibleDataMap = {
  'RVR1960': rv1960,
  'RVC': rvc,
  'NVI': nvi
};

const Bible = forwardRef(({ setIsReadingMode }, ref) => {
  const { activeVersion, setActiveVersion, isListViewGlobal, setIsListViewGlobal, highlightedVerses, setHighlightedVerses } = useBible();

  const [view, setView] = useState('libros');
  const [activeBookIndex, setActiveBookIndex] = useState(0);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  const [listViewBookSelected, setListViewBookSelected] = useState(null);
  const [lastListViewBook, setLastListViewBook] = useState(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [fontSizeOffset, setFontSizeOffset] = useState(100);

  const [selectedVerses, setSelectedVerses] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [parallelVersion, setParallelVersion] = useState('Desactivado');

  const scrollRef = useRef(null);
  const readingContainerRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  // Ref auxiliar para mantener sincronizado el resize sin interrumpir la inercia del scroll
  const activeIndicesRef = useRef({ book: 0, chapter: 0 });
  activeIndicesRef.current = { book: activeBookIndex, chapter: activeChapterIndex };

  const currentBibleData = bibleDataMap[activeVersion] || rv1960;
  const books = currentBibleData.books;
  const activeBook = books[activeBookIndex] || books[0];
  const isNewTestament = activeBook.testament === 'Nuevo Testamento';

  // Lee el ancho real del slot según el breakpoint (móvil, tablet o PC)
  const getItemWidth = () => {
    const item = scrollRef.current?.querySelector('.carousel-item');
    return item ? item.offsetWidth : 230;
  };

  useEffect(() => {
    if (setIsReadingMode) {
      setIsReadingMode(view === 'lectura');
    }
  }, [view, setIsReadingMode]);

  useEffect(() => {
    if (view !== 'lectura') {
      setParallelVersion('Desactivado');
    }
  }, [view]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      setView('libros');
      setActiveBookIndex(0);
      setActiveChapterIndex(0);
      setListViewBookSelected(null);
      setLastListViewBook(null);
      setSearchQuery('');
    },
    jumpToReading: (version, bookId, chapterId, verseId = null) => {
      setActiveVersion(version);
      const bibleToSearch = bibleDataMap[version] || rv1960;
      const bIndex = bibleToSearch.books.findIndex(b => b.id === bookId);
      if (bIndex >= 0) setActiveBookIndex(bIndex);

      setActiveChapterIndex(chapterId - 1);

      setView('lectura');
      setIsListViewGlobal(false);
      setListViewBookSelected(null);
      setLastListViewBook(null);
      setIsSummaryOpen(true);
      setIsScrolled(false);
      setSelectedVerses([]);

      if (verseId) {
        setTimeout(() => {
          const element = document.getElementById('verse-' + verseId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-animation');
            setTimeout(() => {
              if (element) element.classList.remove('highlight-animation');
            }, 3000);
          }
        }, 400);
      }
    }
  }));

  const chaptersData = activeBook.chapters.map((capitulo) => {
    const primerVersiculo = capitulo.verses && capitulo.verses.length > 0 ? capitulo.verses[0].text : '';
    const snippet = primerVersiculo ? `"${primerVersiculo.substring(0, 50)}..."` : 'Iniciar lectura...';

    return {
      id: capitulo.chapterNumber,
      title: `${capitulo.chapterNumber} CAP.`,
      desc: snippet,
      summary: capitulo.summary || 'Resumen no disponible para este capítulo.',
      verses: capitulo.verses
    };
  });

  const activeChapter = chaptersData[activeChapterIndex];

  const resetReadingState = () => {
    setIsSummaryOpen(true);
    setIsScrolled(false);
    setSelectedVerses([]);
    if (readingContainerRef.current) {
      readingContainerRef.current.scrollTop = 0;
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current || view === 'lectura' || isListViewGlobal) return;
    const scrollPosition = scrollRef.current.scrollLeft;
    const itemWidth = getItemWidth();
    const index = Math.round(scrollPosition / itemWidth);

    if (view === 'libros') {
      if (index !== activeBookIndex && index >= 0 && index < books.length) {
        setActiveBookIndex(index);
        setActiveChapterIndex(0);
      }
    } else if (view === 'capitulos') {
      if (index === 0) {
        setView('libros');
      } else {
        const newChapIndex = index - 1;
        if (newChapIndex !== activeChapterIndex && newChapIndex >= 0 && newChapIndex < chaptersData.length) {
          setActiveChapterIndex(newChapIndex);
        }
      }
    }
  };

  const handleCardClick = (index) => {
    const activeIndex = view === 'libros' ? activeBookIndex : activeChapterIndex + 1;

    if (index === activeIndex) {
      if (view === 'libros') {
        setView('capitulos');
      } else if (view === 'capitulos') {
        setView('lectura');
        resetReadingState();
        setLastListViewBook(null);
      }
    } else {
      if (view === 'capitulos' && index === 0) {
        setView('libros');
      } else if (scrollRef.current) {
        scrollRef.current.scrollTo({ left: index * getItemWidth(), behavior: 'smooth' });
      }
    }
  };

  // Navegación del carrusel por botones para PC
  const scrollCarouselBy = (delta) => {
    if (view === 'capitulos' && activeChapterIndex === 0 && delta < 0) {
      setView('libros');
      return;
    }

    const dataLength = view === 'libros' ? books.length : chaptersData.length + 1;
    const currentIndex = view === 'libros' ? activeBookIndex : activeChapterIndex + 1;
    const targetIndex = Math.max(0, Math.min(dataLength - 1, currentIndex + delta));

    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        left: targetIndex * getItemWidth(),
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const syncScrollPosition = () => {
      if (scrollRef.current && view !== 'lectura' && !isListViewGlobal) {
        const targetIndex =
          view === 'libros'
            ? activeIndicesRef.current.book
            : activeIndicesRef.current.chapter + 1;
        scrollRef.current.scrollLeft = targetIndex * getItemWidth();
      }
    };

    syncScrollPosition();
    window.addEventListener('resize', syncScrollPosition);
    return () => window.removeEventListener('resize', syncScrollPosition);
  }, [view, isListViewGlobal]);

  useEffect(() => {
    setSelectedVerses([]);
    if (activeVersion === parallelVersion) {
      setParallelVersion('Desactivado');
    }
  }, [activeVersion, parallelVersion]);

  const goToNextChapter = () => {
    if (activeChapterIndex < chaptersData.length - 1) {
      setActiveChapterIndex(activeChapterIndex + 1);
      resetReadingState();
    } else if (activeBookIndex < books.length - 1) {
      setActiveBookIndex(activeBookIndex + 1);
      setActiveChapterIndex(0);
      resetReadingState();
    }
  };

  const goToPrevChapter = () => {
    if (activeChapterIndex > 0) {
      setActiveChapterIndex(activeChapterIndex - 1);
      resetReadingState();
    } else if (activeBookIndex > 0) {
      const prevBook = books[activeBookIndex - 1];
      setActiveBookIndex(activeBookIndex - 1);
      setActiveChapterIndex(prevBook.chapters.length - 1);
      resetReadingState();
    }
  };

  const handleReadingScroll = (e) => { setIsScrolled(e.target.scrollTop > 35); };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchStartX.current - touchEndX;
    const deltaY = touchStartY.current - touchEndY;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    if (deltaX > 60) {
      goToNextChapter();
    } else if (deltaX < -60) {
      goToPrevChapter();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const toggleSelection = (verseNumber) => { setSelectedVerses(prev => prev.includes(verseNumber) ? prev.filter(v => v !== verseNumber) : [...prev, verseNumber]); };
  const handleContextMenu = (e, verseNumber) => { e.preventDefault(); if (!selectedVerses.includes(verseNumber)) toggleSelection(verseNumber); };
  const handleVerseClick = (verseNumber) => { if (selectedVerses.length > 0) toggleSelection(verseNumber); };

  const handleHighlight = () => {
    const newHighlights = selectedVerses.map(v => `${activeVersion}-${activeBook.id}-${activeChapter.id}-${v}`);

    setHighlightedVerses(prev => {
      let updatedHighlights = [...prev];
      newHighlights.forEach(highlightItem => {
        if (updatedHighlights.includes(highlightItem)) {
          updatedHighlights = updatedHighlights.filter(item => item !== highlightItem);
        } else {
          updatedHighlights.push(highlightItem);
        }
      });
      return updatedHighlights;
    });

    setSelectedVerses([]);
  };

  const getSelectedText = () => {
    const sortedVerses = [...selectedVerses].sort((a, b) => a - b);
    const textLines = sortedVerses.map(vNum => `${vNum}. ${activeChapter.verses.find(v => v.number === vNum).text}`).join('\n');
    return `${activeBook.name} ${activeChapter.id} (${activeVersion})\n${textLines}`;
  };

  const handleCopy = () => { navigator.clipboard.writeText(getSelectedText()); setSelectedVerses([]); };
  const handleShare = () => { if (navigator.share) navigator.share({ title: `${activeBook.name} ${activeChapter.id}`, text: getSelectedText() }).catch(console.error); else { handleCopy(); alert("Copiado."); } setSelectedVerses([]); };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim().length > 0 && !isListViewGlobal) {
      setIsListViewGlobal(true);
      setListViewBookSelected(null);
    }
  };

  const getParallelVerseText = (verseNumber) => {
    if (parallelVersion === 'Desactivado') return null;
    const parallelData = bibleDataMap[parallelVersion];
    if (!parallelData) return null;
    const pBook = parallelData.books.find(b => b.name === activeBook.name);
    if (!pBook) return "Libro no encontrado en esta versión";
    const pChapter = pBook.chapters.find(c => c.chapterNumber === activeChapter.id);
    if (!pChapter) return "Capítulo no encontrado en esta versión";
    const pVerse = pChapter.verses.find(v => v.number === verseNumber);
    if (!pVerse) return "Versículo no encontrado en esta versión";
    return pVerse.text;
  };

  const parallelOptions = Object.keys(bibleDataMap).filter(key => key !== activeVersion);

  const renderListView = () => {
    if (listViewBookSelected) {
      const isNTList = listViewBookSelected.testament === 'Nuevo Testamento';
      return (
        <div
          key={`list-chapters-${listViewBookSelected.id}`}
          className={`list-view-container ${isNTList ? 'list-theme-nt' : ''}`}
        >
          <div className="list-chapter-header" onClick={() => setListViewBookSelected(null)}>
            <h2 className="list-book-name">{listViewBookSelected.name} <span className="arrow-down">˅</span></h2>
            <p className="list-book-desc">{listViewBookSelected.desc}</p>
          </div>
          <div className="chapter-grid">
            {listViewBookSelected.chapters.map((cap, i) => (
              <button
                key={i}
                className="chapter-grid-btn"
                onClick={() => {
                  const realIndex = books.findIndex(b => b.id === listViewBookSelected.id);
                  setActiveBookIndex(realIndex);
                  setActiveChapterIndex(i);
                  setLastListViewBook(listViewBookSelected);
                  setListViewBookSelected(null);
                  setSearchQuery('');
                  setView('lectura');
                  resetReadingState();
                }}
              >
                {cap.chapterNumber}
              </button>
            ))}
          </div>
        </div>
      );
    }

    let currentTestament = '';
    let currentType = '';

    const filteredBooks = books.filter(book =>
      book.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filteredBooks.length === 0) {
      return (
        <div key="list-empty" className="list-view-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#666' }}>
          <p>No se encontraron libros.</p>
        </div>
      );
    }

    return (
      <div key="list-books" className="list-view-container">
        {filteredBooks.map((book) => {
          const elements = [];
          const isNTList = book.testament === 'Nuevo Testamento';
          const headerColorClass = isNTList ? 'list-header-nt' : 'list-header-at';

          if (searchQuery.trim().length === 0) {
            if (book.testament !== currentTestament) {
              elements.push(<h2 key={`test-${book.testament}`} className={`list-testament-title ${headerColorClass}`}>{book.testament}</h2>);
              currentTestament = book.testament;
            }
            if (book.type !== currentType) {
              elements.push(<h3 key={`type-${book.type}`} className={`list-type-title ${headerColorClass}`}>{book.type}</h3>);
              currentType = book.type;
            }
          }

          elements.push(
            <div
              key={`book-${book.id}`}
              id={`list-book-${book.id}`}
              className="list-book-row"
              onClick={() => {
                setListViewBookSelected(book);
                setSearchQuery('');
              }}
            >
              <span className="list-book-name">{book.name}</span>
              <span className="list-arrow">›</span>
            </div>
          );

          return elements;
        })}
      </div>
    );
  };

  if (view === 'lectura') {
    return (
      <div className={`reading-view ${isNewTestament ? 'theme-nt' : ''}`}>
        <div className={`reading-header ${isScrolled ? 'scrolled' : ''}`}>
          <div className="reading-header-text">
            <p className="reading-book-desc">{activeBook.desc}</p>
            <h2 className="reading-title">{activeBook.name} <span className="chapter-number">{activeChapter.id}</span></h2>
          </div>
          <button className="options-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
          </button>
        </div>

        {isMenuOpen && (
          <>
            <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}></div>
            <div className="options-menu">
              <div className="menu-row font-size-row">
                <span className="font-icon">Tt</span>
                <div className="font-controls">
                  <button className="font-btn" onClick={() => setFontSizeOffset(Math.max(50, fontSizeOffset - 10))}>-</button>
                  <span className="font-percentage">{fontSizeOffset}%</span>
                  <button className="font-btn" onClick={() => setFontSizeOffset(Math.min(200, fontSizeOffset + 10))}>+</button>
                </div>
              </div>
              <div className="menu-select-container"><select className="menu-select"><option>Sin serifa</option><option>Con serifa</option></select><span className="menu-select-arrow">˅</span></div>
              <div className="menu-section-title"><span className="menu-icon">文A</span> Versiones <span className="menu-arrow-right">›</span></div>
              <div className="menu-select-container"><select className="menu-select" value={activeVersion} onChange={(e) => setActiveVersion(e.target.value)}><option value="RVR1960">Reina Valera 1960</option><option value="RVC">Reina Valera Contemporánea</option><option value="NVI">Nueva Versión Internacional</option></select><span className="menu-select-arrow">˅</span></div>
              <div className="menu-section-title"><span className="menu-icon">📄</span> Elegir versión paralela</div>
              <div className="menu-select-container">
                <select className="menu-select" value={parallelVersion} onChange={(e) => setParallelVersion(e.target.value)}>
                  <option value="Desactivado">Desactivado</option>
                  {parallelOptions.map(opt => (
                    <option key={opt} value={opt}>
                      {opt === 'RVR1960' ? 'Reina Valera 1960' : opt === 'RVC' ? 'Reina Valera Contemporánea' : 'Nueva Versión Internacional'}
                    </option>
                  ))}
                </select>
                <span className="menu-select-arrow">˅</span>
              </div>
            </div>
          </>
        )}

        <div className="verses-container" ref={readingContainerRef} onScroll={handleReadingScroll} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="summary-toggle" onClick={() => setIsSummaryOpen(!isSummaryOpen)}>{activeBook.name} {activeChapter.id} resumen {isSummaryOpen ? '∧' : '∨'}</div>
          {isSummaryOpen && <div className="summary-box"><p>{activeChapter.summary}</p></div>}
          <div className="verses-list" style={{ fontSize: `${(fontSizeOffset / 100) * 19}px` }}>
            {activeChapter.verses.map((v) => {
              const isSelected = selectedVerses.includes(v.number);
              const isHighlighted = highlightedVerses.includes(`${activeVersion}-${activeBook.id}-${activeChapter.id}-${v.number}`);
              const parallelText = getParallelVerseText(v.number);

              return (
                <React.Fragment key={v.number}>
                  {v.title && <h3 className="verse-section-title" style={{ fontSize: `${(fontSizeOffset / 100) * 20}px` }}>{v.title}</h3>}
                  <div
                    id={`verse-${v.number}`}
                    className={`verse-line ${isSelected ? 'selected' : ''}`}
                    onContextMenu={(e) => handleContextMenu(e, v.number)}
                    onClick={() => handleVerseClick(v.number)}
                  >
                    <p className={`verse-main ${isHighlighted ? 'highlighted' : ''}`}>
                      <strong className="verse-number" style={{ fontSize: `${(fontSizeOffset / 100) * 16}px` }}>{v.number}</strong> {v.text}
                    </p>
                    {parallelText && (
                      <p
                        className="verse-parallel"
                        style={{
                          fontSize: `${(fontSizeOffset / 100) * 17}px`,
                          borderLeft: `2px solid ${isNewTestament ? '#1a3b26' : '#4a1920'}`
                        }}
                      >
                        {parallelText}
                      </p>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <div className="chapter-nav-buttons">
            <button className="nav-btn prev-btn" onClick={goToPrevChapter}>
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
              <span>Anterior</span>
            </button>
            <button className="nav-btn next-btn" onClick={goToNextChapter}>
              <span>Siguiente</span>
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>

        {selectedVerses.length > 0 && (
          <div className="selection-toolbar">
            <span className="selection-count">{selectedVerses.length} seleccionados</span>
            <div className="selection-actions">
              <button className="action-btn" onClick={handleHighlight}><svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg><span>Resaltar</span></button>
              <button className="action-btn" onClick={handleCopy}><svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copiar</span></button>
              <button className="action-btn" onClick={handleShare}><svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span>Compartir</span></button>
            </div>
          </div>
        )}
        {selectedVerses.length === 0 && (
          <div className="fab-container">
            <button
              className="fab-btn"
              title="Volver a libros"
              onClick={() => {
                if (lastListViewBook) {
                  setIsListViewGlobal(true);
                  setView('libros');
                  setTimeout(() => {
                    const element = document.getElementById(`list-book-${lastListViewBook.id}`);
                    if (element) element.scrollIntoView({ behavior: 'auto', block: 'center' });
                  }, 100);
                } else {
                  setView('capitulos');
                  setIsListViewGlobal(false);
                }
                setListViewBookSelected(null);
              }}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  const renderCards = () => {
    const data = view === 'libros' ? books : [{ ...activeBook, isBookHeader: true }, ...chaptersData];
    const activeIndex = view === 'libros' ? activeBookIndex : activeChapterIndex + 1;

    return data.map((item, index) => {
      const isActive = index === activeIndex;
      const isPrev = index < activeIndex;
      const isNext = index > activeIndex;
      let transformStyle = 'scale(0.8) translateX(0)';
      let zIndex = 1;
      let opacity = 0.4;

      if (isActive) { transformStyle = 'scale(1) translateX(0)'; zIndex = 10; opacity = 1; }
      else if (isPrev) { transformStyle = 'scale(0.9) translateX(40px)'; zIndex = 5; opacity = 0.7; }
      else if (isNext) { transformStyle = 'scale(0.9) translateX(-40px)'; zIndex = 5; opacity = 0.7; }

      const isItemNT = item.testament === 'Nuevo Testamento';
      const isBookCard = view === 'libros' || item.isBookHeader;
      const cardTypeClass = isBookCard ? (isItemNT ? 'book-card-nt' : 'book-card') : 'chapter-card';

      const uniqueKey = `card-${isBookCard ? 'book' : 'chapter'}-${item.id}-${index}`;
      const isLongName =
        item.name === 'Deuteronomio' ||
        item.name === 'Lamentaciones' ||
        item.name === '1 Tesalonicenses' ||
        item.name === '2 Tesalonicenses';

      return (
        <div key={uniqueKey} className="carousel-item" style={{ zIndex: zIndex }} onClick={() => handleCardClick(index)}>
          <div className={`carousel-card ${cardTypeClass} ${isActive ? 'cursor-pointer' : ''}`} style={{ transform: transformStyle, opacity: opacity }}>
            {isBookCard ? (
              <>
                <p className="card-tag">{item.type || 'Libro'}</p>
                <h2 className={`card-title ${isLongName ? 'long-name' : ''}`}>{item.name}</h2>
                <p className="card-subtitle">{item.testament}</p>
                <p className="card-desc">{item.desc}</p>
              </>
            ) : (
              <>
                <h2 className="card-title chapter-title">{item.title}</h2>
                <p className="card-desc" style={{ fontStyle: 'italic' }}>{item.desc}</p>
              </>
            )}
          </div>
        </div>
      );
    });
  };

  const currentCarouselIndex = view === 'libros' ? activeBookIndex : activeChapterIndex + 1;
  const maxCarouselIndex = view === 'libros' ? books.length - 1 : chaptersData.length;

  return (
    <div className={`bible-container ${isNewTestament ? 'theme-nt' : ''}`}>
      <div className="search-bar-container">
        <div className="search-bar">
          <span className="search-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
          <input
            type="text"
            placeholder={`Buscar en ${currentBibleData.abbreviation}...`}
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {!isListViewGlobal && (
        <div className="dynamic-header">
          <h1 className="active-title">
            <span className="dot"></span>
            {view === 'libros' ? activeBook.name : `${activeBook.name} ${chaptersData[activeChapterIndex]?.id || 1}`}
          </h1>
          {view === 'capitulos' && (
            <p className="active-subtitle">Selecciona un capítulo para leer</p>
          )}
        </div>
      )}

      {isListViewGlobal ? (
        renderListView()
      ) : (
        <div className="carousel-stage">
          <button
            type="button"
            className="carousel-nav-arrow prev"
            onClick={() => scrollCarouselBy(-1)}
            disabled={view === 'libros' && currentCarouselIndex <= 0}
            aria-label="Carta anterior"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="carousel-container" ref={scrollRef} onScroll={handleScroll}>
            <div className="carousel-spacer"></div>
            {renderCards()}
            <div className="carousel-spacer"></div>
          </div>

          <button
            type="button"
            className="carousel-nav-arrow next"
            onClick={() => scrollCarouselBy(1)}
            disabled={currentCarouselIndex >= maxCarouselIndex}
            aria-label="Carta siguiente"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      <div className={`toggle-container ${isListViewGlobal ? 'is-list-active' : ''}`}>
        <div className="toggle-wrapper">
          {!isListViewGlobal && (
            <div className="toggle-switch">
              <div className={`toggle-slider ${view === 'capitulos' ? 'right' : ''}`}></div>
              <button className={`toggle-btn ${view === 'libros' ? 'active' : ''}`} onClick={() => { setView('libros'); setListViewBookSelected(null); setSearchQuery(''); }}>Libros</button>
              <button className={`toggle-btn ${view === 'capitulos' ? 'active' : ''}`} onClick={() => { setView('capitulos'); setListViewBookSelected(null); setSearchQuery(''); }}>Capítulos</button>
            </div>
          )}

          <button
            className="list-view-btn"
            title={isListViewGlobal ? 'Volver a modo cartas' : 'Ver en modo lista'}
            onClick={() => setIsListViewGlobal(!isListViewGlobal)}
          >
            {isListViewGlobal ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default Bible;