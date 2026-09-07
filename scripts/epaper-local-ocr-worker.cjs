/* Isolated OCR process. Language bytes and engine are packaged locally; no OCR service calls. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { createWorker, PSM } = require('tesseract.js');

function getLocalTesseractLangPath() {
  const targetDir = path.join(process.cwd(), '.hostinger', 'tesseract-data');
  fs.mkdirSync(targetDir, { recursive: true });
  for (const lang of ['hin', 'eng']) {
    const targetFile = path.join(targetDir, `${lang}.traineddata.gz`);
    if (!fs.existsSync(targetFile)) {
      const sourceFile = path.join(path.dirname(require.resolve(`@tesseract.js-data/${lang}`)), '4.0.0_best_int', `${lang}.traineddata.gz`);
      fs.copyFileSync(sourceFile, targetFile);
    }
  }
  return targetDir;
}

const maxRss = (Number(process.env.EPAPER_OCR_MAX_RSS_MB) || 768) * 1024 * 1024;
const memoryCheck = setInterval(() => {
  const rss = process.memoryUsage().rss;
  if (rss > maxRss) {
    console.error(`Local OCR RSS ${Math.round(rss / (1024 * 1024))}MB exceeded ${Math.round(maxRss / (1024 * 1024))}MB`);
    process.exit(75);
  }
}, 250);
process.once('message', async (message) => {
  let worker;
  try {
    const image = Buffer.from(message.image, 'base64');
    if (!image.length || image.length > 10 * 1024 * 1024) throw new Error('Invalid OCR image size.');
    const prepared = await sharp(image, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 3000, height: 5000, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    const langPath = getLocalTesseractLangPath();
    worker = await createWorker('hin+eng', 1, {
      langPath,
      gzip: true,
      cacheMethod: 'none',
      errorHandler: (error) => process.send({ error: String(error).slice(0, 300) }, () => process.exit(76)),
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const { data } = await worker.recognize(prepared.data, {}, { text: true, blocks: true });
    const suggestions = (data.blocks || []).slice(0, 150).map((block) => {
      const text = String(block.text || '').trim().slice(0, 30000);
      const { x0, y0, x1, y1 } = block.bbox;
      return { title: text.split('\n').find((line) => line.trim())?.slice(0, 220) || '', text, confidence: block.confidence || 0,
        hotspot: { x: x0 / prepared.info.width, y: y0 / prepared.info.height, w: (x1 - x0) / prepared.info.width, h: (y1 - y0) / prepared.info.height } };
    }).filter((entry) => entry.text && entry.hotspot.w > 0 && entry.hotspot.h > 0);
    await worker.terminate();
    worker = null;
    clearInterval(memoryCheck);
    process.send({ suggestions }, () => process.exit(0));
  } catch (error) {
    if (worker) await worker.terminate().catch(() => {});
    process.send({ error: String(error).slice(0, 300) }, () => process.exit(76));
  }
});
