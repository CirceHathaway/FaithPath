import React, { useState, useRef } from 'react';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Devotional from './pages/Devotional';
import Bible from './pages/Bible';
import Favoritos from './pages/Favoritos';
import Login from './pages/Login';
import { BibleProvider } from './context/BibleContext';

function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isPulpitMode, setIsPulpitMode] = useState(false);
  const bibleRef = useRef(null);

  const resetBible = () => {
    if (bibleRef.current) {
      bibleRef.current.reset();
    }
  };

  const navigateToBibleReference = (version, bookId, chapterId, verseId = null) => {
    setIsPulpitMode(false);
    setCurrentTab('bible');
    setTimeout(() => {
      if (bibleRef.current) {
        bibleRef.current.jumpToReading(version, bookId, chapterId, verseId);
      }
    }, 50);
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'home':
        return <Home />;
      case 'devotional':
        return <Devotional navigateToBibleReference={navigateToBibleReference} />;
      case 'favoritos':
        return <Favoritos navigateToBibleReference={navigateToBibleReference} />;
      case 'bible':
        return <Bible ref={bibleRef} setIsReadingMode={setIsReadingMode} />;
      case 'more':
        return (
          <Login
            navigateToBibleReference={navigateToBibleReference}
            setIsPulpitMode={setIsPulpitMode}
          />
        );
      default:
        return <div style={{ padding: '20px' }}>En construcción...</div>;
    }
  };

  return (
    <BibleProvider>
      <div
        className="app-container"
        style={isPulpitMode ? { height: '100vh' } : undefined}
      >
        {renderContent()}
      </div>
      {!isPulpitMode && (
        <BottomNav
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          resetBible={resetBible}
          isReadingMode={isReadingMode}
        />
      )}
    </BibleProvider>
  );
}

export default App;