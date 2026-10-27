# Photo Pages

A small, local app for turning selected photos into A4 PDF pages.

Upload pictures, browse them by the date stored inside each photo, select any number, pick a
grid, and download a PDF. If you select 12 photos and choose a 6-photo grid, you get two pages.
A single title can be repeated at the top of every page, each photo sits in a rounded frame with
its capture date underneath, and an optional title-and-page footnote can sit at the bottom right.

Everything stays on your computer. There is no account, no cloud upload, and no external service.

## Run it

Requires **Node.js 20 or newer**.

```bash
npm install
npm start
```

Open <http://127.0.0.1:4173>.

For development with automatic restarts:

```bash
npm run dev
```

## How to use it

1. **Upload.** Drop photos onto the upload box or choose images. Files are copied into `data/`.
2. **Browse by date.** Photos are grouped by the capture date found in their metadata, newest
   first. Use the year dropdown to narrow the library.
3. **Select.** Click a photo to toggle it. Drag across photos to select a group; a plain drag
   replaces the current selection. Hold **Ctrl** (or **Cmd**) while dragging or clicking to add to
   the current selection. (On a touch screen, tap photos instead of dragging.) The number on each
   photo is its order in the packet. Use **Select all shown** for a whole year, or **Unselect all**
   to start over. **Delete** opens a small menu that removes the selected photos, or every uploaded
   photo, from Photo Pages. This only edits the app's own copy — the files you uploaded from stay
   on your PC.
4. **Choose a grid.** Pick a grid such as 2 × 3 (6 per page), 2 × 2 (4 per page), or 4 × 3
   (12 per page). The page count updates immediately. 12 photos in a 6-photo grid makes 2 pages.
5. **Add a title.** The title appears at the top of every page, or leave it blank for photo-only
   pages. Optionally turn on **Add page footnote** to add the title and page number, such as
   “2026 trip page 1/4”, at the bottom right of every page.
6. **Download a PDF.** Choose **All pages** or **Choose pages**. For a subset, enter a page number
   or set, such as `1`, `2-4`, or `1, 3, 5`, then click **Download PDF**. A subset keeps the full
   set's page numbers, so downloading page 2 of 4 still says “page 2/4” on that page.

The page controls live in a collapsible **Export settings** panel so the page preview keeps most of
the column. The preview always fits the whole A4 sheet in view; the library and the preview scroll
independently. The main window itself does not scroll on a desktop-sized screen.

Pages are A4 portrait. Photos are fitted inside their frames without cropping, with rounded
corners, and the capture date sits underneath each photo, aligned to its left edge. The PDF does
not include file names or extensions. The library also hides extensions; hover over a file name to
see the full name.

## Dates

The app reads `DateTimeOriginal` and `CreateDate` from each photo's EXIF metadata.

- **EXIF date** — used when the camera or phone recorded one.
- **File date** — if there is no EXIF date, the file's own modified date is used and marked
  **file date** in the library.
- **No date found** — if neither exists, the photo appears in the “No date found” group at the end.

Dates are never invented. You can see which source was used on each photo card. The PDF caption
uses the same date, formatted like `Oct 22` and aligned under the bottom-left of each photo. If
only a file date is available, that date is shown; if there is no date at all, the caption says
`No date`.

## Where things live

```
data/
  photos.json     the photo list and dates
  originals/      the uploaded files, untouched
  thumbs/         small gallery thumbnails
  previews/       PDF-size versions (long edge 1800 px)
```

Delete `data/` while the app is stopped to reset the library.

Back up the app by copying the whole `data/` folder.

## Limits and details

- Uploads are limited to 40 MB per image (`MAX_UPLOAD_MB` changes this).
- JPG, PNG, WebP, GIF, TIFF, HEIC/HEIF, AVIF, and BMP are accepted when the local image library can
  decode them. HEIC depends on your platform's codec support.
- The app binds to `127.0.0.1` and rejects other machines.
- The PDF is generated locally at A4 portrait. Use your PDF viewer's print dialog if you need a
  different paper size.
- Building a long PDF can take a moment because the high-resolution previews are embedded into
  the file.
- Removing a photo deletes Photo Pages' own copies in `data/originals`, `data/thumbs`, and
  `data/previews`. It never touches the file you uploaded from your own folders.
- **Delete → Delete selected** / **Delete all** removes library entries in bulk. The confirmation
  says it plainly: only Photo Pages' uploaded section is affected.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Local port |
| `HOST` | `127.0.0.1` | Bind address |
| `DATA_DIR` | `./data` | Where photos and `photos.json` are stored |
| `MAX_UPLOAD_MB` | `40` | Maximum size per image |

## Stack

- Node.js + Fastify
- `sharp` for thumbnails, previews, and orientation
- `exifr` for capture dates
- `pdf-lib` for A4 PDF pages
- Plain HTML, CSS, and JavaScript — no build step
