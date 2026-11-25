// Agrega o quita las URLs de fondo que quieras (mantiene la estética del Home)
export const VERSE_IMAGE_BG_URLS = [
  'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?ixlib=rb-4.0.3&auto=format&fit=crop&w=1080&q=85',
  'https://images.unsplash.com/photo-1448375240586-882707db888b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1080&q=85',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?ixlib=rb-4.0.3&auto=format&fit=crop&w=1080&q=85',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=1080&q=85',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?ixlib=rb-4.0.3&auto=format&fit=crop&w=1080&q=85',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1080&q=85'
];

let lastUsedBgUrl = null;

// Elige una URL al azar evitando repetir la última usada
export function getRandomBackgroundUrl(excludeUrl = lastUsedBgUrl) {
  if (VERSE_IMAGE_BG_URLS.length === 0) return null;
  if (VERSE_IMAGE_BG_URLS.length === 1) return VERSE_IMAGE_BG_URLS[0];

  const candidates = VERSE_IMAGE_BG_URLS.filter((url) => url !== excludeUrl);
  const pool = candidates.length > 0 ? candidates : VERSE_IMAGE_BG_URLS;
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  lastUsedBgUrl = chosen;
  return chosen;
}

// Formatea números seleccionados en rangos limpios (ej: [1,2,3,5] -> "1-3, 5")
export function formatVerseRanges(verseNumbers) {
  const sorted = [...verseNumbers].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

const loadImageWithCors = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });

// Divide un texto en líneas según el ancho máximo del canvas
const wrapLines = (ctx, text, maxWidth) => {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
};

// Dibuja el versículo en un canvas 1080x1080 y devuelve { blob, previewUrl, backgroundUrl }
export async function generateVerseImage({
  verseText,
  reference,
  version,
  isNewTestament = false,
  backgroundUrl = null
}) {
  const SIZE = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const accentColor = isNewTestament ? '#4ade80' : '#cf666d';
  const chosenBgUrl = backgroundUrl || getRandomBackgroundUrl();

  // 1. Fondo: imagen aleatoria desde URL (estilo cover) o degradado oscuro si falla/offline
  try {
    if (!chosenBgUrl) throw new Error('Sin URL de fondo');
    const img = await loadImageWithCors(chosenBgUrl);
    const scale = Math.max(SIZE / img.width, SIZE / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const offsetX = (SIZE - drawW) / 2;
    const offsetY = (SIZE - drawH) / 2;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  } catch {
    const fallbackGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    if (isNewTestament) {
      fallbackGrad.addColorStop(0, '#0a1911');
      fallbackGrad.addColorStop(0.5, '#070a09');
      fallbackGrad.addColorStop(1, '#122a1b');
    } else {
      fallbackGrad.addColorStop(0, '#230d11');
      fallbackGrad.addColorStop(0.5, '#090708');
      fallbackGrad.addColorStop(1, '#180a0d');
    }
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  // 2. Capa oscura tipo Home para garantizar lectura nítida
  const overlay = ctx.createLinearGradient(0, 0, 0, SIZE);
  overlay.addColorStop(0, 'rgba(5, 5, 8, 0.58)');
  overlay.addColorStop(0.5, 'rgba(5, 5, 8, 0.72)');
  overlay.addColorStop(1, 'rgba(5, 5, 8, 0.90)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 3. Marco interior sutil
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, SIZE - 96, SIZE - 96);

  // 4. Ajuste automático de tamaño de letra para que el versículo quede centrado
  const quotedText = `“${verseText.trim()}”`;
  const maxTextWidth = 840;
  const maxBlockHeight = 600;
  const fontSizes = [56, 50, 44, 38, 34, 30, 26];

  let chosenSize = 26;
  let lines = [];
  let lineHeight = 38;

  for (const size of fontSizes) {
    ctx.font = `500 ${size}px Georgia, "Times New Roman", serif`;
    const candidateLines = wrapLines(ctx, quotedText, maxTextWidth);
    const candidateLH = Math.round(size * 1.48);
    if (candidateLines.length * candidateLH <= maxBlockHeight) {
      chosenSize = size;
      lines = candidateLines;
      lineHeight = candidateLH;
      break;
    }
    lines = candidateLines;
    lineHeight = candidateLH;
  }

  // Recorta con puntos suspensivos solo si se seleccionaron demasiados versículos juntos
  const maxLines = Math.floor(maxBlockHeight / lineHeight);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s+\S*$/, '')}…”`;
  }

  const textBlockHeight = lines.length * lineHeight;
  const centerY = SIZE / 2 - 20;
  const firstLineY = centerY - textBlockHeight / 2 + chosenSize * 0.4;

  // 5. Línea decorativa arriba del versículo
  ctx.fillStyle = accentColor;
  ctx.fillRect(SIZE / 2 - 28, firstLineY - chosenSize - 26, 56, 4);

  // 6. Texto del versículo centrado
  ctx.font = `500 ${chosenSize}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;

  lines.forEach((line, index) => {
    ctx.fillText(line, SIZE / 2, firstLineY + index * lineHeight);
  });

  // 7. Cita y versión debajo del versículo
  ctx.shadowBlur = 6;
  const refY = firstLineY + (lines.length - 1) * lineHeight + chosenSize + 44;
  ctx.font = '600 28px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = accentColor;
  ctx.fillText(`${reference.toUpperCase()}  ·  ${version}`, SIZE / 2, refY);

  // 8. Firma sutil de FaithPath al pie
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font = '300 22px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('F A I T H  P A T H', SIZE / 2, SIZE - 92);

  // Exportar a Blob PNG
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('No se pudo exportar la imagen.'));
    }, 'image/png');
  });

  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    backgroundUrl: chosenBgUrl
  };
}