# OutOfOrder — Photography Portfolio

**Run:** `npm run dev` (nodemon) or `npm start`
**URL:** `http://localhost:3000`
**Deploy:** Procfile (`web: node server.js`) — compatible with Render/Heroku

## Stack
- Node.js + Express, EJS templates, no database
- `data/portfolio.json` — sole data store (atomic write: tmp file → rename to prevent corruption)
- sharp — local thumbnail generation (900px max width, JPEG q82)
- Cloudinary — full-res image hosting (non-blocking background upload after admin upload)
- express-session + connect-flash — admin auth
- multer — file upload handling (40 MB limit, jpg/jpeg/png/webp only)

## Environment Variables (.env)
```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SESSION_SECRET=
ADMIN_PASSWORD=
PORT=3000
```
Cloudinary upload is skipped gracefully if `CLOUDINARY_CLOUD_NAME` is not set.

## Project Structure
```
server.js               — all routes + business logic
data/portfolio.json     — segments + image metadata (source of truth)
views/
  index.ejs             — homepage (segment grid)
  gallery.ejs           — individual segment gallery
  admin.ejs             — admin dashboard
  admin-organise.ejs    — segment management
  admin-segment.ejs     — segment editor (upload, delete, set cover)
  admin-reorder.ejs     — drag-to-reorder images (Sortable.js)
  admin-login.ejs       — login page
  404.ejs
public/
  css/style.css         — main portfolio styles
  css/admin.css         — admin panel styles
  css/reorder.css
  css/segment-edit.css
  js/main.js            — frontend portfolio JS
  js/transitions.js     — page transitions
  js/admin.js           — admin frontend JS
  uploads/photos/       — original images (served with 1-year cache)
  uploads/thumbs/       — generated thumbnails
scripts/
  import-photos.js      — bulk import from source folders
  generate-thumbs.js    — regenerate all thumbnails
  upload-to-cloudinary.js — bulk upload to Cloudinary
experiments/
  logo-font-lab.html    — font/logo experimentation page (accessible at /logo-font-lab)
```

## The 5 Segments
| Display Name        | ID                  | Source Folder   |
|---------------------|---------------------|-----------------|
| Monochrome Studies  | monochrome-studies  | bnw             |
| Nocturnal Nature    | nocturnal-nature    | dark forest     |
| Urban Fragments     | urban-fragments     | urban           |
| Cinematic Figures   | cinematic-figures   | stormtrooper    |
| Tonal Experiments   | tonal-experiments   | set the tone    |

Source image folders live inside the project root: `/Users/arnisa/Documents/Programs/My Work/photography-portfolio/{folder-name}/`

## Image Pipeline
1. Admin uploads photo → multer saves to `public/uploads/photos/{sourceFolder}/`
2. sharp generates thumbnail → `public/uploads/thumbs/{sourceFolder}/`
3. Cloudinary upload runs in background (non-blocking) → `cloudinaryUrl` saved to portfolio.json
4. Gallery serves `thumbPath` for grid, `cloudinaryUrl` for full-res (fallback to local `path`)

## Admin Routes
- `GET  /admin/login` — login page
- `POST /admin/login` — authenticate (ADMIN_PASSWORD from .env)
- `GET  /admin` — dashboard
- `GET  /admin/organise` — segment list
- `GET  /admin/segment/:id` — edit segment (upload/delete photos, set cover)
- `GET  /admin/reorder/:id` — drag reorder
- `POST /admin/api/reorder` — save new image order
- `POST /admin/api/upload` — upload photo to segment
- `POST /admin/api/delete-image` — delete photo
- `POST /admin/api/set-cover` — set segment cover image
- `POST /admin/api/update-segment` — edit segment name/description

## Brand Identity
- Name: **OutOfOrder**
- Aesthetic: minimal, dark, editorial — the work speaks, the UI stays out of the way
- Typography: logo has custom `.f-fix` span for kerning on the "f" in "OutOfOrder"

## Critical Rules
- Always use `saveData()` (atomic write) — never `fs.writeFileSync` directly on `DATA_FILE`
- Never remove the Cloudinary fallback check (`if (process.env.CLOUDINARY_CLOUD_NAME)`) — project must work without Cloudinary configured
- Image order is stored as `order` integer on each image object; sort by `order` ascending before rendering
- `coverImage` on a segment overrides the first-image default for the segment card thumbnail
- Session cookie: 8-hour expiry, httpOnly
