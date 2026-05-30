require('dotenv').config();
const express     = require('express');
const compression = require('compression');
const session     = require('express-session');
const flash       = require('connect-flash');
const multer      = require('multer');
const sharp       = require('sharp');
const path        = require('path');
const fs          = require('fs');
const cloudinary  = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app  = express();
const PORT = process.env.PORT || 3000;
const PUB  = path.join(__dirname, 'public');

// ─── Data helpers ─────────────────────────────────────────────────────────────

const DATA_FILE = path.join(__dirname, 'data', 'portfolio.json');

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { segments: [] }; }
}

// Atomic save: write temp then rename — prevents corruption if server crashes mid-write
function saveData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// ─── Image helpers ────────────────────────────────────────────────────────────

const THUMB_MAX_W = 900;
const FULL_MAX_W  = 2400; // cap originals so the server doesn't serve 30 MB RAW conversions

async function processUpload(srcAbs, folder, filename) {
  const thumbDir = path.join(PUB, 'uploads', 'thumbs', folder);
  fs.mkdirSync(thumbDir, { recursive: true });
  const thumbAbs = path.join(thumbDir, filename);
  const thumbRel = `/uploads/thumbs/${folder}/${filename}`;

  // Generate thumbnail only — Cloudinary handles full-res
  await sharp(srcAbs)
    .rotate()
    .resize(THUMB_MAX_W, null, { withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toFile(thumbAbs);

  return thumbRel;
}

function deleteImageFiles(img) {
  const full  = path.join(PUB, img.path.replace(/^\//, ''));
  const thumb = img.thumbPath ? path.join(PUB, img.thumbPath.replace(/^\//, '')) : null;
  if (fs.existsSync(full))          fs.unlinkSync(full);
  if (thumb && fs.existsSync(thumb)) fs.unlinkSync(thumb);
}

// ─── Color / vibe analysis ────────────────────────────────────────────────────

async function analyzeImage(filePath) {
  // Wrap in a 4-second timeout so large files never hang the upload
  return Promise.race([
    (async () => {
      try {
        const Vibrant = require('node-vibrant');
        const palette = await Vibrant.from(filePath).getPalette();
        const colors  = [];
        for (const key of ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted']) {
          if (palette[key]) colors.push(palette[key].getHex());
        }
        const dominant = palette.Vibrant || palette.Muted || palette.DarkMuted;
        let vibe = 'neutral';
        if (dominant) {
          const [r, g, b] = dominant.getRgb();
          const lum = (r * 299 + g * 587 + b * 114) / 1000;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          if (sat < 30)            vibe = lum < 80 ? 'dark' : lum < 160 ? 'monochrome' : 'minimal';
          else if (lum < 60)       vibe = 'dark';
          else if (r > g && r > b) vibe = lum < 140 ? 'cinematic' : 'warm';
          else if (b > r && b > g) vibe = 'atmospheric';
          else if (g > r && g > b) vibe = 'earthy';
          else                     vibe = 'urban';
        }
        return { dominantColors: colors.slice(0, 3), suggestedVibe: vibe };
      } catch {
        return { dominantColors: [], suggestedVibe: 'neutral' };
      }
    })(),
    new Promise(resolve => setTimeout(() => resolve({ dominantColors: [], suggestedVibe: 'neutral' }), 4000))
  ]);
}

// ─── Multer — uploads land in a temp dir first so we can process them ─────────

const ALLOWED = /^(jpeg|jpg|png|webp)$/i;

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      // segmentId may not be parsed yet if file field came first in FormData
      // Fall back to a temp uploads dir and move the file in the route handler
      const segmentId = req.body.segmentId;
      const data = loadData();
      const seg  = segmentId && data.segments.find(s => s.id === segmentId);
      const dir  = seg
        ? path.join(PUB, 'uploads', 'photos', seg.sourceFolder)
        : path.join(PUB, 'uploads', 'tmp');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    }
  }),
  limits: { fileSize: 40 * 1024 * 1024 },  // 40 MB raw limit; we'll resize it down
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (ALLOWED.test(ext)) return cb(null, true);
    cb(new Error('Only jpg, jpeg, png, webp files are allowed'));
  }
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.xhr || req.path.startsWith('/admin/api')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/admin/login');
}

// ─── Express setup ────────────────────────────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(compression());

// Images: 1-year cache (filenames include timestamp so cache-bust on new uploads)
app.use('/uploads', express.static(path.join(PUB, 'uploads'), {
  maxAge: '365d', immutable: true
}));
app.use(express.static(PUB, { maxAge: '1h', etag: true }));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(flash());

// ─── Public routes ────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const data = loadData();
  res.render('index', { segments: data.segments });
});

