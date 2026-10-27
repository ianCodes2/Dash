const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const PX_PER_MM = 96 / 25.4;
const PAGE_W_PX = PAGE_W_MM * PX_PER_MM;
const PAGE_H_PX = PAGE_H_MM * PX_PER_MM;

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const captionDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const els = {
  library: document.querySelector('.library'),
  gallery: document.getElementById('gallery'),
  emptyState: document.getElementById('empty-state'),
  yearFilter: document.getElementById('year-filter'),
  selectAll: document.getElementById('select-all'),
  clearSelection: document.getElementById('clear-selection'),
  deleteMenuButton: document.getElementById('delete-menu-button'),
  deleteMenu: document.getElementById('delete-menu'),
  libraryStat: document.getElementById('library-stat'),
  librarySummary: document.getElementById('library-summary'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  browse: document.getElementById('browse'),
  uploadState: document.getElementById('upload-state'),
  uploadLabel: document.getElementById('upload-label'),
  uploadBar: document.getElementById('upload-bar-fill'),
  titleInput: document.getElementById('title-input'),
  gridSelect: document.getElementById('grid-select'),
  footnoteToggle: document.getElementById('footnote-toggle'),
  downloadScope: document.getElementById('download-scope'),
  pageRangeRow: document.getElementById('page-range-row'),
  pageRangeInput: document.getElementById('page-range'),
  pageRangeHint: document.getElementById('page-range-hint'),
  downloadButton: document.getElementById('download-button'),
  pageSummary: document.getElementById('page-summary'),
  settingsPanel: document.getElementById('settings-panel'),
  settingsCurrent: document.getElementById('settings-current'),
  pages: document.getElementById('pages'),
  toast: document.getElementById('toast'),
};

const state = {
  photos: [],
  selected: readSelection(),
  title: localStorage.getItem('photo-pages:title') || '',
  layout: localStorage.getItem('photo-pages:layout') || '2x3',
  footnote: localStorage.getItem('photo-pages:footnote') === '1',
  year: '',
  uploading: false,
};

function readSelection() {
  try {
    const parsed = JSON.parse(localStorage.getItem('photo-pages:selected') || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function persistSelection() {
  try {
    localStorage.setItem('photo-pages:selected', JSON.stringify(state.selected));
  } catch {
    // A full or disabled localStorage must not break the app.
  }
}

const allowedLayouts = new Set([...els.gridSelect.options].map((option) => option.value));
if (!allowedLayouts.has(state.layout)) state.layout = '2x3';

const cards = new Map();
let titleTimer = null;
let toastTimer = null;
let resizeFrame = null;

const drag = {
  pointerId: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  startId: null,
  mode: 'replace',
  active: false,
  visited: new Set(),
};
let suppressClickUntil = 0;
let dragScrollFrame = 0;

/* ---------- formatting ---------- */

function photoDate(photo) {
  if (!photo.capturedAt) return null;
  const date = new Date(photo.capturedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function captionDate(photo) {
  const date = photoDate(photo);
  return date ? captionDateFormatter.format(date) : 'No date';
}

function displayFilename(filename) {
  const value = String(filename || '');
  return value.replace(/\.[^.]+$/, '') || value || 'photo';
}

function dayKey(photo) {
  const date = photoDate(photo);
  if (!date) return 'undated';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(photo) {
  const date = photoDate(photo);
  return date ? dayFormatter.format(date) : 'No date found';
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function visiblePhotos() {
  if (!state.year) return state.photos;
  return state.photos.filter((photo) => {
    const date = photoDate(photo);
    return date && String(date.getFullYear()) === state.year;
  });
}

function gridSize() {
  const [cols, rows] = state.layout.split('x').map(Number);
  return {
    cols: Number.isFinite(cols) ? cols : 2,
    rows: Number.isFinite(rows) ? rows : 3,
  };
}

function pageCount() {
  const { cols, rows } = gridSize();
  const capacity = Math.max(1, cols * rows);
  return Math.ceil(state.selected.length / capacity);
}

/* ---------- toast ---------- */

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 4200);
}

/* ---------- data ---------- */

async function loadPhotos() {
  const response = await fetch('/api/photos', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load your photos.');
  const payload = await response.json();
  state.photos = payload.photos ?? [];
  const ids = new Set(state.photos.map((photo) => photo.id));
  state.selected = state.selected.filter((id) => ids.has(id));
  persistSelection();
  buildYearFilter();
  renderGallery();
  renderPages();
  updateStats();
}

function buildYearFilter() {
  const years = [...new Set(
    state.photos
      .map(photoDate)
      .filter(Boolean)
      .map((date) => String(date.getFullYear())),
  )].sort((a, b) => Number(b) - Number(a));

  if (state.year && !years.includes(state.year)) state.year = '';
  els.yearFilter.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All';
  els.yearFilter.append(all);
  for (const year of years) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    els.yearFilter.append(option);
  }
  els.yearFilter.value = state.year;
}

/* ---------- gallery ---------- */

function renderGallery() {
  cards.clear();
  els.gallery.replaceChildren();
  const photos = visiblePhotos();

  els.emptyState.hidden = state.photos.length > 0;
  if (!state.photos.length) {
    updateStats();
    return;
  }

  if (!photos.length) {
    const message = document.createElement('p');
    message.className = 'muted';
    message.style.padding = '24px 0';
    message.textContent = 'No photos in this year.';
    els.gallery.append(message);
    updateStats();
    return;
  }

  const groups = new Map();
  for (const photo of photos) {
    const key = dayKey(photo);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }

  for (const [key, groupPhotos] of groups) {
    const section = document.createElement('section');
    section.className = 'date-group';

    const heading = document.createElement('h3');
    heading.textContent = key === 'undated' ? 'No date found' : dayLabel(groupPhotos[0]);
    const count = document.createElement('span');
    count.textContent = plural(groupPhotos.length, 'photo');
    heading.append(count);
    section.append(heading);

    const grid = document.createElement('div');
    grid.className = 'photo-grid';
    for (const photo of groupPhotos) grid.append(photoCard(photo));
    section.append(grid);
    els.gallery.append(section);
  }

  syncSelection();
  updateStats();
}

function photoCard(photo) {
  const card = document.createElement('article');
  card.className = 'photo-card';
  card.dataset.id = photo.id;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'photo-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.setAttribute('aria-label', `Select ${photo.filename}`);

  const img = document.createElement('img');
  img.src = `/api/photos/${photo.id}/thumb`;
  img.alt = photo.filename;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;
  toggle.append(img);

  const orderBadge = document.createElement('span');
  orderBadge.className = 'order-badge';
  orderBadge.hidden = true;

  const check = document.createElement('span');
  check.className = 'check-badge';
  check.textContent = '✓';
  check.setAttribute('aria-hidden', 'true');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-btn';
  remove.textContent = '×';
  remove.title = `Remove ${photo.filename}`;
  remove.setAttribute('aria-label', `Remove ${photo.filename}`);

  const footer = document.createElement('div');
  footer.className = 'photo-footer';
  const name = document.createElement('span');
  name.textContent = displayFilename(photo.filename);
  name.title = photo.filename;
  name.style.overflow = 'hidden';
  name.style.textOverflow = 'ellipsis';
  name.style.whiteSpace = 'nowrap';
  footer.append(name);
  if (photo.dateSource === 'file') {
    const source = document.createElement('span');
    source.className = 'source';
    source.textContent = 'file date';
    source.title = 'This photo had no capture date in its metadata, so its file date is used.';
    footer.append(source);
  }

  toggle.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil) return;
    if (event.ctrlKey || event.metaKey) addSelection(photo.id);
    else toggleSelection(photo.id);
  });
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    void removePhoto(photo);
  });

  card.append(toggle, orderBadge, check, remove, footer);
  cards.set(photo.id, { card, orderBadge, toggle });
  return card;
}

function syncSelection() {
  for (const [id, { card, orderBadge, toggle }] of cards) {
    const index = state.selected.indexOf(id);
    const selected = index !== -1;
    card.classList.toggle('selected', selected);
    toggle.setAttribute('aria-pressed', String(selected));
    orderBadge.hidden = !selected;
    orderBadge.textContent = selected ? String(index + 1) : '';
  }
}

function toggleSelection(id) {
  const index = state.selected.indexOf(id);
  if (index === -1) state.selected.push(id);
  else state.selected.splice(index, 1);
  persistSelection();
  syncSelection();
  renderPages();
  updateStats();
}

function addSelection(id) {
  if (state.selected.includes(id)) return;
  state.selected.push(id);
  persistSelection();
  syncSelection();
  renderPages();
  updateStats();
}

/* ---------- drag selection ---------- */

function beginDrag(event) {
  if (event.button !== 0 || event.pointerType === 'touch') return;
  if (event.target.closest('.remove-btn')) return;
  const card = event.target.closest('.photo-card');
  if (!card || !els.gallery.contains(card)) return;

  suppressClickUntil = 0;
  drag.pointerId = event.pointerId;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.startId = card.dataset.id;
  drag.active = false;
  drag.visited.clear();
}

function applyDragCard(id) {
  if (!id || drag.visited.has(id)) return;
  drag.visited.add(id);
  if (state.selected.includes(id)) return;
  state.selected.push(id);
  syncSelection();
  updateStats();
}

function applyDragAtPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  const card = element?.closest?.('.photo-card');
  if (card && els.gallery.contains(card)) applyDragCard(card.dataset.id);
}

