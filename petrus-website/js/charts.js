// Petrus AI — Chart.js visualizations (lazy-rendered when scrolled into view)

(function () {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.color = '#9fb0c8';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.borderColor = 'rgba(150,180,230,0.12)';

  const TEAL = '#2dd4bf', BLUE = '#4f8df9', VIOLET = '#8b7cf6', AMBER = '#f59e0b', RED = '#f0526b';

  const builders = {
    conditionsChart(ctx) {
      return new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Anxiety Disorders', 'Depression', 'Bullying Impact', 'Abuse Trauma', 'Other Conditions'],
          datasets: [{
            data: [32, 28, 22, 12, 6],
            backgroundColor: [TEAL, BLUE, VIOLET, RED, 'rgba(159,176,200,0.5)'],
            borderColor: '#060a14',
            borderWidth: 3,
            hoverOffset: 14,
          }],
        },
        options: {
          maintainAspectRatio: false,
          cutout: '62%',
          animation: { animateRotate: true, duration: 1400 },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
            tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}% of reported cases` } },
          },
        },
      });
    },

    radarChart(ctx) {
      return new Chart(ctx, {
        type: 'radar',
        data: {
          labels: ['Early Detection', 'Communication Support', 'Decision Support', 'Progress Tracking', 'Screening Tools'],
          datasets: [
            {
              label: 'Schools',
              data: [4.7, 4.6, 4.4, 4.0, 3.3],
              borderColor: TEAL,
              backgroundColor: 'rgba(45,212,191,0.18)',
              pointBackgroundColor: TEAL,
            },
            {
              label: 'Psychiatry',
              data: [4.4, 4.2, 4.2, 3.7, 3.6],
              borderColor: VIOLET,
              backgroundColor: 'rgba(139,124,246,0.16)',
              pointBackgroundColor: VIOLET,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            r: {
              min: 0, max: 5,
              ticks: { stepSize: 1, backdropColor: 'transparent' },
              grid: { color: 'rgba(150,180,230,0.14)' },
              angleLines: { color: 'rgba(150,180,230,0.14)' },
              pointLabels: { font: { size: 11 } },
            },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    },

    ratingsChart(ctx) {
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Early Detection', 'Communication Support', 'Decision Support', 'Progress Tracking', 'Screening Tools'],
          datasets: [
            { label: 'Schools (Ø)', data: [4.7, 4.6, 4.4, 4.0, 3.3], backgroundColor: TEAL, borderRadius: 8 },
            { label: 'Psychiatry (Ø)', data: [4.4, 4.2, 4.2, 3.7, 3.6], backgroundColor: BLUE, borderRadius: 8 },
          ],
        },
        options: {
          maintainAspectRatio: false,
          scales: { y: { min: 0, max: 5 } },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    },

    challengesChart(ctx) {
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Professional Overload', 'Late Detection', 'Communication Problems', 'Time Constraints', 'Missing Data/Records'],
          datasets: [
            { label: 'Schools', data: [94, 56, 61, 44, 28], backgroundColor: TEAL, borderRadius: 8 },
            { label: 'Psychiatry', data: [89, 64, 57, 71, 36], backgroundColor: VIOLET, borderRadius: 8 },
          ],
        },
        options: {
          indexAxis: 'y',
          maintainAspectRatio: false,
          scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } } },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.x}%` } },
          },
        },
      });
    },

    revenue3yChart(ctx) {
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['2026', '2027', '2028'],
          datasets: [{
            label: 'Revenue (CHF)',
            data: [0, 0, 168000],
            backgroundColor: [BLUE, BLUE, TEAL],
            borderRadius: 10,
          }],
        },
        options: {
          maintainAspectRatio: false,
          scales: { y: { ticks: { callback: (v) => 'CHF ' + (v / 1000) + 'K' } } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => c.parsed.y === 0
                  ? ' Product development — CHF 0'
                  : ' First pilot-validated revenue: CHF 168K',
              },
            },
          },
        },
      });
    },

    trajectoryChart(ctx) {
      return new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['2028', '2029', '2030', '2031+'],
          datasets: [{
            label: 'Revenue (CHF M)',
            data: [0.168, 2.1, 8.4, 33.6],
            borderColor: TEAL,
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            backgroundColor: (c) => {
              const g = c.chart.ctx.createLinearGradient(0, 0, 0, c.chart.height || 300);
              g.addColorStop(0, 'rgba(45,212,191,0.35)');
              g.addColorStop(1, 'rgba(45,212,191,0)');
              return g;
            },
            pointBackgroundColor: TEAL,
            pointRadius: 5,
            pointHoverRadius: 8,
          }],
        },
        options: {
          maintainAspectRatio: false,
          scales: { y: { ticks: { callback: (v) => 'CHF ' + v + 'M' } } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => ' CHF ' + c.parsed.y + 'M' + (c.label === '2029' ? ' (Series A funded)' : '') } },
          },
        },
      });
    },
  };

  // Render each chart the first time it scrolls into view
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      if (builders[id]) {
        builders[id](entry.target.getContext('2d'));
        delete builders[id];
      }
      io.unobserve(entry.target);
    });
  }, { threshold: 0.25 });

  Object.keys(builders).forEach((id) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
})();
