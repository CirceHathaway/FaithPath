import React, { useState, useEffect, useRef } from 'react';
import VersionSelector from '../components/VersionSelector';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
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

export default function Home() {
  const [verses, setVerses] = useState(getInitialVerses);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);

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

  const handleScroll = (e) => {
    const width = e.target.offsetWidth;
    if (!width) return;
    const newIndex = Math.round(e.target.scrollLeft / width);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
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

      {/* Capa estática superior (No deslizable, siempre visible) */}
      <div className="home-static-overlay">
        <div className="home-top-bar">
          <VersionSelector />
        </div>

        <div className="home-title-container">
          <h1 className="home-logo">
            <span className="logo-faith">Faith</span>
            <span className="logo-path">Path</span>
          </h1>
          <p className="home-subtitle">Biblia Interactiva</p>
        </div>
      </div>

      {/* Capa deslizable que cubre TODA la pantalla */}
      <div className="home-swipe-area" ref={scrollRef} onScroll={handleScroll}>
        {verses.map((verse, index) => {
          const displayRef =
            verse.ref ||
            `${verse.verseRef || verse.reference || ''} ${verse.version || ''}`.trim();

          return (
            <div key={index} className="home-verse-slide">
              <div className="home-verse-content">
                <p className="home-verse-text">“{verse.text}”</p>
                <p className="home-verse-ref">{displayRef}</p>
              </div>
            </div>
          );
        })}
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
  );
}