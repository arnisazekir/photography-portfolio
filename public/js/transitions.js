// Smooth page transitions — fade out on leave, CSS handles fade in on load
(function () {
  // Only animate links that go to public pages (not admin, not anchors, not external)
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;
    if (href.startsWith('/admin')) return;  // skip admin nav
    if (href.startsWith('#')) return;       // skip anchors
    if (href.startsWith('http')) return;    // skip external
    if (link.target === '_blank') return;   // skip new-tab

    e.preventDefault();
    document.body.classList.add('is-leaving');

    setTimeout(function () {
      window.location.href = href;
    }, 280);
  });
})();
