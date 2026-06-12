// Petrus AI — interactions: nav, scroll reveals, counters, tabs, tilt cards

(function () {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scroll progress bar + nav state ---------- */
  const progress = document.getElementById('scrollProgress');
  const nav = document.getElementById('nav');
  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
    nav.classList.toggle('is-scrolled', window.scrollY > 30);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav ---------- */
  const burger = document.getElementById('navBurger');
  const links = document.getElementById('navLinks');
  burger.addEventListener('click', () => links.classList.toggle('is-open'));
  links.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') links.classList.remove('is-open');
  });

  /* ---------- Active nav link highlighting ---------- */
  const sections = [...links.querySelectorAll('a')]
    .map((a) => ({ a, el: document.querySelector(a.getAttribute('href')) }))
    .filter((x) => x.el);
  const navIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      sections.forEach(({ a, el }) =>
        a.classList.toggle('is-active', el === entry.target));
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(({ el }) => navIO.observe(el));

  /* ---------- Reveal-on-scroll (GSAP if available, IO fallback) ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if (window.gsap && window.ScrollTrigger && !prefersReduced) {
    gsap.registerPlugin(ScrollTrigger);
    reveals.forEach((el) => {
      gsap.fromTo(el,
        { opacity: 0, y: 34 },
        {
          opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
    });
  } else {
    document.body.classList.add('no-gsap');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-shown'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  }

  /* ---------- Animate progress bars + counters when visible ---------- */
  const viewIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in-view');
      entry.target.querySelectorAll('[data-count]').forEach(runCounter);
      viewIO.unobserve(entry.target);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.card, .abuse, .fund, .cond, section').forEach((el) => viewIO.observe(el));

  function runCounter(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const dur = 1600;
    const start = performance.now();
    if (prefersReduced) {
      el.textContent = prefix + format(target) + suffix;
      return;
    }
    function format(v) {
      return decimals
        ? v.toFixed(decimals)
        : Math.round(v).toLocaleString('en-US').replace(/,/g, "'"); // Swiss thousands separator
    }
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + format(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- Country tabs ---------- */
  const tabsRoot = document.getElementById('countryTabs');
  if (tabsRoot) {
    tabsRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      tabsRoot.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === btn));
      document.querySelectorAll('.tabpanel').forEach((p) =>
        p.classList.toggle('is-active', p.dataset.panel === btn.dataset.tab));
    });
  }

  /* ---------- 3D tilt on cards + spotlight tracking ---------- */
  if (!prefersReduced && matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.tilt').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.transform =
          `perspective(900px) rotateY(${(x - 0.5) * 8}deg) rotateX(${(0.5 - y) * 8}deg) translateY(-4px)`;
        card.style.setProperty('--mx', x * 100 + '%');
        card.style.setProperty('--my', y * 100 + '%');
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
    // spotlight for non-tilt cards
    document.querySelectorAll('.card:not(.tilt)').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
      });
    });
  }
})();