function applyDragPath(fromX, fromY, toX, toY) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.min(120, Math.max(1, Math.ceil(distance / 10)));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    applyDragAtPoint(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);
  }
}

function dragScrollStep() {
  if (!drag.active) {
    dragScrollFrame = 0;
    return;
  }
  const edge = 80;
  const maxSpeed = 22;
  const pane = els.library;
  const paneRect = pane.getBoundingClientRect();
  const paneScrollable = pane.scrollHeight > pane.clientHeight + 1;
  const top = paneScrollable ? paneRect.top : 0;
  const bottom = paneScrollable ? paneRect.bottom : window.innerHeight;
  let dy = 0;
  if (drag.lastY < top + edge) {
    dy = -Math.min(maxSpeed, Math.ceil(((top + edge - drag.lastY) / edge) * maxSpeed));
  } else if (drag.lastY > bottom - edge) {
    dy = Math.min(maxSpeed, Math.ceil(((drag.lastY - (bottom - edge)) / edge) * maxSpeed));
  }
  if (dy !== 0) {
    if (paneScrollable) pane.scrollBy(0, dy);
    else window.scrollBy(0, dy);
    applyDragAtPoint(drag.lastX, drag.lastY);
  }
  dragScrollFrame = requestAnimationFrame(dragScrollStep);
}

