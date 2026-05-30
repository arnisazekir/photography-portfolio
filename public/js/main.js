// Gallery images are visible immediately — no opacity tricks, no JS dependency

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
(function () {
  var paths   = window.GALLERY_FULLPATHS || [];
  if (!paths.length) return;

  var lb      = document.getElementById('lightbox');
  var lbImg   = document.getElementById('lbImage');
  var lbCount = document.getElementById('lbCounter');
  var lbClose = document.getElementById('lbClose');
  var lbPrev  = document.getElementById('lbPrev');
  var lbNext  = document.getElementById('lbNext');
  if (!lb || !lbImg) return;

  var cur = 0;

  function show(idx) {
    cur = idx;
    lbImg.src = paths[idx];          // set src directly — image shows immediately
    if (lbCount) lbCount.textContent = (idx + 1) + ' / ' + paths.length;
  }

  function open(idx) {
    show(idx);
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }

  function prev() { show((cur - 1 + paths.length) % paths.length); }
  function next() { show((cur + 1) % paths.length); }

  // Open on click
  document.querySelectorAll('.gallery-item').forEach(function(item) {
    item.addEventListener('click', function() { open(Number(item.dataset.index)); });
  });

  // Controls
  if (lbClose) lbClose.addEventListener('click', close);
  if (lbPrev)  lbPrev.addEventListener('click',  function(e) { e.stopPropagation(); prev(); });
  if (lbNext)  lbNext.addEventListener('click',  function(e) { e.stopPropagation(); next(); });

  lb.addEventListener('click', function(e) { if (e.target === lb) close(); });

  document.addEventListener('keydown', function(e) {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  prev();
    if (e.key === 'ArrowRight') next();
  });

  var tx = null;
  lb.addEventListener('touchstart', function(e) { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend',   function(e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) { if (dx < 0) next(); else prev(); }
    tx = null;
  }, { passive: true });
})();
