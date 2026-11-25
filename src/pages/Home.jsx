import React, { useState, useEffect, useRef } from 'react';
import VersionSelector from '../components/VersionSelector';
import './Home.css'; 

const backgroundImages = [
  'url("https://images.unsplash.com/photo-1504052434569-70ad5836ab65?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80")',
  'url("https://images.unsplash.com/photo-1448375240586-882707db888b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80")'
];

// Función para limpiar entidades HTML y etiquetas que devuelve BibleGateway
const cleanText = (str) => {
  if (!str) return "";
  return str
    .replace(/<[^>]*>?/gm, '') // Elimina etiquetas HTML como <p> o <br>
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '') // Elimina comillas raras (las pondremos nosotros en el diseño)
    .replace(/&lsquo;|&rsquo;|&#8216;|&#8217;/g, "'") // Comillas simples
    .replace(/&nbsp;/g, ' ') // Espacios
    .replace(/&mdash;/g, '-') // Guiones
    .trim();
};

export default function Home() {
  const [verses, setVerses] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const loadDailyVerses = async () => {
      const today = new Date().toISOString().split('T')[0];
      const cachedDate = localStorage.getItem('dailyVersesDate');
      const cachedVerses = localStorage.getItem('dailyVerses');

      if (cachedDate === today && cachedVerses) {
        setVerses(JSON.parse(cachedVerses));
        return;
      }

      try {
        // Enlaces base originales
        const base1 = 'https://api.rss2json.com/v1/api.json?rss_url=https://www.biblegateway.com/usage/votd/rss/votd.rdf?version=RVR1960';
        const base2 = 'https://api.rss2json.com/v1/api.json?rss_url=https://www.biblegateway.com/usage/votd/rss/votd.rdf?version=NVI';

        // Envolvemos con el Proxy CORS de allorigins y codificamos la URL para evitar errores de sintaxis
        const url1 = `https://api.allorigins.win/raw?url=${encodeURIComponent(base1)}`;
        const url2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(base2)}`;

        const [res1, res2] = await Promise.all([
          fetch(url1),
          fetch(url2)
        ]);

        const data1 = await res1.json();
        const data2 = await res2.json();

        const fetchedVerses = [
          {
            text: cleanText(data1.items[0].description),
            reference: cleanText(data1.items[0].title),
            version: "RVR1960"
          },
          {
            text: cleanText(data2.items[0].description),
            reference: cleanText(data2.items[0].title),
            version: "NVI"
          }
        ];

        // Guardamos en caché
        localStorage.setItem('dailyVersesDate', today);
        localStorage.setItem('dailyVerses', JSON.stringify(fetchedVerses));
        
        setVerses(fetchedVerses);
      } catch (error) {
        console.error("Error al buscar versículos:", error);
        // Respaldo en caso de que el usuario no tenga internet en absoluto
        setVerses([
          { text: "Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.", reference: "Salmos 119:105", version: "RVR1960" },
          { text: "El cielo y la tierra pasarán, pero mis palabras no pasarán.", reference: "Mateo 24:35", version: "NVI" }
        ]);
      }
    };

    loadDailyVerses();
  }, []);

  const handleScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.offsetWidth;
    const newIndex = Math.round(scrollLeft / width);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  return (
    <div className="home-container">
      <div className="home-background" style={{ backgroundImage: backgroundImages[0], opacity: activeIndex === 0 ? 1 : 0 }} />
      <div className="home-background" style={{ backgroundImage: backgroundImages[1], opacity: activeIndex === 1 ? 1 : 0 }} />

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
        {verses.length > 0 ? (
          verses.map((verse, index) => (
            <div key={index} className="home-verse-slide">
              <div className="home-verse-content">
                <p className="home-verse-text">"{verse.text}"</p>
                <p className="home-verse-ref">{verse.reference} {verse.version}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="home-verse-slide">
             <div className="home-verse-content">
                <p className="home-verse-text">Cargando...</p>
             </div>
          </div>
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
  );
}