function startDragScroll() {
  if (!dragScrollFrame) dragScrollFrame = requestAnimationFrame(dragScrollStep);
}

function stopDragScroll() {
  if (dragScrollFrame) cancelAnimationFrame(dragScrollFrame);
  dragScrollFrame = 0;
}

function moveDrag(event) {
  if (drag.pointerId === null || event.pointerId !== drag.pointerId) return;
  if ((event.buttons & 1) === 0) {
    finishDrag();
    return;
  }
  const previousX = drag.lastX;
  const previousY = drag.lastY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;

  if (!drag.active) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
    drag.active = true;
    drag.mode = event.ctrlKey || event.metaKey ? 'add' : 'replace';
    document.body.classList.add('drag-selecting');
    try {
      els.gallery.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is only a fallback for releases outside the window.
    }
    if (drag.mode === 'replace') {
      state.selected = [];
      syncSelection();
    }
    applyDragCard(drag.startId);
    startDragScroll();
  }

  event.preventDefault();
  applyDragPath(previousX, previousY, event.clientX, event.clientY);
}

function finishDrag() {
  const wasActive = drag.active;
  if (wasActive) {
    applyDragAtPoint(drag.lastX, drag.lastY);
    suppressClickUntil = performance.now() + 400;
    persistSelection();
    renderPages();
    updateStats();
  }
  drag.pointerId = null;
  drag.active = false;
  drag.visited.clear();
  stopDragScroll();
  document.body.classList.remove('drag-selecting');
}

