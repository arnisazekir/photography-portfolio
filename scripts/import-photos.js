/**
 * import-photos.js
 *
 * Run with: npm run import
 *
 * This script copies your original image folders into the project's
 * uploads directory and builds the initial portfolio.json data file.
 *
 * SOURCE_BASE should point to the folder that CONTAINS the 5 image folders.
 * By default it points to the parent of this project (one level up).
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Change SOURCE_BASE if your original folders live somewhere else.
const SOURCE_BASE = path.resolve(__dirname, '..', '..'); // /Users/you/Documents/Programs

const PROJECT_ROOT = path.resolve(__dirname, '..');
const UPLOADS_BASE = path.join(PROJECT_ROOT, 'public', 'uploads', 'photos');
const DATA_FILE    = path.join(PROJECT_ROOT, 'data', 'portfolio.json');

// Mapping: sourceFolder → { id, name, description, vibe }
const SEGMENT_DEFS = [
  {
    sourceFolder: 'bnw ',          // note trailing space (actual folder name)
    internalFolder: 'bnw',         // clean name used inside this project
    id: 'monochrome-studies',
    name: 'Monochrome Studies',
    description: 'Black and white images focused on contrast, form, and shadow.',
    vibe: 'monochrome'
  },
  {
    sourceFolder: 'dark forest',
    internalFolder: 'dark-forest',
    id: 'nocturnal-nature',
    name: 'Nocturnal Nature',
    description: 'Deep atmospheric frames where light and dark meet the forest.',
    vibe: 'atmospheric'
  },
  {
    sourceFolder: 'urban',
    internalFolder: 'urban',
    id: 'urban-fragments',
    name: 'Urban Fragments',
    description: 'Concrete geometry, city light, and the quiet life between structures.',
    vibe: 'urban'
  },
  {
    sourceFolder: 'stormtrooper',
    internalFolder: 'stormtrooper',
    id: 'cinematic-figures',
    name: 'Cinematic Figures',
    description: 'Character studies and editorial compositions with surreal presence.',
    vibe: 'cinematic'
  },
  {
    sourceFolder: 'set the tone',
    internalFolder: 'set-the-tone',
    id: 'tonal-experiments',
    name: 'Tonal Experiments',
    description: 'Mood-driven frames exploring light, color grading, and editorial tone.',
    vibe: 'tonal'
  }
];

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP']);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function getImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => IMAGE_EXTS.has(path.extname(f)));
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
  // Load existing data (preserve any edits already made)
  let data = { segments: [] };
  if (fs.existsSync(DATA_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
  }

  for (const def of SEGMENT_DEFS) {
    const srcDir  = path.join(SOURCE_BASE, def.sourceFolder);
    const dstDir  = path.join(UPLOADS_BASE, def.internalFolder);
    const files   = getImages(srcDir);

    if (files.length === 0) {
      console.warn(`⚠  No images found in: ${srcDir}`);
    } else {
      console.log(`✔  ${def.name}: ${files.length} images from "${def.sourceFolder}"`);
    }

    // Find or create segment entry
    let seg = data.segments.find(s => s.id === def.id);
    if (!seg) {
      seg = {
        id: def.id,
        sourceFolder: def.internalFolder,
        name: def.name,
        description: def.description,
        vibe: def.vibe,
        dominantColors: [],
        images: []
      };
      data.segments.push(seg);
    }

    // Copy images and register them
    files.forEach((filename, idx) => {
      const src = path.join(srcDir, filename);

      // Sanitise filename: replace spaces with underscores
      const cleanName = filename.replace(/ /g, '_');
      const dst = path.join(dstDir, cleanName);

      copyFile(src, dst);

      // Only add if not already registered
      if (!seg.images.find(i => i.filename === cleanName)) {
        seg.images.push({
          filename: cleanName,
          path: `/uploads/photos/${def.internalFolder}/${cleanName}`,
          order: seg.images.length + 1,
          dominantColors: [],
          suggestedVibe: def.vibe
        });
      }
    });
  }

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n✅  portfolio.json saved → ${DATA_FILE}`);
  console.log('   Run "npm start" to launch the site.\n');
}

main();
