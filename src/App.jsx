import React, { useState, useRef, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Devotional from './pages/Devotional';
import Bible from './pages/Bible';
import Favoritos from './pages/Favoritos';
import Login from './pages/Login';
import { BibleProvider } from './context/BibleContext';
import {
  initBackNavigation,
  pushNavState,
  resetNavToRoot
} from './utils/backNavigation';

function App() {
  const [initialDevotionalDate, setInitialDevotionalDate] = useState(() => {
    const param = new URLSearchParams(window.location.search).get('devotional');
    return param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null;
  });

  const [currentTab, setCurrentTab] = useState(() =>
    initialDevotionalDate ? 'devotional' : 'home'
  );
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isPulpitMode, setIsPulpitMode] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(() => {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  });

  const bibleRef = useRef(null);
  const currentTabRef = useRef(currentTab);
  const handledInitialLinkRef = useRef(false);
  currentTabRef.current = currentTab;

  // Inicializa el listener global del botón/gesto "Atrás"
  useEffect(() => {
    initBackNavigation(() => {
      if (currentTabRef.current !== 'home') {
        setIsPulpitMode(false);
        setInitialDevotionalDate(null);
        setCurrentTab('home');
        resetNavToRoot();
        return true;
      }
      return false;
    });

    // Limpia el parámetro de la URL y registra el paso atrás hacia Inicio una sola vez
    if (initialDevotionalDate && !handledInitialLinkRef.current) {
      handledInitialLinkRef.current = true;
      window.history.replaceState({ fpDepth: 0 }, '', window.location.pathname);
      pushNavState();
    }
  }, [initialDevotionalDate]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleSetTab = (nextTab) => {
    if (nextTab === currentTab) return;

    if (currentTab === 'devotional' && initialDevotionalDate) {
      setInitialDevotionalDate(null);
    }

    if (nextTab === 'home') {
      setIsPulpitMode(false);
      setCurrentTab('home');
      resetNavToRoot();
      return;
    }

    if (currentTab === 'home') {
      pushNavState();
    }
    setCurrentTab(nextTab);
  };

  const resetBible = () => {
    if (bibleRef.current) {
      bibleRef.current.reset();
    }
  };

  const navigateToBibleReference = (version, bookId, chapterId, verseId = null) => {
    if (currentTab === 'devotional' && initialDevotionalDate) {
      setInitialDevotionalDate(null);
    }
    if (currentTab === 'home') {
      pushNavState();
    }
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
        return <Home navigateToBibleReference={navigateToBibleReference} />;
      case 'devotional':
        return (
          <Devotional
            navigateToBibleReference={navigateToBibleReference}
            initialDateKey={initialDevotionalDate}
          />
        );
      case 'favoritos':
        return <Favoritos navigateToBibleReference={navigateToBibleReference} />;
      case 'bible':
        return <Bible ref={bibleRef} setIsReadingMode={setIsReadingMode} />;
      case 'more':
        return (
          <Login
            navigateToBibleReference={navigateToBibleReference}
            setIsPulpitMode={setIsPulpitMode}
            installPrompt={installPrompt}
            isAppInstalled={isAppInstalled}
            clearInstallPrompt={() => setInstallPrompt(null)}
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
        style={isPulpitMode ? { height: '100dvh' } : undefined}
      >
        {renderContent()}
      </div>
      {!isPulpitMode && (
        <BottomNav
          currentTab={currentTab}
          setCurrentTab={handleSetTab}
          resetBible={resetBible}
          isReadingMode={isReadingMode}
        />
      )}
    </BibleProvider>
  );
}

export default App;