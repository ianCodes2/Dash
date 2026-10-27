import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import sharp from 'sharp';
import exifr from 'exifr';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import { PhotoStore } from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
const originalsDir = path.join(dataDir, 'originals');
const thumbsDir = path.join(dataDir, 'thumbs');
const previewsDir = path.join(dataDir, 'previews');
const store = new PhotoStore(path.join(dataDir, 'photos.json'));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 40));

const EXTENSIONS = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  tiff: 'tiff',
  heif: 'heic',
  avif: 'avif',
  bmp: 'bmp',
};

function cleanName(name) {
  const base = path.basename(String(name || 'photo').replace(/\\/g, '/'));
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'photo';
}

async function removeIfPresent(...files) {
  await Promise.allSettled(files.filter(Boolean).map((file) => fsp.unlink(file)));
}

function sortNewestFirst(photos) {
  return photos.sort((a, b) => {
    if (!a.capturedAt && !b.capturedAt) return String(b.importedAt).localeCompare(String(a.importedAt));
    if (!a.capturedAt) return 1;
    if (!b.capturedAt) return -1;
    return String(b.capturedAt).localeCompare(String(a.capturedAt));
  });
}

function pdfSafeText(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u20ac/g, 'EUR')
    .replace(/[\u2022\u00b7]/g, '-')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fitPdfText(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function wrapPdfText(text, font, size, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let index = 0;
  let truncated = false;

  while (index < words.length) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      index += 1;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      continue;
    }

    let piece = '';
    for (const char of word) {
      if (piece && font.widthOfTextAtSize(piece + char, size) > maxWidth) break;
      piece += char;
    }
    if (!piece) piece = word.slice(0, 1);
    current = piece;
    const rest = word.slice(piece.length);
    if (rest) words[index] = rest;
    else index += 1;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (current) {
    truncated = true;
  }

  if (truncated && lines.length) {
    lines[lines.length - 1] = fitPdfText(lines[lines.length - 1], font, size, maxWidth);
  }
  return lines.length ? lines : [''];
}

const MM_TO_PT = 2.834645669291339;
const PDF_PAGE_WIDTH = 210 * MM_TO_PT;
const PDF_PAGE_HEIGHT = 297 * MM_TO_PT;
const PDF_PADDING = 12 * MM_TO_PT;
const PDF_SECTION_GAP = 6 * MM_TO_PT;
const PDF_CELL_GAP = 3.5 * MM_TO_PT;
const PDF_TITLE_SIZE = 21;
const PDF_TITLE_LINE_HEIGHT = PDF_TITLE_SIZE * 1.2;
const PDF_FOOTNOTE_SIZE = 9;
const PDF_FOOTNOTE_LINE_HEIGHT = PDF_FOOTNOTE_SIZE * 1.3;
const PDF_DATE_SIZE = 8;
const PDF_DATE_LINE_HEIGHT = PDF_DATE_SIZE * 1.2;
const PDF_DATE_GAP = 7;
const PDF_IMAGE_RADIUS = 4;
const PDF_DATE_COLOR = [0.545, 0.545, 0.545];

const pdfDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function photoDateLabel(photo) {
  if (!photo.capturedAt) return 'No date';
  const date = new Date(photo.capturedAt);
  return Number.isNaN(date.getTime()) ? 'No date' : pdfDateFormatter.format(date);
}

function roundedRectPath(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) {
    return [
      moveTo(x, y),
      lineTo(x + width, y),
      lineTo(x + width, y + height),
      lineTo(x, y + height),
      closePath(),
    ];
  }
  const k = 0.5522847498307936;
  const kr = k * r;
  return [
    moveTo(x + r, y),
    lineTo(x + width - r, y),
    appendBezierCurve(x + width - r + kr, y, x + width, y + r - kr, x + width, y + r),
    lineTo(x + width, y + height - r),
    appendBezierCurve(x + width, y + height - r + kr, x + width - r + kr, y + height, x + width - r, y + height),
    lineTo(x + r, y + height),
    appendBezierCurve(x + r - kr, y + height, x, y + height - r + kr, x, y + height - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - kr, x + r - kr, y, x + r, y),
    closePath(),
  ];
}