app.get('/gallery/:segmentId', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data    = loadData();
  const segment = data.segments.find(s => s.id === req.params.segmentId);
  if (!segment) return res.status(404).render('404', { message: 'Gallery not found' });
  const sorted = [...segment.images].sort((a, b) => a.order - b.order);
  res.render('gallery', { segment, images: sorted, segments: data.segments });
});

// ─── Admin auth ───────────────────────────────────────────────────────────────

app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin-login', { error: req.flash('error') });
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  req.flash('error', 'Incorrect password');
  res.redirect('/admin/login');
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ─── Admin panel ──────────────────────────────────────────────────────────────

app.get('/admin', requireAdmin, (req, res) => {
  const data = loadData();
  res.render('admin', {
    segments: data.segments,
    flash: req.flash('success'),
    error: req.flash('error')
  });
});

// Per-segment editing page
app.get('/admin/segment/:segmentId', requireAdmin, (req, res) => {
  const data    = loadData();
  const segment = data.segments.find(s => s.id === req.params.segmentId);
  if (!segment) return res.redirect('/admin');
  const sorted = [...segment.images].sort((a, b) => a.order - b.order);
  res.render('admin-segment', {
    segment, images: sorted, segments: data.segments,
    flash: req.flash('success'), error: req.flash('error')
  });
});

// Set cover image for a segment
app.put('/admin/api/segments/:segmentId/cover', requireAdmin, (req, res) => {
  const { thumbPath } = req.body;
  const data = loadData();
  const seg  = data.segments.find(s => s.id === req.params.segmentId);
  if (!seg) return res.status(404).json({ error: 'Segment not found' });
  seg.coverImage = thumbPath || null;
  saveData(data);
  res.json({ success: true });
});

// Dedicated reorder view for a single segment (the "other panel")
app.get('/admin/reorder/:segmentId', requireAdmin, (req, res) => {
  const data    = loadData();
  const segment = data.segments.find(s => s.id === req.params.segmentId);
  if (!segment) return res.redirect('/admin');
  const sorted = [...segment.images].sort((a, b) => a.order - b.order);
  res.render('admin-reorder', { segment, images: sorted, segments: data.segments });
});

// ─── Admin API: segments ──────────────────────────────────────────────────────

app.post('/admin/api/segments', requireAdmin, (req, res) => {
  const { name, description, vibe } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  const data = loadData();
  const id   = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (data.segments.find(s => s.id === id))
    return res.status(400).json({ error: 'A segment with that name already exists' });

  const folder = id;
  fs.mkdirSync(path.join(PUB, 'uploads', 'photos', folder), { recursive: true });
  fs.mkdirSync(path.join(PUB, 'uploads', 'thumbs', folder), { recursive: true });

  data.segments.push({ id, sourceFolder: folder, name: name.trim(),
    description: description || '', vibe: vibe || 'neutral', dominantColors: [], images: [] });
  saveData(data);
  res.json({ success: true, id });
});

app.put('/admin/api/segments/:segmentId', requireAdmin, (req, res) => {
  const { name, description, vibe } = req.body;
  const data = loadData();
  const seg  = data.segments.find(s => s.id === req.params.segmentId);
  if (!seg) return res.status(404).json({ error: 'Segment not found' });
  if (name && name.trim()) seg.name = name.trim();
  if (description !== undefined) seg.description = description;
  if (vibe) seg.vibe = vibe;
  saveData(data);
  res.json({ success: true, segment: seg });
});

app.delete('/admin/api/segments/:segmentId', requireAdmin, (req, res) => {
  const data = loadData();
  const idx  = data.segments.findIndex(s => s.id === req.params.segmentId);
  if (idx === -1) return res.status(404).json({ error: 'Segment not found' });
  const seg = data.segments[idx];
  seg.images.forEach(deleteImageFiles);
  data.segments.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Reorder segments themselves (homepage order)
app.put('/admin/api/segments/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  const data = loadData();
  const map  = new Map(data.segments.map(s => [s.id, s]));
  const reordered = orderedIds.map(id => map.get(id)).filter(Boolean);
  // Append any segments not in the list (safety)
  data.segments.forEach(s => { if (!orderedIds.includes(s.id)) reordered.push(s); });
  data.segments = reordered;
  saveData(data);
  res.json({ success: true });
});

// ─── Admin API: images ────────────────────────────────────────────────────────

app.post('/admin/api/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });

    const data = loadData();
    const seg  = data.segments.find(s => s.id === req.body.segmentId);
    if (!seg) return res.status(404).json({ error: 'Segment not found' });

    // If multer put the file in tmp (segmentId wasn't ready), move it now
    const destDir = path.join(PUB, 'uploads', 'photos', seg.sourceFolder);
    fs.mkdirSync(destDir, { recursive: true });
    const finalPath = path.join(destDir, req.file.filename);
    if (req.file.path !== finalPath) fs.renameSync(req.file.path, finalPath);

    const absPath = finalPath;
    const relPath = `/uploads/photos/${seg.sourceFolder}/${req.file.filename}`;

    let thumbPath = null;
    try {
      thumbPath = await processUpload(absPath, seg.sourceFolder, req.file.filename);
    } catch (e) {
      console.error('Thumb generation failed:', e.message);
    }

    const analysis  = await analyzeImage(absPath);
    const maxOrder  = seg.images.reduce((m, i) => Math.max(m, i.order), 0);
    const imgRecord = {
      filename: req.file.filename,
      path:     relPath,
      thumbPath,
      order:    maxOrder + 1,
      dominantColors: analysis.dominantColors,
      suggestedVibe:  analysis.suggestedVibe
    };

    // Upload to Cloudinary in background — non-blocking so admin upload stays fast
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      cloudinary.uploader.upload(absPath, {
        folder:    'outoforder/' + seg.sourceFolder,
        public_id: path.parse(req.file.filename).name,
        overwrite: false
      }).then(result => {
        imgRecord.cloudinaryUrl = result.secure_url;
        const d = loadData();
        const s = d.segments.find(x => x.id === seg.id);
        const i = s && s.images.find(x => x.filename === imgRecord.filename);
        if (i) { i.cloudinaryUrl = result.secure_url; saveData(d); }
      }).catch(e => console.error('Cloudinary upload failed:', e.message));
    }

    seg.images.push(imgRecord);
    saveData(data);
    res.json({ success: true, image: imgRecord, analysis });
  });
});

