import { rv1960 } from '../data/rv1960';
import { rvc } from '../data/rvc';
import { nvi } from '../data/nvi';

export const BIBLE_VERSIONS = [
  { id: 'RVR1960', label: 'RV 1960' },
  { id: 'RVC', label: 'RVC' },
  { id: 'NVI', label: 'NVI' }
];

const bibleDataMap = {
  RVR1960: rv1960,
  RVC: rvc,
  NVI: nvi
};

// Quita tildes y normaliza a minúsculas para evitar errores de tipeo
const normalizeText = (str = '') =>
  str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// Busca y valida una cita escrita por el usuario (ej: "Salmos 51:10-12" o "Juan 3:16")
export function parseAndFetchVerse(verseRef, version = 'RVR1960') {
  if (!verseRef || !verseRef.trim()) {
    return { error: 'Escribe una cita bíblica (ej: Salmos 51:10-12).' };
  }

  const refParts = verseRef.trim().split(/\s+/);
  if (refParts.length < 2) {
    return { error: "Usa el formato 'Libro Capítulo:Versículo' (ej: Juan 3:16)." };
  }

  const chapterVerse = refParts.pop();
  const bookNameInput = refParts.join(' ');
  const [chapterStr, verseStr] = chapterVerse.split(':');

  if (!chapterStr || !verseStr) {
    return { error: "Falta el separador ':' entre capítulo y versículo (ej: Juan 3:16)." };
  }

  const chapterId = parseInt(chapterStr, 10);
  let startVerse;
  let endVerse;

  if (verseStr.includes('-')) {
    const [start, end] = verseStr.split('-');
    startVerse = parseInt(start, 10);
    endVerse = parseInt(end, 10);
  } else {
    startVerse = parseInt(verseStr, 10);
    endVerse = startVerse;
  }

  if (isNaN(chapterId) || isNaN(startVerse) || isNaN(endVerse) || startVerse > endVerse) {
    return { error: 'Los números de capítulo o versículo no son válidos.' };
  }

  const bibleData = bibleDataMap[version] || rv1960;
  const normalizedTarget = normalizeText(bookNameInput);

  const book = bibleData.books.find(
    (b) => normalizeText(b.name) === normalizedTarget
  );

  if (!book) {
    return { error: `No se encontró el libro "${bookNameInput}". Revisa el nombre.` };
  }

  const chapter = book.chapters.find((c) => c.chapterNumber === chapterId);
  if (!chapter) {
    return { error: `${book.name} no tiene capítulo ${chapterId}.` };
  }

  const versesText = [];
  for (let i = startVerse; i <= endVerse; i++) {
    const verseObj = chapter.verses.find((v) => v.number === i);
    if (!verseObj) {
      return { error: `No se encontró el versículo ${i} en ${book.name} ${chapterId}.` };
    }
    versesText.push(verseObj.text);
  }

  const rangeLabel = startVerse === endVerse ? `${startVerse}` : `${startVerse}-${endVerse}`;

  return {
    bookId: book.id,
    bookName: book.name,
    chapterId,
    startVerse,
    endVerse,
    version,
    verseRef: `${book.name} ${chapterId}:${rangeLabel}`,
    formattedRef: `${book.name} ${chapterId}:${rangeLabel} (${version})`,
    text: versesText.join(' ')
  };
}

// Obtiene el texto de un bloque versículo ya guardado en cualquier versión (para cambio en vivo o paralelo)
export function getVerseInVersion(bookId, bookName, chapterId, startVerse, endVerse, version = 'RVR1960') {
  const bibleData = bibleDataMap[version] || rv1960;
  let book = bibleData.books.find((b) => b.id === bookId);

  if (!book && bookName) {
    const normalizedTarget = normalizeText(bookName);
    book = bibleData.books.find((b) => normalizeText(b.name) === normalizedTarget);
  }

  if (!book) return 'Libro no disponible en esta versión.';

  const chapter = book.chapters.find((c) => c.chapterNumber === chapterId);
  if (!chapter) return 'Capítulo no disponible en esta versión.';

  const versesText = [];
  for (let i = startVerse; i <= (endVerse || startVerse); i++) {
    const verseObj = chapter.verses.find((v) => v.number === i);
    if (verseObj) {
      versesText.push(verseObj.text);
    }
  }

  return versesText.length > 0
    ? versesText.join(' ')
    : 'Versículo no disponible en esta versión.';
}