'use strict';

const STORAGE_KEY = 'lineNotes';
const SAVE_DEBOUNCE_MS = 650;
const SAVE_INTERVAL_MS = 3000;

const notes = document.getElementById('notes');
const saveState = document.getElementById('saveState');
const saveText = document.getElementById('saveText');
const exportButton = document.getElementById('exportButton');

const headingFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric'
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit'
});

let dirty = false;
let saving = false;
let queued = false;
let saveFailed = false;
let inputTimer = null;
let lastSavedAt = null;
let homeCursor = 0;

/**
 * Chrome extension storage in the extension. The localStorage fallback keeps
 * popup.html usable as a plain preview page during development.
 */
const storage = globalThis.chrome?.storage?.local ?? createPreviewStorage();

function createPreviewStorage() {
  const prefix = 'line-notes-preview:';
  return {
    async get(defaults) {
      const result = {};
      for (const [key, fallback] of Object.entries(defaults)) {
        const raw = localStorage.getItem(prefix + key);
        result[key] = raw ? JSON.parse(raw) : fallback;
      }
      return result;
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      }
    }
  };
}

function todayHeading(date = new Date()) {
  return `──── ${headingFormatter.format(date)} ────`;
}

const DATE_HEADING_PATTERN = /^──── (?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4} ────$/;

/**
 * Removes older date dividers that never received any notes. The active day's
 * divider is kept so the cursor has a place to start on the next entry.
 */
function removeEmptyDateSections(sourceText, keepHeading) {
  const source = typeof sourceText === 'string' ? sourceText : '';
  if (!source) return '';

  const lines = source.split('\n');
  const headingIndexes = [];

  lines.forEach((line, index) => {
    if (DATE_HEADING_PATTERN.test(line)) headingIndexes.push(index);
  });

  if (headingIndexes.length === 0) return source;

  const remove = new Set();

  headingIndexes.forEach((start, index) => {
    const end =
      index + 1 < headingIndexes.length
        ? headingIndexes[index + 1]
        : lines.length;

    if (lines[start] === keepHeading) return;

    const hasContent = lines
      .slice(start + 1, end)
      .some((line) => line.trim() !== '');

    if (!hasContent) {
      for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
        remove.add(lineIndex);
      }
    }
  });

  if (remove.size === 0) return source;

  return lines
    .filter((_, index) => !remove.has(index))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

/**
 * Returns text with today's date line at the top and a fresh line under it.
 * On later opens during the same day, existing notes move down so the cursor
 * always starts on a new line.
 */
function prepareForNewEntry(sourceText) {
  const source = typeof sourceText === 'string' ? sourceText : '';
  const heading = todayHeading();
  const text = removeEmptyDateSections(source, heading).replace(/^\n+/, '');

  if (!text.startsWith(heading)) {
    const next = text ? `${heading}\n\n${text}` : `${heading}\n`;
    return { text: next, cursor: heading.length + 1, changed: next !== source };
  }

  const afterHeading = text.slice(heading.length);

  if (!afterHeading.startsWith('\n')) {
    const next = `${heading}\n${afterHeading}`;
    return { text: next, cursor: heading.length + 1, changed: next !== source };
  }

  const afterNewline = afterHeading.slice(1);

  if (afterNewline.length === 0 || afterNewline.startsWith('\n')) {
    return { text, cursor: heading.length + 1, changed: text !== source };
  }

  const next = `${heading}\n\n${afterNewline}`;
  return { text: next, cursor: heading.length + 1, changed: next !== source };
}

function setStatus(state, text) {
  saveState.dataset.state = state;
  saveText.textContent = text;
}

function formatSavedTime(timestamp) {
  return timeFormatter.format(new Date(timestamp));
}

function focusAt(position) {
  notes.focus({ preventScroll: true });
  const safePosition = Math.max(0, Math.min(position, notes.value.length));
  notes.setSelectionRange(safePosition, safePosition);
  notes.scrollTop = 0;
}

function scheduleSave() {
  window.clearTimeout(inputTimer);
  inputTimer = window.setTimeout(() => {
    void saveNow();
  }, SAVE_DEBOUNCE_MS);
}

function handleInput() {
  dirty = true;
  saveFailed = false;
  setStatus('pending', 'Unsaved');
  scheduleSave();
}

async function saveNow() {
  if (saving) {
    if (dirty) queued = true;
    return;
  }
  if (!dirty) return;

  window.clearTimeout(inputTimer);
  inputTimer = null;

  const snapshot = notes.value;
  dirty = false;
  saving = true;
  queued = false;
  setStatus('saving', 'Saving…');

  let failed = false;

  try {
    await storage.set({
      [STORAGE_KEY]: {
        text: snapshot,
        updatedAt: Date.now()
      }
    });
    lastSavedAt = Date.now();
  } catch (error) {
    failed = true;
    saveFailed = true;
    dirty = true;
    setStatus('error', 'Save failed');
    console.error('Line Notes could not save.', error);
  } finally {
    saving = false;

    if (!failed) {
      if (dirty) {
        queued = true;
      } else {
        setStatus('saved', `Saved ${formatSavedTime(lastSavedAt)}`);
      }
    }

    if (!failed && queued) {
      queued = false;
      window.setTimeout(() => {
        void saveNow();
      }, 0);
    }
  }
}

function flushSave() {
  if (!dirty) return;

  window.clearTimeout(inputTimer);
  inputTimer = null;
  dirty = false;

  try {
    const result = storage.set({
      [STORAGE_KEY]: {
        text: notes.value,
        updatedAt: Date.now()
      }
    });
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        dirty = true;
      });
    }
  } catch {
    dirty = true;
  }
}

function dateStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function exportNotes() {
  if (dirty) void saveNow();

  const blob = new Blob([notes.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `line-notes-${dateStamp()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function init() {
  let stored = null;

  try {
    const result = await storage.get({ [STORAGE_KEY]: null });
    stored = result[STORAGE_KEY];
  } catch (error) {
    setStatus('error', 'Could not load');
    console.error('Line Notes could not load.', error);
  }

  const originalText =
    typeof stored === 'string'
      ? stored
      : stored && typeof stored.text === 'string'
        ? stored.text
        : '';

  const updatedAt =
    stored && typeof stored.updatedAt === 'number' ? stored.updatedAt : null;

  const prepared = prepareForNewEntry(originalText);
  notes.value = prepared.text;
  homeCursor = prepared.cursor;
  exportButton.disabled = false;

  if (prepared.changed) {
    dirty = true;
    saveFailed = false;
    setStatus('saving', 'Saving…');
    void saveNow();
  } else {
    lastSavedAt = updatedAt;
    setStatus(
      'saved',
      updatedAt ? `Saved ${formatSavedTime(updatedAt)}` : 'Saved'
    );
  }

  focusAt(homeCursor);
  window.requestAnimationFrame(() => {
    if (document.activeElement === document.body) focusAt(homeCursor);
  });
  window.setTimeout(() => {
    if (document.activeElement === document.body) focusAt(homeCursor);
  }, 80);
}

notes.addEventListener('input', handleInput);
exportButton.addEventListener('click', () => {
  void exportNotes();
});

window.setInterval(() => {
  if (dirty && !saveFailed) void saveNow();
}, SAVE_INTERVAL_MS);

window.addEventListener('pagehide', flushSave);
window.addEventListener('beforeunload', flushSave);
window.addEventListener('blur', flushSave);
window.addEventListener('focus', () => {
  if (document.activeElement === document.body) focusAt(homeCursor);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

void init();
