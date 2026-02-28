/* =============================================
   SNOWBALL WEEKLY SUMMARY — DASHBOARD APP
   ============================================= */

const DB_KEY = 'snowball_db';

// ── Helpers ─────────────────────────────────

const fmt = {
  currency: v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v),
  pct:      v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%',
  pctAbs:   v => Math.abs(v).toFixed(2) + '%',
  sign:     v => v >= 0 ? '+' : '',
  dirTag:   v => v >= 0 ? '▲' : '▼',
};

// ── Database Layer ───────────────────────────

class ReportsDB {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { reports: [] };
  }

  _save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.data));
  }

  async init(jsonPath) {
    /* Merge bundled data/db.json with localStorage */
    try {
      const resp = await fetch(jsonPath);
      if (!resp.ok) throw new Error('fetch failed');
      const bundled = await resp.json();
      const existing = new Set(this.data.reports.map(r => r.id));
      for (const r of bundled.reports) {
        if (!existing.has(r.id)) {
          this.data.reports.push(r);
        }
      }
      this._save();
    } catch (e) {
      console.warn('Could not load db.json, using localStorage only.', e);
    }
    this.data.reports.sort((a, b) => b.id.localeCompare(a.id));
  }

  all()          { return this.data.reports; }
  latest()       { return this.data.reports[0] || null; }
  get(id)        { return this.data.reports.find(r => r.id === id) || null; }

  add(report) {
    const idx = this.data.reports.findIndex(r => r.id === report.id);
    if (idx >= 0) this.data.reports.splice(idx, 1, report);
    else this.data.reports.unshift(report);
    this.data.reports.sort((a, b) => b.id.localeCompare(a.id));
    this._save();
  }
}

// ── Chart: Donut (pure SVG) ──────────────────

function buildDonut(portfolios, containerId) {
  const total = portfolios.reduce((s, p) => s + p.value, 0);
  const colors = ['#388bfd', '#3fb950', '#a371f7', '#f0c040', '#3ddbd9'];
  const size = 130, cx = size / 2, cy = size / 2, r = 48, stroke = 22;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const slices = portfolios.map((p, i) => {
    const pct = p.value / total;
    const dash = pct * circ;
    const s = { pct, dash, offset, color: colors[i % colors.length], name: p.name, value: p.value };
    offset += dash;
    return s;
  });

  const svgSlices = slices.map(s =>
    `<circle cx="${cx}" cy="${cy}" r="${r}"
       fill="none" stroke="${s.color}" stroke-width="${stroke}"
       stroke-dasharray="${s.dash} ${circ - s.dash}"
       stroke-dashoffset="${-s.offset + circ * 0.25}"
       style="transition:stroke-dasharray 0.6s ease"/>`
  ).join('\n');

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1c2333" stroke-width="${stroke}"/>
    ${svgSlices}
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="#8b949e" font-size="9" font-family="Inter,sans-serif">TOTAL</text>
    <text x="${cx}" y="${cy + 9}" text-anchor="middle" fill="#e6edf3" font-size="10" font-weight="bold" font-family="Inter,sans-serif">${fmt.currency(total / 1000).replace('$','$').split('.')[0]}K</text>
  </svg>`;

  const legend = slices.map((s, i) =>
    `<div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      <span class="legend-name">${s.name.replace(' IRA','').replace(' Strategy Test',' Test')}</span>
      <span class="legend-pct">${(s.pct * 100).toFixed(1)}%</span>
    </div>`
  ).join('');

  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="donut-container">${svg}<div class="donut-legend">${legend}</div></div>`;
}

// ── Chart: P&L Bars ──────────────────────────

