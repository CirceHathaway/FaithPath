const HISTORY_STORAGE_KEY = 'faithpath_reading_history';
const MAX_HISTORY_ITEMS = 10;

export function getReadingHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addReadingHistoryEntry({
  bookId,
  bookName,
  chapterId,
  version,
  isNewTestament
}) {
  if (!bookId || !chapterId) return;

  const current = getReadingHistory();
  const filtered = current.filter(
    (item) => !(item.bookId === bookId && item.chapterId === chapterId)
  );

  const nextEntry = {
    bookId,
    bookName,
    chapterId,
    version: version || 'RVR1960',
    isNewTestament: Boolean(isNewTestament),
    readAt: Date.now()
  };

  // Mantiene un máximo exacto de 10 entradas: si entra el 11°, se descarta el último
  const updated = [nextEntry, ...filtered].slice(0, MAX_HISTORY_ITEMS);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('No se pudo guardar el historial de lectura:', err);
  }
}

export function formatHistoryTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();

  const timeStr = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, now)) {
    return `Hoy, ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `Ayer, ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short'
  });
  return `${dateStr}, ${timeStr}`;
}