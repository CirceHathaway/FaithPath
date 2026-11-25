import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import SermonMode from './SermonMode';
import './Login.css';

export default function Login({
  navigateToBibleReference,
  setIsPulpitMode,
  installPrompt,
  isAppInstalled,
  clearInstallPrompt
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSermonMode, setShowSermonMode] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setShowSermonMode(false);
        if (setIsPulpitMode) setIsPulpitMode(false);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [setIsPulpitMode]);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted' && clearInstallPrompt) {
        clearInstallPrompt();
      }
    } else {
      setShowInstallHelp(true);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setEmail('');
      setPassword('');
    } catch (err) {
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError('Correo o contraseña incorrectos.');
          break;
        case 'auth/invalid-email':
          setError('El formato del correo electrónico no es válido.');
          break;
        case 'auth/too-many-requests':
          setError('Demasiados intentos fallidos. Intenta de nuevo más tarde.');
          break;
        case 'auth/network-request-failed':
          setError('Error de conexión. Verifica tu acceso a internet.');
          break;
        default:
          setError('No se pudo iniciar sesión. Intenta nuevamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      setShowSermonMode(false);
      if (setIsPulpitMode) setIsPulpitMode(false);
      await signOut(auth);
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  if (user && showSermonMode) {
    return (
      <SermonMode
        onBack={() => setShowSermonMode(false)}
        navigateToBibleReference={navigateToBibleReference}
        setIsPulpitMode={setIsPulpitMode}
      />
    );
  }

  return (
    <div className="login-container">
      <h1 className="login-title">Más Opciones</h1>

      {/* Tarjeta de instalación PWA */}
      <div className="install-app-card">
        <div className="install-app-info">
          <h3>Aplicación FaithPath</h3>
          <p>
            {isAppInstalled
              ? 'Ya tienes la app instalada en este dispositivo.'
              : 'Instálala para abrirla rápido y leer la Biblia sin conexión.'}
          </p>
        </div>

        {isAppInstalled ? (
          <span className="install-done-badge">✓ Instalada</span>
        ) : (
          <button
            type="button"
            className="install-app-btn"
            onClick={handleInstallClick}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Instalar aplicación</span>
          </button>
        )}
      </div>

      <div className="login-card">
        {loadingAuth ? (
          <p className="login-loading">Verificando sesión...</p>
        ) : user ? (
          <div className="login-success-state">
            <div className="success-icon">
              <svg viewBox="0 0 24 24" width="40" height="40" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2>Bienvenido</h2>
            <p className="login-user-email">{user.email}</p>
            <p>Tienes acceso administrativo para gestionar devocionales y preparar tus prédicas.</p>

            <button
              className="sermon-mode-entry-btn"
              onClick={() => setShowSermonMode(true)}
            >
              Modo Prédica
            </button>

            <button className="logout-btn" onClick={handleLogout}>
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleLogin}>
            <h2>Acceso Administrativo</h2>
            <p className="login-subtitle">Inicia sesión para gestionar el contenido.</p>

            {error && <div className="login-error">{error}</div>}

            <div className="input-group">
              <label>Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@correo.com"
                required
              />
            </div>

            <div className="input-group">
              <label>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" className="login-submit-btn" disabled={submitting}>
              {submitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        )}
      </div>

      {/* Modal de instrucciones para iOS o navegadores sin aviso automático */}
      {showInstallHelp && (
        <div className="install-modal-backdrop">
          <div className="install-modal-box">
            <div className="install-modal-header">
              <h3>Cómo instalar FaithPath</h3>
              <button
                type="button"
                className="install-modal-close"
                onClick={() => setShowInstallHelp(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {isIOS ? (
              <ol className="install-steps-list">
                <li>Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.</li>
                <li>Desliza hacia abajo y elige <strong>Agregar a inicio</strong>.</li>
                <li>Toca <strong>Agregar</strong> en la esquina superior derecha.</li>
              </ol>
            ) : (
              <ol className="install-steps-list">
                <li>Abre el menú de tu navegador (los tres puntos <strong>⋮</strong> arriba a la derecha).</li>
                <li>Selecciona <strong>Instalar aplicación</strong> o <strong>Agregar a la pantalla principal</strong>.</li>
                <li>Confirma tocando <strong>Instalar</strong>.</li>
              </ol>
            )}

            <button
              type="button"
              className="install-modal-done"
              onClick={() => setShowInstallHelp(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}