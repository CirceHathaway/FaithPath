import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BIBLE_VERSIONS, parseAndFetchVerse } from '../utils/bibleHelper';
import './DailyVersesManager.css';

const DAILY_VERSES_CACHE_KEY = 'daily_verses_offline_cache';

const createEmptySlot = () => ({
  verseInput: '',
  version: 'RVR1960',
  text: '',
  ref: '',
  bookId: null,
  bookName: '',
  chapterId: null,
  startVerse: null,
  endVerse: null,
  error: ''
});

export default function DailyVersesManager({ onBack }) {
  const [slots, setSlots] = useState([createEmptySlot(), createEmptySlot()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(''), 2600);
  };

  useEffect(() => {
    return () => {
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, []);

  // Carga los versículos actuales desde caché local + Firestore
  useEffect(() => {
    let cancelled = false;

    const mapToSlots = (versesArr) => {
      const next = [createEmptySlot(), createEmptySlot()];
      [0, 1].forEach((idx) => {
        const item = versesArr?.[idx];
        if (item) {
          next[idx] = {
            ...createEmptySlot(),
            ...item,
            verseInput: item.verseRef || item.verseInput || '',
            error: ''
          };
        }
      });
      return next;
    };

    const loadCurrent = async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(DAILY_VERSES_CACHE_KEY));
        if (Array.isArray(cached) && cached.length > 0) {
          setSlots(mapToSlots(cached));
        }
      } catch {
        // Ignora caché corrupto
      }

      try {
        const snap = await getDoc(doc(db, 'dailyVerses', 'current'));
        if (!cancelled && snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.verses)) {
            setSlots(mapToSlots(data.verses));
            localStorage.setItem(DAILY_VERSES_CACHE_KEY, JSON.stringify(data.verses));
          }
        }
      } catch (err) {
        console.warn('Sin conexión para leer versículos diarios:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCurrent();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSlot = (index, patch) => {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot))
    );
  };

  const handleFetchSlot = (index, forcedVersion = null) => {
    const current = slots[index];
    const versionToUse = forcedVersion || current.version || 'RVR1960';
    const result = parseAndFetchVerse(current.verseInput, versionToUse);

    if (result.error) {
      updateSlot(index, { version: versionToUse, error: result.error });
      return null;
    }

    const updatedData = {
      verseInput: result.verseRef,
      verseRef: result.verseRef,
      version: result.version,
      text: result.text,
      ref: result.formattedRef,
      bookId: result.bookId,
      bookName: result.bookName,
      chapterId: result.chapterId,
      startVerse: result.startVerse,
      endVerse: result.endVerse,
      error: ''
    };

    updateSlot(index, updatedData);
    return updatedData;
  };

  const handleSave = async () => {
    const resolvedVerses = [];

    // Valida o autocompleta ambos versículos antes de subir a Firestore
    for (let i = 0; i < 2; i++) {
      const slot = slots[i];
      if (!slot.verseInput.trim()) {
        updateSlot(i, { error: 'Ingresa una cita bíblica para este versículo.' });
        showToast(`Completa el Versículo ${i + 1}`);
        return;
      }

      const fetched = handleFetchSlot(i, slot.version);
      if (!fetched) {
        showToast(`Revisa la cita del Versículo ${i + 1}`);
        return;
      }

      const { error, verseInput, ...cleanVerse } = fetched;
      resolvedVerses.push(cleanVerse);
    }

    setSaving(true);
    try {
      localStorage.setItem(DAILY_VERSES_CACHE_KEY, JSON.stringify(resolvedVerses));

      await setDoc(doc(db, 'dailyVerses', 'current'), {
        verses: resolvedVerses,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp()
      });

      showToast('Versículos diarios publicados en Inicio');
    } catch (err) {
      console.error('Error guardando versículos diarios:', err);
      showToast('Error al guardar en la nube. Verifica tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dv-manager-page">
      <header className="dv-topbar">
        <button type="button" className="dv-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Volver</span>
        </button>

        <h1 className="dv-topbar-title">Versículos Diarios</h1>

        <button
          type="button"
          className="dv-save-pill"
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </header>

      <main className="dv-content">
        <p className="dv-intro-text">
          Define los 2 versículos que verán todos los usuarios al deslizar en la pantalla de Inicio. Puedes mezclar distintas versiones.
        </p>

        {loading ? (
          <p className="dv-loading">Cargando versículos actuales...</p>
        ) : (
          <div className="dv-cards-list">
            {slots.map((slot, index) => (
              <section key={index} className="dv-card">
                <div className="dv-card-header">
                  <span className="dv-card-badge">Versículo {index + 1}</span>
                  {slot.ref && <span className="dv-card-ready">✓ Cargado</span>}
                </div>

                <div className="dv-input-row">
                  <input
                    type="text"
                    className="dv-ref-input"
                    placeholder={index === 0 ? 'Ej: Salmos 23:1' : 'Ej: Filipenses 4:6-7'}
                    value={slot.verseInput}
                    onChange={(e) => updateSlot(index, { verseInput: e.target.value, error: '' })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleFetchSlot(index);
                      }
                    }}
                  />

                  <select
                    className="dv-version-select"
                    value={slot.version}
                    onChange={(e) => {
                      const nextVer = e.target.value;
                      if (slot.verseInput.trim()) {
                        handleFetchSlot(index, nextVer);
                      } else {
                        updateSlot(index, { version: nextVer });
                      }
                    }}
                  >
                    {BIBLE_VERSIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="dv-fetch-btn"
                  onClick={() => handleFetchSlot(index)}
                >
                  {slot.text ? 'Actualizar vista previa' : 'Buscar y previsualizar'}
                </button>

                {slot.error && <p className="dv-error">{slot.error}</p>}

                {slot.text && (
                  <div className="dv-preview-box">
                    <p className="dv-preview-text">“{slot.text}”</p>
                    <span className="dv-preview-ref">{slot.ref}</span>
                  </div>
                )}
              </section>
            ))}

            <button
              type="button"
              className="dv-save-big-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Publicando...' : 'Publicar versículos diarios'}
            </button>
          </div>
        )}
      </main>

      {toastMsg && <div className="dv-toast">{toastMsg}</div>}
    </div>
  );
}