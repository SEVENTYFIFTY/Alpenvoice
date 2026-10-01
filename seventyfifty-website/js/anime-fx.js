// Seventy Fifty — anime.js v4 effects.
// 1) Hero: a looping timeline choreographing three geometric shapes
//    (circle / triangle / square), echoing the anime.js timeline pattern.
// 2) Solutions: a staggered x-slide entrance (delay: stagger(100)) when
//    the list scrolls into view.
// 3) Solutions: an animated list/grid view toggle using createLayout,
//    with staggered FLIP transitions between the two layouts.
// 4) WAAPI micro-interactions: hardware-accelerated hover effects on the
//    project logo badges and a full spin on the nav logo.

import { animate, createTimeline, createLayout, stagger, utils, waapi } from 'animejs';

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Hero shape choreography ---------- */
if (!prefersReduced && document.querySelector('.fx-shapes')) {
  createTimeline({ loop: true, alternate: true, defaults: { duration: 2600, ease: 'inOutQuad' } })
    .add('.fx-shape--triangle', { rotate: 360, y: '-1.4rem' }, 0)
    .add('.fx-shape--square', { rotate: -360, y: '1.2rem' }, 0)
    .add('.fx-shape--circle', { scale: [1, 1.5, 1], x: '1.6rem' }, 0);
}

/* ---------- Solutions staggered entrance ---------- */
const list = document.querySelector('.solution-list');
if (!prefersReduced && list) {
  utils.set('.sol', { opacity: 0 });
  const io = new IntersectionObserver((entries, obs) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    animate('.sol', {
      x: ['-1.5rem', '0rem'],
      opacity: [0, 1],
      delay: stagger(100),
      duration: 700,
      ease: 'outQuad',
    });
    obs.disconnect();
  }, { threshold: 0.15 });
  io.observe(list);
}

/* ---------- Solutions list/grid layout toggle ---------- */
const toggle = document.getElementById('viewToggle');
if (list && toggle) {
  const layout = createLayout(list);
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn || btn.classList.contains('is-active')) return;
    toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
    layout.update(({ root }) => {
      root.classList.toggle('is-grid', btn.dataset.view === 'grid');
    }, {
      duration: prefersReduced ? 0 : 650,
      delay: prefersReduced ? 0 : stagger(40),
      ease: 'inOutQuad',
    });
  });
}

/* ---------- WAAPI hover micro-interactions ---------- */
if (!prefersReduced && window.matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('.project').forEach((card) => {
    const wm = card.querySelector('.project__wm');
    if (!wm) return;
    card.addEventListener('mouseenter', () => {
      waapi.animate(wm, { x: 6, scale: 1.03, duration: 350, ease: 'out(3)' });
    });
    card.addEventListener('mouseleave', () => {
      waapi.animate(wm, { x: 0, scale: 1, duration: 350, ease: 'out(3)' });
    });
  });

  // nav wordmark: nudge the coral dot on hover
  const brandDot = document.querySelector('.nav__brand .dot');
  if (brandDot) {
    brandDot.style.display = 'inline-block';
    let busy = false;
    document.querySelector('.nav__brand').addEventListener('mouseenter', () => {
      if (busy) return;
      busy = true;
      waapi.animate(brandDot, {
        y: [0, -6, 0],
        duration: 500,
        ease: 'out(2)',
        onComplete: () => { busy = false; },
      });
    });
  }
}
