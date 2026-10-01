// Seventy Fifty — hours-returned chart (single series, validated hue #0891b2).
// Lazy-rendered when scrolled into view. The adjacent solution list doubles as
// the accessible table view of the same numbers.

(function () {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.color = '#9aabc4';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.borderColor = 'rgba(140,175,235,0.10)';

  const isDE = (document.documentElement.lang || '').toLowerCase().startsWith('de');

  function buildHoursChart(ctx) {
    // Weekly hours; front desk = 7.5 h/day x 7, events = 42 h/month ~ 9.7 h/week
    const data = isDE ? [
      { label: 'Front-Desk-KI-Assistent', hours: 52.5, note: '7,5 Std./Tag × 7 Tage' },
      { label: 'Voice-KI-Concierge', hours: 45, note: '24/7-Sprachbuchungen' },
      { label: 'Gästekommunikations-Hub', hours: 39, note: '70% automatisiert' },
      { label: 'Restaurant-Bestell-KI', hours: 26, note: '75% der Anrufe automatisiert' },
      { label: 'Housekeeping-Manager', hours: 15.75, note: 'Supervisor-Zeit' },
      { label: 'Dynamic-Pricing-KI', hours: 15, note: 'Revenue Management' },
      { label: 'Wartungssystem', hours: 10.5, note: '35% schnellere Reaktion' },
      { label: 'Event-Management-KI', hours: 9.7, note: '42 Std./Monat' },
      { label: 'Sicherheits-Monitoring-KI', hours: 8, note: 'Berichtszeit' },
    ] : [
      { label: 'Front Desk AI Assistant', hours: 52.5, note: '7.5 h/day × 7 days' },
      { label: 'Voice AI Concierge', hours: 45, note: '24/7 voice bookings' },
      { label: 'Guest Communication Hub', hours: 39, note: '70% automated' },
      { label: 'Restaurant Order AI', hours: 26, note: '75% of calls automated' },
      { label: 'Housekeeping Manager', hours: 15.75, note: 'supervisor time' },
      { label: 'Dynamic Pricing AI', hours: 15, note: 'revenue management' },
      { label: 'Maintenance System', hours: 10.5, note: '35% faster response' },
      { label: 'Event Management AI', hours: 9.7, note: '42 h/month' },
      { label: 'Security Monitoring AI', hours: 8, note: 'reporting time' },
    ];
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data: data.map((d) => d.hours),
          backgroundColor: '#0891b2',
          borderRadius: { topRight: 4, bottomRight: 4 },
          barThickness: 14,
        }],
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: isDE ? 'Stunden pro Woche' : 'Hours per week' },
            grid: { color: 'rgba(140,175,235,0.08)' },
            beginAtZero: true,
          },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => isDE
                ? ` ${String(c.parsed.x).replace('.', ',')} Std./Woche — ${data[c.dataIndex].note}`
                : ` ${c.parsed.x} hours/week — ${data[c.dataIndex].note}`,
            },
          },
        },
      },
    });
  }

  const el = document.getElementById('hoursChart');
  if (!el) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      buildHoursChart(entry.target.getContext('2d'));
      io.unobserve(entry.target);
    });
  }, { threshold: 0.25 });
  io.observe(el);
})();
