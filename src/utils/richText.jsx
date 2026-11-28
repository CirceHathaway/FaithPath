import React, { useState, useEffect, useRef, useCallback } from 'react';

const escapeHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Normaliza y sanitiza HTML permitiendo únicamente <strong> y <br>
export const sanitizeRichHtml = (raw) => {
  if (!raw || typeof raw !== 'string') return '';

  const prepared = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');

  const container = document.createElement('div');
  container.innerHTML = prepared;

  const serializeChildren = (parent) => {
    let out = '';
    const children = Array.from(parent.childNodes);

    children.forEach((node, idx) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += escapeHtml(node.textContent || '');
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toUpperCase();

      if (tag === 'BR') {
        out += '<br>';
        return;
      }

      const inner = serializeChildren(node);

      if (tag === 'STRONG' || tag === 'B') {
        if (inner) {
          out += `<strong>${inner}</strong>`;
        }
        return;
      }

      if (tag === 'SPAN') {
        const fw = (node.style?.fontWeight || '').toLowerCase();
        const isBoldSpan = fw === 'bold' || fw === 'bolder' || Number(fw) >= 600;
        if (isBoldSpan && inner) {
          out += `<strong>${inner}</strong>`;
        } else {
          out += inner;
        }
        return;
      }

      if (tag === 'DIV' || tag === 'P' || tag === 'LI' || /^H[1-6]$/.test(tag)) {
        if (idx > 0 && out && !out.endsWith('<br>')) {
          out += '<br>';
        }
        out += inner;
        return;
      }

      out += inner;
    });

    return out;
  };

  let result = serializeChildren(container);
  // Une etiquetas <strong> contiguas
  result = result.replace(/<\/strong><strong>/g, '');
  // Limpia un <br> solitario final que dejan algunos navegadores en contentEditable
  if (result === '<br>') return '';
  return result;
};

// Convierte el contenido enriquecido a texto plano puro (sin negritas ni etiquetas)
export const richHtmlToPlainText = (raw) => {
  if (!raw || typeof raw !== 'string') return '';

  const withNewlines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n');

  const container = document.createElement('div');
  container.innerHTML = withNewlines;

  return (container.textContent || '')
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ');
};

export const hasRichContent = (raw) => richHtmlToPlainText(raw).trim().length > 0;

// Hook que sincroniza el estado del botón "Negrita" con el cursor y la selección activa
export function useBoldToolbar() {
  const [isBoldActive, setIsBoldActive] = useState(false);
  const activeEditorRef = useRef(null);
  const savedRangeRef = useRef(null);

  const computeSelectionBold = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setIsBoldActive(false);
      return;
    }

    const anchor = sel.anchorNode;
    const anchorEl = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const editorEl = anchorEl?.closest?.('[data-rich-editor="true"]');

    if (!editorEl) {
      activeEditorRef.current = null;
      savedRangeRef.current = null;
      setIsBoldActive(false);
      return;
    }

    activeEditorRef.current = editorEl;
    try {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } catch {
      savedRangeRef.current = null;
    }

    let boldState = false;
    try {
      boldState = document.queryCommandState('bold');
    } catch {
      boldState = false;
    }

    if (!boldState && !sel.isCollapsed) {
      let node = anchorEl;
      while (node && node !== editorEl) {
        if (node.tagName === 'STRONG' || node.tagName === 'B') {
          boldState = true;
          break;
        }
        node = node.parentElement;
      }
    }

    setIsBoldActive(Boolean(boldState));
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', computeSelectionBold);
    return () => {
      document.removeEventListener('selectionchange', computeSelectionBold);
    };
  }, [computeSelectionBold]);

  const toggleBold = useCallback(() => {
    const focused = document.activeElement?.closest?.('[data-rich-editor="true"]');
    const editorEl = focused || activeEditorRef.current;

    if (!editorEl) return false;

    if (document.activeElement !== editorEl) {
      editorEl.focus({ preventScroll: true });
    }

    const sel = window.getSelection();
    if (
      sel &&
      savedRangeRef.current &&
      editorEl.contains(savedRangeRef.current.startContainer)
    ) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }

    try {
      document.execCommand('bold', false, null);
    } catch {
      return false;
    }

    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
    computeSelectionBold();
    return true;
  }, [computeSelectionBold]);

  return {
    isBoldActive,
    toggleBold,
    syncSelection: computeSelectionBold
  };
}

// Campo editable visual en tiempo real (mantiene posición de cursor y limpia pegado)
export function RichTextEditor({
  value,
  onChange,
  className = '',
  placeholder = '',
  minLines = 1,
  onSelectionChange,
  ariaLabel
}) {
  const editorRef = useRef(null);
  const lastHtmlRef = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const normalized = sanitizeRichHtml(value || '');
    const currentDomNormalized = sanitizeRichHtml(el.innerHTML);

    if (lastHtmlRef.current === null || normalized !== currentDomNormalized) {
      el.innerHTML = normalized;
      lastHtmlRef.current = normalized;
    }
  }, [value]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;

    const clean = sanitizeRichHtml(el.innerHTML);
    if (!hasRichContent(clean) && el.innerHTML !== '') {
      el.innerHTML = '';
    }
    lastHtmlRef.current = clean;
    onChange(clean);
    if (onSelectionChange) onSelectionChange();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const plain = e.clipboardData?.getData('text/plain') || '';
    if (!plain) return;
    document.execCommand('insertText', false, plain);
  };

  const handleBlur = () => {
    const el = editorRef.current;
    if (!el) return;
    const clean = sanitizeRichHtml(el.innerHTML);
    if (el.innerHTML !== clean) {
      el.innerHTML = clean;
    }
    lastHtmlRef.current = clean;
    if (onSelectionChange) onSelectionChange();
  };

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel || placeholder}
      contentEditable
      suppressContentEditableWarning
      data-rich-editor="true"
      data-placeholder={placeholder}
      className={`rich-text-editable ${minLines > 1 ? 'is-multiline' : ''} ${className}`}
      onInput={handleInput}
      onPaste={handlePaste}
      onKeyUp={onSelectionChange}
      onMouseUp={onSelectionChange}
      onFocus={onSelectionChange}
      onBlur={handleBlur}
    />
  );
}

// Renderiza bloques de texto enriquecido en vista lectura / púlpito
export function RichTextDisplay({ html, inline = false }) {
  const clean = sanitizeRichHtml(html || '');
  if (!clean) return null;

  if (inline) {
    return <span dangerouslySetInnerHTML={{ __html: clean }} />;
  }

  const lines = clean.split(/<br\s*\/?>/i);

  return (
    <>
      {lines.map((lineHtml, idx) =>
        hasRichContent(lineHtml) ? (
          <p key={idx} dangerouslySetInnerHTML={{ __html: lineHtml }} />
        ) : null
      )}
    </>
  );
}