async function createPdf({ photos, pageNumbers, cols, rows, title, footnote }) {
  const capacity = Math.max(1, cols * rows);
  const totalPages = Math.ceil(photos.length / capacity);
  const safeTitle = pdfSafeText(title).slice(0, 160);
  const doc = await PDFDocument.create();
  const titleFont = await doc.embedFont(StandardFonts.TimesRomanBold);
  const footnoteFont = await doc.embedFont(StandardFonts.Helvetica);
  const innerWidth = PDF_PAGE_WIDTH - PDF_PADDING * 2;

  doc.setTitle(safeTitle || 'Photo Pages');
  doc.setAuthor('Photo Pages');
  doc.setCreator('Photo Pages');
  doc.setProducer('Photo Pages');

  const titleLines = safeTitle
    ? wrapPdfText(safeTitle, titleFont, PDF_TITLE_SIZE, innerWidth, 3)
    : [];
  const footnoteBase = safeTitle ? `${safeTitle} ` : '';

  for (const pageNumber of pageNumbers) {
    const page = doc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
    let top = PDF_PAGE_HEIGHT - PDF_PADDING;

    for (const line of titleLines) {
      const lineWidth = titleFont.widthOfTextAtSize(line, PDF_TITLE_SIZE);
      page.drawText(line, {
        x: (PDF_PAGE_WIDTH - lineWidth) / 2,
        y: top - PDF_TITLE_SIZE,
        size: PDF_TITLE_SIZE,
        font: titleFont,
        color: rgb(0.078, 0.067, 0.051),
      });
      top -= PDF_TITLE_LINE_HEIGHT;
    }
    if (titleLines.length) top -= PDF_SECTION_GAP;

    let bottom = PDF_PADDING;
    let footnoteDraw = null;
    if (footnote) {
      const raw = `${footnoteBase}page ${pageNumber}/${totalPages}`;
      let size = PDF_FOOTNOTE_SIZE;
      while (size > 6 && footnoteFont.widthOfTextAtSize(raw, size) > innerWidth) size -= 0.5;
      footnoteDraw = { text: fitPdfText(raw, footnoteFont, size, innerWidth), size };
      bottom += PDF_FOOTNOTE_LINE_HEIGHT + PDF_SECTION_GAP;
    }

    const gridTop = top;
    const gridWidth = innerWidth;
    const gridHeight = gridTop - bottom;
    const cellWidth = (gridWidth - PDF_CELL_GAP * (cols - 1)) / cols;
    const cellHeight = (gridHeight - PDF_CELL_GAP * (rows - 1)) / rows;
    if (cellWidth <= 1 || cellHeight <= 1) {
      const error = new Error('The title is too long to fit on the page.');
      error.statusCode = 400;
      throw error;
    }

    const start = (pageNumber - 1) * capacity;
    const pagePhotos = photos.slice(start, start + capacity);

    for (let i = 0; i < pagePhotos.length; i += 1) {
      const photo = pagePhotos[i];
      const previewPath = path.join(previewsDir, `${photo.id}.jpg`);
      let preview;
      try {
        preview = await fsp.readFile(previewPath);
      } catch {
        const error = new Error(`The print preview for ${photo.filename} is missing.`);
        error.statusCode = 500;
        throw error;
      }
      const image = await doc.embedJpg(preview);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = PDF_PADDING + col * (cellWidth + PDF_CELL_GAP);
      const cellY = gridTop - row * (cellHeight + PDF_CELL_GAP) - cellHeight;
      const mediaWidth = cellWidth;
      const mediaBottom = cellY + PDF_DATE_LINE_HEIGHT + PDF_DATE_GAP;
      const mediaTop = cellY + cellHeight;
      const mediaHeight = mediaTop - mediaBottom;
      if (mediaWidth <= 1 || mediaHeight <= 1) {
        const error = new Error('The grid is too small for photo captions.');
        error.statusCode = 400;
        throw error;
      }

      const scale = Math.min(mediaWidth / image.width, mediaHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const imageX = cellX + (cellWidth - drawWidth) / 2;
      const imageY = mediaBottom + (mediaHeight - drawHeight) / 2;

      page.pushOperators(
        pushGraphicsState(),
        ...roundedRectPath(imageX, imageY, drawWidth, drawHeight, PDF_IMAGE_RADIUS),
        clip(),
        endPath(),
      );
      page.drawImage(image, {
        x: imageX,
        y: imageY,
        width: drawWidth,
        height: drawHeight,
      });
      page.pushOperators(popGraphicsState());

      const dateText = photoDateLabel(photo);
      let dateSize = PDF_DATE_SIZE;
      while (dateSize > 6 && footnoteFont.widthOfTextAtSize(dateText, dateSize) > mediaWidth) {
        dateSize -= 0.5;
      }
      const dateBaseline =
        cellY + (PDF_DATE_LINE_HEIGHT - dateSize) / 2 + dateSize * 0.2;
      page.drawText(dateText, {
        x: cellX,
        y: dateBaseline,
        size: dateSize,
        font: footnoteFont,
        color: rgb(...PDF_DATE_COLOR),
      });
    }

    if (footnoteDraw) {
      const textWidth = footnoteFont.widthOfTextAtSize(footnoteDraw.text, footnoteDraw.size);
      page.drawText(footnoteDraw.text, {
        x: PDF_PAGE_WIDTH - PDF_PADDING - textWidth,
        y: PDF_PADDING + 1,
        size: footnoteDraw.size,
        font: footnoteFont,
        color: rgb(0.333, 0.333, 0.333),
      });
    }
  }

  return doc.save();
}

async function main() {
  await fsp.mkdir(originalsDir, { recursive: true });
  await fsp.mkdir(thumbsDir, { recursive: true });
  await fsp.mkdir(previewsDir, { recursive: true });
  await store.load();

  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: false,
  });

  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
      fields: 4,
      parts: 6,
    },
    throwFileSizeLimit: false,
  });

  app.addHook('onRequest', async (request, reply) => {
    const remote = request.socket.remoteAddress ?? '';
    const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    if (!local) {
      reply.status(403).send({ error: 'This app only accepts connections from this computer.' });
      return reply;
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' blob: data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
      ].join('; '),
    );
    return undefined;
  });

  app.setErrorHandler((error, request, reply) => {
    const status = Number(error.statusCode);
    if (status >= 400 && status < 500) {
      reply.status(status).send({ error: error.message || 'That request could not be completed.' });
      return;
    }
    console.error('Request failed:', error.message);
    reply.status(500).send({ error: 'Something went wrong while handling that photo.' });
  });

  app.get('/api/photos', async () => ({ photos: sortNewestFirst(store.list()) }));

  app.post('/api/photos', async (request, reply) => {
    let part;
    try {
      part = await request.file();
    } catch (error) {
      if (error.code === 'FST_REQ_FILE_TOO_LARGE' || error.code === 'FST_FILES_LIMIT') {
        return reply.status(413).send({ error: `Images must be under ${MAX_UPLOAD_MB} MB.` });
      }
      throw error;
    }
    if (!part) return reply.status(400).send({ error: 'Choose an image to upload.' });

    let buffer;
    try {
      buffer = await part.toBuffer();
    } catch (error) {
      if (error.code === 'FST_REQ_FILE_TOO_LARGE' || error.message?.includes('file size')) {
        return reply.status(413).send({ error: `Images must be under ${MAX_UPLOAD_MB} MB.` });
      }
      throw error;
    }
    if (!buffer?.length) return reply.status(400).send({ error: 'That image was empty.' });

    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      return reply.status(400).send({ error: 'That file could not be read as an image.' });
    }
    if (!metadata.width || !metadata.height) {
      return reply.status(400).send({ error: 'That image has no readable dimensions.' });
    }
    const extension = EXTENSIONS[metadata.format];
    if (!extension) {
      return reply.status(400).send({
        error: 'That image format is not supported. Use JPG, PNG, WebP, GIF, TIFF, HEIC, AVIF, or BMP.',
      });
    }

    const id = `ph_${randomUUID()}`;
    const originalPath = path.join(originalsDir, `${id}.${extension}`);
    const thumbPath = path.join(thumbsDir, `${id}.jpg`);
    const previewPath = path.join(previewsDir, `${id}.jpg`);

    try {
      await fsp.writeFile(originalPath, buffer);
      await sharp(buffer)
        .rotate()
        .resize({ width: 520, height: 520, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(thumbPath);
      await sharp(buffer)
        .rotate()
        .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 86, mozjpeg: true })
        .toFile(previewPath);
    } catch {
      await removeIfPresent(originalPath, thumbPath, previewPath);
      return reply.status(400).send({ error: 'That image could not be processed.' });
    }

    let exif = null;
    try {
      exif = await exifr.parse(buffer, { pick: ['DateTimeOriginal', 'CreateDate'] });
    } catch {
      exif = null;
    }
    const exifDate = exif?.DateTimeOriginal || exif?.CreateDate || null;
    const lastModified = Number(request.query?.lastModified);

    let capturedAt = null;
    let dateSource = 'none';
    if (exifDate instanceof Date && !Number.isNaN(exifDate.getTime())) {
      capturedAt = exifDate.toISOString();
      dateSource = 'exif';
    } else if (Number.isFinite(lastModified) && lastModified > 0) {
      const fallback = new Date(lastModified);
      if (!Number.isNaN(fallback.getTime())) {
        capturedAt = fallback.toISOString();
        dateSource = 'file';
      }
    }

    const photo = {
      id,
      filename: cleanName(part.filename),
      mimeType: part.mimetype,
      extension,
      bytes: buffer.length,
      width: metadata.width,
      height: metadata.height,
      capturedAt,
      dateSource,
      importedAt: new Date().toISOString(),
    };

    await store.add(photo);
    return reply.status(201).send({ photo });
  });

  app.delete('/api/photos/:id', async (request, reply) => {
    const { id } = request.params;
    const photo = store.get(id);
    if (!photo) return reply.status(404).send({ error: 'Photo not found.' });
    await removeIfPresent(
      path.join(originalsDir, `${photo.id}.${photo.extension}`),
      path.join(thumbsDir, `${photo.id}.jpg`),
      path.join(previewsDir, `${photo.id}.jpg`),
    );
    await store.remove(photo.id);
    return { ok: true };
  });

  app.delete('/api/photos', async (request, reply) => {
    const body = request.body;
    let targets;

    if (body?.all === true) {
      targets = store.list();
    } else {
      const ids = body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: 'Choose photos to delete.' });
      }
      if (ids.length > 5000) {
        return reply.status(400).send({ error: 'Too many photos to delete at once.' });
      }
      const seen = new Set();
      targets = [];
      for (const id of ids) {
        if (typeof id !== 'string' || seen.has(id)) {
          return reply.status(400).send({ error: 'The photo selection is invalid.' });
        }
        seen.add(id);
        const photo = store.get(id);
        if (photo) targets.push(photo);
      }
    }

    await Promise.allSettled(
      targets.map((photo) =>
        removeIfPresent(
          path.join(originalsDir, `${photo.id}.${photo.extension}`),
          path.join(thumbsDir, `${photo.id}.jpg`),
          path.join(previewsDir, `${photo.id}.jpg`),
        ),
      ),
    );
    await store.removeMany(targets.map((photo) => photo.id));
    return { ok: true, removed: targets.length };
  });

  app.get('/api/photos/:id/:variant', async (request, reply) => {
    const { id, variant } = request.params;
    const photo = store.get(id);
    if (!photo) return reply.status(404).send({ error: 'Photo not found.' });

    let file;
    let type = 'image/jpeg';
    let cache = 'private, max-age=3600';
    if (variant === 'thumb') {
      file = path.join(thumbsDir, `${photo.id}.jpg`);
    } else if (variant === 'preview') {
      file = path.join(previewsDir, `${photo.id}.jpg`);
    } else if (variant === 'original') {
      file = path.join(originalsDir, `${photo.id}.${photo.extension}`);
      type = photo.mimeType;
      cache = 'private, max-age=86400';
    } else {
      return reply.status(404).send({ error: 'Unknown image size.' });
    }

    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return reply.status(404).send({ error: 'That image file is missing from local storage.' });
    }
    return reply
      .header('Content-Type', type)
      .header('Content-Length', String(stat.size))
      .header('Cache-Control', cache)
      .send(fs.createReadStream(file));
  });

  app.post('/api/pdf', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Choose photos to download.' });
    }

    const ids = body.photoIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'Choose at least one photo.' });
    }
    if (ids.length > 5000) {
      return reply.status(400).send({ error: 'Too many photos for one PDF.' });
    }

    const layout = /^([1-4])x([1-4])$/.exec(String(body.layout || ''));
    if (!layout) return reply.status(400).send({ error: 'Choose a valid grid.' });
    const cols = Number(layout[1]);
    const rows = Number(layout[2]);
    const capacity = cols * rows;
    const totalPages = Math.ceil(ids.length / capacity);

    const photos = [];
    const seen = new Set();
    for (const id of ids) {
      if (typeof id !== 'string' || seen.has(id)) {
        return reply.status(400).send({ error: 'The photo selection is invalid.' });
      }
      const photo = store.get(id);
      if (!photo) {
        return reply.status(400).send({ error: 'One of the selected photos is no longer in the library.' });
      }
      seen.add(id);
      photos.push(photo);
    }

    let pageNumbers;
    if (body.pages === 'all') {
      pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
    } else if (Array.isArray(body.pages)) {
      const selectedPages = new Set();
      for (const page of body.pages) {
        if (!Number.isInteger(page) || page < 1 || page > totalPages) {
          return reply.status(400).send({ error: `Pages must be between 1 and ${totalPages}.` });
        }
        selectedPages.add(page);
      }
      if (!selectedPages.size) {
        return reply.status(400).send({ error: 'Choose at least one page to download.' });
      }
      pageNumbers = [...selectedPages].sort((a, b) => a - b);
    } else {
      return reply.status(400).send({ error: 'Choose which pages to download.' });
    }

    const title = typeof body.title === 'string' ? body.title.slice(0, 160).trim() : '';
    const pdf = await createPdf({
      photos,
      pageNumbers,
      cols,
      rows,
      title,
      footnote: Boolean(body.footnote),
    });

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="photo-pages.pdf"')
      .header('Cache-Control', 'no-store')
      .send(Buffer.from(pdf));
  });

  await app.register(fastifyStatic, {
    root: path.join(root, 'public'),
    prefix: '/',
    maxAge: 0,
    cacheControl: false,
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (!request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-cache');
    return payload;
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: 'Not found.' });
  });

  const close = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());

  await app.listen({ host: HOST, port: PORT });
  console.log(`Photo Pages is running at http://${HOST}:${PORT}`);
  console.log('Everything stays on this computer.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed to start Photo Pages.');
  process.exit(1);
});