app.delete('/admin/api/segments/:segmentId/images/:filename', requireAdmin, (req, res) => {
  const data = loadData();
  const seg  = data.segments.find(s => s.id === req.params.segmentId);
  if (!seg) return res.status(404).json({ error: 'Segment not found' });
  const idx = seg.images.findIndex(i => i.filename === req.params.filename);
  if (idx === -1) return res.status(404).json({ error: 'Image not found' });
  deleteImageFiles(seg.images[idx]);
  seg.images.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

app.put('/admin/api/segments/:segmentId/images/:filename/move', requireAdmin, (req, res) => {
  const { targetSegmentId } = req.body;
  const data   = loadData();
  const srcSeg = data.segments.find(s => s.id === req.params.segmentId);
  const dstSeg = data.segments.find(s => s.id === targetSegmentId);
  if (!srcSeg || !dstSeg) return res.status(404).json({ error: 'Segment not found' });

  const idx = srcSeg.images.findIndex(i => i.filename === req.params.filename);
  if (idx === -1) return res.status(404).json({ error: 'Image not found' });

  const [img] = srcSeg.images.splice(idx, 1);

  // Move full image
  const srcFull = path.join(PUB, 'uploads', 'photos', srcSeg.sourceFolder, img.filename);
  const dstDir  = path.join(PUB, 'uploads', 'photos', dstSeg.sourceFolder);
  fs.mkdirSync(dstDir, { recursive: true });
  if (fs.existsSync(srcFull)) fs.renameSync(srcFull, path.join(dstDir, img.filename));

  // Move thumbnail
  if (img.thumbPath) {
    const srcThumb = path.join(PUB, 'uploads', 'thumbs', srcSeg.sourceFolder, img.filename);
    const dstThumb = path.join(PUB, 'uploads', 'thumbs', dstSeg.sourceFolder, img.filename);
    fs.mkdirSync(path.dirname(dstThumb), { recursive: true });
    if (fs.existsSync(srcThumb)) fs.renameSync(srcThumb, dstThumb);
    img.thumbPath = `/uploads/thumbs/${dstSeg.sourceFolder}/${img.filename}`;
  }

  img.path  = `/uploads/photos/${dstSeg.sourceFolder}/${img.filename}`;
  img.order = dstSeg.images.reduce((m, i) => Math.max(m, i.order), 0) + 1;
  dstSeg.images.push(img);
  saveData(data);
  res.json({ success: true });
});

app.put('/admin/api/segments/:segmentId/order', requireAdmin, (req, res) => {
  const { orderedFilenames } = req.body;
  const data = loadData();
  const seg  = data.segments.find(s => s.id === req.params.segmentId);
  if (!seg) return res.status(404).json({ error: 'Segment not found' });
  orderedFilenames.forEach((fn, i) => {
    const img = seg.images.find(im => im.filename === fn);
    if (img) img.order = i + 1;
  });
  saveData(data);
  res.json({ success: true });
});

// ─── Public API (read-only) ───────────────────────────────────────────────────

app.get('/api/portfolio', (req, res) => {
  const data = loadData();
  res.json({ segments: data.segments.map(s => ({
    id: s.id, name: s.name, description: s.description, vibe: s.vibe, imageCount: s.images.length
  }))});
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).render('404', { message: 'Page not found' }));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Portfolio → http://localhost:${PORT}`);
  console.log(`Admin     → http://localhost:${PORT}/admin`);
});
