# EPaper V2 Setup (Production Checklist)

This project now runs e-paper in **metadata-on-Mongo + files-on-disk** mode.

## 1) Required environment

Set these in `.env` / hosting panel:

```env
MONGODB_URI=...
JWT_SECRET=...
EPAPER_ENABLE_PAGE_IMAGE_GENERATION=1
# Recommended on versioned production deploys: force /storage proxy mode
# so e-paper files and breaking-news audio stay durable across redeploys.
EPAPER_FORCE_STORAGE=1
```

## 2) Storage mode behavior

- If `public/uploads` is writable: files are served from:
  - `/uploads/epapers/{citySlug}/{YYYY-MM-DD}/...`
- If not writable (or `EPAPER_FORCE_STORAGE=1`):
  - files are written to `storage/uploads/epapers/...`
  - served via secure proxy:
    - `/api/public/uploads/epapers/...`

## 3) Free open-source automation stack

For PDF -> page images, install **one** of:

### Option A: Poppler (`pdftoppm`) recommended

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils
```

### Option B: ImageMagick (`magick`)

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y imagemagick
```

Notes:
- `pdftoppm` is faster and usually cleaner for newspapers.
- If ImageMagick is used, ensure PDF policy allows conversion.

## 4) Free OCR hotspot automation

### Admin page hotspot editor
- Uses local free OCR first (`tesseract.js` in browser).
- Supports Hindi+English detection (`hin+eng`).
- Optional server fallback can be enabled with:

```env
NEXT_PUBLIC_EPAPER_REMOTE_OCR_FALLBACK=true
```

### Optional OCR API fallback
- Existing `/api/admin/epapers/assist` route supports OCR fallback.
- If using OCR.space, set:

```env
OCR_SPACE_API_KEY=...
OCR_SPACE_LANGUAGE=hin
```

## 5) Migration (old EPaper schema -> v2)

Run once:

```bash
npm run migrate:epapers
```

It migrates:
- old `city/pdfUrl/thumbnail/pages/articleHotspots`
- to v2 fields + `EPaperArticle` records.

## 6) End-to-end smoke test

1. Open `/admin/epapers/new`
2. Upload PDF + thumbnail
3. Open `/admin/epapers/{id}`
4. If page images missing, click **Generate Page Images** (needs converter + feature flag)
5. Open page editor `/admin/epapers/{id}/page/1`
6. Click **Auto Detect Hotspots (Free OCR)**
7. Create suggested articles
8. Open `/main/epaper` and verify click-through article modal on hotspots
