import React, { createContext, useState, useContext, useEffect } from 'react';

const BibleContext = createContext();

export const BibleProvider = ({ children }) => {
  const [activeVersion, setActiveVersion] = useState('RVR1960'); 
  
  const [isListViewGlobal, setIsListViewGlobal] = useState(() => {
    const savedPreference = localStorage.getItem('preferListView');
    return savedPreference === 'true'; 
  });

  const [highlightedVerses, setHighlightedVerses] = useState(() => {
    const savedHighlights = localStorage.getItem('highlightedVerses');
    return savedHighlights ? JSON.parse(savedHighlights) : [];
  });

  useEffect(() => {
    localStorage.setItem('preferListView', isListViewGlobal);
  }, [isListViewGlobal]);

  useEffect(() => {
    localStorage.setItem('highlightedVerses', JSON.stringify(highlightedVerses));
  }, [highlightedVerses]);

  // NUEVA FUNCIÓN: Permite eliminar un favorito específico desde la pantalla Favoritos
  const removeFavorite = (highlightId) => {
    setHighlightedVerses(prev => prev.filter(id => id !== highlightId));
  };

  return (
    <BibleContext.Provider value={{ 
      activeVersion, setActiveVersion,
      isListViewGlobal, setIsListViewGlobal,
      highlightedVerses, setHighlightedVerses,
      removeFavorite // <-- Exponemos la función
    }}>
      {children}
    </BibleContext.Provider>
  );
};

export const useBible = () => useContext(BibleContext);