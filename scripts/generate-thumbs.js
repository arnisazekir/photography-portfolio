/**
 * generate-thumbs.js
 * Generates fast-loading thumbnail versions of every image in portfolio.json.
 * Safe to run multiple times — skips images that already have a thumb.
 *
 * Run: node scripts/generate-thumbs.js
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const ROOT      = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'portfolio.json');
const PUB       = path.join(ROOT, 'public');

const THUMB_MAX_W = 900;   // px — enough for 3-col masonry on retina
const THUMB_Q    = 82;     // JPEG quality for thumbnails

async function generateThumb(srcAbs, thumbAbs) {
  await sharp(srcAbs)
    .rotate()                          // auto-orient from EXIF
    .resize(THUMB_MAX_W, null, { withoutEnlargement: true })
    .jpeg({ quality: THUMB_Q, progressive: true, mozjpeg: true })
    .toFile(thumbAbs);
}

async function main() {
  const raw  = fs.readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  let done = 0, skipped = 0, errors = 0;

  for (const seg of data.segments) {
    const thumbDir = path.join(PUB, 'uploads', 'thumbs', seg.sourceFolder);
    fs.mkdirSync(thumbDir, { recursive: true });

    for (const img of seg.images) {
      const thumbRel = `/uploads/thumbs/${seg.sourceFolder}/${img.filename}`;
      const thumbAbs = path.join(PUB, 'uploads', 'thumbs', seg.sourceFolder, img.filename);

      // Skip if already done and file exists
      if (img.thumbPath && fs.existsSync(thumbAbs)) { skipped++; continue; }

      const srcAbs = path.join(PUB, img.path.replace(/^\//, ''));
      if (!fs.existsSync(srcAbs)) {
        console.warn(`  ⚠  Missing source: ${img.path}`);
        errors++;
        continue;
      }

      try {
        await generateThumb(srcAbs, thumbAbs);
        img.thumbPath = thumbRel;
        done++;
        process.stdout.write(`  ✔  ${seg.sourceFolder}/${img.filename}\n`);
      } catch (e) {
        console.error(`  ✗  ${img.filename}: ${e.message}`);
        errors++;
      }
    }
  }

  // Atomic save: write to temp file then rename to avoid corruption
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);

  console.log(`\n✅  Done — generated: ${done}, skipped: ${skipped}, errors: ${errors}`);
}

main().catch(err => { console.error(err); process.exit(1); });
