// ─── Inline segment name / description save ───────────────────────────────────

async function saveSegmentInfo(segmentId, btn) {
  const name = document.getElementById('iname-' + segmentId).value.trim();
  const desc = document.getElementById('idesc-' + segmentId).value.trim();
  if (!name) { toast('Name cannot be empty', true); return; }

  const orig = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const res = await fetch('/admin/api/segments/' + segmentId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Save failed');

    // Update visible heading so user sees the change immediately
    const heading = document.getElementById('name-' + segmentId);
    if (heading) heading.textContent = name;

    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    toast('Category updated');
  } catch (err) {
    btn.textContent = orig;
    btn.disabled = false;
    toast(err.message, true);
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--border)';
  el.classList.add('visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 3200);
}

function openModal(id)  { document.getElementById(id).classList.add('is-open'); }
function closeModal(id) { document.getElementById(id).classList.remove('is-open'); }

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

const dropZone       = document.getElementById('dropZone');
const fileInput      = document.getElementById('fileInput');
const uploadPreview  = document.getElementById('uploadPreview');
const previewWrap    = document.getElementById('uploadPreviewWrap');
const uploadAnalysis = document.getElementById('uploadAnalysis');
const uploadForm     = document.getElementById('uploadForm');
const uploadStatus   = document.getElementById('uploadStatus');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) previewFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) previewFile(fileInput.files[0]);
});

function previewFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    uploadPreview.src = e.target.result;
    previewWrap.style.display = 'flex';
    uploadAnalysis.innerHTML = '<span style="color:var(--text-faint)">Ready — select a segment and click Upload</span>';
  };
  reader.readAsDataURL(file);

  // Transfer to real file input
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
}

uploadForm.addEventListener('submit', async e => {
  e.preventDefault();

  const segmentId = document.getElementById('segmentSelect').value;
  if (!segmentId) return toast('Please choose a segment', true);
  if (!fileInput.files.length) return toast('Please choose an image', true);

  uploadStatus.textContent = 'Uploading…';

  const fd = new FormData();
  fd.append('segmentId', segmentId);  // must come before the file
  fd.append('image', fileInput.files[0]);

  try {
    const res = await fetch('/admin/api/upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Upload failed');

    // Show color analysis result
    const { analysis } = json;
    let html = '';
    if (analysis.dominantColors && analysis.dominantColors.length) {
      html += '<div class="analysis-colors">';
      analysis.dominantColors.forEach(c => {
        html += `<span class="color-swatch" style="background:${c}" title="${c}"></span>`;
      });
      html += '</div>';
    }
    if (analysis.suggestedVibe) {
      html += `<div class="analysis-vibe">Suggested vibe: <span>${analysis.suggestedVibe}</span></div>`;
    }
    uploadAnalysis.innerHTML = html;

    uploadStatus.textContent = '';
    toast('Image uploaded successfully');

    // Add new thumb to the segment grid without full reload
    const grid = document.getElementById(`grid-${segmentId}`);
    if (grid && json.image) {
      const card = buildThumbCard(segmentId, json.image);
      grid.appendChild(card);
      initSortable(grid);
    }

    // Reset file input only
    fileInput.value = '';

  } catch (err) {
    uploadStatus.textContent = '';
    toast(err.message, true);
  }
});

function buildThumbCard(segmentId, img) {
  const card = document.createElement('div');
  card.className = 'admin-img-card';
  card.dataset.filename = img.filename;
  card.innerHTML = `
    <img src="${img.thumbPath || img.path}" alt="" loading="lazy" class="admin-img-thumb">
    <div class="admin-img-overlay">
      <span class="admin-img-vibe">${img.suggestedVibe || ''}</span>
      <div class="admin-img-btns">
        <button class="btn btn--ghost btn--xs" onclick="moveImage('${segmentId}','${img.filename}')">Move</button>
        <button class="btn btn--danger btn--xs" onclick="deleteImage('${segmentId}','${img.filename}')">Delete</button>
      </div>
    </div>
  `;
  return card;
}

// ─── Delete image ─────────────────────────────────────────────────────────────