function buildPnlBars(portfolios, containerId) {
  const maxPnl = Math.max(...portfolios.map(p => Math.abs(p.pnl_amount)));

  const bars = portfolios.map(p => {
    const height = Math.max(6, (Math.abs(p.pnl_amount) / maxPnl) * 120);
    const cls = p.pnl_direction === 'up' ? 'gain' : 'loss';
    const ticker = p.name.replace(' IRA','').replace(' Investment','Invest.').replace(' Strategy Test',' Test');
    return `<div class="bar-item">
      <span class="bar-value">${fmt.currency(p.pnl_amount)}</span>
      <div class="bar ${cls}" style="height:${height}px"></div>
      <span class="bar-label">${ticker}</span>
    </div>`;
  }).join('');

  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="bar-chart-container">${bars}</div>`;
}

// ── Render: Markets ──────────────────────────

function renderMarkets(markets) {
  return markets.map(m => {
    const cls = m.direction === 'down' ? 'down' : 'up';
    const sign = m.direction === 'up' ? '▲' : '▼';
    return `<div class="market-card ${cls} fade-in">
      <div class="market-name">${m.name}</div>
      <div class="market-change ${cls}">${sign}${Math.abs(m.change).toFixed(2)}%</div>
      <div class="market-ticker">${m.ticker}</div>
    </div>`;
  }).join('');
}

// ── Render: Summary Bar ──────────────────────

function renderSummary(portfolios) {
  const totalValue   = portfolios.reduce((s, p) => s + p.value, 0);
  const totalPnl     = portfolios.reduce((s, p) => s + p.pnl_amount, 0);
  const totalDiv     = portfolios.reduce((s, p) => s + p.dividends_next_week, 0);
  const pnlCls       = totalPnl >= 0 ? 'green' : 'red';
  const pnlSign      = totalPnl >= 0 ? '▲' : '▼';

  const cards = [
    { label: 'Total Portfolio Value', value: fmt.currency(totalValue), sub: `${portfolios.length} accounts`, subCls: '' },
    { label: 'Weekly P&L', value: `${fmt.sign(totalPnl)}${fmt.currency(Math.abs(totalPnl))}`, sub: `${pnlSign} overall gain`, subCls: pnlCls },
    { label: 'Dividends Next Week', value: fmt.currency(totalDiv), sub: 'across all accounts', subCls: 'green' },
  ];

  return cards.map(c =>
    `<div class="summary-card total fade-in">
      <div class="summary-label">${c.label}</div>
      <div class="summary-value">${c.value}</div>
      <div class="summary-sub ${c.subCls}">${c.sub}</div>
    </div>`
  ).join('') + portfolios.map(p => {
    const pnlCls = p.pnl_direction === 'up' ? 'green' : 'red';
    const arrow  = p.pnl_direction === 'up' ? '▲' : '▼';
    return `<div class="summary-card fade-in">
      <div class="summary-label">${p.name}</div>
      <div class="summary-value">${fmt.currency(p.value)}</div>
      <div class="summary-sub ${pnlCls}">${arrow}${p.pnl_percent.toFixed(2)}%  ${fmt.sign(p.pnl_amount)}${fmt.currency(Math.abs(p.pnl_amount))}</div>
    </div>`;
  }).join('');
}

// ── Render: Portfolio Card ───────────────────

function renderPortfolioCard(p) {
  const pnlCls   = p.pnl_direction === 'up' ? 'up' : 'down';
  const arrow    = p.pnl_direction === 'up' ? '▲' : '▼';

  const gainerRows = p.top_gainers.map(g =>
    `<div class="holding-row gain fade-in">
      <div class="holding-info">
        <div class="holding-ticker">${g.ticker}</div>
        <div class="holding-name" title="${g.name}">${g.name}</div>
      </div>
      <div class="holding-change gain">
        +${fmt.currency(g.change_amount)}
        <span class="pct">▲${g.change_percent.toFixed(2)}%</span>
      </div>
    </div>`
  ).join('');

  const loserRows = p.top_losers.length
    ? p.top_losers.map(l =>
        `<div class="holding-row loss fade-in">
          <div class="holding-info">
            <div class="holding-ticker">${l.ticker}</div>
            <div class="holding-name" title="${l.name}">${l.name}</div>
          </div>
          <div class="holding-change loss">
            ${fmt.currency(l.change_amount)}
            <span class="pct">▼${Math.abs(l.change_percent).toFixed(2)}%</span>
          </div>
        </div>`
      ).join('')
    : `<div class="no-losers">🎉 No losers this week!</div>`;

  return `<div class="portfolio-card fade-in">
    <div class="portfolio-header">
      <div>
        <div class="portfolio-name">${p.name}</div>
        <div class="portfolio-value">${fmt.currency(p.value)}</div>
        <div class="portfolio-pnl ${pnlCls}">
          P&L: ${fmt.sign(p.pnl_amount)}${fmt.currency(Math.abs(p.pnl_amount))} &nbsp;
          <span class="tag tag-${p.pnl_direction === 'up' ? 'green' : 'red'}">${arrow}${p.pnl_percent.toFixed(2)}%</span>
        </div>
      </div>
      <div class="dividend-badge">
        <div class="dividend-badge-label">Dividends</div>
        <div class="dividend-badge-label" style="font-size:9px">Next Week</div>
        <div class="dividend-badge-value">${fmt.currency(p.dividends_next_week)}</div>
      </div>
    </div>

    <div class="holdings-section">
      <div class="holdings-title gainers">🥇 Top Gainers</div>
      ${gainerRows}
    </div>

    <div class="divider"></div>

    <div class="holdings-section">
      <div class="holdings-title losers">📉 Top Losers</div>
      ${loserRows}
    </div>
  </div>`;
}

// ── Render: Dividend Calendar ────────────────

function renderCalendar(divs) {
  const rows = divs.map(d => {
    const evtCls = d.event_type.includes('Ex-') ? 'ex-div' : 'payment';
    return `<tr>
      <td class="cal-date">${d.display_date}</td>
      <td class="cal-ticker">${d.ticker}</td>
      <td class="cal-name">${d.name}</td>
      <td><span class="cal-event ${evtCls}">${d.event_type}</span></td>
      <td class="cal-amount">${fmt.currency(d.amount_per_share)}<span class="muted">/share</span></td>
    </tr>`;
  }).join('');

  return `<table class="calendar-table">
    <thead><tr>
      <th>Date</th><th>Ticker</th><th>Name</th><th>Event</th><th style="text-align:right">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Render: History ──────────────────────────

function renderHistory(reports, activeId) {
  if (!reports.length) return '<div style="padding:20px;color:var(--text-muted);text-align:center">No historical reports.</div>';
  return reports.map(r => {
    const total  = r.portfolios.reduce((s, p) => s + p.value, 0);
    const pnl    = r.portfolios.reduce((s, p) => s + p.pnl_amount, 0);
    const pnlCls = pnl >= 0 ? 'up' : 'down';
    const arrow  = pnl >= 0 ? '▲' : '▼';
    const active = r.id === activeId ? 'active' : '';
    const badges = r.portfolios.map(p => `<span class="hist-badge">${p.name.replace(' IRA','').replace(' Strategy Test',' Test')}</span>`).join('');

    return `<div class="history-item ${active}" data-id="${r.id}">
      <div class="history-date">${r.week_ending}</div>
      <div class="history-total">${fmt.currency(total)}</div>
      <div class="history-pnl ${pnlCls}">${arrow}${fmt.currency(Math.abs(pnl))}</div>
      <div class="history-portfolios">${badges}</div>
    </div>`;
  }).join('');
}

// ── Main App ─────────────────────────────────

class App {
  constructor() {
    this.db = new ReportsDB();
    this.currentId = null;
    this.modal = null;
  }

  async boot() {
    // Load bundled data then render
    await this.db.init('./data/db.json');

    const latest = this.db.latest();
    if (!latest) {
      document.getElementById('loading').innerHTML = '<div style="color:var(--red);font-size:16px">No data found. Add a report to get started.</div>';
      return;
    }

    this.currentId = latest.id;
    this._render(latest);
    this._hideLoader();
    this._attachEvents();
  }

  _render(report) {
    // Markets
    document.getElementById('markets-grid').innerHTML = renderMarkets(report.markets);

    // Summary
    document.getElementById('summary-bar').innerHTML = renderSummary(report.portfolios);

    // Charts
    buildDonut(report.portfolios, 'donut-chart');
    buildPnlBars(report.portfolios, 'pnl-chart');

    // Portfolio cards
    document.getElementById('portfolios-grid').innerHTML =
      report.portfolios.map(renderPortfolioCard).join('');

    // Dividend calendar
    document.getElementById('calendar-body').innerHTML = renderCalendar(report.upcoming_dividends);
    document.getElementById('div-total-badge').textContent =
      fmt.currency(report.portfolios.reduce((s, p) => s + p.dividends_next_week, 0));

    // Week label
    document.getElementById('week-label-text').textContent = report.week_ending;

    // History
    this._renderHistory();
  }

  _renderHistory() {
    document.getElementById('history-list').innerHTML =
      renderHistory(this.db.all(), this.currentId);

    // re-attach click
    document.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const report = this.db.get(id);
        if (report) {
          this.currentId = id;
          this._render(report);
          document.querySelector('.history-item.active')?.classList.remove('active');
          el.classList.add('active');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          this._toast('Loaded report: ' + report.week_ending, 'info');
        }
      });
    });
  }

  _hideLoader() {
    const el = document.getElementById('loading');
    if (el) {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 450);
    }
  }

  _toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  _openModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('open');
  }

  _closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  }

  _attachEvents() {
    // Modal open
    document.getElementById('btn-add-report').addEventListener('click', () => this._openModal());
    document.getElementById('modal-close').addEventListener('click', () => this._closeModal());
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeModal();
    });

    // Form submit
    document.getElementById('form-add-report').addEventListener('submit', e => {
      e.preventDefault();
      this._submitReport(e.target);
    });

    // Export button
    document.getElementById('btn-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ reports: this.db.all() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snowball_reports_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this._toast('Reports exported!', 'success');
    });
  }

  _submitReport(form) {
    const date       = form.elements['report-date'].value;
    const label      = form.elements['report-label'].value.trim();
    const jsonInput  = form.elements['report-json'].value.trim();

    if (!date || !label) {
      this._toast('Please fill in all required fields.', 'error');
      return;
    }

    let portfolios = [];
    if (jsonInput) {
      try { portfolios = JSON.parse(jsonInput); }
      catch { this._toast('Invalid JSON for portfolios.', 'error'); return; }
    }

    const report = {
      id: date,
      week_ending: label,
      created_at: date,
      markets: [],
      portfolios,
      upcoming_dividends: []
    };

    this.db.add(report);
    this._render(this.db.get(date) || this.db.latest());
    this._closeModal();
    form.reset();
    this._toast(`Report "${label}" saved!`, 'success');
  }
}

// ── Bootstrap ────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.boot().catch(err => {
    console.error(err);
    document.getElementById('loading').innerHTML =
      `<div style="color:var(--red)">Error loading data: ${err.message}</div>`;
  });
});
