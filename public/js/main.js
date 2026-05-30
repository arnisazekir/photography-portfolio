// ─── Lazy-load with IntersectionObserver + skeleton handling ──────────────────
(function lazyLoad() {
  const items = document.querySelectorAll('.gallery-item');
  if (!items.length) return;

  function reveal(item) {
    const img = item.querySelector('.gallery-img');
    if (!img) return;

    const src = img.dataset.src;
    if (!src) { item.classList.add('img-ready'); return; }

    // If already cached, show immediately
    if (img.complete && img.naturalWidth) {
      img.src = src;
      item.classList.add('img-ready');
      return;
    }

    img.onload = () => item.classList.add('img-ready');

    img.onerror = () => {
      // Broken image fallback — grey placeholder, no disappearing blank
      img.alt = 'Image unavailable';
      img.style.opacity = '0.15';
      img.style.height = '120px';
      img.style.background = 'var(--bg-card)';
      item.classList.add('img-ready');
    };

    img.src = src;
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        reveal(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '300px 0px' }); // start loading 300px before entering viewport

    items.forEach(item => io.observe(item));
  } else {
    // Fallback for older browsers — load everything
    items.forEach(reveal);
  }
})();


// ─── Lightbox ─────────────────────────────────────────────────────────────────
(function lightbox() {
  // Full-resolution paths are set by the gallery.ejs template
  const fullPaths = window.GALLERY_FULLPATHS || [];
  if (!fullPaths.length) return;

  const lb        = document.getElementById('lightbox');
  const lbImage   = document.getElementById('lbImage');
  const lbSpinner = document.getElementById('lbSpinner');
  const lbCounter = document.getElementById('lbCounter');
  const lbClose   = document.getElementById('lbClose');
  const lbPrev    = document.getElementById('lbPrev');
  const lbNext    = document.getElementById('lbNext');

  if (!lb) return;

  let current  = 0;
  let preloads = {}; // cache preloaded Image objects

  // ── Preload neighbours ──────────────────────────────────────────────────
  function preload(idx) {
    if (preloads[idx]) return;
    const img = new Image();
    img.src = fullPaths[idx];
    preloads[idx] = img;
  }

  function open(idx) {
    current = idx;
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    show(current);
    preload((current + 1) % fullPaths.length);
    preload((current - 1 + fullPaths.length) % fullPaths.length);
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    lbImage.src = '';
    lbImage.classList.remove('loaded', 'broken');
    if (lbSpinner) lbSpinner.style.display = 'none';
  }

  function show(idx) {
    lbImage.classList.remove('loaded', 'broken');
    lbImage.style.display = 'none';
    if (lbSpinner) lbSpinner.style.display = 'block';

    const loader = new Image();
    loader.onload = () => {
      lbImage.src = fullPaths[idx];
      lbImage.style.display = 'block';
      if (lbSpinner) lbSpinner.style.display = 'none';
      // Reflow then fade in
      lbImage.getBoundingClientRect();
      lbImage.classList.add('loaded');

      // Preload neighbours while user is looking at this image
      preload((idx + 1) % fullPaths.length);
      preload((idx - 1 + fullPaths.length) % fullPaths.length);
    };
    loader.onerror = () => {
      lbImage.src = fullPaths[idx];
      lbImage.style.display = 'block';
      lbImage.classList.add('broken');
      if (lbSpinner) lbSpinner.style.display = 'none';
    };
    loader.src = fullPaths[idx];

    lbCounter.textContent = `${idx + 1}  /  ${fullPaths.length}`;
  }

  function prev() { current = (current - 1 + fullPaths.length) % fullPaths.length; show(current); }
  function next() { current = (current + 1) % fullPaths.length;                     show(current); }

  // ── Event wiring ────────────────────────────────────────────────────────
  document.querySelectorAll('.gallery-item').forEach(item => {
    function activate() { open(Number(item.dataset.index)); }
    item.addEventListener('click', activate);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(); });
  });

  lbClose.addEventListener('click', close);
  lbPrev.addEventListener('click', (e) => { e.stopPropagation(); prev(); });
  lbNext.addEventListener('click', (e) => { e.stopPropagation(); next(); });

  // Click outside image to close
  lb.addEventListener('click', e => { if (e.target === lb) close(); });

  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft')  prev();
  });

  // Touch swipe
  let tx = null;
  lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
    tx = null;
  }, { passive: true });
})();
