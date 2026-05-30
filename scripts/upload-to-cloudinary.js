/**
 * upload-to-cloudinary.js
 * Resizes photos to 3000px then uploads to Cloudinary (stays under free 10MB limit).
 * Saves Cloudinary URLs into portfolio.json for sharp lightbox display.
 *
 * Run: node scripts/upload-to-cloudinary.js
 * Safe to re-run — skips images that already have a cloudinaryUrl.
 */

require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const sharp      = require('sharp');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const DATA_FILE = path.join(__dirname, '..', 'data', 'portfolio.json');
const PUB       = path.join(__dirname, '..', 'public');
const UPLOAD_W  = 3000; // resize to 3000px wide before upload — sharp on any screen, under 10MB

async function resizeAndUpload(localPath, folder, publicId) {
  // Write resized version to a temp file
  const tmp = path.join(os.tmpdir(), publicId + '_upload.jpg');
  await sharp(localPath)
    .rotate()
    .resize(UPLOAD_W, null, { withoutEnlargement: true })
    .jpeg({ quality: 90, progressive: true })
    .toFile(tmp);

  try {
    const result = await cloudinary.uploader.upload(tmp, {
      folder:    'outoforder/' + folder,
      public_id: publicId,
      overwrite: true
    });
    return result.secure_url;
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp); // clean up temp file
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let uploaded = 0, skipped = 0, errors = 0;

  for (const seg of data.segments) {
    for (const img of seg.images) {
      if (img.cloudinaryUrl) { skipped++; continue; }

      const localPath = path.join(PUB, img.path.replace(/^\//, ''));
      if (!fs.existsSync(localPath)) {
        console.warn('  ⚠  Missing:', img.path);
        errors++;
        continue;
      }

      try {
        const publicId = path.parse(img.filename).name;
        const url = await resizeAndUpload(localPath, seg.sourceFolder, publicId);
        img.cloudinaryUrl = url;
        uploaded++;
        console.log('  ✔', seg.sourceFolder + '/' + img.filename);
      } catch (e) {
        console.error('  ✗', img.filename, e.message);
        errors++;
      }
    }
  }

  // Atomic save
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);

  console.log('\n✅  Done — uploaded:', uploaded, '| skipped:', skipped, '| errors:', errors);
  if (uploaded > 0) {
    console.log('   Now run:');
    console.log('   git add -A && git commit -m "add cloudinary urls" && git push');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
