import React, { useState, useRef, useEffect } from 'react';
import { useBible } from '../context/BibleContext';
// Usamos los estilos definidos en Home.css

export default function VersionSelector() {
  const { activeVersion, setActiveVersion } = useBible();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Detectar clic fuera del menú para cerrarlo automáticamente
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    { id: 'RVR1960', name: 'RV 1960' },
    { id: 'RVC', name: 'RVC' },
    { id: 'NVI', name: 'NVI' }
  ];

  const activeLabel = options.find(o => o.id === activeVersion)?.name || 'RV 1960';

  return (
    <div className="version-selector-wrapper" ref={dropdownRef}>
      {/* Botón Principal */}
      <button className="version-selector-btn" onClick={() => setIsOpen(!isOpen)}>
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
        <span className="version-selector-label">{activeLabel}</span>
        <span className={`version-arrow ${isOpen ? 'open' : ''}`}>˅</span>
      </button>

      {/* Menú Desplegable Personalizado */}
      {isOpen && (
        <div className="version-dropdown-menu">
          {options.map((opt) => (
            <div 
              key={opt.id} 
              className={`version-dropdown-item ${activeVersion === opt.id ? 'active' : ''}`}
              onClick={() => {
                setActiveVersion(opt.id);
                setIsOpen(false); // Cierra el menú al seleccionar
              }}
            >
              {opt.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}