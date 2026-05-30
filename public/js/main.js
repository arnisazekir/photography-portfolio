// ─── Gallery image fade-in (src already set in HTML, just detect load) ───────
(function () {
  document.querySelectorAll('.gallery-img').forEach(img => {
    const markLoaded = () => img.classList.add('img-loaded');
    if (img.complete && img.naturalWidth > 0) {
      markLoaded();
    } else {
      img.addEventListener('load',  markLoaded, { once: true });
      img.addEventListener('error', markLoaded, { once: true }); // show broken rather than blank
    }
  });
})();

// ─── Scroll-reveal for homepage segment cards ─────────────────────────────────
(function () {
  const cards = document.querySelectorAll('.reveal-card');
  if (!cards.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      // Stagger each card by 80ms
      const idx = Array.from(cards).indexOf(entry.target);
      setTimeout(() => entry.target.classList.add('is-visible'), idx * 80);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.08 });

  cards.forEach(c => io.observe(c));
})();



// ─── Lightbox ─────────────────────────────────────────────────────────────────
(function lightbox() {
  const fullPaths = window.GALLERY_FULLPATHS || [];
  if (!fullPaths.length) return;

  const lb        = document.getElementById('lightbox');
  const lbImage   = document.getElementById('lbImage');
  const lbSpinner = document.getElementById('lbSpinner');
  const lbCounter = document.getElementById('lbCounter');
  const lbClose   = document.getElementById('lbClose');
  const lbPrev    = document.getElementById('lbPrev');
  const lbNext    = document.getElementById('lbNext');
  if (!lb || !lbImage) return;

  let current = 0;
  const cache = {};

  function preload(idx) {
    if (cache[idx] || idx < 0 || idx >= fullPaths.length) return;
    const img = new Image(); img.src = fullPaths[idx]; cache[idx] = img;
  }

  function open(idx) {
    current = idx;
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    show(idx);
    preload(idx + 1); preload(idx - 1);
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    lbImage.classList.remove('loaded');
    lbImage.src = '';
  }

  function show(idx) {
    lbImage.classList.remove('loaded');
    lbImage.style.opacity = '0';
    if (lbSpinner) lbSpinner.style.display = 'block';

    const loader = new Image();
    loader.onload = () => {
      lbImage.src = fullPaths[idx];
      if (lbSpinner) lbSpinner.style.display = 'none';
      requestAnimationFrame(() => lbImage.classList.add('loaded'));
      preload(idx + 1); preload(idx - 1);
    };
    loader.onerror = () => {
      if (lbSpinner) lbSpinner.style.display = 'none';
      lbImage.src = fullPaths[idx];
      lbImage.classList.add('loaded');
    };
    loader.src = fullPaths[idx];
    lbCounter.textContent = `${idx + 1}  /  ${fullPaths.length}`;
  }

  function prev() { current = (current - 1 + fullPaths.length) % fullPaths.length; show(current); }
  function next() { current = (current + 1) % fullPaths.length; show(current); }

  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => open(Number(item.dataset.index)));
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') open(Number(item.dataset.index));
    });
  });

  lbClose.addEventListener('click', close);
  lbPrev.addEventListener('click', e => { e.stopPropagation(); prev(); });
  lbNext.addEventListener('click', e => { e.stopPropagation(); next(); });
  lb.addEventListener('click', e => { if (e.target === lb) close(); });

  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  prev();
    if (e.key === 'ArrowRight') next();
  });

  let tx = null;
  lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
    tx = null;
  }, { passive: true });
})();
