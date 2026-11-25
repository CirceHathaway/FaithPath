import React from 'react';
import './BottomNav.css';

export default function BottomNav({ currentTab, setCurrentTab, resetBible, isReadingMode }) {
  const navItems = [
    {
      id: 'home',
      label: 'Inicio',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        </svg>
      )
    },
    {
      id: 'devotional',
      label: 'Devocional',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.6" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
          <line x1="4" y1="12" x2="20" y2="12"></line>
        </svg>
      )
    },
    {
      id: 'bible',
      label: currentTab === 'bible' && isReadingMode ? 'Cerrar' : 'Biblia',
      icon:
        currentTab === 'bible' && isReadingMode ? (
          <svg viewBox="0 0 24 24" width="23" height="23" stroke="currentColor" strokeWidth="1.6" fill="none">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.6" fill="none">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            <line x1="12" y1="7" x2="12" y2="13"></line>
            <line x1="9" y1="10" x2="15" y2="10"></line>
          </svg>
        )
    },
    {
      id: 'favoritos',
      label: 'Favoritos',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      )
    },
    {
      id: 'more',
      label: 'Más',
      icon: (
        <svg viewBox="0 0 24 24" width="23" height="23" stroke="currentColor" strokeWidth="1.6" fill="none">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      )
    }
  ];

  const handleNavClick = (id) => {
    if (id === 'bible' && currentTab === 'bible') {
      if (isReadingMode && resetBible) {
        resetBible();
      }
    } else {
      setCurrentTab(id);
    }
  };

  return (
    <nav className="app-nav" aria-label="Navegación principal">
      <div className="app-nav-brand">
        <span className="brand-light">FAITH</span>
        <span className="brand-bold">PATH</span>
      </div>

      <div className="app-nav-list">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`app-nav-item ${currentTab === item.id ? 'active' : ''}`}
            onClick={() => handleNavClick(item.id)}
          >
            <span className="app-nav-icon">{item.icon}</span>
            <span className="app-nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}