function endDrag(event) {
  if (drag.pointerId === null) return;
  if (event && event.pointerId !== drag.pointerId) return;
  finishDrag();
}

function selectAllShown() {
  for (const photo of visiblePhotos()) {
    if (!state.selected.includes(photo.id)) state.selected.push(photo.id);
  }
  persistSelection();
  syncSelection();
  renderPages();
  updateStats();
}

function clearSelection() {
  state.selected = [];
  persistSelection();
  syncSelection();
  renderPages();
  updateStats();
}

function setDeleteMenu(open) {
  els.deleteMenu.hidden = !open;
  els.deleteMenuButton.setAttribute('aria-expanded', String(open));
  if (open) els.deleteMenu.querySelector('.menu-item:not(:disabled)')?.focus();
}

async function deletePhotos(scope) {
  const deletingAll = scope === 'all';
  const ids = deletingAll ? state.photos.map((photo) => photo.id) : [...state.selected];
  if (!ids.length) {
    showToast(
      deletingAll
        ? 'There are no uploaded photos to delete.'
        : 'Select the photos you want to delete first.',
    );
    return;
  }

  const message = deletingAll
    ? `Remove all ${plural(ids.length, 'uploaded photo')} from Photo Pages?\n\nThey will disappear from the uploaded section. Your original files on this PC are not touched.`
    : `Remove ${plural(ids.length, 'selected photo')} from Photo Pages?\n\nThey will disappear from the uploaded section. Your original files on this PC are not touched.`;
  if (!window.confirm(message)) return;

  els.deleteMenuButton.disabled = true;
  try {
    const response = await fetch('/api/photos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deletingAll ? { all: true } : { ids }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'Could not remove those photos.');
    }

    const removed = new Set(ids);
    state.photos = state.photos.filter((photo) => !removed.has(photo.id));
    state.selected = state.selected.filter((id) => !removed.has(id));
    persistSelection();
    buildYearFilter();
    renderGallery();
    renderPages();
    updateStats();
    showToast(`Removed ${plural(ids.length, 'photo')} from Photo Pages.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not remove those photos.');
  } finally {
    els.deleteMenuButton.disabled = false;
  }
}

async function removePhoto(photo) {
  const confirmed = window.confirm(
    `Remove “${photo.filename}” from Photo Pages?\n\nYour original file on this PC is not touched.`,
  );
  if (!confirmed) return;
  const response = await fetch(`/api/photos/${photo.id}`, { method: 'DELETE' });
  if (!response.ok) {
    showToast('That photo could not be removed.');
    return;
  }
  state.photos = state.photos.filter((item) => item.id !== photo.id);
  state.selected = state.selected.filter((id) => id !== photo.id);
  persistSelection();
  buildYearFilter();
  renderGallery();
  renderPages();
  updateStats();
}

/* ---------- uploads ---------- */

const imageNamePattern = /\.(jpe?g|png|webp|gif|tiff?|heic|heif|avif|bmp)$/i;

async function uploadFiles(fileList) {
  const files = [...fileList].filter(
    (file) => file.type.startsWith('image/') || imageNamePattern.test(file.name),
  );
  if (!files.length) {
    showToast('Choose image files to upload.');
    return;
  }
  if (state.uploading) return;

  state.uploading = true;
  els.uploadState.hidden = false;
  const failures = [];
  let done = 0;

  try {
    for (const file of files) {
      done += 1;
      els.uploadLabel.textContent = `Uploading ${done} of ${files.length} — ${file.name}`;
      els.uploadBar.style.width = `${Math.round(((done - 1) / files.length) * 100)}%`;
      const form = new FormData();
      form.append('photo', file, file.name);
      try {
        const response = await fetch(`/api/photos?lastModified=${encodeURIComponent(file.lastModified)}`, {
          method: 'POST',
          body: form,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          failures.push(`${file.name}: ${payload?.error ?? 'upload failed'}`);
        }
      } catch {
        failures.push(`${file.name}: upload failed`);
      }
      els.uploadBar.style.width = `${Math.round((done / files.length) * 100)}%`;
    }
  } finally {
    state.uploading = false;
    els.uploadState.hidden = true;
    els.uploadBar.style.width = '0%';
    els.fileInput.value = '';
  }

  try {
    await loadPhotos();
  } catch {
    showToast('Photos were saved, but the library could not refresh. Reload the page.');
    return;
  }
  if (failures.length) {
    showToast(`${plural(files.length - failures.length, 'photo')} added. ${failures[0]}`);
  } else {
    showToast(`${plural(files.length, 'photo')} added.`);
  }
}

/* ---------- pages ---------- */

function renderPages() {
  els.pages.replaceChildren();
  const { cols, rows } = gridSize();
  const capacity = Math.max(1, cols * rows);
  const totalPages = pageCount();

  if (!state.selected.length) {
    const empty = document.createElement('div');
    empty.className = 'pages-empty';
    empty.textContent = 'Select photos to see your pages here.';
    els.pages.append(empty);
    updateStats();
    return;
  }

  const photoById = new Map(state.photos.map((photo) => [photo.id, photo]));
  const title = state.title.trim();

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const frame = document.createElement('div');
    frame.className = 'page-frame';

    const page = document.createElement('div');
    page.className = 'page';
    page.style.setProperty('--cols', String(cols));
    page.style.setProperty('--rows', String(rows));

    if (title) {
      const heading = document.createElement('h2');
      heading.className = 'page-title';
      heading.textContent = title;
      page.append(heading);
    }

    const grid = document.createElement('div');
    grid.className = 'page-grid';
    const pagePhotos = state.selected.slice(pageIndex * capacity, (pageIndex + 1) * capacity);
    for (const id of pagePhotos) {
      const photo = photoById.get(id);
      if (!photo) continue;
      const cell = document.createElement('div');
      cell.className = 'page-cell';
      const media = document.createElement('div');
      media.className = 'page-media';
      const img = document.createElement('img');
      img.src = `/api/photos/${id}/preview`;
      img.alt = photo.filename;
      img.decoding = 'async';
      media.append(img);
      const date = document.createElement('span');
      date.className = 'page-date';
      date.textContent = captionDate(photo);
      cell.append(media, date);
      grid.append(cell);
    }
    page.append(grid);
    if (state.footnote) {
      const footnote = document.createElement('div');
      footnote.className = 'page-footnote';
      footnote.textContent = `${title ? `${title} ` : ''}page ${pageIndex + 1}/${totalPages}`;
      page.append(footnote);
    }
    frame.append(page);
    els.pages.append(frame);
  }

  scalePages();
  updateStats();
}

function scalePages() {
  const frames = [...els.pages.querySelectorAll('.page-frame')];
  if (!frames.length) return;
  const style = getComputedStyle(els.pages);
  const availableWidth =
    els.pages.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
  const availableHeight =
    els.pages.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2;
  if (availableWidth <= 0 || availableHeight <= 0) return;
  // Fit the whole A4 sheet inside the preview pane, not just its width, so the
  // full page is visible without scrolling even when the settings are open.
  const scale = Math.min(1, availableWidth / PAGE_W_PX, availableHeight / PAGE_H_PX);
  for (const frame of frames) {
    const page = frame.firstElementChild;
    if (!page) continue;
    page.style.transform = `scale(${scale})`;
    frame.style.width = `${PAGE_W_PX * scale}px`;
    frame.style.height = `${PAGE_H_PX * scale}px`;
  }
}

function scheduleScale() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    scalePages();
  });
}

/* ---------- stats ---------- */

function updateStats() {
  const undated = state.photos.filter((photo) => !photo.capturedAt).length;
  els.libraryStat.textContent = state.photos.length
    ? `${plural(state.photos.length, 'photo')}${undated ? ` · ${undated} without a date` : ''}`
    : 'No photos yet';

  if (!state.photos.length) {
    els.librarySummary.textContent = 'Sorted by the date inside each photo.';
  } else {
    els.librarySummary.textContent = undated
      ? `Sorted by the date inside each photo. ${plural(undated, 'photo')} has no metadata date.`
      : 'Sorted by the date inside each photo.';
  }

  if (state.selected.length) {
    const pages = pageCount();
    const { cols, rows } = gridSize();
    els.pageSummary.textContent = `${state.selected.length} selected · ${plural(pages, 'page')} · ${cols} × ${rows}`;
  } else {
    els.pageSummary.textContent = '0 selected';
  }
  updateSettingsSummary();
  updateDeleteMenuState();
  updateDownloadState();
}

function updateDeleteMenuState() {
  const deleteSelected = els.deleteMenu.querySelector('[data-delete="selected"]');
  const deleteAll = els.deleteMenu.querySelector('[data-delete="all"]');
  if (deleteSelected) deleteSelected.disabled = state.selected.length === 0;
  if (deleteAll) deleteAll.disabled = state.photos.length === 0;
}

function updateSettingsSummary() {
  const gridLabel = els.gridSelect.selectedOptions[0]?.textContent?.trim() || '';
  const title = state.title.trim();
  let summary = gridLabel;
  if (title) summary += ` · “${title}”`;
  if (state.footnote) summary += ' · footnote';
  els.settingsCurrent.textContent = summary;
}

/* ---------- download ---------- */

function parsePageSelection(value, maxPages) {
  const text = String(value ?? '').trim();
  if (!text) return { error: 'Enter at least one page.' };
  if (/^all$/i.test(text)) {
    return { pages: Array.from({ length: maxPages }, (_, index) => index + 1) };
  }

  const normalized = text.replace(/[\u2013\u2014]/g, '-').replace(/\s*-\s*/g, '-');
  const pages = new Set();
  for (const token of normalized.split(/[\s,]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) return { error: 'Use page numbers like 1, 3-5.' };
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < 1 || start > maxPages || end > maxPages) {
      return { error: `Pages must be between 1 and ${maxPages}.` };
    }
    if (start > end) return { error: 'Page ranges must go from low to high.' };
    for (let page = start; page <= end; page += 1) pages.add(page);
  }

  if (!pages.size) return { error: 'Enter at least one page.' };
  return { pages: [...pages].sort((a, b) => a - b) };
}

function updateDownloadState() {
  const hasSelection = state.selected.length > 0;
  const choosingPages = els.downloadScope.value === 'range';
  const rangeText = els.pageRangeInput.value.trim();
  const maxPages = pageCount();

  els.pageRangeRow.hidden = !choosingPages;
  els.pageRangeInput.disabled = !choosingPages || !hasSelection;

  let rangeError = '';
  if (choosingPages && hasSelection && rangeText) {
    const parsed = parsePageSelection(rangeText, maxPages);
    rangeError = parsed.error || '';
  }

  els.pageRangeHint.hidden = !rangeError;
  els.pageRangeHint.textContent = rangeError;
  els.pageRangeInput.setAttribute('aria-invalid', rangeError ? 'true' : 'false');

  const rangeReady = !choosingPages || (rangeText.length > 0 && !rangeError);
  els.downloadButton.disabled = !hasSelection || !rangeReady;
}

function downloadFileName(pages) {
  const base =
    state.title
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'photo-pages';
  const suffix = pages === 'all' ? 'all-pages' : `pages-${pages.join('-')}`;
  return `${base}-${suffix}.pdf`;
}

async function downloadPdf() {
  if (!state.selected.length || state.uploading) return;

  const totalPages = pageCount();
  let pages = 'all';
  if (els.downloadScope.value === 'range') {
    const parsed = parsePageSelection(els.pageRangeInput.value, totalPages);
    if (parsed.error) {
      updateDownloadState();
      showToast(parsed.error);
      els.pageRangeInput.focus();
      return;
    }
    pages = parsed.pages;
  }

  els.downloadButton.disabled = true;
  els.downloadButton.textContent = 'Building PDF…';
  els.downloadButton.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoIds: state.selected,
        layout: state.layout,
        title: state.title.trim(),
        footnote: state.footnote,
        pages,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Could not create the PDF (${response.status}).`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFileName(pages);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    const count = pages === 'all' ? totalPages : pages.length;
    showToast(`Downloaded ${plural(count, 'page')}.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not create the PDF.');
  } finally {
    els.downloadButton.textContent = 'Download PDF';
    els.downloadButton.removeAttribute('aria-busy');
    updateDownloadState();
  }
}

/* ---------- events ---------- */

els.titleInput.value = state.title;
els.gridSelect.value = state.layout;
els.footnoteToggle.checked = state.footnote;

els.titleInput.addEventListener('input', () => {
  state.title = els.titleInput.value;
  localStorage.setItem('photo-pages:title', state.title);
  if (titleTimer) clearTimeout(titleTimer);
  titleTimer = setTimeout(() => renderPages(), 120);
});

els.gridSelect.addEventListener('change', () => {
  state.layout = els.gridSelect.value;
  localStorage.setItem('photo-pages:layout', state.layout);
  renderPages();
});

els.footnoteToggle.addEventListener('change', () => {
  state.footnote = els.footnoteToggle.checked;
  localStorage.setItem('photo-pages:footnote', state.footnote ? '1' : '0');
  renderPages();
});

els.downloadScope.addEventListener('change', () => {
  updateDownloadState();
  if (els.downloadScope.value === 'range') els.pageRangeInput.focus();
});

els.pageRangeInput.addEventListener('input', updateDownloadState);

els.yearFilter.addEventListener('change', () => {
  state.year = els.yearFilter.value;
  renderGallery();
});

els.selectAll.addEventListener('click', selectAllShown);
els.clearSelection.addEventListener('click', clearSelection);
els.deleteMenuButton.addEventListener('click', () => {
  setDeleteMenu(els.deleteMenu.hidden);
});
els.deleteMenu.addEventListener('click', (event) => {
  const action = event.target.closest('[data-delete]')?.dataset.delete;
  if (!action) return;
  setDeleteMenu(false);
  void deletePhotos(action);
});
document.addEventListener('click', (event) => {
  if (!els.deleteMenu.hidden && !event.target.closest('.menu-wrap')) setDeleteMenu(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || els.deleteMenu.hidden) return;
  setDeleteMenu(false);
  els.deleteMenuButton.focus();
});
els.downloadButton.addEventListener('click', () => void downloadPdf());

els.gallery.addEventListener('pointerdown', beginDrag);
els.gallery.addEventListener('dragstart', (event) => event.preventDefault());
window.addEventListener('pointermove', moveDrag, { passive: false });
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('blur', () => {
  if (drag.pointerId !== null) finishDrag();
});

els.browse.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  if (els.fileInput.files?.length) void uploadFiles(els.fileInput.files);
});

const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
els.dropzone.addEventListener('dragover', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  els.dropzone.classList.add('dragging');
});
els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('dragging'));
els.dropzone.addEventListener('drop', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  els.dropzone.classList.remove('dragging');
  if (event.dataTransfer?.files?.length) void uploadFiles(event.dataTransfer.files);
});

window.addEventListener('resize', scheduleScale);

if ('ResizeObserver' in window) {
  const pagesObserver = new ResizeObserver(() => scheduleScale());
  pagesObserver.observe(els.pages);
}

loadPhotos().catch(() => showToast('Could not reach the local photo library.'));