async function deleteImage(segmentId, filename) {
  if (!confirm('Delete this image permanently?')) return;
  try {
    await apiFetch(`/admin/api/segments/${segmentId}/images/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const card = document.querySelector(`#grid-${segmentId} [data-filename="${filename}"]`);
    if (card) card.remove();
    toast('Image deleted');
  } catch (err) {
    toast(err.message, true);
  }
}

// ─── Set cover image ──────────────────────────────────────────────────────────

async function setCover(segmentId, thumbPath, btn) {
  try {
    await apiFetch(`/admin/api/segments/${segmentId}/cover`, {
      method: 'PUT',
      body: JSON.stringify({ thumbPath })
    });

    // Update cover preview row
    const grid = document.getElementById(`grid-${segmentId}`);
    if (grid) {
      // Remove old cover badge + highlight
      grid.querySelectorAll('.is-cover').forEach(c => c.classList.remove('is-cover'));
      grid.querySelectorAll('.cover-badge').forEach(b => b.remove());
      // Mark new cover
      const card = btn.closest('.admin-img-card');
      if (card) {
        card.classList.add('is-cover');
        const badge = document.createElement('span');
        badge.className = 'cover-badge';
        badge.textContent = 'Cover';
        card.appendChild(badge);
      }
      // Update preview row background
      const seg = grid.closest('.segment-block');
      if (seg) {
        const preview = seg.querySelector('.segment-cover-thumb');
        if (preview) preview.style.backgroundImage = `url(${thumbPath})`;
      }
    }
    toast('Cover image updated');
  } catch (err) {
    toast(err.message, true);
  }
}

// ─── Move image ───────────────────────────────────────────────────────────────

function moveImage(segmentId, filename) {
  document.getElementById('moveSrcSegment').value = segmentId;
  document.getElementById('moveFilename').value   = filename;

  const select = document.getElementById('moveTargetSegment');
  select.innerHTML = (window.SEGMENTS || [])
    .filter(s => s.id !== segmentId)
    .map(s => `<option value="${s.id}">${s.name}</option>`)
    .join('');

  openModal('moveModal');
}

async function confirmMove() {
  const segmentId = document.getElementById('moveSrcSegment').value;
  const filename  = document.getElementById('moveFilename').value;
  const targetId  = document.getElementById('moveTargetSegment').value;

  try {
    await apiFetch(`/admin/api/segments/${segmentId}/images/${encodeURIComponent(filename)}/move`, {
      method: 'PUT',
      body: JSON.stringify({ targetSegmentId: targetId })
    });
    closeModal('moveModal');
    toast('Image moved — reload to see changes');
    // Remove from source grid
    const card = document.querySelector(`#grid-${segmentId} [data-filename="${filename}"]`);
    if (card) card.remove();
  } catch (err) {
    toast(err.message, true);
  }
}

// ─── Edit segment ─────────────────────────────────────────────────────────────

function editSegment(id, name, description, vibe) {
  document.getElementById('editSegmentId').value   = id;
  document.getElementById('editSegmentName').value = name;
  document.getElementById('editSegmentDesc').value = description;
  const vibeSelect = document.getElementById('editSegmentVibe');
  [...vibeSelect.options].forEach(o => { o.selected = o.value === vibe; });
  openModal('editModal');
}

document.getElementById('editSegmentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id   = document.getElementById('editSegmentId').value;
  const name = document.getElementById('editSegmentName').value;
  const desc = document.getElementById('editSegmentDesc').value;
  const vibe = document.getElementById('editSegmentVibe').value;

  try {
    const res = await apiFetch(`/admin/api/segments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description: desc, vibe })
    });

    // Update visible name
    const nameEl = document.getElementById(`name-${id}`);
    if (nameEl) nameEl.textContent = name;

    // Update SEGMENTS array for move modal
    const seg = (window.SEGMENTS || []).find(s => s.id === id);
    if (seg) seg.name = name;

    closeModal('editModal');
    toast('Segment updated');
  } catch (err) {
    toast(err.message, true);
  }
});

// ─── Delete segment ───────────────────────────────────────────────────────────

async function deleteSegment(segmentId, name) {
  if (!confirm(`Delete segment "${name}" and all its images permanently?`)) return;
  try {
    await apiFetch(`/admin/api/segments/${segmentId}`, { method: 'DELETE' });
    const block = document.getElementById(`seg-${segmentId}`);
    if (block) block.remove();
    toast('Segment deleted');
  } catch (err) {
    toast(err.message, true);
  }
}

// ─── Add segment ──────────────────────────────────────────────────────────────

document.getElementById('addSegmentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));

  try {
    await apiFetch('/admin/api/segments', { method: 'POST', body: JSON.stringify(data) });
    toast('Segment created — reloading…');
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    toast(err.message, true);
  }
});

// ─── Drag-to-reorder (Sortable.js) ───────────────────────────────────────────

function initSortable(grid) {
  if (!window.Sortable || grid._sortable) return;
  grid._sortable = Sortable.create(grid, {
    animation: 180,
    ghostClass: 'sortable-ghost',
    onEnd() {
      const segmentId = grid.dataset.segment;
      const filenames = [...grid.querySelectorAll('.admin-img-card')].map(c => c.dataset.filename);
      apiFetch(`/admin/api/segments/${segmentId}/order`, {
        method: 'PUT',
        body: JSON.stringify({ orderedFilenames: filenames })
      }).then(() => toast('Order saved')).catch(err => toast(err.message, true));
    }
  });
}

document.querySelectorAll('.admin-img-grid').forEach(initSortable);

// ─── Close modals on backdrop click ──────────────────────────────────────────

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal.id);
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.is-open').forEach(m => closeModal(m.id));
  }
});
